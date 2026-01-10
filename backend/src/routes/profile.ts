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
