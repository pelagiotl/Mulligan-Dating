import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { geocodeLocation, calculateDistanceMiles } from '../utils/geocoding.js';
import { checkDealbreakers as checkDealbreakersUtil } from '../utils/dealbreakers.js';
import { getCompletenessBoost } from '../utils/profileCompleteness.js';

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

// Browse profiles (excluding current user) - Returns ONE profile at a time
usersRouter.get('/browse', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Get one profile at a time (swipe-style interface)
    const limit = 1;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get current user's profile and preferences
    const userProfile = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([req.userId]) as Promise<ProfileRow | undefined>);
    
    if (!userProfile) {
      return res.status(400).json({ error: 'Please complete your profile first' });
    }

    const userPrefs = await (db.prepare('SELECT * FROM preferences WHERE profile_id = ?').get([userProfile.id]) as Promise<{
      min_age: number;
      max_age: number;
      preferred_genders: string | null;
      max_distance: number;
    } | undefined>);

    // Get list of user IDs that current user is already matched with
    const existingMatches = await (db
      .prepare(
        `SELECT 
          CASE 
            WHEN user1_id = ? THEN user2_id 
            ELSE user1_id 
          END as matched_user_id
         FROM matches 
         WHERE (user1_id = ? OR user2_id = ?) 
         AND stage != 'expired'`
      )
      .all([req.userId, req.userId, req.userId]) as Promise<{ matched_user_id: string }[]>);
    
    const matchedUserIds = existingMatches.map(m => m.matched_user_id);

    // Get list of blocked user IDs (both directions)
    const blockedUsers = await (db
      .prepare(
        `SELECT blocked_id as user_id FROM blocks WHERE blocker_id = ?
         UNION
         SELECT blocker_id as user_id FROM blocks WHERE blocked_id = ?`
      )
      .all([req.userId, req.userId]) as Promise<{ user_id: string }[]>);
    
    const blockedUserIds = blockedUsers.map(b => b.user_id);

    // Build query with preference filters
    let query = `
      SELECT p.*, 
             (SELECT GROUP_CONCAT(name) FROM interests WHERE profile_id = p.id) as interests_list,
             pref.min_age as candidate_min_age,
             pref.max_age as candidate_max_age,
             pref.preferred_genders as candidate_preferred_genders
      FROM profiles p
      LEFT JOIN preferences pref ON pref.profile_id = p.id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id != ?
      AND (u.is_restricted IS NULL OR u.is_restricted = 0)
    `;

    const params: any[] = [req.userId];

    // Exclude users that are already matched or blocked
    const excludedUserIds = [...new Set([...matchedUserIds, ...blockedUserIds])];
    if (excludedUserIds.length > 0) {
      const placeholders = excludedUserIds.map(() => '?').join(',');
      query += ` AND p.user_id NOT IN (${placeholders})`;
      params.push(...excludedUserIds);
    }

    // Filter by age range (mutual)
    if (userPrefs) {
      query += ` AND p.age >= ? AND p.age <= ?`;
      params.push(userPrefs.min_age, userPrefs.max_age);
      
      // Filter by gender preferences (if user has preferences set)
      if (userPrefs.preferred_genders) {
        try {
          const preferredGenders = JSON.parse(userPrefs.preferred_genders) as string[];
          console.log('🔍 Gender filter:', { preferredGenders, raw: userPrefs.preferred_genders });
          if (preferredGenders.length > 0) {
            const placeholders = preferredGenders.map(() => '?').join(',');
            query += ` AND p.gender IN (${placeholders})`;
            params.push(...preferredGenders);
            console.log('✅ Applied gender filter:', preferredGenders);
          } else {
            console.log('⚠️  Preferred genders array is empty');
          }
        } catch (error) {
          // Invalid JSON, skip gender filter
          console.error('❌ Failed to parse preferred_genders:', error, 'Raw value:', userPrefs.preferred_genders);
        }
      } else {
        console.log('ℹ️  No preferred_genders set in preferences');
      }
    }

    query += ` ORDER BY p.created_at DESC`;
    // Note: We'll apply distance filtering after fetching, so we get more results to filter

    const allProfiles = db.prepare(query).all(...params) as (ProfileRow & { 
      interests_list: string | null;
      candidate_min_age: number;
      candidate_max_age: number;
      candidate_preferred_genders: string | null;
    })[];

    // Filter by distance if user has location and max_distance preference
    let filteredProfiles = allProfiles;
    if (userProfile.location && userPrefs?.max_distance) {
      // Geocode user's location once
      const userLocationResult = await geocodeLocation(userProfile.location);
      
      if (userLocationResult.coordinates) {
        // Filter profiles by distance
        const profilesWithDistance = await Promise.all(
          allProfiles.map(async (p) => {
            if (!p.location) {
              return { profile: p, distance: null };
            }
            
            const candidateLocationResult = await geocodeLocation(p.location);
            const distance = candidateLocationResult.coordinates
              ? calculateDistanceMiles(userLocationResult.coordinates, candidateLocationResult.coordinates)
              : null;
            
            return { profile: p, distance };
          })
        );

        // Filter by max_distance and sort by distance
        filteredProfiles = profilesWithDistance
          .filter(({ distance }) => distance === null || distance <= userPrefs.max_distance)
          .sort((a, b) => {
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance; // Closer first
          })
          .map(({ profile }) => profile);
      }
    }

    // NOTE: Lifestyle is NOT used for hard filtering here
    // It will be used for scoring/preference matching instead
    // Only dealbreakers (checked below) will hard-filter users
    
    // NEW: Filter by dealbreakers using comprehensive utility
    filteredProfiles = filteredProfiles.filter((p) => {
      return checkDealbreakersUtil(userProfile.id, p.id);
    });

    // NEW: Score and sort by interests overlap, partner qualities ("What I'm Looking For"), AND lifestyle compatibility
    const userInterests = db
      .prepare("SELECT name FROM interests WHERE profile_id = ?")
      .all(userProfile.id) as { name: string }[];
    
    const userPartnerQualities = db
      .prepare("SELECT quality FROM partner_qualities WHERE profile_id = ?")
      .all(userProfile.id) as { quality: string }[];
    
    const userLifestyle = db
      .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
      .get(userProfile.id) as {
        smoking: string | null;
        drinking: string | null;
        children: string | null;
        pets: string | null;
        religion: string | null;
        work_life_balance: string | null;
        works_out: string | null;
      } | undefined;
    
    // Calculate match scores for all profiles (always score, even if no preferences set)
    const profilesWithScores = filteredProfiles.map((p) => {
      // Calculate interests overlap
      const candidateInterests = p.interests_list 
        ? p.interests_list.split(',').map(i => i.trim().toLowerCase())
        : [];
      const userInterestNames = new Set(userInterests.map(i => i.name.toLowerCase()));
      const candidateInterestNames = new Set(candidateInterests);
      const sharedInterests = [...userInterestNames].filter(name => candidateInterestNames.has(name)).length;
      const totalInterests = new Set([...userInterestNames, ...candidateInterestNames]).size;
      const interestsScore = totalInterests > 0 ? (sharedInterests / totalInterests) : 0.5; // Default to neutral if no interests
      
      // Calculate partner qualities match ("What I'm Looking For")
      // Get candidate's actual partner qualities, not just interests
      const candidatePartnerQualities = db
        .prepare("SELECT quality FROM partner_qualities WHERE profile_id = ?")
        .all(p.id) as { quality: string }[];
      const candidateQualityNames = new Set(candidatePartnerQualities.map(q => q.quality.toLowerCase()));
      
      const userQualities = userPartnerQualities.map(q => q.quality.toLowerCase());
      const matchedQualities = userQualities.filter(q => candidateQualityNames.has(q)).length;
      const qualitiesScore = userQualities.length > 0 ? (matchedQualities / userQualities.length) : 0.5; // Default to neutral if no qualities
      
      // Calculate lifestyle compatibility score
      let lifestyleScore = 0.5; // Default to neutral if no lifestyle data
      if (userLifestyle) {
        const candidateLifestyle = db
          .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
          .get(p.id) as {
            smoking: string | null;
            drinking: string | null;
            children: string | null;
            pets: string | null;
            religion: string | null;
            work_life_balance: string | null;
            works_out: string | null;
          } | undefined;
        
        if (candidateLifestyle) {
          let matches = 0;
          let total = 0;
          
          // Smoking match
          if (userLifestyle.smoking && candidateLifestyle.smoking) {
            total++;
            const userSmoking = userLifestyle.smoking.toLowerCase();
            const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
            if (userSmoking === candidateSmoking) {
              matches += 1; // Exact match
            } else if (
              (userSmoking === 'non-smoker' && candidateSmoking === 'non-smoker') ||
              (userSmoking.includes('smokes') && candidateSmoking.includes('smokes')) ||
              (userSmoking.includes('marijuana') && candidateSmoking.includes('marijuana'))
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Drinking match
          if (userLifestyle.drinking && candidateLifestyle.drinking) {
            total++;
            const userDrinking = userLifestyle.drinking.toLowerCase();
            const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
            if (userDrinking === candidateDrinking) {
              matches += 1; // Exact match
            } else if (
              (userDrinking === 'non-drinker' && candidateDrinking === 'non-drinker') ||
              (userDrinking.includes('drink') && candidateDrinking.includes('drink'))
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Children match
          if (userLifestyle.children && candidateLifestyle.children) {
            total++;
            const userChildren = userLifestyle.children.toLowerCase();
            const candidateChildren = candidateLifestyle.children.toLowerCase();
            if (userChildren === candidateChildren) {
              matches += 1; // Exact match
            } else if (
              (userChildren.includes('children') && candidateChildren.includes('children')) ||
              (userChildren.includes("doesn't want") && candidateChildren.includes("doesn't want"))
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Pets match
          if (userLifestyle.pets && candidateLifestyle.pets) {
            total++;
            const userPets = userLifestyle.pets.toLowerCase();
            const candidatePets = candidateLifestyle.pets.toLowerCase();
            if (userPets === candidatePets) {
              matches += 1; // Exact match
            } else if (
              (userPets.includes('pets') && candidatePets.includes('pets')) ||
              (userPets.includes("doesn't like") && candidatePets.includes("doesn't like"))
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Religion match
          if (userLifestyle.religion && candidateLifestyle.religion) {
            total++;
            const userReligion = userLifestyle.religion.toLowerCase();
            const candidateReligion = candidateLifestyle.religion.toLowerCase();
            if (userReligion === candidateReligion) {
              matches += 1; // Exact match
            } else if (
              (userReligion === 'spiritual' && candidateReligion === 'spiritual') ||
              (userReligion === 'agnostic' && candidateReligion === 'agnostic')
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Work-life balance match
          if (userLifestyle.work_life_balance && candidateLifestyle.work_life_balance) {
            total++;
            const userBalance = userLifestyle.work_life_balance.toLowerCase();
            const candidateBalance = candidateLifestyle.work_life_balance.toLowerCase();
            if (userBalance === candidateBalance) {
              matches += 1; // Exact match
            } else if (
              (userBalance.includes('balanced') && candidateBalance.includes('balanced')) ||
              (userBalance.includes('flexible') && candidateBalance.includes('flexible'))
            ) {
              matches += 0.5; // Partial match
            }
          }
          
          // Works out match - NEW field
          if (userLifestyle.works_out && candidateLifestyle.works_out) {
            total++;
            const userWorksOut = userLifestyle.works_out.toLowerCase();
            const candidateWorksOut = candidateLifestyle.works_out.toLowerCase();
            if (userWorksOut === candidateWorksOut) {
              matches += 1; // Exact match
            } else if (
              (userWorksOut === 'all the time' && candidateWorksOut === 'frequently') ||
              (userWorksOut === 'frequently' && candidateWorksOut === 'all the time')
            ) {
              matches += 0.9; // Very compatible - both are active
            } else if (
              (userWorksOut === 'frequently' && candidateWorksOut === 'sometimes') ||
              (userWorksOut === 'sometimes' && candidateWorksOut === 'frequently')
            ) {
              matches += 0.7; // Compatible - both exercise
            } else if (
              (userWorksOut === 'all the time' && candidateWorksOut === 'sometimes') ||
              (userWorksOut === 'sometimes' && candidateWorksOut === 'all the time')
            ) {
              matches += 0.6; // Partial match
            } else if (
              (userWorksOut === 'never' && candidateWorksOut === 'never')
            ) {
              matches += 0.8; // Both don't work out - compatible
            } else if (
              ((userWorksOut === 'all the time' || userWorksOut === 'frequently') && 
               candidateWorksOut === 'never') ||
              (userWorksOut === 'never' && 
               (candidateWorksOut === 'all the time' || candidateWorksOut === 'frequently'))
            ) {
              matches += 0.3; // Mismatch - one is very active, other isn't
            }
          }
          
          lifestyleScore = total > 0 ? matches / total : 0.5;
        }
      }
      
      // Combined score: Partner Qualities ("What I'm Looking For") 45%, Interests 30%, Lifestyle 25%
      // Partner Qualities is highest priority since it's explicitly "What I'm Looking For"
      let matchScore = (qualitiesScore * 0.45) + (interestsScore * 0.30) + (lifestyleScore * 0.25);
      
      // 10/10 FEATURES: Apply boosts
      // 1. Profile completeness boost
      const completenessBoost = getCompletenessBoost(p.id);
      matchScore *= completenessBoost;
      
      // 2. Recency boost (recently active users)
      const candidateUser = db
        .prepare("SELECT last_active_at FROM users WHERE id = ?")
        .get(p.user_id) as { last_active_at: string | null } | undefined;
      
      if (candidateUser?.last_active_at) {
        const lastActive = new Date(candidateUser.last_active_at).getTime();
        const now = Date.now();
        const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
        
        if (daysSinceActive <= 7) {
          matchScore *= 1.05; // 5% boost if active in last 7 days
        } else if (daysSinceActive <= 30) {
          matchScore *= 1.02; // 2% boost if active in last 30 days
        }
      }
      
      return { profile: p, matchScore, sharedInterests, matchedQualities, lifestyleScore };
    });
    
    // Sort by match score (highest first), then by shared interests
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
        total: filteredProfiles.length
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
      total: filteredProfiles.length
    });
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).json({ error: 'Failed to load profiles' });
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

