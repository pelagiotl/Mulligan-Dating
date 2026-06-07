import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { geocodeLocation, calculateDistanceMiles } from '../utils/geocoding.js';
import { getCompletenessBoost } from '../utils/profileCompleteness.js';
import { expireOldMatches } from '../utils/expireMatches.js';
import { isMatchmakingGloballyDisabled, matchmakingDisabledJson } from '../config/matchmaking.js';
import {
  connectSetupErrorPayload,
  getConnectSetupViolationsForUser,
} from '../utils/connectRequirements.js';
import { mutualGenderPreferencesMet } from '../utils/genderPreferences.js';
import {
  interestNamesFromAggregate,
  interestSimilarityFromNames,
  countPartnerQualityInterestHits,
} from '../utils/interestSimilarity.js';
import {
  resolveBrowseCandidatePool,
  type BrowseProfileWithMetadata,
} from '../services/browseCandidatePool.js';
import { buildBrowsePoolSummary } from '../services/browsePoolSummary.js';

export const usersRouter = Router();

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

// Unlock browsing — requires at least one unused token (eligibility gate only).
// Tokens are consumed only when the user taps Connect (POST /matches/connect), not here.
usersRouter.post('/unlock-browse', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    if (isMatchmakingGloballyDisabled()) {
      return res.status(403).json(matchmakingDisabledJson());
    }

    // Check if browsing is already unlocked (idempotent: treat as success)
    const userResult = await (db.prepare('SELECT browse_unlocked_at FROM users WHERE id = ?').get([userId]) as Promise<{ browse_unlocked_at: string | null } | undefined>);
    
    if (userResult?.browse_unlocked_at) {
      return res.status(200).json({ message: 'Browsing is already unlocked. You can browse profiles now.', alreadyUnlocked: true });
    }

    const tokenResult = db
      .prepare(
        `SELECT id FROM mulligan_tokens 
         WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL
         ORDER BY granted_at ASC LIMIT 1`
      )
      .get([userId]);
    const token = (tokenResult instanceof Promise
      ? await tokenResult
      : tokenResult) as { id: string } | undefined;

    if (!token) {
      return res.status(400).json({ error: "No tokens available. Claim your weekly token!" });
    }

    const connectViolations = await getConnectSetupViolationsForUser(userId);
    if (connectViolations.length > 0) {
      return res.status(400).json(connectSetupErrorPayload(connectViolations));
    }

    const updateUserResult = db.prepare(
      `UPDATE users SET browse_unlocked_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run([userId]);
    if (updateUserResult instanceof Promise) {
      await updateUserResult;
    }

    res.json({ 
      message: 'Browsing unlocked! You can now see profiles.',
    });
  } catch (error) {
    console.error('Unlock browse error:', error);
    res.status(500).json({ error: 'Failed to unlock browsing' });
  }
});

// Browse profiles (excluding current user) - Returns ONE profile at a time
// REQUIRES: User must have unlocked browsing by using a token
usersRouter.get('/browse', authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (isMatchmakingGloballyDisabled()) {
      return res.status(403).json(matchmakingDisabledJson());
    }

    // Expire matches past 7-day limit so they don't count as "already matched" when user hasn't opened Matches tab
    await expireOldMatches();

    // Check if browsing is unlocked
    const userResult = await (db.prepare('SELECT browse_unlocked_at FROM users WHERE id = ?').get([req.userId]) as Promise<{ browse_unlocked_at: string | null } | undefined>);
    
    console.log('🔍 Browse check:', { userId: req.userId, browse_unlocked_at: userResult?.browse_unlocked_at });
    
    if (!userResult?.browse_unlocked_at) {
      console.log('🔒 Browsing is LOCKED for user:', req.userId);
      return res.status(403).json({ 
        error: 'Browsing is locked. Use a token to unlock browsing and see profiles.',
        requiresToken: true
      });
    }
    
    console.log('✅ Browsing is UNLOCKED for user:', req.userId);

    // Get one profile at a time (swipe-style interface)
    const limit = 1;
    const offset = parseInt(req.query.offset as string) || 0;

    const poolResult = await resolveBrowseCandidatePool(req.userId!);
    if (!poolResult.ok) {
      const code =
        poolResult.status === 403 && poolResult.error.includes('add your location')
          ? 'REGION_REQUIRES_LOCATION'
          : poolResult.status === 403
            ? 'OUTSIDE_ACTIVE_REGION'
            : undefined;
      return res.status(poolResult.status).json({ error: poolResult.error, ...(code ? { code } : {}) });
    }

    const { userProfile, candidates, funnel, distanceByProfileId } = poolResult;
    let filteredProfiles = candidates;
    const poolSummary = buildBrowsePoolSummary(funnel);

    console.log('📊 Browse pool funnel:', poolSummary);

    const userPrefs = await (db
      .prepare('SELECT max_distance FROM preferences WHERE profile_id = ?')
      .get([userProfile.id]) as Promise<{ max_distance: number } | undefined>);

    // Fast path for offset=0 (Connect flow): best interest overlap among filtered candidates
    if (offset === 0 && filteredProfiles.length > 0) {
      const p = filteredProfiles[0];
      let photoUrl: string | null = p.photo_url;
      if (!photoUrl || !String(photoUrl).trim()) {
        const primaryPhotoResult = db
          .prepare('SELECT url FROM photos WHERE profile_id = ? AND is_primary = 1 LIMIT 1')
          .get([p.id]);
        const primaryPhoto = (primaryPhotoResult instanceof Promise
          ? await primaryPhotoResult
          : primaryPhotoResult) as { url: string } | undefined;
        if (primaryPhoto?.url) photoUrl = primaryPhoto.url;
        else {
          const firstPhotoResult = db
            .prepare('SELECT url FROM photos WHERE profile_id = ? ORDER BY display_order ASC, id ASC LIMIT 1')
            .get([p.id]);
          const firstPhoto = (firstPhotoResult instanceof Promise
            ? await firstPhotoResult
            : firstPhotoResult) as { url: string } | undefined;
          if (firstPhoto?.url) photoUrl = firstPhoto.url;
        }
      }
      const formattedProfile = {
        id: p.id,
        userId: p.user_id,
        displayName: p.display_name,
        age: p.age,
        gender: p.gender,
        location: p.location,
        bio: p.bio,
        photoUrl,
        lookingFor: p.looking_for,
        interests: p.interests_list ? p.interests_list.split(',') : [],
        distance: null as number | null,
      };
      console.log('✅ Browse fast path: returning first profile', p.display_name);
      return res.json({
        profile: formattedProfile,
        hasMore: filteredProfiles.length > 1,
        offset: 0,
        total: filteredProfiles.length,
        poolSummary,
      });
    }

    const userInterestsForRanking = await (db
      .prepare('SELECT name FROM interests WHERE profile_id = ?')
      .all([userProfile.id]) as Promise<{ name: string }[]>);
    const userInterestNameSet = new Set(userInterestsForRanking.map((i) => i.name.toLowerCase()));

    // Score by shared interests (primary) + proximity — same interest blend as pre-sort above
    const maxDistForScore =
      userPrefs?.max_distance != null && typeof userPrefs.max_distance === 'number' && userPrefs.max_distance > 0
        ? userPrefs.max_distance
        : 100;

    const profilesWithScores = await Promise.all(filteredProfiles.map(async (p: BrowseProfileWithMetadata) => {
      const sim = interestSimilarityFromNames(
        userInterestNameSet,
        interestNamesFromAggregate(p.interests_list)
      );
      const interestsScore = sim.blend01;
      const sharedInterests = sim.sharedCount;

      const dist = distanceByProfileId.get(p.id) ?? null;
      let distanceScore = 0.5;
      if (dist != null && maxDistForScore > 0) {
        const ratio = Math.min(dist / maxDistForScore, 1);
        distanceScore = Math.exp(-3 * ratio);
      }

      let matchScore = interestsScore * 0.85 + distanceScore * 0.15;

      const completenessBoost = await getCompletenessBoost(p.id);
      matchScore *= completenessBoost;

      const candidateUserPromise = db
        .prepare("SELECT last_active_at FROM users WHERE id = ?")
        .get([p.user_id]);
      const candidateUser = (candidateUserPromise instanceof Promise
        ? await candidateUserPromise
        : candidateUserPromise) as { last_active_at: string | null } | undefined;

      if (candidateUser?.last_active_at) {
        const lastActive = new Date(candidateUser.last_active_at).getTime();
        const now = Date.now();
        const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
        if (daysSinceActive <= 7) {
          matchScore *= 1.05;
        } else if (daysSinceActive <= 30) {
          matchScore *= 1.02;
        }
      }

      return { profile: p, matchScore, sharedInterests };
    }));

    profilesWithScores.sort((a, b) => {
      if (Math.abs(b.matchScore - a.matchScore) > 0.01) {
        return b.matchScore - a.matchScore;
      }
      return b.sharedInterests - a.sharedInterests;
    });
    
    filteredProfiles = profilesWithScores.map(({ profile }) => profile);

    // Get ONE profile at a time (swipe-style interface)
    const selectedProfile = filteredProfiles[offset] || null;

    if (!selectedProfile) {
      return res.json({
        profile: null,
        hasMore: false,
        offset: offset,
        total: filteredProfiles.length,
        poolSummary,
      });
    }

    // Format the single profile with distance info
    // Always calculate distance if both users have locations (regardless of max_distance preference)
    let distance: number | null = null;
    if (userProfile.location && selectedProfile.location) {
      try {
        const userLoc = await geocodeLocation(userProfile.location);
        const candidateLoc = await geocodeLocation(selectedProfile.location);
        if (userLoc.coordinates && candidateLoc.coordinates) {
          distance = calculateDistanceMiles(userLoc.coordinates, candidateLoc.coordinates);
          console.log(`📍 Distance calculated: ${distance.toFixed(1)} miles between ${userProfile.location} and ${selectedProfile.location}`);
        } else {
          console.warn(`⚠️  Could not geocode locations: user="${userProfile.location}", candidate="${selectedProfile.location}"`);
        }
      } catch (error) {
        console.error('Error calculating distance:', error);
      }
    } else {
      console.log(`ℹ️  Missing locations - user: ${userProfile.location || 'none'}, candidate: ${selectedProfile.location || 'none'}`);
    }

    const formattedProfile = {
      id: selectedProfile.id,
      userId: selectedProfile.user_id,
      displayName: selectedProfile.display_name,
      age: selectedProfile.age,
      gender: selectedProfile.gender,
      location: selectedProfile.location,
      bio: selectedProfile.bio,
      photoUrl: selectedProfile.photo_url,
      lookingFor: selectedProfile.looking_for,
      interests: selectedProfile.interests_list ? selectedProfile.interests_list.split(',') : [],
      distance: distance !== null && distance !== undefined ? Math.round(distance * 10) / 10 : null, // Round to 1 decimal
    };

    res.json({
      profile: formattedProfile,
      hasMore: offset + 1 < filteredProfiles.length,
      offset: offset,
      total: filteredProfiles.length,
      poolSummary,
    });
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ error: 'Failed to load profiles' });
  }
});

// Diagnostic endpoint: Check why a specific user isn't showing in browse
// Usage: GET /users/diagnose/:targetUserId
usersRouter.get('/diagnose/:targetUserId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Expire matches past 7-day limit so expired matches aren't reported as "already matched"
    await expireOldMatches();

    const userId = req.userId!;
    const targetUserId = req.params.targetUserId;

    // Get current user's profile and preferences
    const userProfile = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([userId]) as Promise<ProfileRow | undefined>);
    if (!userProfile) {
      return res.status(400).json({ error: 'Please complete your profile first' });
    }

    const userPrefs = await (db.prepare('SELECT * FROM preferences WHERE profile_id = ?').get([userProfile.id]) as Promise<{
      min_age: number;
      max_age: number;
      preferred_genders: string | null;
      max_distance: number;
    } | undefined>);

    // Get target user's profile
    const targetProfile = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([targetUserId]) as Promise<ProfileRow | undefined>);
    if (!targetProfile) {
      return res.status(404).json({ error: 'Target user profile not found' });
    }

    // Check if target user is restricted
    const targetUser = await (db.prepare('SELECT is_restricted FROM users WHERE id = ?').get([targetUserId]) as Promise<{ is_restricted: number | null } | undefined>);
    const isRestricted = targetUser?.is_restricted === 1;

    // Check if already matched
    const existingMatch = await (db.prepare(
      `SELECT id FROM matches 
       WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
       AND stage != 'expired'`
    ).get([userId, targetUserId, targetUserId, userId]) as Promise<{ id: string } | undefined>);
    const isAlreadyMatched = !!existingMatch;

    const { isPairBlocked } = await import('../services/blockedMatching.js');
    const isBlocked = await isPairBlocked(userId, targetUserId);

    // Check age filter
    let ageFilterPass = true;
    let ageFilterReason = '';
    if (userPrefs?.min_age != null && userPrefs?.max_age != null) {
      if (targetProfile.age < userPrefs.min_age || targetProfile.age > userPrefs.max_age) {
        ageFilterPass = false;
        ageFilterReason = `Target age (${targetProfile.age}) is outside your age range (${userPrefs.min_age}-${userPrefs.max_age})`;
      }
    }

    const targetPrefs = await (db.prepare('SELECT preferred_genders FROM preferences WHERE profile_id = ?').get([targetProfile.id]) as Promise<{ preferred_genders: string | null } | undefined>);

    const genderFilterPass = mutualGenderPreferencesMet(
      userProfile.gender || '',
      userPrefs?.preferred_genders ?? null,
      targetProfile.gender || '',
      targetPrefs?.preferred_genders ?? null
    );
    const genderFilterReason = genderFilterPass
      ? ''
      : 'Filtered out: your gender preferences and theirs do not both allow this pairing (including "who I want to connect with").';

    // Check distance filter
    let distanceFilterPass = true;
    let distanceFilterReason = '';
    let distance: number | null = null;
    if (userProfile.location && targetProfile.location && userPrefs?.max_distance) {
      try {
        const userLoc = await geocodeLocation(userProfile.location);
        const targetLoc = await geocodeLocation(targetProfile.location);
        if (userLoc.coordinates && targetLoc.coordinates) {
          distance = calculateDistanceMiles(userLoc.coordinates, targetLoc.coordinates);
          // Only filter by distance if max_distance is set (not null/unlimited)
          if (userPrefs.max_distance !== null && distance > userPrefs.max_distance) {
            distanceFilterPass = false;
            distanceFilterReason = `Target is ${distance.toFixed(1)} miles away, exceeding your max distance of ${userPrefs.max_distance} miles`;
          }
        }
      } catch (error) {
        distanceFilterReason = 'Could not calculate distance';
      }
    }

    // Summary: browse applies mutual dealbreakers vs lifestyle/interests, then ranks by interests + "looking for" vs their interests
    const allChecksPass = !isRestricted && !isAlreadyMatched && !isBlocked &&
                         ageFilterPass && genderFilterPass && distanceFilterPass;

    res.json({
      targetUser: {
        id: targetProfile.user_id,
        displayName: targetProfile.display_name,
        age: targetProfile.age,
        gender: targetProfile.gender,
        location: targetProfile.location,
      },
      checks: {
        isRestricted: { pass: !isRestricted, reason: isRestricted ? 'Target user account is restricted' : null },
        isAlreadyMatched: { pass: !isAlreadyMatched, reason: isAlreadyMatched ? 'You are already matched with this user' : null },
        isBlocked: { pass: !isBlocked, reason: isBlocked ? 'You or the target user has blocked the other' : null },
        ageFilter: { pass: ageFilterPass, reason: ageFilterReason || null },
        genderFilter: { pass: genderFilterPass, reason: genderFilterReason || null },
        distanceFilter: { pass: distanceFilterPass, reason: distanceFilterReason || null, distance },
      },
      willAppearInBrowse: allChecksPass,
      summary: allChecksPass 
        ? '✅ This user should appear in your browse results'
        : '❌ This user is being filtered out. See reasons above.'
    });
  } catch (error) {
    console.error('Diagnose error:', error);
    res.status(500).json({ error: 'Failed to diagnose user visibility' });
  }
});

// Get single profile by ID
usersRouter.get('/:profileId', authenticateToken, (req: AuthRequest, res) => {
  const { profileId } = req.params;

  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) as ProfileRow | undefined;
  
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Get interests
  const interests = db.prepare('SELECT name, category FROM interests WHERE profile_id = ?').all(profileId);
  
  // Get partner qualities
  const qualities = db.prepare('SELECT quality, importance FROM partner_qualities WHERE profile_id = ?').all(profileId);

  res.json({
    id: profile.id,
    displayName: profile.display_name,
    age: profile.age,
    gender: profile.gender,
    location: profile.location,
    bio: profile.bio,
    photoUrl: profile.photo_url,
    lookingFor: profile.looking_for,
    interests,
    partnerQualities: qualities
  });
});

