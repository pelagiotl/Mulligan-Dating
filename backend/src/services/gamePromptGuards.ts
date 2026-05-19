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

/** OpenAI system prompt for Mulligan Moment conversation starters. */
export const MULLIGAN_MOMENT_SYSTEM_PROMPT = `You write ONE short first-person ("I" / "me") chat opener for adults on a dating app. Max 220 characters.

${GAME_PROMPT_MATURE_TONE}

${GAME_PROMPT_INTERESTS_RULE}

${GAME_PROMPT_HARD_BANS}

STYLE: Confident, specific, a little bold — like texting someone you're actually into. Flirty tension is fine; crude or explicit sexual content is not. No puns, no "hey beautiful", no hashtags, no emojis, no exclamation spam, no "icebreaker" energy.

Output ONLY the message text — nothing else.`;

const MULLIGAN_MOMENT_FALLBACKS_GENERIC = [
  "Calling a Mulligan on the dead chat — what's something you've been low-key wanting to say out loud?",
  "We matched for a reason. What's the one thing about you that doesn't show up on a profile?",
  "I'm not doing another round of polite small talk — what's been on your mind lately?",
  "Real question: what kind of connection are you actually hoping this turns into?",
  "Something tells me we'd argue well about the right things — what's your most honest hot take?",
];

const MULLIGAN_MOMENT_FALLBACKS_WITH_INTEREST = [
  (topic: string) =>
    `We both clock ${topic} — what's the version of that you care about that most people miss?`,
  (topic: string) =>
    `Okay, ${topic} is on both our profiles. What's your unfiltered opinion that would start a fun argument?`,
  (topic: string) =>
    `I noticed we're both into ${topic}. What's the part of that you'd want a match to actually get?`,
];

export function pickMulliganMomentFallback(shared: string[]): string {
  if (shared.length > 0) {
    const topic = shared[0];
    const options = MULLIGAN_MOMENT_FALLBACKS_WITH_INTEREST.map((fn) => fn(topic));
    const filtered = filterBannedGamePrompts(options);
    return filtered[Math.floor(Math.random() * filtered.length)] ?? options[0]!;
  }
  const filtered = filterBannedGamePrompts([...MULLIGAN_MOMENT_FALLBACKS_GENERIC]);
  const pool = filtered.length > 0 ? filtered : MULLIGAN_MOMENT_FALLBACKS_GENERIC;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function sanitizeMulliganMomentStarter(text: string): string | null {
  const trimmed = text.trim().replace(/^["']|["']$/g, '');
  if (trimmed.length < 8 || trimmed.length > 400) return null;
  if (hasBannedGamePromptTheme(trimmed)) return null;
  const cheesy =
    /\b(hey there|hey beautiful|how's your day|wyd|lol\b|haha|icebreaker|pickup line|soulmate|sparks fly|butterflies)\b/i;
  if (cheesy.test(trimmed)) return null;
  return trimmed;
}
