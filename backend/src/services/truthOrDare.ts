/**
 * Truth or Dare - AI-generated prompts with static fallbacks
 */

import { db } from '../database.js';
import { getSharedInterests } from './mulliganMoments.js';

// Slightly spicy but tasteful — flirty, playful, PG-13
const TRUTH_FALLBACKS = [
  "What's the first thing you notice about someone you're attracted to?",
  "What's your love language and how do you show it?",
  "What's something that would make you swipe right immediately?",
  "What's your idea of a perfect first date?",
  "What's the best compliment you've ever received from a crush?",
  "Have you ever had a crush on someone you just met?",
  "What's your go-to move to break the ice on a first date?",
  "What's the most attractive quality in someone's profile?",
  "What's something you'd want a date to do to impress you?",
  "What's your guilty pleasure when it comes to romance?",
  "What's the most romantic thing someone's ever done for you?",
  "What emoji would you use to describe your dating energy?",
  "What's your biggest green flag in a conversation?",
  "What's something you're secretly picky about in dating?",
  "What would make you want to extend a first date into a second?",
];

const DARE_FALLBACKS = [
  "Send a voice note saying something you'd only say when you're really into someone",
  "Describe your type in exactly 3 words",
  "Send a selfie with the look you give when you're attracted to someone",
  "Voice note: say one thing that would make me want to meet you in person",
  "Describe your ideal first date in 3 emojis",
  "Send a pic of what you're doing right now with a one-line vibe check",
  "Reply with the line you'd use to ask someone out in person",
  "Send a selfie — your choice of flirty or silly",
  "Describe what you find attractive in someone using only emojis",
  "Send a voice note: 10 seconds on why you're a good date",
  "Reply with 3 words that describe your vibe on a good date",
  "Send a pic of your pet (or plant) with a caption that says something about you",
  "Pick one emoji that sums up your dating energy and explain in one sentence",
  "Reply with a question you've always wanted to ask a match",
  "Send a selfie with your best smile",
];

// Rated R — spicier, more suggestive (still app-store safe)
const TRUTH_FALLBACKS_R = [
  "What's your biggest turn-on in a conversation?",
  "What's the most attractive physical feature on someone?",
  "Have you ever made the first move? How did it go?",
  "What's something you find irresistible in a date?",
  "What's your idea of the perfect kiss?",
  "What's the boldest thing you've done to get someone's attention?",
  "What's a dealbreaker for you when it comes to chemistry?",
  "What's your love language when it comes to physical affection?",
  "What's something that instantly attracts you to someone?",
  "What's the most romantic thing you've ever done for a crush?",
  "What's your take on making the first move?",
  "What's something you'd never do on a first date?",
  "What's your biggest green flag when it comes to chemistry?",
  "What's the most memorable compliment you've gotten about your looks?",
  "What would make you want to kiss someone on a first date?",
];

const DARE_FALLBACKS_R = [
  "Send a voice note saying something you'd whisper to someone you're into",
  "Send a selfie with your best 'come here' look",
  "Describe what turns you on physically in 3 words",
  "Voice note: tell them one thing you find attractive about them",
  "Describe your ideal first kiss in 3 emojis",
  "Send a pic with a caption that flirts without being explicit",
  "Reply with the boldest thing you'd say to break the tension on a date",
  "Send a selfie from an angle you know works",
  "Describe your type using only emojis",
  "Voice note: say what you'd do if you were on a date with them right now",
  "Reply with 3 words that describe your romantic energy",
  "Send a selfie that shows your confidence",
  "Pick an emoji that represents your flirty side and explain in one line",
  "Reply with a question that would make someone blush",
  "Send a selfie that shows off your favorite feature",
];

// Spicy — boldest level, most provocative (app-store safe, no explicit content)
const TRUTH_FALLBACKS_SPICY = [
  "What's your biggest fantasy when it comes to a first date?",
  "What's the boldest thing you've ever done to get someone's attention?",
  "What would make you want to skip straight to the good part on a date?",
  "What's something you'd never admit in person but might say here?",
  "What's the most attractive thing someone could whisper to you?",
  "What's your secret turn-on that you've never told anyone?",
  "What would you do if we had the place to ourselves right now?",
  "What's the most impulsive romantic thing you've ever done?",
  "What's your idea of the perfect night alone with someone you're into?",
  "What would make you lose your cool on a date?",
  "What's the most memorable way someone's ever flirted with you?",
  "What's something you find irresistible that most people overlook?",
  "What's your boldest move when you know there's chemistry?",
  "What would you want me to say to make your heart race?",
  "What's the hottest non-physical thing someone can do on a date?",
];

const DARE_FALLBACKS_SPICY = [
  "Send a voice note saying something you'd say when the tension is high",
  "Send a selfie from an angle that makes an impression",
  "Describe what you find attractive about them in 3 bold words",
  "Voice note: say what you want to do with them on a second date",
  "Reply with the boldest thing you'd do if we were alone right now",
  "Send a pic with a caption that's flirty but tasteful",
  "Voice note: say one thing that would make them blush",
  "Send a selfie that shows off your most confident side",
  "Reply with a question that would make someone's heart skip",
  "Describe your ideal night with them using only emojis",
  "Voice note: describe the vibe you want between you two",
  "Reply with 3 words that describe the energy you want between us",
  "Send a selfie with your best 'come here' look",
  "Voice note: tell them why you're into them in one sentence",
  "Send a pic with a caption that flirts without saying it outright",
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

    const pg13Truth = 'a playfully flirty question about attraction, dating, romance, or chemistry. Hint at romance without being crude. Think: what they find attractive, love languages, first impressions, green flags, dream dates. Tasteful PG-13 vibe.';
    const pg13Dare = 'a fun, slightly flirty challenge they can complete in chat (voice note, selfie, emoji). Can hint at romance (e.g. "best smile", "describe your type in 3 words") but stay tasteful. Doable via text/voice/image in a dating app. Do NOT mention travel, vacation, "where you are", scenic views, or location. Write for adults: confident and cool, never corny, no puns or wordplay (e.g. no "score on and off the field" or similar).';

    const rTruth = 'a spicier, more suggestive question about physical attraction, chemistry, kissing, what turns them on, romantic boldness, or physical preferences. Still tasteful and app-store safe — no explicit sexual content. Think: turn-ons, first kiss, making moves, what they find irresistible. Rated R vibe = bold and flirty.';
    const rDare = 'a bolder, more suggestive challenge they can complete in chat. Can be flirtier: suggestive selfies, voice notes with romantic tension, describing physical attraction, etc. Still tasteful — no explicit content. Doable via text/voice/image. Rated R = make them blush. Do NOT mention travel, vacation, scenic views, or "where you are". Write for adults: confident, sexy, never corny or punny.';

    const spicyTruth = 'the boldest, most provocative question — fantasies, secret turn-ons, what would make them lose their cool, impulsive romantic moves, what they\'d never admit in person. Push boundaries. Make them blush. Still tasteful and app-store safe — NO explicit sexual content.';
    const spicyDare = 'the boldest challenge they can complete in chat — suggestive voice notes, steamy selfies, describing attraction boldly, flirty captions. Make them blush. Tasteful but provocative. Doable via text/voice/image. No explicit content. Do NOT mention travel, vacation, scenic views, or location. Write for adults: bold and hot, never corny or try-hard.';

    const typeInstruction = type === 'truth'
      ? (isSpicy ? spicyTruth : isR ? rTruth : pg13Truth)
      : (isSpicy ? spicyDare : isR ? rDare : pg13Dare);

    const spiceLabel = isSpicy ? 'Spicy' : isR ? 'Rated R' : 'PG-13';
    const systemSpice = isSpicy
      ? `SPICE LEVEL: Spicy — the BOLDEST level. Provocative, suggestive, make them blush. Fantasies, secret turn-ons, steamy voice notes, bold flirting. Push boundaries. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : isR
      ? `SPICE LEVEL: Rated R — bolder, more suggestive, flirtier. Can touch on physical attraction, chemistry, kissing, turn-ons, romantic boldness. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : `SPICE LEVEL: PG-13 — playfully flirty, romantic undertones. Never crude, sexual, or invasive.`;

    const noTravelNote = type === 'dare'
      ? '\n- Do NOT use travel, vacation, "where you are", scenic views, or location in the background. Users are often at home. Keep dares doable from wherever they are.'
      : '';

    const noCornyNote = type === 'dare'
      ? '\n- Tone: mature adults. NO corny wordplay, NO puns (e.g. never "score on and off the field" or sports double meanings), NO cringe or try-hard humor. Confident, cool, flirty — not cheesy.'
      : '';

    const systemPrompt = `You generate ${type} prompts for a dating app's "Truth or Dare" game. ${systemSpice}

- Concise: one sentence, under 100 characters.
- Specific to ${type}: ${typeInstruction}${noTravelNote}${noCornyNote}
- Output ONLY the prompt text, nothing else. No quotes, no numbering, no explanation.`;

    const spiceHint = isSpicy
      ? 'Make it bold and provocative — fantasies, turn-ons, steamy energy. Make them blush. Push boundaries but stay tasteful.'
      : isR
      ? 'Make it bolder and more suggestive — but keep it tasteful and app-store safe.'
      : 'Playfully flirty, spark chemistry without going too far.';

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
