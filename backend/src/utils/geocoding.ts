/**
 * Geocoding utility for converting locations to coordinates and calculating distances
 * Supports multiple providers: Mapbox, Google Maps, and Nominatim (free fallback)
 */

interface Coordinates {
  lat: number;
  lng: number;
}

interface GeocodeResult {
  coordinates: Coordinates | null;
  formatted: string | null;
}

// Simple in-memory cache to avoid repeated API calls
const geocodeCache = new Map<string, GeocodeResult>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const cacheTimestamps = new Map<string, number>();

/**
 * Geocode a location string to coordinates using the configured provider
 */
export async function geocodeLocation(location: string): Promise<GeocodeResult> {
  if (!location || location.trim() === '') {
    return { coordinates: null, formatted: null };
  }

  // Check cache first
  const cacheKey = location.toLowerCase().trim();
  const cached = geocodeCache.get(cacheKey);
  const cacheTime = cacheTimestamps.get(cacheKey);
  
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return cached;
  }

  // Try providers in order of preference
  const providers = [
    geocodeWithMapbox,
    geocodeWithGoogle,
    geocodeWithNominatim, // Free fallback
  ];

  // Check which providers are configured
  const mapboxKey = process.env.MAPBOX_ACCESS_TOKEN;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!mapboxKey && !googleKey) {
    console.log('ℹ️  No API keys configured - using Nominatim (free fallback)');
  } else {
    if (mapboxKey) {
      console.log('✅ Mapbox API key found');
    }
    if (googleKey) {
      console.log('✅ Google Maps API key found');
    }
  }
  
  const providerNames = ['Mapbox', 'Google Maps', 'Nominatim'];
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const providerName = providerNames[i];
    try {
      const result = await provider(location);
      if (result.coordinates) {
        // Cache the result
        geocodeCache.set(cacheKey, result);
        cacheTimestamps.set(cacheKey, Date.now());
        console.log(`✅ Geocoded "${location}" using ${providerName}:`, result.coordinates);
        return result;
      }
    } catch (error) {
      // Only log if it's not a "not configured" case (those are expected)
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes('not configured')) {
        console.warn(`⚠️  ${providerName} failed:`, errorMsg);
      }
      // Continue to next provider
    }
  }
  
  console.warn(`⚠️  All geocoding providers failed for "${location}"`);

  // If all providers fail, return null
  const result = { coordinates: null, formatted: location };
  geocodeCache.set(cacheKey, result);
  cacheTimestamps.set(cacheKey, Date.now());
  return result;
}

/**
 * Geocode using Mapbox API
 */
async function geocodeWithMapbox(location: string): Promise<GeocodeResult> {
  const apiKey = process.env.MAPBOX_ACCESS_TOKEN;
  if (!apiKey) {
    // Silently skip if not configured - will fall back to other providers
    return { coordinates: null, formatted: null };
  }

  const encodedLocation = encodeURIComponent(location);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedLocation}.json?access_token=${apiKey}&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.features && data.features.length > 0) {
    const feature = data.features[0];
    const [lng, lat] = feature.center;
    return {
      coordinates: { lat, lng },
      formatted: feature.place_name,
    };
  }

  return { coordinates: null, formatted: null };
}

/**
 * Geocode using Google Maps Geocoding API
 */
async function geocodeWithGoogle(location: string): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // Silently skip if not configured - will fall back to Nominatim
    return { coordinates: null, formatted: null };
  }

  const encodedLocation = encodeURIComponent(location);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedLocation}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.status === 'OK' && data.results && data.results.length > 0) {
    const result = data.results[0];
    const { lat, lng } = result.geometry.location;
    return {
      coordinates: { lat, lng },
      formatted: result.formatted_address,
    };
  }

  return { coordinates: null, formatted: null };
}

/**
 * Geocode using Nominatim (OpenStreetMap) - FREE, no API key required
 * Note: Has rate limits, so use sparingly
 */
async function geocodeWithNominatim(location: string): Promise<GeocodeResult> {
  const encodedLocation = encodeURIComponent(location);
  const url = `https://nominatim.openstreetmap.org/search?q=${encodedLocation}&format=json&limit=1&addressdetails=1`;

  // Add a small delay to respect rate limits (1 request per second)
  await new Promise(resolve => setTimeout(resolve, 1100));

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mulligan-Dating-App/1.0', // Required by Nominatim
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim API error: ${response.status}`);
  }

  const data = await response.json();
  if (data && data.length > 0) {
    const result = data[0];
    return {
      coordinates: {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      },
      formatted: result.display_name,
    };
  }

  return { coordinates: null, formatted: null };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export function calculateDistanceMiles(
  coord1: Coordinates | null,
  coord2: Coordinates | null
): number {
  if (!coord1 || !coord2) {
    return 999; // Return large distance if coordinates unavailable
  }

  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLon = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate distance between two coordinates in kilometers
 */
export function calculateDistanceKm(
  coord1: Coordinates | null,
  coord2: Coordinates | null
): number {
  if (!coord1 || !coord2) {
    return 999; // Return large distance if coordinates unavailable
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLon = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Batch geocode multiple locations (with rate limiting for free APIs)
 */
export async function geocodeLocations(
  locations: string[]
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  
  for (const location of locations) {
    const result = await geocodeLocation(location);
    results.set(location, result);
    
    // Small delay between requests to respect rate limits
    if (locations.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

