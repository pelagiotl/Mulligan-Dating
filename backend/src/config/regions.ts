/**
 * Geo-lock regions for matching. When ACTIVE_MATCHING_REGION is set,
 * only users whose location falls inside that region can match with each other.
 * Add more regions here when expanding to other cities.
 */

export interface RegionBounds {
  /** Latitude south (min lat) */
  south: number;
  /** Latitude north (max lat) */
  north: number;
  /** Longitude west (min lng) */
  west: number;
  /** Longitude east (max lng) */
  east: number;
}

export interface Region {
  id: string;
  name: string;
  bounds: RegionBounds;
}

/** Supported regions. Add more for other cities later. */
export const REGIONS: Record<string, Region> = {
  southern_oregon: {
    id: 'southern_oregon',
    name: 'Southern Oregon',
    bounds: {
      south: 41.5,
      north: 43.2,
      west: -124.6,
      east: -121.4,
    },
  },
};

/**
 * Check if (lat, lng) is inside the given region's bounding box.
 */
export function isInRegion(
  lat: number,
  lng: number,
  regionId: string
): boolean {
  const region = REGIONS[regionId];
  if (!region) return false;
  const { south, north, west, east } = region.bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

/** When a region is active, matches are capped at this distance (miles) within the region. */
export const REGION_MAX_DISTANCE_MILES = 100;

/**
 * Get the active matching region from env. When set, only users in this region can match.
 * Set ACTIVE_MATCHING_REGION=southern_oregon to geo-lock to Southern Oregon.
 * Omit or leave empty to allow matching everywhere (no geo-lock).
 */
export function getActiveMatchingRegion(): string | null {
  const v = process.env.ACTIVE_MATCHING_REGION;
  if (!v || typeof v !== 'string' || v.trim() === '') return null;
  const id = v.trim().toLowerCase();
  return REGIONS[id] ? id : null;
}
