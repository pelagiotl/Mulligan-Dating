import {
  getActiveMatchingRegion,
  isLikelyInRegionByText,
  isWithinRegionServiceRadius,
  milesFromServiceCenter,
  REGION_MAX_DISTANCE_MILES,
} from '../config/regions.js';
import { geocodeLocation } from './geocoding.js';

export type LocationRegionValidationResult =
  | { ok: true }
  | { ok: false; message: string; code: 'OUTSIDE_SERVICE_AREA' };

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

  const geo = await geocodeLocation(text);
  if (geo.coordinates) {
    const { lat, lng } = geo.coordinates;
    if (isWithinRegionServiceRadius(lat, lng, regionId)) return { ok: true };
    const miles = milesFromServiceCenter(lat, lng, regionId) ?? 999;
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
