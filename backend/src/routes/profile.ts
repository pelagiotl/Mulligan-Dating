import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { sanitizeText, sanitizeArray } from '../middleware/security.js';
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
    .url('Photo URL must be a valid URL')
    .max(2048, 'Photo URL must be at most 2048 characters')
    .optional()
    .nullable(),
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
      profile = await (profileStmt.get([req.userId]) as Promise<any>);
      console.log('✅ Profile fetched:', profile ? 'Found' : 'Not found');
    } catch (error) {
      console.error('❌ Error fetching profile:', error);
      throw new Error(`Failed to fetch profile: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get interests
    let interests: any[];
    try {
      const interestsStmt = db.prepare('SELECT * FROM interests WHERE profile_id = ?');
      interests = await (interestsStmt.all([profile.id]) as Promise<any[]>);
      console.log('✅ Interests fetched:', interests.length);
    } catch (error) {
      console.error('❌ Error fetching interests:', error);
      interests = []; // Default to empty array
    }
    
    // Get preferences
    let preferences: any = null;
    try {
      const preferencesStmt = db.prepare('SELECT * FROM preferences WHERE profile_id = ?');
      preferences = await (preferencesStmt.get([profile.id]) as Promise<any>);
      console.log('✅ Preferences fetched:', preferences ? 'Found' : 'Not found');
    } catch (error) {
      console.error('❌ Error fetching preferences:', error);
      preferences = null; // Default to null
    }
    
    // Get dealbreakers
    let dealbreakers: any[] = [];
    try {
      const dealbreakersStmt = db.prepare('SELECT * FROM dealbreakers WHERE profile_id = ?');
      dealbreakers = await (dealbreakersStmt.all([profile.id]) as Promise<any[]>);
      console.log('✅ Dealbreakers fetched:', dealbreakers.length);
    } catch (error) {
      console.error('❌ Error fetching dealbreakers:', error);
      dealbreakers = []; // Default to empty array
    }
    
    // Get partner qualities
    let partnerQualities: any[] = [];
    try {
      const partnerQualitiesStmt = db.prepare('SELECT * FROM partner_qualities WHERE profile_id = ?');
      partnerQualities = await (partnerQualitiesStmt.all([profile.id]) as Promise<any[]>);
      console.log('✅ Partner qualities fetched:', partnerQualities.length);
    } catch (error) {
      console.error('❌ Error fetching partner qualities:', error);
      partnerQualities = []; // Default to empty array
    }
    
    // Get lifestyle
    let lifestyle: any = null;
    try {
      const lifestyleStmt = db.prepare('SELECT * FROM lifestyle WHERE profile_id = ?');
      lifestyle = await (lifestyleStmt.get([profile.id]) as Promise<any>);
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

// Update interests
profileRouter.put('/interests', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    // Validate input
    if (!Array.isArray(req.body.interests)) {
      return res.status(400).json({ error: 'Interests must be an array' });
    }
    
    // Limit to 20 interests max
    const interests = req.body.interests.slice(0, 20) as Array<{ name: string; category?: string }>;
    
    // Validate each interest
    for (const interest of interests) {
      if (!interest.name || typeof interest.name !== 'string') {
        return res.status(400).json({ error: 'Each interest must have a name' });
      }
      if (interest.name.length > 50) {
        return res.status(400).json({ error: 'Interest name must be at most 50 characters' });
      }
    }
    
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get([req.userId]) as Promise<{ id: string } | undefined>);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing interests
    const deleteStmt = db.prepare('DELETE FROM interests WHERE profile_id = ?');
    await (deleteStmt.run([profile.id]) as Promise<any>);

    // Insert new interests (sanitized)
    const insertStmt = db.prepare('INSERT INTO interests (id, profile_id, name, category) VALUES (?, ?, ?, ?)');
    
    for (const interest of interests) {
      const sanitizedName = sanitizeText(interest.name, 50);
      const sanitizedCategory = interest.category ? sanitizeText(interest.category, 50) : null;
      await (insertStmt.run([uuidv4(), profile.id, sanitizedName, sanitizedCategory]) as Promise<any>);
    }

    res.json({ message: 'Interests updated' });
  } catch (error) {
    console.error('Interests update error:', error);
    res.status(500).json({ error: 'Failed to update interests' });
  }
});

// Update preferences
profileRouter.put('/preferences', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const prefData = preferencesSchema.parse(req.body);
    
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get([req.userId]) as Promise<{ id: string } | undefined>);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Cap max age at 50
    const maxAge = prefData.maxAge ? Math.min(prefData.maxAge, 50) : 50;

    const updateStmt = db.prepare(`
      UPDATE preferences SET 
        min_age = ?, max_age = ?, preferred_genders = ?, max_distance = ?, relationship_type = ?, intent = ?, "values" = ?
      WHERE profile_id = ?
    `);
    await (updateStmt.run([
      prefData.minAge || 18,
      maxAge,
      prefData.preferredGenders ? JSON.stringify(prefData.preferredGenders) : null,
      prefData.maxDistance || 50,
      prefData.relationshipType || null,
      prefData.intent || 5,
      prefData.values ? JSON.stringify(prefData.values) : null,
      profile.id
    ]) as Promise<any>);

    res.json({ message: 'Preferences updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Update dealbreakers
profileRouter.put('/dealbreakers', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    // Validate input
    if (!Array.isArray(req.body.dealbreakers)) {
      return res.status(400).json({ error: 'Dealbreakers must be an array' });
    }
    
    // Limit to 10 dealbreakers max
    const dealbreakers = req.body.dealbreakers.slice(0, 10) as Array<{ description: string; category?: string }>;
    
    // Validate each dealbreaker
    for (const db_ of dealbreakers) {
      if (!db_.description || typeof db_.description !== 'string') {
        return res.status(400).json({ error: 'Each dealbreaker must have a description' });
      }
      if (db_.description.length > 100) {
        return res.status(400).json({ error: 'Dealbreaker description must be at most 100 characters' });
      }
    }
    
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get([req.userId]) as Promise<{ id: string } | undefined>);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing dealbreakers
    const deleteStmt = db.prepare('DELETE FROM dealbreakers WHERE profile_id = ?');
    await (deleteStmt.run([profile.id]) as Promise<any>);

    // Insert new dealbreakers (sanitized)
    const insertStmt = db.prepare('INSERT INTO dealbreakers (id, profile_id, description, category) VALUES (?, ?, ?, ?)');
    
    for (const db_ of dealbreakers) {
      const sanitizedDesc = sanitizeText(db_.description, 100);
      const sanitizedCategory = db_.category ? sanitizeText(db_.category, 50) : null;
      await (insertStmt.run([uuidv4(), profile.id, sanitizedDesc, sanitizedCategory]) as Promise<any>);
    }

    res.json({ message: 'Dealbreakers updated' });
  } catch (error) {
    console.error('Dealbreakers update error:', error);
    res.status(500).json({ error: 'Failed to update dealbreakers' });
  }
});

// Update partner qualities
profileRouter.put('/partner-qualities', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    // Validate input
    if (!Array.isArray(req.body.qualities)) {
      return res.status(400).json({ error: 'Qualities must be an array' });
    }
    
    // Limit to 20 qualities max
    const qualities = req.body.qualities.slice(0, 20) as Array<{ quality: string; importance?: number }>;
    
    // Validate each quality
    for (const q of qualities) {
      if (!q.quality || typeof q.quality !== 'string') {
        return res.status(400).json({ error: 'Each quality must have a name' });
      }
      if (q.quality.length > 50) {
        return res.status(400).json({ error: 'Quality name must be at most 50 characters' });
      }
      if (q.importance !== undefined) {
        if (typeof q.importance !== 'number' || q.importance < 1 || q.importance > 10) {
          return res.status(400).json({ error: 'Importance must be a number between 1 and 10' });
        }
      }
    }
    
    const profileStmt = db.prepare('SELECT id FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get([req.userId]) as Promise<{ id: string } | undefined>);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Delete existing qualities
    const deleteStmt = db.prepare('DELETE FROM partner_qualities WHERE profile_id = ?');
    await (deleteStmt.run([profile.id]) as Promise<any>);

    // Insert new qualities (sanitized)
    const insertStmt = db.prepare('INSERT INTO partner_qualities (id, profile_id, quality, importance) VALUES (?, ?, ?, ?)');
    
    for (const q of qualities) {
      const sanitizedQuality = sanitizeText(q.quality, 50);
      const importance = q.importance !== undefined ? Math.max(1, Math.min(10, Math.round(q.importance))) : 5;
      await (insertStmt.run([uuidv4(), profile.id, sanitizedQuality, importance]) as Promise<any>);
    }

    res.json({ message: 'Partner qualities updated' });
  } catch (error) {
    console.error('Partner qualities update error:', error);
    res.status(500).json({ error: 'Failed to update partner qualities' });
  }
});

// Update lifestyle
profileRouter.put('/lifestyle', authenticateToken, async (req: AuthRequest, res) => {
  const { smoking, drinking, children, pets, religion, workLifeBalance, worksOut } = req.body as {
    smoking?: string | null;
    drinking?: string | null;
    children?: string | null;
    pets?: string | null;
    religion?: string | null;
    workLifeBalance?: string | null;
    worksOut?: string | null;
  };
  
  try {
    const profile = await (db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([req.userId]) as Promise<{ id: string } | undefined>);
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if lifestyle record exists
    const existing = await (db.prepare('SELECT id FROM lifestyle WHERE profile_id = ?').get([profile.id]) as Promise<{ id: string } | undefined>);
    
    if (existing) {
      // Update existing
      await (db.prepare(`
        UPDATE lifestyle SET 
          smoking = ?, drinking = ?, children = ?, pets = ?, religion = ?, work_life_balance = ?, works_out = ?
        WHERE profile_id = ?
      `).run([
        smoking || null,
        drinking || null,
        children || null,
        pets || null,
        religion || null,
        workLifeBalance || null,
        worksOut || null,
        profile.id
      ]) as Promise<any>);
    } else {
      // Insert new
      await (db.prepare(`
        INSERT INTO lifestyle (id, profile_id, smoking, drinking, children, pets, religion, work_life_balance, works_out)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run([
        uuidv4(),
        profile.id,
        smoking || null,
        drinking || null,
        children || null,
        pets || null,
        religion || null,
        workLifeBalance || null,
        worksOut || null
      ]) as Promise<any>);
    }

    res.json({ message: 'Lifestyle updated' });
  } catch (error) {
    console.error('Lifestyle update error:', error);
    res.status(500).json({ error: 'Failed to update lifestyle' });
  }
});

