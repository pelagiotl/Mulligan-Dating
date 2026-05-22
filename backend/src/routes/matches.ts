import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { generateWeeklyMatches, generateMatchExplanation, calculateProfileCompatibilityScore } from "../services/matching.js";
import { mutualGenderPreferencesMet } from "../utils/genderPreferences.js";
import { recordSuccessSignal } from "../utils/successTracking.js";
import { rateLimitAPI } from "../middleware/security.js";
import { geocodeLocation, calculateDistanceMiles } from "../utils/geocoding.js";
import { getActiveMatchingRegion, isInRegion, isLikelyInRegionByText, REGION_MAX_DISTANCE_MILES } from "../config/regions.js";
import { getHiddenFromBrowseUserIds } from "../config/hiddenFromBrowse.js";
import { isMatchmakingGloballyDisabled, matchmakingDisabledJson } from "../config/matchmaking.js";
import {
  connectSetupErrorPayload,
  getConnectSetupViolationsForUser,
} from "../utils/connectRequirements.js";
import { checkDealbreakers } from "../utils/dealbreakers.js";
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

const CHAT_MEDIA_MIN_MESSAGES_EACH = 3;
const CHAT_MEDIA_LOCKED_MESSAGE =
  "Photos, video, and voice unlock after you and your match have each sent at least 3 messages in this chat.";

async function getSenderMessageCounts(
  matchId: string,
  user1Id: string,
  user2Id: string
): Promise<{ user1: number; user2: number }> {
  const countResult = db
    .prepare(`SELECT sender_id, COUNT(*) as count FROM messages WHERE match_id = ? GROUP BY sender_id`)
    .all([matchId]);
  const counts = (countResult instanceof Promise ? await countResult : countResult) as Array<{ sender_id: string; count: number }>;
  return {
    user1: counts.find((c) => c.sender_id === user1Id)?.count ?? 0,
    user2: counts.find((c) => c.sender_id === user2Id)?.count ?? 0,
  };
}

function bothUsersMetChatMediaThreshold(user1Count: number, user2Count: number): boolean {
  return user1Count >= CHAT_MEDIA_MIN_MESSAGES_EACH && user2Count >= CHAT_MEDIA_MIN_MESSAGES_EACH;
}

/** Games, NHIE, and date-plan generation require more chat back-and-forth than photo/media unlock */
const MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH = 7;

const TRUTH_OR_DARE_LOCKED_MESSAGE = `Truth or Dare unlocks after you and your match have each sent at least ${MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH} messages in this chat.`;
const NEVER_HAVE_I_EVER_LOCKED_MESSAGE = `Never Have I Ever unlocks after you and your match have each sent at least ${MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH} messages in this chat.`;
const DATE_PLAN_LOCKED_MESSAGE = `Hangout plans unlock after you and your match have each sent at least ${MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH} messages in this chat.`;

function bothUsersMetMatchChatDepthThreshold(user1Count: number, user2Count: number): boolean {
  return user1Count >= MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH && user2Count >= MATCH_CHAT_DEPTH_MIN_MESSAGES_EACH;
}

/** @deprecated use bothUsersMetMatchChatDepthThreshold */
function bothUsersMetTruthOrDareThreshold(user1Count: number, user2Count: number): boolean {
  return bothUsersMetMatchChatDepthThreshold(user1Count, user2Count);
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
      .prepare("SELECT COALESCE(match_slot_limit, 50) as slot_limit FROM users WHERE id = ?")
      .get([userId]);
    const limitRow = (limitResult instanceof Promise ? await limitResult : limitResult) as { slot_limit: number | string } | undefined;
    const slotLimit = Math.floor(Number(limitRow?.slot_limit ?? 50));

    res.json({ count, slotLimit });
  } catch (error) {
    console.error('Matches count error:', error);
    res.status(500).json({ error: 'Failed to get match count', count: 0, slotLimit: 50 });
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
                p1.photo_url as user1_photo, p1.gender as user1_gender, p1.location as user1_location, p1.looking_for as user1_looking_for,
                p2.display_name as user2_name, p2.age as user2_age, p2.bio as user2_bio,
                p2.photo_url as user2_photo, p2.gender as user2_gender, p2.location as user2_location, p2.looking_for as user2_looking_for,
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

    // Current user's profile id (for profile-based compatibility on cards)
    const currentUserProfileRow = db.prepare("SELECT id FROM profiles WHERE user_id = ?").get(userId) as { id: string } | undefined;
    const currentUserProfileId = currentUserProfileRow?.id ?? null;

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
          isPrimary: photo.is_primary === 1 || (photo.is_primary as unknown) === true,
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

    // Batch fetch all preferences — values + who they want to connect with (preferred_genders)
    const preferencesMap = new Map<string, string[]>(); // profileId -> values[]
    const preferredGendersMap = new Map<string, string[] | null>(); // profileId -> raw preferred genders from JSON
    if (profileIdsArray.length > 0) {
      const placeholders = profileIdsArray.map(() => '?').join(',');
      const preferencesResult = db
        .prepare(`SELECT profile_id, "values", preferred_genders FROM preferences WHERE profile_id IN (${placeholders})`)
        .all(profileIdsArray);
      const preferences = (preferencesResult instanceof Promise
        ? await preferencesResult
        : preferencesResult) as { profile_id: string; values: string | null; preferred_genders: string | null }[];

      preferences.forEach((pref) => {
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
        if (pref.preferred_genders) {
          try {
            const g = JSON.parse(pref.preferred_genders) as string[];
            preferredGendersMap.set(pref.profile_id, Array.isArray(g) ? g : null);
          } catch {
            preferredGendersMap.set(pref.profile_id, null);
          }
        } else {
          preferredGendersMap.set(pref.profile_id, null);
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

    // Batch fetch dealbreaker labels (what each profile won't accept in a match)
    const dealbreakersMap = new Map<string, string[]>();
    if (profileIdsArray.length > 0) {
      try {
        const placeholders = profileIdsArray.map(() => '?').join(',');
        const dbRows = db
          .prepare(
            `SELECT profile_id, description FROM dealbreakers WHERE profile_id IN (${placeholders}) ORDER BY profile_id, id`
          )
          .all(profileIdsArray);
        const rows = (dbRows instanceof Promise ? await dbRows : dbRows) as {
          profile_id: string;
          description: string;
        }[];
        rows.forEach((row) => {
          if (!dealbreakersMap.has(row.profile_id)) {
            dealbreakersMap.set(row.profile_id, []);
          }
          dealbreakersMap.get(row.profile_id)!.push(row.description);
        });
      } catch {
        // dealbreakers table may be missing on older DBs
      }
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

    // Now format matches using the batch-fetched data and add profile-based compatibility for cards
    const formattedMatches: any[] = [];
    for (const m of matches) {
      const isUser1 = m.user1_id === userId;
      const otherUserId = isUser1 ? m.user2_id : m.user1_id;
      const otherProfileId = profileIdsMap.get(otherUserId);

      // Get primary photo
      let primaryPhotoUrl: string | null = null;
      if (otherProfileId) {
        primaryPhotoUrl = primaryPhotosMap.get(otherProfileId) || null;
        if (!primaryPhotoUrl) {
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
        lookingFor: isUser1 ? (m.user2_looking_for ?? null) : (m.user1_looking_for ?? null),
        photoUrl: (m.stage === "stage1" || m.stage === "stage2") ? primaryPhotoUrl : null,
        last_active_at: otherLastActive,
        show_active_status: otherShowActive,
      };

      const interests = otherProfileId ? (interestsMap.get(otherProfileId) || []) : [];
      const values = otherProfileId ? (preferencesMap.get(otherProfileId) || []) : [];
      const partnerQualities = otherProfileId ? (partnerQualitiesMap.get(otherProfileId) || []) : [];
      const dealbreakers = otherProfileId ? (dealbreakersMap.get(otherProfileId) || []) : [];
      const preferredGenders = otherProfileId ? (preferredGendersMap.get(otherProfileId) ?? null) : null;
      const unreadMessageCount = unreadCountsMap.get(m.id) || 0;
      const gameUnlocks = gameUnlocksMap.get(m.id) || { truth_or_dare: false, never_have_i_ever: false };
      const compatibilityScore = compatibilityScoresMap.get(m.id) ?? null;

      // Profile-based compatibility for match card (shared interests, preferences, etc.) — separate from pulse
      let profileCompatibility: number | null = null;
      if (currentUserProfileId && otherProfileId) {
        try {
          profileCompatibility = await calculateProfileCompatibilityScore(currentUserProfileId, otherProfileId);
        } catch (e) {
          // ignore
        }
      }

      const photos = m.stage === "stage2" && otherProfileId
        ? (allPhotosByProfileMap.get(otherProfileId) || [])
        : undefined;

      formattedMatches.push({
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
        profileCompatibility,
        otherUser: {
          ...otherUser,
          profileId: otherProfileId,
          interests,
          values,
          partnerQualities,
          dealbreakers,
          preferredGenders,
          lastActiveAt: otherUser.show_active_status ? (otherUser.last_active_at || null) : null,
          ...(photos !== undefined && { photos }),
        },
      });
    }

    console.log(`✅ Returning ${formattedMatches.length} formatted matches to user ${userId}`);
    res.json({ matches: formattedMatches });
  } catch (error) {
    console.error('Matches GET error:', error);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// Send a match request (use a token) - AUTOMATIC MATCH
// Match limit: default 50 per user. Tokens stay at 7 (weekly claim, max 7).
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

  if (isMatchmakingGloballyDisabled()) {
    return res.status(403).json(matchmakingDisabledJson());
  }

  try {
    const hiddenFromBrowse = await getHiddenFromBrowseUserIds();
    if (hiddenFromBrowse.includes(targetUserId)) {
      return res.status(404).json({ error: 'Profile not available' });
    }

    const targetRestrictedResult = db.prepare("SELECT is_restricted FROM users WHERE id = ?").get([targetUserId]);
    const targetRestrictedRow = (targetRestrictedResult instanceof Promise
      ? await targetRestrictedResult
      : targetRestrictedResult) as { is_restricted: number | null } | undefined;
    if (targetRestrictedRow?.is_restricted === 1) {
      return res.status(404).json({ error: "Profile not available" });
    }

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
      .prepare("SELECT id, gender FROM profiles WHERE user_id = ?")
      .get([userId]);
    const userProfile = (userProfileResult instanceof Promise
      ? await userProfileResult
      : userProfileResult) as { id: string; gender: string } | undefined;

    if (!userProfile) {
      return res.status(400).json({ error: "Please complete your profile first" });
    }

    const connectViolations = await getConnectSetupViolationsForUser(userId);
    if (connectViolations.length > 0) {
      return res.status(400).json(connectSetupErrorPayload(connectViolations));
    }

    // Check if target user profile exists and load gender for preference check
    const targetProfileResult = db
      .prepare("SELECT id, gender FROM profiles WHERE user_id = ?")
      .get([targetUserId]);
    const targetProfile = (targetProfileResult instanceof Promise
      ? await targetProfileResult
      : targetProfileResult) as { id: string; gender: string } | undefined;

    if (!targetProfile) {
      return res.status(400).json({ error: "Target user profile not found" });
    }

    const userPrefsResult = db.prepare("SELECT preferred_genders FROM preferences WHERE profile_id = ?").get([userProfile.id]);
    const userPrefsRow = (userPrefsResult instanceof Promise ? await userPrefsResult : userPrefsResult) as { preferred_genders: string | null } | undefined;
    const targetPrefsResult = db.prepare("SELECT preferred_genders FROM preferences WHERE profile_id = ?").get([targetProfile.id]);
    const targetPrefsRow = (targetPrefsResult instanceof Promise ? await targetPrefsResult : targetPrefsResult) as { preferred_genders: string | null } | undefined;

    if (
      !mutualGenderPreferencesMet(
        userProfile.gender || '',
        userPrefsRow?.preferred_genders ?? null,
        targetProfile.gender || '',
        targetPrefsRow?.preferred_genders ?? null
      )
    ) {
      return res.status(400).json({
        error:
          "You and this person aren't a match based on connection preferences (including who you each want to connect with).",
        code: "PREFERENCE_MISMATCH",
      });
    }

    // Same vetoes as browse: no new rules, only ensures Connect cannot bypass dealbreaker + lifestyle checks.
    const dealbreakersAllowPair =
      (await checkDealbreakers(userProfile.id, targetProfile.id)) &&
      (await checkDealbreakers(targetProfile.id, userProfile.id));
    if (!dealbreakersAllowPair) {
      return res.status(400).json({
        error:
          "This connection isn’t possible with one or both of your current dealbreaker or lifestyle settings. If your preferences changed, update them on Profile and try again.",
        code: "DEALBREAKER_MISMATCH",
      });
    }

    // Enforce both users' max distance: do not create a match if either is outside the other's distance preference.
    // Uses same data as Edit Profile: profiles.location and preferences.max_distance (PUT /profile and PUT /profile/preferences).
    const userProfileLocResult = db.prepare("SELECT location FROM profiles WHERE id = ?").get([userProfile.id]);
    const userProfileLoc = (userProfileLocResult instanceof Promise ? await userProfileLocResult : userProfileLocResult) as { location: string | null } | undefined;
    const targetProfileLocResult = db.prepare("SELECT location FROM profiles WHERE id = ?").get([targetProfile.id]);
    const targetProfileLoc = (targetProfileLocResult instanceof Promise ? await targetProfileLocResult : targetProfileLocResult) as { location: string | null } | undefined;
    const userPrefsDistResult = db.prepare("SELECT max_distance FROM preferences WHERE profile_id = ?").get([userProfile.id]);
    const userPrefsDist = (userPrefsDistResult instanceof Promise ? await userPrefsDistResult : userPrefsDistResult) as { max_distance: number | null } | undefined;
    const targetPrefsDistResult = db.prepare("SELECT max_distance FROM preferences WHERE profile_id = ?").get([targetProfile.id]);
    const targetPrefsDist = (targetPrefsDistResult instanceof Promise ? await targetPrefsDistResult : targetPrefsDistResult) as { max_distance: number | null } | undefined;

    const userLoc = userProfileLoc?.location?.trim() || null;
    const targetLoc = targetProfileLoc?.location?.trim() || null;

    // Geo-lock: when ACTIVE_MATCHING_REGION is set, both users must have a location so we can verify they're in region
    const activeRegionForConnect = getActiveMatchingRegion();
    if (activeRegionForConnect && (!userLoc || !targetLoc)) {
      return res.status(400).json({
        error: "Matching is currently only available for people in Southern Oregon. Both people need a location set.",
        code: "REGION_REQUIRES_LOCATION",
      });
    }

    // "Any" distance = unlimited: treat null, undefined, 0, and "0" as no limit so both users can connect when both set Any
    const toMaxMiles = (raw: number | null | undefined): number | null => {
      if (raw === null || raw === undefined) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const initiatorMaxDist = toMaxMiles(userPrefsDist?.max_distance);
    const targetMaxDist = toMaxMiles(targetPrefsDist?.max_distance);

    if (userLoc && targetLoc) {
      try {
        const userGeo = await geocodeLocation(userLoc);
        const targetGeo = await geocodeLocation(targetLoc);
        if (userGeo.coordinates && targetGeo.coordinates) {
          const distanceMiles = calculateDistanceMiles(userGeo.coordinates, targetGeo.coordinates);
          if (initiatorMaxDist != null && distanceMiles > initiatorMaxDist) {
            if (process.env.NODE_ENV !== "test") {
              console.log(`🙅 Connect blocked: distance ${distanceMiles.toFixed(1)} mi > initiator max ${initiatorMaxDist} (initiator=${userId} target=${targetUserId} initiatorProfileId=${userProfile.id} targetProfileId=${targetProfile.id})`);
            }
            return res.status(400).json({
              error: "This person is outside your distance preference. Update your max distance in Profile to connect.",
              code: "DISTANCE_EXCEEDS_YOUR_MAX",
              distanceMiles: Math.round(distanceMiles * 10) / 10,
              yourMaxMiles: initiatorMaxDist,
            });
          }
          if (targetMaxDist != null && distanceMiles > targetMaxDist) {
            if (process.env.NODE_ENV !== "test") {
              console.log(`🙅 Connect blocked: distance ${distanceMiles.toFixed(1)} mi > target max ${targetMaxDist} (initiator=${userId} target=${targetUserId} initiatorProfileId=${userProfile.id} targetProfileId=${targetProfile.id} targetMaxDistanceFromDB=${JSON.stringify(targetPrefsDist?.max_distance)})`);
            }
            return res.status(400).json({
              error: "You're outside this person's distance preference. They only connect with people closer to them.",
              code: "DISTANCE_EXCEEDS_THEIR_MAX",
              distanceMiles: Math.round(distanceMiles * 10) / 10,
              theirMaxMiles: targetMaxDist,
            });
          }
          // Geo-lock: when ACTIVE_MATCHING_REGION is set, both users must be in that region and within REGION_MAX_DISTANCE_MILES
          const activeRegion = getActiveMatchingRegion();
          if (activeRegion) {
            const userInRegion = isInRegion(userGeo.coordinates.lat, userGeo.coordinates.lng, activeRegion)
              || isLikelyInRegionByText(userLoc, activeRegion);
            const targetInRegion = isInRegion(targetGeo.coordinates.lat, targetGeo.coordinates.lng, activeRegion)
              || isLikelyInRegionByText(targetLoc, activeRegion);
            if (!userInRegion || !targetInRegion) {
              if (process.env.NODE_ENV !== "test") {
                console.log(`🙅 Connect blocked: region check failed (activeRegion=${activeRegion}) userInRegion=${userInRegion} targetInRegion=${targetInRegion} userLoc=${userLoc} targetLoc=${targetLoc}`);
              }
              if (!userInRegion) {
                return res.status(400).json({
                  error: "Your profile location couldn't be verified as Southern Oregon. Use a city and state (e.g. Medford, OR or Ashland, Oregon).",
                  code: "OUTSIDE_ACTIVE_REGION",
                });
              }
              return res.status(400).json({
                error: "This person is outside the current Southern Oregon matching area.",
                code: "TARGET_OUTSIDE_ACTIVE_REGION",
              });
            }
            if (distanceMiles > REGION_MAX_DISTANCE_MILES) {
              if (process.env.NODE_ENV !== "test") {
                console.log(`🙅 Connect blocked: distance ${distanceMiles.toFixed(1)} mi > region max ${REGION_MAX_DISTANCE_MILES} mi`);
              }
              return res.status(400).json({
                error: `Matching within Southern Oregon is limited to ${REGION_MAX_DISTANCE_MILES} miles. You're ${Math.round(distanceMiles)} miles apart.`,
                code: "EXCEEDS_REGION_MAX_DISTANCE",
                distanceMiles: Math.round(distanceMiles * 10) / 10,
                maxMiles: REGION_MAX_DISTANCE_MILES,
              });
            }
          }
        } else {
          // Geocoding didn't return coordinates for one or both
          if (activeRegionForConnect) {
            const userByText = isLikelyInRegionByText(userLoc, activeRegionForConnect);
            const targetByText = isLikelyInRegionByText(targetLoc, activeRegionForConnect);
            if (!userByText || !targetByText) {
              if (process.env.NODE_ENV !== "test") {
                console.warn(`🙅 Connect blocked: region lock requires geocoding but one or both failed. userLoc="${userLoc}" → ${userGeo.coordinates ? "OK" : "no coords"}, targetLoc="${targetLoc}" → ${targetGeo.coordinates ? "OK" : "no coords"}.`);
              }
              return res.status(400).json({
                error: "We couldn't verify your location. Use a city and state (e.g. Medford, OR or Ashland, Oregon) in your profile.",
                code: "REGION_VERIFICATION_FAILED",
              });
            }
          }
          if (process.env.NODE_ENV !== "test") {
            console.warn(`📷 Distance check skipped: could not geocode one or both locations. userLoc="${userLoc}" → ${userGeo.coordinates ? "OK" : "no coords"}, targetLoc="${targetLoc}" → ${targetGeo.coordinates ? "OK" : "no coords"}. Allowing connect.`);
          }
        }
      } catch (err) {
        console.warn("Connect distance check failed (allowing connect):", err);
        // Don't block on geocoding errors (network, rate limit, etc.)
      }
    }

    // Match limit: 50 per user (no expansion beyond 50).
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
      .prepare("SELECT COALESCE(match_slot_limit, 50) as slot_limit FROM users WHERE id = ?")
      .get([userId]);
    const userRow = (userRowResult instanceof Promise ? await userRowResult : userRowResult) as { slot_limit: number | string } | undefined;
    const slotLimit = Math.floor(Number(userRow?.slot_limit ?? 50));

    if (count >= 50) {
      return res.status(400).json({
        error: "You've reached the maximum of 50 matches. Unmatch with someone to free up a slot.",
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
      const { canClaimWeekly } = await import("../utils/weeklyTokens.js");
      const canClaimWeeklyToken = canClaimWeekly(lastWeeklyToken?.granted_at ?? null);

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
      message: "You're connected! You can chat now.",
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
            message: `😍 New match! You and ${targetDisplayName?.display_name || 'someone'} matched — say hi in chat.`,
            stage: 'stage1',
          });
          io.to(`user:${targetUserId}`).emit('new_match', {
            matchId,
            otherUserId: userId,
            otherUserName: userDisplayName?.display_name || 'Someone',
            message: `😍 New match! ${userDisplayName?.display_name || 'Someone'} matched with you. Say hi!`,
            stage: 'stage1',
          });
          console.log(`✅ Sent match notifications to both users: ${userId} and ${targetUserId}`);
        } else {
          console.warn('⚠️  Socket.io not initialized, skipping in-app notifications');
        }

        const { sendMatchPushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
        const { sendWebPushToUser, isWebPushConfigured } = await import('../services/webPushDelivery.js');
        const userPushRow = (await (db
          .prepare("SELECT push_token, push_notify_matches FROM users WHERE id = ?")
          .get([userId]) as Promise<{ push_token: string | null; push_notify_matches: number | null } | undefined>)) as { push_token: string | null; push_notify_matches: number | null } | undefined;
        const targetPushRow = (await (db
          .prepare("SELECT push_token, push_notify_matches FROM users WHERE id = ?")
          .get([targetUserId]) as Promise<{ push_token: string | null; push_notify_matches: number | null } | undefined>)) as { push_token: string | null; push_notify_matches: number | null } | undefined;

        const userWantsMatchPush = userPushRow?.push_notify_matches === undefined || userPushRow?.push_notify_matches === null || userPushRow.push_notify_matches !== 0;
        const targetWantsMatchPush = targetPushRow?.push_notify_matches === undefined || targetPushRow?.push_notify_matches === null || targetPushRow.push_notify_matches !== 0;

        if (!isPushNotificationConfigured()) {
          console.warn('📲 Match push skipped: Expo push not configured. Set EXPO_ACCESS_TOKEN in environment (required for Android/iOS delivery).');
        }

        const sendMatchPushTo = async (recipientId: string, token: string | null, wants: boolean, matchName: string, label: string) => {
          if (!wants) {
            console.log(`📲 Match push skipped for ${recipientId} (${label}): match notifications disabled.`);
            return;
          }
          if (token && token.trim() && isExpoPushToken(token)) {
            const sent = await sendMatchPushNotification(token, matchName, matchId);
            if (sent) {
              console.log(`✅ Sent match push (Expo) to ${recipientId} (${label})`);
            } else {
              console.warn(`📲 Match push (Expo) failed for ${recipientId} (${label}): send returned false.`);
            }
          } else if (!token || !token.trim()) {
            console.log(`📲 Match push: no Expo token for ${recipientId} (${label}); Web Push may still deliver.`);
          }
          if (isWebPushConfigured()) {
            const n = await sendWebPushToUser(recipientId, {
              title: "😍 New match!",
              body: `${matchName} matched with you. Say hi!`,
              tag: `match-${matchId}`,
              url: "/matches",
              data: { type: "new_match", matchId, matchName },
            });
            if (n > 0) console.log(`✅ Sent match Web Push to ${recipientId} (${label}, ${n} sub(s))`);
          }
        };

        await sendMatchPushTo(targetUserId, targetPushRow?.push_token ?? null, targetWantsMatchPush, userDisplayName?.display_name || 'Someone', 'target');
        await sendMatchPushTo(userId, userPushRow?.push_token ?? null, userWantsMatchPush, targetDisplayName?.display_name || 'Someone', 'initiator');
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

// Request to reveal photos (manual override - auto-reveal after each user sends 3+ messages)
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
        note: "Photos automatically reveal when both users send 3+ messages each"
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
         ) AS msg_window ORDER BY msg_window.sent_at ASC`
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
        likedBy: m.liked_by_id || null,
      })),
    });
  } catch (error) {
    console.error("Get messages error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: `Failed to load messages: ${errorMessage}` });
  }
});

// Like a message (only the other user in the match can like; one like per message)
matchesRouter.post("/:matchId/messages/:messageId/like", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId, messageId } = req.params;

    const matchResult = db.prepare(
      `SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    ).get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as { user1_id: string; user2_id: string } | undefined;
    if (!match) return res.status(404).json({ error: "Match not found or not mutual" });

    const msgResult = db.prepare(
      `SELECT id, sender_id, liked_by_id FROM messages WHERE id = ? AND match_id = ?`
    ).get([messageId, matchId]);
    const msg = (msgResult instanceof Promise ? await msgResult : msgResult) as { id: string; sender_id: string; liked_by_id: string | null } | undefined;
    if (!msg) return res.status(404).json({ error: "Message not found" });

    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
    if (msg.sender_id === userId) return res.status(400).json({ error: "You cannot like your own message" });

    const runResult = db.prepare(`UPDATE messages SET liked_by_id = ? WHERE id = ? AND match_id = ?`).run([userId, messageId, matchId]);
    if (runResult instanceof Promise) await runResult;

    const likerProfileResult = db.prepare(`SELECT display_name FROM profiles WHERE user_id = ?`).get([userId]);
    const likerProfile = (likerProfileResult instanceof Promise ? await likerProfileResult : likerProfileResult) as { display_name: string } | undefined;
    const likerName = likerProfile?.display_name || "Someone";

    const { getIO } = await import("../socket.js");
    const io = getIO();
    if (io) {
      const payload = { matchId, messageId, likedBy: userId, likerName, senderId: msg.sender_id };
      io.to(`match:${matchId}`).emit("message_liked", payload);
    }

    try {
      const { sendMessageLikedPushNotification, isPushNotificationConfigured, isExpoPushToken } = await import("../services/pushNotifications.js");
      const { sendWebPushToUser, isWebPushConfigured } = await import("../services/webPushDelivery.js");
      const rowResult = db.prepare("SELECT push_token, push_notify_messages FROM users WHERE id = ?").get([msg.sender_id]);
      const row = (rowResult instanceof Promise ? await rowResult : rowResult) as { push_token: string | null; push_notify_messages: number | null } | undefined;
      const wantsPush = row?.push_notify_messages === undefined || row?.push_notify_messages === null || row.push_notify_messages !== 0;
      if (row?.push_token && isExpoPushToken(row.push_token) && wantsPush && isPushNotificationConfigured()) {
        await sendMessageLikedPushNotification(row.push_token, likerName, matchId, messageId);
      }
      if (wantsPush && isWebPushConfigured()) {
        const n = await sendWebPushToUser(msg.sender_id, {
          title: "❤️ Message loved",
          body: `${likerName} loved your message`,
          tag: `liked-${messageId}`,
          url: "/matches",
          data: { type: "message_liked", matchId, messageId, likerName },
        });
        if (n > 0) console.log(`✅ Web Push (message liked) → sender ${msg.sender_id} (${n})`);
      }
    } catch (pushErr) {
      console.warn("Push (message liked) failed:", pushErr);
    }

    res.json({ liked: true, messageId, likedBy: userId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Like message error:", error);
    res.status(500).json({ error: `Failed to like message: ${errMsg}` });
  }
});

// Unlike a message
matchesRouter.delete("/:matchId/messages/:messageId/like", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId, messageId } = req.params;

    const matchResult = db.prepare(
      `SELECT user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
    ).get([matchId, userId, userId]);
    const match = (matchResult instanceof Promise ? await matchResult : matchResult) as { user1_id: string; user2_id: string } | undefined;
    if (!match) return res.status(404).json({ error: "Match not found or not mutual" });

    const msgResult = db.prepare(`SELECT id, liked_by_id FROM messages WHERE id = ? AND match_id = ?`).get([messageId, matchId]);
    const msg = (msgResult instanceof Promise ? await msgResult : msgResult) as { id: string; liked_by_id: string | null } | undefined;
    if (!msg) return res.status(404).json({ error: "Message not found" });
    if (msg.liked_by_id !== userId) return res.status(400).json({ error: "You have not liked this message" });

    const runResult = db.prepare(`UPDATE messages SET liked_by_id = NULL WHERE id = ? AND match_id = ?`).run([messageId, matchId]);
    if (runResult instanceof Promise) await runResult;

    const { getIO } = await import("../socket.js");
    const io = getIO();
    if (io) io.to(`match:${matchId}`).emit("message_unliked", { matchId, messageId });

    res.json({ liked: false, messageId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Unlike message error:", error);
    res.status(500).json({ error: `Failed to unlike message: ${errMsg}` });
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

    const mediaCounts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetChatMediaThreshold(mediaCounts.user1, mediaCounts.user2)) {
      return res.status(403).json({ error: CHAT_MEDIA_LOCKED_MESSAGE });
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
    const videoCounts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetChatMediaThreshold(videoCounts.user1, videoCounts.user2)) {
      return res.status(403).json({ error: CHAT_MEDIA_LOCKED_MESSAGE });
    }
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
    const audioCounts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetChatMediaThreshold(audioCounts.user1, audioCounts.user2)) {
      return res.status(403).json({ error: CHAT_MEDIA_LOCKED_MESSAGE });
    }
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: "Audio upload is not configured" });
    const mime = String(file.mimetype || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    const extFromMime: Record<string, string> = {
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/aac": "aac",
      "audio/webm": "webm",
      "audio/ogg": "ogg",
    };
    const ext = extFromMime[mime] || "m4a";
    const publicId = `${uuidv4()}.${ext}`;
    const audioUrl = await uploadToCloudinaryMedia(file.buffer, 'chat-audio', 'raw', publicId);
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

    if (finalImageUrl || finalVideoUrl || finalAudioUrl) {
      const sendMediaCounts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
      if (!bothUsersMetChatMediaThreshold(sendMediaCounts.user1, sendMediaCounts.user2)) {
        return res.status(403).json({ error: CHAT_MEDIA_LOCKED_MESSAGE });
      }
    }

    const messageId = uuidv4();
    const insertMessageResult = db.prepare(
      `INSERT INTO messages (id, match_id, sender_id, content, image_url, video_url, audio_url) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run([messageId, matchId, userId, sanitizedContent, finalImageUrl, finalVideoUrl || null, finalAudioUrl || null]);
    if (insertMessageResult instanceof Promise) {
      await insertMessageResult;
    }

    // Auto-advance to stage2 when each user has sent at least 3 messages
    let autoAdvanced = false;
    if (match.stage === "stage1") {
      const countResult = db
        .prepare(`SELECT sender_id, COUNT(*) as count FROM messages WHERE match_id = ? GROUP BY sender_id`)
        .all([matchId]);
      const counts = (countResult instanceof Promise ? await countResult : countResult) as Array<{ sender_id: string; count: number }>;
      const user1Count = counts.find(c => c.sender_id === match.user1_id)?.count ?? 0;
      const user2Count = counts.find(c => c.sender_id === match.user2_id)?.count ?? 0;

      if (user1Count >= 3 && user2Count >= 3) {
        // Auto-advance to stage2 — all photos unlocked
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
            message: '🎉 You\'ve each sent 3+ messages — all photos are unlocked!',
            autoAdvanced: true,
          });
        }
      }
    }

    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    const senderProfileResult = db
      .prepare("SELECT display_name FROM profiles WHERE user_id = ?")
      .get([userId]);
    const senderProfile = (senderProfileResult instanceof Promise
      ? await senderProfileResult
      : senderProfileResult) as { display_name: string } | undefined;
    const senderName = senderProfile?.display_name || "Someone";
    const sentAt = new Date().toISOString();

    const realtimePayload = {
      id: messageId,
      matchId,
      content: sanitizedContent,
      imageUrl: finalImageUrl,
      videoUrl: finalVideoUrl || null,
      audioUrl: finalAudioUrl || null,
      senderId: userId,
      senderName,
      sentAt,
      readAt: null as null,
    };

    // Real-time path first: socket + HTTP response must not wait on push or analytics.
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('new_message', realtimePayload);
        io.to(`user:${otherUserId}`).emit('new_message', realtimePayload);
        console.log(`✅ Emitted socket event for new message in match ${matchId}`);
      }
    } catch (socketError) {
      console.warn('⚠️  Failed to emit socket event for message (non-critical):', socketError);
    }

    res.json({
      message: {
        ...realtimePayload,
        isOwn: true,
      },
      autoAdvanced,
      stage: autoAdvanced ? "stage2" : match.stage,
    });

    void (async () => {
      try {
        await recordSuccessSignal(userId, otherUserId, matchId, "message_exchanged");
        if (autoAdvanced) {
          await recordSuccessSignal(match.user1_id, match.user2_id, matchId, "stage_advanced");
          await recordSuccessSignal(match.user2_id, match.user1_id, matchId, "stage_advanced");
        }
      } catch (e) {
        console.warn("⚠️  recordSuccessSignal (message REST):", e);
      }

      // Send push notification to the other user (OS shows when app is backgrounded/closed)
      try {
      const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken, getMessagePushThrottleDelayMs, recordMessagePushSent } = await import('../services/pushNotifications.js');
      const { sendWebPushToUser, isWebPushConfigured } = await import('../services/webPushDelivery.js');
      const hasExpoToken = !!process.env.EXPO_ACCESS_TOKEN;
      let otherUserRowResult = db.prepare("SELECT push_token, push_notify_messages, push_token_fail_count FROM users WHERE id = ?").get([otherUserId]);
      if (otherUserRowResult instanceof Promise) otherUserRowResult = await otherUserRowResult;
      let otherUserRow = otherUserRowResult as { push_token: string | null; push_notify_messages: number | null; push_token_fail_count?: number | null } | undefined;
      let token = otherUserRow?.push_token ?? null;
      const wantsMessagePush = otherUserRow?.push_notify_messages === undefined || otherUserRow?.push_notify_messages === null || otherUserRow.push_notify_messages !== 0;
      // If no token yet, recipient may have a request in flight that just saved it; retry with longer waits
      if ((!token || !token.trim()) && isPushNotificationConfigured() && wantsMessagePush) {
        await new Promise((r) => setTimeout(r, 2500));
        let retryResult = db.prepare("SELECT push_token, push_notify_messages, push_token_fail_count FROM users WHERE id = ?").get([otherUserId]);
        if (retryResult instanceof Promise) retryResult = await retryResult;
        otherUserRow = retryResult as { push_token: string | null; push_notify_messages: number | null; push_token_fail_count?: number | null } | undefined;
        token = otherUserRow?.push_token ?? null;
        if ((!token || !token.trim()) && isPushNotificationConfigured()) {
          await new Promise((r) => setTimeout(r, 1500));
          let retry2 = db.prepare("SELECT push_token, push_token_fail_count FROM users WHERE id = ?").get([otherUserId]);
          if (retry2 instanceof Promise) retry2 = await retry2;
          const retry2Row = retry2 as { push_token: string | null; push_token_fail_count?: number | null } | undefined;
          token = retry2Row?.push_token ?? null;
          if (otherUserRow && retry2Row) otherUserRow = { ...otherUserRow, push_token: token, push_token_fail_count: retry2Row.push_token_fail_count };
        }
      }
      const tokenValid = !!(token && isExpoPushToken(token));
      const tokenPreview = token ? `${token.substring(0, 28)}...` : 'null';
      console.log(`📲 Push (message): recipient=${otherUserId} hasToken=${!!token} validFormat=${tokenValid} wantsMessagePush=${wantsMessagePush} EXPO_ACCESS_TOKEN=${hasExpoToken ? 'set' : 'NOT SET'}`);

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

      // Clear token on first DeviceNotRegistered (Expo/APNs: token is permanently invalid; e.g. rotated on iPhone 15 Pro Max after first push).
      // User will re-register when they next open the app, so subsequent messages then work.
      const handleInvalidTokenForRecipient = async () => {
        try {
          db.prepare('UPDATE users SET push_token = NULL, push_token_fail_count = 0 WHERE id = ?').run([otherUserId]);
          console.log(`📲 Push: cleared invalid token for recipient ${otherUserId} (DeviceNotRegistered — they’ll re-register when app opens)`);
        } catch (e) {
          console.warn('⚠️  Failed to clear push token for', otherUserId, e);
        }
      };

      if (isPushNotificationConfigured() && wantsMessagePush) {
        if (tokenValid) {
          const throttleDelayMs = getMessagePushThrottleDelayMs(otherUserId);
          if (throttleDelayMs > 0) {
            setTimeout(async () => {
              try {
                const row = db.prepare('SELECT push_token FROM users WHERE id = ?').get([otherUserId]) as { push_token: string | null } | undefined;
                const t = row?.push_token ?? null;
                if (!t || !isExpoPushToken(t)) return;
                const res = await sendMessagePushNotification(t, senderName, messagePreview, matchId, userId, messageId);
                if (res.invalidToken) await handleInvalidTokenForRecipient();
                else if (res.sent) {
                  recordMessagePushSent(otherUserId);
                  try { db.prepare('UPDATE users SET push_token_fail_count = 0 WHERE id = ?').run([otherUserId]); } catch (_) {}
                  console.log(`📲 PUSH_MSG_SENT recipient=${otherUserId} (throttled)`);
                }
              } catch (e) { console.warn('⚠️  Throttled push failed:', e); }
            }, throttleDelayMs);
          } else {
            const result = await sendMessagePushNotification(token!, senderName, messagePreview, matchId, userId, messageId);
            if (result.invalidToken) {
              await handleInvalidTokenForRecipient();
              console.log(`📲 PUSH_MSG_SKIP recipient=${otherUserId} reason=invalid_token`);
            } else if (result.sent) {
              recordMessagePushSent(otherUserId);
              try {
                db.prepare('UPDATE users SET push_token_fail_count = 0 WHERE id = ?').run([otherUserId]);
              } catch (_) {}
              console.log(`📲 PUSH_MSG_SENT recipient=${otherUserId}`);
            } else {
              console.warn(`📲 PUSH_MSG_SKIP recipient=${otherUserId} reason=expo_send_failed — retrying once in-request`);
              // One in-request retry (no setTimeout so it runs before response; avoids lost push when process sleeps)
              await new Promise((r) => setTimeout(r, 1500));
              const retryResult = await sendMessagePushNotification(token!, senderName, messagePreview, matchId, userId, messageId);
              if (retryResult.invalidToken) await handleInvalidTokenForRecipient();
              else if (retryResult.sent) {
                recordMessagePushSent(otherUserId);
                try { db.prepare('UPDATE users SET push_token_fail_count = 0 WHERE id = ?').run([otherUserId]); } catch (_) {}
                console.log(`📲 PUSH_MSG_SENT recipient=${otherUserId} (in-request retry)`);
              } else {
                console.warn(`📲 PUSH_MSG_SKIP recipient=${otherUserId} still failed after retry`);
              }
            }
          }
        } else {
          const reason = !token ? 'RECIPIENT_HAS_NO_TOKEN' : 'invalid_expo_token_format';
          console.warn(`📲 PUSH_MSG_SKIP recipient=${otherUserId} reason=${reason} — If NO_TOKEN: recipient should open the app, allow notifications, and ensure token is saved.`);
          // Delayed retry: recipient may open app later and token appears (e.g. some iPhones only send token when app is backgrounded)
          if (!token) {
            const tryDelayedPush = async (): Promise<boolean> => {
              let retryRow = db.prepare("SELECT push_token FROM users WHERE id = ?").get([otherUserId]);
              if (retryRow instanceof Promise) retryRow = await retryRow;
              const retryToken = (retryRow as { push_token: string | null } | undefined)?.push_token ?? null;
              if (retryToken && retryToken.trim() && isExpoPushToken(retryToken)) {
                const res = await sendMessagePushNotification(retryToken, senderName, messagePreview, matchId, userId, messageId);
                if (res.invalidToken) await handleInvalidTokenForRecipient();
                else if (res.sent) {
                  recordMessagePushSent(otherUserId);
                  try { db.prepare('UPDATE users SET push_token_fail_count = 0 WHERE id = ?').run([otherUserId]); } catch (_) {}
                  console.log(`📲 PUSH_MSG_SENT recipient=${otherUserId} (delayed retry)`);
                  return true;
                }
              }
              return false;
            };
            [3000, 8000, 18000, 30000, 60000, 120000].forEach((delayMs) => {
              setTimeout(() => {
                tryDelayedPush().catch((e) => console.warn('⚠️  Delayed push retry failed:', e));
              }, delayMs);
            });
          }
        }
        if (isWebPushConfigured()) {
          const n = await sendWebPushToUser(otherUserId, {
            title: senderName,
            body: messagePreview,
            tag: messageId ? `msg-${matchId}-${messageId}` : `msg-${matchId}`,
            url: "/matches",
            data: { type: "new_message", matchId, senderId: userId, ...(messageId ? { messageId } : {}) },
          });
          if (n > 0) console.log(`✅ Web Push (message REST) → ${otherUserId} (${n} sub(s))`);
        }
      }
    } catch (pushError) {
      console.warn('⚠️  Push notification error (non-critical):', pushError);
    }
    })();
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

    // Notify via Socket.io so the other user's list updates in real time
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
        io.to(`match:${matchId}`).emit('match_unmatched', { matchId, unmatchedBy: userId });
        io.to(`user:${otherUserId}`).emit('match_unmatched', { matchId, unmatchedBy: userId });
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

// Profile compatibility: 0–100 from shared interests (calculateProfileCompatibilityScore).
// Explanation: interest-based reasons + sharedInterests; sharedValues always 0 (legacy field).
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

    // Reset conversation and generate starter (no token required)
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

// Unlock a game (Truth or Dare / Never Have I Ever) — free for now (no token spent)
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

    const counts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetMatchChatDepthThreshold(counts.user1, counts.user2)) {
      const lockedMessage =
        gameType === "never_have_i_ever" ? NEVER_HAVE_I_EVER_LOCKED_MESSAGE : TRUTH_OR_DARE_LOCKED_MESSAGE;
      return res.status(403).json({ error: lockedMessage });
    }

    const SEVEN_MINUTES_MS = 7 * 60 * 1000;
    /** Truth or Dare: no session timer. NHIE: 7-minute window. */
    const unlockedUntil =
      gameType === 'truth_or_dare' ? null : new Date(Date.now() + SEVEN_MINUTES_MS);

    // Check if already unlocked (idempotent)
    const existingUnlock = db
      .prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?')
      .get([matchId, gameType]) as { unlocked_until: string | null } | undefined;
    if (existingUnlock) {
      const until = existingUnlock.unlocked_until ? new Date(existingUnlock.unlocked_until) : null;
      if (!until || until > new Date()) {
        return res.json({ success: true, alreadyUnlocked: true, gameType });
      }
    }

    // Games are free — no token spent; create or refresh the unlock record
    const unlockedUntilDb = unlockedUntil ? unlockedUntil.toISOString() : null;
    if (existingUnlock) {
      db.prepare('UPDATE game_unlocks SET unlocked_until = ?, unlocked_at = CURRENT_TIMESTAMP WHERE match_id = ? AND game_type = ?')
        .run([unlockedUntilDb, matchId, gameType]);
    } else {
      db.prepare('INSERT INTO game_unlocks (match_id, game_type, unlocked_by_user_id, unlocked_until) VALUES (?, ?, ?, ?)')
        .run([matchId, gameType, userId, unlockedUntilDb]);
    }

    // Reset game state so both users pick PG-13 / Rated R / Spicy again after unlock
    if (gameType === 'truth_or_dare') {
      let exGame = db.prepare('SELECT match_id FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
      if (exGame instanceof Promise) exGame = await exGame;
      if (!exGame) {
        try {
          const ins = db.prepare('INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, ?)').run([matchId, '[]']);
          if (ins instanceof Promise) await ins;
        } catch {
          /* concurrent */
        }
      }
      const runUp = db.prepare(
        'UPDATE truth_or_dare_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, user1_another_one_count = 0, user2_another_one_count = 0, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?'
      ).run(['[]', matchId]);
      if (runUp instanceof Promise) await runUp;
    }
    if (gameType === 'never_have_i_ever') {
      db.prepare(
        'UPDATE never_have_i_ever_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?'
      ).run([matchId]);
    }

    // When Truth or Dare is unlocked, send a chat message so both see "Truth or Dare is ready!"
    if (gameType === 'truth_or_dare') {
      try {
        const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
        const notifyMsgId = uuidv4();
        const notifyContent = '🎲 Truth or Dare is ready! Pick Truth or Dare anytime.';
        const runInsert = db.prepare('INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)').run([notifyMsgId, matchId, userId, notifyContent]);
        if (runInsert instanceof Promise) await runInsert;
        const senderProfileResult = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get([userId]);
        const senderProfile = (senderProfileResult instanceof Promise ? await senderProfileResult : senderProfileResult) as { display_name: string } | undefined;
        const senderName = senderProfile?.display_name || 'Someone';
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) io.to(`match:${matchId}`).emit('new_message', { id: notifyMsgId, matchId, content: notifyContent, imageUrl: null, senderId: userId, senderName, sentAt: new Date().toISOString(), readAt: null });
        const { sendMessagePushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('../services/pushNotifications.js');
        const { sendWebPushToUser, isWebPushConfigured } = await import('../services/webPushDelivery.js');
        if (isPushNotificationConfigured()) {
          let otherTokenRow = db.prepare('SELECT push_token, push_notify_messages FROM users WHERE id = ?').get([otherUserId]);
          if (otherTokenRow instanceof Promise) otherTokenRow = await otherTokenRow;
          const row = otherTokenRow as { push_token: string | null; push_notify_messages: number | null } | undefined;
          const wants = row?.push_notify_messages === undefined || row?.push_notify_messages === null || row.push_notify_messages !== 0;
          if (wants && row?.push_token && isExpoPushToken(row.push_token)) {
            await sendMessagePushNotification(row.push_token, senderName, notifyContent, matchId, userId);
          }
          if (wants && isWebPushConfigured()) {
            const n = await sendWebPushToUser(otherUserId, {
              title: senderName,
              body: notifyContent,
              tag: `msg-${matchId}`,
              url: "/matches",
              data: { type: "new_message", matchId, senderId: userId },
            });
            if (n > 0) console.log(`✅ Web Push (ToD unlock msg) → ${otherUserId} (${n})`);
          }
        }
      } catch (e) {
        console.warn('Truth or Dare unlock chat notification failed (non-critical):', e);
      }
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

    const counts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetMatchChatDepthThreshold(counts.user1, counts.user2)) {
      const lockedMessage =
        gameType === "never_have_i_ever" ? NEVER_HAVE_I_EVER_LOCKED_MESSAGE : TRUTH_OR_DARE_LOCKED_MESSAGE;
      return res.status(403).json({ error: lockedMessage });
    }

    const toUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    // Games are free — unlock without spending a token (same as unlock-game)
    const SEVEN_MINUTES_MS = 7 * 60 * 1000;
    const unlockedUntil =
      gameType === 'truth_or_dare' ? null : new Date(Date.now() + SEVEN_MINUTES_MS);
    const unlockedUntilDb = unlockedUntil ? unlockedUntil.toISOString() : null;
    const existingUnlock = db
      .prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?')
      .get([matchId, gameType]) as { unlocked_until: string | null } | undefined;
    if (!existingUnlock) {
      const runIns = db.prepare('INSERT INTO game_unlocks (match_id, game_type, unlocked_by_user_id, unlocked_until) VALUES (?, ?, ?, ?)')
        .run([matchId, gameType, userId, unlockedUntilDb]);
      if (runIns instanceof Promise) await runIns;
      if (gameType === 'truth_or_dare') {
        let exG = db.prepare('SELECT match_id FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
        if (exG instanceof Promise) exG = await exG;
        if (!exG) {
          try {
            const ins = db.prepare('INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, ?)').run([matchId, '[]']);
            if (ins instanceof Promise) await ins;
          } catch {
            /* ignore */
          }
        }
        const ru = db.prepare('UPDATE truth_or_dare_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, user1_another_one_count = 0, user2_another_one_count = 0, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run(['[]', matchId]);
        if (ru instanceof Promise) await ru;
      }
      if (gameType === 'never_have_i_ever') {
        db.prepare('UPDATE never_have_i_ever_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([matchId]);
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
        const runExt = db.prepare('UPDATE game_unlocks SET unlocked_until = ?, unlocked_at = CURRENT_TIMESTAMP WHERE match_id = ? AND game_type = ?')
          .run([unlockedUntilDb, matchId, gameType]);
        if (runExt instanceof Promise) await runExt;
        if (gameType === 'truth_or_dare') {
          let exG2 = db.prepare('SELECT match_id FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
          if (exG2 instanceof Promise) exG2 = await exG2;
          if (!exG2) {
            try {
              const ins2 = db.prepare('INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, ?)').run([matchId, '[]']);
              if (ins2 instanceof Promise) await ins2;
            } catch {
              /* ignore */
            }
          }
          const ru2 = db.prepare('UPDATE truth_or_dare_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_prompt_type = NULL, used_prompts = ?, user1_another_one_count = 0, user2_another_one_count = 0, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run(['[]', matchId]);
          if (ru2 instanceof Promise) await ru2;
        }
        if (gameType === 'never_have_i_ever') {
          db.prepare('UPDATE never_have_i_ever_games SET user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([matchId]);
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
      const { sendWebPushToUser, isWebPushConfigured } = await import('../services/webPushDelivery.js');
      const gameLabel = gameType === 'truth_or_dare' ? 'Truth or Dare' : 'Never Have I Ever';
      const emoji = gameType === 'truth_or_dare' ? '🎲' : '🙊';
      if (isPushNotificationConfigured()) {
        let toUserRowResult = db.prepare('SELECT push_token, push_notify_messages FROM users WHERE id = ?').get(toUserId);
        if (toUserRowResult instanceof Promise) toUserRowResult = await toUserRowResult;
        const toUserRow = toUserRowResult as { push_token: string | null; push_notify_messages: number | null } | undefined;
        const wantsMessagePush = toUserRow?.push_notify_messages === undefined || toUserRow?.push_notify_messages === null || toUserRow.push_notify_messages !== 0;
        if (wantsMessagePush && toUserRow?.push_token && isExpoPushToken(toUserRow.push_token)) {
          await sendGameRequestPushNotification(
            toUserRow.push_token,
            fromUserName,
            gameType as 'truth_or_dare' | 'never_have_i_ever',
            matchId,
            userId,
            requestId
          );
          console.log(`✅ Sent game request push notification to ${toUserId}`);
        }
        if (wantsMessagePush && isWebPushConfigured()) {
          const n = await sendWebPushToUser(toUserId, {
            title: `${emoji} Game invite`,
            body: `${fromUserName} wants to play ${gameLabel} with you!`,
            tag: `game-req-${requestId}`,
            url: "/matches",
            data: { type: "game_request", matchId, fromUserId: userId, fromUserName, gameType, requestId },
          });
          if (n > 0) console.log(`✅ Web Push (game request) → ${toUserId} (${n})`);
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

// Get Truth or Dare game state — PG-13 / Rated R / Spicy (effective = more conservative of both picks).
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

    const unlockRow = db.prepare('SELECT unlocked_by_user_id, unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_by_user_id: string; unlocked_until: string | null } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Truth or Dare is not available for this match yet." });
    }
    const until = unlockRow.unlocked_until ? new Date(unlockRow.unlocked_until) : null;
    if (until && until <= new Date()) {
      return res.status(400).json({ error: "Truth or Dare session expired. Open it again from your match chat." });
    }

    let gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    let game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;

    if (!game) {
      try {
        const ins = db.prepare(`INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, '[]')`).run([matchId]);
        if (ins instanceof Promise) await ins;
      } catch {
        /* concurrent create — row may already exist */
      }
      gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
      game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;
    }

    const { normalizeSpiceChoice, moreConservativeSpice } = await import('../services/truthOrDare.js');
    const isUser1 = match.user1_id === userId;
    const c1 = normalizeSpiceChoice(game?.user1_spice_choice);
    const c2 = normalizeSpiceChoice(game?.user2_spice_choice);
    const yourSpiceChoice = isUser1 ? c1 : c2;
    const theirSpiceChoice = isUser1 ? c2 : c1;
    const spiceReady = !!(c1 && c2);
    const spiceLevel = spiceReady && c1 && c2 ? moreConservativeSpice(c1, c2) : null;
    let currentTurnUserId = game.current_turn_user_id ?? null;
    let roundCount = Math.max(1, Number(game.round_count) || 1);
    if (spiceReady && !currentTurnUserId) {
      currentTurnUserId = match.user1_id;
      const turnResult = db
        .prepare('UPDATE truth_or_dare_games SET current_turn_user_id = ?, round_count = COALESCE(round_count, 1), updated_at = CURRENT_TIMESTAMP WHERE match_id = ?')
        .run([currentTurnUserId, matchId]);
      if (turnResult instanceof Promise) await turnResult;
      roundCount = 1;
    }

    const currentPrompt = game.current_prompt ?? null;
    const currentPromptType = (game.current_prompt_type === 'truth' || game.current_prompt_type === 'dare') ? game.current_prompt_type : null;

    const { truthOrDareAnotherOneStatus } = await import('../services/truthOrDare.js');
    const anotherOneStatus = truthOrDareAnotherOneStatus(game, userId, match);

    res.json({
      yourSpiceChoice,
      theirSpiceChoice,
      spiceReady,
      spiceLevel,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      currentPrompt,
      currentPromptType,
      currentTurnUserId,
      isYourTurn: !!(currentTurnUserId && currentTurnUserId === userId),
      roundCount,
      unlockedUntil: unlockRow.unlocked_until ?? null,
      ...anotherOneStatus,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Truth or Dare state error:", error);
    res.status(500).json({ error: `Failed to get game state: ${errorMessage}` });
  }
});

// Each user picks PG-13, Rated R, or Spicy; effective heat = more conservative of the two.
matchesRouter.post("/:matchId/truth-or-dare/spice-choice", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { matchId } = req.params;
    const { choice } = req.body as { choice?: string };
    const { normalizeSpiceChoice, moreConservativeSpice } = await import('../services/truthOrDare.js');
    const choiceNorm = normalizeSpiceChoice(choice);
    if (!choiceNorm) {
      return res.status(400).json({ error: "Invalid choice. Use 'pg13', 'ratedr', or 'spicy'." });
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

    const unlockRow = db.prepare('SELECT unlocked_by_user_id, unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_by_user_id: string; unlocked_until: string | null } | undefined;
    if (!unlockRow) {
      return res.status(400).json({ error: "Truth or Dare is not available for this match yet." });
    }
    const spiceUntil = unlockRow.unlocked_until ? new Date(unlockRow.unlocked_until) : null;
    if (spiceUntil && spiceUntil <= new Date()) {
      return res.status(400).json({ error: "Truth or Dare session expired. Open it again from your match chat." });
    }

    const isUser1 = match.user1_id === userId;
    let exists = db.prepare('SELECT match_id FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    if (exists instanceof Promise) exists = await exists;
    if (!exists) {
      try {
        const ins = db.prepare('INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, ?)').run([matchId, '[]']);
        if (ins instanceof Promise) await ins;
      } catch {
        /* row created concurrently */
      }
    }
    if (isUser1) {
      db.prepare('UPDATE truth_or_dare_games SET user1_spice_choice = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([choiceNorm, matchId]);
    } else {
      db.prepare('UPDATE truth_or_dare_games SET user2_spice_choice = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([choiceNorm, matchId]);
    }

    const gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    const game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;
    const c1 = normalizeSpiceChoice(game?.user1_spice_choice);
    const c2 = normalizeSpiceChoice(game?.user2_spice_choice);
    const spiceReady = !!(c1 && c2);
    const spiceLevel = spiceReady && c1 && c2 ? moreConservativeSpice(c1, c2) : null;
    if (spiceReady && spiceLevel) {
      const turnUserId = game?.current_turn_user_id || match.user1_id;
      db.prepare('UPDATE truth_or_dare_games SET spice_level = ?, current_turn_user_id = COALESCE(current_turn_user_id, ?), round_count = COALESCE(round_count, 1), updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([spiceLevel, turnUserId, matchId]);
    }

    const yourSpiceChoice = isUser1 ? c1 : c2;
    const theirSpiceChoice = isUser1 ? c2 : c1;

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId });
    } catch (e) {
      console.warn('Socket emit failed:', e);
    }

    res.json({
      yourSpiceChoice,
      theirSpiceChoice,
      spiceReady,
      spiceLevel,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      currentTurnUserId: spiceReady ? (game?.current_turn_user_id || match.user1_id) : null,
      isYourTurn: spiceReady ? (game?.current_turn_user_id || match.user1_id) === userId : false,
      roundCount: Math.max(1, Number(game?.round_count) || 1),
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

    let gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    let game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;

    const unlockRowToD = db.prepare('SELECT unlocked_until FROM game_unlocks WHERE match_id = ? AND game_type = ?').get([matchId, 'truth_or_dare']) as { unlocked_until: string | null } | undefined;
    if (!unlockRowToD) {
      return res.status(400).json({ error: "Truth or Dare is not available for this match yet." });
    }
    const todUntil = unlockRowToD.unlocked_until ? new Date(unlockRowToD.unlocked_until) : null;
    if (todUntil && todUntil <= new Date()) {
      return res.status(400).json({ error: "Truth or Dare session expired. Open it again from your match chat." });
    }

    if (!game) {
      try {
        const ins = db.prepare('INSERT INTO truth_or_dare_games (match_id, used_prompts) VALUES (?, ?)').run([matchId, '[]']);
        if (ins instanceof Promise) await ins;
      } catch {
        /* ignore */
      }
      gameResult = db.prepare('SELECT * FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
      game = (gameResult instanceof Promise ? await gameResult : gameResult) as any;
    }

    const { normalizeSpiceChoice, moreConservativeSpice } = await import('../services/truthOrDare.js');
    const c1 = normalizeSpiceChoice(game?.user1_spice_choice);
    const c2 = normalizeSpiceChoice(game?.user2_spice_choice);
    if (!c1 || !c2) {
      return res.status(400).json({
        error: "Both players must pick a heat level (PG-13, Rated R, or Spicy) before generating prompts.",
        code: 'SPICE_REQUIRED',
      });
    }
    const levelNorm = moreConservativeSpice(c1, c2);
    const currentTurnUserId = game.current_turn_user_id || match.user1_id;
    if (currentTurnUserId !== userId) {
      return res.status(403).json({
        error: "It's your match's turn to pick Truth or Dare.",
        code: 'NOT_YOUR_TURN',
      });
    }
    const isUser1 = match.user1_id === userId;
    const { truthOrDareAnotherOneStatus, TRUTH_OR_DARE_MAX_ANOTHER_ONE } = await import('../services/truthOrDare.js');
    const anotherOneBefore = truthOrDareAnotherOneStatus(game, userId, match);

    if (anotherOne && anotherOneBefore.anotherOneRemaining <= 0) {
      return res.status(400).json({
        error: `You've used all ${TRUTH_OR_DARE_MAX_ANOTHER_ONE} "Another one" rerolls for this game.`,
        code: 'ANOTHER_ONE_LIMIT',
        ...anotherOneBefore,
      });
    }

    const currentPrompt = game.current_prompt ?? null;
    const currentPromptType = game.current_prompt_type ?? null;

    // If there's already a prompt of this type and user didn't click "Another one", return it (don't regenerate)
    if (!anotherOne && currentPrompt && currentPrompt.trim() && currentPromptType === type) {
      return res.json({ prompt: currentPrompt, fromAI: false, spiceLevel: levelNorm, ...anotherOneBefore });
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
      const result = await generateTruthOrDarePrompt(type, matchId, userId, levelNorm, excludePrompts);
      prompt = result.prompt;
      fromAI = result.fromAI;
      const isDuplicate = excludePrompts.some((p) => normalize(p) === normalize(prompt));
      if (!isDuplicate) break;
      if (attempt === maxTries - 1) {
        prompt = prompt + (prompt.endsWith('?') ? ' (pick a new angle)' : '?');
      }
    }

    const newUsedPrompts = [...usedPrompts, prompt];
    const anotherOneAfter = anotherOne
      ? {
          anotherOneUsed: anotherOneBefore.anotherOneUsed + 1,
          anotherOneRemaining: Math.max(0, anotherOneBefore.anotherOneRemaining - 1),
          anotherOneMax: anotherOneBefore.anotherOneMax,
        }
      : anotherOneBefore;

    if (anotherOne) {
      if (isUser1) {
        db.prepare(
          'UPDATE truth_or_dare_games SET current_prompt = ?, current_prompt_type = ?, current_turn_user_id = COALESCE(current_turn_user_id, ?), round_count = COALESCE(round_count, 1), used_prompts = ?, user1_another_one_count = COALESCE(user1_another_one_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?'
        ).run([prompt, type, currentTurnUserId, JSON.stringify(newUsedPrompts), matchId]);
      } else {
        db.prepare(
          'UPDATE truth_or_dare_games SET current_prompt = ?, current_prompt_type = ?, current_turn_user_id = COALESCE(current_turn_user_id, ?), round_count = COALESCE(round_count, 1), used_prompts = ?, user2_another_one_count = COALESCE(user2_another_one_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?'
        ).run([prompt, type, currentTurnUserId, JSON.stringify(newUsedPrompts), matchId]);
      }
    } else {
      db.prepare(
        'UPDATE truth_or_dare_games SET current_prompt = ?, current_prompt_type = ?, current_turn_user_id = COALESCE(current_turn_user_id, ?), round_count = COALESCE(round_count, 1), used_prompts = ?, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?'
      ).run([prompt, type, currentTurnUserId, JSON.stringify(newUsedPrompts), matchId]);
    }
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId });
    } catch (e) { /* ignore */ }

    res.json({
      prompt,
      fromAI,
      spiceLevel: levelNorm,
      currentTurnUserId,
      isYourTurn: true,
      roundCount: Math.max(1, Number(game.round_count) || 1),
      ...anotherOneAfter,
    });
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

    const gameResult = db.prepare('SELECT current_turn_user_id, round_count FROM truth_or_dare_games WHERE match_id = ?').get([matchId]);
    const game = (gameResult instanceof Promise ? await gameResult : gameResult) as { current_turn_user_id?: string | null; round_count?: number | string | null } | undefined;
    const currentTurnUserId = game?.current_turn_user_id || match.user1_id;
    const nextTurnUserId = currentTurnUserId === match.user1_id ? match.user2_id : match.user1_id;
    const nextRoundCount = Math.max(1, Number(game?.round_count) || 1) + 1;
    const updateTurnResult = db
      .prepare('UPDATE truth_or_dare_games SET current_turn_user_id = ?, round_count = ?, current_prompt = NULL, current_prompt_type = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?')
      .run([nextTurnUserId, nextRoundCount, matchId]);
    if (updateTurnResult instanceof Promise) await updateTurnResult;

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('truth_or_dare_updated', { matchId, currentTurnUserId: nextTurnUserId, roundCount: nextRoundCount });
    } catch (e) { /* ignore */ }
    res.json({
      success: true,
      currentPrompt: null,
      currentPromptType: null,
      currentTurnUserId: nextTurnUserId,
      isYourTurn: nextTurnUserId === userId,
      roundCount: nextRoundCount,
    });
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

    res.json({
      ...state,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      isUser1: userId === match.user1_id,
    });
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

    const { getGameState } = await import('../services/neverHaveIEver.js');
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[NHIE] GET state: match=${matchId} userId=${userId} completeRoundIfBothAnswered=true`);
    }
    // Complete round inside the same read when we see both answers (getGameState emits socket when it completes)
    let state = await getGameState(matchId, userId, match, { completeRoundIfBothAnswered: true });
    // If we're in playing but didn't see both, a second read after a short delay may see them (e.g. PostgreSQL visibility)
    if (state.phase === 'playing' && !state.bothAnswered) {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[NHIE] GET state retry: match=${matchId} bothAnswered=false, retrying after 400ms`);
      }
      await new Promise((r) => setTimeout(r, 400));
      const retryState = await getGameState(matchId, userId, match, { completeRoundIfBothAnswered: true });
      if (retryState.bothAnswered || (retryState.prompt && retryState.prompt !== state.prompt)) state = retryState;
    }

    if (state.phase === 'playing' && process.env.NODE_ENV !== 'test') {
      console.log(`[NHIE] GET state result: match=${matchId} bothAnswered=${state.bothAnswered} yourStrikes=${state.yourStrikes} theirStrikes=${state.theirStrikes} promptLen=${state.prompt?.length ?? 0} promptPreview=${(state.prompt ?? '').slice(0, 50)}`);
    }
    if (state.phase === 'playing') {
      console.log(`🙊 Never Have I Ever GET state: match=${matchId} yourStrikes=${state.yourStrikes} theirStrikes=${state.theirStrikes} bothAnswered=${state.bothAnswered} promptLen=${state.prompt?.length ?? 0}`);
    }

    res.json({
      ...state,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      unlockedByUserId: null,
      currentTurnUserId: state.currentTurnUserId ?? null,
      isYourTurn: state.isYourTurn ?? false,
      // Tally: points = number of "I have" (same as strikes in DB); coerce to number (PostgreSQL may return strings)
      yourPoints: Math.max(0, Number(state.yourStrikes) || 0),
      theirPoints: Math.max(0, Number(state.theirStrikes) || 0),
      // So client can map socket payload user1Strikes/user2Strikes to yourPoints/theirPoints
      isUser1: userId === match.user1_id,
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
    const { answer, roundId } = req.body as { answer?: string; roundId?: string | null };

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

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[NHIE] POST answer: match=${matchId} userId=${userId} answer=${answer}`);
    }

    const { submitAnswer } = await import('../services/neverHaveIEver.js');
    const rowResult = db.prepare('SELECT spice_level, current_prompt, current_turn_user_id FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const row = (rowResult instanceof Promise ? await rowResult : rowResult) as { spice_level: string | null; current_prompt: string | null; current_turn_user_id: string | null } | undefined;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🙊 NHIE answer route: match=${matchId} tally mode current_turn_user_id=${row?.current_turn_user_id ?? 'null'}`);
    }

    const result = await submitAnswer(matchId, userId, match, answer as 'have' | 'havent', roundId ?? null);
    const { state, roundResult, completedYourAnswer, completedTheirAnswer, pointsFromRound, newPrompt } = result as {
      state: { bothAnswered: boolean; yourStrikes: number; theirStrikes: number; prompt?: string; roundId?: string | null; gameOver?: boolean; winner?: string | null };
      roundResult?: { youStrike: boolean; themStrike: boolean };
      completedYourAnswer?: 'have' | 'havent';
      completedTheirAnswer?: 'have' | 'havent';
      pointsFromRound?: { newYourStrikes: number; newTheirStrikes: number };
      newPrompt?: string;
    };

    // Prefer pointsFromRound (single or both answered) so client always gets correct tally; fallback to state
    const yourPoints = Math.max(0, pointsFromRound != null ? Number(pointsFromRound.newYourStrikes) || 0 : (Number(state.yourStrikes) || 0));
    const theirPoints = Math.max(0, pointsFromRound != null ? Number(pointsFromRound.newTheirStrikes) || 0 : (Number(state.theirStrikes) || 0));
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🙊 Never Have I Ever answer: match=${matchId} user=${userId} answer=${answer} bothAnswered=${state.bothAnswered} yourPoints=${yourPoints} theirPoints=${theirPoints} hasPointsFromRound=${!!pointsFromRound}`);
    }

    const nextPrompt = roundResult ? (newPrompt ?? state.prompt ?? '') : undefined;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[NHIE] POST answer result: match=${matchId} roundResult=${!!roundResult} hasNewPrompt=${!!nextPrompt} newPromptLen=${nextPrompt?.length ?? 0} newPromptPreview=${(nextPrompt ?? '').slice(0, 50)}`);
    }
    if (process.env.NODE_ENV !== 'test' && roundResult) {
      console.log(`🙊 NHIE round complete: match=${matchId} sending new prompt=${!!nextPrompt} len=${nextPrompt?.length ?? 0}`);
    }

    // Brief delay so DB commit is visible to other connections before we emit (helps replica/read-your-writes)
    if (roundResult && nextPrompt) {
      await new Promise((r) => setTimeout(r, 150));
    }

    // Emit so other user gets new prompt and authoritative strike counts (so "them" updates without refetch timing)
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        let user1Strikes: number | undefined;
        let user2Strikes: number | undefined;
        const strikeRowResult = db.prepare('SELECT user1_strikes, user2_strikes FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
        const strikeRow = (strikeRowResult instanceof Promise ? await strikeRowResult : strikeRowResult) as { user1_strikes?: number; user2_strikes?: number } | undefined;
        if (strikeRow) {
          user1Strikes = Math.max(0, Number(strikeRow.user1_strikes) || 0);
          user2Strikes = Math.max(0, Number(strikeRow.user2_strikes) || 0);
        }
        const payload = {
          matchId,
          newPrompt: nextPrompt && nextPrompt.trim() ? nextPrompt : undefined,
          roundId: state.roundId ?? undefined,
          roundComplete: !!roundResult,
          ...(user1Strikes !== undefined && user2Strikes !== undefined && { user1Strikes, user2Strikes }),
        };
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', payload);
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[NHIE] POST answer emit: match=${matchId} roundComplete=${payload.roundComplete} newPromptLen=${payload.newPrompt?.length ?? 0} user1Strikes=${user1Strikes ?? 'none'} user2Strikes=${user2Strikes ?? 'none'} (other client uses these for "them" points)`);
        }
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever notification');
    }

    // When POST didn't complete the round (e.g. both users submitted at once and neither saw both answers),
    // run delayed completion at 1.2s and 2.5s so we advance the prompt and emit to both clients.
    if (!roundResult) {
      const runDelayedCompletion = async (delayMs: number) => {
        await new Promise((r) => setTimeout(r, delayMs));
        try {
          const { completeRoundIfBothAnswered } = await import('../services/neverHaveIEver.js');
          const completed = await completeRoundIfBothAnswered(matchId);
          if (completed.completed && process.env.NODE_ENV !== 'test') {
            console.log(`[NHIE] Delayed round completion: match=${matchId} delay=${delayMs}ms newPromptLen=${completed.newPrompt?.length ?? 0}`);
          }
        } catch (e) {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('[NHIE] Delayed round completion failed:', e);
          }
        }
      };
      void runDelayedCompletion(1200);
      void runDelayedCompletion(2500);
    }

    res.json({
      ...state,
      roundResult,
      roundJustCompleted: !!roundResult,
      yourPoints: Number(yourPoints),
      theirPoints: Number(theirPoints),
      yourStrikes: Number(yourPoints),
      theirStrikes: Number(theirPoints),
      isUser1: userId === match.user1_id,
      ...(pointsFromRound != null && { pointsFromRound: { newYourStrikes: Number(yourPoints), newTheirStrikes: Number(theirPoints) } }),
      ...(roundResult && { bothAnswered: true }),
      ...(nextPrompt != null && nextPrompt !== '' && { prompt: nextPrompt, newPrompt: nextPrompt }),
      ...(roundResult && completedYourAnswer != null && { yourAnswer: completedYourAnswer }),
      ...(roundResult && completedTheirAnswer != null && { theirAnswer: completedTheirAnswer }),
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

matchesRouter.post("/:matchId/never-have-i-ever/return-to-lobby", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
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

    const { returnToLobby } = await import('../services/neverHaveIEver.js');
    const state = await returnToLobby(matchId, userId, match);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', {
          matchId,
          roundReset: true,
          lobbyReset: true,
          user1Strikes: 0,
          user2Strikes: 0,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever return-to-lobby notification');
    }

    res.json({
      ...state,
      tokenUnlocked: true,
      needsSpiceChoiceFromUnlocker: false,
      isUser1: userId === match.user1_id,
      yourPoints: 0,
      theirPoints: 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Never Have I Ever return-to-lobby error:", error);
    res.status(500).json({ error: `Failed to return to lobby: ${errorMessage}` });
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
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('never_have_i_ever_updated', {
          matchId,
          newPrompt: state.prompt,
          roundId: state.roundId ?? null,
          roundComplete: true,
          roundReset: true,
          user1Strikes: 0,
          user2Strikes: 0,
        });
      }
    } catch (socketError) {
      console.warn('⚠️  Socket.io not available for Never Have I Ever restart notification');
    }
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

    const rowResult = db.prepare('SELECT spice_level, current_prompt FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const row = (rowResult instanceof Promise ? await rowResult : rowResult) as { spice_level: string | null; current_prompt: string | null } | undefined;
    if (!row?.spice_level) {
      return res.status(400).json({ error: "Set the version (PG-13 / R / Spicy) first." });
    }

    const { generateNeverHaveIEverPrompt } = await import('../services/neverHaveIEver.js');
    const spiceLevel = (row.spice_level === 'ratedr' ? 'ratedr' : row.spice_level === 'spicy' ? 'spicy' : 'pg13') as 'pg13' | 'ratedr' | 'spicy';
    const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
    const updateResult = db.prepare('UPDATE never_have_i_ever_games SET current_prompt = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = CURRENT_TIMESTAMP WHERE match_id = ?').run([prompt, matchId]);
    if (updateResult instanceof Promise) await updateResult;

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

    const counts = await getSenderMessageCounts(matchId, match.user1_id, match.user2_id);
    if (!bothUsersMetMatchChatDepthThreshold(counts.user1, counts.user2)) {
      return res.status(403).json({ error: DATE_PLAN_LOCKED_MESSAGE });
    }

    // Get shared interests
    const { getSharedInterests } = await import('../services/mulliganMoments.js');
    const sharedInterests = await getSharedInterests(matchId, match.user1_id, match.user2_id);

    // Generate date plan (no push here — push is sent when user clicks "Invite" and the plan is shared to chat)
    console.log(`📅 Generating date plan for match ${matchId}, user ${userId}`);
    console.log(`📅 Shared interests:`, sharedInterests);
    const { generateDatePlan } = await import('../services/dateBlueprint.js');
    const plan = await generateDatePlan(matchId, userId, sharedInterests);
    console.log(`✅ Date plan generated:`, plan.id);

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
        const { sendWebPushToUser, isWebPushConfigured } = await import('../services/webPushDelivery.js');

        if (isPushNotificationConfigured()) {
          const otherUserRowResult = db.prepare('SELECT push_token, push_notify_messages FROM users WHERE id = ?').get([otherUserId]);
          const otherUserRow = (otherUserRowResult instanceof Promise ? await otherUserRowResult : otherUserRowResult) as { push_token: string | null; push_notify_messages: number | null } | undefined;
          const wantsMessagePush = otherUserRow?.push_notify_messages === undefined || otherUserRow?.push_notify_messages === null || otherUserRow.push_notify_messages !== 0;
          const dateBody = `wants to confirm the date plan: "${plan.title}"`;
          if (wantsMessagePush && otherUserRow?.push_token && isExpoPushToken(otherUserRow.push_token)) {
            await sendMessagePushNotification(
              otherUserRow.push_token,
              currentUserName,
              dateBody,
              matchId,
              userId
            );
            console.log(`✅ Sent push notification for date plan acceptance to user ${otherUserId}`);
          } else if (!wantsMessagePush) {
            console.log(`ℹ️  User ${otherUserId} has message notifications disabled, skipping push`);
          } else {
            console.log(`ℹ️  No valid Expo push token for user ${otherUserId} (Web Push may still deliver)`);
          }
          if (wantsMessagePush && isWebPushConfigured()) {
            const n = await sendWebPushToUser(otherUserId, {
              title: currentUserName,
              body: dateBody,
              tag: `dateplan-${planId}`,
              url: "/matches",
              data: { type: "new_message", matchId, senderId: userId, planId },
            });
            if (n > 0) console.log(`✅ Web Push (date plan) → ${otherUserId} (${n})`);
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

