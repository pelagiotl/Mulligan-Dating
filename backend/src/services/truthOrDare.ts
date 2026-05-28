/**
 * Truth or Dare — how prompts are produced
 *
 * 1) Primary (when OPENAI_API_KEY is set): each prompt is generated fresh by the
 *    model (high temperature). Variety is effectively unbounded — not random picks
 *    from a finite DB. Per match, `used_prompts` excludes prior lines so repeats
 *    are rare. Each request also gets a random "creative angle" nudge for diversity.
 *
 * 2) Fallback (no key or API error): random choice from merged static pools — core
 *    arrays plus `truthOrDareExtraPools.ts` — still excluding `used_prompts`.
 */

import { db } from '../database.js';
import { getSharedInterests } from './mulliganMoments.js';
import { randomCreativeAngle } from './truthOrDareAngles.js';
import {
  EXTRA_DARES_PG,
  EXTRA_DARES_R,
  EXTRA_DARES_SPICY,
  EXTRA_TRUTHS_PG,
  EXTRA_TRUTHS_R,
  EXTRA_TRUTHS_SPICY,
} from './truthOrDareExtraPools.js';
import {
  filterBannedGamePrompts,
  GAME_PROMPT_HARD_BANS,
  GAME_PROMPT_INTERESTS_RULE,
  GAME_PROMPT_MATURE_TONE,
  GAME_PROMPT_SPICY_ADULT,
  GAME_PROMPT_SPICY_CLICHE_AVOID,
  hasBannedGamePromptTheme,
} from './gamePromptGuards.js';
import { isPromptAlreadyUsed, normalizeGamePrompt } from './gamePromptHistory.js';

// PG-13: grown-up dating energy — flirty, direct, never teen-party cute.
const TRUTH_FALLBACKS = [
  "What's the one thing that would make you actually stop scrolling?",
  "What's your non-negotiable when you're really into someone?",
  "What's the boldest thing you've ever said to someone you wanted?",
  "What would make you break your own rules for someone?",
  "What's the first thing you notice when you're attracted — and you can't say eyes?",
  "What's your idea of a perfect first date when you're both fully present?",
  "What's something you'd only admit to someone you're actually into?",
  "What's the best compliment you've gotten that actually made you feel something?",
  "What's your dealbreaker that nobody talks about?",
  "What would make you cancel other plans just to see them?",
  "What's the most underrated green flag in someone?",
  "What's something you find attractive that most people don't mention?",
  "What would make you want a second date before the first one's even over?",
  "What's your love language when it comes to showing you're into someone?",
  "What's the line you'd use to ask someone out in person — no filter?",
  "How do you tell the difference between chemistry and just liking the idea of someone?",
  "When do you know you're catching feelings versus keeping it casual?",
  "What's something people consistently misread about you from your profile or photos?",
  "What's your tell that you're nervous on a date — even when you're playing it cool?",
  "What would make you trust someone faster than you usually do?",
];

const DARE_FALLBACKS = [
  "Send a voice note: one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés allowed",
  "Send a selfie with the look you give when you're actually interested",
  "Send a 5–10 sec video saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to shoot your shot in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them — be specific",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break the tension on a date",
  "Reply with one green flag you've already noticed about them",
  "Voice note: one standard you hold people to on dates that isn't in your bio",
  "Send a selfie that matches how you feel after a conversation that actually went somewhere",
  "Reply with the honest reason you're still on the apps — one sentence",
  "Send a 5-second video: nod once if you'd rather skip small talk and go straight to real talk",
];


function pickRandom<T>(arr: T[], exclude?: T): T {
  const filtered = exclude && arr.length > 1 ? arr.filter((x) => x !== exclude) : arr;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function normalizePrompt(s: string): string {
  return normalizeGamePrompt(s);
}

function pickRandomExcluding(list: string[], excludePrompts: string[]): string {
  if (excludePrompts.length === 0) return list[Math.floor(Math.random() * list.length)];
  const set = new Set(excludePrompts.map(normalizePrompt));
  const filtered = list.filter((p) => !set.has(normalizePrompt(p)));
  if (filtered.length === 0) return list[Math.floor(Math.random() * list.length)];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export type SpiceLevel = 'pg13' | 'ratedr' | 'spicy';

/** Max "Another one" prompt rerolls per user per Truth or Dare game session. */
export const TRUTH_OR_DARE_MAX_ANOTHER_ONE = 3;

export function truthOrDareAnotherOneStatus(
  game: { user1_another_one_count?: number | null; user2_another_one_count?: number | null } | null | undefined,
  userId: string,
  match: { user1_id: string; user2_id: string }
): { anotherOneUsed: number; anotherOneRemaining: number; anotherOneMax: number } {
  const isUser1 = match.user1_id === userId;
  const raw = Number(isUser1 ? game?.user1_another_one_count : game?.user2_another_one_count) || 0;
  const used = Math.min(TRUTH_OR_DARE_MAX_ANOTHER_ONE, Math.max(0, raw));
  return {
    anotherOneUsed: used,
    anotherOneRemaining: Math.max(0, TRUTH_OR_DARE_MAX_ANOTHER_ONE - used),
    anotherOneMax: TRUTH_OR_DARE_MAX_ANOTHER_ONE,
  };
}

/** Each user picks a max heat; prompts use the more conservative of the two. */
export function moreConservativeSpice(a: SpiceLevel, b: SpiceLevel): SpiceLevel {
  const order: Record<SpiceLevel, number> = { pg13: 1, ratedr: 2, spicy: 3 };
  return order[a] <= order[b] ? a : b;
}

export function normalizeSpiceChoice(raw: unknown): SpiceLevel | null {
  if (raw === 'pg13' || raw === 'ratedr' || raw === 'spicy') return raw;
  return null;
}

const TRUTH_FALLBACKS_R: string[] = [
  "What's the wildest thing you've done on a first date?",
  "Have you ever hooked up with someone you barely knew?",
  "What's a fantasy you've never told anyone out loud?",
  "When did you last send a text you regretted the next morning?",
  "What's your biggest turn-on that isn't physical?",
  "Have you ever dated two people at once without them knowing?",
  "What's the boldest move you've made to get someone's attention?",
  "Have you ever caught feelings during something you swore was casual?",
  "What's the grown-up situation you stayed in too long because the chemistry was unfair?",
  "What's something you'd only confess after you've already kissed them?",
  "When did you last pretend you weren't as into someone as you were?",
  "What's your honest line between flirting and leading someone on?",
];

const TRUTH_FALLBACKS_SPICY: string[] = [
  "What's the fastest you've ever gone from match to hookup?",
  "Describe your ideal 'no strings' night in one sentence.",
  "What's something you'd try with the right person that you'd never post about?",
  "Have you ever slept with someone on the first date?",
  "What's the riskiest photo you've ever sent a crush?",
  "What kind of text from a match actually makes you weak?",
  "What's a kink or dynamic you've only admitted after a few drinks?",
  "Have you ever kept hooking up with someone you knew was bad for you — why?",
  "What's your honest take: sexting before you meet — yes, no, or only if the vibe is insane?",
  "What's the most shameless thing you've done to keep someone's attention?",
  "When did you last lie about what you wanted — to seem cooler or less interested?",
  "What's a boundary you say you have that you've broken for the right person?",
  "Describe the last time chemistry hit you like a truck — no names, just the feeling.",
  "What's something about your body or presence you wish more people noticed?",
  "Have you ever wanted someone more because they were a little unavailable?",
  "What's your move when you want to escalate from flirty chat to something real?",
  "What's a fantasy that's stayed in your head because you've never found the right person?",
  "What's the hottest non-physical thing someone can do in conversation?",
  "Have you ever replayed a voice note or clip from a match more than you should admit?",
  "What would make you break your 'I don't do that on apps' rule?",
];

const DARE_FALLBACKS_R: string[] = [
  "Send a voice note describing your type in a way you'd never put in your profile",
  "Send a selfie that shows your 'after midnight' energy",
  "Reply with the most flirtatious emoji combo you can without using words",
  "Send a 5-sec video: one thing you'd do if we met tonight and the vibe was right",
  "Voice note: one thing you find physically irresistible about them",
  "Text three words you'd whisper if you were sitting way too close right now",
  "Send a selfie where your expression says 'I dare you' without saying it",
  "Voice note: the last thing that actually turned you on from a message — keep it tasteful",
  "Voice note: one thing that would make you veto a second date — no names, just the standard",
  "Send a 6-sec video: hold eye contact with the camera like you're deciding whether to text first",
  "Type the kind of message that would make you reply at 1 a.m. — still respectful",
  "Voice note: admit whether you're a slow-burn or a fast-flame person — one sentence",
];

const DARE_FALLBACKS_SPICY: string[] = [
  "Send a voice note with one line you'd use to get them alone after the date",
  "Send a selfie from bed with a one-word caption (keep it PG enough for chat)",
  "Reply with the boldest compliment you'd give if you weren't worried about sounding thirsty",
  "Send a 5-sec video: your reaction if they leaned in for a kiss right now",
  "Voice note: describe what you'd do with your hands if they were here — one sentence, no graphic detail",
  "Send a selfie that shows collarbone or shoulder — confident, not explicit — with a flirty caption",
  "Type a message you'd only send after 2 a.m. — still respectful, still adult",
  "Send a 6-sec video: slow blink + half-smile, like you're deciding whether to make a move",
  "Voice note: one thing you want to know about their mouth (tone only — keep it classy)",
  "Reply with a dare back: one thing you want them to send you next round",
  "Send a selfie in low light that feels like a 'you up?' text in photo form",
  "Voice note: narrate what you're wearing in a way that sounds like a trailer, not a catalog",
  "Text the kind of emoji sequence that would make them screenshot the chat",
  "Send a 5-sec video: touch your jawline or neck once, like you're thinking about them",
  "Voice note: admit one thing you'd let them get away with on a first hang",
  "Reply with two truths and a lie about your attraction style — they'll guess which is the lie",
  "Send a selfie where only your eyes are obvious — let the tension do the talking",
  "Voice note: one boundary you'd bend if the chemistry was undeniable",
  "Type the first move you'd make if they were on your couch right now — PG-13 wording only",
  "Send a 5-sec video: lip bite or lip press (subtle) then look at the camera like you're not sorry",
];

function truthFallbacksForLevel(level: SpiceLevel): string[] {
  const pg = filterBannedGamePrompts([...TRUTH_FALLBACKS, ...EXTRA_TRUTHS_PG]);
  const r = filterBannedGamePrompts([...TRUTH_FALLBACKS_R, ...EXTRA_TRUTHS_R]);
  const s = filterBannedGamePrompts([...TRUTH_FALLBACKS_SPICY, ...EXTRA_TRUTHS_SPICY]);
  if (level === 'spicy') return [...pg, ...r, ...s];
  if (level === 'ratedr') return [...pg, ...r];
  return pg;
}

function dareFallbacksForLevel(level: SpiceLevel): string[] {
  const pg = filterBannedGamePrompts([...DARE_FALLBACKS, ...EXTRA_DARES_PG]);
  const r = filterBannedGamePrompts([...DARE_FALLBACKS_R, ...EXTRA_DARES_R]);
  const s = filterBannedGamePrompts([...DARE_FALLBACKS_SPICY, ...EXTRA_DARES_SPICY]);
  if (level === 'spicy') return [...pg, ...r, ...s];
  if (level === 'ratedr') return [...pg, ...r];
  return pg;
}

export async function generateTruthOrDarePrompt(
  type: 'truth' | 'dare',
  matchId: string,
  userId: string,
  spiceLevel: SpiceLevel = 'pg13',
  excludePrompts?: string[] | null
): Promise<{ prompt: string; fromAI: boolean }> {
  const toExclude = (excludePrompts ?? []).filter((p) => p && p.trim().length > 0);
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // Prefer OpenAI every time when key is set (unbounded variety). Fallback only when key is missing or API fails.
  if (!openaiApiKey) {
    const list = type === 'truth' ? truthFallbacksForLevel(spiceLevel) : dareFallbacksForLevel(spiceLevel);
    return { prompt: pickRandomExcluding(list, toExclude), fromAI: false };
  }

  try {
    // Get match participants for context
    const matchResult = db
      .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?')
      .get([matchId]);
    const match = (matchResult instanceof Promise
      ? await matchResult
      : matchResult) as { user1_id: string; user2_id: string } | undefined;

    let sharedInterests: string[] = [];
    if (match) {
      sharedInterests = await getSharedInterests(matchId, match.user1_id, match.user2_id);
    }

    const interestsContext = sharedInterests.length > 0
      ? ` Shared interests (background only): ${sharedInterests.slice(0, 5).join(', ')}. ${GAME_PROMPT_INTERESTS_RULE}`
      : '';

    const typeLabel = type === 'truth' ? 'Truth' : 'Dare';

    const spiceBlock =
      spiceLevel === 'pg13'
        ? `SPICE: PG-13 — for adults: confident, emotionally intelligent flirting. Dating-app safe: no explicit sexual acts, no graphic body descriptions, no coercion. Mature, cool vocabulary; never sound like a schoolyard game or icebreaker workshop.`
        : spiceLevel === 'ratedr'
          ? `SPICE: Rated R — mature audience: sexual tension, past hookups, innuendo, jealousy, and real attraction are fair game. Confident and suggestive — like two adults at a bar after midnight. Still no graphic porn, no minors, no non-consent. Chat-only actions (text, voice, selfie, short video).`
          : `SPICE: Spicy — maximum heat for consenting adults on a dating app. Steamy, seductive, sexually charged tension: desire, anticipation, jealousy, power, late-night honesty, boundaries tested (consensually). Sound like adults flirting in private, not a party game. ${GAME_PROMPT_SPICY_ADULT} Dares stay doable in chat (voice, selfie, short clip, text); never require nudity or explicit acts on camera.`;

    const typeInstruction = type === 'truth'
      ? spiceLevel === 'pg13'
        ? 'a mature question about attraction, standards, emotional honesty, dating patterns, or chemistry — specific and self-aware, never cutesy or juvenile.'
        : spiceLevel === 'ratedr'
          ? 'a truth about hookups, tension, turn-ons, jealousy, boundaries, or bold dating stories — consensual, respectful, adult; no graphic porn.'
          : 'a provocative truth about desire, seduction, jealousy, power, restraint, sexting-adjacent honesty, or bold adult experiences — specific and vivid, never graphic porn, always consensual. Make it feel like a private confession between two people who are already attracted — not a generic hookup checklist.'
      : spiceLevel === 'pg13'
        ? 'a confident dare they can do in chat from home. Mix voice, selfie, and short video. No travel, vacation, or location-based stunts.'
        : spiceLevel === 'ratedr'
          ? 'a bolder in-chat dare: flirty selfie, suggestive voice note, or teasing short video. No nudity required, no explicit sexual acts on camera — adult tension, not shock value.'
          : 'a spicy dare they can complete in chat: voice, selfie, or short video — confident, seductive, sexually charged but not pornographic. Lean into "we are alone in the same room" energy: implication, tone, anticipation, a bold compliment, a restrained gesture — never a public stunt or generic party dare.';

    const noTravelNote = type === 'dare'
      ? '\n- Do NOT use travel, vacation, "where you are", scenic views, or location. Users are often at home. Keep dares doable from wherever they are.'
      : '';

    const noBanalEventsNote =
      spiceLevel === 'spicy' || spiceLevel === 'ratedr'
        ? "\n- NEVER center prompts on: sports, games, teams, concerts, festivals, playlists, music scenes, travel, trips, vacations, hobbies-as-activities, or 'go do X in public'. Keep everything about the two people, chemistry, chat, voice, selfies, short clips, tension, desire — not events or outings."
        : "\n- Avoid sports, concerts, festivals, playlists, music, travel, and trips as the main hook; center the two people, chemistry, and chat — not outings or events.";

    const spicyToneExtra =
      spiceLevel === 'spicy' ? `\n- ${GAME_PROMPT_SPICY_CLICHE_AVOID}` : '';

    const toneNote =
      `\n- ${GAME_PROMPT_MATURE_TONE}${spicyToneExtra}\n- NO corny wordplay, NO puns, NO cringe or try-hard humor, NO generic dating clichés. Confident, specific, flirty with edge.\n- WORD CHOICE: Use clear, everyday words. NEVER use vague or old-fashioned words like "sultry", "smoldering", "bedroom eyes". Prefer: "flirty selfie", "confident selfie", "look that says you're interested".`;

    const lengthNote =
      spiceLevel === 'spicy'
        ? '\n- LENGTH: One sentence, punchy. Aim under 160 characters; hard max 190.'
        : '\n- LENGTH: One sentence, aim under 130 characters; hard max 180.';

    const systemPrompt = `You generate ${type} prompts for a dating app's "Truth or Dare" game for adults.

${spiceBlock}
${lengthNote}
${GAME_PROMPT_HARD_BANS}
- Specific to ${type}: ${typeInstruction}${noTravelNote}${noBanalEventsNote}${toneNote}
- Generate something FRESH and varied each time — we rely on you for unlimited variety, not a fixed list.
- Output ONLY the prompt text, nothing else. No quotes, no numbering, no explanation.`;

    const excludeHint = toExclude.length > 0
      ? `\n\nIMPORTANT: Do NOT use any of these prompts (already shown this game): ${toExclude.map((p) => `"${p}"`).join(', ')}. Generate a different one.`
      : '';

    const interestsNote = sharedInterests.length > 0 ? ` ${GAME_PROMPT_INTERESTS_RULE}` : '';

    const varietyLine =
      spiceLevel === 'spicy'
        ? 'Prioritize sexual tension, seduction, power, restraint, jealousy, confession, and chat-native actions — never music, travel, concerts, or hobby-as-activity prompts. Do NOT repeat common hookup clichés.'
        : spiceLevel === 'ratedr'
          ? 'Prioritize adult dating tension, stories, and in-chat actions — never events, outings, playlists, travel, or hobby tourism.'
          : 'Prioritize mature chemistry, standards, and emotional honesty — confident adults, not party games or hobby prompts.';

    const creativeAngle = randomCreativeAngle(type, spiceLevel);

    const userPrompt = `Generate one unique ${typeLabel} prompt for two people playing on a dating app.${interestsContext}${interestsNote}

Heat level for this round: ${spiceLevel.toUpperCase()}.

VARIETY: Be creative and unexpected — we want a plethora of different prompts, not the same angles. Surprise them. ${varietyLine}

Creative angle for this round (do not quote this phrase verbatim; let it steer topic and format): ${creativeAngle}

Requirements: ${typeInstruction}${excludeHint}

Return ONLY the prompt:`;

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 1.0,
      max_tokens: 120,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 5 && content.length < 200) {
      // Basic sanity check - ensure it's not an error message
      const badStarts = ['I ', 'Sorry', 'I\'m', 'I cannot', 'As an AI', 'Here\'s', 'Sure,'];
      const isBad = badStarts.some((s) => content.startsWith(s));
      const cleaned = content.replace(/^["']|["']$/g, '');
      const normalizedCleaned = normalizePrompt(cleaned);
      const isDuplicate = toExclude.some((p) => normalizePrompt(p) === normalizedCleaned);
      const isBannedTheme = hasBannedGamePromptTheme(cleaned);
      if (!isBad && !isDuplicate && !isBannedTheme) {
        return { prompt: cleaned, fromAI: true };
      }
      if (isDuplicate || isBannedTheme) {
        throw new Error(isBannedTheme ? 'AI returned banned theme' : 'AI returned duplicate prompt');
      }
    }

    throw new Error('Invalid AI response');
  } catch (error) {
    console.warn('Truth or Dare AI generation failed, using fallback:', error);
    const list = type === 'truth' ? truthFallbacksForLevel(spiceLevel) : dareFallbacksForLevel(spiceLevel);
    return { prompt: pickRandomExcluding(list, toExclude), fromAI: false };
  }
}

const TRUTH_OR_DARE_DISTINCT_MAX_ATTEMPTS = 8;

/**
 * Generate a prompt guaranteed unique within this match session (shared by both players).
 * Retries AI/fallback until the line is not in excludePrompts.
 */
export async function generateDistinctTruthOrDarePrompt(
  type: 'truth' | 'dare',
  matchId: string,
  userId: string,
  spiceLevel: SpiceLevel = 'pg13',
  excludePrompts: string[] = [],
): Promise<{ prompt: string; fromAI: boolean }> {
  let exclude = excludePrompts.filter((p) => p && p.trim().length > 0);
  let lastResult: { prompt: string; fromAI: boolean } | null = null;

  for (let attempt = 0; attempt < TRUTH_OR_DARE_DISTINCT_MAX_ATTEMPTS; attempt++) {
    const result = await generateTruthOrDarePrompt(type, matchId, userId, spiceLevel, exclude);
    lastResult = result;
    if (!isPromptAlreadyUsed(result.prompt, exclude)) {
      return result;
    }
    exclude = [...exclude, result.prompt.trim()];
  }

  const list = type === 'truth' ? truthFallbacksForLevel(spiceLevel) : dareFallbacksForLevel(spiceLevel);
  const fallback = pickRandomExcluding(list, exclude);
  if (!isPromptAlreadyUsed(fallback, exclude)) {
    return { prompt: fallback, fromAI: false };
  }

  return lastResult ?? { prompt: pickRandomExcluding(list, []), fromAI: false };
}
