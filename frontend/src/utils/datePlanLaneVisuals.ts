export type DatePlanLaneId =
  | "coffee"
  | "meal"
  | "walk"
  | "games"
  | "culture"
  | "market"
  | "dessert";

export interface DatePlanLaneVisual {
  laneId: DatePlanLaneId;
  label: string;
  emoji: string;
  /** Curated Unsplash hero — stable, premium mood imagery per category */
  imageUrl: string;
  gradientFrom: string;
  gradientTo: string;
}

const LANE_VISUALS: Record<DatePlanLaneId, DatePlanLaneVisual> = {
  coffee: {
    laneId: "coffee",
    label: "Coffee & tea",
    emoji: "☕",
    imageUrl:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#3d2914",
    gradientTo: "#8b5a2b",
  },
  meal: {
    laneId: "meal",
    label: "Shared meal",
    emoji: "🍽️",
    imageUrl:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#4a1942",
    gradientTo: "#c026d3",
  },
  walk: {
    laneId: "walk",
    label: "Walk & nature",
    emoji: "🌿",
    imageUrl:
      "https://images.unsplash.com/photo-1775260014413-15d0b518566e?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#14532d",
    gradientTo: "#22c55e",
  },
  games: {
    laneId: "games",
    label: "Playful activity",
    emoji: "🎳",
    imageUrl:
      "https://images.unsplash.com/photo-1660129071363-d13390de351f?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#1e3a5f",
    gradientTo: "#6366f1",
  },
  culture: {
    laneId: "culture",
    label: "Culture",
    emoji: "🎨",
    imageUrl:
      "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#312e81",
    gradientTo: "#a855f7",
  },
  market: {
    laneId: "market",
    label: "Market & bites",
    emoji: "🛍️",
    imageUrl:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#713f12",
    gradientTo: "#f59e0b",
  },
  dessert: {
    laneId: "dessert",
    label: "Dessert & stroll",
    emoji: "🍰",
    imageUrl:
      "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#831843",
    gradientTo: "#f472b6",
  },
};

const LANE_IDS = new Set<string>(Object.keys(LANE_VISUALS));

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`;

const PLAYFUL_ACTIVITY_IMAGES = {
  default: UNSPLASH("1660129071363-d13390de351f"),
  miniGolf: UNSPLASH("1758966075321-4a929f9b90fa"),
  golf: UNSPLASH("1633597782927-621093a8d817"),
  bowling: UNSPLASH("1660129071363-d13390de351f"),
  arcade: UNSPLASH("1511512578047-dfb367046420"),
} as const;

const WALK_NATURE_IMAGES = {
  default: UNSPLASH("1775260014413-15d0b518566e"),
  park: UNSPLASH("1775260014413-15d0b518566e"),
  garden: UNSPLASH("1756655386547-8b55617975c2"),
  forest: UNSPLASH("1441974231531-c6227db76b6e"),
} as const;

export type DatePlanVisualContext = {
  title?: string;
  description?: string;
  venueName?: string;
};

export function laneHeroBackground(visual: DatePlanLaneVisual): string {
  return `linear-gradient(135deg, ${visual.gradientFrom}, ${visual.gradientTo}), url(${visual.imageUrl})`;
}

export function getDatePlanLaneVisual(
  laneId: string | undefined,
  context?: DatePlanVisualContext,
): DatePlanLaneVisual {
  const normalized = normalizeDatePlanLaneId(laneId);
  const base = LANE_VISUALS[normalized];
  const haystack = buildDatePlanVisualHaystack(context);

  if (normalized === "games") {
    const imageUrl = haystack ? resolvePlayfulActivityImageUrl(haystack) : PLAYFUL_ACTIVITY_IMAGES.default;
    return { ...base, imageUrl };
  }
  if (normalized === "walk") {
    const imageUrl = haystack ? resolveWalkNatureImageUrl(haystack) : WALK_NATURE_IMAGES.default;
    return { ...base, imageUrl };
  }
  return base;
}

function buildDatePlanVisualHaystack(context?: DatePlanVisualContext): string {
  return [context?.title, context?.description, context?.venueName].filter(Boolean).join(" ").toLowerCase();
}

function resolvePlayfulActivityImageUrl(haystack: string): string {
  if (/\b(mini\s*golf|miniature\s*golf|putt[\s-]?putt)\b/.test(haystack)) {
    return PLAYFUL_ACTIVITY_IMAGES.miniGolf;
  }
  if (
    /\b(top\s*golf|topgolf|driving\s*range|golf\s*(center|course|club)|bear\s*creek)\b/.test(haystack) ||
    /\bgolf\b/.test(haystack)
  ) {
    return PLAYFUL_ACTIVITY_IMAGES.golf;
  }
  if (/\b(bowl|bowling)\b/.test(haystack)) return PLAYFUL_ACTIVITY_IMAGES.bowling;
  if (/\b(arcade)\b/.test(haystack)) return PLAYFUL_ACTIVITY_IMAGES.arcade;
  return PLAYFUL_ACTIVITY_IMAGES.default;
}

function resolveWalkNatureImageUrl(haystack: string): string {
  if (
    /\b(hike|hiking|forest|wilderness|woodland|backcountry|national\s*forest|old\s*growth|timber)\b/.test(
      haystack,
    ) ||
    /\b(state\s*park|national\s*park)\b/.test(haystack)
  ) {
    return WALK_NATURE_IMAGES.forest;
  }
  if (/\b(botanical|arboretum|garden)\b/.test(haystack)) {
    return WALK_NATURE_IMAGES.garden;
  }
  if (
    /\b(park|greenway|playground|promenade|plaza|waterfront|river\s*walk|lakeside|lithia|bear\s*creek\s*park)\b/.test(
      haystack,
    )
  ) {
    return WALK_NATURE_IMAGES.park;
  }
  if (/\b(trail|walk|stroll|overlook)\b/.test(haystack)) {
    return WALK_NATURE_IMAGES.park;
  }
  return WALK_NATURE_IMAGES.default;
}

function normalizeDatePlanLaneId(laneId: string | undefined): DatePlanLaneId {
  if (laneId && LANE_IDS.has(laneId)) {
    return laneId as DatePlanLaneId;
  }
  const lower = (laneId ?? "").toLowerCase();
  if (lower.includes("market") || lower.includes("food hall")) return "market";
  if (lower.includes("coffee") || lower.includes("cafe") || lower.includes("tea")) return "coffee";
  if (lower.includes("meal") || lower.includes("dinner") || lower.includes("lunch")) return "meal";
  if (lower.includes("walk") || lower.includes("nature") || lower.includes("park")) return "walk";
  if (lower.includes("game") || lower.includes("play")) return "games";
  if (lower.includes("dessert") || lower.includes("sweet")) return "dessert";
  return "culture";
}

export function budgetDisplay(b: string | undefined): { label: string; tier: string } {
  if (b === "low") return { label: "Budget-friendly", tier: "$" };
  if (b === "high") return { label: "Splurge-worthy", tier: "$$$" };
  return { label: "Moderate", tier: "$$" };
}

export function formatVenuePinLabel(venueName: string, venueAddress?: string): string {
  if (!venueAddress?.trim()) return venueName;
  const parts = venueAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const location =
    parts.length >= 2
      ? `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
      : venueAddress.trim();
  return `${venueName} · ${location}`;
}
