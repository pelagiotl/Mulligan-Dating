import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { Client } from '@googlemaps/google-maps-services-js';
import { geocodeLocation } from '../utils/geocoding.js';

export interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  planType: 'first_date' | 'follow_up';
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
type VenueSearchResult = {
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
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
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

function buildVenueSearchKeywords(sharedInterests: string[]): string[] {
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
  return [...new Set([...interestKeywords, ...adultDefaultKeywords])];
}

function fallbackDatePlanCopy(
  sharedInterests: string[],
  meetingLocation: string,
  venue?: VenueSearchResult | null
): { title: string; description: string; conversationTopics: string[]; budgetRange: 'low' | 'medium' | 'high' } {
  const primaryInterest = sharedInterests[0];
  if (venue) {
    return {
      title: primaryInterest ? `${primaryInterest} & Easy Conversation` : 'Easy Conversation Spot',
      description: `Meet at ${venue.name} for a polished, low-pressure plan that leaves room to actually talk. Keep it simple: arrive, order or browse what the place is known for, and see if the conversation has momentum.`,
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

  // Search with curated, adult-friendly terms. Raw broad interests like "Travel" can return bad
  // venue matches (e.g. truck stops), so map interests to date-worthy venue categories first.
  const searchKeywords = buildVenueSearchKeywords(sharedInterests);

  const tryVenues = (candidates: VenueSearchResult[]) => {
    const ranked = rankDateVenues(candidates, existingVenueNames);
    if (ranked.length > 0) {
      venues = ranked;
      return;
    }
    const rankedIncludingRecent = candidates
      .filter((venue) => !isLowQualityDateVenue(venue))
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
  const fallbackCopy = fallbackDatePlanCopy(sharedInterests, meetingLocation, selectedVenueForPlan);
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
- The plan must clearly reflect at least one of these shared interests by name in the title OR in the first sentence of the description (e.g. hiking, board games, live music — use their actual labels).
- At least 2 of the conversationTopics must directly relate to these shared interests (not only generic icebreakers).
- Pick a venue/activity vibe that plausibly fits those interests when possible.
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
        : (() => {
            const variationHints = [
              'Craft coffee or tea at an independent spot, then a short gallery/bookstore browse nearby.',
              'Small plates at a conversation-friendly restaurant, then a scenic walk in a lively public area.',
              'A museum, art gallery, or indie cinema plan with a cafe stop before or after.',
              'A polished activity: mini golf, bowling, pottery studio, cooking demo, or board game cafe.',
              'A farmers market or food hall with one shared “best bite” pick and a walk afterward.',
              'An early-evening live music, comedy, or theater outing at a public venue with seating.',
              'A botanical garden, waterfront, or scenic overlook paired with coffee or dessert.',
              'A brunch or dessert cafe plan that feels intentional, not childish or random.',
            ];
            return variationHints[Math.floor(Math.random() * variationHints.length)];
          })();

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
${venueInfo}
${avoidText}

This time: ${variationLine}

QUALITY BAR:
- The idea should be something a thoughtful adult would actually want to invite someone to.
- Avoid low-quality venues or plans: truck stops, rest stops, gas stations, convenience stores, chain fast food, big-box retail, generic "grab snacks", playgrounds, or anything that feels like killing time.
- Alcohol can be adjacent only when the venue is public and food/activity-forward (e.g. small plates, jazz lounge with seating), but do NOT make drinking the point.
- Prefer places with atmosphere, conversation, and a clear reason to be there.

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
            content: 'You create mature, stylish, activity-based in-person hangout ideas for adults who connected on a social app. Never use the words date, dating, romantic, or couple in your JSON output. Never suggest truck stops, travel centers, gas stations, convenience stores, fast food, big-box stores, playgrounds, or generic snack runs. Prefer craft coffee/tea, brunch, small plates, galleries, museums, indie cinema, bookstores, food halls, botanical gardens, scenic walks, pottery/cooking classes, comedy, live music with seating, mini golf, and bowling. When shared interests are listed, weave at least one into the title or first sentence and tie most topics to those interests. One or two sentences for description only.',
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
  const scrubDateTerminology = (s: string) => s.replace(/\bdate\b/gi, 'meetup').replace(/\bdating\b/gi, 'connecting');

  planTitle = scrubDateTerminology(planTitle);
  planDescription = scrubDateTerminology(planDescription);
  conversationTopics = conversationTopics.map((t) => scrubDateTerminology(t));

  const generatedPlanText = [planTitle, planDescription, ...conversationTopics].join(' ');
  if (LOW_QUALITY_VENUE_NAME_RE.test(generatedPlanText)) {
    const safeFallback = fallbackDatePlanCopy(sharedInterests, meetingLocation, selectedVenueForPlan);
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
    venueAddress: selectedVenue?.address,
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
      `SELECT id, match_id, suggested_by, plan_type, title, description,
              venue_name, venue_address, venue_lat, venue_lng,
              suggested_date, suggested_time, budget_range, conversation_topics,
              status, user1_accepted, user2_accepted, user1_modifications, user2_modifications,
              created_at, updated_at
       FROM date_plans
       WHERE match_id = ? AND status != 'declined'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get([matchId]);
  const plan = (result instanceof Promise ? await result : result) as {
    id: string;
    match_id: string;
    suggested_by: string;
    plan_type: string;
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
  modifications?: string
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
    await (db
      .prepare(`UPDATE date_plans SET ${modField} = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run([modifications, 'modified', planId]) as Promise<any>);
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

