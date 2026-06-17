import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';

/** Dev-only mock ideas for simulator preview — not used for real matches. */
export const DEV_DATE_PLAN_PREVIEW_MATCH_ID = 'dev-date-plan-preview';

type PreviewDatePlanIdea = {
  laneId: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  budgetRange: 'low' | 'medium' | 'high';
  conversationTopics: string[];
};

const PREVIEW_LISTENERS = new Set<() => void>();

const TITLE_VARIANTS: Record<string, string[]> = {
  coffee: ['Afternoon coffee on the plaza', 'Slow pour & easy chat', 'Cafe catch-up'],
  walk: ['Sunset walk along the river', 'Park loop & good chat', 'Golden hour stroll'],
  meal: ['Shared plates downtown', 'Small plates, big conversation', 'A meal worth lingering over'],
  dessert: ['Dessert & evening stroll', 'Sweet stop & easy talk', 'Treats then a short walk'],
  games: ['Board games & friendly competition', 'Playful competition night', 'Games, laughs, and snacks'],
  culture: ['Gallery hop downtown', 'Culture stop & conversation', 'A little art, a lot of chat'],
  market: ['Farmers market tasting tour', 'Market wander & bites', 'Food hall discovery'],
};

const VENUE_VARIANTS: Record<
  string,
  Array<{ venueName: string; venueAddress?: string; description?: string }>
> = {
  coffee: [
    {
      venueName: 'Origin Coffee Roasters',
      venueAddress: 'Medford, OR',
      description:
        'Meet at the roastery for pour-overs and a proper table — easy to linger and talk without rush.',
    },
    {
      venueName: 'Mellelo Coffee Roasters',
      venueAddress: 'Medford, OR',
      description:
        'Grab espresso inside their cafe space, then settle in for an unhurried chat.',
    },
    {
      venueName: 'Corinthian Coffee House',
      venueAddress: 'Medford, OR',
      description:
        'Classic neighborhood coffee house with indoor seating — low pressure, easy exit if the vibe is off.',
    },
  ],
  walk: [
    { venueName: 'Bear Creek Park', venueAddress: 'Medford, OR' },
    { venueName: 'Prescott Park Trail', venueAddress: 'East Medford' },
    {
      venueName: 'Lithia Park',
      venueAddress: 'Ashland, OR',
      description:
        'Meet at Lithia Park in Ashland, OR. Take an easy stroll, comment on what you notice, and let movement keep the conversation natural.',
    },
    {
      venueName: 'Pacifica: A Garden in the Siskiyous',
      venueAddress: 'Ashland, OR',
      description:
        'Meet at Pacifica: A Garden in the Siskiyous in Ashland, OR. Explore the gardens and grounds together — stroll the paths, notice plants and wildlife, and keep conversation easy with plenty to see along the way.',
    },
    { venueName: 'Roxy Ann Peak Overlook', venueAddress: 'Central Point, OR' },
  ],
  meal: [
    {
      venueName: 'The Lark',
      venueAddress: 'Medford, OR',
      description:
        'Split a few small plates at a real sit-down table — enough atmosphere to talk without a long commitment.',
    },
    {
      venueName: 'Jefferson Grapevine',
      venueAddress: 'Medford, OR',
      description:
        'Wine bar energy with shareable bites — keep the table playful and the conversation flowing.',
    },
    {
      venueName: 'Pomodori Osteria',
      venueAddress: '410 E Main St, Medford, OR',
      description:
        'Italian sit-down dinner downtown — pasta, small plates, and a table built for lingering conversation.',
    },
  ],
  dessert: [
    {
      venueName: 'Rogue Creamery',
      venueAddress: 'Central Point, OR',
      description:
        'Sample award-winning cheese and sweet treats, then take a short walk while you compare favorites.',
    },
    {
      venueName: 'Mix Bakeshop',
      venueAddress: '57 N Main St, Ashland, OR',
      description:
        'Pastries, macarons, or ice cream at a cozy downtown bakery — sweet stop with plenty to talk about.',
    },
    {
      venueName: 'Petite à Grace Croissant Cafe',
      venueAddress: '36 S Central Ave, Medford, OR',
      description:
        'French-style croissants and pastries downtown — grab a treat and linger over easy conversation.',
    },
  ],
  games: [
    { venueName: 'The Game Table', venueAddress: 'Medford, OR' },
    { venueName: 'Game Night Deli', venueAddress: '1390 Biddle Rd, Medford, OR' },
    { venueName: 'Astral Games', venueAddress: '125 S Central Ave, Medford, OR' },
    {
      venueName: 'Bear Creek Golf Center',
      venueAddress: 'Medford, OR',
      description:
        'Meet at Bear Creek Golf Center in Medford, OR. Hit the range or play a few holes together — take turns, keep scores light, and grab food or drinks between swings if the bay has them.',
    },
  ],
  culture: [
    { venueName: 'Rogue Gallery', venueAddress: 'Medford, OR' },
    {
      venueName: 'The Annex Clay & Culinary Studio',
      venueAddress: 'Medford, OR',
      description:
        'Meet at The Annex Clay & Culinary Studio in Medford, OR. Try a hands-on clay session together — shape something side by side, laugh at the messy parts, and keep conversation easy between projects.',
    },
    { venueName: 'Schneider Museum of Art', venueAddress: 'Ashland, OR' },
    { venueName: 'Bloomsbury Books', venueAddress: 'Ashland, OR' },
  ],
  market: [
    { venueName: 'Rogue Valley Growers Market', venueAddress: 'Medford, OR' },
    { venueName: 'Ashland Saturday Market', venueAddress: 'Ashland, OR' },
    { venueName: 'The Commons Food Hall', venueAddress: 'Medford, OR' },
  ],
};

const LANE_TEMPLATES: Array<
  Pick<PreviewDatePlanIdea, 'laneId' | 'description' | 'budgetRange' | 'conversationTopics'>
> = [
  {
    laneId: 'coffee',
    description:
      'Meet for a sit-down coffee at a local cafe — order at the counter, find a table, and ease into conversation.',
    budgetRange: 'low',
    conversationTopics: ['favorite drinks', 'weekend routines'],
  },
  {
    laneId: 'walk',
    description:
      'Stroll the greenway at golden hour — movement keeps things natural and gives you plenty to comment on.',
    budgetRange: 'low',
    conversationTopics: ['outdoors', 'pets', 'travel'],
  },
  {
    laneId: 'meal',
    description:
      'Split a few small plates so you can try more than one thing and keep the table playful.',
    budgetRange: 'medium',
    conversationTopics: ['food', 'favorite restaurants'],
  },
  {
    laneId: 'dessert',
    description:
      'Sweet treat first, then a short walk while the sugar kicks in — classic intentional first hangout.',
    budgetRange: 'low',
    conversationTopics: ['desserts', 'childhood favorites'],
  },
  {
    laneId: 'games',
    description:
      'Pick a board-game cafe or game shop — playful stakes without the pressure of a long sit-down meal.',
    budgetRange: 'medium',
    conversationTopics: ['favorite games', 'competitive streaks'],
  },
  {
    laneId: 'culture',
    description:
      'Browse a small gallery or indie bookstore, then compare two pieces or titles that caught your eye.',
    budgetRange: 'low',
    conversationTopics: ['art', 'books', 'creativity'],
  },
  {
    laneId: 'market',
    description:
      'Sample seasonal bites, compare favorites, and keep the conversation moving booth to booth.',
    budgetRange: 'low',
    conversationTopics: ['local food', 'cooking', 'seasonal finds'],
  },
];

function pickVariant<T>(items: T[], excludeKeys: Set<string>, keyFor: (item: T) => string): T {
  const fresh = items.filter((item) => !excludeKeys.has(keyFor(item).toLowerCase()));
  const pool = fresh.length > 0 ? fresh : items;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getDatePlanPreviewMockIdeas(options?: {
  excludeLaneIds?: string[];
  excludeTitles?: string[];
  excludeVenueNames?: string[];
  count?: number;
}): PreviewDatePlanIdea[] {
  const excludeLanes = new Set(options?.excludeLaneIds ?? []);
  const excludeTitles = new Set((options?.excludeTitles ?? []).map((t) => t.toLowerCase()));
  const excludeVenues = new Set((options?.excludeVenueNames ?? []).map((v) => v.toLowerCase()));
  const want = options?.count ?? 4;

  let fresh = LANE_TEMPLATES.filter((lane) => !excludeLanes.has(lane.laneId));
  if (fresh.length === 0) {
    fresh = [...LANE_TEMPLATES];
  }
  fresh = [...fresh].sort(() => Math.random() - 0.5);

  let picked =
    fresh.length >= want ? fresh.slice(0, want) : [...fresh];

  if (picked.length < want) {
    const used = LANE_TEMPLATES.filter((lane) => excludeLanes.has(lane.laneId)).sort(() => Math.random() - 0.5);
    picked = [...picked, ...used].slice(0, want);
  }

  return picked.map((lane) => {
    const title = pickVariant(TITLE_VARIANTS[lane.laneId] ?? [lane.laneId], excludeTitles, (t) => t);
    const venue = pickVariant(
      VENUE_VARIANTS[lane.laneId] ?? [{ venueName: 'Downtown Medford', venueAddress: 'Medford, OR' }],
      excludeVenues,
      (v) => v.venueName,
    );
    return {
      laneId: lane.laneId,
      title,
      description: venue.description ?? lane.description,
      venueName: venue.venueName,
      venueAddress: venue.venueAddress,
      budgetRange: lane.budgetRange,
      conversationTopics: lane.conversationTopics,
    };
  });
}

function navigateToBrowse(): void {
  if (!navigationRef.current?.isReady()) return;
  navigationRef.current.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: { screen: 'Browse' },
    }),
  );
}

function firePreviewListeners(): void {
  PREVIEW_LISTENERS.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[datePlanPreviewDemo] listener failed:', e);
    }
  });
}

/** Dev-only: open Connect tab with mock smart date plan cards (no API). */
export function requestDatePlanPreview(): void {
  if (!__DEV__) return;

  let attempts = 0;
  const maxAttempts = 25;

  const tick = () => {
    attempts += 1;
    navigateToBrowse();
    if (PREVIEW_LISTENERS.size > 0) {
      firePreviewListeners();
      return;
    }
    if (attempts < maxAttempts) {
      setTimeout(tick, 400);
    }
  };

  setTimeout(tick, 300);
}

export function subscribeDatePlanPreview(listener: () => void): () => void {
  PREVIEW_LISTENERS.add(listener);
  return () => PREVIEW_LISTENERS.delete(listener);
}

export const DATE_PLAN_PREVIEW_DEEP_LINK = 'app.mulligandating://dev/date-plan-preview';
