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

// Create unique test users (with random phone numbers) - Admin only
adminRouter.post('/create-unique-test-users', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const testUsersTemplate = [
      { name: 'Alex', age: 28, gender: 'Male', location: 'San Francisco, CA', bio: 'Love hiking, coffee, and good conversations.', lookingFor: 'Long-term relationship', interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'] },
      { name: 'Jordan', age: 26, gender: 'Female', location: 'Los Angeles, CA', bio: 'Foodie, bookworm, and adventure seeker.', lookingFor: 'Friendship or more', interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'] },
      { name: 'Sam', age: 30, gender: 'Non-binary', location: 'New York, NY', bio: 'Artist, musician, and creative soul.', lookingFor: 'Meaningful connection', interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'] },
      { name: 'Taylor', age: 25, gender: 'Female', location: 'Austin, TX', bio: 'Tech enthusiast, dog lover, and weekend explorer.', lookingFor: 'Long-term relationship', interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'] },
      { name: 'Casey', age: 29, gender: 'Male', location: 'Seattle, WA', bio: 'Coffee snob, music producer, and nature enthusiast.', lookingFor: 'Serious relationship', interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'] }
    ];

    const timestamp = Date.now();
    const createdUsers: string[] = [];

    for (let i = 0; i < testUsersTemplate.length; i++) {
      const userData = testUsersTemplate[i];
      // Generate unique phone number using timestamp + index + random
      const phone = `+1555${String(timestamp).slice(-6)}${String(i).padStart(2, '0')}${Math.floor(Math.random() * 10)}`;

      try {
        const userId = uuidv4();
        const profileId = uuidv4();
        const now = new Date().toISOString();

        // Check if phone already exists (unlikely but check anyway)
        const existingUserStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
        const existingUser = await (existingUserStmt.get([phone]) as Promise<{ id: string } | undefined>);
        if (existingUser) {
          // If exists, try again with different random suffix
          const newPhone = `+1555${String(Date.now()).slice(-6)}${String(i).padStart(2, '0')}${Math.floor(Math.random() * 100)}`;
          continue; // Skip this iteration and try next
        }

        // Create user
        const userStmt = db.prepare(`
          INSERT INTO users (
            id, email, phone_number, phone_verified, password, browse_unlocked_at, 
            tos_accepted_at, privacy_accepted_at, created_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await (userStmt.run([userId, null, phone, 1, '', now, now, now, now, now]) as Promise<any>);

        // Create profile
        const profileStmt = db.prepare(`
          INSERT INTO profiles (
            id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await (profileStmt.run([
          profileId, userId, userData.name, userData.age, userData.gender,
          userData.location, userData.bio, userData.lookingFor, now, now
        ]) as Promise<any>);

        // Create preferences
        const preferencesId = uuidv4();
        const preferencesStmt = db.prepare(`
          INSERT INTO preferences (
            id, profile_id, min_age, max_age, preferred_genders, max_distance
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        await (preferencesStmt.run([
          preferencesId, profileId, 18, 99, JSON.stringify(['Male', 'Female', 'Non-binary']), 10000
        ]) as Promise<any>);

        // Create interests
        for (const interest of userData.interests) {
          const interestId = uuidv4();
          const interestStmt = db.prepare(`INSERT INTO interests (id, profile_id, name, category) VALUES (?, ?, ?, 'general')`);
          await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
        }

        // Grant a token
        const tokenId = uuidv4();
        const tokenStmt = db.prepare(`INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, 'test_account')`);
        await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

        createdUsers.push(userData.name);
      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.name}:`, error.message);
      }
    }

    res.json({
      message: `Successfully created ${createdUsers.length} unique test user accounts`,
      createdUsers,
      total: testUsersTemplate.length
    });
  } catch (error: any) {
    console.error('Error creating unique test users:', error);
    res.status(500).json({ error: 'Failed to create unique test users', details: error.message });
  }
});

// Get admin statistics
adminRouter.get('/stats', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Total users
    const totalUsersResult = await (db.prepare('SELECT COUNT(*) as count FROM users').get([]) as Promise<{ count: number }>);
    const totalUsers = totalUsersResult?.count || 0;

    // Total profiles
    const totalProfilesResult = await (db.prepare('SELECT COUNT(*) as count FROM profiles').get([]) as Promise<{ count: number }>);
    const totalProfiles = totalProfilesResult?.count || 0;

    // Total matches
    const totalMatchesResult = await (db.prepare('SELECT COUNT(*) as count FROM matches WHERE stage != ?').get(['expired']) as Promise<{ count: number }>);
    const totalMatches = totalMatchesResult?.count || 0;

    // Restricted users
    const restrictedUsersResult = await (db.prepare('SELECT COUNT(*) as count FROM users WHERE is_restricted = 1').get([]) as Promise<{ count: number }>);
    const restrictedUsers = restrictedUsersResult?.count || 0;

    // Active users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsersResult = await (db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM mulligan_tokens WHERE granted_at >= ?').get([sevenDaysAgo.toISOString()]) as Promise<{ count: number }>);
    const activeUsers = activeUsersResult?.count || 0;

    res.json({
      totalUsers,
      totalProfiles,
      totalMatches,
      restrictedUsers,
      activeUsers
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
  }
});

// List users with pagination and search
adminRouter.get('/users', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string || '';

    let query = `
      SELECT 
        u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, 
        u.created_at, u.last_active_at,
        p.display_name, p.age, p.gender, p.location,
        COUNT(DISTINCT mt.id) as tokenCount
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN mulligan_tokens mt ON mt.user_id = u.id AND mt.used_at IS NULL AND mt.returned_at IS NULL
    `;

    const params: any[] = [];

    if (search) {
      query += ` WHERE (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // PostgreSQL requires all non-aggregated columns in GROUP BY
    query += ` GROUP BY u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, 
        u.created_at, u.last_active_at, p.display_name, p.age, p.gender, p.location
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);
    
    // Get total count for pagination
    let countQuery = 'SELECT COUNT(DISTINCT u.id) as count FROM users u';
    if (search) {
      countQuery += ` LEFT JOIN profiles p ON p.user_id = u.id WHERE (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ?)`;
    }
    const countParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
    const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number }>);
    const total = totalResult?.count || 0;

    const users = usersResult.map((u: any) => ({
      id: u.id,
      email: u.email || u.phone_number || 'N/A',
      phoneNumber: u.phone_number,
      display_name: u.display_name,
      age: u.age,
      gender: u.gender,
      location: u.location,
      is_admin: u.is_admin === 1,
      is_restricted: u.is_restricted === 1,
      created_at: u.created_at,
      last_active_at: u.last_active_at,
      tokenCount: parseInt(u.tokenCount) || 0
    }));

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Get user details
adminRouter.get('/users/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;

    // Get user
    const userResult = await (db.prepare('SELECT * FROM users WHERE id = ?').get([userId]) as Promise<any>);
    if (!userResult) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get profile
    const profileResult = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([userId]) as Promise<any>);

    // Get token count
    const tokensResult = await (db.prepare(`
      SELECT * FROM mulligan_tokens 
      WHERE user_id = ? 
      ORDER BY granted_at DESC
    `).all([userId]) as Promise<any[]>);
    const tokenCount = tokensResult.filter((t: any) => !t.used_at && !t.returned_at).length;

    // Get matches count
    const matchesResult = await (db.prepare('SELECT COUNT(*) as count FROM matches WHERE (user1_id = ? OR user2_id = ?) AND stage != ?').get([userId, userId, 'expired']) as Promise<{ count: number }>);
    const matches = matchesResult?.count || 0;

    // Get blocks count
    const blocksResult = await (db.prepare('SELECT COUNT(*) as count FROM blocks WHERE blocker_id = ?').get([userId]) as Promise<{ count: number }>);
    const blocks = blocksResult?.count || 0;

    res.json({
      id: userResult.id,
      email: userResult.email || userResult.phone_number || 'N/A',
      phoneNumber: userResult.phone_number,
      is_admin: userResult.is_admin === 1,
      is_restricted: userResult.is_restricted === 1,
      created_at: userResult.created_at,
      last_active_at: userResult.last_active_at,
      profile: profileResult || null,
      tokenCount,
      tokens: tokensResult,
      matches,
      blocks
    });
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details', details: error.message });
  }
});

// Restrict/unrestrict user
adminRouter.post('/users/:id/restrict', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const { restricted } = req.body;

    if (typeof restricted !== 'boolean') {
      return res.status(400).json({ error: 'restricted must be a boolean' });
    }

    await (db.prepare('UPDATE users SET is_restricted = ? WHERE id = ?').run([restricted ? 1 : 0, userId]) as Promise<any>);

    res.json({
      message: `User ${restricted ? 'restricted' : 'unrestricted'} successfully`,
      userId,
      restricted
    });
  } catch (error: any) {
    console.error('Error restricting user:', error);
    res.status(500).json({ error: 'Failed to update user restriction', details: error.message });
  }
});

// Grant tokens to user
adminRouter.post('/users/:id/grant-tokens', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const { count } = req.body;

    const tokenCount = parseInt(count) || 1;
    if (tokenCount < 1 || tokenCount > 100) {
      return res.status(400).json({ error: 'Token count must be between 1 and 100' });
    }

    const now = new Date().toISOString();
    let tokensGranted = 0;

    for (let i = 0; i < tokenCount; i++) {
      const tokenId = uuidv4();
      const tokenStmt = db.prepare('INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, ?)');
      await (tokenStmt.run([tokenId, userId, now, 'admin_grant']) as Promise<any>);
      tokensGranted++;
    }

    res.json({
      message: `Granted ${tokensGranted} token(s)`,
      tokensGranted
    });
  } catch (error: any) {
    console.error('Error granting tokens:', error);
    res.status(500).json({ error: 'Failed to grant tokens', details: error.message });
  }
});

// Set admin status
adminRouter.post('/users/:id/set-admin', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const { isAdmin } = req.body;

    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isAdmin must be a boolean' });
    }

    await (db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run([isAdmin ? 1 : 0, userId]) as Promise<any>);

    res.json({
      message: `Admin status ${isAdmin ? 'granted' : 'removed'}`,
      userId,
      isAdmin
    });
  } catch (error: any) {
    console.error('Error setting admin status:', error);
    res.status(500).json({ error: 'Failed to update admin status', details: error.message });
  }
});

// Get user messages
adminRouter.get('/users/:id/messages', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const messagesResult = await (db.prepare(`
      SELECT 
        m.id, m.content, m.sent_at, m.read_at, m.match_id,
        u1.id as sender_id, p1.display_name as sender_name,
        u2.id as other_user_id, p2.display_name as other_user_name,
        CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_from_target_user
      FROM messages m
      LEFT JOIN matches ma ON ma.id = m.match_id
      LEFT JOIN users u1 ON u1.id = m.sender_id
      LEFT JOIN profiles p1 ON p1.user_id = m.sender_id
      LEFT JOIN users u2 ON u2.id = CASE WHEN m.sender_id = ma.user1_id THEN ma.user2_id ELSE ma.user1_id END
      LEFT JOIN profiles p2 ON p2.user_id = u2.id
      WHERE ma.user1_id = ? OR ma.user2_id = ?
      ORDER BY m.sent_at DESC
      LIMIT ?
    `).all([userId, userId, userId, limit]) as Promise<any[]>);

    const messages = messagesResult.map((m: any) => ({
      id: m.id,
      content: m.content,
      senderId: m.sender_id,
      senderName: m.sender_name || 'Unknown',
      otherUserName: m.other_user_name || 'Unknown',
      matchId: m.match_id,
      sentAt: m.sent_at,
      readAt: m.read_at,
      isFromTargetUser: m.is_from_target_user === 1
    }));

    res.json({
      messages,
      total: messages.length
    });
  } catch (error: any) {
    console.error('Error fetching user messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});
