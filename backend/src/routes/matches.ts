import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { generateWeeklyMatches } from "../services/matching.js";
import { recordSuccessSignal } from "../utils/successTracking.js";
import { rateLimitAPI } from "../middleware/security.js";

export const matchesRouter = Router();

interface MatchRow {
  id: string;
  user1_id: string;
  user2_id: string;
  user1_token_id: string | null;
  user2_token_id: string | null;
  status: string;
  stage: string;
  created_at: string;
  stage1_at: string | null;
  stage2_at: string | null;
  expires_at: string | null;
}

interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  photo_url: string | null;
  looking_for: string | null;
}

// Get all matches for current user
matchesRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const matches = await (db
      .prepare(
        `SELECT m.*, 
                p1.display_name as user1_name, p1.age as user1_age, p1.bio as user1_bio, 
                p1.photo_url as user1_photo, p1.gender as user1_gender, p1.location as user1_location,
                p2.display_name as user2_name, p2.age as user2_age, p2.bio as user2_bio,
                p2.photo_url as user2_photo, p2.gender as user2_gender, p2.location as user2_location,
                u1.last_active_at as user1_last_active, u2.last_active_at as user2_last_active
         FROM matches m
         LEFT JOIN profiles p1 ON p1.user_id = m.user1_id
         LEFT JOIN profiles p2 ON p2.user_id = m.user2_id
         LEFT JOIN users u1 ON u1.id = m.user1_id
         LEFT JOIN users u2 ON u2.id = m.user2_id
         WHERE (m.user1_id = ? OR m.user2_id = ?)
         AND m.stage != 'expired'
         ORDER BY m.created_at DESC`
      )
      .all([userId, userId]) as Promise<any[]>);

    // Format matches with appropriate info based on stage
    const formattedMatches = await Promise.all(matches.map(async (m) => {
      const isUser1 = m.user1_id === userId;
      const otherUserId = isUser1 ? m.user2_id : m.user1_id;
      
      // Get profile ID first (needed for photos and interests)
      const otherProfileId = await (db
        .prepare("SELECT id FROM profiles WHERE user_id = ?")
        .get([otherUserId]) as Promise<{ id: string } | undefined>);

      // Get primary photo for the other user (from photos table or fallback to photo_url)
      let primaryPhotoUrl: string | null = null;
      if (otherProfileId) {
        // First try to get primary photo from photos table
        const primaryPhoto = await (db
          .prepare("SELECT url FROM photos WHERE profile_id = ? AND is_primary = 1 LIMIT 1")
          .get([otherProfileId.id]) as Promise<{ url: string } | undefined>);
        
        if (primaryPhoto) {
          primaryPhotoUrl = primaryPhoto.url;
        } else {
          // Fallback to photo_url from profiles table
          primaryPhotoUrl = isUser1 ? m.user2_photo : m.user1_photo;
        }
      }

      const otherUser = {
        userId: otherUserId,
        displayName: isUser1 ? m.user2_name : m.user1_name,
        age: isUser1 ? m.user2_age : m.user1_age,
        bio: isUser1 ? m.user2_bio : m.user1_bio,
        gender: isUser1 ? m.user2_gender : m.user1_gender,
        location: isUser1 ? m.user2_location : m.user1_location,
        // Show primary photo in stage1 and stage2 (all photos shown in stage2 via separate photos array)
        photoUrl: (m.stage === "stage1" || m.stage === "stage2") ? primaryPhotoUrl : null,
        last_active_at: isUser1 ? m.user2_last_active : m.user1_last_active,
      };

      const interests = otherProfileId
        ? await (db
            .prepare("SELECT name FROM interests WHERE profile_id = ?")
            .all([otherProfileId.id]) as Promise<{ name: string }[]>)
        : [];

      // Get values and partner qualities for the other user
      const preferences = otherProfileId
        ? await (db
            .prepare('SELECT "values" FROM preferences WHERE profile_id = ?')
            .get([otherProfileId.id]) as Promise<{ values: string | null } | undefined>)
        : undefined;

      const partnerQualities = otherProfileId
        ? await (db
            .prepare(
              "SELECT quality, importance FROM partner_qualities WHERE profile_id = ?"
            )
            .all([otherProfileId.id]) as Promise<{ quality: string; importance: number }[]>)
        : [];

      let values: string[] = [];
      if (preferences?.values) {
        try {
          values = JSON.parse(preferences.values);
        } catch {
          values = [];
        }
      }

      return {
        id: m.id,
        stage: m.stage,
        status: m.status,
        createdAt: m.created_at,
        stage1At: m.stage1_at,
        stage2At: m.stage2_at,
        expiresAt: m.expires_at || null,
        isInitiator: isUser1,
        userWantsReveal: m.userWantsReveal === 1,
        otherWantsReveal: m.otherWantsReveal === 1,
        otherUser: {
          ...otherUser,
          profileId: otherProfileId?.id,
          interests: interests.map((i) => i.name),
          values,
          partnerQualities: partnerQualities.map((q) => ({
            quality: q.quality,
            importance: q.importance,
          })),
          lastActiveAt: otherUser.last_active_at || null,
        },
      };
    }));

    res.json({ matches: formattedMatches });
  } catch (error) {
    console.error('Matches GET error:', error);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// Send a match request (use a token) - AUTOMATIC MATCH
matchesRouter.post("/connect", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { targetUserId } = req.body;

  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: "Target user ID required" });
  }
  
  // Validate UUID format (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(targetUserId)) {
    return res.status(400).json({ error: "Invalid user ID format" });
  }

  if (targetUserId === userId) {
    return res.status(400).json({ error: "Cannot match with yourself" });
  }

  try {
    // Check if already matched (but allow re-matching if match is expired)
    const existingMatchResult = db
      .prepare(
        `SELECT * FROM matches 
         WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
         AND stage != 'expired'`
      )
      .get([userId, targetUserId, targetUserId, userId]);
    const existingMatch = (existingMatchResult instanceof Promise
      ? await existingMatchResult
      : existingMatchResult) as MatchRow | undefined;

    // Only block if there's an active (non-expired) match
    // Users can still match again if the previous match expired
    if (existingMatch && existingMatch.stage !== 'expired') {
      return res.status(400).json({ 
        error: "Already matched with this user",
        matchId: existingMatch.id,
        note: "You can chat with them in your Matches section"
      });
    }

    // Check if user has at least 1 photo uploaded
    const userProfileResult = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]);
    const userProfile = (userProfileResult instanceof Promise
      ? await userProfileResult
      : userProfileResult) as { id: string } | undefined;

    if (!userProfile) {
      return res.status(400).json({ error: "Please complete your profile first" });
    }

    const userPhotoCountResult = db
      .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
      .get([userProfile.id]);
    const userPhotoCount = (userPhotoCountResult instanceof Promise
      ? await userPhotoCountResult
      : userPhotoCountResult) as { count: number } | undefined;

    if (!userPhotoCount || userPhotoCount.count < 1) {
      return res.status(400).json({ 
        error: "You need at least 1 photo uploaded to use a mulligan token",
        photoCount: userPhotoCount?.count || 0,
        required: 1
      });
    }

    // Check if target user has at least 1 photo uploaded
    const targetProfileResult = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([targetUserId]);
    const targetProfile = (targetProfileResult instanceof Promise
      ? await targetProfileResult
      : targetProfileResult) as { id: string } | undefined;

    if (!targetProfile) {
      return res.status(400).json({ error: "Target user profile not found" });
    }

    const targetPhotoCountResult = db
      .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
      .get([targetProfile.id]);
    const targetPhotoCount = (targetPhotoCountResult instanceof Promise
      ? await targetPhotoCountResult
      : targetPhotoCountResult) as { count: number } | undefined;

    if (!targetPhotoCount || targetPhotoCount.count < 1) {
      return res.status(400).json({ 
        error: "This user needs to upload at least 1 photo before you can match with them",
        photoCount: targetPhotoCount?.count || 0,
        required: 1
      });
    }

    // Get available token
    const tokenResult = db
      .prepare(
        `SELECT * FROM mulligan_tokens 
         WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL
         ORDER BY granted_at ASC LIMIT 1`
      )
      .get([userId]);
    const token = (tokenResult instanceof Promise
      ? await tokenResult
      : tokenResult) as any;

    if (!token) {
      return res.status(400).json({ error: "No tokens available. Claim your weekly token!" });
    }

    // AUTOMATIC MATCH: Create mutual match immediately in stage1 (no pending state)
    const matchId = uuidv4();
    const sevenDaysFromNow = new Date();
    // Add 7 days, but set time to end of day (23:59:59) to ensure we get exactly 7 days
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    sevenDaysFromNow.setHours(23, 59, 59, 999);

    // Create match directly in stage1 (mutual match, chat available immediately)
    const insertMatchResult = db.prepare(
      `INSERT INTO matches (id, user1_id, user2_id, user1_token_id, status, stage, stage1_at, expires_at)
       VALUES (?, ?, ?, ?, 'mutual', 'stage1', CURRENT_TIMESTAMP, ?)`
    ).run([matchId, userId, targetUserId, token.id, sevenDaysFromNow.toISOString()]);
    if (insertMatchResult instanceof Promise) {
      await insertMatchResult;
    }

    // Use the token
    const updateTokenResult = db.prepare(
      `UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?`
    ).run([matchId, token.id]);
    if (updateTokenResult instanceof Promise) {
      await updateTokenResult;
    }

    // Track success signal: match created (both users connected)
    // These are saved to PostgreSQL and persist forever
    await recordSuccessSignal(userId, targetUserId, matchId, "match_created");
    await recordSuccessSignal(targetUserId, userId, matchId, "match_created");

    res.json({
      message: "It's a match! You can now chat.",
      matchId,
      stage: "stage1",
      isMutual: true,
    });
  } catch (error) {
    console.error("Connect error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Connect error stack:", error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: `Failed to connect: ${errorMessage}` });
  }
});

// Request to reveal photos (manual override - auto-reveal happens after 2 messages each)
// This endpoint is kept for manual override if needed, but reveal is now automatic
matchesRouter.post("/:matchId/reveal", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { matchId } = req.params;

  const match = db
    .prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)`
    )
    .get(matchId, userId, userId) as MatchRow | undefined;

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  if (match.stage !== "stage1") {
    return res.status(400).json({ 
      error: "Match must be in stage 1 to manually reveal",
      note: "Photos automatically reveal when both users send 2+ messages each"
    });
  }

  // Manual reveal - immediately advance to stage2
  db.prepare(
    `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(matchId);

  // Track success signal: stage advanced (strong engagement)
  // Saved to PostgreSQL database - persists across logouts/redeploys
  const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
  await recordSuccessSignal(userId, otherUserId, matchId, "stage_advanced");
  await recordSuccessSignal(otherUserId, userId, matchId, "stage_advanced");

  res.json({ 
    message: "Photos revealed manually! You can now see each other.", 
    stage: "stage2",
    manualReveal: true
  });
});

// Get messages for a match
matchesRouter.get("/:matchId/messages", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { matchId } = req.params;

  // Verify user is part of this match
  const match = db
    .prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    )
    .get(matchId, userId, userId) as MatchRow | undefined;

  if (!match) {
    return res.status(404).json({ error: "Match not found or not yet mutual" });
  }

  const messages = db
    .prepare(
      `SELECT m.*, p.display_name as sender_name
       FROM messages m
       JOIN profiles p ON p.user_id = m.sender_id
       WHERE m.match_id = ?
       ORDER BY m.sent_at ASC`
    )
    .all(matchId) as any[];

  // Mark messages as read
  db.prepare(
    `UPDATE messages SET read_at = CURRENT_TIMESTAMP 
     WHERE match_id = ? AND sender_id != ? AND read_at IS NULL`
  ).run(matchId, userId);

  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.sender_id,
      senderName: m.sender_name,
      sentAt: m.sent_at,
      readAt: m.read_at || null,
      isOwn: m.sender_id === userId,
    })),
  });
});

// Send a message
matchesRouter.post("/:matchId/messages", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { matchId } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: "Message content required" });
  }
  
  // Sanitize and validate message content
  const { sanitizeText } = await import('../middleware/security.js');
  const sanitizedContent = sanitizeText(content.trim(), 1000); // Max 1000 characters per message
  
  if (sanitizedContent.length === 0) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }
  
  if (sanitizedContent.length > 1000) {
    return res.status(400).json({ error: "Message must be at most 1000 characters" });
  }

  // Verify user is part of this match and it's mutual
  const match = db
    .prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    )
    .get(matchId, userId, userId) as MatchRow | undefined;

  if (!match) {
    return res.status(404).json({ error: "Match not found or not yet mutual" });
  }

  const messageId = uuidv4();
  db.prepare(
    `INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`
  ).run(messageId, matchId, userId, sanitizedContent);

  // Check if we should auto-advance to stage2 (both users sent at least 2 messages, alternating)
  let autoAdvanced = false;
  if (match.stage === "stage1") {
    // Get all messages in chronological order
    const allMessages = db
      .prepare(`SELECT sender_id, sent_at FROM messages WHERE match_id = ? ORDER BY sent_at ASC`)
      .all(matchId) as Array<{ sender_id: string; sent_at: string }>;

    // Count valid messages (only count if previous message was from the other user)
    let user1ValidCount = 0;
    let user2ValidCount = 0;
    
    for (let i = 0; i < allMessages.length; i++) {
      const currentMessage = allMessages[i];
      const isUser1 = currentMessage.sender_id === match.user1_id;
      
      if (i === 0) {
        // First message always counts (it starts the conversation)
        if (isUser1) user1ValidCount++;
        else user2ValidCount++;
      } else {
        // Subsequent messages only count if the previous message was from the other user
        const previousMessage = allMessages[i - 1];
        const previousWasUser1 = previousMessage.sender_id === match.user1_id;
        
        if (isUser1 && !previousWasUser1) {
          // User1 replied to User2
          user1ValidCount++;
        } else if (!isUser1 && previousWasUser1) {
          // User2 replied to User1
          user2ValidCount++;
        }
        // If same user sent consecutive messages, don't count the second one
      }
    }

    // Both users need to have sent at least 2 valid messages (alternating)
    if (user1ValidCount >= 2 && user2ValidCount >= 2) {
      // Auto-advance to stage2
      db.prepare(
        `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(matchId);
      autoAdvanced = true;
      
      // Emit socket event to notify both users
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('stage_advanced', {
          matchId,
          stage: 'stage2',
          message: '🎉 You\'ve both sent 2+ messages! All photos are now revealed!',
          autoAdvanced: true,
        });
      }
    }
  }

  res.json({
    message: {
      id: messageId,
      content: sanitizedContent,
      senderId: userId,
      sentAt: new Date().toISOString(),
      isOwn: true,
    },
    autoAdvanced,
    stage: autoAdvanced ? "stage2" : match.stage,
  });
});

// Check if user has pending match from someone
matchesRouter.get("/pending-from/:userId", authenticateToken, (req: AuthRequest, res) => {
  const currentUserId = req.userId!;
  const { userId: otherUserId } = req.params;

  const pendingMatch = db
    .prepare(
      `SELECT * FROM matches 
       WHERE user1_id = ? AND user2_id = ? AND stage = 'pending'`
    )
    .get(otherUserId, currentUserId) as MatchRow | undefined;

  res.json({ hasPendingMatch: !!pendingMatch, matchId: pendingMatch?.id });
});

// Unmatch with someone
matchesRouter.delete("/:matchId", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { matchId } = req.params;

  // Verify user is part of this match
  const match = db
    .prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)`
    )
    .get(matchId, userId, userId) as MatchRow | undefined;

  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }

  // Mark match as expired (soft delete)
  db.prepare(`UPDATE matches SET stage = 'expired' WHERE id = ?`).run(matchId);

  // Return tokens if they were used (optional - you might want to keep tokens used)
  // For now, we'll just expire the match

  res.json({ message: "Match removed successfully" });
});

// Generate weekly matches for current user
matchesRouter.post("/generate", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  
  try {
    const result = await generateWeeklyMatches(userId);
    res.json({
      message: `Generated ${result.matchesCreated} weekly match(es)`,
      matchesCreated: result.matchesCreated,
      matchIds: result.matches,
    });
  } catch (error) {
    console.error("Error generating matches:", error);
    res.status(500).json({ error: "Failed to generate matches" });
  }
});

