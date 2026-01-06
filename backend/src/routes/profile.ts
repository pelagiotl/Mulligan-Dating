import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

export const profileRouter = Router();

const profileSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  age: z.number().min(18, 'Must be at least 18').max(120),
  gender: z.string(),
  location: z.string().optional(),
  bio: z.string().max(500).optional(),
  photoUrl: z.string().url().optional(),
  lookingFor: z.string().optional()
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
profileRouter.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const profileData = profileSchema.parse(req.body);
    const userId = req.userId!;
    
    // Check if profile exists
    const existingProfile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(userId) as { id: string } | undefined;
    
    if (existingProfile) {
      // Update existing profile
      db.prepare(`
        UPDATE profiles SET 
          display_name = ?, age = ?, gender = ?, location = ?, 
          bio = ?, photo_url = ?, looking_for = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        profileData.displayName,
        profileData.age,
        profileData.gender,
        profileData.location || null,
        profileData.bio || null,
        profileData.photoUrl || null,
        profileData.lookingFor || null,
        userId
      );
      
      res.json({ message: 'Profile updated', profileId: existingProfile.id });
    } else {
      // Create new profile
      const profileId = uuidv4();
      db.prepare(`
        INSERT INTO profiles (id, user_id, display_name, age, gender, location, bio, photo_url, looking_for)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profileId,
        userId,
        profileData.displayName,
        profileData.age,
        profileData.gender,
        profileData.location || null,
        profileData.bio || null,
        profileData.photoUrl || null,
        profileData.lookingFor || null
      );

      // Create default preferences
      const prefId = uuidv4();
      db.prepare(`
        INSERT INTO preferences (id, profile_id) VALUES (?, ?)
      `).run(prefId, profileId);
      
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
profileRouter.get('/', authenticateToken, (req: AuthRequest, res) => {
  try {
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId) as any;
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get interests
    const interests = db.prepare('SELECT * FROM interests WHERE profile_id = ?').all(profile.id);
    
    // Get preferences
    const preferences = db.prepare('SELECT * FROM preferences WHERE profile_id = ?').get(profile.id);
    
    // Get dealbreakers
    const dealbreakers = db.prepare('SELECT * FROM dealbreakers WHERE profile_id = ?').all(profile.id);
    
    // Get partner qualities
    const partnerQualities = db.prepare('SELECT * FROM partner_qualities WHERE profile_id = ?').all(profile.id);
    
    // Get lifestyle
    const lifestyle = db.prepare('SELECT * FROM lifestyle WHERE profile_id = ?').get(profile.id) as any;

    res.json({ profile, interests, preferences, dealbreakers, partnerQualities, lifestyle });
  } catch (error) {
    console.error('Profile GET error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error details:', errorMessage);
    res.status(500).json({ error: `Failed to load profile: ${errorMessage}` });
  }
});

// Update interests
profileRouter.put('/interests', authenticateToken, (req: AuthRequest, res) => {
  const { interests } = req.body as { interests: Array<{ name: string; category?: string }> };
  
  const profile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId) as { id: string } | undefined;
  
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Delete existing interests
  db.prepare('DELETE FROM interests WHERE profile_id = ?').run(profile.id);

  // Insert new interests
  const insertStmt = db.prepare('INSERT INTO interests (id, profile_id, name, category) VALUES (?, ?, ?, ?)');
  
  for (const interest of interests) {
    insertStmt.run(uuidv4(), profile.id, interest.name, interest.category || null);
  }

  res.json({ message: 'Interests updated' });
});

// Update preferences
profileRouter.put('/preferences', authenticateToken, (req: AuthRequest, res) => {
  try {
    const prefData = preferencesSchema.parse(req.body);
    
    const profile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId) as { id: string } | undefined;
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Cap max age at 50
    const maxAge = prefData.maxAge ? Math.min(prefData.maxAge, 50) : 50;

    db.prepare(`
      UPDATE preferences SET 
        min_age = ?, max_age = ?, preferred_genders = ?, max_distance = ?, relationship_type = ?, intent = ?, "values" = ?
      WHERE profile_id = ?
    `).run(
      prefData.minAge || 18,
      maxAge,
      prefData.preferredGenders ? JSON.stringify(prefData.preferredGenders) : null,
      prefData.maxDistance || 50,
      prefData.relationshipType || null,
      prefData.intent || 5,
      prefData.values ? JSON.stringify(prefData.values) : null,
      profile.id
    );

    res.json({ message: 'Preferences updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Update dealbreakers
profileRouter.put('/dealbreakers', authenticateToken, (req: AuthRequest, res) => {
  const { dealbreakers } = req.body as { dealbreakers: Array<{ description: string; category?: string }> };
  
  const profile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId) as { id: string } | undefined;
  
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Delete existing dealbreakers
  db.prepare('DELETE FROM dealbreakers WHERE profile_id = ?').run(profile.id);

  // Insert new dealbreakers
  const insertStmt = db.prepare('INSERT INTO dealbreakers (id, profile_id, description, category) VALUES (?, ?, ?, ?)');
  
  for (const db_ of dealbreakers) {
    insertStmt.run(uuidv4(), profile.id, db_.description, db_.category || null);
  }

  res.json({ message: 'Dealbreakers updated' });
});

// Update partner qualities
profileRouter.put('/partner-qualities', authenticateToken, (req: AuthRequest, res) => {
  const { qualities } = req.body as { qualities: Array<{ quality: string; importance?: number }> };
  
  const profile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId) as { id: string } | undefined;
  
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Delete existing qualities
  db.prepare('DELETE FROM partner_qualities WHERE profile_id = ?').run(profile.id);

  // Insert new qualities
  const insertStmt = db.prepare('INSERT INTO partner_qualities (id, profile_id, quality, importance) VALUES (?, ?, ?, ?)');
  
  for (const q of qualities) {
    insertStmt.run(uuidv4(), profile.id, q.quality, q.importance || 5);
  }

  res.json({ message: 'Partner qualities updated' });
});

// Update lifestyle
profileRouter.put('/lifestyle', authenticateToken, (req: AuthRequest, res) => {
  const { smoking, drinking, children, pets, religion, workLifeBalance } = req.body as {
    smoking?: string | null;
    drinking?: string | null;
    children?: string | null;
    pets?: string | null;
    religion?: string | null;
    workLifeBalance?: string | null;
  };
  
  const profile = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.userId) as { id: string } | undefined;
  
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Check if lifestyle record exists
  const existing = db.prepare('SELECT id FROM lifestyle WHERE profile_id = ?').get(profile.id) as { id: string } | undefined;
  
  if (existing) {
    // Update existing
    db.prepare(`
      UPDATE lifestyle SET 
        smoking = ?, drinking = ?, children = ?, pets = ?, religion = ?, work_life_balance = ?
      WHERE profile_id = ?
    `).run(
      smoking || null,
      drinking || null,
      children || null,
      pets || null,
      religion || null,
      workLifeBalance || null,
      profile.id
    );
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO lifestyle (id, profile_id, smoking, drinking, children, pets, religion, work_life_balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      profile.id,
      smoking || null,
      drinking || null,
      children || null,
      pets || null,
      religion || null,
      workLifeBalance || null
    );
  }

  res.json({ message: 'Lifestyle updated' });
});

