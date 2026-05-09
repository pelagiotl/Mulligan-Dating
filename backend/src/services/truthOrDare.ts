/**
 * Truth or Dare - OpenAI generates a plethora of unique prompts (unbounded variety).
 * Static arrays below are FALLBACK ONLY when OPENAI_API_KEY is missing or the API fails.
 * With the key set, every prompt is AI-generated for maximum variety.
 */

import { db } from '../database.js';
import { getSharedInterests } from './mulliganMoments.js';

// Single mode: wholesome, adult, and app-store safe.
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
];

const DARE_FALLBACKS = [
  "Send a voice note: one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés allowed",
  "Send a selfie with the look you give when you're actually interested",
  "Send a 5–10 sec video saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to shoot your shot in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Describe your ideal first date in 3 emojis",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them — be specific",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Send a quick video of your reaction to something that made you laugh today",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break the tension on a date",
  "Reply with one green flag you've already noticed about them",
  "Send a 5-second video saying one thing you'd want to do on a first date",
];


function pickRandom<T>(arr: T[], exclude?: T): T {
  const filtered = exclude && arr.length > 1 ? arr.filter((x) => x !== exclude) : arr;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

function normalizePrompt(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function pickRandomExcluding(list: string[], excludePrompts: string[]): string {
  if (excludePrompts.length === 0) return list[Math.floor(Math.random() * list.length)];
  const set = new Set(excludePrompts.map(normalizePrompt));
  const filtered = list.filter((p) => !set.has(normalizePrompt(p)));
  if (filtered.length === 0) return list[Math.floor(Math.random() * list.length)];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export type SpiceLevel = 'pg13' | 'ratedr' | 'spicy';

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
];

const TRUTH_FALLBACKS_SPICY: string[] = [
  "What's the fastest you've ever gone from match to hookup?",
  "Describe your ideal 'no strings' night in one sentence.",
  "What's something you'd try with the right person that you'd never post about?",
  "Have you ever slept with someone on the first date?",
  "What's the riskiest photo you've ever sent a crush?",
];

const DARE_FALLBACKS_R: string[] = [
  "Send a voice note describing your type in a way you'd never put in your profile",
  "Send a selfie that shows your 'after midnight' energy",
  "Reply with the most flirtatious emoji combo you can without using words",
  "Send a 5-sec video: one thing you'd do if we met tonight and the vibe was right",
  "Voice note: one thing you find physically irresistible about them",
];

const DARE_FALLBACKS_SPICY: string[] = [
  "Send a voice note with one line you'd use to get them alone after the date",
  "Send a selfie from bed with a one-word caption (keep it PG enough for chat)",
  "Reply with the boldest compliment you'd give if you weren't worried about sounding thirsty",
  "Send a 5-sec video: your reaction if they leaned in for a kiss right now",
];

function truthFallbacksForLevel(level: SpiceLevel): string[] {
  if (level === 'spicy') return [...TRUTH_FALLBACKS, ...TRUTH_FALLBACKS_R, ...TRUTH_FALLBACKS_SPICY];
  if (level === 'ratedr') return [...TRUTH_FALLBACKS, ...TRUTH_FALLBACKS_R];
  return TRUTH_FALLBACKS;
}

function dareFallbacksForLevel(level: SpiceLevel): string[] {
  if (level === 'spicy') return [...DARE_FALLBACKS, ...DARE_FALLBACKS_R, ...DARE_FALLBACKS_SPICY];
  if (level === 'ratedr') return [...DARE_FALLBACKS, ...DARE_FALLBACKS_R];
  return DARE_FALLBACKS;
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
      ? ` They have shared interests: ${sharedInterests.slice(0, 5).join(', ')}. You may optionally reference these for a more personal prompt.`
      : '';

    const typeLabel = type === 'truth' ? 'Truth' : 'Dare';

    const spiceBlock =
      spiceLevel === 'pg13'
        ? `SPICE: PG-13 — flirty, confident, dating-app safe. No explicit sexual acts, no graphic body descriptions, no coercion. Adults only tone.`
        : spiceLevel === 'ratedr'
          ? `SPICE: Rated R — bolder sexual tension and past experiences allowed (hookups, attraction, innuendo). Still no graphic porn, no minors, no non-consent, no illegal content. Keep prompts doable in chat (text, voice, selfie, short video).`
          : `SPICE: Spicy — maximum heat while staying app-store safe: suggestive, steamy, adult. No graphic explicit acts, no minors, no non-consent. Dares must stay doable in chat (voice, selfie, short clip, text).`;

    const typeInstruction = type === 'truth'
      ? spiceLevel === 'pg13'
        ? 'a wholesome-but-adult question about attraction, dating, or chemistry. Specific, confident, and real — not cheesy or childish.'
        : spiceLevel === 'ratedr'
          ? 'a truth that can touch on past hookups, tension, turn-ons, or bold dating stories — still respectful and consensual.'
          : 'a provocative truth about desire, chemistry, or bold experiences — never graphic porn, always consensual-adult framing.'
      : spiceLevel === 'pg13'
        ? 'a wholesome-but-adult challenge they can do in chat. BALANCE across voice note, selfie/photo, and short video. Do NOT use travel, vacation, or location.'
        : spiceLevel === 'ratedr'
          ? 'a bolder dare (still in chat): flirty selfie, suggestive voice note, or teasing short video. No nudity requirements, no explicit sexual acts on camera.'
          : 'a spicy dare they can complete in chat: voice, selfie, or short video — steamy and confident, not pornographic.';

    const noTravelNote = type === 'dare'
      ? '\n- Do NOT use travel, vacation, "where you are", scenic views, or location. Users are often at home. Keep dares doable from wherever they are.'
      : '';

    const toneNote = '\n- TONE: Cool, badass, and sexy — current, Gen Z/millennial-friendly. Write for adults. NO corny wordplay, NO puns, NO cringe or try-hard humor, NO generic dating clichés. Confident, specific, flirty with edge — never cheesy or childish.\n- WORD CHOICE: Use clear, everyday words. NEVER use vague or old-fashioned words like "sultry", "smoldering", "sultry selfie", "bedroom eyes". Prefer clear phrasing: "flirty selfie", "confident selfie", "selfie that shows you\'re into them", "look that says you\'re interested".';

    const systemPrompt = `You generate ${type} prompts for a dating app's "Truth or Dare" game for adults.

${spiceBlock}
- Concise: one sentence, under 100 characters.
- Specific to ${type}: ${typeInstruction}${noTravelNote}${toneNote}
- Generate something FRESH and varied each time — we rely on you for unlimited variety, not a fixed list.
- Output ONLY the prompt text, nothing else. No quotes, no numbering, no explanation.`;

    const excludeHint = toExclude.length > 0
      ? `\n\nIMPORTANT: Do NOT use any of these prompts (already shown this game): ${toExclude.map((p) => `"${p}"`).join(', ')}. Generate a different one.`
      : '';

    const userPrompt = `Generate one unique ${typeLabel} prompt for two people playing on a dating app.${interestsContext}

Heat level for this round: ${spiceLevel.toUpperCase()}.

VARIETY: Be creative and unexpected — we want a plethora of different prompts, not the same angles. Surprise them.

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
      max_tokens: 100,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 5 && content.length < 200) {
      // Basic sanity check - ensure it's not an error message
      const badStarts = ['I ', 'Sorry', 'I\'m', 'I cannot', 'As an AI', 'Here\'s', 'Sure,'];
      const isBad = badStarts.some((s) => content.startsWith(s));
      const cleaned = content.replace(/^["']|["']$/g, '');
      const normalizedCleaned = normalizePrompt(cleaned);
      const isDuplicate = toExclude.some((p) => normalizePrompt(p) === normalizedCleaned);
      if (!isBad && !isDuplicate) {
        return { prompt: cleaned, fromAI: true };
      }
      if (isDuplicate) {
        throw new Error('AI returned duplicate prompt');
      }
    }

    throw new Error('Invalid AI response');
  } catch (error) {
    console.warn('Truth or Dare AI generation failed, using fallback:', error);
    const list = type === 'truth' ? truthFallbacksForLevel(spiceLevel) : dareFallbacksForLevel(spiceLevel);
    return { prompt: pickRandomExcluding(list, toExclude), fromAI: false };
  }
}
