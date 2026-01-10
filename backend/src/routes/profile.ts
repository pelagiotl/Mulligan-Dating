import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { sanitizeText } from '../middleware/security.js';
import { rateLimitAPI } from '../middleware/security.js';

export const profileRouter = Router();

const profileSchema = z.object({
  displayName: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .refine(val => val.trim().length >= 2, 'Name cannot be only whitespace'),
  age: z.number().min(18, 'Must be at least 18').max(120),
  gender: z.string()
    .min(1, 'Gender is required')
    .max(50, 'Gender must be at most 50 characters'),
  location: z.string()
    .max(100, 'Location must be at most 100 characters')
    .optional()
    .nullable(),
  bio: z.string()
    .max(500, 'Bio must be at most 500 characters')
    .optional()
    .nullable(),
  photoUrl: z.string()
    .max(5000, 'Photo URL must be at most 5000 characters')
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim() === '') return null;
      return val.trim();
    }),
  lookingFor: z.string()
    .max(500, 'Looking for must be at most 500 characters')
    .optional()
    .nullable()
});

const preferencesSchema = z.object({
  minAge: z.number().min(18).max(120).optional(),
  maxAge: z.number().min(18).max(50).optional(), // Max age capped at 50
  preferredGenders: z.array(z.string()).optional(),
  maxDistance: z.number().min(1).max(500).optional(),
  relationshipType: z.string().optional(),
  intent: z.number().min(1).max(10).optional(),
  values: z.array(z.string()).optional()
});

// Create or update profile
profileRouter.post('/', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const profileData = profileSchema.parse(req.body);
    const userId = req.userId!;
    
    // Sanitize all text inputs to prevent XSS
    const sanitizedData = {
      displayName: sanitizeText(profileData.displayName, 50),
      age: profileData.age,
      gender: sanitizeText(profileData.gender, 50),
      location: profileData.location ? sanitizeText(profileData.location, 100) : null,
      bio: profileData.bio ? sanitizeText(profileData.bio, 500) : null,
      photoUrl: profileData.photoUrl || null, // URL validation already done by Zod
      lookingFor: profileData.lookingFor ? sanitizeText(profileData.lookingFor, 500) : null
    };
    
    // Check if profile exists
    const existingProfileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const existingProfile = await (existingProfileStmt.get([userId]) as Promise<{ id: string } | undefined>);
    
    if (existingProfile) {
      // Update existing profile
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
      
      res.json({ message: 'Profile updated', profileId: existingProfile.id });
    } else {
      // Create new profile
      const profileId = uuidv4();
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

      // Create default preferences
      const prefId = uuidv4();
      const prefStmt = db.prepare(`
        INSERT INTO preferences (id, profile_id) VALUES (?, ?)
      `);
      await (prefStmt.run([prefId, profileId]) as Promise<any>);
      
      res.status(201).json({ message: 'Profile created', profileId });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to save profile' });
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
      interests = [];
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
      preferences = null;
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
      dealbreakers = [];
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
      partnerQualities = [];
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
      lifestyle = null;
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
