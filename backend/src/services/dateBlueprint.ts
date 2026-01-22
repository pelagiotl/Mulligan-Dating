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

/**
 * Search for venues using Google Places API
 */
async function searchVenues(
  location: string,
  interest?: string,
  budget?: 'low' | 'medium' | 'high'
): Promise<Array<{
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  priceLevel?: number;
}>> {
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  if (!googleApiKey) {
    console.warn('⚠️  Google Places API key not configured, skipping venue search');
    return [];
  }

  try {
    const client = new Client({});
    
    // Build search query
    let query = interest ? `${interest} in ${location}` : `activities in ${location}`;
    
    const response = await client.textSearch({
      params: {
        query,
        key: googleApiKey,
        type: 'establishment',
      },
    });

    if (response.data.results && response.data.results.length > 0) {
      return response.data.results.slice(0, 5).map(place => ({
        name: place.name || 'Unknown',
        address: place.formatted_address || '',
        lat: place.geometry?.location?.lat || 0,
        lng: place.geometry?.location?.lng || 0,
        rating: place.rating,
        priceLevel: place.price_level,
      }));
    }

    return [];
  } catch (error) {
    console.error('❌ Failed to search venues:', error);
    return [];
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

  // Get user locations
  const user1Location = await getUserLocation(user1Id);
  const user2Location = await getUserLocation(user2Id);

  // Determine meeting location (prefer midpoint or user1's location)
  const meetingLocation = user1Location
    ? `${user1Location.city}, ${user1Location.state}`
    : user2Location
    ? `${user2Location.city}, ${user2Location.state}`
    : 'your area';

  // Search for venues based on shared interests
  let venues: Array<{
    name: string;
    address: string;
    lat: number;
    lng: number;
    rating?: number;
    priceLevel?: number;
  }> = [];

  if (sharedInterests.length > 0) {
    // Try to find venues for the first shared interest
    venues = await searchVenues(meetingLocation, sharedInterests[0]);
  }

  // If no venues found, try generic search
  if (venues.length === 0) {
    venues = await searchVenues(meetingLocation);
  }

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

      const venueInfo = venues.length > 0
        ? `Suggested venue: ${venues[0].name} at ${venues[0].address}`
        : 'No specific venue found, suggest a general activity';

      const interestsText = sharedInterests.length > 0
        ? `Shared interests: ${sharedInterests.join(', ')}`
        : 'No specific shared interests listed';

      const prompt = `Create a first date plan for a dating app. 
${interestsText}
Location: ${meetingLocation}
${venueInfo}

Generate a creative, engaging first date plan that:
- Is appropriate for a first meeting (public, safe, not too intimate)
- References shared interests if available
- Includes 3-5 conversation topics to help break the ice
- Suggests a budget range (low/medium/high)
- Is specific and actionable

Return ONLY a JSON object with this exact format:
{
  "title": "short catchy title",
  "description": "detailed description of the date plan",
  "conversationTopics": ["topic 1", "topic 2", "topic 3"],
  "budgetRange": "low|medium|high"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates fun, safe first date plans for dating apps.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          planTitle = parsed.title || planTitle;
          planDescription = parsed.description || planDescription;
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
  const selectedVenue = venues.length > 0 ? venues[0] : null;

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

  // Save to database
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

