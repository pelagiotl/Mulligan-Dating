import { Router } from 'express';
import { db } from '../database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { geocodeLocation, calculateDistanceMiles } from '../utils/geocoding.js';

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
    const userProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId) as ProfileRow | undefined;
    
    if (!userProfile) {
      return res.status(400).json({ error: 'Please complete your profile first' });
    }

    const userPrefs = db.prepare('SELECT * FROM preferences WHERE profile_id = ?').get(userProfile.id) as {
      min_age: number;
      max_age: number;
      preferred_genders: string | null;
      max_distance: number;
    } | undefined;

    // Get list of user IDs that current user is already matched with
    const existingMatches = db
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
      .all(req.userId, req.userId, req.userId) as { matched_user_id: string }[];
    
    const matchedUserIds = existingMatches.map(m => m.matched_user_id);

    // Get list of blocked user IDs (both directions)
    const blockedUsers = db
      .prepare(
        `SELECT blocked_id as user_id FROM blocks WHERE blocker_id = ?
         UNION
         SELECT blocker_id as user_id FROM blocks WHERE blocked_id = ?`
      )
      .all(req.userId, req.userId) as { user_id: string }[];
    
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

    // NEW: Filter by lifestyle compatibility (automatic filtering based on lifestyle choices)
    const userLifestyle = db
      .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
      .get(userProfile.id) as {
        smoking: string | null;
        drinking: string | null;
        children: string | null;
        pets: string | null;
        religion: string | null;
        work_life_balance: string | null;
      } | undefined;
    
    if (userLifestyle) {
      filteredProfiles = filteredProfiles.filter((p) => {
        const candidateLifestyle = db
          .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
          .get(p.id) as {
            smoking: string | null;
            drinking: string | null;
            children: string | null;
            pets: string | null;
            religion: string | null;
            work_life_balance: string | null;
          } | undefined;
        
        if (!candidateLifestyle) return true; // Include if candidate hasn't set lifestyle yet
        
        // Drinking compatibility
        if (userLifestyle.drinking && candidateLifestyle.drinking) {
          const userDrinking = userLifestyle.drinking.toLowerCase();
          const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
          
          // Non-drinkers don't see anyone who drinks
          if (userDrinking === 'non-drinker') {
            if (candidateDrinking === 'occasionally' || candidateDrinking === 'social drinker') {
              return false; // Exclude drinkers
            }
          }
        }
        
        // Smoking compatibility
        if (userLifestyle.smoking && candidateLifestyle.smoking) {
          const userSmoking = userLifestyle.smoking.toLowerCase();
          const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
          
          // Non-smokers don't see anyone who smokes cigarettes or uses marijuana
          if (userSmoking === 'non-smoker') {
            if (candidateSmoking === 'smokes cigarettes' || candidateSmoking === 'uses marijuana' || candidateSmoking === 'both') {
              return false; // Exclude smokers/marijuana users
            }
          }
          // Cigarette smokers don't see non-smokers
          if (userSmoking === 'smokes cigarettes') {
            if (candidateSmoking === 'non-smoker') {
              return false; // Exclude non-smokers
            }
          }
          // Marijuana users don't see non-smokers
          if (userSmoking === 'uses marijuana') {
            if (candidateSmoking === 'non-smoker') {
              return false; // Exclude non-smokers
            }
          }
          // Both don't see non-smokers
          if (userSmoking === 'both') {
            if (candidateSmoking === 'non-smoker') {
              return false; // Exclude non-smokers
            }
          }
        }
        
        // Children compatibility
        if (userLifestyle.children && candidateLifestyle.children) {
          const userChildren = userLifestyle.children.toLowerCase();
          const candidateChildren = candidateLifestyle.children.toLowerCase();
          
          // Doesn't want children doesn't see wants/has children
          if (userChildren === "doesn't want children") {
            if (candidateChildren === 'wants children' || candidateChildren === 'has children') {
              return false; // Exclude
            }
          }
          // Wants children doesn't see doesn't want children
          if (userChildren === 'wants children') {
            if (candidateChildren === "doesn't want children") {
              return false; // Exclude
            }
          }
        }
        
        // Pets compatibility
        if (userLifestyle.pets && candidateLifestyle.pets) {
          const userPets = userLifestyle.pets.toLowerCase();
          const candidatePets = candidateLifestyle.pets.toLowerCase();
          
          // Doesn't like pets doesn't see loves/has pets
          if (userPets === "doesn't like pets") {
            if (candidatePets === 'loves pets' || candidatePets === 'has pets') {
              return false; // Exclude
            }
          }
          // Allergic to pets doesn't see has pets
          if (userPets === 'allergic to pets') {
            if (candidatePets === 'has pets') {
              return false; // Exclude
            }
          }
          // "Open to pets" is flexible - can see everyone (no filtering needed)
        }
        
        // Religion compatibility (only filter strict mismatches)
        if (userLifestyle.religion && candidateLifestyle.religion) {
          const userReligion = userLifestyle.religion.toLowerCase();
          const candidateReligion = candidateLifestyle.religion.toLowerCase();
          
          // Religious doesn't see atheist
          if (userReligion === 'religious') {
            if (candidateReligion === 'atheist') {
              return false; // Exclude
            }
          }
          // Atheist doesn't see religious
          if (userReligion === 'atheist') {
            if (candidateReligion === 'religious') {
              return false; // Exclude
            }
          }
        }
        
        return true; // No lifestyle conflicts, include
      });
    }
    
    // NEW: Filter by dealbreakers
    const userDealbreakers = db
      .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
      .all(userProfile.id) as { description: string }[];
    
    if (userDealbreakers.length > 0) {
      filteredProfiles = filteredProfiles.filter((p) => {
        // Get candidate's profile data for checking
        const candidateProfile = db
          .prepare("SELECT * FROM profiles WHERE id = ?")
          .get(p.id) as ProfileRow | undefined;
        
        if (!candidateProfile) return true; // Include if we can't check
        
        // Get candidate's interests, dealbreakers, and lifestyle
        const candidateInterests = db
          .prepare("SELECT name FROM interests WHERE profile_id = ?")
          .all(p.id) as { name: string }[];
        
        const candidateDealbreakers = db
          .prepare("SELECT description FROM dealbreakers WHERE profile_id = ?")
          .all(p.id) as { description: string }[];
        
        const candidateLifestyle = db
          .prepare("SELECT * FROM lifestyle WHERE profile_id = ?")
          .get(p.id) as {
            smoking: string | null;
            drinking: string | null;
            children: string | null;
            pets: string | null;
            religion: string | null;
            work_life_balance: string | null;
          } | undefined;
        
        // Build candidate text for keyword matching (fallback)
        const candidateText = `${candidateProfile.bio || ''} ${candidateProfile.display_name || ''} ${candidateProfile.location || ''} ${candidateInterests.map(i => i.name).join(' ')}`.toLowerCase();
        
        // Check each of the user's dealbreakers
        for (const dealbreaker of userDealbreakers) {
          const dealbreakerLower = dealbreaker.description.toLowerCase();
          
          // Method 1: Check if candidate has this as their own dealbreaker (they also don't want it)
          // This is a positive signal - they're aligned, so we can include them
          const candidateHasSameDealbreaker = candidateDealbreakers.some(
            db => db.description.toLowerCase() === dealbreakerLower
          );
          if (candidateHasSameDealbreaker) {
            continue; // They share the same dealbreaker, so it's not a problem
          }
          
          // Method 2: Check lifestyle data (MOST ACCURATE)
          if (candidateLifestyle) {
            // Smokes cigarettes dealbreaker
            if (dealbreakerLower === 'smokes cigarettes' && candidateLifestyle.smoking) {
              const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
              if (candidateSmoking === 'smokes cigarettes' || candidateSmoking === 'both') {
                return false; // Candidate smokes cigarettes, exclude them
              }
            }
            
            // Marijuana dealbreaker
            if (dealbreakerLower === 'marijuana' && candidateLifestyle.smoking) {
              const candidateSmoking = candidateLifestyle.smoking.toLowerCase();
              if (candidateSmoking === 'uses marijuana' || candidateSmoking === 'both') {
                return false; // Candidate uses marijuana, exclude them
              }
            }
            
            // Frequent drinking dealbreaker
            if (dealbreakerLower === 'frequent drinking' && candidateLifestyle.drinking) {
              const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
              if (candidateDrinking === 'social drinker') {
                return false; // Candidate is a social drinker, exclude them
              }
            }
            
            // Drinks alcohol dealbreaker
            if (dealbreakerLower === 'drinks alcohol' && candidateLifestyle.drinking) {
              const candidateDrinking = candidateLifestyle.drinking.toLowerCase();
              if (candidateDrinking === 'social drinker' || candidateDrinking === 'occasionally') {
                return false; // Candidate drinks alcohol, exclude them
              }
            }
            
            // Doesn't want children / Wants children dealbreakers
            if (dealbreakerLower === "doesn't want children" && candidateLifestyle.children) {
              const candidateChildren = candidateLifestyle.children.toLowerCase();
              if (candidateChildren === 'wants children' || candidateChildren === 'has children') {
                return false; // Candidate wants/has children, exclude them
              }
            }
            if (dealbreakerLower === 'wants children' && candidateLifestyle.children) {
              const candidateChildren = candidateLifestyle.children.toLowerCase();
              if (candidateChildren === "doesn't want children") {
                return false; // Candidate doesn't want children, exclude them
              }
            }
            
            // Doesn't like pets dealbreaker
            if (dealbreakerLower === "doesn't like pets" && candidateLifestyle.pets) {
              const candidatePets = candidateLifestyle.pets.toLowerCase();
              if (candidatePets === 'loves pets' || candidatePets === 'has pets') {
                return false; // Candidate loves/has pets, exclude them
              }
            }
            
            // Religious / Not religious dealbreakers
            if (dealbreakerLower === 'religious' && candidateLifestyle.religion) {
              const candidateReligion = candidateLifestyle.religion.toLowerCase();
              if (candidateReligion === 'not religious' || candidateReligion === 'atheist' || candidateReligion === 'agnostic') {
                return false; // Candidate is not religious, exclude them
              }
            }
            if (dealbreakerLower === 'not religious' && candidateLifestyle.religion) {
              const candidateReligion = candidateLifestyle.religion.toLowerCase();
              if (candidateReligion === 'religious' || candidateReligion === 'spiritual') {
                return false; // Candidate is religious, exclude them
              }
            }
            
            // Workaholic dealbreaker
            if (dealbreakerLower === 'workaholic' && candidateLifestyle.work_life_balance) {
              const candidateBalance = candidateLifestyle.work_life_balance.toLowerCase();
              if (candidateBalance === 'workaholic') {
                return false; // Candidate is a workaholic, exclude them
              }
            }
          }
          
          // Method 3: Check if dealbreaker appears in candidate's interests (for lifestyle dealbreakers)
          // For example: "Smoking" in interests means they smoke
          const candidateHasInInterests = candidateInterests.some(
            i => i.name.toLowerCase() === dealbreakerLower
          );
          if (candidateHasInInterests) {
            return false; // Candidate has this trait, exclude them
          }
          
          // Method 4: Keyword matching in profile text (bio, name, location) - fallback
          // Split dealbreaker into keywords and check if they appear
          const keywords = dealbreakerLower.split(/\s+/).filter(k => k.length > 2);
          if (keywords.length > 0 && keywords.some(keyword => candidateText.includes(keyword))) {
            // Additional check: make sure it's not a false positive
            // For example, "smoking" in "non-smoking" should not match
            const exactMatch = candidateText.includes(dealbreakerLower);
            if (exactMatch || keywords.every(k => candidateText.includes(k))) {
              return false; // Dealbreaker matched, exclude
            }
          }
        }
        return true; // No dealbreakers matched, include
      });
    }

    // NEW: Score and sort by interests overlap and partner qualities
    const userInterests = db
      .prepare("SELECT name FROM interests WHERE profile_id = ?")
      .all(userProfile.id) as { name: string }[];
    
    const userPartnerQualities = db
      .prepare("SELECT quality FROM partner_qualities WHERE profile_id = ?")
      .all(userProfile.id) as { quality: string }[];
    
    if (userInterests.length > 0 || userPartnerQualities.length > 0) {
      const profilesWithScores = filteredProfiles.map((p) => {
        // Calculate interests overlap
        const candidateInterests = p.interests_list 
          ? p.interests_list.split(',').map(i => i.trim().toLowerCase())
          : [];
        const userInterestNames = new Set(userInterests.map(i => i.name.toLowerCase()));
        const candidateInterestNames = new Set(candidateInterests);
        const sharedInterests = [...userInterestNames].filter(name => candidateInterestNames.has(name)).length;
        const totalInterests = new Set([...userInterestNames, ...candidateInterestNames]).size;
        const interestsScore = totalInterests > 0 ? (sharedInterests / totalInterests) : 0;
        
        // Calculate partner qualities match (now using interests - exact match)
        const userQualities = userPartnerQualities.map(q => q.quality.toLowerCase());
        // candidateInterestNames already declared above, reuse it
        const matchedQualities = userQualities.filter(q => candidateInterestNames.has(q)).length;
        const qualitiesScore = userQualities.length > 0 ? (matchedQualities / userQualities.length) : 0;
        
        // Combined score (interests 60%, qualities 40%)
        const matchScore = (interestsScore * 0.6) + (qualitiesScore * 0.4);
        
        return { profile: p, matchScore, sharedInterests, matchedQualities };
      });
      
      // Sort by match score (highest first), then by shared interests
      profilesWithScores.sort((a, b) => {
        if (b.matchScore !== a.matchScore) {
          return b.matchScore - a.matchScore;
        }
        return b.sharedInterests - a.sharedInterests;
      });
      
      filteredProfiles = profilesWithScores.map(({ profile }) => profile);
    }

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

