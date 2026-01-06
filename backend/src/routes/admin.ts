import { Router } from "express";
import { authenticateToken, requireAdmin, AuthRequest } from "../middleware/auth.js";
import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";

export const adminRouter = Router();

// Special endpoint to make first user admin (one-time setup, no auth required)
// Only works if no admin users exist yet
adminRouter.post("/setup-first-admin", (req, res) => {
  try {
    // Check if any admin exists
    const existingAdmin = db.prepare("SELECT id FROM users WHERE is_admin = 1 LIMIT 1").get() as { id: string } | undefined;
    
    if (existingAdmin) {
      return res.status(403).json({ error: "An admin already exists. Use the admin panel to create more admins." });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Find user by email
    const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email) as { id: string; email: string } | undefined;
    
    if (!user) {
      return res.status(404).json({ error: "User not found with that email" });
    }

    // Make them admin
    db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(user.id);
    
    res.json({ 
      success: true, 
      message: `User ${email} has been granted admin access`,
      userId: user.id
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to set up admin", details: error instanceof Error ? error.message : String(error) });
  }
});

// All other admin routes require authentication and admin role
adminRouter.use(authenticateToken);
adminRouter.use(requireAdmin);

// Get all users with pagination
adminRouter.get("/users", (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;
  const search = req.query.search as string || "";

  let query = `
    SELECT u.id, u.email, u.is_admin, u.is_restricted, u.created_at, u.last_active_at,
           p.display_name, p.age, p.gender, p.location
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    query += ` AND (u.email LIKE ? OR p.display_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const users = db.prepare(query).all(...params) as any[];

  // Get total count
  let countQuery = `SELECT COUNT(*) as total FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE 1=1`;
  const countParams: any[] = [];
  if (search) {
    countQuery += ` AND (u.email LIKE ? OR p.display_name LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  const total = db.prepare(countQuery).get(...countParams) as { total: number };

  // Get token counts for each user
  const usersWithTokens = users.map((user) => {
    const tokenCount = db
      .prepare(
        `SELECT COUNT(*) as count FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL`
      )
      .get(user.id) as { count: number };
    
    return {
      ...user,
      is_admin: user.is_admin === 1,
      is_restricted: user.is_restricted === 1,
      tokenCount: tokenCount.count,
    };
  });

  res.json({
    users: usersWithTokens,
    pagination: {
      page,
      limit,
      total: total.total,
      totalPages: Math.ceil(total.total / limit),
    },
  });
});

// Get user details
adminRouter.get("/users/:userId", (req: AuthRequest, res) => {
  const { userId } = req.params;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as any;
  const tokens = db
    .prepare("SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC")
    .all(userId) as any[];
  const matches = db
    .prepare(
      `SELECT * FROM matches WHERE (user1_id = ? OR user2_id = ?) AND stage != 'expired' ORDER BY created_at DESC`
    )
    .all(userId, userId) as any[];
  const blocks = db
    .prepare("SELECT * FROM blocks WHERE blocker_id = ? OR blocked_id = ?")
    .all(userId, userId) as any[];

  const tokenCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL`
    )
    .get(userId) as { count: number } | undefined;

  res.json({
    ...user,
    is_admin: user.is_admin === 1,
    is_restricted: user.is_restricted === 1,
    profile,
    tokens: tokens.map((t) => ({
      ...t,
      isUsed: !!t.used_at,
      isReturned: !!t.returned_at,
    })),
    matches: matches.length,
    blocks: blocks.length,
    tokenCount: tokenCount?.count || 0,
  });
});

// Restrict/unrestrict a user
adminRouter.post("/users/:userId/restrict", (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { restricted } = req.body;

  if (typeof restricted !== "boolean") {
    return res.status(400).json({ error: "restricted must be a boolean" });
  }

  // Can't restrict yourself
  if (userId === req.userId) {
    return res.status(400).json({ error: "Cannot restrict your own account" });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  db.prepare("UPDATE users SET is_restricted = ? WHERE id = ?").run(restricted ? 1 : 0, userId);

  res.json({
    message: restricted ? "User restricted successfully" : "User unrestricted successfully",
    userId,
    restricted,
  });
});

// Grant tokens to a specific user
adminRouter.post("/users/:userId/grant-tokens", (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { count } = req.body;

  const tokenCount = parseInt(count) || 1;
  if (tokenCount < 1 || tokenCount > 10) {
    return res.status(400).json({ error: "Token count must be between 1 and 10" });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check current token count
  const currentTokens = db
    .prepare(
      `SELECT COUNT(*) as count FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL`
    )
    .get(userId) as { count: number };

  // Don't grant if user already has 3+ tokens (respect max limit)
  if (currentTokens.count >= 3) {
    return res.status(400).json({
      error: `User already has ${currentTokens.count} tokens. Maximum is 3.`,
    });
  }

  const grantedTokenIds: string[] = [];
  const tokensToGrant = Math.min(tokenCount, 3 - currentTokens.count);

  for (let i = 0; i < tokensToGrant; i++) {
    const tokenId = uuidv4();
    db.prepare(
      `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'admin')`
    ).run(tokenId, userId);
    grantedTokenIds.push(tokenId);
  }

  res.json({
    message: `Granted ${tokensToGrant} token${tokensToGrant > 1 ? "s" : ""} to user`,
    userId,
    tokensGranted: tokensToGrant,
    tokenIds: grantedTokenIds,
  });
});

// Make a user an admin (or remove admin status)
// Only pelagiotl@gmail.com can perform this action
adminRouter.post("/users/:userId/set-admin", (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { isAdmin } = req.body;

  // Check if current user is the super admin
  const currentUser = db.prepare("SELECT email FROM users WHERE id = ?").get(req.userId) as { email: string } | undefined;
  
  if (!currentUser || currentUser.email !== "pelagiotl@gmail.com") {
    return res.status(403).json({ 
      error: "Only the super admin can grant or remove admin access" 
    });
  }

  if (typeof isAdmin !== "boolean") {
    return res.status(400).json({ error: "isAdmin must be a boolean" });
  }

  // Can't change your own admin status
  if (userId === req.userId) {
    return res.status(400).json({ error: "Cannot change your own admin status" });
  }

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, userId);

  res.json({
    message: isAdmin ? "User granted admin access" : "User admin access removed",
    userId,
    isAdmin,
  });
});

// Get messages for a specific user (admin view)
adminRouter.get("/users/:userId/messages", (req: AuthRequest, res) => {
  const { userId } = req.params;
  const { matchId, limit } = req.query;

  // Verify user exists
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId) as { id: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  let query = `
    SELECT m.*, 
           p.display_name as sender_name,
           p2.display_name as other_user_name,
           match.user1_id,
           match.user2_id
    FROM messages m
    JOIN profiles p ON p.user_id = m.sender_id
    JOIN matches match ON match.id = m.match_id
    LEFT JOIN profiles p2 ON p2.user_id = CASE 
      WHEN match.user1_id = m.sender_id THEN match.user2_id 
      ELSE match.user1_id 
    END
    WHERE m.sender_id = ? OR match.user1_id = ? OR match.user2_id = ?
  `;
  const params: any[] = [userId, userId, userId];

  if (matchId) {
    query += ` AND m.match_id = ?`;
    params.push(matchId);
  }

  query += ` ORDER BY m.sent_at DESC`;
  
  if (limit) {
    const limitNum = parseInt(limit as string) || 100;
    query += ` LIMIT ?`;
    params.push(limitNum);
  } else {
    query += ` LIMIT 100`;
  }

  try {
    const messages = db.prepare(query).all(...params) as any[];

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.sender_id,
        senderName: m.sender_name || 'Unknown',
        otherUserName: m.other_user_name || null,
        matchId: m.match_id,
        sentAt: m.sent_at,
        readAt: m.read_at || null,
        isFromTargetUser: m.sender_id === userId,
      })),
      total: messages.length,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error instanceof Error ? error.message : String(error) });
  }
});

// Get messages for a specific match (admin view)
adminRouter.get("/matches/:matchId/messages", (req: AuthRequest, res) => {
  const { matchId } = req.params;

  // Verify match exists
  const match = db.prepare("SELECT * FROM matches WHERE id = ?").get(matchId) as any;
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  const messages = db
    .prepare(
      `SELECT m.*, 
              p1.display_name as sender_name,
              p1.user_id as sender_user_id
       FROM messages m
       JOIN profiles p1 ON p1.user_id = m.sender_id
       WHERE m.match_id = ?
       ORDER BY m.sent_at ASC`
    )
    .all(matchId) as any[];

  // Get user info for both users in the match
  const user1 = db.prepare("SELECT email FROM users WHERE id = ?").get(match.user1_id) as { email: string } | undefined;
  const user2 = db.prepare("SELECT email FROM users WHERE id = ?").get(match.user2_id) as { email: string } | undefined;
  const profile1 = db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(match.user1_id) as { display_name: string } | undefined;
  const profile2 = db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(match.user2_id) as { display_name: string } | undefined;

  res.json({
    match: {
      id: match.id,
      stage: match.stage,
      createdAt: match.created_at,
      user1: {
        id: match.user1_id,
        email: user1?.email,
        displayName: profile1?.display_name,
      },
      user2: {
        id: match.user2_id,
        email: user2?.email,
        displayName: profile2?.display_name,
      },
    },
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.sender_user_id,
      senderName: m.sender_name,
      sentAt: m.sent_at,
      readAt: m.read_at || null,
    })),
    total: messages.length,
  });
});

// Get admin stats
adminRouter.get("/stats", (req: AuthRequest, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  const totalProfiles = db.prepare("SELECT COUNT(*) as count FROM profiles").get() as { count: number };
  const totalMatches = db
    .prepare("SELECT COUNT(*) as count FROM matches WHERE stage != 'expired'")
    .get() as { count: number };
  const restrictedUsers = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE is_restricted = 1")
    .get() as { count: number };
  const activeUsers = db
    .prepare(
      "SELECT COUNT(*) as count FROM users WHERE last_active_at > datetime('now', '-7 days')"
    )
    .get() as { count: number };

  res.json({
    totalUsers: totalUsers.count,
    totalProfiles: totalProfiles.count,
    totalMatches: totalMatches.count,
    restrictedUsers: restrictedUsers.count,
    activeUsers: activeUsers.count,
  });
});

