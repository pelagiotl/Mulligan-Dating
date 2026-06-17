import {
  getActiveMatchingRegion,
  isLikelyInRegionByText,
  isWithinRegionServiceRadius,
  milesFromServiceCenter,
  normalizeRegionLocationInput,
  REGION_MAX_DISTANCE_MILES,
} from '../config/regions.js';
import { geocodeLocation } from './geocoding.js';

export type LocationRegionValidationResult =
  | { ok: true }
  | { ok: false; message: string; code: 'OUTSIDE_SERVICE_AREA' };

function geocodeQueriesForRegionCheck(location: string): string[] {
  const trimmed = location.trim();
  const queries = new Set<string>([trimmed]);
  const normalized = normalizeRegionLocationInput(trimmed);

  const commaParts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2 && /^(or|oregon|ore)$/i.test(commaParts[1])) {
    queries.add(`${commaParts[0]}, Oregon, USA`);
  }

  if (normalized !== trimmed.toLowerCase()) {
    queries.add(normalized);
    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && /^(or|oregon|ore)$/i.test(parts[1])) {
      queries.add(`${parts[0]}, Oregon, USA`);
    }
  }

  return [...queries];
}

async function geocodeWithinServiceArea(
  location: string,
  regionId: string,
): Promise<{ lat: number; lng: number } | null> {
  let bestOutside: { lat: number; lng: number } | null = null;

  for (const query of geocodeQueriesForRegionCheck(location)) {
    const geo = await geocodeLocation(query);
    if (!geo.coordinates) continue;
    if (isWithinRegionServiceRadius(geo.coordinates.lat, geo.coordinates.lng, regionId)) {
      return geo.coordinates;
    }
    bestOutside = geo.coordinates;
  }

  return bestOutside;
}

/**
 * When ACTIVE_MATCHING_REGION is set, profile locations must be within the
 * regional service radius (currently 100 miles from Southern Oregon).
 */
export async function validateLocationForActiveRegion(
  location: string | null | undefined,
): Promise<LocationRegionValidationResult> {
  const regionId = getActiveMatchingRegion();
  if (!regionId) return { ok: true };
  if (!location?.trim()) return { ok: true };

  const text = location.trim();
  if (isLikelyInRegionByText(text, regionId)) return { ok: true };

  const geo = await geocodeWithinServiceArea(text, regionId);
  if (geo) {
    if (isWithinRegionServiceRadius(geo.lat, geo.lng, regionId)) {
      return { ok: true };
    }
    const miles = milesFromServiceCenter(geo.lat, geo.lng, regionId) ?? 999;
    return {
      ok: false,
      message: `Mulligan is for Southern Oregon and nearby areas within ${REGION_MAX_DISTANCE_MILES} miles. That location is about ${Math.round(miles)} miles away — try a closer city (e.g. Medford, Ashland, or Grants Pass).`,
      code: 'OUTSIDE_SERVICE_AREA',
    };
  }

  return {
    ok: false,
    message: `Use a city and state within ${REGION_MAX_DISTANCE_MILES} miles of Southern Oregon (e.g. Medford, OR or Ashland, Oregon).`,
    code: 'OUTSIDE_SERVICE_AREA',
  };
}
