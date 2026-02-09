import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { generateWeeklyMatches, generateMatchExplanation, calculateProfileCompatibilityScore } from "../services/matching.js";
import { recordSuccessSignal } from "../utils/successTracking.js";
import { rateLimitAPI } from "../middleware/security.js";
import { uploadChatImage, uploadChatVideo, uploadChatAudio } from "../middleware/upload.js";
import { uploadToCloudinary, uploadToCloudinaryMedia, isCloudinaryConfigured } from "../services/cloudinary.js";

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

// Get active match count and slot limit - MUST be before /:matchId routes so "count" isn't treated as matchId
matchesRouter.get("/count", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const countResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM matches 
         WHERE (user1_id = ? OR user2_id = ?) AND stage != 'expired'`
      )
      .get([userId, userId]);
    const countRow = (countResult instanceof Promise ? await countResult : countResult) as { count: number | string };
    const count = Math.floor(Number(countRow?.count ?? 0));

    const limitResult = db
      .prepare("SELECT COALESCE(match_slot_limit, 20) as slot_limit FROM users WHERE id = ?")
      .get([userId]);
    const limitRow = (limitResult instanceof Promise ? await limitResult : limitResult) as { slot_limit: number | string } | undefined;
    const slotLimit = Math.floor(Number(limitRow?.slot_limit ?? 20));

    res.json({ count, slotLimit });
  } catch (error) {
    console.error('Matches count error:', error);
    res.status(500).json({ error: 'Failed to get match count', count: 0, slotLimit: 20 });
  }
});

// Get all matches for current user
matchesRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Auto-expire matches whose 7-day timer has passed (so they disappear from the tab and users can re-match later)
    const nowIso = new Date().toISOString();
    try {
      const expireResult = db
        .prepare(
          `UPDATE matches SET stage = 'expired' 
           WHERE stage != 'expired' AND expires_at IS NOT NULL AND expires_at < ?`
        )
        .run([nowIso]);
      if (expireResult instanceof Promise) {
        await expireResult;
      } else if ((expireResult as { changes: number }).changes > 0) {
        console.log(`⏰ Auto-expired ${(expireResult as { changes: number }).changes} match(es) past 7-day limit`);
      }
    } catch (expireErr) {
      console.warn('Failed to auto-expire matches (non-fatal):', expireErr);
    }

    const matchesResult = db
      .prepare(
        `SELECT m.*, 
                p1.display_name as user1_name, p1.age as user1_age, p1.bio as user1_bio, 
                p1.photo_url as user1_photo, p1.gender as user1_gender, p1.location as user1_location,
                p2.display_name as user2_name, p2.age as user2_age, p2.bio as user2_bio,
                p2.photo_url as user2_photo, p2.gender as user2_gender, p2.location as user2_location,
                u1.last_active_at as user1_last_active, u2.last_active_at as user2_last_active,
                u1.show_active_status as user1_show_active, u2.show_active_status as user2_show_active
         FROM matches m
         LEFT JOIN profiles p1 ON p1.user_id = m.user1_id
         LEFT JOIN profiles p2 ON p2.user_id = m.user2_id
         LEFT JOIN users u1 ON u1.id = m.user1_id
         LEFT JOIN users u2 ON u2.id = m.user2_id
         LEFT JOIN (
           SELECT match_id, MAX(sent_at) as last_message_at
           FROM messages
           GROUP BY match_id
         ) msg ON msg.match_id = m.id
         WHERE (m.user1_id = ? OR m.user2_id = ?)
         AND m.stage != 'expired'
         ORDER BY COALESCE(msg.last_message_at, m.created_at) DESC`
      )
      .all([userId, userId]);
    const matches = (matchesResult instanceof Promise
      ? await matchesResult
      : matchesResult) as any[];

    console.log(`📊 Matches query returned ${matches.length} matches for user ${userId}`);

    if (matches.length === 0) {
      return res.json({ matches: [] });
    }

    // OPTIMIZATION: Batch fetch all data instead of per-match queries
    // Collect all unique user IDs and match IDs
    const allOtherUserIds = new Set<string>();
    const allMatchIds = matches.map(m => m.id);
    
    matches.forEach(m => {
      const isUser1 = m.user1_id === userId;
      const otherUserId = isUser1 ? m.user2_id : m.user1_id;
      allOtherUserIds.add(otherUserId);
    });

    const otherUserIdsArray = Array.from(allOtherUserIds);

    // Batch fetch all profile IDs for other users
    const profileIdsMap = new Map<string, string>(); // userId -> profileId
    if (otherUserIdsArray.length > 0) {
      const placeholders = otherUserIdsArray.map(() => '?').join(',');
      const profilesResult = db
        .prepare(`SELECT id, user_id FROM profiles WHERE user_id IN (${placeholders})`)
        .all(otherUserIdsArray);
      const profiles = (profilesResult instanceof Promise
        ? await profilesResult
        : profilesResult) as { id: string; user_id: string }[];
      
      profiles.forEach(p => {
        profileIdsMap.set(p.user_id, p.id);
      });
    }

    // Batch fetch all primary photos (for stage1 and stage2 — primary only in stage1)
    const primaryPhotosMap = new Map<string, string>(); // profileId -> photoUrl
    const profileIdsArray = Array.from(profileIdsMap.values());
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const photosResult = db
        .prepare(`SELECT profile_id, url FROM photos WHERE profile_id IN (${placeholders}) AND is_primary = 1`)
        .all(profileIdsArray);
      const photos = (photosResult instanceof Promise
        ? await photosResult
        : photosResult) as { profile_id: string; url: string }[];
      
      photos.forEach(photo => {
        primaryPhotosMap.set(photo.profile_id, photo.url);
      });
    }

    // Batch fetch all photos per profile (for stage2 only — full reveal)
    const allPhotosByProfileMap = new Map<string, Array<{ id: string; url: string; isPrimary: boolean; displayOrder: number }>>();
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const allPhotosResult = db
        .prepare(`SELECT id, profile_id, url, is_primary, display_order FROM photos WHERE profile_id IN (${placeholders}) ORDER BY profile_id, display_order ASC`)
        .all(profileIdsArray);
      const allPhotos = (allPhotosResult instanceof Promise
        ? await allPhotosResult
        : allPhotosResult) as Array<{ id: string; profile_id: string; url: string; is_primary: number; display_order: number }>;
      allPhotos.forEach(photo => {
        if (!allPhotosByProfileMap.has(photo.profile_id)) {
          allPhotosByProfileMap.set(photo.profile_id, []);
        }
        allPhotosByProfileMap.get(photo.profile_id)!.push({
          id: photo.id,
          url: photo.url,
          isPrimary: photo.is_primary === 1,
          displayOrder: photo.display_order ?? 0,
        });
      });
    }

    // Batch fetch all interests
    const interestsMap = new Map<string, string[]>(); // profileId -> interests[]
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const interestsResult = db
        .prepare(`SELECT profile_id, name FROM interests WHERE profile_id IN (${placeholders})`)
        .all(profileIdsArray);
      const interests = (interestsResult instanceof Promise
        ? await interestsResult
        : interestsResult) as { profile_id: string; name: string }[];
      
      interests.forEach(interest => {
        if (!interestsMap.has(interest.profile_id)) {
          interestsMap.set(interest.profile_id, []);
        }
        interestsMap.get(interest.profile_id)!.push(interest.name);
      });
    }

    // Batch fetch all preferences (values)
    const preferencesMap = new Map<string, string[]>(); // profileId -> values[]
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const preferencesResult = db
        .prepare(`SELECT profile_id, "values" FROM preferences WHERE profile_id IN (${placeholders})`)
        .all(profileIdsArray);
      const preferences = (preferencesResult instanceof Promise
        ? await preferencesResult
        : preferencesResult) as { profile_id: string; values: string | null }[];
      
      preferences.forEach(pref => {
        if (pref.values) {
          try {
            const values = JSON.parse(pref.values);
            preferencesMap.set(pref.profile_id, values);
          } catch {
            preferencesMap.set(pref.profile_id, []);
          }
        } else {
          preferencesMap.set(pref.profile_id, []);
        }
      });
    }

    // Batch fetch all partner qualities
    const partnerQualitiesMap = new Map<string, Array<{ quality: string; importance: number }>>(); // profileId -> qualities[]
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const qualitiesResult = db
        .prepare(`SELECT profile_id, quality, importance FROM partner_qualities WHERE profile_id IN (${placeholders})`)
        .all(profileIdsArray);
      const qualities = (qualitiesResult instanceof Promise
        ? await qualitiesResult
        : qualitiesResult) as { profile_id: string; quality: string; importance: number }[];
      
      qualities.forEach(quality => {
        if (!partnerQualitiesMap.has(quality.profile_id)) {
          partnerQualitiesMap.set(quality.profile_id, []);
        }
        partnerQualitiesMap.get(quality.profile_id)!.push({
          quality: quality.quality,
          importance: quality.importance,
        });
      });
    }

    // Batch fetch all unread message counts
    const unreadCountsMap = new Map<string, number>(); // matchId -> unreadCount
    if (allMatchIds.length > 0) {
      const placeholders = allMatchIds.map(() => '?').join(',');
      const unreadCountsResult = db
        .prepare(
          `SELECT match_id, COUNT(*) as count 
           FROM messages 
           WHERE match_id IN (${placeholders}) 
           AND sender_id != ? 
           AND read_at IS NULL
           GROUP BY match_id`
        )
        .all([...allMatchIds, userId]);
      const unreadCounts = (unreadCountsResult instanceof Promise
        ? await unreadCountsResult
        : unreadCountsResult) as { match_id: string; count: number }[];
      
      unreadCounts.forEach(uc => {
        unreadCountsMap.set(uc.match_id, uc.count);
      });
    }

    // Batch fetch game unlocks (token-unlocked games per match)
    const gameUnlocksMap = new Map<string, { truth_or_dare: boolean; never_have_i_ever: boolean }>();
    if (allMatchIds.length > 0) {
      try {
        const placeholders = allMatchIds.map(() => '?').join(',');
        const unlocksResult = db
          .prepare(
            `SELECT match_id, game_type, unlocked_until FROM game_unlocks WHERE match_id IN (${placeholders})`
          )
          .all(allMatchIds);
        const unlocks = (unlocksResult instanceof Promise
          ? await unlocksResult
          : unlocksResult) as { match_id: string; game_type: string; unlocked_until: string | null }[];
        const now = new Date();
        allMatchIds.forEach((mid) => {
          const isUnlocked = (u: { match_id: string; game_type: string; unlocked_until: string | null }) => {
            const until = u.unlocked_until ? new Date(u.unlocked_until) : null;
            return (!until || until > now);
          };
          const truth_or_dare = unlocks.some((u) => u.match_id === mid && u.game_type === 'truth_or_dare' && isUnlocked(u));
          const never_have_i_ever = unlocks.some((u) => u.match_id === mid && u.game_type === 'never_have_i_ever' && isUnlocked(u));
          gameUnlocksMap.set(mid, { truth_or_dare, never_have_i_ever });
        });
      } catch (e) {
        // game_unlocks table might not exist in older DBs - ignore
      }
    }

    // Batch fetch compatibility scores for match cards
    const compatibilityScoresMap = new Map<string, number>();
    if (allMatchIds.length > 0) {
      try {
        const placeholders = allMatchIds.map(() => '?').join(',');
        const scoresResult = db
          .prepare(
            `SELECT match_id, score FROM compatibility_scores WHERE match_id IN (${placeholders})`
          )
          .all(allMatchIds);
        const scores = (scoresResult instanceof Promise
          ? await scoresResult
          : scoresResult) as { match_id: string; score: number }[];
        scores.forEach((row) => {
          const s = typeof row.score === 'number' ? row.score : parseFloat(String(row.score));
          compatibilityScoresMap.set(row.match_id, Math.round(s));
        });
      } catch (e) {
        // compatibility_scores table might not exist - ignore
      }
    }

    // Now format matches using the batch-fetched data
    const formattedMatches = matches.map((m) => {
      const isUser1 = m.user1_id === userId;
      const otherUserId = isUser1 ? m.user2_id : m.user1_id;
      const otherProfileId = profileIdsMap.get(otherUserId);

      // Get primary photo
      let primaryPhotoUrl: string | null = null;
      if (otherProfileId) {
        primaryPhotoUrl = primaryPhotosMap.get(otherProfileId) || null;
        if (!primaryPhotoUrl) {
          // Fallback to photo_url from profiles table
          primaryPhotoUrl = isUser1 ? m.user2_photo : m.user1_photo;
        }
      }

      const otherLastActive = isUser1 ? m.user2_last_active : m.user1_last_active;
      const otherShowActive = isUser1 ? (m.user2_show_active !== 0 && m.user2_show_active !== false) : (m.user1_show_active !== 0 && m.user1_show_active !== false);
      const otherUser = {
        userId: otherUserId,
        displayName: isUser1 ? m.user2_name : m.user1_name,
        age: isUser1 ? m.user2_age : m.user1_age,
        bio: isUser1 ? m.user2_bio : m.user1_bio,
        gender: isUser1 ? m.user2_gender : m.user1_gender,
        location: isUser1 ? m.user2_location : m.user1_location,
        // Show primary photo in stage1 and stage2 (all photos shown in stage2 via separate photos array)
        photoUrl: (m.stage === "stage1" || m.stage === "stage2") ? primaryPhotoUrl : null,
        last_active_at: otherLastActive,
        show_active_status: otherShowActive,
      };

      const interests = otherProfileId ? (interestsMap.get(otherProfileId) || []) : [];
      const values = otherProfileId ? (preferencesMap.get(otherProfileId) || []) : [];
      const partnerQualities = otherProfileId ? (partnerQualitiesMap.get(otherProfileId) || []) : [];
      const unreadMessageCount = unreadCountsMap.get(m.id) || 0;
      const gameUnlocks = gameUnlocksMap.get(m.id) || { truth_or_dare: false, never_have_i_ever: false };
      const compatibilityScore = compatibilityScoresMap.get(m.id) ?? null;

      // Only include full photos array for stage2; stage1 gets primary via photoUrl only
      const photos = m.stage === "stage2" && otherProfileId
        ? (allPhotosByProfileMap.get(otherProfileId) || [])
        : undefined;

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
        unreadCount: unreadMessageCount,
        gameUnlocks,
        compatibilityScore,
        otherUser: {
          ...otherUser,
          profileId: otherProfileId,
          interests,
          values,
          partnerQualities,
          lastActiveAt: otherUser.show_active_status ? (otherUser.last_active_at || null) : null,
          ...(photos !== undefined && { photos }),
        },
      };
    });

    console.log(`✅ Returning ${formattedMatches.length} formatted matches to user ${userId}`);
    res.json({ matches: formattedMatches });
  } catch (error) {
    console.error('Matches GET error:', error);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// Send a match request (use a token) - AUTOMATIC MATCH
// Match limit: default 20 per user. Tokens stay at 7 (weekly claim, max 7).
matchesRouter.post("/connect", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { targetUserId, expandSlot } = req.body;

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

    // Already matched: return success with existing matchId so app can open the conversation (no token consumed)
    if (existingMatch && existingMatch.stage !== 'expired') {
      return res.status(200).json({
        matchId: existingMatch.id,
        existingMatch: true,
        message: "You're already connected!",
        stage: existingMatch.stage || 'stage1',
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

    // Match limit: 20 per user (no expansion beyond 20).
    const activeMatchCountResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM matches 
         WHERE (user1_id = ? OR user2_id = ?) AND stage != 'expired'`
      )
      .get([userId, userId]);
    const activeMatchCount = (activeMatchCountResult instanceof Promise
      ? await activeMatchCountResult
      : activeMatchCountResult) as { count: number | string };
    const count = Math.floor(Number(activeMatchCount?.count ?? 0));

    const userRowResult = db
      .prepare("SELECT COALESCE(match_slot_limit, 20) as slot_limit FROM users WHERE id = ?")
      .get([userId]);
    const userRow = (userRowResult instanceof Promise ? await userRowResult : userRowResult) as { slot_limit: number | string } | undefined;
    const slotLimit = Math.floor(Number(userRow?.slot_limit ?? 20));

    if (count >= 20) {
      return res.status(400).json({
        error: "You've reached the maximum of 20 matches. Unmatch with someone to free up a slot.",
        code: "MAX_MATCHES_REACHED",
      });
    }

    if (count >= slotLimit && !expandSlot) {
      return res.status(400).json({
        error: `You've reached your match limit (${slotLimit}). Unmatch with someone or wait for a match to expire to free a slot.`,
        code: "AT_MATCH_LIMIT",
        canExpand: false,
        currentLimit: slotLimit,
        newLimit: slotLimit,
        tokensNeeded: 1,
      });
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

    const tokensNeeded = 1;
    const tokenResult = db
      .prepare(
        `SELECT * FROM mulligan_tokens 
         WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL
         ORDER BY granted_at ASC LIMIT ?`
      )
      .all([userId, tokensNeeded]);
    const tokens = (tokenResult instanceof Promise ? await tokenResult : tokenResult) as any[];
    const token = tokens[0];

    if (!token || tokens.length < tokensNeeded) {
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

    // Final safety check: re-verify count before creating match (prevents race conditions)
    const recheckCountResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM matches 
         WHERE (user1_id = ? OR user2_id = ?) AND stage != 'expired'`
      )
      .get([userId, userId]);
    const recheckRow = (recheckCountResult instanceof Promise ? await recheckCountResult : recheckCountResult) as { count: number | string };
    const recheckCount = Math.floor(Number(recheckRow?.count ?? 0));
    if (recheckCount >= slotLimit) {
      return res.status(400).json({
        error: `You've reached your match limit (${slotLimit}). Unmatch with someone or wait for a match to expire to connect.`,
        code: "AT_MATCH_LIMIT",
        canExpand: false,
        currentLimit: slotLimit,
        newLimit: slotLimit,
        tokensNeeded: 1,
      });
    }

    // AUTOMATIC MATCH: Create mutual match immediately in stage1 (no pending state)
    const matchId = uuidv4();
    // Exactly 7 days (168 hours) from now — never more than 7-day timer
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Create match directly in stage1 (mutual match, chat available immediately)
    const insertMatchResult = db.prepare(
      `INSERT INTO matches (id, user1_id, user2_id, user1_token_id, status, stage, stage1_at, expires_at)
       VALUES (?, ?, ?, ?, 'mutual', 'stage1', CURRENT_TIMESTAMP, ?)`
    ).run([matchId, userId, targetUserId, token.id, sevenDaysFromNow.toISOString()]);
    if (insertMatchResult instanceof Promise) {
      await insertMatchResult;
    }

    // Use the token (first token - for the match)
    const updateTokenResult = db.prepare(
      `UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?`
    ).run([matchId, token.id]);
    if (updateTokenResult instanceof Promise) {
      await updateTokenResult;
    }

    // Track success signal: match created (both users connected)
    // These are saved to PostgreSQL and persist forever
    // Make non-blocking - don't wait for these
    recordSuccessSignal(userId, targetUserId, matchId, "match_created").catch(err => 
      console.warn('Failed to record success signal (non-critical):', err)
    );
    recordSuccessSignal(targetUserId, userId, matchId, "match_created").catch(err => 
      console.warn('Failed to record success signal (non-critical):', err)
    );

    // Generate match explanation in background — don't block response (return immediately)
    generateMatchExplanation(userProfile.id, targetProfile.id)
      .then(() => {})
      .catch(err => console.warn('Failed to generate match explanation:', err));

    // Send HTTP response immediately so the client feels instant; run notifications after
    res.json({
      message: "It's a match! You can now chat.",
      matchId,
      stage: "stage1",
      isMutual: true,
      explanation: null, // Generated in background; client can refetch if needed
    });

    // Notifications run after response is sent — don't block the connect round-trip
    setImmediate(async () => {
      try {
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

        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to(`user:${userId}`).emit('new_match', {
            matchId,
            otherUserId: targetUserId,
            otherUserName: targetDisplayName?.display_name || 'Someone',
            message: `🎉 It's a match! You matched with ${targetDisplayName?.display_name || 'someone'}. Start chatting now!`,
            stage: 'stage1',
          });
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

        const { sendMatchPushNotification } = await import('../services/pushNotifications.js');
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

        // Only send push to the target (person who was matched with). The connect initiator
        // already sees "It's a match! You matched with X" in-app; avoid duplicate "New match! X matched with you".
        if (targetPushToken?.push_token) {
          await sendMatchPushNotification(
            targetPushToken.push_token,
            userDisplayName?.display_name || 'Someone',
            matchId
          );
          console.log(`✅ Sent push notification to ${targetUserId} (User B)`);
        }
      } catch (notifErr) {
        console.warn('⚠️  Match notifications failed (non-critical):', notifErr);
      }
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

    console.log(`📨 Fetching messages for match ${matchId} by user ${userId}`);

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
      console.log(`📨 Match ${matchId} not found or not accessible by user ${userId}`);
      return res.status(404).json({ error: "Match not found or not yet mutual" });
    }

    // Return the most recent messages; cap at 5000 per match so responses stay bounded
    const MESSAGES_LIMIT = 5000;
    const messagesResult = db
      .prepare(
        `SELECT * FROM (
           SELECT m.*, COALESCE(p.display_name, 'Unknown User') as sender_name
           FROM messages m
           LEFT JOIN profiles p ON p.user_id = m.sender_id
           WHERE m.match_id = ?
           ORDER BY m.sent_at DESC
           LIMIT ?
         ) ORDER BY sent_at ASC`
      )
      .all([matchId, MESSAGES_LIMIT]);
    const messages = (messagesResult instanceof Promise
      ? await messagesResult
      : messagesResult) as any[];

    console.log(`📨 Found ${messages.length} messages for match ${matchId}`);

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
        imageUrl: m.image_url || null,
        videoUrl: m.video_url || null,
        audioUrl: m.audio_url || null,
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

// Upload chat image (returns imageUrl for use in send message)
matchesRouter.post("/:matchId/messages/upload-image", authenticateToken, rateLimitAPI, (req: AuthRequest, res, next) => {
  uploadChatImage(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Image upload failed" });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const file = (req as any).file;

    if (!file || !file.buffer) {
      return res.status(400).json({ error: "No image file received" });
    }

    const matchResult = db
      .prepare(
        `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
      )
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as MatchRow | undefined;
    if (!match) {
      return res.status(404).json({ error: "Match not found or not yet mutual" });
    }

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: "Image upload is not configured" });
    }

    const imageUrl = await uploadToCloudinary(file.buffer, 'chat-images');
    res.json({ imageUrl });
  } catch (error) {
    console.error("Chat image upload error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to upload image: ${msg}` });
  }
});

// Upload chat video (returns videoUrl for use in send message)
matchesRouter.post("/:matchId/messages/upload-video", authenticateToken, rateLimitAPI, (req: AuthRequest, res, next) => {
  uploadChatVideo(req, res, (err) => {
    if (err) return res.status(400).json({ error: err instanceof Error ? err.message : "Video upload failed" });
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const file = (req as any).file;
    if (!file || !file.buffer) return res.status(400).json({ error: "No video file received" });
    const matchResult = db.prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    ).get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as MatchRow | undefined;
    if (!match) return res.status(404).json({ error: "Match not found or not yet mutual" });
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: "Video upload is not configured" });
    const videoUrl = await uploadToCloudinaryMedia(file.buffer, 'chat-videos', 'video');
    res.json({ videoUrl });
  } catch (error) {
    console.error("Chat video upload error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to upload video" });
  }
});

// Upload chat audio / voice message (returns audioUrl for use in send message)
matchesRouter.post("/:matchId/messages/upload-audio", authenticateToken, rateLimitAPI, (req: AuthRequest, res, next) => {
  uploadChatAudio(req, res, (err) => {
    if (err) return res.status(400).json({ error: err instanceof Error ? err.message : "Audio upload failed" });
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const file = (req as any).file;
    if (!file || !file.buffer) return res.status(400).json({ error: "No audio file received" });
    const matchResult = db.prepare(
      `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    ).get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as MatchRow | undefined;
    if (!match) return res.status(404).json({ error: "Match not found or not yet mutual" });
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: "Audio upload is not configured" });
    const audioUrl = await uploadToCloudinaryMedia(file.buffer, 'chat-audio', 'raw');
    res.json({ audioUrl });
  } catch (error) {
    console.error("Chat audio upload error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to upload audio" });
  }
});

// Send a message
matchesRouter.post("/:matchId/messages", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { content, imageUrl, videoUrl, audioUrl } = req.body;

    const hasContent = content != null && typeof content === 'string' && content.trim().length > 0;
    const hasImage = imageUrl != null && typeof imageUrl === 'string' && imageUrl.trim().length > 0;
    const hasVideo = videoUrl != null && typeof videoUrl === 'string' && videoUrl.trim().length > 0;
    const hasAudio = audioUrl != null && typeof audioUrl === 'string' && audioUrl.trim().length > 0;

    if (!hasContent && !hasImage && !hasVideo && !hasAudio) {
      return res.status(400).json({ error: "Message content, image, video, or audio required" });
    }

    const { sanitizeText } = await import('../middleware/security.js');
    const sanitizedContent = hasContent ? sanitizeText(content.trim(), 1000) : '';

    if (sanitizedContent.length > 1000) {
      return res.status(400).json({ error: "Message must be at most 1000 characters" });
    }

    const finalImageUrl = hasImage ? imageUrl.trim() : null;
    const finalVideoUrl = hasVideo ? videoUrl.trim() : null;
    const finalAudioUrl = hasAudio ? audioUrl.trim() : null;
    for (const url of [finalImageUrl, finalVideoUrl, finalAudioUrl].filter(Boolean)) {
      if (url && !/^https?:\/\//.test(url)) {
        return res.status(400).json({ error: "Invalid attachment URL" });
      }
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
      `INSERT INTO messages (id, match_id, sender_id, content, image_url, video_url, audio_url) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run([messageId, matchId, userId, sanitizedContent, finalImageUrl, finalVideoUrl || null, finalAudioUrl || null]);
    if (insertMessageResult instanceof Promise) {
      await insertMessageResult;
    }

    // Check if we should auto-advance to stage2 (both users have sent at least 2 messages each)
    let autoAdvanced = false;
    if (match.stage === "stage1") {
      const countResult = db
        .prepare(`SELECT sender_id, COUNT(*) as count FROM messages WHERE match_id = ? GROUP BY sender_id`)
        .all([matchId]);
      const counts = (countResult instanceof Promise ? await countResult : countResult) as Array<{ sender_id: string; count: number }>;
      const user1Count = counts.find(c => c.sender_id === match.user1_id)?.count ?? 0;
      const user2Count = counts.find(c => c.sender_id === match.user2_id)?.count ?? 0;

      if (user1Count >= 2 && user2Count >= 2) {
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

    // Send push notification to the other user (OS shows when app is backgrounded/closed)
    try {
      const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
      const hasExpoToken = !!process.env.EXPO_ACCESS_TOKEN;
      let otherUserPushTokenResult = db
        .prepare("SELECT push_token FROM users WHERE id = ?")
        .get([otherUserId]) as { push_token: string | null } | undefined;
      let token = otherUserPushTokenResult?.push_token ?? null;
      // If no token yet, recipient may have a request in flight that just saved it; retry once after a short delay
      if ((!token || !token.trim()) && isPushNotificationConfigured()) {
        await new Promise((r) => setTimeout(r, 1200));
        otherUserPushTokenResult = db.prepare("SELECT push_token FROM users WHERE id = ?").get([otherUserId]) as { push_token: string | null } | undefined;
        token = otherUserPushTokenResult?.push_token ?? null;
      }
      const tokenValid = !!(token && isExpoPushToken(token));
      console.log(`📲 Push (message HTTP): recipient=${otherUserId} hasToken=${!!token} validFormat=${tokenValid} expoConfigured=${isPushNotificationConfigured()} EXPO_ACCESS_TOKEN=${hasExpoToken ? 'set' : 'NOT SET'}`);

      const senderProfileResult = db
        .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
        .get([userId]);
      const senderProfile = (senderProfileResult instanceof Promise
        ? await senderProfileResult
        : senderProfileResult) as { display_name: string } | undefined;
      const senderName = senderProfile?.display_name || 'Someone';
      let messagePreview: string;
      if (sanitizedContent && sanitizedContent.length > 0) {
        messagePreview = sanitizedContent.length > 50 ? sanitizedContent.substring(0, 50) + '...' : sanitizedContent;
      } else if (finalImageUrl) {
        messagePreview = '📷 Photo';
      } else if (finalVideoUrl) {
        messagePreview = 'Video';
      } else if (finalAudioUrl) {
        messagePreview = 'Voice message';
      } else {
        messagePreview = 'New message';
      }

      if (isPushNotificationConfigured()) {
        if (tokenValid) {
          const pushSent = await sendMessagePushNotification(token!, senderName, messagePreview, matchId, userId);
          if (pushSent) {
            console.log(`✅ Push (message HTTP) sent to ${otherUserId}`);
          } else {
            console.warn(`⚠️  Push (message HTTP) to ${otherUserId} failed (see Expo error above)`);
          }
        } else {
          const reason = !token ? 'no push token (recipient: use TestFlight/real device, allow notifications)' : 'invalid Expo push token format';
          console.warn(`⚠️  Skipping push for user ${otherUserId}: ${reason}`);
          // Delayed retry: recipient may open app after socket and we save token from their request; re-check at 3s and 8s
          if (!token) {
            const tryDelayedPush = async () => {
              const retryRow = db.prepare("SELECT push_token FROM users WHERE id = ?").get([otherUserId]) as { push_token: string | null } | undefined;
              const retryToken = retryRow?.push_token ?? null;
              if (retryToken && retryToken.trim() && isExpoPushToken(retryToken)) {
                const sent = await sendMessagePushNotification(retryToken, senderName, messagePreview, matchId, userId);
                if (sent) console.log(`✅ Push (message HTTP) sent to ${otherUserId} (delayed retry)`);
                return true;
              }
              return false;
            };
            setTimeout(async () => {
              try {
                if (await tryDelayedPush()) return;
                setTimeout(async () => { try { await tryDelayedPush(); } catch (e) { console.warn('⚠️  Delayed push retry 2 failed:', e); } }, 5000);
              } catch (e) {
                console.warn('⚠️  Delayed push retry failed:', e);
              }
            }, 3000);
          }
        }
      }
    } catch (pushError) {
      // Push notifications are optional, don't fail message sending if push fails
      console.warn('⚠️  Failed to send push notification for message (non-critical):', pushError);
    }

    // Emit socket event to notify all users in the match (for real-time updates)
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        // Get sender's profile name for socket event
        const senderProfileResult = db
          .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
          .get([userId]);
        const senderProfile = (senderProfileResult instanceof Promise
          ? await senderProfileResult
          : senderProfileResult) as { display_name: string } | undefined;
        
        const message = {
          id: messageId,
          matchId,
          content: sanitizedContent,
          imageUrl: finalImageUrl,
          videoUrl: finalVideoUrl || null,
          audioUrl: finalAudioUrl || null,
          senderId: userId,
          senderName: senderProfile?.display_name || 'Someone',
          sentAt: new Date().toISOString(),
          readAt: null,
        };
        
        io.to(`match:${matchId}`).emit('new_message', message);
        // Also emit to recipient's user room (reliable delivery - user room always joined on connect)
        io.to(`user:${otherUserId}`).emit('new_message', message);
        console.log(`✅ Emitted socket event for new message in match ${matchId}`);
      }
    } catch (socketError) {
      // Socket events are optional, don't fail message sending if socket fails
      console.warn('⚠️  Failed to emit socket event for message (non-critical):', socketError);
    }

    const senderProfileResult = db
      .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
      .get([userId]);
    const senderProfile = (senderProfileResult instanceof Promise ? await senderProfileResult : senderProfileResult) as { display_name: string } | undefined;

    res.json({
      message: {
        id: messageId,
        content: sanitizedContent,
        imageUrl: finalImageUrl,
        videoUrl: finalVideoUrl || null,
        audioUrl: finalAudioUrl || null,
        senderId: userId,
        senderName: senderProfile?.display_name || 'Someone',
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
      try {
        score = await updateCompatibilityScore(matchId, match.user1_id, match.user2_id);
      } catch (calcError: any) {
        const errorMsg = String(calcError?.message || calcError || '');
        // If it's an integer column error, return a default score instead of failing
        if (errorMsg.includes('integer') || errorMsg.includes('invalid input syntax') || errorMsg.includes('36.67')) {
          console.warn('⚠️ Compatibility score calculation failed due to column type issue, returning default score');
          score = {
            score: 50,
            responseTimeAvg: 0,
            messageLengthAvg: 0,
            engagementLevel: 'neutral' as const,
            lastCalculatedAt: new Date().toISOString(),
          };
        } else {
          throw calcError;
        }
      }
    } else {
      // Recalculate to get latest score
      try {
        score = await updateCompatibilityScore(matchId, match.user1_id, match.user2_id);
      } catch (calcError: any) {
        const errorMsg = String(calcError?.message || calcError || '');
        // If it's an integer column error, return the existing score instead of failing
        if (errorMsg.includes('integer') || errorMsg.includes('invalid input syntax') || errorMsg.includes('36.67')) {
          console.warn('⚠️ Compatibility score update failed due to column type issue, returning existing score');
          // Use existing score, but ensure it's a number (round if needed)
          if (score && typeof score.score === 'number') {
            score.score = Math.round(score.score);
          }
        } else {
          throw calcError;
        }
      }
    }

    res.json({ score });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Compatibility score error:", error);
    res.status(500).json({ error: `Failed to get compatibility score: ${errorMessage}` });
  }
});

// Get profile-based compatibility (interests, dealbreakers, looking for, etc.)
// Also returns match explanation (reasons, sharedInterests, sharedValues) for the detail card
matchesRouter.get("/:matchId/profile-compatibility", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as { user1_id: string; user2_id: string } | undefined;
    if (!match) return res.status(404).json({ error: "Match not found" });

    const profileResult1 = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(match.user1_id);
    const profileResult2 = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(match.user2_id);
    const p1 = (profileResult1 instanceof Promise ? await profileResult1 : profileResult1) as { id: string } | undefined;
    const p2 = (profileResult2 instanceof Promise ? await profileResult2 : profileResult2) as { id: string } | undefined;
    if (!p1 || !p2) return res.json({ profileCompatibility: 50, reasons: [], sharedInterests: [], sharedValues: 0 });

    const [profileCompatibility, explanation] = await Promise.all([
      calculateProfileCompatibilityScore(p1.id, p2.id),
      generateMatchExplanation(p1.id, p2.id),
    ]);
    res.json({
      profileCompatibility,
      reasons: explanation.reasons,
      sharedInterests: explanation.sharedInterests,
      sharedValues: explanation.sharedValues,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Profile compatibility error:", error);
    res.status(500).json({ error: `Failed to get profile compatibility: ${errorMessage}` });
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

// Unlock a game (Truth or Dare / Never Have I Ever) by spending 1 Mulligan token - alternative to 10 messages each
matchesRouter.post("/:matchId/unlock-game", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { gameType } = req.body as { gameType?: string };

    if (!gameType || (gameType !== 'truth_or_dare' && gameType !== 'never_have_i_ever')) {
      return res.status(400).json({ error: "Invalid gameType. Must be 'truth_or_dare' or 'never_have_i_ever'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN (\'stage1\', \'stage2\')')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const SEVEN_MINUTES_MS = 7 * 60 * 1000;
    const unlockedUntil = new Date(Date.now() + SEVEN_MINUTES_MS);

    // Check if already unlocked and within 7-minute window (idempotent - no token spent)
    const existingUnlock = db
      .prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?')
      .get([matchId, gameType]) as { unlocked_until: string | null } | undefined;
    if (existingUnlock) {
      const until = existingUnlock.unlocked_until ? new Date(existingUnlock.unlocked_until) : null;
      if (!until || until > new Date()) {
        return res.json({ success: true, alreadyUnlocked: true, gameType });
      }
    }

    // Spend 1 token
    const tokensResult = db
      .prepare('SELECT id FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL ORDER BY granted_at ASC LIMIT 1')
      .get(userId) as { id: string } | undefined;
    if (!tokensResult) {
      return res.status(400).json({ error: "No tokens available. Claim your weekly token!" });
    }

    db.prepare('UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?').run(matchId, tokensResult.id);

    if (existingUnlock) {
      // Extend expired unlock with another 7 minutes
      db.prepare('UPDATE game_unlocks SET unlocked_until = ?, unlocked_at = CURRENT_TIMESTAMP WHERE match_id = ? AND game_type = ?')
        .run([unlockedUntil.toISOString(), matchId, gameType]);
    } else {
      db.prepare('INSERT INTO game_unlocks (match_id, game_type, unlocked_by_user_id, unlocked_until) VALUES (?, ?, ?, ?)')
        .run([matchId, gameType, userId, unlockedUntil.toISOString()]);
    }

    // Clear previous round's prompt and used-prompt history so both users see choice after unlock
    if (gameType === 'truth_or_dare') {
      db.prepare('UPDATE truth_or_dare_games SET current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run(['[]', matchId]);
    }
    if (gameType === 'never_have_i_ever') {
      db.prepare('UPDATE never_have_i_ever_games SET current_prompt = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([matchId]);
    }

    // Notify both users so their match list can refresh (gameUnlocks changed)
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`user:${match.user1_id}`).emit('game_unlocked', { matchId, gameType });
        io.to(`user:${match.user2_id}`).emit('game_unlocked', { matchId, gameType });
      }
    } catch (e) {
      console.warn('Socket emit for game_unlocked failed (non-critical):', e);
    }

    res.json({ success: true, gameType });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Unlock game error:", error);
    res.status(500).json({ error: `Failed to unlock game: ${errorMessage}` });
  }
});

// Game request: User A invites User B to play Truth or Dare or Never Have I Ever
// When User A sends a request, we unlock the game with User A's token so User B can play without spending a token
matchesRouter.post("/:matchId/game-request", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { gameType } = req.body as { gameType?: string };

    if (!gameType || (gameType !== 'truth_or_dare' && gameType !== 'never_have_i_ever')) {
      return res.status(400).json({ error: "Invalid gameType. Must be 'truth_or_dare' or 'never_have_i_ever'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN (\'stage1\', \'stage2\')')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const toUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    // Unlock the game with User A's token so User B can play without spending a token (same as unlock-game)
    const SEVEN_MINUTES_MS = 7 * 60 * 1000;
    const unlockedUntil = new Date(Date.now() + SEVEN_MINUTES_MS);
    const existingUnlock = db
      .prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?')
      .get([matchId, gameType]) as { unlocked_until: string | null } | undefined;
    if (!existingUnlock) {
      const tokensResult = db
        .prepare('SELECT id FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL ORDER BY granted_at ASC LIMIT 1')
        .get(userId) as { id: string } | undefined;
      if (!tokensResult) {
        return res.status(400).json({ error: "No tokens available. Use a token to invite them to play!" });
      }
      db.prepare('UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?').run(matchId, tokensResult.id);
      db.prepare('INSERT INTO game_unlocks (match_id, game_type, unlocked_by_user_id, unlocked_until) VALUES (?, ?, ?, ?)')
        .run([matchId, gameType, userId, unlockedUntil.toISOString()]);
      if (gameType === 'truth_or_dare') {
        db.prepare('UPDATE truth_or_dare_games SET current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run(['[]', matchId]);
      }
      try {
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to(`user:${match.user1_id}`).emit('game_unlocked', { matchId, gameType });
          io.to(`user:${match.user2_id}`).emit('game_unlocked', { matchId, gameType });
        }
      } catch (e) { /* ignore */ }
    } else {
      const until = existingUnlock.unlocked_until ? new Date(existingUnlock.unlocked_until) : null;
      if (until && until <= new Date()) {
        const tokensResult = db
          .prepare('SELECT id FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL ORDER BY granted_at ASC LIMIT 1')
          .get(userId) as { id: string } | undefined;
        if (!tokensResult) {
          return res.status(400).json({ error: "Your game session expired. Use a token to invite them again!" });
        }
        db.prepare('UPDATE mulligan_tokens SET used_at = CURRENT_TIMESTAMP, match_id = ? WHERE id = ?').run(matchId, tokensResult.id);
        db.prepare('UPDATE game_unlocks SET unlocked_until = ?, unlocked_at = CURRENT_TIMESTAMP WHERE match_id = ? AND game_type = ?')
          .run([unlockedUntil.toISOString(), matchId, gameType]);
        if (gameType === 'truth_or_dare') {
          db.prepare('UPDATE truth_or_dare_games SET current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run(['[]', matchId]);
        }
        try {
          const { getIO } = await import('../socket.js');
          const io = getIO();
          if (io) {
            io.to(`user:${match.user1_id}`).emit('game_unlocked', { matchId, gameType });
            io.to(`user:${match.user2_id}`).emit('game_unlocked', { matchId, gameType });
          }
        } catch (e) { /* ignore */ }
      }
    }

    // If there's an existing pending request, cancel it and create a fresh one (avoids stale "pending" blocking new requests)
    const existingResult = db
      .prepare(
        `SELECT id FROM game_requests WHERE match_id = ? AND from_user_id = ? AND game_type = ? AND status = 'pending'`
      )
      .get([matchId, userId, gameType]) as { id: string } | undefined;

    if (existingResult) {
      db.prepare(`UPDATE game_requests SET status = 'cancelled' WHERE id = ?`).run(existingResult.id);
    }

    const requestId = uuidv4();
    db.prepare(
      `INSERT INTO game_requests (id, match_id, from_user_id, to_user_id, game_type, status) VALUES (?, ?, ?, ?, ?, 'pending')`
    ).run([requestId, matchId, userId, toUserId, gameType]);

    const profile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId) as { display_name: string } | undefined;
    const fromUserName = profile?.display_name || 'Someone';

    const { getIO } = await import('../socket.js');
    const io = getIO();
    if (io) {
      io.to(`user:${toUserId}`).emit('game_request_received', {
        requestId,
        matchId,
        fromUserId: userId,
        fromUserName,
        gameType,
      });
    }

    try {
      const { sendGameRequestPushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
      if (isPushNotificationConfigured()) {
        const toUserTokenResult = db.prepare('SELECT push_token FROM users WHERE id = ?').get(toUserId) as { push_token: string | null } | undefined;
        if (toUserTokenResult?.push_token && isExpoPushToken(toUserTokenResult.push_token)) {
          await sendGameRequestPushNotification(
            toUserTokenResult.push_token,
            fromUserName,
            gameType as 'truth_or_dare' | 'never_have_i_ever',
            matchId,
            userId,
            requestId
          );
          console.log(`✅ Sent game request push notification to ${toUserId}`);
        }
      }
    } catch (pushErr) {
      console.warn('⚠️  Failed to send game request push notification (non-critical):', pushErr);
    }

    res.json({ requestId, matchId, gameType, fromUserName, status: 'pending' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Game request error:", error);
    res.status(500).json({ error: `Failed to create game request: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/game-request/:requestId/respond", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId, requestId } = req.params;
    const { accept } = req.body as { accept?: boolean };

    if (typeof accept !== 'boolean') {
      return res.status(400).json({ error: "Invalid body. Must include accept: true or accept: false." });
    }

    const row = db
      .prepare(
        `SELECT * FROM game_requests WHERE id = ? AND match_id = ? AND to_user_id = ? AND status = 'pending'`
      )
      .get([requestId, matchId, userId]) as { id: string; from_user_id: string; to_user_id: string; game_type: string } | undefined;

    if (!row) {
      return res.status(404).json({ error: "Request not found or already responded" });
    }

    db.prepare(`UPDATE game_requests SET status = ? WHERE id = ?`).run(accept ? 'accepted' : 'denied', requestId);

    const { getIO } = await import('../socket.js');
    const io = getIO();
    if (io) {
      io.to(`user:${row.from_user_id}`).emit('game_request_responded', {
        requestId,
        matchId,
        fromUserId: row.from_user_id,
        toUserId: userId,
        gameType: row.game_type,
        accepted: accept,
      });
    }

    res.json({ requestId, matchId, gameType: row.game_type, accepted: accept });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Game request respond error:", error);
    res.status(500).json({ error: `Failed to respond to game request: ${errorMessage}` });
  }
});

// Helper: more conservative of two spice choices (no turn logic)
function moreConservativeSpice(a: string | null, b: string | null): 'pg13' | 'ratedr' | 'spicy' | null {
  if (!a || !b) return null;
  const order: Record<string, number> = { pg13: 1, ratedr: 2, spicy: 3 };
  const oa = order[a] ?? 1;
  const ob = order[b] ?? 1;
  const level = oa <= ob ? a : b;
  return level === 'ratedr' ? 'ratedr' : level === 'spicy' ? 'spicy' : 'pg13';
}

// Get Truth or Dare game state — both users pick version; no turns
matchesRouter.get("/:matchId/truth-or-dare/state", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const isUser1 = match.user1_id === userId;

    const unlockRow = db.prepare('SELECT unlocked_by_user_id, unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_by_user_id: string; unlocked_until: string | null } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Truth or Dare must be unlocked with a Mulligan token to play." });
    }
    const until = unlockRow.unlocked_until ? new Date(unlockRow.unlocked_until) : null;
    if (until && until <= new Date()) {
      return res.status(400).json({ error: "Your Truth or Dare session expired. Use another token to play for 7 more minutes." });
    }

    let gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    let game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;

    if (!game) {
      db.prepare(`INSERT INTO truth_or_dare_games (match_id) VALUES (?)`).run([matchId]);
      game = { match_id: matchId, user1_spice_choice: null, user2_spice_choice: null, spice_level: null };
    }

    const yourSpiceChoice = (isUser1 ? game.user1_spice_choice : game.user2_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
    const theirSpiceChoice = (isUser1 ? game.user2_spice_choice : game.user1_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
    const spiceReady = !!(yourSpiceChoice && theirSpiceChoice);
    const spiceLevel = spiceReady ? moreConservativeSpice(game.user1_spice_choice, game.user2_spice_choice) : (game.spice_level as 'pg13' | 'ratedr' | 'spicy' | null);
    const currentPrompt = game.current_prompt ?? null;
    const currentPromptType = (game.current_prompt_type === 'truth' || game.current_prompt_type === 'dare') ? game.current_prompt_type : null;

    res.json({
      yourSpiceChoice: yourSpiceChoice ?? null,
      theirSpiceChoice: theirSpiceChoice ?? null,
      spiceReady,
      spiceLevel,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      currentPrompt,
      currentPromptType,
      unlockedUntil: unlockRow.unlocked_until ?? null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Truth or Dare state error:", error);
    res.status(500).json({ error: `Failed to get game state: ${errorMessage}` });
  }
});

// Set Truth or Dare spice choice — both users pick; when both have chosen, game is ready
matchesRouter.post("/:matchId/truth-or-dare/spice-choice", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { choice } = req.body as { choice?: string };

    if (!choice || (choice !== 'pg13' && choice !== 'ratedr' && choice !== 'spicy')) {
      return res.status(400).json({ error: "Invalid choice. Must be 'pg13', 'ratedr', or 'spicy'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const isUser1 = match.user1_id === userId;

    const unlockRow = db.prepare('SELECT unlocked_by_user_id, unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_by_user_id: string; unlocked_until: string | null } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Truth or Dare must be unlocked with a Mulligan token to play." });
    }
    const spiceUntil = unlockRow.unlocked_until ? new Date(unlockRow.unlocked_until) : null;
    if (spiceUntil && spiceUntil <= new Date()) {
      return res.status(400).json({ error: "Your Truth or Dare session expired. Use another token to play for 7 more minutes." });
    }

    let gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    let game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;

    if (!game) {
      db.prepare(
        `INSERT INTO truth_or_dare_games (match_id, user1_spice_choice, user2_spice_choice, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      ).run([matchId, isUser1 ? choice : null, isUser1 ? null : choice]);
    } else {
      db.prepare(
        `UPDATE truth_or_dare_games SET ${isUser1 ? 'user1_spice_choice' : 'user2_spice_choice'} = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?`
      ).run([choice, matchId]);
    }

    gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;
    const c1 = game.user1_spice_choice as string | null;
    const c2 = game.user2_spice_choice as string | null;
    const spiceReady = !!(c1 && c2);
    if (spiceReady) {
      const level = moreConservativeSpice(c1, c2);
      db.prepare(`UPDATE truth_or_dare_games SET spice_level = ?, current_prompt = NULL, current_prompt_type = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?`).run([level, matchId]);
      game.spice_level = level;
      try {
        const notifyMsgId = uuidv4();
        const notifyContent = '🎲 Truth or Dare is ready! Pick Truth or Dare anytime.';
        db.prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`).run([notifyMsgId, matchId, userId, notifyContent]);
        const senderProfile = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get([userId]) as { display_name: string } | undefined;
        const senderName = senderProfile?.display_name || 'Someone';
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) io.to(`match:${matchId}`).emit('new_message', { id: notifyMsgId, matchId, content: notifyContent, imageUrl: null, senderId: userId, senderName, sentAt: new Date().toISOString(), readAt: null });
        const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
        if (isPushNotificationConfigured()) {
          const otherTokenRow = db.prepare('SELECT push_token FROM users WHERE id = ?').get([otherUserId]) as { push_token: string | null } | undefined;
          if (otherTokenRow?.push_token && isExpoPushToken(otherTokenRow.push_token)) {
            await sendMessagePushNotification(otherTokenRow.push_token, senderName, notifyContent, matchId, userId);
          }
        }
      } catch (e) {
        console.warn('Truth or Dare chat notification failed:', e);
      }
    }

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId });
    } catch (e) {
      console.warn('Socket emit failed:', e);
    }

    const yourSpiceChoice = choice as 'pg13' | 'ratedr' | 'spicy';
    const theirSpiceChoice = (isUser1 ? game.user2_spice_choice : game.user1_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
    const spiceLevel = spiceReady ? moreConservativeSpice(game.user1_spice_choice, game.user2_spice_choice) : null;

    res.json({
      yourSpiceChoice,
      theirSpiceChoice: theirSpiceChoice ?? null,
      spiceReady,
      spiceLevel,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Truth or Dare spice choice error:", error);
    res.status(500).json({ error: `Failed to set spice choice: ${errorMessage}` });
  }
});

// Generate AI Truth or Dare prompt (free, no token cost)
matchesRouter.post("/:matchId/truth-or-dare", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { type, anotherOne } = req.body as { type?: 'truth' | 'dare'; anotherOne?: boolean };

    if (!type || (type !== 'truth' && type !== 'dare')) {
      return res.status(400).json({ error: "Invalid type. Must be 'truth' or 'dare'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    const game = (gameResult instanceof Promise ? await gameResult : gameResult) as { spice_level: string | null } | undefined;

    const unlockRowToD = db.prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_until: string | null } | undefined;
    if (!unlockRowToD) {
      return res.status(400).json({ error: "Truth or Dare must be unlocked with a Mulligan token to play." });
    }
    const todUntil = unlockRowToD.unlocked_until ? new Date(unlockRowToD.unlocked_until) : null;
    if (todUntil && todUntil <= new Date()) {
      return res.status(400).json({ error: "Your Truth or Dare session expired. Use another token to play for 7 more minutes." });
    }
    if (!game?.spice_level) {
      return res.status(400).json({ error: "Game not ready. Both of you need to pick a version first." });
    }

    const level = (game.spice_level === 'ratedr' ? 'ratedr' : game.spice_level === 'spicy' ? 'spicy' : 'pg13') as 'pg13' | 'ratedr' | 'spicy';
    const currentPrompt = (game as any).current_prompt ?? null;
    const currentPromptType = (game as any).current_prompt_type ?? null;

    // If there's already a prompt of this type and user didn't click "Another one", return it (don't regenerate)
    if (!anotherOne && currentPrompt && currentPrompt.trim() && currentPromptType === type) {
      return res.json({ prompt: currentPrompt, fromAI: false, spiceLevel: level });
    }

    let usedPrompts: string[] = [];
    try {
      const raw = (game as any).used_prompts;
      if (raw && typeof raw === 'string') usedPrompts = JSON.parse(raw);
      else if (Array.isArray(raw)) usedPrompts = raw;
    } catch {
      usedPrompts = [];
    }
    const excludePrompts = [...usedPrompts];
    if (currentPrompt && currentPrompt.trim()) excludePrompts.push(currentPrompt);

    const { generateTruthOrDarePrompt } = await import('../services/truthOrDare.js');

    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    let prompt = '';
    let fromAI = false;
    const maxTries = 3;
    for (let attempt = 0; attempt < maxTries; attempt++) {
      const result = await generateTruthOrDarePrompt(type, matchId, userId, level, excludePrompts);
      prompt = result.prompt;
      fromAI = result.fromAI;
      const isDuplicate = excludePrompts.some((p) => normalize(p) === normalize(prompt));
      if (!isDuplicate) break;
      if (attempt === maxTries - 1) {
        prompt = prompt + (prompt.endsWith('?') ? ' (pick a new angle)' : '?');
      }
    }

    const newUsedPrompts = [...usedPrompts, prompt];
    db.prepare('UPDATE truth_or_dare_games SET current_prompt = ?, current_prompt_type = ?, used_prompts = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([prompt, type, JSON.stringify(newUsedPrompts), matchId]);
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId });
    } catch (e) { /* ignore */ }

    res.json({ prompt, fromAI, spiceLevel: level });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Truth or Dare error:", error);
    res.status(500).json({ error: `Failed to generate prompt: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/truth-or-dare/send-to-chat", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db.prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as { user1_id: string; user2_id: string } | undefined;
    if (!match) return res.status(404).json({ error: "Match not found" });

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId });
    } catch (e) { /* ignore */ }
    res.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Truth or Dare send-to-chat error:", error);
    res.status(500).json({ error: errorMessage });
  }
});

// Never Have I Ever game
matchesRouter.post("/:matchId/never-have-i-ever/spice-choice", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { choice } = req.body as { choice?: string };

    if (!choice || (choice !== 'pg13' && choice !== 'ratedr' && choice !== 'spicy')) {
      return res.status(400).json({ error: "Invalid choice. Must be 'pg13', 'ratedr', or 'spicy'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Never Have I Ever requires token unlock; either user can set or change the version
    const unlockRow = db.prepare('SELECT unlocked_by_user_id FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { unlocked_by_user_id: string } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Never Have I Ever must be unlocked with a Mulligan token to play." });
    }

    const { setMySpiceChoice } = await import('../services/neverHaveIEver.js');
    const state = await setMySpiceChoice(matchId, userId, match, choice as 'pg13' | 'ratedr' | 'spicy');

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever notification');
    }

    res.json({ ...state, tokenUnlocked: true, needsSpiceChoiceFromUnlocker: false });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever spice choice error:", error);
    res.status(500).json({ error: `Failed to set spice choice: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/never-have-i-ever/start", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const unlockRow = db.prepare('SELECT 1 FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { 1?: number } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Never Have I Ever must be unlocked with a Mulligan token to play." });
    }

    const { startGame } = await import('../services/neverHaveIEver.js');
    const state = await startGame(matchId, userId, match);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever notification');
    }

    res.json(state);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever start error:", error);
    res.status(500).json({ error: `Failed to start game: ${errorMessage}` });
  }
});

matchesRouter.get("/:matchId/never-have-i-ever", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    // Never Have I Ever requires token unlock
    const unlockRow = db.prepare('SELECT unlocked_by_user_id FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { unlocked_by_user_id: string } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Never Have I Ever must be unlocked with a Mulligan token to play." });
    }

    const { getGameState } = await import('../services/neverHaveIEver.js');
    const state = await getGameState(matchId, userId, match);

    if (state.phase === 'playing') {
      console.log(`🙊 Never Have I Ever GET state: match=${matchId} yourStrikes=${state.yourStrikes} theirStrikes=${state.theirStrikes} bothAnswered=${state.bothAnswered} promptLen=${state.prompt?.length ?? 0}`);
    }

    res.json({
      ...state,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: !state.spiceReady,
      unlockedByUserId: unlockRow.unlocked_by_user_id ?? null,
      currentTurnUserId: state.currentTurnUserId ?? null,
      isYourTurn: state.isYourTurn ?? false,
      // Tally: points = number of "I have" (same as strikes in DB)
      yourPoints: state.yourStrikes ?? 0,
      theirPoints: state.theirStrikes ?? 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever get error:", error);
    res.status(500).json({ error: `Failed to get game state: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/never-have-i-ever/answer", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { answer } = req.body as { answer?: string };

    if (!answer || (answer !== 'have' && answer !== 'havent')) {
      return res.status(400).json({ error: "Invalid answer. Must be 'have' or 'havent'." });
    }

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const unlockRow = db.prepare('SELECT unlocked_by_user_id FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { unlocked_by_user_id?: string } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Never Have I Ever must be unlocked with a Mulligan token to play." });
    }

    const { submitAnswer, submitTurnAnswer } = await import('../services/neverHaveIEver.js');
    const rowResult = db.prepare('SELECT spice_level, current_prompt, current_turn_user_id FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    let row = (rowResult instanceof Promise ? await rowResult : rowResult) as { spice_level: string | null; current_prompt: string | null; current_turn_user_id: string | null } | undefined;
    let isTurnBased = !!row?.current_turn_user_id;
    if (!isTurnBased && row?.spice_level && row?.current_prompt) {
      const firstTurnUserId = unlockRow.unlocked_by_user_id
        ? (match.user1_id === unlockRow.unlocked_by_user_id ? match.user2_id : match.user1_id)
        : match.user1_id;
      db.prepare('UPDATE never_have_i_ever_games SET current_turn_user_id = ?, updated_at = ? WHERE match_id = ?').run([firstTurnUserId, new Date().toISOString(), matchId]);
      isTurnBased = true;
    }

    const { state, roundResult } = isTurnBased
      ? await submitTurnAnswer(matchId, userId, match, answer as 'have' | 'havent')
      : await submitAnswer(matchId, userId, match, answer as 'have' | 'havent');

    console.log(`🙊 Never Have I Ever answer: match=${matchId} user=${userId} answer=${answer} bothAnswered=${state.bothAnswered} yourStrikes=${state.yourStrikes} theirStrikes=${state.theirStrikes} promptLen=${state.prompt?.length ?? 0}`);

    // Notify other user via socket
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever notification');
    }

    res.json({
      ...state,
      roundResult,
      yourPoints: state.yourStrikes ?? 0,
      theirPoints: state.theirStrikes ?? 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever answer error:", error);
    res.status(500).json({ error: `Failed to submit answer: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/never-have-i-ever/next", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { advanceToNextRound } = await import('../services/neverHaveIEver.js');
    const state = await advanceToNextRound(matchId, userId, match);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever notification');
    }

    res.json(state);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever next error:", error);
    res.status(500).json({ error: `Failed to advance round: ${errorMessage}` });
  }
});

matchesRouter.post("/:matchId/never-have-i-ever/restart", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const { startNewGame } = await import('../services/neverHaveIEver.js');
    const state = await startNewGame(matchId, userId, match);
    res.json(state);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever restart error:", error);
    res.status(500).json({ error: `Failed to restart game: ${errorMessage}` });
  }
});

// Simplified: get another prompt (no turns, no strikes). Either user can call.
matchesRouter.post("/:matchId/never-have-i-ever/another", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }

    const unlockRow = db.prepare('SELECT 1 FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { 1?: number } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Never Have I Ever must be unlocked with a Mulligan token to play." });
    }

    const rowResult = db.prepare('SELECT spice_level, current_prompt FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const row = (rowResult instanceof Promise ? await rowResult : rowResult) as { spice_level: string | null; current_prompt: string | null } | undefined;
    if (!row?.spice_level) {
      return res.status(400).json({ error: "Set the version (PG-13 / R / Spicy) first." });
    }

    const { generateNeverHaveIEverPrompt } = await import('../services/neverHaveIEver.js');
    const spiceLevel = (row.spice_level === 'ratedr' ? 'ratedr' : row.spice_level === 'spicy' ? 'spicy' : 'pg13') as 'pg13' | 'ratedr' | 'spicy';
    const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
    db.prepare('UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([prompt, matchId]);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
    } catch (e) { /* ignore */ }

    res.json({ prompt });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever another error:", error);
    res.status(500).json({ error: `Failed to get another prompt: ${errorMessage}` });
  }
});

// Simplified: send current prompt to chat (frontend sends the message; this just notifies)
matchesRouter.post("/:matchId/never-have-i-ever/send-to-chat", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;

    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)')
      .get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as { user1_id: string; user2_id: string } | undefined;
    if (!match) return res.status(404).json({ error: "Match not found" });

    const unlockRow = db.prepare('SELECT 1 FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'never_have_i_ever']) as { 1?: number } | undefined;
    if (!unlockRow) return res.status(400).json({ error: "Never Have I Ever must be unlocked to play." });

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId });
    } catch (e) { /* ignore */ }
    res.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever send-to-chat error:", error);
    res.status(500).json({ error: errorMessage });
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

    // Determine the other user (the one who should be notified)
    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    // Get current user's display name for the notification
    const currentUserProfileResult = db
      .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
      .get([userId]);
    const currentUserProfile = (currentUserProfileResult instanceof Promise
      ? await currentUserProfileResult
      : currentUserProfileResult) as { display_name: string | null } | undefined;
    const currentUserName = currentUserProfile?.display_name || 'Someone';

    // Generate date plan
    console.log(`📅 Generating date plan for match ${matchId}, user ${userId}`);
    console.log(`📅 Shared interests:`, sharedInterests);
    const { generateDatePlan } = await import('../services/dateBlueprint.js');
    const plan = await generateDatePlan(matchId, userId, sharedInterests);
    console.log(`✅ Date plan generated:`, plan.id);

    // Send push notification to the other user
    try {
      const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
      
      if (isPushNotificationConfigured()) {
        // Get the other user's push token
        const otherUserPushTokenResult = db
          .prepare('SELECT push_token FROM users WHERE id = ?')
          .get([otherUserId]);
        const otherUserPushToken = (otherUserPushTokenResult instanceof Promise
          ? await otherUserPushTokenResult
          : otherUserPushTokenResult) as { push_token: string | null } | undefined;

        if (otherUserPushToken?.push_token && isExpoPushToken(otherUserPushToken.push_token)) {
          await sendMessagePushNotification(
            otherUserPushToken.push_token,
            currentUserName,
            `created a date plan: "${plan.title}"`,
            matchId,
            userId
          );
          console.log(`✅ Sent push notification for date plan generation to user ${otherUserId}`);
        } else {
          console.log(`ℹ️  No valid push token for user ${otherUserId}, skipping push notification`);
        }
      }
    } catch (pushError) {
      // Push notifications are optional, don't fail date plan generation if push fails
      console.warn('⚠️  Failed to send push notification for date plan generation (non-critical):', pushError);
    }

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

    console.log(`📅 Returning plan to client:`, { planId: plan.id, title: plan.title });
    res.json({ 
      success: true,
      plan 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error("❌ Generate date plan error:", errorMessage);
    console.error("❌ Error stack:", errorStack);
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

    // Determine the other user (the one who should be notified)
    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    // Get current user's display name for the notification
    const currentUserProfileResult = db
      .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
      .get([userId]);
    const currentUserProfile = (currentUserProfileResult instanceof Promise
      ? await currentUserProfileResult
      : currentUserProfileResult) as { display_name: string | null } | undefined;
    const currentUserName = currentUserProfile?.display_name || 'Someone';

    // Send push notification when date plan is accepted
    if (action === 'accept') {
      try {
        const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
        
        if (isPushNotificationConfigured()) {
          // Get the other user's push token
          const otherUserPushTokenResult = db
            .prepare('SELECT push_token FROM users WHERE id = ?')
            .get([otherUserId]);
          const otherUserPushToken = (otherUserPushTokenResult instanceof Promise
            ? await otherUserPushTokenResult
            : otherUserPushTokenResult) as { push_token: string | null } | undefined;

          if (otherUserPushToken?.push_token && isExpoPushToken(otherUserPushToken.push_token)) {
            await sendMessagePushNotification(
              otherUserPushToken.push_token,
              currentUserName,
              `wants to confirm the date plan: "${plan.title}"`,
              matchId,
              userId
            );
            console.log(`✅ Sent push notification for date plan acceptance to user ${otherUserId}`);
          } else {
            console.log(`ℹ️  No valid push token for user ${otherUserId}, skipping push notification`);
          }
        }
      } catch (pushError) {
        // Push notifications are optional, don't fail date plan action if push fails
        console.warn('⚠️  Failed to send push notification for date plan acceptance (non-critical):', pushError);
      }
    }

    // Insert a small system-style message in chat so both users see the update
    try {
      const systemMessageId = uuidv4();
      let systemContent = '';
      if (action === 'accept') {
        systemContent = `📅 ${currentUserName} accepted the date plan!`;
      } else if (action === 'decline') {
        systemContent = `📅 ${currentUserName} declined the date plan`;
      } else if (action === 'modify') {
        systemContent = `📅 ${currentUserName} suggested modifications to the date plan`;
      }
      if (systemContent) {
        db.prepare(
          `INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`
        ).run([systemMessageId, matchId, userId, systemContent]);
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to(`match:${matchId}`).emit('new_message', {
            id: systemMessageId,
            matchId,
            content: systemContent,
            imageUrl: null,
            senderId: userId,
            senderName: currentUserName,
            sentAt: new Date().toISOString(),
            readAt: null,
          });
        }
      }
    } catch (msgErr) {
      console.warn('⚠️  Failed to insert date plan update message (non-critical):', msgErr);
    }

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

// Update date plan suggested date/time
matchesRouter.put("/:matchId/date-plan/:planId/date-time", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId, planId } = req.params;
    const { suggestedDate, suggestedTime } = req.body;

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

    const { updateDatePlanDateTime } = await import('../services/dateBlueprint.js');
    const plan = await updateDatePlanDateTime(planId, userId, suggestedDate, suggestedTime);

    // Notify via Socket.io
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('date_plan_updated', {
          matchId,
          planId,
          action: 'date_updated',
          plan,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for date plan update notification');
    }

    res.json({ plan, message: 'Date plan date/time updated successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Date plan date/time update error:", error);
    res.status(500).json({ error: `Failed to update date plan date/time: ${errorMessage}` });
  }
});

