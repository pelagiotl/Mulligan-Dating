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
  priceLevel?: number;
  place_id?: string;
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
        price_level?: number;
        place_id?: string;
      }>;
      status: string;
    };
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
    const results = data.results ?? [];
    return results.slice(0, 5).map((place) => ({
      name: place.name || 'Unknown',
      address: place.vicinity || '',
      lat: place.geometry?.location?.lat ?? 0,
      lng: place.geometry?.location?.lng ?? 0,
      rating: place.rating,
      priceLevel: place.price_level,
      place_id: place.place_id,
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
      return results.slice(0, 5).map((place: { name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } }; rating?: number; price_level?: number; place_id?: string }) => ({
        name: place.name || 'Unknown',
        address: place.formatted_address || '',
        lat: place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng ?? 0,
        rating: place.rating,
        priceLevel: place.price_level,
        place_id: place.place_id,
      }));
    }

    return [];
  } catch (error) {
    console.error('❌ Failed to search venues:', error);
    return [];
  }
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

  // Prefer casual, activity-based public meetups (coffee/tea, walk, ice cream, markets, light games, culture)
  const genericKeywords = [
    'coffee shop',
    'tea house',
    'cafe',
    'park',
    'hiking trail',
    'walking trail',
    'ice cream',
    'frozen yogurt',
    'farmers market',
    'street market',
    'mini golf',
    'bowling',
    'museum',
    'bookstore',
    'library',
    'arcade',
    'restaurant',
    'activity',
    'entertainment',
    'art gallery',
    'comedy club',
    'food truck',
    'beach',
    'ice skating',
    'brunch spot',
    'botanical garden',
    'aquarium',
    'juice bar',
    'playground',
    'scenic overlook',
    'nature center',
    'board game cafe',
    'pottery studio',
    'art class',
    'cooking class',
    'outdoor movie',
    'food hall',
  ];

  const tryVenues = (candidates: VenueSearchResult[]) => {
    const newVenues = candidates.filter(v => !existingVenueNames.has(v.name.toLowerCase()));
    if (newVenues.length > 0) venues = newVenues;
    else if (candidates.length > 0) venues = candidates;
  };

  // 1) Nearby search (30-mile radius) when we have coordinates — pulls from nearby cities
  if (meetingLat != null && meetingLng != null) {
    if (sharedInterests.length > 0) {
      const shuffled = [...sharedInterests].sort(() => Math.random() - 0.5);
      for (const interest of shuffled) {
        const nearby = await searchVenuesNearby(meetingLat, meetingLng, interest);
        tryVenues(nearby);
        if (venues.length > 0) break;
      }
    }
    if (venues.length === 0) {
      for (const keyword of genericKeywords.sort(() => Math.random() - 0.5)) {
        const nearby = await searchVenuesNearby(meetingLat, meetingLng, keyword);
        tryVenues(nearby);
        if (venues.length > 0) break;
      }
    }
    if (venues.length === 0) {
      tryVenues(await searchVenuesNearby(meetingLat, meetingLng));
    }
  }

  // 2) Fallback: text search by location name
  if (venues.length === 0 && sharedInterests.length > 0) {
    const shuffledInterests = [...sharedInterests].sort(() => Math.random() - 0.5);
    for (const interest of shuffledInterests) {
      tryVenues(await searchVenues(meetingLocation, interest));
      if (venues.length > 0) break;
    }
  }
  if (venues.length === 0) {
    for (const keyword of genericKeywords.sort(() => Math.random() - 0.5)) {
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
    ? venues[Math.floor(Math.random() * Math.min(venues.length, 5))]
    : null;

  const HANGOUT_SAFETY_NOTE =
    'Public meetups recommended when connecting for the first time. Meet in a well-lit, busy place.';

  // Generate hangout plan using AI
  const openaiApiKey = process.env.OPENAI_API_KEY;
  let planTitle = 'Hangout Plan';
  let planDescription = 'A fun hangout idea!';
  let conversationTopics: string[] = [];
  let budgetRange: 'low' | 'medium' | 'high' = 'medium';

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

CRITICAL: Your description MUST only describe activities that match the above. Do NOT add features that are not listed (e.g. do NOT say food trucks, live music in a park, or global cuisines unless the venue is actually that). If it is a sports complex with pool and courts, describe that. If it is a café, describe that. Never mix up venue types.`
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

      // When we have real venue facts, don't suggest a random different activity type (e.g. "food trucks" for a sports complex)
      const variationLine = venueFacts
        ? 'Keep the tone fun and conversational; describe only what this venue actually offers.'
        : (() => {
            const variationHints = [
              'Coffee or tea meetup at a café — easy to chat, easy to leave.',
              'Walk or easy hike in a park; keep it casual and public.',
              'Grab ice cream or frozen yogurt and stroll somewhere nearby.',
              'Check out a farmers market, street fair, or local weekend event.',
              'Mini golf or bowling — light, playful, low pressure.',
              'Browse a museum, bookstore, or library together.',
              'Low-key hangout: mini golf, arcade, or bowling.',
              'Something creative: pottery class, paint-and-sip, or a short craft workshop.',
              'Food-focused meetup: food hall or casual lunch spot (not bar-focused).',
              'Outdoor hangout: picnic, botanical garden, or scenic walk.',
              'Cultural outing: gallery, indie cinema, or live comedy (public venue).',
              'Cozy hangout: bookstore café, brunch, or tea house.',
              'Active hangout: easy bike ride, ice skating, or beach walk.',
              'Playful: escape room, trivia night, or board game café.',
              'Sweet treat: dessert café or donut shop, then a short walk.',
              'Nature outing: aquarium, zoo, or nature center.',
              'Neighborhood stroll: coffee first, then walk main street or murals.',
              'Morning meetup: breakfast spot or morning market.',
              'Chill spot: tea house, juice bar, or quiet café patio.',
              'Seasonal: holiday market, outdoor movie, or fall foliage walk.',
              'Learning hangout: short cooking demo, art exhibit, or dance intro class.',
              'Scenic: overlook, lakeside path, or public garden.',
              'Relaxed: park bench, waterfront, or café patio — still public and busy.',
            ];
            return variationHints[Math.floor(Math.random() * variationHints.length)];
          })();

      const terminologyRules = `
TERMINOLOGY (strict):
- Do NOT use the words "date", "dating", "romantic", or "couple" anywhere in title, description, or conversationTopics.
- Use: meetup, hang out, grab coffee, activity, plans, connect, etc.
- Do NOT add safety disclaimers inside the JSON; focus only on the activity.

STYLE:
- Default to casual, activity-based, daytime or early-evening public ideas (coffee/tea, walk in the park, ice cream, market, mini golf/bowling, museum/bookstore).
`;

      const prompt = `Create an IN-PERSON HANGOUT PLAN for two people who connected on Mulligan (friends / shared interests — keep it friendly and public). This must be DIFFERENT from any plan suggested before for this pair.
${terminologyRules}
${interestsText}
${sharedInterestRules}
Location: ${meetingLocation}
${venueInfo}
${avoidText}

This time: ${variationLine}

Keep it wholesome: do NOT suggest bars, wine bars, breweries, or alcohol-focused venues. Prefer coffee, tea, food, walking, light activities, outdoors, and low-key public spots.

Generate a creative hangout plan that:
- Feels casual and activity-led (not formal or intense)
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
            content: 'You create unique, casual, activity-based in-person hangout ideas for people who connected on a social app (not romantic framing). Never use the words date, dating, romantic, or couple in your JSON output. Prefer coffee/tea, walks, ice cream, markets, mini golf, bowling, museums, bookstores. When shared interests are listed, weave at least one into the title or first sentence and tie most topics to those interests. One or two sentences for description only.',
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

