import { db } from '../database.js';
import { geocodeLocation, calculateDistanceMiles } from '../utils/geocoding.js';
import {
  effectiveMaxDistanceMiles,
  getActiveMatchingRegion,
  isLocationInActiveRegion,
  REGION_MAX_DISTANCE_MILES,
} from '../config/regions.js';
import { getHiddenFromBrowseUserIds } from '../config/hiddenFromBrowse.js';
import { mutualGenderPreferencesMet } from '../utils/genderPreferences.js';
import {
  interestNamesFromAggregate,
  interestSimilarityFromNames,
  countPartnerQualityInterestHits,
} from '../utils/interestSimilarity.js';
import { checkDealbreakers } from '../utils/dealbreakers.js';
import { isAtWeeklyIncomingMatchLimit } from '../utils/matchSlotLimits.js';
import { sqlUserHasMinPhotos } from '../utils/accountStatus.js';
import { type BrowsePoolFunnel } from './browsePoolSummary.js';

const usePostgres = !!process.env.DATABASE_URL;

export interface BrowseProfileRow {
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

export type BrowseProfileWithMetadata = BrowseProfileRow & {
  interests_list: string | null;
  candidate_min_age: number;
  candidate_max_age: number;
  candidate_preferred_genders: string | null;
  candidate_max_distance: number | null;
};

export type ResolveBrowsePoolResult =
  | {
      ok: true;
      userProfile: BrowseProfileRow;
      candidates: BrowseProfileWithMetadata[];
      funnel: BrowsePoolFunnel;
      distanceByProfileId: Map<string, number | null>;
    }
  | { ok: false; error: string; status: number };

/** Shared browse funnel — used by GET /users/browse and admin browse-pool diagnostic. */
export async function resolveBrowseCandidatePool(
  userId: string,
  options?: { soberCircleOnly?: boolean },
): Promise<ResolveBrowsePoolResult> {
  const userProfile = await (db
    .prepare('SELECT * FROM profiles WHERE user_id = ?')
    .get([userId]) as Promise<BrowseProfileRow | undefined>);

  if (!userProfile) {
    return { ok: false, error: 'Please complete your profile first', status: 400 };
  }

  const soberCircleOnly = options?.soberCircleOnly === true;
  const userSoberLevel = (userProfile as BrowseProfileRow & { sober_circle_level?: string | null })
    .sober_circle_level;
  if (soberCircleOnly && !(userSoberLevel && String(userSoberLevel).trim())) {
    return {
      ok: false,
      error: 'Select your sobriety level in Sober Circle before connecting here.',
      status: 403,
    };
  }

  const userPrefs = await (db
    .prepare('SELECT * FROM preferences WHERE profile_id = ?')
    .get([userProfile.id]) as Promise<{
    min_age: number;
    max_age: number;
    preferred_genders: string | null;
    max_distance: number;
  } | undefined>);

  const existingMatches = await (db
    .prepare(
      `SELECT 
          CASE 
            WHEN user1_id = ? THEN user2_id 
            ELSE user1_id 
          END as matched_user_id
         FROM matches 
         WHERE (user1_id = ? OR user2_id = ?) 
         AND stage != 'expired'`,
    )
    .all([userId, userId, userId]) as Promise<{ matched_user_id: string }[]>);

  const matchedUserIds = existingMatches.map((m) => m.matched_user_id);

  const { getAllExcludedUserIdsForBrowse } = await import('../services/blockedMatching.js');
  const blockedUserIds = await getAllExcludedUserIdsForBrowse(userId);
  const hiddenFromBrowseIds = await getHiddenFromBrowseUserIds();

  const interestsAgg = usePostgres
    ? `COALESCE((SELECT string_agg(name, ',') FROM interests WHERE profile_id = p.id), '')`
    : `(SELECT GROUP_CONCAT(name) FROM interests WHERE profile_id = p.id)`;

  let query = `
      SELECT p.*, 
             u.photo_verified_at,
             ${interestsAgg} as interests_list,
             pref.min_age as candidate_min_age,
             pref.max_age as candidate_max_age,
             pref.preferred_genders as candidate_preferred_genders,
             pref.max_distance as candidate_max_distance
      FROM profiles p
      LEFT JOIN preferences pref ON pref.profile_id = p.id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id != ?
      AND (u.is_restricted IS NULL OR u.is_restricted = 0)
      ${sqlUserHasMinPhotos('u')}
    `;

  if (soberCircleOnly) {
    query += ` AND p.sober_circle_level IS NOT NULL AND TRIM(p.sober_circle_level) != ''`;
  }

  const params: unknown[] = [userId];

  const excludedUserIds = [...new Set([...matchedUserIds, ...blockedUserIds, ...hiddenFromBrowseIds])];
  if (excludedUserIds.length > 0) {
    const placeholders = excludedUserIds.map(() => '?').join(',');
    query += ` AND p.user_id NOT IN (${placeholders})`;
    params.push(...excludedUserIds);
  }

  if (userPrefs) {
    if (userPrefs.min_age != null && userPrefs.max_age != null) {
      query += ` AND (p.age IS NULL OR (p.age >= ? AND p.age <= ?))`;
      params.push(userPrefs.min_age, userPrefs.max_age);
    }

    if (userPrefs.preferred_genders) {
      try {
        const preferredGenders = (JSON.parse(userPrefs.preferred_genders) as string[]).map((g) =>
          g === 'Women' ? 'Woman' : g === 'Men' ? 'Man' : g,
        );
        const isEveryone = preferredGenders.includes('Everyone');
        if (preferredGenders.length > 0 && !isEveryone) {
          const gendersForQuery = new Set<string>(preferredGenders);
          for (const g of preferredGenders) {
            if (g === 'Other') gendersForQuery.add('Non-binary');
          }
          const genderList = Array.from(gendersForQuery);
          const placeholders = genderList.map(() => '?').join(',');
          query += ` AND p.gender IN (${placeholders})`;
          params.push(...genderList);
        }
      } catch {
        /* skip invalid JSON */
      }
    }
  }

  query += ` ORDER BY p.created_at DESC`;

  const allProfilesResult = db.prepare(query).all(params);
  const allProfiles = (allProfilesResult instanceof Promise
    ? await allProfilesResult
    : allProfilesResult) as BrowseProfileWithMetadata[];

  const funnel: BrowsePoolFunnel = {
    activeMatchCount: matchedUserIds.length,
    afterPreferencesQuery: allProfiles.length,
    afterRegionDistance: allProfiles.length,
    afterMutualGender: allProfiles.length,
    afterDealbreakers: allProfiles.length,
    afterIncomingCap: allProfiles.length,
  };

  const activeRegion = getActiveMatchingRegion();
  if (activeRegion) {
    if (!userProfile.location || !userProfile.location.trim()) {
      return {
        ok: false,
        error: 'Matching is currently only available in Southern Oregon. Please add your location to your profile.',
        status: 403,
      };
    }
    const userLocationResult = await geocodeLocation(userProfile.location);
    const userInRegion = isLocationInActiveRegion(
      userLocationResult.coordinates?.lat ?? null,
      userLocationResult.coordinates?.lng ?? null,
      userProfile.location,
      activeRegion,
    );
    if (!userInRegion) {
      return {
        ok: false,
        error:
          'Matching is only available in Southern Oregon. Use a city and state in your profile (e.g. Medford, OR or Ashland, Oregon).',
        status: 403,
      };
    }
  }

  let filteredProfiles = allProfiles;
  const distanceByProfileId = new Map<string, number | null>();
  const needGeocodeLoop =
    (userProfile.location && userPrefs && userPrefs.max_distance !== undefined) || activeRegion;
  if (needGeocodeLoop && userProfile.location) {
    const userLocationResult = await geocodeLocation(userProfile.location);
    if (userLocationResult.coordinates) {
      const profilesWithDistance = await Promise.all(
        allProfiles.map(async (p) => {
          if (!p.location) return { profile: p, distance: null, inRegion: false };
          const candidateLocationResult = await geocodeLocation(p.location);
          const coords = candidateLocationResult.coordinates;
          const inRegion =
            !activeRegion
            || isLocationInActiveRegion(
              coords?.lat ?? null,
              coords?.lng ?? null,
              p.location,
              activeRegion,
            );
          const distance = coords
            ? calculateDistanceMiles(userLocationResult.coordinates!, coords)
            : null;
          return { profile: p, distance, inRegion };
        }),
      );
      const maxDist = userPrefs?.max_distance;
      let maxDistMiles =
        maxDist != null && typeof maxDist === 'number' && maxDist > 0 ? maxDist : null;
      if (activeRegion && (maxDistMiles === null || maxDistMiles > REGION_MAX_DISTANCE_MILES)) {
        maxDistMiles = REGION_MAX_DISTANCE_MILES;
      }
      for (const row of profilesWithDistance) {
        distanceByProfileId.set(row.profile.id, row.distance);
      }
      filteredProfiles = profilesWithDistance
        .filter(({ distance, inRegion, profile }) => {
          if (activeRegion && !inRegion) return false;
          if (maxDistMiles !== null && distance !== null && distance > maxDistMiles) {
            return false;
          }
          const theirMaxMiles = effectiveMaxDistanceMiles(profile.candidate_max_distance);
          if (theirMaxMiles !== null && distance !== null && distance > theirMaxMiles) {
            return false;
          }
          return true;
        })
        .map(({ profile }) => profile);
    }
  }
  funnel.afterRegionDistance = filteredProfiles.length;

  filteredProfiles = filteredProfiles.filter((p) =>
    mutualGenderPreferencesMet(
      userProfile.gender || '',
      userPrefs?.preferred_genders ?? null,
      p.gender || '',
      p.candidate_preferred_genders ?? null,
    ),
  );
  funnel.afterMutualGender = filteredProfiles.length;

  {
    const kept: BrowseProfileWithMetadata[] = [];
    for (const p of filteredProfiles) {
      const okTowardCandidate = await checkDealbreakers(userProfile.id, p.id);
      const okTowardUser = await checkDealbreakers(p.id, userProfile.id);
      if (okTowardCandidate && okTowardUser) kept.push(p);
    }
    filteredProfiles = kept;
  }
  funnel.afterDealbreakers = filteredProfiles.length;

  {
    const kept: BrowseProfileWithMetadata[] = [];
    for (const p of filteredProfiles) {
      if (await isAtWeeklyIncomingMatchLimit(p.user_id)) continue;
      kept.push(p);
    }
    filteredProfiles = kept;
  }
  funnel.afterIncomingCap = filteredProfiles.length;

  const userInterestsForRanking = await (db
    .prepare('SELECT name FROM interests WHERE profile_id = ?')
    .all([userProfile.id]) as Promise<{ name: string }[]>);
  const userInterestNameSet = new Set(userInterestsForRanking.map((i) => i.name.toLowerCase()));

  const userPQRaw = await (db
    .prepare('SELECT quality FROM partner_qualities WHERE profile_id = ?')
    .all([userProfile.id]) as Promise<{ quality: string }[]>);
  const userPQLower = (Array.isArray(userPQRaw) ? userPQRaw : []).map((r) => r.quality.toLowerCase());

  filteredProfiles.sort((a, b) => {
    const namesA = interestNamesFromAggregate(a.interests_list);
    const namesB = interestNamesFromAggregate(b.interests_list);
    const simA = interestSimilarityFromNames(userInterestNameSet, namesA);
    const simB = interestSimilarityFromNames(userInterestNameSet, namesB);
    const pqHitsA = countPartnerQualityInterestHits(userPQLower, namesA);
    const pqHitsB = countPartnerQualityInterestHits(userPQLower, namesB);
    const totalA = simA.sharedCount + pqHitsA;
    const totalB = simB.sharedCount + pqHitsB;
    if (totalB !== totalA) return totalB - totalA;
    if (Math.abs(simB.blend01 - simA.blend01) > 0.0001) return simB.blend01 - simA.blend01;
    const distA = distanceByProfileId.get(a.id);
    const distB = distanceByProfileId.get(b.id);
    if (distA != null && distB != null) return distA - distB;
    if (distA != null) return -1;
    if (distB != null) return 1;
    return 0;
  });

  return {
    ok: true,
    userProfile,
    candidates: filteredProfiles,
    funnel,
    distanceByProfileId,
  };
}
