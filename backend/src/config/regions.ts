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

/** When a region is active, matches are capped at this distance (miles) within the region. */
export const REGION_MAX_DISTANCE_MILES = 100;

/** Service-area center for Southern Oregon (Medford / Rogue Valley). */
export const SOUTHERN_OREGON_SERVICE_CENTER = {
  lat: 42.3265,
  lng: -122.8756,
} as const;

/** Offline geocode fallback for common Southern Oregon cities (no API required). */
export const SOUTHERN_OREGON_CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  medford: { lat: 42.3265, lng: -122.8756 },
  ashland: { lat: 42.1945, lng: -122.7095 },
  'central point': { lat: 42.376, lng: -122.9167 },
  'grants pass': { lat: 42.439, lng: -123.3284 },
  jacksonville: { lat: 42.3137, lng: -122.967 },
  talent: { lat: 42.2457, lng: -122.7887 },
  phoenix: { lat: 42.2754, lng: -122.8181 },
  'rogue river': { lat: 42.4359, lng: -123.172 },
  'gold hill': { lat: 42.4318, lng: -123.0506 },
  'klamath falls': { lat: 42.2249, lng: -121.7817 },
  trail: { lat: 42.6482, lng: -122.8101 },
  brookings: { lat: 42.0526, lng: -124.284 },
  'crescent city': { lat: 41.7559, lng: -124.2017 },
  'eagle point': { lat: 42.4726, lng: -122.8028 },
  'white city': { lat: 42.434, lng: -122.8317 },
  'cave junction': { lat: 42.1632, lng: -123.6481 },
  merlin: { lat: 42.5173, lng: -123.4198 },
  'shady cove': { lat: 42.6107, lng: -122.8126 },
  prospect: { lat: 42.7512, lng: -122.4881 },
  williams: { lat: 42.2187, lng: -123.2739 },
  applegate: { lat: 42.0676, lng: -123.0642 },
  selma: { lat: 42.2782, lng: -123.6159 },
  'wolf creek': { lat: 42.6932, lng: -123.394 },
  'butte falls': { lat: 42.5432, lng: -122.5656 },
  wimer: { lat: 42.339, lng: -123.147 },
};

export function lookupSouthernOregonCityCoordinates(
  location: string,
): { lat: number; lng: number } | null {
  const normalized = normalizeRegionLocationInput(location);
  const city = normalized.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!city) return null;
  return SOUTHERN_OREGON_CITY_COORDINATES[city] ?? null;
}

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

/** Miles from the active region's service center (null if region unsupported). */
export function milesFromServiceCenter(lat: number, lng: number, regionId: string): number | null {
  if (regionId !== 'southern_oregon') return null;
  const R = 3959;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat - SOUTHERN_OREGON_SERVICE_CENTER.lat);
  const dLng = toRad(lng - SOUTHERN_OREGON_SERVICE_CENTER.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(SOUTHERN_OREGON_SERVICE_CENTER.lat)) *
      Math.cos(toRad(lat)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True when coordinates are within maxMiles of the region service center. */
export function isWithinRegionServiceRadius(
  lat: number,
  lng: number,
  regionId: string,
  maxMiles = REGION_MAX_DISTANCE_MILES,
): boolean {
  const miles = milesFromServiceCenter(lat, lng, regionId);
  if (miles == null) return false;
  return miles <= maxMiles;
}

/** Geocoded coords and/or known regional city text fall inside the service area. */
export function isLocationInActiveRegion(
  lat: number | null,
  lng: number | null,
  locationText: string | null | undefined,
  regionId: string,
  maxMiles = REGION_MAX_DISTANCE_MILES,
): boolean {
  if (isLikelyInRegionByText(locationText, regionId)) return true;
  if (lat != null && lng != null && isWithinRegionServiceRadius(lat, lng, regionId, maxMiles)) {
    return true;
  }
  return false;
}

/**
 * User-facing max distance for matching. null / 0 / invalid = unlimited ("Any").
 * Matches POST /matches/connect distance checks.
 */
export function effectiveMaxDistanceMiles(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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
export function normalizeRegionLocationInput(location: string): string {
  const normalized = location.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.includes(',')) return normalized;
  const withoutComma = normalized.match(/^(.+?)\s+(or|oregon|ore)\.?$/i);
  if (withoutComma) {
    return `${withoutComma[1].trim()}, ${withoutComma[2]}`;
  }
  return normalized;
}

/** Rogue Valley / Southern Oregon cities within the ~100 mi service area. */
export const SOUTHERN_OREGON_CITY_PATTERNS: RegExp[] = [
  /\bmedford\b/,
  /\bashland\b/,
  /\bcentral point\b/,
  /\beagle point\b/,
  /\bjacksonville\b/,
  /\bwhite city\b/,
  /\bphoenix\b/,
  /\btalent\b/,
  /\bgrants pass\b/,
  /\bcave junction\b/,
  /\brogue river\b/,
  /\bgold hill\b/,
  /\bklamath falls\b/,
  /\bbrookings\b/,
  /\bcrescent city\b/,
  /\bmerlin\b/,
  /\bwimer\b/,
  /\bshady cove\b/,
  /\btrail\b/,
  /\bbutte falls\b/,
  /\bprospect\b/,
  /\bwilliams\b/,
  /\bapplegate\b/,
  /\bselma\b/,
  /\bwolf creek\b/,
];

export function isLikelyInRegionByText(location: string | null | undefined, regionId: string): boolean {
  if (!location || !regionId) return false;
  const normalized = normalizeRegionLocationInput(location);

  if (regionId === 'southern_oregon' && lookupSouthernOregonCityCoordinates(normalized)) {
    return true;
  }

  if (regionId !== 'southern_oregon') return false;

  const hasRegionalCity = SOUTHERN_OREGON_CITY_PATTERNS.some((re) => re.test(normalized));
  const hasOregonMarker = /\b(or|oregon)\b/.test(normalized);
  const hasCountyMarker = /\b(jackson county|josephine county)\b/.test(normalized);
  const hasNorthernCaliforniaMarker = /\b(ca|california)\b/.test(normalized);

  if (hasCountyMarker) return true;
  if (hasRegionalCity && hasOregonMarker) return true;
  if (hasRegionalCity && hasNorthernCaliforniaMarker && /\b(crescent city|brookings)\b/.test(normalized)) {
    return true;
  }
  return hasRegionalCity && !/\b(new jersey|ma|massachusetts)\b/.test(normalized);
}
