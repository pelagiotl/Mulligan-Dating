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
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80",
    gradientFrom: "#14532d",
    gradientTo: "#22c55e",
  },
  games: {
    laneId: "games",
    label: "Playful activity",
    emoji: "🎳",
    imageUrl:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
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
      "https://images.unsplash.com/photo-1488459716781-31db37582c9f?auto=format&fit=crop&w=800&q=80",
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

export function getDatePlanLaneVisual(laneId: string | undefined): DatePlanLaneVisual {
  if (laneId && LANE_IDS.has(laneId)) {
    return LANE_VISUALS[laneId as DatePlanLaneId];
  }
  return LANE_VISUALS.culture;
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
