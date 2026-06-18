type CachedDateIdeas = {
  ideas: Array<{
    laneId: string;
    title: string;
    description: string;
    venueName?: string;
    venueAddress?: string;
    budgetRange: 'low' | 'medium' | 'high';
    conversationTopics: string[];
  }>;
  meetingLocation: string;
  sharedInterests: string[];
};

const cache = new Map<string, CachedDateIdeas>();

export function getCachedDateIdeas(matchId: string): CachedDateIdeas | undefined {
  return cache.get(matchId);
}

export function setCachedDateIdeas(matchId: string, data: CachedDateIdeas): void {
  cache.set(matchId, data);
}

/** Lane/title/venue keys already shown — used so "New ideas" avoids repeats after reopen. */
export function exclusionKeysFromIdeas(ideas: CachedDateIdeas['ideas']): {
  laneIds: string[];
  titles: string[];
  venueNames: string[];
} {
  return {
    laneIds: [...new Set(ideas.map((idea) => idea.laneId))],
    titles: [...new Set(ideas.map((idea) => idea.title))],
    venueNames: [
      ...new Set(ideas.map((idea) => idea.venueName).filter((name): name is string => !!name)),
    ],
  };
}
