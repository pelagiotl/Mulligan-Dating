import { Router } from 'express';
import { canonicalizeInterestName } from '../constants/profilePickLists.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { sanitizeText } from '../middleware/security.js';
import { rateLimitAPI } from '../middleware/security.js';
import { notifyPartnersProfileChanged } from '../services/partnerProfileBroadcast.js';
import { ensureStubProfile, isUniqueViolation } from '../utils/ensureStubProfile.js';
import { activateUserAccount } from '../utils/accountStatus.js';
import { detectClientPlatformFromRequest } from '../utils/clientPlatform.js';
import { normalizeMaxDistanceMiles, REGION_MAX_DISTANCE_MILES } from '../config/regions.js';
import { validateLocationForActiveRegion } from '../utils/locationRegionValidation.js';
import { uploadChatVideo } from '../middleware/upload.js';
import { uploadToCloudinaryMedia, isCloudinaryConfigured, deleteFromCloudinary, createIntroVideoDirectUploadParams, isAllowedIntroVideoCloudinaryUrl } from '../services/cloudinary.js';
import {
  moderateIntroVideoAtUrl,
  ContentModerationError,
} from '../services/contentModeration.js';
import {
  introVideoDurationError,
  isIntroVideoDurationValid,
} from '../constants/introVideo.js';
import path from 'path';
import fs from 'fs';

export const profileRouter = Router();

/**
 * Persist intro video first for fast onboarding UX; scan frames in the background.
 * If rejected, clear the profile URL and delete the Cloudinary asset.
 */
function moderateIntroVideoInBackground(
  userId: string,
  introVideoUrl: string,
  fallback?: { buffer: Buffer; mimeType: string },
): void {
  void (async () => {
    try {
      await moderateIntroVideoAtUrl(introVideoUrl, fallback);
    } catch (modError) {
      if (!(modError instanceof ContentModerationError)) {
        console.error('Background intro video moderation failed (video kept):', modError);
        return;
      }
      console.warn(`Intro video rejected for user ${userId}; clearing saved clip.`);
      try {
        const row = (await db
          .prepare('SELECT intro_video_url FROM profiles WHERE user_id = ?')
          .get([userId])) as { intro_video_url?: string | null } | undefined;
        const current = row?.intro_video_url?.trim() || '';
        if (current && current === introVideoUrl) {
          await (db
            .prepare(
              'UPDATE profiles SET intro_video_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            )
            .run([userId]) as Promise<unknown>);
          notifyPartnersProfileChanged(userId);
        }
        if (introVideoUrl.includes('res.cloudinary.com')) {
          await deleteFromCloudinary(introVideoUrl, 'video');
        }
      } catch (cleanupErr) {
        console.error('Failed to clear rejected intro video:', cleanupErr);
      }
    }
  })();
}

/** Match PostgreSQL column limits after initDatabase widen migrations. */
const DB_PHOTO_URL_MAX = 2000;
const DB_LOOKING_FOR_MAX = 500;

function clampForDb(value: string | null | undefined, max: number): string | null {
  if (value == null || value === '') return null;
  const t = value.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  console.warn(`Profile field truncated from ${t.length} to ${max} characters for DB`);
  return t.slice(0, max);
}

/** Avoid z.coerce.number() turning a missing/empty age into NaN ("Expected number, received nan"). */
function parseProfileAgeField(val: unknown): number | null | undefined {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (val === '') return undefined;
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

const profileAgeSchema = z.preprocess(
  parseProfileAgeField,
  z.union([z.number().min(18, 'Must be at least 18').max(120), z.null()]).optional(),
);

const preferenceAgeSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === '') return val === null ? null : undefined;
    const n = typeof val === 'number' ? val : Number(val);
    if (!Number.isFinite(n)) return undefined;
    return n;
  },
  z.union([z.number().min(18).max(120), z.null()]).optional(),
);

const profileSchema = z.object({
  displayName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .refine(val => val.trim().length >= 2, 'Name cannot be only whitespace'),
  age: profileAgeSchema,
  gender: z.string()
    .max(50, 'Gender must be at most 50 characters')
    .optional(),
  location: z.string()
    .max(100, 'Location must be at most 100 characters')
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (val == null || val.trim() === '') return true;
        const t = val.trim();
        const i = t.indexOf(',');
        if (i === -1) return false;
        return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
      },
      { message: 'Location must include both city and state (e.g. Medford, Oregon)' }
    ),
  bio: z.string()
    .max(500, 'Bio must be at most 500 characters')
    .optional()
    .nullable(),
  photoUrl: z.string()
    .max(DB_PHOTO_URL_MAX, `Photo URL must be at most ${DB_PHOTO_URL_MAX} characters`)
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim() === '') return null;
      return val.trim();
    }),
  lookingFor: z.string()
    .max(DB_LOOKING_FOR_MAX, `Looking for must be at most ${DB_LOOKING_FOR_MAX} characters`)
    .optional()
    .nullable()
});

const preferencesSchema = z.object({
  minAge: preferenceAgeSchema,
  maxAge: preferenceAgeSchema,
  preferredGenders: z.union([z.array(z.string()), z.null()]).optional(),
  maxDistance: z.union([z.number().min(1).max(REGION_MAX_DISTANCE_MILES), z.null()]).optional(),
  relationshipType: z.union([z.string(), z.null()]).optional(),
  intent: z.union([z.number().min(1).max(10), z.null()]).optional(),
  values: z.array(z.string()).optional(),
  showActiveStatus: z.boolean().optional(), // When provided, updates users.show_active_status (so others see/hide last active in matches)
});

// Create or update profile
profileRouter.post('/', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const profileData = profileSchema.parse(req.body);
    const userId = req.userId!;
    
    // Sanitize all text inputs to prevent XSS
    const sanitizedData: {
      displayName: string;
      age: number | null;
      gender: string;
      location: string | null;
      bio: string | null;
      photoUrl: string | null;
      lookingFor: string | null;
    } = {
      displayName: sanitizeText(profileData.displayName, 50),
      age: profileData.age ?? null,
      gender: profileData.gender ? sanitizeText(profileData.gender, 50) : '',
      location: profileData.location ? sanitizeText(profileData.location, 100) : null,
      bio: profileData.bio ? sanitizeText(profileData.bio, 500) : null,
      photoUrl: clampForDb(profileData.photoUrl, DB_PHOTO_URL_MAX),
      lookingFor: profileData.lookingFor
        ? clampForDb(sanitizeText(profileData.lookingFor, DB_LOOKING_FOR_MAX), DB_LOOKING_FOR_MAX)
        : null,
    };

    if (sanitizedData.displayName.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }

    if (sanitizedData.location) {
      const regionCheck = await validateLocationForActiveRegion(sanitizedData.location);
      if (!regionCheck.ok) {
        return res.status(400).json({ error: regionCheck.message, code: regionCheck.code });
      }
    }
    
    const runProfileUpdate = async (profileId: string) => {
      const updateStmt = db.prepare(`
        UPDATE profiles SET 
          display_name = ?, age = ?, gender = ?, location = ?, 
          bio = ?, photo_url = ?, looking_for = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      await (updateStmt.run([
        sanitizedData.displayName,
        sanitizedData.age,
        sanitizedData.gender,
        sanitizedData.location,
        sanitizedData.bio,
        sanitizedData.photoUrl,
        sanitizedData.lookingFor,
        userId
      ]) as Promise<any>);
      notifyPartnersProfileChanged(userId);
      return profileId;
    };

    const existingProfileStmt = db.prepare(
      'SELECT id, photo_url, looking_for, age, gender FROM profiles WHERE user_id = ?'
    );
    let existingProfile = await (existingProfileStmt.get([userId]) as Promise<
      {
        id: string;
        photo_url: string | null;
        looking_for: string | null;
        age: number | null;
        gender: string | null;
      } | undefined
    >);

    if (existingProfile) {
      // Wizard POST omits age until the member sets it on Profile
      if (profileData.age === undefined) {
        sanitizedData.age = existingProfile.age ?? null;
      }
      if (profileData.gender === undefined || profileData.gender === '') {
        sanitizedData.gender = sanitizeText(existingProfile.gender ?? '', 50);
      }
      // Wizard POST omits photoUrl — preserve uploaded gallery primary URL on update
      if (profileData.photoUrl === undefined && existingProfile.photo_url) {
        sanitizedData.photoUrl = clampForDb(existingProfile.photo_url, DB_PHOTO_URL_MAX);
      }
      if (profileData.lookingFor === undefined && existingProfile.looking_for) {
        sanitizedData.lookingFor = clampForDb(existingProfile.looking_for, DB_LOOKING_FOR_MAX);
      }
      await runProfileUpdate(existingProfile.id);
      res.json({ message: 'Profile updated', profileId: existingProfile.id });
      return;
    }

    // Create new profile (race-safe: concurrent saves may hit UNIQUE on user_id)
    const profileId = uuidv4();
    try {
      const insertStmt = db.prepare(`
        INSERT INTO profiles (id, user_id, display_name, age, gender, location, bio, photo_url, looking_for)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      await (insertStmt.run([
        profileId,
        userId,
        sanitizedData.displayName,
        sanitizedData.age,
        sanitizedData.gender,
        sanitizedData.location,
        sanitizedData.bio,
        sanitizedData.photoUrl,
        sanitizedData.lookingFor
      ]) as Promise<any>);

      const prefId = uuidv4();
      const prefStmt = db.prepare(`INSERT INTO preferences (id, profile_id) VALUES (?, ?)`);
      try {
        await (prefStmt.run([prefId, profileId]) as Promise<any>);
      } catch (prefErr: unknown) {
        if (!isUniqueViolation(prefErr)) throw prefErr;
      }

      notifyPartnersProfileChanged(userId);
      res.status(201).json({ message: 'Profile created', profileId });
    } catch (insertErr: unknown) {
      if (!isUniqueViolation(insertErr)) throw insertErr;
      existingProfile = await (existingProfileStmt.get([userId]) as Promise<
        {
          id: string;
          photo_url: string | null;
          looking_for: string | null;
          age: number | null;
          gender: string | null;
        } | undefined
      >);
      if (!existingProfile) throw insertErr;
      if (profileData.age === undefined) {
        sanitizedData.age = existingProfile.age ?? null;
      }
      if (profileData.gender === undefined || profileData.gender === '') {
        sanitizedData.gender = sanitizeText(existingProfile.gender ?? '', 50);
      }
      if (profileData.photoUrl === undefined && existingProfile.photo_url) {
        sanitizedData.photoUrl = clampForDb(existingProfile.photo_url, DB_PHOTO_URL_MAX);
      }
      if (profileData.lookingFor === undefined && existingProfile.looking_for) {
        sanitizedData.lookingFor = clampForDb(existingProfile.looking_for, DB_LOOKING_FOR_MAX);
      }
      await runProfileUpdate(existingProfile.id);
      res.json({ message: 'Profile updated', profileId: existingProfile.id });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Profile error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    const tooLong =
      /value too long|too long for type character varying/i.test(detail);
    res.status(tooLong ? 400 : 500).json({
      error: tooLong
        ? 'One of your profile fields is too long. Shorten your bio and try again.'
        : 'Failed to save profile',
      details: detail,
    });
  }
});

const locationFieldSchema = z
  .string()
  .max(100, 'Location must be at most 100 characters')
  .optional()
  .nullable()
  .refine(
    (val) => {
      if (val == null || val.trim() === '') return true;
      const t = val.trim();
      const i = t.indexOf(',');
      if (i === -1) return false;
      return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
    },
    { message: 'Location must include both city and state (e.g. Medford, Oregon)' }
  );

const profileBasicsSchema = z
  .object({
    displayName: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be at most 50 characters')
      .refine((val) => val.trim().length >= 2, 'Name cannot be only whitespace')
      .optional(),
    location: locationFieldSchema,
  })
  .refine((body) => body.displayName !== undefined || body.location !== undefined, {
    message: 'Provide displayName and/or location to update',
  });

// Partial update for display name and/or location (e.g. Settings after skipping onboarding wizard)
profileRouter.put('/basics', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const body = profileBasicsSchema.parse(req.body);
    const userId = req.userId!;

    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    let row = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);
    if (!row) {
      await ensureStubProfile(userId);
      row = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);
      if (!row) {
        return res.status(500).json({ error: 'Failed to create profile' });
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(sanitizeText(body.displayName, 50));
    }
    if (body.location !== undefined) {
      const nextLocation = body.location ? sanitizeText(body.location, 100) : null;
      if (nextLocation) {
        const regionCheck = await validateLocationForActiveRegion(nextLocation);
        if (!regionCheck.ok) {
          return res.status(400).json({ error: regionCheck.message, code: regionCheck.code });
        }
      }
      updates.push('location = ?');
      values.push(nextLocation);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    const sql = `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = ?`;
    await (db.prepare(sql).run(values) as Promise<unknown>);
    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Profile updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('PUT /profile/basics error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

profileRouter.post('/validate-location', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const body = z.object({ location: locationFieldSchema }).parse(req.body);
    if (!body.location?.trim()) {
      return res.status(400).json({
        valid: false,
        error: 'Location must include both city and state (e.g. Medford, Oregon)',
        code: 'INVALID_LOCATION_FORMAT',
      });
    }
    const regionCheck = await validateLocationForActiveRegion(body.location.trim());
    if (!regionCheck.ok) {
      return res.status(400).json({
        valid: false,
        error: regionCheck.message,
        code: regionCheck.code,
      });
    }
    res.json({ valid: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ valid: false, error: error.errors[0].message });
    }
    console.error('POST /profile/validate-location error:', error);
    res.status(500).json({ valid: false, error: 'Failed to validate location' });
  }
});

// Get current user's profile
profileRouter.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('👤 Fetching profile for user:', req.userId);
    
    let profile: any;
    try {
      const profileStmt = db.prepare('SELECT * FROM profiles WHERE user_id = ?');
      const profileResult = profileStmt.get([req.userId]);
      profile = (profileResult instanceof Promise)
        ? await profileResult
        : profileResult as any;
      console.log('✅ Profile fetched:', profile ? 'Found' : 'Not found');
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      throw new Error(`Failed to fetch profile: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get interests
    let interests: any[] = [];
    try {
      const interestsStmt = db.prepare('SELECT * FROM interests WHERE profile_id = ?');
      const interestsResult = interestsStmt.all([profile.id]);
      interests = (interestsResult instanceof Promise)
        ? await interestsResult
        : interestsResult as any[];
      console.log('✅ Interests fetched:', interests.length);
    } catch (error) {
      console.error('❌ Error fetching interests:', error);
      interests = []; // Default to empty array
    }
    
    // Get preferences
    let preferences: any = null;
    try {
      const preferencesStmt = db.prepare('SELECT * FROM preferences WHERE profile_id = ?');
      const preferencesResult = preferencesStmt.get([profile.id]);
      preferences = (preferencesResult instanceof Promise)
        ? await preferencesResult
        : preferencesResult as any;
      console.log('✅ Preferences fetched:', preferences ? 'Found' : 'Not found');
    } catch (error) {
      console.error('❌ Error fetching preferences:', error);
      preferences = null; // Default to null
    }
    
    // Get dealbreakers
    let dealbreakers: any[] = [];
    try {
      const dealbreakersStmt = db.prepare('SELECT * FROM dealbreakers WHERE profile_id = ?');
      const dealbreakersResult = dealbreakersStmt.all([profile.id]);
      dealbreakers = (dealbreakersResult instanceof Promise)
        ? await dealbreakersResult
        : dealbreakersResult as any[];
      console.log('✅ Dealbreakers fetched:', dealbreakers.length);
    } catch (error) {
      console.error('❌ Error fetching dealbreakers:', error);
      dealbreakers = []; // Default to empty array
    }
    
    // Get partner qualities
    let partnerQualities: any[] = [];
    try {
      const partnerQualitiesStmt = db.prepare('SELECT * FROM partner_qualities WHERE profile_id = ?');
      const partnerQualitiesResult = partnerQualitiesStmt.all([profile.id]);
      partnerQualities = (partnerQualitiesResult instanceof Promise)
        ? await partnerQualitiesResult
        : partnerQualitiesResult as any[];
      console.log('✅ Partner qualities fetched:', partnerQualities.length);
    } catch (error) {
      console.error('❌ Error fetching partner qualities:', error);
      partnerQualities = []; // Default to empty array
    }
    
    // Get lifestyle
    let lifestyle: any = null;
    try {
      const lifestyleStmt = db.prepare('SELECT * FROM lifestyle WHERE profile_id = ?');
      const lifestyleResult = lifestyleStmt.get([profile.id]);
      lifestyle = (lifestyleResult instanceof Promise)
        ? await lifestyleResult
        : lifestyleResult as any;
      console.log('✅ Lifestyle fetched:', lifestyle ? 'Found' : 'Not found');
    } catch (error) {
      console.error('❌ Error fetching lifestyle:', error);
      lifestyle = null; // Default to null
    }

    console.log('✅ Profile data assembled successfully');
    res.json({ profile, interests, preferences, dealbreakers, partnerQualities, lifestyle });
  } catch (error) {
    console.error('Profile GET error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error details:', errorMessage);
    res.status(500).json({ 
      error: `Failed to load profile: ${errorMessage}`,
      message: errorMessage
    });
  }
});

// Test endpoint to verify routes are deployed
profileRouter.get('/test-routes', authenticateToken, (req: AuthRequest, res) => {
  res.json({ 
    message: 'Profile routes are working',
    availableRoutes: [
      'PUT /api/profile/interests',
      'PUT /api/profile/dealbreakers',
      'PUT /api/profile/partner-qualities',
      'PUT /api/profile/preferences',
      'PUT /api/profile/lifestyle'
    ]
  });
});

// Update interests
profileRouter.put('/interests', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    console.log('📝 PUT /api/profile/interests - Request received');
    const userId = req.userId!;
    const { interests } = req.body;
    console.log('📝 Interests update:', { userId, interestsCount: interests?.length });

    if (!Array.isArray(interests)) {
      return res.status(400).json({ error: 'Interests must be an array' });
    }

    // Get user's profile
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);

    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing interests
    const deleteStmt = db.prepare('DELETE FROM interests WHERE profile_id = ?');
    await (deleteStmt.run([profileResult.id]) as Promise<any>);

    // Insert new interests
    if (interests.length > 0) {
      const insertStmt = db.prepare('INSERT INTO interests (id, profile_id, name) VALUES (?, ?, ?)');
      for (const interest of interests) {
        const interestId = uuidv4();
        const name = typeof interest === 'string' ? interest : interest.name;
        await (insertStmt.run([interestId, profileResult.id, sanitizeText(name, 100)]) as Promise<any>);
      }
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Interests updated', count: interests.length });
  } catch (error) {
    console.error('Update interests error:', error);
    res.status(500).json({ error: 'Failed to update interests' });
  }
});

// Update dealbreakers
profileRouter.put('/dealbreakers', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    console.log('📝 PUT /api/profile/dealbreakers - Request received');
    const userId = req.userId!;
    const { dealbreakers } = req.body;
    console.log('📝 Dealbreakers update:', { userId, dealbreakersCount: dealbreakers?.length });

    if (!Array.isArray(dealbreakers)) {
      return res.status(400).json({ error: 'Dealbreakers must be an array' });
    }

    // Get user's profile
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);

    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing dealbreakers
    const deleteStmt = db.prepare('DELETE FROM dealbreakers WHERE profile_id = ?');
    await (deleteStmt.run([profileResult.id]) as Promise<any>);

    // Insert new dealbreakers
    if (dealbreakers.length > 0) {
      const insertStmt = db.prepare('INSERT INTO dealbreakers (id, profile_id, description) VALUES (?, ?, ?)');
      for (const dealbreaker of dealbreakers) {
        const dealbreakerId = uuidv4();
        const description = typeof dealbreaker === 'string' ? dealbreaker : dealbreaker.description;
        await (insertStmt.run([dealbreakerId, profileResult.id, sanitizeText(description, 500)]) as Promise<any>);
      }
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Dealbreakers updated', count: dealbreakers.length });
  } catch (error) {
    console.error('Update dealbreakers error:', error);
    res.status(500).json({ error: 'Failed to update dealbreakers' });
  }
});

// Update partner qualities
profileRouter.put('/partner-qualities', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    console.log('📝 PUT /api/profile/partner-qualities - Request received');
    const userId = req.userId!;
    const { qualities } = req.body;
    console.log('📝 Partner qualities update:', { userId, qualitiesCount: qualities?.length });

    if (!Array.isArray(qualities)) {
      return res.status(400).json({ error: 'Qualities must be an array' });
    }

    // Get user's profile
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);

    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing partner qualities
    const deleteStmt = db.prepare('DELETE FROM partner_qualities WHERE profile_id = ?');
    await (deleteStmt.run([profileResult.id]) as Promise<any>);

    // Insert new partner qualities (must match canonical interest labels for matching)
    if (qualities.length > 0) {
      const insertStmt = db.prepare('INSERT INTO partner_qualities (id, profile_id, quality, importance) VALUES (?, ?, ?, ?)');
      for (const quality of qualities) {
        const qualityId = uuidv4();
        const rawName = typeof quality === 'string' ? quality : quality.quality;
        const canonical = canonicalizeInterestName(String(rawName || ''));
        if (!canonical) {
          return res.status(400).json({
            error: 'Each "what I\'m looking for" item must match a My Interests option.',
            invalidQuality: rawName,
          });
        }
        const importance = typeof quality === 'object' && quality.importance ? quality.importance : 5;
        await (insertStmt.run([qualityId, profileResult.id, sanitizeText(canonical, 100), importance]) as Promise<any>);
      }
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Partner qualities updated', count: qualities.length });
  } catch (error) {
    console.error('Update partner qualities error:', error);
    res.status(500).json({ error: 'Failed to update partner qualities' });
  }
});

// Update preferences
profileRouter.put('/preferences', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    console.log('📝 PUT /api/profile/preferences - Request received');
    const userId = req.userId!;
    const preferencesData = preferencesSchema.parse(req.body);
    console.log('📝 Preferences update:', { userId, preferencesData });

    // Get user's profile
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);

    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Fetch existing preferences so partial updates don't wipe fields (e.g. preferred_genders)
    const existingPrefsStmt = db.prepare('SELECT id, min_age, max_age, preferred_genders, max_distance, relationship_type, intent, values FROM preferences WHERE profile_id = ?');
    const existingPrefs = await (existingPrefsStmt.get([profileResult.id]) as Promise<{
      id: string;
      min_age: number | null;
      max_age: number | null;
      preferred_genders: string | null;
      max_distance: number | null;
      relationship_type: string | null;
      intent: number | null;
      values: string | null;
    } | undefined>);

    const preferredGendersJson = preferencesData.preferredGenders !== undefined
      ? (preferencesData.preferredGenders && preferencesData.preferredGenders.length > 0
          ? JSON.stringify(preferencesData.preferredGenders)
          : null)
      : (existingPrefs?.preferred_genders ?? null);
    const valuesJson = preferencesData.values !== undefined
      ? (preferencesData.values && preferencesData.values.length > 0 ? JSON.stringify(preferencesData.values) : null)
      : (existingPrefs?.values ?? null);

    const minAge = preferencesData.minAge !== undefined ? preferencesData.minAge : (existingPrefs?.min_age ?? null);
    const maxAge = preferencesData.maxAge !== undefined ? preferencesData.maxAge : (existingPrefs?.max_age ?? null);
    const maxDistance =
      preferencesData.maxDistance !== undefined
        ? normalizeMaxDistanceMiles(preferencesData.maxDistance)
        : existingPrefs?.max_distance != null
          ? normalizeMaxDistanceMiles(existingPrefs.max_distance)
          : null;
    const relationshipType = preferencesData.relationshipType !== undefined ? preferencesData.relationshipType : (existingPrefs?.relationship_type ?? null);
    const intent = preferencesData.intent !== undefined ? preferencesData.intent : (existingPrefs?.intent ?? null);

    if (existingPrefs) {
      // Update existing preferences (merge: only overwrite fields that were provided)
      const updateStmt = db.prepare(`
        UPDATE preferences SET
          min_age = ?, max_age = ?, preferred_genders = ?, max_distance = ?,
          relationship_type = ?, intent = ?, values = ?
        WHERE profile_id = ?
      `);
      await (updateStmt.run([
        minAge,
        maxAge,
        preferredGendersJson,
        maxDistance,
        relationshipType,
        intent,
        valuesJson,
        profileResult.id
      ]) as Promise<any>);
    } else {
      // Create new preferences
      const prefId = uuidv4();
      const insertStmt = db.prepare(`
        INSERT INTO preferences (id, profile_id, min_age, max_age, preferred_genders, max_distance, relationship_type, intent, values)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      await (insertStmt.run([
        prefId,
        profileResult.id,
        minAge,
        maxAge,
        preferredGendersJson,
        maxDistance,
        relationshipType,
        intent,
        valuesJson
      ]) as Promise<any>);
    }

    // Optional: update user's show_active_status (stored on users table) so matches can show/hide last active
    if (preferencesData.showActiveStatus !== undefined) {
      const showValue = preferencesData.showActiveStatus ? 1 : 0;
      await (db.prepare('UPDATE users SET show_active_status = ? WHERE id = ?').run([showValue, userId]) as Promise<any>);
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Preferences updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Update lifestyle
profileRouter.put('/lifestyle', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    console.log('📝 PUT /api/profile/lifestyle - Request received');
    const userId = req.userId!;
    const { smoking, drinking, children, pets, religion, political, workLifeBalance, worksOut } = req.body;
    console.log('📝 Lifestyle update:', { userId });

    // Get user's profile
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);

    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if lifestyle exists
    const existingLifestyleStmt = db.prepare('SELECT id FROM lifestyle WHERE profile_id = ?');
    const existingLifestyle = await (existingLifestyleStmt.get([profileResult.id]) as Promise<{ id: string } | undefined>);

    if (existingLifestyle) {
      // Update existing lifestyle
      const updateStmt = db.prepare(`
        UPDATE lifestyle SET
          smoking = ?, drinking = ?, children = ?, pets = ?,
          religion = ?, political = ?, work_life_balance = ?, works_out = ?
        WHERE profile_id = ?
      `);
      await (updateStmt.run([
        smoking ? sanitizeText(smoking, 50) : null,
        drinking ? sanitizeText(drinking, 50) : null,
        children ? sanitizeText(children, 50) : null,
        pets ? sanitizeText(pets, 50) : null,
        religion ? sanitizeText(religion, 50) : null,
        political ? sanitizeText(political, 50) : null,
        workLifeBalance ? sanitizeText(workLifeBalance, 50) : null,
        worksOut ? sanitizeText(worksOut, 50) : null,
        profileResult.id
      ]) as Promise<any>);
    } else {
      // Create new lifestyle
      const lifestyleId = uuidv4();
      const insertStmt = db.prepare(`
        INSERT INTO lifestyle (id, profile_id, smoking, drinking, children, pets, religion, political, work_life_balance, works_out)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      await (insertStmt.run([
        lifestyleId,
        profileResult.id,
        smoking ? sanitizeText(smoking, 50) : null,
        drinking ? sanitizeText(drinking, 50) : null,
        children ? sanitizeText(children, 50) : null,
        pets ? sanitizeText(pets, 50) : null,
        religion ? sanitizeText(religion, 50) : null,
        political ? sanitizeText(political, 50) : null,
        workLifeBalance ? sanitizeText(workLifeBalance, 50) : null,
        worksOut ? sanitizeText(worksOut, 50) : null
      ]) as Promise<any>);
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Lifestyle updated' });
  } catch (error) {
    console.error('Update lifestyle error:', error);
    res.status(500).json({ error: 'Failed to update lifestyle' });
  }
});

// Delete profile (for testing - removes profile but keeps user account)
profileRouter.delete('/', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    // Get profile ID
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profileResult = await (profileStmt.get([userId]) as Promise<{ id: string } | undefined>);
    
    if (!profileResult) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const profileId = profileResult.id;
    
    // Delete all related data (cascade delete)
    const deleteInterests = db.prepare('DELETE FROM interests WHERE profile_id = ?');
    await (deleteInterests.run([profileId]) as Promise<any>);
    
    const deleteDealbreakers = db.prepare('DELETE FROM dealbreakers WHERE profile_id = ?');
    await (deleteDealbreakers.run([profileId]) as Promise<any>);
    
    const deletePartnerQualities = db.prepare('DELETE FROM partner_qualities WHERE profile_id = ?');
    await (deletePartnerQualities.run([profileId]) as Promise<any>);
    
    const deletePreferences = db.prepare('DELETE FROM preferences WHERE profile_id = ?');
    await (deletePreferences.run([profileId]) as Promise<any>);
    
    const deleteLifestyle = db.prepare('DELETE FROM lifestyle WHERE profile_id = ?');
    await (deleteLifestyle.run([profileId]) as Promise<any>);
    
    const deletePhotos = db.prepare('DELETE FROM photos WHERE profile_id = ?');
    await (deletePhotos.run([profileId]) as Promise<any>);
    
    // Finally delete the profile itself
    const deleteProfile = db.prepare('DELETE FROM profiles WHERE id = ?');
    await (deleteProfile.run([profileId]) as Promise<any>);
    
    console.log(`✅ Profile deleted for user ${userId}`);
    res.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

/** Signed Cloudinary upload params — mobile uploads directly to Cloudinary (faster than proxying through Render). */
profileRouter.post('/intro-video/upload-params', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Direct video upload is not configured on this server.' });
    }
    const userId = req.userId!;
    const profileResult = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([userId]);
    const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
      | { id: string }
      | undefined;
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete name and location first.' });
    }
    res.json(createIntroVideoDirectUploadParams());
  } catch (error) {
    console.error('Intro video upload-params error:', error);
    res.status(500).json({ error: 'Failed to prepare video upload' });
  }
});

/** After direct Cloudinary upload — validate duration, save immediately, moderate in background. */
profileRouter.post('/intro-video/confirm', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const secureUrl = typeof req.body?.secureUrl === 'string' ? req.body.secureUrl.trim() : '';
    const durationSec =
      typeof req.body?.durationSec === 'number' && Number.isFinite(req.body.durationSec)
        ? req.body.durationSec
        : undefined;

    if (!secureUrl || !isAllowedIntroVideoCloudinaryUrl(secureUrl)) {
      return res.status(400).json({ error: 'Invalid intro video URL.' });
    }

    const profileResult = db.prepare('SELECT id, intro_video_url FROM profiles WHERE user_id = ?').get([userId]);
    const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
      | { id: string; intro_video_url: string | null }
      | undefined;
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete name and location first.' });
    }

    if (durationSec != null && !isIntroVideoDurationValid(durationSec)) {
      await deleteFromCloudinary(secureUrl, 'video');
      return res.status(400).json({ error: introVideoDurationError(durationSec) });
    }

    await (db
      .prepare('UPDATE profiles SET intro_video_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run([secureUrl, userId]) as Promise<unknown>);

    notifyPartnersProfileChanged(userId);
    // Don't block onboarding on Sightengine — scan after the user continues.
    moderateIntroVideoInBackground(userId, secureUrl);
    res.json({ introVideoUrl: secureUrl, message: 'Intro video saved' });
  } catch (error) {
    console.error('Intro video confirm error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save intro video' });
  }
});

/** Legacy path: multipart upload through the API (local dev / fallback). */
profileRouter.post('/intro-video', authenticateToken, rateLimitAPI, (req: AuthRequest, res, next) => {
  uploadChatVideo(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Video upload failed' });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No video file received' });

    const profileResult = db.prepare('SELECT id, intro_video_url FROM profiles WHERE user_id = ?').get([userId]);
    const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
      | { id: string; intro_video_url: string | null }
      | undefined;
    if (!profile) return res.status(404).json({ error: 'Profile not found. Complete name and location first.' });

    let introVideoUrl: string;
    if (isCloudinaryConfigured() && file.buffer) {
      const uploaded = await uploadToCloudinaryMedia(file.buffer, 'profile-intro-videos', 'video');
      introVideoUrl = uploaded.secureUrl;
      if (
        uploaded.durationSec != null &&
        !isIntroVideoDurationValid(uploaded.durationSec)
      ) {
        await deleteFromCloudinary(introVideoUrl, 'video');
        return res.status(400).json({ error: introVideoDurationError(uploaded.durationSec) });
      }
    } else if (file.path) {
      const filename = path.basename(file.path);
      introVideoUrl = `/uploads/${filename}`;
    } else {
      return res.status(503).json({ error: 'Video upload is not configured on this server.' });
    }

    try {
      const fallbackBuffer =
        file.buffer ?? (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
      await (db
        .prepare('UPDATE profiles SET intro_video_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run([introVideoUrl, userId]) as Promise<unknown>);

      notifyPartnersProfileChanged(userId);
      moderateIntroVideoInBackground(
        userId,
        introVideoUrl,
        fallbackBuffer ? { buffer: fallbackBuffer, mimeType: file.mimetype } : undefined,
      );
      res.json({ introVideoUrl, message: 'Intro video saved' });
    } catch (saveError) {
      if (introVideoUrl.includes('res.cloudinary.com')) {
        await deleteFromCloudinary(introVideoUrl, 'video');
      } else if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw saveError;
    }
  } catch (error) {
    console.error('Intro video upload error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload intro video' });
  }
});

profileRouter.delete('/intro-video', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    await (db
      .prepare('UPDATE profiles SET intro_video_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run([userId]) as Promise<unknown>);
    notifyPartnersProfileChanged(userId);
    res.json({ message: 'Intro video removed' });
  } catch (error) {
    console.error('Intro video delete error:', error);
    res.status(500).json({ error: 'Failed to remove intro video' });
  }
});

const SOBER_CIRCLE_LEVELS = [
  'newly_sober',
  'one_year_plus',
  'five_years_plus',
  'sober_curious',
] as const;

profileRouter.put('/sober-circle', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const level = typeof req.body?.level === 'string' ? req.body.level.trim() : '';
    if (!SOBER_CIRCLE_LEVELS.includes(level as (typeof SOBER_CIRCLE_LEVELS)[number])) {
      return res.status(400).json({ error: 'Invalid sobriety level' });
    }
    await (db
      .prepare(
        `UPDATE profiles SET sober_circle_level = ?, sober_circle_joined_at = COALESCE(sober_circle_joined_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      )
      .run([level, userId]) as Promise<unknown>);
    notifyPartnersProfileChanged(userId);
    res.json({ level, message: 'Sober Circle level saved' });
  } catch (error) {
    console.error('Sober circle update error:', error);
    res.status(500).json({ error: 'Failed to save Sober Circle level' });
  }
});

/** Opt into Golf Dates (Play tab) — activity-first matching for golf dates. */
profileRouter.put('/golf-dates', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const optIn = req.body?.optIn !== false && req.body?.optIn !== 0 && req.body?.optIn !== '0';
    if (optIn) {
      await (db
        .prepare(
          `UPDATE profiles SET golf_dates_opt_in = 1, golf_dates_joined_at = COALESCE(golf_dates_joined_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        )
        .run([userId]) as Promise<unknown>);
    } else {
      await (db
        .prepare(
          `UPDATE profiles SET golf_dates_opt_in = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        )
        .run([userId]) as Promise<unknown>);
    }
    notifyPartnersProfileChanged(userId);
    res.json({ golfDatesOptIn: !!optIn, message: optIn ? 'Joined Golf Dates' : 'Left Golf Dates' });
  } catch (error) {
    console.error('Golf dates update error:', error);
    res.status(500).json({ error: 'Failed to save Golf Dates preference' });
  }
});

profileRouter.post('/activate', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const clientPlatform = detectClientPlatformFromRequest(req);
    const result = await activateUserAccount(req.userId!, { clientPlatform });
    res.json({
      message: result.alreadyActive
        ? 'Account already active'
        : 'Account created successfully',
      ...result,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; code?: string; missing?: string[]; message?: string };
    if (err.status === 400) {
      return res.status(400).json({
        error: err.message || 'Complete your profile first',
        code: err.code || 'PROFILE_INCOMPLETE',
        missing: err.missing,
      });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Activate account error:', error);
    res.status(500).json({ error: 'Failed to activate account' });
  }
});

