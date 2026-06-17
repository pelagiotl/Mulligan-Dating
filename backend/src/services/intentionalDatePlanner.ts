/**
 * Smart Intentional Date Planner — batch idea generation and formal proposals.
 */
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';
import { geocodeLocation } from '../utils/geocoding.js';
import {
  DATE_PLAN_LANES,
  type DatePlan,
  type DatePlanLane,
  fallbackDatePlanCopy,
  formatVenueDisplayAddress,
  gatherDatePlanVenues,
  pickVenueAwareTitle,
  scrubDateTerminology,
  venueFitsLane,
  venueNearMeetingLocation,
  type VenueSearchResult,
} from './dateBlueprint.js';

export interface DatePlanIdea {
  laneId: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  budgetRange: 'low' | 'medium' | 'high';
  conversationTopics: string[];
}

const HANGOUT_SAFETY_NOTE =
  'Meet in a busy public place and share your plans with a friend.';

function pickLanesForIdeas(count: number, excludeLaneIds: string[] = []): DatePlanLane[] {
  const exclude = new Set(excludeLaneIds);
  let fresh = DATE_PLAN_LANES.filter((lane) => !exclude.has(lane.id));

  // Every lane was shown this session — start a new cycle.
  if (fresh.length === 0) {
    fresh = [...DATE_PLAN_LANES];
  }

  fresh = [...fresh].sort(() => Math.random() - 0.5);

  if (fresh.length >= count) {
    return fresh.slice(0, count);
  }

  // Prefer unseen lanes, then fill remaining slots from previously shown lanes.
  const used = [...DATE_PLAN_LANES.filter((lane) => exclude.has(lane.id))].sort(() => Math.random() - 0.5);
  return [...fresh, ...used].slice(0, Math.min(count, DATE_PLAN_LANES.length));
}

function pickVenueForIdea(
  venues: VenueSearchResult[],
  excludeVenueNames: Set<string>,
  lane: DatePlanLane,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
): VenueSearchResult | null {
  if (venues.length === 0) return null;
  const fitting = venues.filter(
    (venue) =>
      venue.name &&
      venueFitsLane(venue, lane) &&
      venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng),
  );
  const fresh = fitting.filter((venue) => !excludeVenueNames.has(venue.name.toLowerCase()));
  const pool = fresh.length > 0 ? fresh : fitting;
  if (pool.length === 0) return null;
  const shortlist = pool.slice(0, Math.min(5, pool.length));
  return shortlist[Math.floor(Math.random() * shortlist.length)] ?? null;
}

function withSafetyNote(description: string): string {
  if (description.includes(HANGOUT_SAFETY_NOTE)) return description;
  return `${description.trim()}\n\n${HANGOUT_SAFETY_NOTE}`;
}

function venueIsUsable(
  venue: VenueSearchResult,
  lane: DatePlanLane,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
): boolean {
  if (!venue.name) return false;
  if (!venueFitsLane(venue, lane)) return false;
  if (!venueNearMeetingLocation(venue, meetingLocation, meetingLat, meetingLng)) return false;
  if (venue.businessStatus && venue.businessStatus !== 'OPERATIONAL') return false;
  return true;
}

function resolvePickedVenue(
  idea: DatePlanIdea,
  pickedVenue: VenueSearchResult | null,
  venues: VenueSearchResult[],
): VenueSearchResult | null {
  if (pickedVenue?.name) return pickedVenue;
  if (!idea.venueName) return null;
  const target = idea.venueName.toLowerCase();
  return (
    venues.find((candidate) => candidate.name.toLowerCase() === target) ??
    venues.find(
      (candidate) =>
        candidate.name.toLowerCase().includes(target) || target.includes(candidate.name.toLowerCase()),
    ) ??
    null
  );
}

function finalizeDatePlanIdea(
  idea: DatePlanIdea,
  lane: DatePlanLane,
  pickedVenue: VenueSearchResult | null,
  venues: VenueSearchResult[],
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
): DatePlanIdea {
  let venue = resolvePickedVenue(idea, pickedVenue, venues);
  if (venue && !venueIsUsable(venue, lane, meetingLocation, meetingLat, meetingLng)) {
    venue = null;
  }
  if (!venue) {
    venue = pickVenueForIdea(venues, new Set(), lane, meetingLocation, meetingLat, meetingLng);
  }
  if (!venue || !venueIsUsable(venue, lane, meetingLocation, meetingLat, meetingLng)) {
    return { ...idea, description: withSafetyNote(idea.description) };
  }

  const description = withSafetyNote(
    fallbackDatePlanCopy([], meetingLocation, venue, lane).description,
  );

  return {
    ...idea,
    title: scrubDateTerminology(pickVenueAwareTitle(lane, venue, [idea.title])),
    description,
    venueName: venue.name,
    venueAddress: formatVenueDisplayAddress(venue, meetingLocation),
    venueLat: venue.lat,
    venueLng: venue.lng,
  };
}

function finalizeDatePlanIdeas(
  drafts: Array<{ idea: DatePlanIdea; lane: DatePlanLane; pickedVenue: VenueSearchResult | null; venues: VenueSearchResult[] }>,
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
): DatePlanIdea[] {
  return drafts.map(({ idea, lane, pickedVenue, venues }) =>
    finalizeDatePlanIdea(idea, lane, pickedVenue, venues, meetingLocation, meetingLat, meetingLng),
  );
}

function ideaFromLane(
  lane: DatePlanLane,
  sharedInterests: string[],
  meetingLocation: string,
  venue: VenueSearchResult | null,
  excludeTitles: string[] = [],
): DatePlanIdea {
  const copy = fallbackDatePlanCopy(sharedInterests, meetingLocation, venue, lane);
  const title = pickVenueAwareTitle(lane, venue, excludeTitles);
  let description = copy.description;
  if (!description.includes('Public meetups recommended')) {
    description = `${description.trim()}\n\n${HANGOUT_SAFETY_NOTE}`;
  }
  return {
    laneId: lane.id,
    title: scrubDateTerminology(title),
    description: scrubDateTerminology(description),
    venueName: venue?.name,
    venueAddress: venue ? formatVenueDisplayAddress(venue, meetingLocation) : undefined,
    venueLat: venue?.lat,
    venueLng: venue?.lng,
    budgetRange: copy.budgetRange,
    conversationTopics: copy.conversationTopics.map(scrubDateTerminology),
  };
}

async function generateIdeasWithAi(
  sharedInterests: string[],
  meetingLocation: string,
  meetingLat: number | null,
  meetingLng: number | null,
  laneVenueSets: Array<{ lane: DatePlanLane; venues: VenueSearchResult[] }>,
  excludeTitles: string[] = [],
): Promise<DatePlanIdea[] | null> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) return null;

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const lanes = laneVenueSets.map((entry) => entry.lane);
    const laneList = lanes.map((l) => `- ${l.label}: ${l.promptHint}`).join('\n');
    const venueList = laneVenueSets
      .map(({ lane, venues }) => {
        const fitting = venues
          .filter((v) => venueFitsLane(v, lane))
          .filter((v) => venueNearMeetingLocation(v, meetingLocation, meetingLat, meetingLng))
          .slice(0, 3);
        if (fitting.length === 0) return null;
        return `${lane.label}: ${fitting.map((v) => `${v.name} (${v.address})`).join('; ')}`;
      })
      .filter(Boolean)
      .join(' | ');
    const interestsText =
      sharedInterests.length > 0
        ? `Shared interests: ${sharedInterests.join(', ')}`
        : 'No overlapping interests on file';

    const prompt = `Create exactly ${lanes.length} distinct IN-PERSON hangout ideas for two adults who matched on Mulligan.
${interestsText}
Location: ${meetingLocation}
${venueList ? `Real nearby venues (use when they fit): ${venueList}` : 'No venue list — suggest general public activities.'}

Categories to cover (one idea each):
${laneList}

Rules:
- Never use "date", "dating", "romantic", or "couple".
- Each idea must be different in vibe and category.
- Mature, intentional, public, conversation-friendly.
- description: 1-2 sentences max.
- 3 conversation topics per idea.
- budgetRange: low|medium|high
${excludeTitles.length > 0 ? `- Do NOT repeat or closely paraphrase these prior titles: ${excludeTitles.join('; ')}.` : ''}

Return ONLY JSON:
{
  "ideas": [
    {
      "laneId": "coffee|meal|walk|games|culture|market|dessert",
      "title": "...",
      "description": "...",
      "venueName": "optional real name",
      "venueAddress": "optional",
      "budgetRange": "low|medium|high",
      "conversationTopics": ["...", "...", "..."]
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You create distinct, intentional public hangout ideas for adults. Output valid JSON only. Never use date/dating/romantic/couple.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.95,
      max_tokens: 1200,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { ideas?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) return null;

    return parsed.ideas.slice(0, lanes.length).map((raw, i) => {
      const lane = lanes[i] ?? lanes[0];
      const laneVenues = laneVenueSets[i]?.venues ?? [];
      const fittingVenues = laneVenues.filter(
        (v) =>
          venueFitsLane(v, lane) &&
          venueNearMeetingLocation(v, meetingLocation, meetingLat, meetingLng),
      );
      const venuePool = fittingVenues.length > 0 ? fittingVenues : laneVenues;
      const venueName = typeof raw.venueName === 'string' ? raw.venueName : undefined;
      const matchedVenue = venueName
        ? venuePool.find((v) => v.name.toLowerCase() === venueName.toLowerCase())
        : venuePool[0];

      let description =
        typeof raw.description === 'string' ? scrubDateTerminology(raw.description) : '';
      if (description && !description.includes('Public meetups recommended')) {
        description = `${description.trim()}\n\n${HANGOUT_SAFETY_NOTE}`;
      }

      const topics = Array.isArray(raw.conversationTopics)
        ? raw.conversationTopics.filter((t): t is string => typeof t === 'string').slice(0, 5)
        : [];

      const budget =
        raw.budgetRange === 'low' || raw.budgetRange === 'high' ? raw.budgetRange : 'medium';

      return {
        laneId: typeof raw.laneId === 'string' ? raw.laneId : lane.id,
        title: scrubDateTerminology(typeof raw.title === 'string' ? raw.title : lane.label),
        description: description || ideaFromLane(lane, sharedInterests, meetingLocation, matchedVenue ?? null).description,
        venueName: matchedVenue?.name,
        venueAddress: matchedVenue
          ? formatVenueDisplayAddress(matchedVenue, meetingLocation)
          : undefined,
        venueLat: matchedVenue?.lat,
        venueLng: matchedVenue?.lng,
        budgetRange: budget,
        conversationTopics:
          topics.length > 0
            ? topics.map(scrubDateTerminology)
            : ideaFromLane(lane, sharedInterests, meetingLocation, matchedVenue ?? null).conversationTopics,
      };
    });
  } catch (error) {
    console.warn('⚠️  AI batch date ideas failed, using lane fallbacks:', error);
    return null;
  }
}

/**
 * Generate 3–5 tailored hangout ideas (no DB write).
 */
export async function generateDatePlanIdeas(
  matchId: string,
  count = 4,
  options: { excludeLaneIds?: string[]; excludeTitles?: string[]; excludeVenueNames?: string[] } = {},
): Promise<{ ideas: DatePlanIdea[]; meetingLocation: string; sharedInterests: string[] }> {
  const excludeLaneIds = options.excludeLaneIds ?? [];
  const excludeTitles = options.excludeTitles ?? [];
  const excludeVenueNames = options.excludeVenueNames ?? [];
  const excludeVenueSet = new Set(excludeVenueNames.map((name) => name.toLowerCase()));
  const matchResult = db.prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?').get([matchId]);
  const match = (matchResult instanceof Promise ? await matchResult : matchResult) as
    | { user1_id: string; user2_id: string }
    | undefined;
  if (!match) throw new Error('Match not found');

  const { getSharedInterests } = await import('./mulliganMoments.js');
  const sharedInterests = await getSharedInterests(matchId, match.user1_id, match.user2_id);

  const [user1Loc, user2Loc] = await Promise.all([
    geocodeProfileLocation(match.user1_id),
    geocodeProfileLocation(match.user2_id),
  ]);
  const meetingLocation = (() => {
    if (user1Loc && user2Loc) {
      const a = `${user1Loc.city}, ${user1Loc.state}`;
      const b = `${user2Loc.city}, ${user2Loc.state}`;
      return a === b ? a : [a, b][Math.floor(Math.random() * 2)];
    }
    if (user1Loc) return `${user1Loc.city}, ${user1Loc.state}`;
    if (user2Loc) return `${user2Loc.city}, ${user2Loc.state}`;
    return 'your area';
  })();

  const ideaCount = Math.min(5, Math.max(3, count));
  const lanes = pickLanesForIdeas(ideaCount, excludeLaneIds);

  let meetingLat: number | null = null;
  let meetingLng: number | null = null;
  if (meetingLocation !== 'your area') {
    const geocoded = await geocodeLocation(meetingLocation);
    if (geocoded?.coordinates) {
      meetingLat = geocoded.coordinates.lat;
      meetingLng = geocoded.coordinates.lng;
    }
  }

  const laneVenues = await Promise.all(
    lanes.map(async (lane) => ({
      lane,
      venues: await gatherDatePlanVenues(
        matchId,
        meetingLocation,
        meetingLat,
        meetingLng,
        sharedInterests,
        lane,
        excludeVenueNames,
        true,
      ),
    })),
  );

  const ideas = finalizeDatePlanIdeas(
    laneVenues.map(({ lane, venues }) => {
      const pickedVenue = pickVenueForIdea(
        venues,
        excludeVenueSet,
        lane,
        meetingLocation,
        meetingLat,
        meetingLng,
      );
      return {
        idea: ideaFromLane(lane, sharedInterests, meetingLocation, pickedVenue, excludeTitles),
        lane,
        pickedVenue,
        venues,
      };
    }),
    meetingLocation,
    meetingLat,
    meetingLng,
  );

  return { ideas, meetingLocation, sharedInterests };
}

async function geocodeProfileLocation(
  userId: string,
): Promise<{ city: string; state: string } | null> {
  const profileResult = db.prepare('SELECT location FROM profiles WHERE user_id = ?').get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { location: string | null }
    | undefined;
  if (!profile?.location) return null;
  const parts = profile.location.split(',').map((s) => s.trim());
  if (parts.length >= 2) {
    return { city: parts[0], state: parts[parts.length - 1] };
  }
  return null;
}

/**
 * Formal proposal: save plan, notify partner, show in chat.
 */
export async function proposeDatePlan(
  matchId: string,
  proposedBy: string,
  idea: DatePlanIdea,
  suggestedDate: string,
  suggestedTime: string,
): Promise<DatePlan> {
  const planId = uuidv4();

  const plan: DatePlan = {
    id: planId,
    matchId,
    suggestedBy: proposedBy,
    planType: 'first_date',
    title: idea.title,
    description: idea.description,
    venueName: idea.venueName,
    venueAddress: idea.venueAddress,
    venueLat: idea.venueLat,
    venueLng: idea.venueLng,
    suggestedDate,
    suggestedTime,
    budgetRange: idea.budgetRange,
    conversationTopics: idea.conversationTopics,
    status: 'pending',
    user1Accepted: false,
    user2Accepted: false,
    isProposed: true,
    proposedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await (db
    .prepare(
      `INSERT INTO date_plans 
       (id, match_id, suggested_by, plan_type, title, description, 
        venue_name, venue_address, venue_lat, venue_lng, 
        suggested_date, suggested_time, budget_range, conversation_topics,
        status, user1_accepted, user2_accepted, is_proposed, proposed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .run([
      planId,
      matchId,
      proposedBy,
      plan.planType,
      plan.title,
      plan.description,
      plan.venueName || null,
      plan.venueAddress || null,
      plan.venueLat || null,
      plan.venueLng || null,
      suggestedDate,
      suggestedTime,
      plan.budgetRange || null,
      JSON.stringify(plan.conversationTopics),
      plan.status,
      0,
      0,
    ]) as Promise<unknown>);

  return plan;
}
