import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { Client } from '@googlemaps/google-maps-services-js';
import { geocodeLocation } from '../utils/geocoding.js';
import { getCuratedSouthernOregonVenues } from '../data/southernOregonCuratedVenues.js';
import { lookupSouthernOregonCityCoordinates } from '../config/regions.js';

export interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  planType: 'first_date' | 'follow_up';
  laneId?: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: 'low' | 'medium' | 'high';
  conversationTopics: string[];
  status: 'pending' | 'accepted' | 'modified' | 'declined';
  user1Accepted: boolean;
  user2Accepted: boolean;
  user1Modifications?: string;
  user2Modifications?: string;
  isProposed?: boolean;
  proposedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get user location for date planning
 */
async function getUserLocation(userId: string): Promise<{ city: string; state: string } | null> {
  const profileResult = db
    .prepare('SELECT location FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise
    ? await profileResult
    : profileResult) as { location: string | null } | undefined;

  if (!profile?.location) {
    return null;
  }

  // Parse location (format: "City, State")
  const parts = profile.location.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    return {
      city: parts[0],
      state: parts[parts.length - 1],
    };
  }

  return null;
}

/** Venue from search (includes place_id for fetching details) */
export type VenueSearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  place_id?: string;
  types?: string[];
  businessStatus?: string;
};

const NEARBY_RADIUS_MILES = 30;
const NEARBY_RADIUS_METERS = Math.round(NEARBY_RADIUS_MILES * 1609.34); // 30 miles in meters (max 50000 for Places API)

/**
 * Search for venues within a radius of a lat/lng (nearby cities / area). Uses Places Nearby Search.
 */
async function searchVenuesNearby(
  lat: number,
  lng: number,
  keyword?: string
): Promise<VenueSearchResult[]> {
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) return [];

  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(Math.min(NEARBY_RADIUS_METERS, 50000)),
      key: googleApiKey,
    });
    if (keyword && keyword.trim()) params.set('keyword', keyword.trim());
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      results?: Array<{
        name?: string;
        vicinity?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        rating?: number;
        user_ratings_total?: number;
        price_level?: number;
        place_id?: string;
        types?: string[];
        business_status?: string;
      }>;
      status: string;
    };
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`⚠️  Google Places nearby search status: ${data.status}`);
      return [];
    }
    const results = data.results ?? [];
    return results.slice(0, 12).map((place) => ({
      name: place.name || 'Unknown',
      address: place.vicinity || '',
      lat: place.geometry?.location?.lat ?? 0,
      lng: place.geometry?.location?.lng ?? 0,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      place_id: place.place_id,
      types: place.types,
      businessStatus: place.business_status,
    }));
  } catch (error) {
    console.warn('⚠️  Nearby venue search failed:', error);
    return [];
  }
}

/**
 * Search for venues using Google Places API (text query, e.g. "coffee in Austin, TX")
 */
async function searchVenues(
  location: string,
  interest?: string,
  budget?: 'low' | 'medium' | 'high'
): Promise<VenueSearchResult[]> {
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!googleApiKey) {
    console.warn('⚠️  Google Places API key not configured, skipping venue search');
    return [];
  }

  try {
    const client = new Client({});

    let query = interest ? `${interest} in ${location}` : `activities in ${location}`;

    const response = await client.textSearch({
      params: {
        query,
        key: googleApiKey,
      },
    });

    const status = response.data?.status;
    if (status && status !== 'OK' && status !== 'ZERO_RESULTS') {
      console.warn(`⚠️  Google Places text search status: ${status} (query: "${query}")`);
    }

    const results = response.data?.results;
    if (results && results.length > 0) {
      return results.slice(0, 12).map((place: { name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } }; rating?: number; user_ratings_total?: number; price_level?: number; place_id?: string; types?: string[]; business_status?: string }) => ({
        name: place.name || 'Unknown',
        address: place.formatted_address || '',
        lat: place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng ?? 0,
        rating: place.rating,
        userRatingsTotal: place.user_ratings_total,
        priceLevel: place.price_level,
        place_id: place.place_id,
        types: place.types,
        businessStatus: place.business_status,
      }));
    }

    return [];
  } catch (error) {
    console.error('❌ Failed to search venues:', error);
    return [];
  }
}

const DISALLOWED_VENUE_TYPES = new Set([
  'gas_station',
  'convenience_store',
  'truck_stop',
  'car_repair',
  'car_dealer',
  'car_rental',
  'car_wash',
  'parking',
  'lodging',
  'rv_park',
  'storage',
  'moving_company',
  'supermarket',
  'department_store',
  'hardware_store',
]);

const QUALITY_VENUE_TYPES = new Set([
  'restaurant',
  'cafe',
  'bakery',
  'meal_takeaway',
  'book_store',
  'museum',
  'art_gallery',
  'park',
  'tourist_attraction',
  'bowling_alley',
  'aquarium',
  'movie_theater',
  'performing_arts_theater',
]);

const LOW_QUALITY_VENUE_NAME_RE =
  /\b(pilot|flying\s*j|love'?s|ta\s+travel|travel\s*center|truck\s*stop|gas\s*station|shell|chevron|arco|exxon|mobil|bp|circle\s*k|7-?eleven|speedway|maverik|walmart|supercenter|costco|target|motel|inn|u-?haul|auto\s*parts|car\s*wash|playground|snack\s*(stop|run)|tasty\s+snacks)\b/i;

const LANE_VENUE_REJECT_PATTERNS: Record<DatePlanLane['id'], RegExp[]> = {
  games: [
    /\bmakerspace\b/i,
    /\bmaker\s*space\b/i,
    /\bwood\s*work/i,
    /\bwelding\b/i,
    /\b3d\s*print/i,
    /\bfabricat/i,
    /\bcommercial\s*kitchen\s*for\s*community\b/i,
    /\bclay\b/i,
    /\bpottery\b/i,
    /\bceramic\b/i,
    /\bculinary\b/i,
    /\bcooking\s+class\b/i,
    /\bkitchen\s+studio\b/i,
  ],
  coffee: [
    /\bbowling\s*alley\b/i,
    /\bmini\s*golf\b/i,
    /\bdrive[\s-]?thr(u|ough)\b/i,
    /\bdrive[\s-]?up\s*only\b/i,
    /\bhuman\s*bean\b/i,
    /\bdutch\s*bros?\b/i,
    /\btravel\s*agency\b/i,
    /\bstate\s*park\b/i,
    /\bnational\s*park\b/i,
    /\bhorseback\b/i,
    /\bdisc\s*golf\b/i,
  ],
  walk: [/\brestaurant\b/i, /\bdeli\b/i, /\bbakery\b/i, /\broastery\b/i],
  dessert: [/\bmakerspace\b/i, /\bart\s*gallery\b/i],
  meal: [/\bmakerspace\b/i, /\bart\s*gallery\b/i, /\btrail\b/i, /\bpark\b/i],
  culture: [/\bgas\s*station\b/i, /\bmakerspace\b/i, /\btruck\s*stop\b/i],
  market: [
    /\bmakerspace\b/i,
    /\bgas\s*station\b/i,
    /\b(bar|lounge|tavern|pub|night\s*club|nightclub|speakeasy|wine\s*bar|cocktail)\b/i,
    /\blive\s*music\b/i,
    /\bwatering\s*hole\b/i,
    /\bdive\s*bar\b/i,
    /\b21\s*and\s*over\b/i,
    /\btalent\s*club\b/i,
  ],
};

const FAR_AWAY_LOCATION_MARKERS = [
  /\bsan francisco\b/i,
  /\blos angeles\b/i,
  /,\s*ca\b/i,
  /\bcalifornia\s+94\d{3}\b/i,
  /\bnew york,\s*ny\b/i,
];

function parseMeetingRegion(meetingLocation: string): { city?: string; stateAbbrev?: string } {
  const parts = meetingLocation.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] };
  const statePart = parts[parts.length - 1].toUpperCase();
  return { city: parts[0], stateAbbrev: statePart.length === 2 ? statePart : undefined };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function venueNearMeetingLocation(
  venue: VenueSearchResult,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
  maxKm = 65,
): boolean {
  const haystack = `${venue.name} ${venue.address}`.toLowerCase();
  const region = parseMeetingRegion(meetingLocation);
  const meetingLower = meetingLocation.toLowerCase();

  if (
    (region.stateAbbrev === 'OR' || meetingLower.includes('oregon')) &&
    /\bsan francisco\b|\blos angeles\b|,\s*ca\b|\bcalifornia\b/.test(haystack) &&
    !/\boregon\b|\bor\b/.test(haystack)
  ) {
    return false;
  }

  if (meetingLat != null && meetingLng != null && venue.lat && venue.lng) {
    return haversineKm(meetingLat, meetingLng, venue.lat, venue.lng) <= maxKm;
  }

  if (!meetingLower.includes('san francisco') && FAR_AWAY_LOCATION_MARKERS.some((re) => re.test(haystack))) {
    return false;
  }

  return true;
}

const COFFEE_LANE_SIGNAL_RE =
  /\b(cafe|café|coffee|espresso|roaster|roastery|tea\s*house|tea\s*&|latte|matcha)\b/i;
const OUTDOOR_NATURE_VENUE_RE =
  /\b(garden|botanical|arboretum|nature\s*center|state\s*park|national\s*park|greenway|hiking|disc\s*golf|horseback|birding|siskiyou|preserve|nature\s*trail|wildlife)\b/i;
const OUTDOOR_VENUE_TYPES = new Set([
  'park',
  'campground',
  'rv_park',
  'travel_agency',
  'natural_feature',
  'zoo',
]);

function venueLooksLikeCoffeeShop(venue: VenueSearchResult): boolean {
  const haystack = `${venue.name} ${venue.address} ${(venue.types ?? []).join(' ')}`.toLowerCase();
  const types = venue.types ?? [];
  const hasCoffeeSignal =
    COFFEE_LANE_SIGNAL_RE.test(haystack) || types.includes('cafe') || types.includes('bakery');

  if (OUTDOOR_NATURE_VENUE_RE.test(haystack) && !hasCoffeeSignal) return false;
  if (types.some((type) => OUTDOOR_VENUE_TYPES.has(type)) && !hasCoffeeSignal) return false;
  if (types.includes('tourist_attraction') && !hasCoffeeSignal && !types.includes('cafe')) {
    return false;
  }

  return hasCoffeeSignal;
}

const MARKET_LANE_SIGNAL_RE =
  /\b(farmers?\s*market|food\s*hall|public\s*market|artisan\s*market|street\s*market|growers?\s*market|produce\s*market|flea\s*market|night\s*market)\b/i;

const BAR_NIGHTLIFE_SIGNAL_RE =
  /\b(bar|lounge|tavern|pub|night\s*club|nightclub|speakeasy|wine\s*bar|cocktail|live\s*music|watering\s*hole|dive\s*bar)\b/i;

const BAR_NIGHTLIFE_TYPES = new Set(['bar', 'night_club']);

function venueNameLooksLikeSocialClub(name: string): boolean {
  const lower = name.toLowerCase();
  if (!/\bclub\b/.test(lower)) return false;
  if (/\b(golf|country|athletic|health|yacht|rotary|kiwanis|market|food)\b/.test(lower)) return false;
  return true;
}

/** Bars, nightclubs, and social clubs — excluded from Sober Circle date plans. */
export function venueIsBarOrNightclub(venue: VenueSearchResult): boolean {
  const haystack = `${venue.name} ${venue.address} ${(venue.types ?? []).join(' ')}`.toLowerCase();
  if (BAR_NIGHTLIFE_SIGNAL_RE.test(haystack)) return true;
  if (venueNameLooksLikeSocialClub(venue.name)) return true;
  if ((venue.types ?? []).some((type) => BAR_NIGHTLIFE_TYPES.has(type))) return true;
  return false;
}

export function textMentionsBarOrClub(text: string): boolean {
  const haystack = text.toLowerCase();
  if (BAR_NIGHTLIFE_SIGNAL_RE.test(haystack)) return true;
  if (venueNameLooksLikeSocialClub(text)) return true;
  if (/\bcomedy\s*club\b/.test(haystack)) return true;
  return false;
}

function venueLooksLikeMarket(venue: VenueSearchResult): boolean {
  const haystack = `${venue.name} ${venue.address} ${(venue.types ?? []).join(' ')}`.toLowerCase();
  const types = venue.types ?? [];

  if (BAR_NIGHTLIFE_SIGNAL_RE.test(haystack)) return false;
  if (venueNameLooksLikeSocialClub(venue.name)) return false;
  if (types.some((type) => BAR_NIGHTLIFE_TYPES.has(type))) return false;

  return MARKET_LANE_SIGNAL_RE.test(haystack);
}

export function venueFitsLane(venue: VenueSearchResult, lane: DatePlanLane): boolean {
  const haystack = `${venue.name} ${venue.address} ${(venue.types ?? []).join(' ')}`.toLowerCase();
  const rejects = LANE_VENUE_REJECT_PATTERNS[lane.id] ?? [];
  if (rejects.some((re) => re.test(haystack))) return false;
  if (lane.id === 'coffee') return venueLooksLikeCoffeeShop(venue);
  if (lane.id === 'market') return venueLooksLikeMarket(venue);
  return true;
}

function filterVenuesForLaneContext(
  candidates: VenueSearchResult[],
  lane: DatePlanLane,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
): VenueSearchResult[] {
  return candidates.filter(
    (venue) =>
      venueFitsLane(venue, lane) &&
      venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng),
  );
}

function isLowQualityDateVenue(venue: VenueSearchResult): boolean {
  const haystack = `${venue.name} ${venue.address}`.toLowerCase();
  if (LOW_QUALITY_VENUE_NAME_RE.test(haystack)) return true;
  if (venue.businessStatus && venue.businessStatus !== 'OPERATIONAL') return true;
  const types = venue.types ?? [];
  if (types.some((type) => DISALLOWED_VENUE_TYPES.has(type))) return true;
  return false;
}

function scoreVenue(venue: VenueSearchResult): number {
  let score = 0;
  if (typeof venue.rating === 'number') score += venue.rating * 2;
  if (typeof venue.userRatingsTotal === 'number') score += Math.min(2, Math.log10(Math.max(venue.userRatingsTotal, 1)));
  if (venue.types?.some((type) => QUALITY_VENUE_TYPES.has(type))) score += 2.5;
  if (venue.priceLevel != null && venue.priceLevel >= 1 && venue.priceLevel <= 3) score += 0.75;
  if (venue.name && venue.address) score += 0.5;
  const haystack = `${venue.name} ${venue.address}`.toLowerCase();
  if (/\b(human bean|dutch bros|drive[\s-]?thr(u|ough))\b/.test(haystack)) score -= 10;
  return score;
}

function rankDateVenues(candidates: VenueSearchResult[], existingVenueNames: Set<string>): VenueSearchResult[] {
  return candidates
    .filter((venue) => venue.name && venue.name !== 'Unknown')
    .filter((venue) => !existingVenueNames.has(venue.name.toLowerCase()))
    .filter((venue) => !isLowQualityDateVenue(venue))
    .sort((a, b) => scoreVenue(b) - scoreVenue(a));
}

function venueKeywordsForInterest(interest: string): string[] {
  const key = interest.trim().toLowerCase();
  const mapped: Record<string, string[]> = {
    travel: ['globally inspired restaurant', 'international food hall', 'museum', 'scenic overlook'],
    music: ['listening room', 'live music venue', 'record store', 'jazz lounge small plates'],
    art: ['art gallery', 'pottery studio', 'paint class', 'museum'],
    photography: ['art gallery', 'scenic overlook', 'botanical garden', 'museum'],
    cooking: ['cooking class', 'chef counter restaurant', 'food hall', 'tapas restaurant'],
    coffee: ['craft coffee shop', 'coffee roaster', 'cafe'],
    reading: ['independent bookstore', 'bookstore cafe', 'library event'],
    books: ['independent bookstore', 'bookstore cafe', 'library event'],
    movies: ['indie cinema', 'movie theater', 'dinner theater'],
    comedy: ['comedy club', 'performing arts theater'],
    dancing: ['dance class', 'salsa night', 'performing arts theater'],
    fitness: ['walking trail', 'climbing gym', 'yoga studio'],
    hiking: ['hiking trail', 'scenic overlook', 'nature center'],
    yoga: ['yoga studio', 'tea house', 'botanical garden'],
    gaming: ['arcade', 'board game cafe', 'escape room'],
    fortnite: ['arcade', 'board game cafe', 'escape room'],
    'board games': ['board game cafe', 'game store event', 'arcade'],
    fashion: ['boutique district', 'art gallery', 'design museum'],
    animals: ['aquarium', 'zoo', 'nature center'],
    beach: ['waterfront restaurant', 'beach walk', 'scenic overlook'],
    history: ['history museum', 'walking tour', 'historic district cafe'],
    science: ['science museum', 'planetarium', 'aquarium'],
  };
  return mapped[key] ?? [`${interest} class`, `${interest} event`, `${interest} cafe`];
}

export type DatePlanLane = {
  id: 'coffee' | 'meal' | 'walk' | 'games' | 'culture' | 'market' | 'dessert';
  label: string;
  keywords: string[];
  promptHint: string;
};

export const DATE_PLAN_LANES: DatePlanLane[] = [
  {
    id: 'coffee',
    label: 'coffee or tea',
    keywords: ['craft coffee shop', 'coffee roaster', 'independent cafe', 'tea house', 'bookstore cafe'],
    promptHint: 'Make this a coffee or tea meetup at a real local spot, with an optional short walk or browse nearby.',
  },
  {
    id: 'meal',
    label: 'meal',
    keywords: ['brunch restaurant', 'breakfast restaurant', 'lunch restaurant', 'dinner restaurant', 'tapas restaurant', 'small plates restaurant', 'food hall'],
    promptHint: 'Make this a meal plan: breakfast, brunch, lunch, dinner, small plates, or a food hall with enough atmosphere to talk.',
  },
  {
    id: 'walk',
    label: 'walk or park',
    keywords: ['local park', 'walking trail', 'waterfront walk', 'botanical garden', 'scenic overlook', 'public garden'],
    promptHint: 'Make this a local walk, park, garden, waterfront, or scenic stroll that feels public, easy, and intentional.',
  },
  {
    id: 'games',
    label: 'adult games or activity',
    keywords: ['board game cafe', 'mini golf', 'golf center', 'driving range', 'bowling alley', 'arcade bar food', 'escape room', 'billiards hall', 'trivia night restaurant'],
    promptHint: 'Make this a playful adult activity: board game cafe, mini golf, bowling, arcade, escape room, billiards, or trivia with food.',
  },
  {
    id: 'culture',
    label: 'culture',
    keywords: ['art gallery', 'museum', 'indie cinema', 'performing arts theater', 'comedy club', 'live music venue', 'independent bookstore'],
    promptHint: 'Make this a culture plan: gallery, museum, indie cinema, bookstore, comedy, or live performance with time to talk.',
  },
  {
    id: 'market',
    label: 'market or food hall',
    keywords: ['farmers market', 'food hall', 'street market', 'public market', 'artisan market'],
    promptHint: 'Make this a local market or food hall plan where they can pick a bite, wander, and compare favorites.',
  },
  {
    id: 'dessert',
    label: 'dessert',
    keywords: ['dessert cafe', 'ice cream shop', 'bakery', 'gelato shop', 'chocolate shop'],
    promptHint: 'Make this a dessert plan that feels grown-up and relaxed, with a short walk or cafe conversation after.',
  },
];

function pickDatePlanLane(existingTitles: string[]): DatePlanLane {
  const recentText = existingTitles.join(' | ').toLowerCase();
  const available = DATE_PLAN_LANES.filter((lane) => !recentText.includes(lane.id) && !recentText.includes(lane.label));
  const pool = available.length > 0 ? available : DATE_PLAN_LANES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildVenueSearchKeywords(
  sharedInterests: string[],
  lane: DatePlanLane,
  quickSearch = false,
): string[] {
  if (quickSearch) {
    const interestKeywords = sharedInterests.flatMap(venueKeywordsForInterest).slice(0, 2);
    return [...new Set([...lane.keywords, ...interestKeywords])].slice(0, 4);
  }

  const adultDefaultKeywords = [
    'craft coffee shop',
    'tea house',
    'independent cafe',
    'brunch restaurant',
    'tapas restaurant',
    'food hall',
    'dessert cafe',
    'art gallery',
    'museum',
    'independent bookstore',
    'botanical garden',
    'scenic overlook',
    'mini golf',
    'bowling alley',
    'board game cafe',
    'pottery studio',
    'cooking class',
    'live music venue',
    'jazz lounge small plates',
    'waterfront restaurant',
    'rooftop restaurant',
    'farmers market',
  ];

  const interestKeywords = sharedInterests.flatMap(venueKeywordsForInterest);
  // Core plan lane comes first so broad overlaps like Travel/Music do not dominate most generated plans.
  return [...new Set([...lane.keywords, ...adultDefaultKeywords, ...interestKeywords.slice(0, 4)])];
}

const GENERIC_VENUE_FACT_RE =
  /^(tourist attraction|point of interest|establishment|food|store|local business|premise|park|travel agency)$/i;

const GOOGLE_TYPE_LIST_FACTS = new Set([
  'tourist attraction',
  'point of interest',
  'establishment',
  'food',
  'store',
  'local business',
  'premise',
  'park',
  'travel agency',
]);

type VenueActivityKind =
  | 'clay'
  | 'culinary'
  | 'board_games'
  | 'bowling'
  | 'mini_golf'
  | 'golf'
  | 'arcade'
  | 'museum'
  | 'bookstore'
  | 'garden'
  | 'park'
  | 'market'
  | 'cafe'
  | 'bakery'
  | 'bar'
  | 'restaurant';

function inferVenueActivityKind(venue: VenueSearchResult): VenueActivityKind | null {
  const haystack = `${venue.name} ${venue.address} ${(venue.types ?? []).join(' ')}`.toLowerCase();
  const nameLower = venue.name.toLowerCase();
  if (BAR_NIGHTLIFE_SIGNAL_RE.test(haystack) || venueNameLooksLikeSocialClub(venue.name)) {
    return 'bar';
  }
  if (/\b(clay|pottery|ceramic)\b/.test(haystack)) return 'clay';
  if (/\b(culinary|cooking\s+class|cookery|kitchen\s+studio)\b/.test(haystack)) return 'culinary';
  if (/\b(board\s*game|tabletop|game\s*(cafe|café|table|night|shop|store))\b/.test(haystack)) {
    return 'board_games';
  }
  if (/\bbowling\b/.test(haystack)) return 'bowling';
  if (/\b(mini\s*golf|miniature\s*golf)\b/.test(haystack)) return 'mini_golf';
  if (
    /\b(top\s*golf|topgolf|driving\s*range|golf\s*(center|course|club)|batting\s*cages?)\b/.test(haystack) ||
    /\bgolf\b/.test(nameLower)
  ) {
    return 'golf';
  }
  if (/\barcade\b/.test(haystack)) return 'arcade';
  if (/\b(museum|art\s*gallery|gallery)\b/.test(haystack)) return 'museum';
  if (/\bbook\s*store\b/.test(haystack)) return 'bookstore';
  if (/\b(farmers?\s*market|food\s*hall)\b/.test(haystack)) return 'market';
  if (/\b(cafe|coffee\s*roaster|espresso|tea\s*house)\b/.test(haystack)) return 'cafe';
  if (/\b(garden|botanical|arboretum|nature\s*center|preserve|siskiyou)\b/.test(haystack)) return 'garden';
  if (/\b(park|trail|greenway|overlook)\b/.test(haystack)) return 'park';
  if (/\b(bakery|dessert|ice\s*cream|gelato|patisserie)\b/.test(haystack)) return 'bakery';
  if (/\brestaurant\b/.test(haystack)) return 'restaurant';
  return null;
}

function looksLikeGoogleTypeList(fact: string): boolean {
  if (!fact.includes(',')) return false;
  const parts = fact.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  return parts.length >= 2 && parts.every((part) => GOOGLE_TYPE_LIST_FACTS.has(part));
}

const VENUE_ACTIVITY_COPY: Record<VenueActivityKind, string> = {
  clay:
    'Try a hands-on clay session together — shape something side by side, laugh at the messy parts, and keep conversation easy between projects.',
  culinary:
    'Cook or bake something together — collaborative, hands-on, and plenty to talk about while you prep and taste.',
  board_games:
    'Grab a table, pick a game, and let playful competition break the ice between conversation.',
  bowling: 'Keep it light with a few frames — playful stakes and easy banter between turns.',
  mini_golf: 'Play a round of mini golf — low pressure, a little competition, and plenty to joke about along the way.',
  golf:
    'Hit the range or play a few holes together — take turns, keep scores light, and grab food or drinks between swings if the bay has them.',
  arcade: 'Pick a couple of games, trade high scores, and let the playful energy carry the conversation.',
  museum:
    'Wander the exhibits, comment on what catches your eye, and swap what each piece reminds you of.',
  bookstore: 'Browse the shelves, trade book picks, and see what stories you both gravitate toward.',
  garden:
    'Explore the gardens and grounds together — stroll the paths, notice plants and wildlife, and keep conversation easy with plenty to see along the way.',
  park: 'Take an easy stroll, comment on what you notice, and let movement keep the conversation natural.',
  market: 'Wander the stalls, sample something new, and compare favorites as you go.',
  cafe: 'Order at the counter, find a table, and ease into conversation over a drink.',
  bakery: 'Pick a treat to share, linger over something sweet, and keep the conversation easy.',
  bar: 'Share a drink or catch live music — keep it casual, public, and easy to talk between sets.',
  restaurant: 'Share a meal somewhere public and conversation-friendly — keep it relaxed and see if the vibe has momentum.',
};

export function formatVenueCitySuffix(meetingLocation: string): string {
  const region = parseMeetingRegion(meetingLocation);
  if (region.city && region.stateAbbrev) return `${region.city}, ${region.stateAbbrev}`;
  if (region.city) return region.city;
  return meetingLocation.trim();
}

const KNOWN_VENUE_CITY_SUFFIX: Array<{ pattern: RegExp; citySuffix: string }> = [
  { pattern: /\blithia\s*park\b/i, citySuffix: 'Ashland, OR' },
  { pattern: /\bschneider museum\b/i, citySuffix: 'Ashland, OR' },
  { pattern: /\bmix bakeshop\b/i, citySuffix: 'Ashland, OR' },
  { pattern: /\brogue creamery\b/i, citySuffix: 'Central Point, OR' },
  { pattern: /\bbear creek park\b/i, citySuffix: 'Medford, OR' },
  { pattern: /\bbear creek golf\b/i, citySuffix: 'Medford, OR' },
  { pattern: /\bwilliams\s+(grange\s+)?farmers?\s*market\b/i, citySuffix: 'Williams, OR' },
];

const ROGUE_VALLEY_CITY_SUFFIXES: Array<{ pattern: RegExp; citySuffix: string }> = [
  { pattern: /\bashland\b/i, citySuffix: 'Ashland, OR' },
  { pattern: /\bmedford\b/i, citySuffix: 'Medford, OR' },
  { pattern: /\bcentral point\b/i, citySuffix: 'Central Point, OR' },
  { pattern: /\bgrants pass\b/i, citySuffix: 'Grants Pass, OR' },
  { pattern: /\bjacksonville\b/i, citySuffix: 'Jacksonville, OR' },
  { pattern: /\btalent\b/i, citySuffix: 'Talent, OR' },
  { pattern: /\bphoenix\b/i, citySuffix: 'Phoenix, OR' },
  { pattern: /\btrail,\s*(or|oregon)\b/i, citySuffix: 'Trail, OR' },
  { pattern: /\brogue river\b/i, citySuffix: 'Rogue River, OR' },
  { pattern: /\bgold hill\b/i, citySuffix: 'Gold Hill, OR' },
  { pattern: /\bklamath falls\b/i, citySuffix: 'Klamath Falls, OR' },
  { pattern: /\bwilliams\b/i, citySuffix: 'Williams, OR' },
  { pattern: /\bwimer\b/i, citySuffix: 'Wimer, OR' },
  { pattern: /\bapplegate\b/i, citySuffix: 'Applegate, OR' },
  { pattern: /\beagle point\b/i, citySuffix: 'Eagle Point, OR' },
];

function titleCaseCityToken(city: string): string {
  return city
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function resolveCitySuffixFromBareCityToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed || trimmed.includes(',')) return null;
  if (!lookupSouthernOregonCityCoordinates(`${trimmed}, OR`)) return null;
  return `${titleCaseCityToken(trimmed)}, OR`;
}

function resolveVenueCitySuffix(venue: VenueSearchResult, meetingLocation: string): string {
  for (const entry of KNOWN_VENUE_CITY_SUFFIX) {
    if (entry.pattern.test(venue.name)) return entry.citySuffix;
  }

  const address = venue.address?.trim() ?? '';
  // Parse structured addresses before loose haystack matching so "Williams Ave, Medford, OR"
  // resolves to Medford rather than the town of Williams.
  if (address.includes(',')) {
    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const state = parts[parts.length - 1];
      const city = parts[parts.length - 2];
      if (city && state) return `${city}, ${state}`;
    }
    if (parts.length === 2 && /^(or|oregon)$/i.test(parts[1])) {
      return `${parts[0]}, OR`;
    }
  } else if (address) {
    const bareCity = resolveCitySuffixFromBareCityToken(address);
    if (bareCity) return bareCity;
  }

  const haystack = `${venue.name} ${venue.address}`.toLowerCase();
  for (const entry of ROGUE_VALLEY_CITY_SUFFIXES) {
    if (entry.pattern.test(haystack)) return entry.citySuffix;
  }

  return formatVenueCitySuffix(meetingLocation);
}

export function formatVenueDisplayAddress(
  venue: VenueSearchResult,
  meetingLocation: string,
): string {
  const address = venue.address?.trim() ?? '';
  const citySuffix = resolveVenueCitySuffix(venue, meetingLocation);
  if (!citySuffix) return address;

  const haystack = address.toLowerCase();
  const cityToken = citySuffix.split(',')[0]?.trim().toLowerCase() ?? '';
  if (cityToken && haystack.includes(cityToken)) {
    if (haystack === cityToken && citySuffix.includes(',')) {
      return citySuffix;
    }
    return address || citySuffix;
  }
  if (regionIncludesState(haystack, citySuffix)) {
    return address || citySuffix;
  }
  if (!address) return citySuffix;
  return `${address}, ${citySuffix}`;
}

function regionIncludesState(addressLower: string, citySuffix: string): boolean {
  const statePart = citySuffix.split(',')[1]?.trim().toLowerCase();
  return !!statePart && addressLower.includes(statePart);
}

function formatVenuePlaceLabel(venue: VenueSearchResult, meetingLocation: string): string {
  const citySuffix = resolveVenueCitySuffix(venue, meetingLocation);
  if (!citySuffix) return venue.name;
  const cityToken = citySuffix.split(',')[0]?.trim().toLowerCase() ?? '';
  if (cityToken && venue.name.toLowerCase().includes(cityToken)) {
    return venue.name;
  }
  return `${venue.name} in ${citySuffix}`;
}

export function describeVenueForLane(
  venue: VenueSearchResult,
  lane: DatePlanLane,
  meetingLocation: string,
): string {
  const place = formatVenuePlaceLabel(venue, meetingLocation);
  const activityKind = inferVenueActivityKind(venue);
  if (activityKind) {
    return `Meet at ${place}. ${VENUE_ACTIVITY_COPY[activityKind]}`;
  }

  switch (lane.id) {
    case 'coffee':
      return `Meet at ${place} for a relaxed sit-down coffee — order at the counter, find a table, and ease into conversation.`;
    case 'walk':
      return `Meet at ${place} for an easy stroll — movement keeps things natural and gives you plenty to comment on.`;
    case 'games':
      return `Meet at ${place} for something playful to do together — pick an activity, keep it light, and let the fun carry the conversation.`;
    case 'culture':
      return `Meet at ${place} — browse, comment on what catches your eye, and see what you both gravitate toward.`;
    case 'market':
      return `Meet at ${place} — wander, taste or browse, and compare favorites as you go.`;
    case 'dessert':
      return `Meet at ${place} for something sweet — linger over a treat and keep the conversation easy.`;
    case 'meal':
    default:
      return `Meet at ${place} for a relaxed meal somewhere public and conversation-friendly.`;
  }
}

const LANE_TITLE_VARIANTS: Record<string, string[]> = {
  coffee: ['Coffee and Easy Conversation', 'Slow Pour, Good Talk', 'Cafe Catch-Up'],
  meal: ['Table for Two Conversations', 'Shared Plates, Easy Vibes', 'A Meal Worth Lingering Over'],
  walk: ['Local Walk & Easy Conversation', 'Stroll and See Where It Goes', 'Park Loop & Good Chat'],
  games: ['Playful Competition Night', 'Friendly Rivalry Hour', 'Something Playful Together'],
  culture: ['Culture Stop & Conversation', 'Gallery Hop & Talk', 'A Little Culture, A Lot of Chat'],
  market: ['Market Wander & Bites', 'Pick, Taste, Compare Favorites', 'Food Hall Discovery'],
  dessert: ['Dessert and a Stroll', 'Sweet Stop & Easy Talk', 'Treats Then a Short Walk'],
};

const VENUE_ACTIVITY_TITLE_VARIANTS: Partial<Record<VenueActivityKind, string[]>> = {
  golf: ['Range Time & Light Competition', 'A Few Holes Together', 'Golf & Easy Conversation'],
  mini_golf: ['Mini Golf & Playful Stakes', 'Putt-Putt & Good Chat'],
  bowling: ['Bowling & Banter', 'Frames & Friendly Rivalry'],
  board_games: ['Playful Competition Night', 'Games, Laughs, and Snacks', 'Friendly Rivalry Hour'],
  arcade: ['Arcade Night & High Scores', 'Games & Good Conversation'],
  clay: ['Clay Session & Easy Chat', 'Hands-On Creative Hour'],
  culinary: ['Cook Together & Compare Notes', 'Kitchen Collaboration'],
  park: ['Park Loop & Good Chat', 'Stroll and See Where It Goes'],
  garden: ['Garden Stroll & Good Chat', 'Grounds & Easy Conversation'],
  museum: ['Gallery Hop & Talk', 'Culture Stop & Conversation'],
  bookstore: ['Bookstore Browse & Talk', 'Shelf Picks & Conversation'],
  cafe: ['Coffee and Easy Conversation', 'Slow Pour, Good Talk'],
  bakery: ['Sweet Stop & Easy Talk', 'Dessert and a Stroll'],
  bar: ['Live Music & Easy Conversation', 'Drinks & Good Chat', 'Casual Night Out Together'],
  restaurant: ['Table for Two Conversations', 'Shared Plates, Easy Vibes'],
};

export function pickVenueAwareTitle(
  lane: DatePlanLane,
  venue: VenueSearchResult | null | undefined,
  excludeTitles: string[] = [],
): string {
  const activityKind = venue ? inferVenueActivityKind(venue) : null;
  const activityTitles = activityKind ? VENUE_ACTIVITY_TITLE_VARIANTS[activityKind] : undefined;
  const variants = activityTitles?.length ? activityTitles : LANE_TITLE_VARIANTS[lane.id] ?? [lane.label];
  const exclude = new Set(excludeTitles.map((title) => title.toLowerCase()));
  const fresh = variants.filter((title) => !exclude.has(title.toLowerCase()));
  const pool = fresh.length > 0 ? fresh : variants;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function primaryDatePlanDescription(description: string): string {
  return description.split('\n\n')[0]?.trim() ?? description.trim();
}

export function fallbackDatePlanCopy(
  sharedInterests: string[],
  meetingLocation: string,
  venue?: VenueSearchResult | null,
  lane?: DatePlanLane
): { title: string; description: string; conversationTopics: string[]; budgetRange: 'low' | 'medium' | 'high' } {
  const primaryInterest = sharedInterests[0];
  if (venue && lane) {
    return {
      title: lane?.id === 'meal'
        ? 'Table for Two Conversations'
        : lane?.id === 'walk'
          ? 'Local Walk & Easy Conversation'
          : lane?.id === 'games'
            ? 'Playful Competition Night'
            : lane?.id === 'culture'
              ? 'Culture Stop & Conversation'
              : lane?.id === 'dessert'
                ? 'Dessert and a Stroll'
                : 'Coffee and Easy Conversation',
      description: describeVenueForLane(venue, lane, meetingLocation),
      conversationTopics: primaryInterest
        ? [`What first got you into ${primaryInterest}?`, `Your favorite ${primaryInterest} experience lately`, 'A place nearby you have been meaning to try']
        : ['A place nearby you have been meaning to try', 'The best low-key outing you have had recently', 'What makes a first meetup feel easy'],
      budgetRange: venue.priceLevel != null && venue.priceLevel >= 3 ? 'high' : venue.priceLevel === 1 ? 'low' : 'medium',
    };
  }

  const fallbackIdeas = [
    {
      title: 'Coffee, Gallery, Then a Walk',
      description: `Start with craft coffee in ${meetingLocation}, browse a nearby gallery or bookstore, then take a short walk if the vibe is good.`,
      budgetRange: 'medium' as const,
    },
    {
      title: 'Brunch and Bookstore Browse',
      description: `Pick a relaxed brunch spot, then wander an independent bookstore and trade two books you would actually recommend.`,
      budgetRange: 'medium' as const,
    },
    {
      title: 'Small Plates and a Scenic Stroll',
      description: `Meet early evening for small plates somewhere public and conversation-friendly, then take a short walk through a lively nearby area.`,
      budgetRange: 'medium' as const,
    },
    {
      title: 'Games and Good Conversation',
      description: 'Find a board game cafe, bowling alley, mini golf spot, or arcade with food so there is something playful to do between conversation.',
      budgetRange: 'medium' as const,
    },
    {
      title: 'Local Park Coffee Walk',
      description: `Grab coffee near ${meetingLocation}, then take an easy walk through a local park or lively main street.`,
      budgetRange: 'low' as const,
    },
  ];
  const idea = fallbackIdeas[Math.floor(Math.random() * fallbackIdeas.length)];
  return {
    ...idea,
    conversationTopics: primaryInterest
      ? [`What first got you into ${primaryInterest}?`, `Your favorite ${primaryInterest} experience lately`, 'A place nearby you have been meaning to try']
      : ['A place nearby you have been meaning to try', 'The best meal or coffee you have had recently', 'A hobby you would like to get better at'],
  };
}

/**
 * Fetch place details (what the venue actually is) so AI descriptions match reality.
 * Uses Place Details API: editorial_summary and/or types.
 */
async function getVenueDescription(placeId: string, apiKey: string): Promise<string | null> {
  try {
    const client = new Client({});
    const response = await client.placeDetails({
      params: {
        place_id: placeId,
        key: apiKey,
        fields: ['editorial_summary', 'types'],
      },
    });

    const result = (response.data as { result?: { editorial_summary?: { overview?: string }; types?: string[] } })?.result;
    if (!result) return null;

    const overview = result.editorial_summary?.overview;
    if (overview && overview.trim().length > 0) {
      return overview.trim();
    }

    const types = result.types;
    if (types && types.length > 0) {
      const filtered = types.filter(t => !['point_of_interest', 'establishment', 'premise'].includes(t));
      if (filtered.length > 0) {
        return filtered.map(t => t.replace(/_/g, ' ')).join(', ');
      }
    }

    return null;
  } catch (error) {
    console.warn('⚠️  Place details not available for venue:', error);
    return null;
  }
}

/**
 * Build a user-facing description grounded in Google Place facts when available.
 * Falls back to lane-aware template copy — never invents venue features.
 */
export async function buildGroundedVenueDescription(
  venue: VenueSearchResult,
  lane: DatePlanLane,
  meetingLocation: string,
): Promise<string> {
  const smartCopy = describeVenueForLane(venue, lane, meetingLocation);
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!venue.place_id || !googleApiKey) {
    return smartCopy;
  }

  const venueFacts = await getVenueDescription(venue.place_id, googleApiKey);
  if (!venueFacts) {
    return smartCopy;
  }

  const factSentence = venueFacts.split(/[.!?]/)[0]?.trim();
  if (
    !factSentence ||
    GENERIC_VENUE_FACT_RE.test(factSentence) ||
    looksLikeGoogleTypeList(factSentence) ||
    factSentence.length < 24
  ) {
    return smartCopy;
  }

  return scrubDateTerminology(`Meet at ${formatVenuePlaceLabel(venue, meetingLocation)} — ${factSentence}.`);
}

/**
 * Search venues for intentional date planner batch generation.
 */
export async function gatherDatePlanVenues(
  matchId: string,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
  sharedInterests: string[],
  lane: DatePlanLane,
  sessionExcludeVenueNames: string[] = [],
  quickSearch = false,
  soberFriendly = false,
): Promise<VenueSearchResult[]> {
  const existingPlansResult = db
    .prepare('SELECT title, venue_name FROM date_plans WHERE match_id = ? ORDER BY created_at DESC LIMIT 10')
    .all([matchId]);
  const existingPlans = (existingPlansResult instanceof Promise
    ? await existingPlansResult
    : existingPlansResult) as Array<{ title: string | null; venue_name: string | null }>;
  const existingVenueNames = new Set(
    [
      ...existingPlans.filter((p) => p.venue_name).map((p) => (p.venue_name as string).toLowerCase()),
      ...sessionExcludeVenueNames.map((name) => name.toLowerCase()),
    ],
  );

  const searchKeywords = buildVenueSearchKeywords(sharedInterests, lane, quickSearch);
  let venues: VenueSearchResult[] = [];
  const maxKeywordAttempts = quickSearch ? 2 : searchKeywords.length;

  const tryVenues = (candidates: VenueSearchResult[]) => {
    const contextual = filterVenuesForLaneContext(
      candidates,
      lane,
      meetingLocation,
      meetingLat,
      meetingLng,
    );
    const laneFilteredNearby = candidates.filter(
      (venue) =>
        venueFitsLane(venue, lane) &&
        venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng),
    );
    const pool = contextual.length > 0 ? contextual : laneFilteredNearby;
    const ranked = rankDateVenues(pool, existingVenueNames);
    if (ranked.length > 0) venues = ranked;
    else {
      const rankedIncludingRecent = pool
        .filter((venue) => !isLowQualityDateVenue(venue))
        .filter((venue) => venueFitsLane(venue, lane))
        .filter((venue) => venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng))
        .sort((a, b) => scoreVenue(b) - scoreVenue(a));
      if (rankedIncludingRecent.length > 0) venues = rankedIncludingRecent;
    }
  };

  if (meetingLat != null && meetingLng != null) {
    for (const keyword of [...searchKeywords].sort(() => Math.random() - 0.5).slice(0, maxKeywordAttempts)) {
      tryVenues(await searchVenuesNearby(meetingLat, meetingLng, keyword));
      if (venues.length > 0) break;
    }
    if (venues.length === 0 && !quickSearch) {
      tryVenues(await searchVenuesNearby(meetingLat, meetingLng));
    }
    if (venues.length === 0 && quickSearch && lane.keywords[0]) {
      tryVenues(await searchVenuesNearby(meetingLat, meetingLng, lane.keywords[0]));
    }
  }

  // Text search works without geocoded coordinates — required when geocoding fails or in quick mode.
  if (venues.length === 0) {
    for (const keyword of [...searchKeywords].sort(() => Math.random() - 0.5).slice(0, maxKeywordAttempts)) {
      tryVenues(await searchVenues(meetingLocation, keyword));
      if (venues.length > 0) break;
    }
  }
  if (venues.length === 0 && !quickSearch) {
    tryVenues(await searchVenues(meetingLocation));
  }

  if (venues.length === 0) {
    const curated = getCuratedSouthernOregonVenues(lane.id);
    tryVenues(curated);
    if (venues.length > 0) {
      console.log(`ℹ️  Using curated Southern Oregon venues for lane "${lane.id}" (${venues.length} options)`);
    }
  }

  if (soberFriendly) {
    venues = venues.filter((venue) => !venueIsBarOrNightclub(venue));
  }

  return venues;
}

/** Avoid accidental "date" wording in user-visible strings (whole word only). */
export function scrubDateTerminology(s: string) {
  return s.replace(/\bdate\b/gi, 'meetup').replace(/\bdating\b/gi, 'connecting');
}

/**
 * Generate AI date plan
 */
export async function generateDatePlan(
  matchId: string,
  suggestedBy: string,
  sharedInterests: string[]
): Promise<DatePlan> {
  // Get match info
  const matchResult = db
    .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?')
    .get([matchId]);
  const match = (matchResult instanceof Promise
    ? await matchResult
    : matchResult) as { user1_id: string; user2_id: string } | undefined;

  if (!match) {
    throw new Error('Match not found');
  }

  const user1Id = match.user1_id;
  const user2Id = match.user2_id;

  // Get user locations (both users' areas so we pull venues from either local area)
  const user1Location = await getUserLocation(user1Id);
  const user2Location = await getUserLocation(user2Id);

  // Use both users' areas: when both have locations, pick one at random this time so over time we pull from both
  const meetingLocation: string = (() => {
    if (user1Location && user2Location) {
      const loc1 = `${user1Location.city}, ${user1Location.state}`;
      const loc2 = `${user2Location.city}, ${user2Location.state}`;
      return loc1 === loc2 ? loc1 : [loc1, loc2][Math.floor(Math.random() * 2)];
    }
    if (user1Location) return `${user1Location.city}, ${user1Location.state}`;
    if (user2Location) return `${user2Location.city}, ${user2Location.state}`;
    return 'your area';
  })();

  // Geocode so we can search within 30-mile radius (nearby cities / area)
  let meetingLat: number | null = null;
  let meetingLng: number | null = null;
  if (meetingLocation !== 'your area') {
    const geocoded = await geocodeLocation(meetingLocation);
    if (geocoded?.coordinates) {
      meetingLat = geocoded.coordinates.lat;
      meetingLng = geocoded.coordinates.lng;
    }
  }

  let venues: VenueSearchResult[] = [];

  const existingPlansResult = db
    .prepare('SELECT title, venue_name FROM date_plans WHERE match_id = ? ORDER BY created_at DESC LIMIT 10')
    .all([matchId]);
  const existingPlans = (existingPlansResult instanceof Promise
    ? await existingPlansResult
    : existingPlansResult) as Array<{ title: string | null; venue_name: string | null }>;
  const existingVenueNames = new Set(
    existingPlans.filter(p => p.venue_name).map(p => (p.venue_name as string).toLowerCase())
  );
  const existingTitles = existingPlans.filter(p => p.title).map(p => (p.title as string).trim()).slice(0, 8);

  // Pick a normal, date-worthy meetup lane first. Shared interests influence details/topics,
  // but they should not make most plans about broad labels like Travel or Music.
  const selectedPlanLane = pickDatePlanLane(existingTitles);
  const searchKeywords = buildVenueSearchKeywords(sharedInterests, selectedPlanLane);

  const tryVenues = (candidates: VenueSearchResult[]) => {
    const contextual = filterVenuesForLaneContext(
      candidates,
      selectedPlanLane,
      meetingLocation,
      meetingLat,
      meetingLng,
    );
    const nearbyOnly = candidates.filter((venue) =>
      venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng),
    );
    const pool =
      contextual.length > 0 ? contextual : nearbyOnly.length > 0 ? nearbyOnly : candidates;
    const ranked = rankDateVenues(pool, existingVenueNames);
    if (ranked.length > 0) {
      venues = ranked;
      return;
    }
    const rankedIncludingRecent = pool
      .filter((venue) => !isLowQualityDateVenue(venue))
      .filter((venue) => venueFitsLane(venue, selectedPlanLane))
      .filter((venue) => venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng))
      .sort((a, b) => scoreVenue(b) - scoreVenue(a));
    if (rankedIncludingRecent.length > 0) venues = rankedIncludingRecent;
  };

  // 1) Nearby search (30-mile radius) when we have coordinates — pulls from nearby cities
  if (meetingLat != null && meetingLng != null) {
    for (const keyword of [...searchKeywords].sort(() => Math.random() - 0.5)) {
      const nearby = await searchVenuesNearby(meetingLat, meetingLng, keyword);
      tryVenues(nearby);
      if (venues.length > 0) break;
    }
    if (venues.length === 0) {
      tryVenues(await searchVenuesNearby(meetingLat, meetingLng));
    }
  }

  // 2) Fallback: text search by location name
  if (venues.length === 0) {
    for (const keyword of [...searchKeywords].sort(() => Math.random() - 0.5)) {
      tryVenues(await searchVenues(meetingLocation, keyword));
      if (venues.length > 0) break;
    }
  }
  if (venues.length === 0) {
    tryVenues(await searchVenues(meetingLocation));
  }

  // Pick ONE venue for this plan and use it for both the AI prompt and the saved plan
  // (Previously we told AI about venues[0] but saved a random venue → description didn't match.)
  const selectedVenueForPlan = venues.length > 0
    ? venues[Math.floor(Math.random() * Math.min(venues.length, 4))]
    : null;

  const HANGOUT_SAFETY_NOTE =
    'Meet in a busy public place and share your plans with a friend.';

  // Generate hangout plan using AI
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const fallbackCopy = fallbackDatePlanCopy(sharedInterests, meetingLocation, selectedVenueForPlan, selectedPlanLane);
  let planTitle = fallbackCopy.title;
  let planDescription = fallbackCopy.description;
  let conversationTopics: string[] = fallbackCopy.conversationTopics;
  let budgetRange: 'low' | 'medium' | 'high' = fallbackCopy.budgetRange;

  if (openaiApiKey) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      // Fetch what the venue actually is (so the AI doesn't invent food trucks, parks, etc.)
      let venueFacts: string | null = null;
      const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (selectedVenueForPlan?.place_id && googleApiKey) {
        venueFacts = await getVenueDescription(selectedVenueForPlan.place_id, googleApiKey);
      }

      const venueInfo = selectedVenueForPlan
        ? (venueFacts
            ? `THE hangout must be at this exact venue: ${selectedVenueForPlan.name}, ${selectedVenueForPlan.address}.

WHAT THIS VENUE ACTUALLY IS (use ONLY these facts; do not invent anything else):
${venueFacts}

CRITICAL: Your description MUST only describe activities that match the above. Do NOT add features that are not listed (e.g. do NOT say food trucks, live music in a park, or global cuisines unless the venue is actually that). If it is a polished café, gallery, restaurant, theater, garden, or activity venue, describe that accurately. Never mix up venue types.`
            : `THE hangout must be at this exact venue. Use ONLY this venue in the description and do not mention any other place: ${selectedVenueForPlan.name} at ${selectedVenueForPlan.address}. Do not invent features the venue does not have (e.g. no food trucks or "park" unless the venue is actually a park).`)
        : 'No specific venue found, suggest a general activity (do not invent a specific venue name).';

      const interestsText = sharedInterests.length > 0
        ? `SHARED INTERESTS (both people chose these — they overlap): ${sharedInterests.join(', ')}`
        : 'No overlapping interests on file for this pair';

      const sharedInterestRules =
        sharedInterests.length > 0
          ? `
CRITICAL — SHARED INTERESTS:
- Shared interests should inspire conversation topics, not dominate the whole plan.
- Do NOT make most plans explicitly about Travel or Music just because those are shared interests.
- At least 1 conversationTopic should relate to a shared interest when available.
- The title and first sentence should focus on the selected meetup category below unless the venue naturally matches a shared interest.
`
          : `
No shared-interest overlap on file — suggest a welcoming, low-pressure public hangout anyone could enjoy.
`;

      const avoidText = existingTitles.length > 0
        ? `\nCRITICAL: Do NOT suggest anything similar to these recent hangouts for this pair: ${existingTitles.join(' | ')}. Pick a completely different activity, vibe, and title.\n`
        : '';

      // When we have real venue facts, don't suggest a random different activity type.
      const variationLine = venueFacts
        ? 'Keep the tone stylish, adult, and conversational; describe only what this venue actually offers.'
        : selectedPlanLane.promptHint;

      const terminologyRules = `
TERMINOLOGY (strict):
- Do NOT use the words "date", "dating", "romantic", or "couple" anywhere in title, description, or conversationTopics.
- Use: meetup, hang out, grab coffee, activity, plans, connect, etc.
- Do NOT add safety disclaimers inside the JSON; focus only on the activity.

STYLE:
- The plan must feel mature, cool, intentional, and adult — not childish, random, cheap-for-cheap's-sake, or like a roadside errand.
- Default to stylish, activity-based, daytime or early-evening public ideas: craft coffee/tea, brunch, small plates, gallery/museum/indie cinema, bookstore cafe, food hall, botanical garden, scenic walk, mini golf/bowling, pottery/cooking class, comedy/live music with seating.
- Never suggest or validate truck stops, highway travel centers, gas stations, convenience stores, big-box stores, fast food, motel lobbies, playgrounds, or "snack run" concepts.
`;

      const prompt = `Create an IN-PERSON HANGOUT PLAN for two adults who connected on Mulligan (shared interests, real chemistry, public setting). This must be DIFFERENT from any plan suggested before for this pair.
${terminologyRules}
${interestsText}
${sharedInterestRules}
Location: ${meetingLocation}
SELECTED MEETUP CATEGORY: ${selectedPlanLane.label}
${venueInfo}
${avoidText}

This time: ${variationLine}

QUALITY BAR:
- The idea should be something a thoughtful adult would actually want to invite someone to.
- Avoid low-quality venues or plans: truck stops, rest stops, gas stations, convenience stores, chain fast food, big-box retail, generic "grab snacks", playgrounds, or anything that feels like killing time.
- Alcohol can be adjacent only when the venue is public and food/activity-forward (e.g. small plates, jazz lounge with seating), but do NOT make drinking the point.
- Prefer places with atmosphere, conversation, and a clear reason to be there.
- Prefer normal local meetup ideas unless a venue clearly warrants something else: coffee shop, local park/walk, breakfast/lunch/brunch/dinner, adult games/activities, gallery/museum/bookstore, market/food hall, or dessert cafe.
- If the selected category is coffee, meal, walk/park, or adult games, do NOT pivot to Travel or Music themes.

Generate a creative hangout plan that:
- Feels polished, casual, and activity-led (not formal or intense)
- Is appropriate for a first in-person meetup (public, safe, not too intimate)
- If shared interests were listed above, the plan must visibly tie to them; otherwise stay general and welcoming
- Includes 3-5 conversation topics (unique; when shared interests exist, at least 2 topics must relate directly to those interests)
- Suggests a budget range (low/medium/high)
- Is specific and actionable
- Has a short, catchy title that is NOT the same idea as the recent plans listed above
- If a specific venue was provided above, the description MUST describe the hangout at THAT venue only and MUST match what the venue actually is (no invented features).
- Description must be CONCISE: 1–2 short sentences max. No long paragraphs. Punchy and scannable.

Return ONLY a JSON object with this exact format:
{
  "title": "short catchy title",
  "description": "1–2 sentence concise summary of the hangout (what you do, where; no fluff)",
  "conversationTopics": ["topic 1", "topic 2", "topic 3"],
  "budgetRange": "low|medium|high"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You create mature, stylish, activity-based in-person hangout ideas for adults who connected on a social app. Never use the words date, dating, romantic, or couple in your JSON output. Never suggest truck stops, travel centers, gas stations, convenience stores, fast food, big-box stores, playgrounds, or generic snack runs. Prefer normal local meetups: coffee shops, parks/walks, breakfast/lunch/brunch/dinner, adult games/activities, galleries, museums, bookstores, food halls, botanical gardens, dessert cafes, mini golf, and bowling. Shared interests can inspire conversation topics, but they should not dominate the plan or make most ideas about Travel or Music. One or two sentences for description only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 1.0, // Increased from 0.8 to 1.0 for more variation
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          planTitle = parsed.title || planTitle;
          let desc = typeof parsed.description === 'string' ? parsed.description : planDescription;
          // Keep description concise: at most 2 sentences
          const sentences = desc.split(/(?<=[.!?])\s+/).filter(Boolean);
          planDescription = sentences.length > 2 ? sentences.slice(0, 2).join(' ').trim() : desc;
          conversationTopics = parsed.conversationTopics || [];
          budgetRange = parsed.budgetRange || 'medium';
        }
      }
    } catch (error) {
      console.error('❌ Failed to generate AI hangout plan:', error);
    }
  }

  // Fallback conversation topics if AI didn't provide any
  if (conversationTopics.length === 0) {
    if (sharedInterests.length > 0) {
      conversationTopics = [
        `What got you into ${sharedInterests[0]}?`,
        'What are you most passionate about?',
        'What does a perfect day look like for you?',
      ];
    } else {
      conversationTopics = [
        'What are you most passionate about?',
        'What does a perfect day look like for you?',
        'What\'s something you\'ve always wanted to try?',
      ];
    }
  }

  /** Avoid accidental "date" wording in user-visible strings (whole word only). */
  planTitle = scrubDateTerminology(planTitle);
  planDescription = scrubDateTerminology(planDescription);
  conversationTopics = conversationTopics.map((t) => scrubDateTerminology(t));

  const generatedPlanText = [planTitle, planDescription, ...conversationTopics].join(' ');
  if (LOW_QUALITY_VENUE_NAME_RE.test(generatedPlanText)) {
    const safeFallback = fallbackDatePlanCopy(sharedInterests, meetingLocation, selectedVenueForPlan, selectedPlanLane);
    planTitle = safeFallback.title;
    planDescription = safeFallback.description;
    conversationTopics = safeFallback.conversationTopics;
    budgetRange = safeFallback.budgetRange;
  }

  if (!planDescription.includes('Public meetups recommended')) {
    planDescription = `${planDescription.trim()}\n\n${HANGOUT_SAFETY_NOTE}`;
  }

  // Create date plan
  const planId = uuidv4();
  // Use the same venue we already chose for the AI prompt so description and venue always match
  const selectedVenue = selectedVenueForPlan;

  // Suggest date/time (7 days from now, 7 PM)
  const suggestedDate = new Date();
  suggestedDate.setDate(suggestedDate.getDate() + 7);
  const suggestedDateStr = suggestedDate.toISOString().split('T')[0];
  const suggestedTimeStr = '19:00'; // 7 PM

  const plan: DatePlan = {
    id: planId,
    matchId,
    suggestedBy,
    planType: 'first_date',
    title: planTitle,
    description: planDescription,
    venueName: selectedVenue?.name,
    venueAddress: selectedVenue
      ? formatVenueDisplayAddress(selectedVenue, meetingLocation)
      : undefined,
    venueLat: selectedVenue?.lat,
    venueLng: selectedVenue?.lng,
    suggestedDate: suggestedDateStr,
    suggestedTime: suggestedTimeStr,
    budgetRange,
    conversationTopics,
    status: 'pending',
    user1Accepted: false,
    user2Accepted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to database - always INSERT a new plan
  // Multiple plans per match are allowed - getDatePlan will return the newest one
  try {
    await (db
      .prepare(
        `INSERT INTO date_plans 
         (id, match_id, suggested_by, plan_type, title, description, 
          venue_name, venue_address, venue_lat, venue_lng, 
          suggested_date, suggested_time, budget_range, conversation_topics,
          status, user1_accepted, user2_accepted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run([
        planId,
        matchId,
        suggestedBy,
        plan.planType,
        plan.title,
        plan.description,
        plan.venueName || null,
        plan.venueAddress || null,
        plan.venueLat || null,
        plan.venueLng || null,
        plan.suggestedDate || null,
        plan.suggestedTime || null,
        plan.budgetRange || null,
        JSON.stringify(plan.conversationTopics),
        plan.status,
        0, // user1_accepted
        0, // user2_accepted
      ]) as Promise<any>);
    console.log(`✅ Date plan saved to database: ${planId}`);
    console.log(`📅 Plan details - title: "${plan.title}", venue: "${plan.venueName || 'none'}"`);
  } catch (dbError: any) {
    console.error('❌ Failed to save date plan to database:', dbError);
    throw new Error(`Failed to save date plan: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
  }

  return plan;
}

/**
 * Get date plan for a match
 */
export async function getDatePlan(matchId: string): Promise<DatePlan | null> {
  const result = db
    .prepare(
      `SELECT id, match_id, suggested_by, plan_type, lane_id, title, description,
              venue_name, venue_address, venue_lat, venue_lng,
              suggested_date, suggested_time, budget_range, conversation_topics,
              status, user1_accepted, user2_accepted, user1_modifications, user2_modifications,
              is_proposed, proposed_at, created_at, updated_at
       FROM date_plans
       WHERE match_id = ? AND status != 'declined'
       ORDER BY is_proposed DESC, created_at DESC
       LIMIT 1`
    )
    .get([matchId]);
  const plan = (result instanceof Promise ? await result : result) as {
    id: string;
    match_id: string;
    suggested_by: string;
    plan_type: string;
    lane_id: string | null;
    title: string;
    description: string;
    venue_name: string | null;
    venue_address: string | null;
    venue_lat: number | null;
    venue_lng: number | null;
    suggested_date: string | null;
    suggested_time: string | null;
    budget_range: string | null;
    conversation_topics: string;
    status: string;
    user1_accepted: number;
    user2_accepted: number;
    user1_modifications: string | null;
    user2_modifications: string | null;
    is_proposed: number | null;
    proposed_at: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!plan) {
    return null;
  }

  let conversationTopics: string[] = [];
  try {
    conversationTopics = JSON.parse(plan.conversation_topics || '[]');
  } catch {
    conversationTopics = [];
  }

  return {
    id: plan.id,
    matchId: plan.match_id,
    suggestedBy: plan.suggested_by,
    planType: plan.plan_type as 'first_date' | 'follow_up',
    laneId: plan.lane_id || undefined,
    title: plan.title,
    description: plan.description,
    venueName: plan.venue_name || undefined,
    venueAddress: plan.venue_address || undefined,
    venueLat: plan.venue_lat || undefined,
    venueLng: plan.venue_lng || undefined,
    suggestedDate: plan.suggested_date || undefined,
    suggestedTime: plan.suggested_time || undefined,
    budgetRange: (plan.budget_range as 'low' | 'medium' | 'high') || undefined,
    conversationTopics,
    status: plan.status as 'pending' | 'accepted' | 'modified' | 'declined',
    user1Accepted: plan.user1_accepted === 1,
    user2Accepted: plan.user2_accepted === 1,
    user1Modifications: plan.user1_modifications || undefined,
    user2Modifications: plan.user2_modifications || undefined,
    isProposed: plan.is_proposed === 1,
    proposedAt: plan.proposed_at || undefined,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  };
}

/**
 * Accept or modify date plan
 */
export async function updateDatePlanStatus(
  planId: string,
  userId: string,
  action: 'accept' | 'decline' | 'modify',
  modifications?: string,
  counterDate?: string,
  counterTime?: string,
): Promise<DatePlan> {
  // Get plan and match info
  const planResult = db
    .prepare('SELECT match_id, user1_id, user2_id FROM date_plans d JOIN matches m ON d.match_id = m.id WHERE d.id = ?')
    .get([planId]);
  const planMatch = (planResult instanceof Promise
    ? await planResult
    : planResult) as {
    match_id: string;
    user1_id: string;
    user2_id: string;
  } | undefined;

  if (!planMatch) {
    throw new Error('Date plan not found');
  }

  const isUser1 = planMatch.user1_id === userId;
  const userField = isUser1 ? 'user1_accepted' : 'user2_accepted';
  const modField = isUser1 ? 'user1_modifications' : 'user2_modifications';

  if (action === 'accept') {
    await (db
      .prepare(`UPDATE date_plans SET ${userField} = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run([planId]) as Promise<any>);

    // Check if both users accepted
    const updatedPlan = await getDatePlan(planMatch.match_id);
    if (updatedPlan && updatedPlan.user1Accepted && updatedPlan.user2Accepted) {
      await (db
        .prepare('UPDATE date_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(['accepted', planId]) as Promise<any>);
    }
  } else if (action === 'decline') {
    await (db
      .prepare('UPDATE date_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(['declined', planId]) as Promise<any>);
  } else if (action === 'modify' && modifications) {
    const sets = [
      `${modField} = ?`,
      `status = ?`,
      'user1_accepted = 0',
      'user2_accepted = 0',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const vals: unknown[] = [modifications, 'modified'];
    if (counterDate !== undefined) {
      sets.push('suggested_date = ?');
      vals.push(counterDate);
    }
    if (counterTime !== undefined) {
      sets.push('suggested_time = ?');
      vals.push(counterTime);
    }
    vals.push(planId);
    await (db.prepare(`UPDATE date_plans SET ${sets.join(', ')} WHERE id = ?`).run(vals) as Promise<any>);
  }

  const updatedPlan = await getDatePlan(planMatch.match_id);
  if (!updatedPlan) {
    throw new Error('Failed to retrieve updated plan');
  }

  return updatedPlan;
}

/**
 * Update the suggested date and/or time for a date plan
 */
export async function updateDatePlanDateTime(
  planId: string,
  userId: string,
  suggestedDate?: string,
  suggestedTime?: string
): Promise<DatePlan> {
  // Get plan and match info to verify user is part of the match
  const planResult = db
    .prepare('SELECT match_id, user1_id, user2_id FROM date_plans d JOIN matches m ON d.match_id = m.id WHERE d.id = ?')
    .get([planId]);
  const planMatch = (planResult instanceof Promise
    ? await planResult
    : planResult) as {
    match_id: string;
    user1_id: string;
    user2_id: string;
  } | undefined;

  if (!planMatch) {
    throw new Error('Date plan not found');
  }

  // Verify user is part of this match
  if (planMatch.user1_id !== userId && planMatch.user2_id !== userId) {
    throw new Error('Unauthorized: User is not part of this match');
  }

  // Build update query dynamically based on what's provided
  const updates: string[] = [];
  const values: any[] = [];

  if (suggestedDate !== undefined) {
    updates.push('suggested_date = ?');
    values.push(suggestedDate);
  }

  if (suggestedTime !== undefined) {
    updates.push('suggested_time = ?');
    values.push(suggestedTime);
  }

  if (updates.length === 0) {
    throw new Error('No date or time provided to update');
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(planId);

  await (db
    .prepare(`UPDATE date_plans SET ${updates.join(', ')} WHERE id = ?`)
    .run(values) as Promise<any>);

  const updatedPlan = await getDatePlan(planMatch.match_id);
  if (!updatedPlan) {
    throw new Error('Failed to retrieve updated plan');
  }

  return updatedPlan;
}

