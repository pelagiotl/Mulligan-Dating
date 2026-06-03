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
/** Bounds use a small buffer so cities like Medford, OR are reliably inside. */
export const REGIONS: Record<string, Region> = {
  southern_oregon: {
    id: 'southern_oregon',
    name: 'Southern Oregon',
    bounds: {
      south: 41.4,
      north: 43.3,
      west: -124.7,
      east: -121.3,
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

/** Clamp user max-distance preference to the regional cap. */
export function normalizeMaxDistanceMiles(value: number | null | undefined): number {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) {
    return REGION_MAX_DISTANCE_MILES;
  }
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, REGION_MAX_DISTANCE_MILES);
}

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


/**
 * Fallback text-based region check for cases where geocoding fails or is rate-limited.
 * This is intentionally conservative and currently only supports southern_oregon.
 */
export function isLikelyInRegionByText(location: string | null | undefined, regionId: string): boolean {
  if (!location || !regionId) return false;
  const normalized = location.toLowerCase().replace(/\s+/g, ' ').trim();

  if (regionId !== 'southern_oregon') return false;

  const cityPatterns: RegExp[] = [
    /medford/,
    /ashland/,
    /central point/,
    /eagle point/,
    /jacksonville/,
    /white city/,
    /phoenix/,
    /talent/,
    /grants pass/,
    /cave junction/,
    /rogue river/,
    /gold hill/,
  ];

  const hasRegionalCity = cityPatterns.some((re) => re.test(normalized));
  const hasOregonMarker = /(or|oregon)/.test(normalized);
  const hasCountyMarker = /(jackson county|josephine county)/.test(normalized);

  return hasCountyMarker || (hasRegionalCity && (hasOregonMarker || !/(new jersey|ma|massachusetts)/.test(normalized)));
}
