import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { generateWeeklyMatches, generateMatchExplanation } from "../services/matching.js";
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

    const matchesResult = db
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
      .all([userId, userId]);
    const matches = (matchesResult instanceof Promise
      ? await matchesResult
      : matchesResult) as any[];

    console.log(`📊 Matches query returned ${matches.length} matches for user ${userId}`);

    // Format matches with appropriate info based on stage
    const formattedMatches = await Promise.all(matches.map(async (m) => {
      const isUser1 = m.user1_id === userId;
      const otherUserId = isUser1 ? m.user2_id : m.user1_id;
      
      // Get profile ID first (needed for photos and interests)
      const otherProfileIdResult = db
        .prepare("SELECT id FROM profiles WHERE user_id = ?")
        .get([otherUserId]);
      const otherProfileId = (otherProfileIdResult instanceof Promise
        ? await otherProfileIdResult
        : otherProfileIdResult) as { id: string } | undefined;

      // Get primary photo for the other user (from photos table or fallback to photo_url)
      let primaryPhotoUrl: string | null = null;
      if (otherProfileId) {
        // First try to get primary photo from photos table
        const primaryPhotoResult = db
          .prepare("SELECT url FROM photos WHERE profile_id = ? AND is_primary = 1 LIMIT 1")
          .get([otherProfileId.id]);
        const primaryPhoto = (primaryPhotoResult instanceof Promise
          ? await primaryPhotoResult
          : primaryPhotoResult) as { url: string } | undefined;
        
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

      const interestsResult = otherProfileId
        ? db
            .prepare("SELECT name FROM interests WHERE profile_id = ?")
            .all([otherProfileId.id])
        : [];
      const interests = (interestsResult instanceof Promise
        ? await interestsResult
        : interestsResult) as { name: string }[];

      // Get values and partner qualities for the other user
      const preferencesResult = otherProfileId
        ? db
            .prepare('SELECT "values" FROM preferences WHERE profile_id = ?')
            .get([otherProfileId.id])
        : undefined;
      const preferences = (preferencesResult instanceof Promise
        ? await preferencesResult
        : preferencesResult) as { values: string | null } | undefined;

      const partnerQualitiesResult = otherProfileId
        ? db
            .prepare(
              "SELECT quality, importance FROM partner_qualities WHERE profile_id = ?"
            )
            .all([otherProfileId.id])
        : [];
      const partnerQualities = (partnerQualitiesResult instanceof Promise
        ? await partnerQualitiesResult
        : partnerQualitiesResult) as { quality: string; importance: number }[];

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

    console.log(`✅ Returning ${formattedMatches.length} formatted matches to user ${userId}`);
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

    // Photo requirement temporarily removed - will be added back later
    // const userPhotoCountResult = db
    //   .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
    //   .get([userProfile.id]);
    // const userPhotoCount = (userPhotoCountResult instanceof Promise
    //   ? await userPhotoCountResult
    //   : userPhotoCountResult) as { count: number } | undefined;

    // if (!userPhotoCount || userPhotoCount.count < 1) {
    //   return res.status(400).json({ 
    //     error: "You need at least 1 photo uploaded to use a mulligan token",
    //     photoCount: userPhotoCount?.count || 0,
    //     required: 1
    //   });
    // }

    // Check if target user profile exists
    const targetProfileResult = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([targetUserId]);
    const targetProfile = (targetProfileResult instanceof Promise
      ? await targetProfileResult
      : targetProfileResult) as { id: string } | undefined;

    if (!targetProfile) {
      return res.status(400).json({ error: "Target user profile not found" });
    }

    // Photo requirement temporarily removed - will be added back later
    // const targetPhotoCountResult = db
    //   .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
    //   .get([targetProfile.id]);
    // const targetPhotoCount = (targetPhotoCountResult instanceof Promise
    //   ? await targetPhotoCountResult
    //   : targetPhotoCountResult) as { count: number } | undefined;

    // if (!targetPhotoCount || targetPhotoCount.count < 1) {
    //   return res.status(400).json({ 
    //     error: "This user needs to upload at least 1 photo before you can match with them",
    //     photoCount: targetPhotoCount?.count || 0,
    //     required: 1
    //   });
    // }

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
      // Check if user can claim weekly tokens
      const allTokensResult = db
        .prepare(
          `SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`
        )
        .all([userId]);
      const allTokens = (allTokensResult instanceof Promise
        ? await allTokensResult
        : allTokensResult) as any[];

      const weeklyTokens = allTokens.filter((t: any) => !t.source || t.source === 'weekly');
      const lastWeeklyToken = weeklyTokens.length > 0 ? weeklyTokens[0] : null;
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      let canClaimWeeklyToken = false;
      if (!lastWeeklyToken) {
        canClaimWeeklyToken = true;
      } else {
        const lastGranted = new Date(lastWeeklyToken.granted_at);
        canClaimWeeklyToken = lastGranted < oneWeekAgo;
      }

      return res.status(400).json({ 
        error: "No tokens available. Claim your weekly token!",
        canClaimWeeklyToken,
        code: "NO_TOKENS"
      });
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

    // Generate match explanation
    let matchExplanation = null;
    try {
      matchExplanation = await generateMatchExplanation(userProfile.id, targetProfile.id);
    } catch (err) {
      console.warn('Failed to generate match explanation:', err);
      // Continue without explanation - not critical
    }

    // Get user display names for notifications
    const userDisplayNameResult = db
      .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
      .get([userId]);
    const userDisplayName = (userDisplayNameResult instanceof Promise
      ? await userDisplayNameResult
      : userDisplayNameResult) as { display_name: string } | undefined;

    const targetDisplayNameResult = db
      .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
      .get([targetUserId]);
    const targetDisplayName = (targetDisplayNameResult instanceof Promise
      ? await targetDisplayNameResult
      : targetDisplayNameResult) as { display_name: string } | undefined;

    // Send in-app notifications via Socket.io to both users
    const { getIO } = await import('../socket.js');
    const io = getIO();
    if (io) {
      // Notify the initiator (userId)
      io.to(`user:${userId}`).emit('new_match', {
        matchId,
        otherUserId: targetUserId,
        otherUserName: targetDisplayName?.display_name || 'Someone',
        message: `🎉 It's a match! You matched with ${targetDisplayName?.display_name || 'someone'}. Start chatting now!`,
        stage: 'stage1',
      });

      // Notify the target user (targetUserId)
      io.to(`user:${targetUserId}`).emit('new_match', {
        matchId,
        otherUserId: userId,
        otherUserName: userDisplayName?.display_name || 'Someone',
        message: `🎉 It's a match! ${userDisplayName?.display_name || 'Someone'} matched with you. Start chatting now!`,
        stage: 'stage1',
      });

      console.log(`✅ Sent match notifications to both users: ${userId} and ${targetUserId}`);
    } else {
      console.warn('⚠️  Socket.io not initialized, skipping in-app notifications');
    }

    // Send push notifications to both users (primary notification method)
    // Push notifications are the standard for match notifications in modern dating apps
    // SMS is reserved for verification codes only
    try {
      const { sendMatchPushNotification } = await import('../services/pushNotifications.js');
      
      // Get push tokens for both users
      const userPushTokenResult = db
        .prepare("SELECT push_token FROM users WHERE id = ?")
        .get([userId]);
      const userPushToken = (userPushTokenResult instanceof Promise
        ? await userPushTokenResult
        : userPushTokenResult) as { push_token: string | null } | undefined;

      const targetPushTokenResult = db
        .prepare("SELECT push_token FROM users WHERE id = ?")
        .get([targetUserId]);
      const targetPushToken = (targetPushTokenResult instanceof Promise
        ? await targetPushTokenResult
        : targetPushTokenResult) as { push_token: string | null } | undefined;

      // Send push notification to target user (User B - the one who was matched with)
      if (targetPushToken?.push_token) {
        await sendMatchPushNotification(
          targetPushToken.push_token,
          userDisplayName?.display_name || 'Someone',
          matchId
        );
        console.log(`✅ Sent push notification to ${targetUserId} (User B)`);
      }

      // Send push notification to initiator (User A - the one who initiated the match)
      if (userPushToken?.push_token) {
        await sendMatchPushNotification(
          userPushToken.push_token,
          targetDisplayName?.display_name || 'Someone',
          matchId
        );
        console.log(`✅ Sent push notification to ${userId} (User A)`);
      }
    } catch (pushError) {
      // Push notifications are optional, don't fail the match creation if push fails
      console.warn('⚠️  Failed to send push notification (non-critical):', pushError);
    }

    res.json({
      message: "It's a match! You can now chat.",
      matchId,
      stage: "stage1",
      isMutual: true,
      explanation: matchExplanation, // Include match explanation
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
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as MatchRow | undefined;

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
    const updateResult = db.prepare(
      `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run([matchId]);
    if (updateResult instanceof Promise) {
      await updateResult;
    }

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
  } catch (error) {
    console.error("Reveal error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to reveal photos: ${errorMessage}` });
  }
});

// Get messages for a match
matchesRouter.get("/:matchId/messages", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as MatchRow | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found or not yet mutual" });
    }

    const messagesResult = db
      .prepare(
        `SELECT m.*, p.display_name as sender_name
         FROM messages m
         JOIN profiles p ON p.user_id = m.sender_id
         WHERE m.match_id = ?
         ORDER BY m.sent_at ASC`
      )
      .all([matchId]);
    const messages = (messagesResult instanceof Promise
      ? await messagesResult
      : messagesResult) as any[];

    // Mark messages as read
    const updateReadResult = db.prepare(
      `UPDATE messages SET read_at = CURRENT_TIMESTAMP 
       WHERE match_id = ? AND sender_id != ? AND read_at IS NULL`
    ).run([matchId, userId]);
    if (updateReadResult instanceof Promise) {
      await updateReadResult;
    }

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
  } catch (error) {
    console.error("Get messages error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load messages: ${errorMessage}` });
  }
});

// Send a message
matchesRouter.post("/:matchId/messages", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
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
    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as MatchRow | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found or not yet mutual" });
    }

    const messageId = uuidv4();
    const insertMessageResult = db.prepare(
      `INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`
    ).run([messageId, matchId, userId, sanitizedContent]);
    if (insertMessageResult instanceof Promise) {
      await insertMessageResult;
    }

    // Check if we should auto-advance to stage2 (both users sent at least 2 messages, alternating)
    let autoAdvanced = false;
    if (match.stage === "stage1") {
      // Get all messages in chronological order
      const allMessagesResult = db
        .prepare(`SELECT sender_id, sent_at FROM messages WHERE match_id = ? ORDER BY sent_at ASC`)
        .all([matchId]);
      const allMessages = (allMessagesResult instanceof Promise
        ? await allMessagesResult
        : allMessagesResult) as Array<{ sender_id: string; sent_at: string }>;

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
        const updateStageResult = db.prepare(
          `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run([matchId]);
        if (updateStageResult instanceof Promise) {
          await updateStageResult;
        }
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

    // Track success signal: message exchanged
    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
    await recordSuccessSignal(userId, otherUserId, matchId, "message_exchanged");

    // If auto-advanced, track stage advanced signal
    if (autoAdvanced) {
      await recordSuccessSignal(match.user1_id, match.user2_id, matchId, "stage_advanced");
      await recordSuccessSignal(match.user2_id, match.user1_id, matchId, "stage_advanced");
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
  } catch (error) {
    console.error("Send message error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to send message: ${errorMessage}` });
  }
});

// Check if user has pending match from someone
matchesRouter.get("/pending-from/:userId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.userId!;
    const { userId: otherUserId } = req.params;

    const pendingMatchResult = db
      .prepare(
        `SELECT * FROM matches 
         WHERE user1_id = ? AND user2_id = ? AND stage = 'pending'`
      )
      .get([otherUserId, currentUserId]);
    const pendingMatch = (pendingMatchResult instanceof Promise
      ? await pendingMatchResult
      : pendingMatchResult) as MatchRow | undefined;

    res.json({ hasPendingMatch: !!pendingMatch, matchId: pendingMatch?.id });
  } catch (error) {
    console.error("Pending match error:", error);
    res.status(500).json({ error: "Failed to check pending match" });
  }
});

// Unmatch with someone (POST endpoint for frontend compatibility)
matchesRouter.post("/:matchId/unmatch", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Validate matchId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(matchId)) {
      return res.status(400).json({ error: "Invalid match ID format" });
    }

    // Verify user is part of this match
    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage != 'expired'`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as MatchRow | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found or already unmatched" });
    }

    // Set match stage to 'expired' (soft delete - keeps history)
    await (db
      .prepare(`UPDATE matches SET stage = 'expired', expires_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run([matchId]) as Promise<any>);

    // Notify via Socket.io if available
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('match_unmatched', { matchId, unmatchedBy: userId });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for unmatch notification');
    }

    console.log(`✅ User ${userId} unmatched with match ${matchId}`);
    res.json({ message: "Successfully unmatched" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unmatch error:", error);
    res.status(500).json({ error: `Failed to unmatch: ${errorMessage}` });
  }
});

// Unmatch with someone (DELETE endpoint - alternative method)
matchesRouter.delete("/:matchId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as MatchRow | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Mark match as expired (soft delete)
    const updateResult = db.prepare(`UPDATE matches SET stage = 'expired' WHERE id = ?`).run([matchId]);
    if (updateResult instanceof Promise) {
      await updateResult;
    }

    // Return tokens if they were used (optional - you might want to keep tokens used)
    // For now, we'll just expire the match

    res.json({ message: "Match removed successfully" });
  } catch (error) {
    console.error("Unmatch error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to unmatch: ${errorMessage}` });
  }
});

// DISABLED: Generate weekly matches for current user
// Matches are now only created when users use tokens to connect
// matchesRouter.post("/generate", authenticateToken, async (req: AuthRequest, res) => {
//   const userId = req.userId!;
//   
//   try {
//     const result = await generateWeeklyMatches(userId);
//     res.json({
//       message: `Generated ${result.matchesCreated} weekly match(es)`,
//       matchesCreated: result.matchesCreated,
//       matchIds: result.matches,
//     });
//   } catch (error) {
//     console.error("Error generating matches:", error);
//     res.status(500).json({ error: "Failed to generate matches" });
//   }
// });

// Return error for manual match generation (disabled)
matchesRouter.post("/generate", authenticateToken, async (req: AuthRequest, res) => {
  res.status(403).json({ 
    error: "Automatic match generation is disabled. Matches can only be created by using tokens to connect with profiles." 
  });
});

// ============================================
// COMPATIBILITY PULSE
// ============================================

// Get compatibility score for a match
matchesRouter.get("/:matchId/compatibility", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { getCompatibilityScore, updateCompatibilityScore } = await import('../services/compatibilityPulse.js');
    
    // Get or calculate score
    let score = await getCompatibilityScore(matchId);
    if (!score) {
      // Calculate for the first time
      score = await updateCompatibilityScore(matchId, match.user1_id, match.user2_id);
    } else {
      // Recalculate to get latest score
      score = await updateCompatibilityScore(matchId, match.user1_id, match.user2_id);
    }

    res.json({ score });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Compatibility score error:", error);
    res.status(500).json({ error: `Failed to get compatibility score: ${errorMessage}` });
  }
});

// ============================================
// MULLIGAN MOMENTS
// ============================================

// Check if conversation is dead
matchesRouter.get("/:matchId/conversation-status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { isConversationDead } = await import('../services/mulliganMoments.js');
    const isDead = await isConversationDead(matchId);

    res.json({ isDead, canReset: isDead });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Conversation status error:", error);
    res.status(500).json({ error: `Failed to check conversation status: ${errorMessage}` });
  }
});

// Reset conversation with Mulligan Moment
matchesRouter.post("/:matchId/reset-conversation", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Check if user has tokens available
    const tokensResult = db
      .prepare('SELECT id FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL')
      .get([userId]);
    const token = (tokensResult instanceof Promise
      ? await tokensResult
      : tokensResult) as { id: string } | undefined;

    if (!token) {
      return res.status(400).json({ 
        error: "No tokens available. You need a token to reset a conversation.",
        code: "NO_TOKENS"
      });
    }

    // Use the token
    await (db
      .prepare('UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?')
      .run([matchId, token.id]) as Promise<any>);

    // Reset conversation and generate starter
    const { resetConversation } = await import('../services/mulliganMoments.js');
    const { starter, explanation, resetId } = await resetConversation(matchId, userId, true);

    // Notify via Socket.io
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('conversation_reset', {
          matchId,
          resetBy: userId,
          starter,
          explanation,
          resetId,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for conversation reset notification');
    }

    res.json({ 
      success: true,
      starter,
      explanation,
      resetId,
      message: "Conversation reset! A new starter has been generated."
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Reset conversation error:", error);
    res.status(500).json({ error: `Failed to reset conversation: ${errorMessage}` });
  }
});

// ============================================
// DATE BLUEPRINT
// ============================================

// Generate date plan
matchesRouter.post("/:matchId/generate-date-plan", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Get shared interests
    const { getSharedInterests } = await import('../services/mulliganMoments.js');
    const sharedInterests = await getSharedInterests(matchId, match.user1_id, match.user2_id);

    // Generate date plan
    const { generateDatePlan } = await import('../services/dateBlueprint.js');
    const plan = await generateDatePlan(matchId, userId, sharedInterests);

    // Notify via Socket.io
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('date_plan_generated', {
          matchId,
          plan,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for date plan notification');
    }

    res.json({ plan });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Generate date plan error:", error);
    res.status(500).json({ error: `Failed to generate date plan: ${errorMessage}` });
  }
});

// Get date plan for a match
matchesRouter.get("/:matchId/date-plan", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { getDatePlan } = await import('../services/dateBlueprint.js');
    const plan = await getDatePlan(matchId);

    if (!plan) {
      return res.status(404).json({ error: "No date plan found for this match" });
    }

    res.json({ plan });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Get date plan error:", error);
    res.status(500).json({ error: `Failed to get date plan: ${errorMessage}` });
  }
});

// Accept, decline, or modify date plan
matchesRouter.post("/:matchId/date-plan/:planId/action", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId, planId } = req.params;
    const { action, modifications } = req.body; // action: 'accept' | 'decline' | 'modify'

    if (!['accept', 'decline', 'modify'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'accept', 'decline', or 'modify'" });
    }

    // Verify user is part of this match
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { updateDatePlanStatus } = await import('../services/dateBlueprint.js');
    const plan = await updateDatePlanStatus(planId, userId, action, modifications);

    // Notify via Socket.io
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('date_plan_updated', {
          matchId,
          planId,
          action,
          plan,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for date plan update notification');
    }

    res.json({ plan, message: `Date plan ${action}ed successfully` });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Date plan action error:", error);
    res.status(500).json({ error: `Failed to update date plan: ${errorMessage}` });
  }
});

