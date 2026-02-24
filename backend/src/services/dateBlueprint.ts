import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { Client } from '@googlemaps/google-maps-services-js';

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

/**
 * Search for venues using Google Places API
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

  // Search for venues based on shared interests
  // Add variation: try different interests or generic searches to get different venues
  let venues: VenueSearchResult[] = [];

  // Get existing plans to avoid suggesting the same venue and to tell AI what not to repeat
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

  // Venue type keywords: wholesome variety (no bars). Park, bookstore, coffee, etc.
  const genericKeywords = [
    'restaurant', 'cafe', 'coffee shop', 'park', 'museum', 'activity', 'entertainment',
    'arcade', 'mini golf', 'bookstore', 'art gallery', 'comedy club',
    'farmers market', 'food truck', 'hiking trail', 'beach', 'bowling', 'ice skating',
    'brunch spot', 'botanical garden', 'aquarium', 'tea house', 'juice bar',
    'playground', 'scenic overlook', 'nature center', 'library', 'board game cafe',
    'pottery studio', 'art class', 'cooking class', 'outdoor movie', 'food hall',
  ];

  // Try interest-based searches first when both users have shared interests
  if (sharedInterests.length > 0) {
    const shuffledInterests = [...sharedInterests].sort(() => Math.random() - 0.5);
    for (const interest of shuffledInterests) {
      const interestVenues = await searchVenues(meetingLocation, interest);
      const newVenues = interestVenues.filter(v => !existingVenueNames.has(v.name.toLowerCase()));
      if (newVenues.length > 0) {
        venues = newVenues;
        break;
      }
    }
  }

  // If no venues yet, try diverse generic types (park, bookstore, coffee, etc.) so we get variety
  if (venues.length === 0) {
    for (const keyword of genericKeywords.sort(() => Math.random() - 0.5)) {
      const keywordVenues = await searchVenues(meetingLocation, keyword);
      const newVenues = keywordVenues.filter(v => !existingVenueNames.has(v.name.toLowerCase()));
      if (newVenues.length > 0) {
        venues = newVenues;
        break;
      }
    }
  }

  // Last resort: single generic "activities" search
  if (venues.length === 0) {
    const genericVenues = await searchVenues(meetingLocation);
    venues = genericVenues.filter(v => !existingVenueNames.has(v.name.toLowerCase()));
    if (venues.length === 0) {
      venues = genericVenues;
    }
  }

  // Pick ONE venue for this plan and use it for both the AI prompt and the saved plan
  // (Previously we told AI about venues[0] but saved a random venue → description didn't match.)
  const selectedVenueForPlan = venues.length > 0
    ? venues[Math.floor(Math.random() * Math.min(venues.length, 5))]
    : null;

  // Generate date plan using AI
  const openaiApiKey = process.env.OPENAI_API_KEY;
  let planTitle = 'First Date Plan';
  let planDescription = 'A fun first date!';
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
            ? `THE date must be at this exact venue: ${selectedVenueForPlan.name}, ${selectedVenueForPlan.address}.

WHAT THIS VENUE ACTUALLY IS (use ONLY these facts; do not invent anything else):
${venueFacts}

CRITICAL: Your description MUST only describe activities that match the above. Do NOT add features that are not listed (e.g. do NOT say food trucks, live music in a park, or global cuisines unless the venue is actually that). If it is a sports complex with pool and courts, describe that. If it is a café, describe that. Never mix up venue types.`
            : `THE date must be at this exact venue. Use ONLY this venue in the description and do not mention any other place: ${selectedVenueForPlan.name} at ${selectedVenueForPlan.address}. Do not invent features the venue does not have (e.g. no food trucks or "park" unless the venue is actually a park).`)
        : 'No specific venue found, suggest a general activity (do not invent a specific venue name).';

      const interestsText = sharedInterests.length > 0
        ? `Shared interests: ${sharedInterests.join(', ')}`
        : 'No specific shared interests listed';

      const avoidText = existingTitles.length > 0
        ? `\nCRITICAL: Do NOT suggest anything similar to these recent plans for this couple: ${existingTitles.join(' | ')}. Pick a completely different type of date (different activity, vibe, and title).\n`
        : '';

      // When we have real venue facts, don't suggest a random different activity type (e.g. "food trucks" for a sports complex)
      const variationLine = venueFacts
        ? 'Keep the tone fun and conversational; describe only what this venue actually offers.'
        : (() => {
            const variationHints = [
              'Suggest a low-key activity like mini golf, arcade, or bowling — fun and casual.',
              'Suggest something creative: pottery class, paint-and-sip, or a craft workshop.',
              'Suggest a food-focused date: food hall, food trucks, or a cooking class.',
              'Suggest an outdoor date: picnic, botanical garden, farmers market, or scenic walk.',
              'Suggest a cultural date: museum, gallery, indie cinema, or live comedy.',
              'Suggest a cozy date: bookstore café, brunch spot, or tea house with a view.',
              'Suggest an active date: hiking, bike ride, ice skating, or beach day.',
              'Suggest something playful: escape room, trivia night, or board game café.',
              'Suggest a romantic-but-casual date: sunset spot, stargazing, or waterfront walk.',
              'Suggest a niche interest date: record store, vintage market, or flea market.',
              'Suggest a sweet-tooth date: dessert café, chocolate tasting, or donut tour.',
              'Suggest a nature date: aquarium, zoo, or nature center.',
              'Suggest a local-discovery date: neighborhood walk, hidden gems, or street art tour.',
              'Suggest a morning date: sunrise coffee, breakfast spot, or morning market.',
              'Suggest a competitive-but-fun date: axe throwing, go-karts, or batting cages.',
              'Suggest a chill-and-talk date: tea house, juice bar, or quiet café.',
              'Suggest a music date: vinyl listening, open mic, or small concert (no bar focus).',
              'Suggest a seasonal date: holiday market, outdoor movie, or fall foliage walk.',
              'Suggest something unexpected: trampoline park, karaoke, or a themed pop-up.',
              'Suggest a learning date: cooking class, art class, or dance lesson.',
              'Suggest a scenic date: scenic overlook, lakeside, or garden.',
              'Suggest a cozy indoor date: library, board game café, or bookstore.',
              'Suggest an active outdoor date: kayaking, paddleboarding, or bike trail.',
              'Suggest a food adventure: food hall, food trucks, or tasting tour (non-alcoholic).',
              'Suggest a creative date: DIY workshop, craft fair, or maker space.',
              'Suggest a relaxed date: park bench, waterfront bench, or café patio.',
            ];
            return variationHints[Math.floor(Math.random() * variationHints.length)];
          })();

      const prompt = `Create a FIRST DATE plan for a dating app. This must be DIFFERENT from any plan suggested before for this couple.
${interestsText}
Location: ${meetingLocation}
${venueInfo}
${avoidText}

This time: ${variationLine}

Keep the date wholesome: do NOT suggest bars, wine bars, breweries, or alcohol-focused venues. Prefer coffee, food, activities, outdoors, and low-key spots.

Generate a creative, engaging first date plan that:
- Is appropriate for a first meeting (public, safe, not too intimate)
- References shared interests if available, but be creative
- Includes 3-5 conversation topics to help break the ice (make them unique)
- Suggests a budget range (low/medium/high)
- Is specific and actionable
- Has a short, catchy title that is NOT the same idea as the recent plans listed above
- If a specific venue was provided above, the description MUST describe the date at THAT venue only and MUST match what the venue actually is (no invented features).
- Description must be CONCISE: 1–2 short sentences max. No long paragraphs. Punchy and scannable.

Return ONLY a JSON object with this exact format:
{
  "title": "short catchy title",
  "description": "1–2 sentence concise summary of the date (what you do, where; no fluff)",
  "conversationTopics": ["topic 1", "topic 2", "topic 3"],
  "budgetRange": "low|medium|high"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a creative assistant that creates unique, fun, safe first date plans for dating apps. Each plan should be different and memorable. Keep descriptions brief and punchy—one or two sentences only. No long paragraphs.',
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
      console.error('❌ Failed to generate AI date plan:', error);
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

