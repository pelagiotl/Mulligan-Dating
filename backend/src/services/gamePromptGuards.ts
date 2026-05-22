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

/** Mulligan Moment tone — slightly sharper than generic game prompts. */
export const MULLIGAN_MOMENT_MATURE_TONE = `TONE: Adults who date for real — cool, direct, a little dry. Write like a confident text at midnight: curious, specific, zero workshop energy. Flirty tension is fine; crude or explicit content is not.`;

/** OpenAI system prompt for Mulligan Moment conversation starters. */
export const MULLIGAN_MOMENT_SYSTEM_PROMPT = `You write ONE short first-person ("I" / "me") chat opener for adults on a dating app. Max 200 characters.

${MULLIGAN_MOMENT_MATURE_TONE}

${GAME_PROMPT_INTERESTS_RULE}

${GAME_PROMPT_HARD_BANS}

STYLE:
- Understated and specific — one clear question or observation, not a speech.
- Slightly bold or provocative is good; try-hard "spicy" or performative wit is not.
- NEVER mention Mulligan, icebreakers, dead chats, "we matched for a reason", vibes, sparks, or dating-app clichés.
- No puns, no "hey beautiful/stranger", no hashtags, no emojis, no exclamation spam, no "real question:" / "hot take:" prefixes.

Output ONLY the message text — nothing else.`;

const MULLIGAN_MOMENT_FALLBACKS_GENERIC = [
  "I'm skipping the highlight reel — what would you need to feel like this could actually go somewhere?",
  "You seem like you have opinions. What's one thing you're deliberately not putting on your profile?",
  "I'll go first with honesty: I care more about how someone texts than how they photograph. How do you come across when you're into someone?",
  "What kind of pace are you actually looking for right now — slow burn or you know fast?",
  "Curious what you're screening for that you won't say out loud on a first message.",
];

const MULLIGAN_MOMENT_FALLBACKS_WITH_INTEREST = [
  (topic: string) =>
    `Both profiles mention ${topic} — what's your actual take, not the polished version?`,
  (topic: string) =>
    `We're into ${topic}. What's the opinion you'd only drop once you decided you might like someone?`,
  (topic: string) =>
    `Saw ${topic} on both sides — what's the part of that you'd want someone to get without you having to explain it?`,
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
    /\b(hey there|hey beautiful|hey stranger|how's your day|wyd|lol\b|haha|icebreaker|pickup line|soulmate|sparks fly|butterflies|mulligan moment|calling a mulligan|dead chat|we matched for a reason|low-key wanting|polite small talk|something tells me|real question:|hot take:|fun argument|good vibes|your vibes)\b/i;
  if (cheesy.test(trimmed)) return null;
  return trimmed;
}
