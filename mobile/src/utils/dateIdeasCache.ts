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
