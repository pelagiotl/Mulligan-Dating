/**
 * Shared guardrails for Truth or Dare and Never Have I Ever prompt generation.
 * Keeps AI and fallback prompts mature, dating-focused, and off music/travel/event tropes.
 */

export const BANNED_GAME_PROMPT_THEME_RE =
  /\b(concert|concerts|festival|festivals|gig|gigs|band|bands|playlist|playlists|spotify|apple music|vinyl|album|albums|karaoke|song|songs|lyrics|chorus|anthem|dj|djs|rave|raves|edm|open mic|music scene|live music|musician|musicians|travel|travels|traveled|travelling|traveling|trip|trips|vacation|vacations|getaway|getaways|airport|airports|flight|flights|road trip|roadtrip|hotel|hotels|resort|resorts|backpack|backpacking|passport|abroad|wanderlust|itinerary|tourist|tourism|cruise|cruises|sports game|game day|stadium|stadiums|music festival|coachella|bonnaroo|lollapalooza|edm festival|roadtrip|sightseeing|tourist trap|hostel|airbnb trip|flight deal|travel vlog|travel blog)\b/i;

export function hasBannedGamePromptTheme(prompt: string | null | undefined): boolean {
  return BANNED_GAME_PROMPT_THEME_RE.test(String(prompt || ''));
}

/** Injected into OpenAI system prompts for both games. */
export const GAME_PROMPT_MATURE_TONE = `TONE: Mature adult dating — sharp, confident, psychologically real. Center on attraction, tension, texting, boundaries, jealousy, chemistry, ego, vulnerability, mixed signals, exes, situationships, and bold honesty. Sound like two adults who actually date — not a teen party game, not a corny icebreaker workshop.`;

/** How shared profile interests may be used (never as the main hook). */
export const GAME_PROMPT_INTERESTS_RULE =
  'Shared interests are background hints ONLY. NEVER build the prompt around music, playlists, concerts, DJs, travel, trips, vacations, sports events, festivals, hobbies-as-activities, or public outings — even if those interests are listed.';

/** Hard topic bans for model output. */
export const GAME_PROMPT_HARD_BANS = `HARD BANS (reject these angles entirely): concerts, festivals, bands, songs, playlists, Spotify/streaming, karaoke, music scenes, travel, trips, vacations, airports, hotels, road trips, sports games, stadiums, tourism, or any "go to a show / go on a trip" prompt.`;

export function filterBannedGamePrompts<T extends string>(prompts: T[]): T[] {
  const filtered = prompts.filter((p) => !hasBannedGamePromptTheme(p));
  return filtered.length > 0 ? filtered : prompts;
}
