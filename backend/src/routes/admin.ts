import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

export const adminRouter = Router();

// Create test users endpoint (admin only, or no auth in development)
adminRouter.post('/create-test-users', async (req: AuthRequest, res) => {
  // In development, allow without auth. In production, require admin.
  if (process.env.NODE_ENV === 'production') {
    // Check auth for production
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required in production' });
    }
    // Verify admin in production (simplified check for now)
    // In production, you'd want to properly verify the token and check is_admin
  }
  try {
    const testUsers = [
      {
        name: 'Alex',
        age: 28,
        gender: 'Male',
        location: 'San Francisco, CA',
        bio: 'Love hiking, coffee, and good conversations. Looking for someone to explore the city with!',
        lookingFor: 'Long-term relationship',
        interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'],
        phone: '+15551234567'
      },
      {
        name: 'Jordan',
        age: 26,
        gender: 'Female',
        location: 'Los Angeles, CA',
        bio: 'Foodie, bookworm, and adventure seeker. Always up for trying something new!',
        lookingFor: 'Friendship or more',
        interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'],
        phone: '+15551234568'
      },
      {
        name: 'Sam',
        age: 30,
        gender: 'Non-binary',
        location: 'New York, NY',
        bio: 'Artist, musician, and creative soul. Love deep conversations and meaningful connections.',
        lookingFor: 'Meaningful connection',
        interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'],
        phone: '+15551234569'
      },
      {
        name: 'Taylor',
        age: 25,
        gender: 'Female',
        location: 'Austin, TX',
        bio: 'Tech enthusiast, dog lover, and weekend explorer. Let\'s build something amazing together!',
        lookingFor: 'Long-term relationship',
        interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'],
        phone: '+15551234570'
      },
      {
        name: 'Casey',
        age: 29,
        gender: 'Male',
        location: 'Seattle, WA',
        bio: 'Coffee snob, music producer, and nature enthusiast. Looking for my person!',
        lookingFor: 'Serious relationship',
        interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'],
        phone: '+15551234571'
      }
    ];

    const createdUsers = [];

    for (const userData of testUsers) {
      try {
        const userId = uuidv4();
        const profileId = uuidv4();
        const now = new Date().toISOString();

        // Check if user already exists
        const existingUserStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
        const existingUser = await (existingUserStmt.get([userData.phone]) as Promise<{ id: string } | undefined>);

        if (existingUser) {
          console.log(`⏭️  User ${userData.name} already exists, skipping...`);
          continue;
        }

        // Create user
        const userStmt = db.prepare(`
          INSERT INTO users (
            id, phone_number, phone_verified, browse_unlocked_at, 
            tos_accepted_at, privacy_accepted_at, created_at, last_active_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
        `);
        
        await (userStmt.run([
          userId,
          userData.phone,
          now,
          now,
          now,
          now,
          now
        ]) as Promise<any>);

        // Create profile
        const profileStmt = db.prepare(`
          INSERT INTO profiles (
            id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        await (profileStmt.run([
          profileId,
          userId,
          userData.name,
          userData.age,
          userData.gender,
          userData.location,
          userData.bio,
          userData.lookingFor,
          now,
          now
        ]) as Promise<any>);

        // Create preferences
        const preferencesId = uuidv4();
        const preferencesStmt = db.prepare(`
          INSERT INTO preferences (
            id, profile_id, min_age, max_age, preferred_genders, max_distance
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        const minAge = Math.max(18, userData.age - 5);
        const maxAge = userData.age + 5;
        const preferredGenders = JSON.stringify(['Male', 'Female', 'Non-binary']);

        await (preferencesStmt.run([
          preferencesId,
          profileId,
          minAge,
          maxAge,
          preferredGenders,
          50
        ]) as Promise<any>);

        // Create interests
        for (const interest of userData.interests) {
          const interestId = uuidv4();
          const interestStmt = db.prepare(`
            INSERT INTO interests (id, profile_id, name, category)
            VALUES (?, ?, ?, 'general')
          `);

          await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
        }

        // Grant a token
        const tokenId = uuidv4();
        const tokenStmt = db.prepare(`
          INSERT INTO mulligan_tokens (id, user_id, granted_at, source)
          VALUES (?, ?, ?, 'test_account')
        `);

        await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

        createdUsers.push(userData.name);
      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.name}:`, error.message);
      }
    }

    res.json({
      message: `Successfully created ${createdUsers.length} test user accounts`,
      createdUsers,
      total: testUsers.length
    });
  } catch (error) {
    console.error('Error creating test users:', error);
    res.status(500).json({ error: 'Failed to create test users' });
  }
});
