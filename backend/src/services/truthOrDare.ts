/**
 * Truth or Dare - AI-generated prompts with static fallbacks
 */

import { db } from '../database.js';
import { getSharedInterests } from './mulliganMoments.js';

// PG-13 — cool, mature, flirty without being cheesy
const TRUTH_FALLBACKS = [
  "What's the first thing that actually catches your attention about someone?",
  "What's a non-negotiable for you in someone you're into?",
  "What would make you cancel plans to see someone?",
  "What's your idea of a perfect first date — no generic answers.",
  "What's something you find attractive that most people don't mention?",
  "What's the biggest green flag you've noticed in someone you dated?",
  "What would make you take someone seriously from the first conversation?",
  "What's your actual love language, and how do you show it?",
  "What's something you'd only admit to someone you're really into?",
  "What's the best compliment you've gotten that actually stuck with you?",
  "What's your dealbreaker that isn't the usual list?",
  "What would make you want a second date before the first one's over?",
  "What's the most underrated quality in a partner?",
  "What's something you're secretly strict about when it comes to dating?",
  "What would make you stop scrolling and actually reply?",
];

const DARE_FALLBACKS = [
  "Send a voice note saying one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés",
  "Send a selfie with the look you give when you're actually interested",
  "Send a short video (5–10 sec) saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to ask someone out in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Describe your ideal first date in 3 emojis",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them (be specific)",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Send a quick video of your reaction to something that made you laugh today",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break tension on a date",
  "Reply with one green flag you've already noticed about them",
  "Send a 5-second video saying one thing you'd want to do on a first date",
];

// Rated R — bolder, more mature, still app-store safe
const TRUTH_FALLBACKS_R = [
  "What's your biggest turn-on in a conversation — be specific",
  "What actually makes you want to make the first move?",
  "What's your idea of the perfect kiss?",
  "What's the boldest thing you've done to get someone's attention?",
  "What's a dealbreaker for you when it comes to chemistry?",
  "What's something that instantly attracts you that isn't just looks?",
  "What would make you want to kiss someone on a first date?",
  "What's the most attractive thing someone could say to you in person?",
  "What's something you'd never do on a first date — and why?",
  "What's your take on who should make the first move?",
  "What's the most memorable way someone's ever shown they were into you?",
  "What would make you lose your cool on a date?",
  "What's your love language when it comes to physical affection?",
  "What's something you find irresistible that you don't usually admit?",
  "What's the boldest thing you'd say if you knew they were into you?",
];

const DARE_FALLBACKS_R = [
  "Send a voice note saying something you'd say when the tension is high",
  "Send a selfie with the look you give when you're actually into someone",
  "Send a short video (5–10 sec) saying one thing you find attractive about them",
  "Describe what turns you on in 3 words",
  "Reply with the boldest thing you'd say to break tension on a date",
  "Send a selfie from an angle you know works",
  "Voice note: what you'd do if you were on a date with them right now",
  "Reply with a question that would make them actually think",
  "Send a selfie that shows your confidence — no filter needed",
  "Describe your ideal first kiss in 3 emojis",
  "Send a quick video saying what you'd whisper if you were close enough",
  "Reply with 3 words that describe the energy you want between you two",
  "Send a pic with a caption that flirts without being obvious",
  "Pick one thing about them that caught your attention — say it in a voice note OR send a selfie with a caption",
  "Send a selfie that shows off what you're most confident about",
  "Send a 5-second video with a look that says you're into them",
];

// Spicy — boldest, most mature and provocative (app-store safe)
const TRUTH_FALLBACKS_SPICY = [
  "What's your biggest fantasy when it comes to a first date?",
  "What would make you want to skip the small talk and get to the good part?",
  "What's something you'd never admit in person but might say here?",
  "What's the most attractive thing someone could say to you when you're alone?",
  "What's your secret turn-on that you've never told anyone?",
  "What would you do if we had the place to ourselves right now?",
  "What's the most impulsive thing you've ever done when you were into someone?",
  "What's your idea of the perfect night with someone you're really into?",
  "What would make you lose your cool on a date?",
  "What's something you find irresistible that most people overlook?",
  "What's your boldest move when you know the chemistry is mutual?",
  "What would you want me to say to make your heart race?",
  "What's the hottest non-physical thing someone can do on a date?",
  "What's the most memorable way someone's ever made it clear they wanted you?",
  "What would make you break your own rules for someone?",
];

const DARE_FALLBACKS_SPICY = [
  "Send a voice note saying something you'd only say when the tension is high",
  "Send a selfie from an angle that actually makes an impression",
  "Describe what you find attractive about them in 3 bold words",
  "Send a short video saying what you'd want to do with them on a second date",
  "Reply with the boldest thing you'd do if you were alone right now",
  "Voice note: one thing that would make them blush",
  "Send a selfie that shows your most confident side",
  "Reply with a question that would make their heart skip",
  "Send a 5-second video describing the vibe you want between you two",
  "Reply with 3 words that describe the energy you want between you",
  "Send a selfie with the look you give when you're really into someone",
  "Voice note: tell them why you're into them — no generic lines",
  "Send a pic with a caption that's flirty but not try-hard",
  "Send a quick video saying the boldest thing you'd say if you knew they were thinking the same",
  "Voice note: say what you're actually thinking right now",
  "Send a selfie or short video that would make them blush",
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

export async function generateTruthOrDarePrompt(
  type: 'truth' | 'dare',
  matchId: string,
  userId: string,
  spiceLevel: SpiceLevel = 'pg13',
  excludePrompts?: string[] | null
): Promise<{ prompt: string; fromAI: boolean }> {
  const toExclude = (excludePrompts ?? []).filter((p) => p && p.trim().length > 0);
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isR = spiceLevel === 'ratedr';
  const isSpicy = spiceLevel === 'spicy';

  // Prefer OpenAI every time when key is set (unbounded variety). Fallback only when key is missing or API fails.
  if (!openaiApiKey) {
    const list = type === 'truth'
      ? (isSpicy ? TRUTH_FALLBACKS_SPICY : isR ? TRUTH_FALLBACKS_R : TRUTH_FALLBACKS)
      : (isSpicy ? DARE_FALLBACKS_SPICY : isR ? DARE_FALLBACKS_R : DARE_FALLBACKS);
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

    const pg13Truth = 'a cool, mature question about attraction, dating, or chemistry. Specific and real — not generic or cheesy. Think: what actually catches their attention, green flags, dealbreakers, what they\'d only admit to someone they\'re into. Tasteful PG-13. No corny or cringe phrasing.';
    const pg13Dare = 'a confident, slightly flirty challenge they can do in chat. BALANCE: rotate between voice note, photo/selfie, and short video dares — do not default to voice notes. Mix it up: some dares ask for a selfie or pic, some for a voice note, some for a quick video. Doable via text/voice/photo/video. Do NOT use travel, vacation, "where you are", or location. Tone: cool and mature — NO puns, NO wordplay, NO corny lines.';

    const rTruth = 'a bolder, more suggestive question about physical attraction, chemistry, kissing, turn-ons, or what they find irresistible. Specific and mature — not generic. Still tasteful and app-store safe. Rated R = bold and flirty, never corny.';
    const rDare = 'a bolder challenge they can complete in chat. BALANCE: rotate between voice note, photo/selfie, and video — do not skew toward voice notes. Suggestive selfies, voice notes with tension, or a short video. Tasteful, no explicit content. Do NOT use travel, vacation, or location. Tone: confident and sexy — never corny or try-hard.';

    const spicyTruth = 'the boldest question: fantasies, secret turn-ons, what would make them lose their cool, what they\'d never admit in person. Push boundaries, make them blush. Tasteful and app-store safe — NO explicit sexual content. Mature and specific, never cheesy.';
    const spicyDare = 'the boldest challenge for chat. BALANCE: mix voice notes, selfies/photos, and short videos — do not default to voice notes. Suggestive voice note, confident selfie, or bold short video. Make them blush. Tasteful, no explicit content. Do NOT use travel or location. Tone: bold and hot — never corny or try-hard.';

    const typeInstruction = type === 'truth'
      ? (isSpicy ? spicyTruth : isR ? rTruth : pg13Truth)
      : (isSpicy ? spicyDare : isR ? rDare : pg13Dare);

    const spiceLabel = isSpicy ? 'Spicy' : isR ? 'Rated R' : 'PG-13';
    const systemSpice = isSpicy
      ? `SPICE LEVEL: Spicy — the BOLDEST level. Provocative, suggestive, make them blush. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : isR
      ? `SPICE LEVEL: Rated R — bolder, more suggestive. Physical attraction, chemistry, turn-ons. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : `SPICE LEVEL: PG-13 — flirty, romantic undertones. Never crude or invasive.`;

    const noTravelNote = type === 'dare'
      ? '\n- Do NOT use travel, vacation, "where you are", scenic views, or location. Users are often at home. Keep dares doable from wherever they are.'
      : '';

    const toneNote = '\n- TONE: Cool and hip — current, Gen Z/millennial-friendly language. Write for adults. NO corny wordplay, NO puns, NO cringe or try-hard humor, NO generic dating clichés. Confident, specific, and flirty — never cheesy or childish.\n- WORD CHOICE: Use clear, everyday words. NEVER use vague or old-fashioned words like "sultry", "smoldering", "sultry selfie", "bedroom eyes". Prefer clear phrasing everyone gets: e.g. "flirty selfie", "confident selfie", "selfie that shows you\'re into them", "look that says you\'re interested".';

    const systemPrompt = `You generate ${type} prompts for a dating app's "Truth or Dare" game. ${systemSpice}

- Concise: one sentence, under 100 characters.
- Specific to ${type}: ${typeInstruction}${noTravelNote}${toneNote}
- Output ONLY the prompt text, nothing else. No quotes, no numbering, no explanation.`;

    const spiceHint = isSpicy
      ? 'Bold and provocative — fantasies, turn-ons, steamy energy. Make them blush. Mature and specific, never corny.'
      : isR
      ? 'Bolder and more suggestive — tasteful and app-store safe. Cool, not cheesy.'
      : 'Cool and flirty, spark chemistry. Specific and mature — no generic or corny lines.';

    const excludeHint = toExclude.length > 0
      ? `\n\nIMPORTANT: Do NOT use any of these prompts (already shown this game): ${toExclude.map((p) => `"${p}"`).join(', ')}. Generate a different one.`
      : '';

    const userPrompt = `Generate one unique ${typeLabel} prompt for two people playing on a dating app.${interestsContext}

Spice level: ${spiceLabel}. ${spiceHint}

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
    const list = type === 'truth'
      ? (isSpicy ? TRUTH_FALLBACKS_SPICY : isR ? TRUTH_FALLBACKS_R : TRUTH_FALLBACKS)
      : (isSpicy ? DARE_FALLBACKS_SPICY : isR ? DARE_FALLBACKS_R : DARE_FALLBACKS);
    return { prompt: pickRandomExcluding(list, toExclude), fromAI: false };
  }
}
