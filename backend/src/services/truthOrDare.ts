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
  "Send a voice note saying something you'd normally only say in person",
  "Describe your ideal partner in exactly 3 words",
  "Send a selfie with your best 'I'm into you' look",
  "Send a voice note saying 'I have a crush on you' in a funny accent",
  "Describe your ideal first date in 3 emojis",
  "Send a pic of your current view and rate it as a date spot 1-10",
  "Reply with the cheesiest pick-up line you'd actually use",
  "Send a selfie making a silly face — bonus points if it's flirty",
  "Describe what you find attractive in someone using only emojis",
  "Send a voice note singing the chorus of a song that describes your mood",
  "Reply with 3 words that describe your vibe on a good date",
  "Send a pic of your pet (or pet plant!) and say they're your wingman",
  "Pick an emoji that represents your dating energy and explain why",
  "Reply with a question you've always wanted to ask me",
  "Send a selfie with your best smile — make us melt",
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
  "Send a voice note saying something flirty you'd whisper on a date",
  "Send a selfie with your best 'come here' look",
  "Describe what you find physically attractive in 3 words",
  "Send a voice note saying you're attracted to them (keep it classy)",
  "Describe your ideal first kiss in 3 emojis",
  "Send a pic of your lips with a flirty caption",
  "Reply with the boldest thing you'd say to break the tension on a date",
  "Send a selfie from a flattering angle — make them look twice",
  "Describe your type using only suggestive emojis",
  "Send a voice note with your best 'smooth operator' impression",
  "Reply with 3 words that describe your romantic energy",
  "Send a selfie with your most captivating look",
  "Pick an emoji that represents your flirty side and explain",
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
  "Send a voice note saying something you'd whisper in their ear on a date",
  "Send a selfie from a steamy angle — make them look twice",
  "Describe what you find attractive about them in 3 bold words",
  "Send a voice note with your best 'I want you' energy (keep it classy)",
  "Reply with the boldest thing you'd do if we were alone right now",
  "Send a pic of your lips with a flirty caption",
  "Voice note: say something that would make them blush — tasteful but bold",
  "Send a selfie that shows off your most confident feature",
  "Reply with a question that would make someone's heart skip",
  "Describe your ideal night with them using only emojis",
  "Send a voice note saying what you'd want to do on a second date",
  "Reply with 3 words that describe the vibe you want between us",
  "Send a selfie with your best 'come here' look",
  "Voice note: describe your type in a way that makes it clear you're into them",
  "Send a pic with a caption that flirts without saying it outright",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type SpiceLevel = 'pg13' | 'ratedr' | 'spicy';

export async function generateTruthOrDarePrompt(
  type: 'truth' | 'dare',
  matchId: string,
  userId: string,
  spiceLevel: SpiceLevel = 'pg13'
): Promise<{ prompt: string; fromAI: boolean }> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isR = spiceLevel === 'ratedr';
  const isSpicy = spiceLevel === 'spicy';

  // Fallback when no OpenAI
  if (!openaiApiKey) {
    const list = type === 'truth'
      ? (isSpicy ? TRUTH_FALLBACKS_SPICY : isR ? TRUTH_FALLBACKS_R : TRUTH_FALLBACKS)
      : (isSpicy ? DARE_FALLBACKS_SPICY : isR ? DARE_FALLBACKS_R : DARE_FALLBACKS);
    return { prompt: pickRandom(list), fromAI: false };
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
    const pg13Dare = 'a fun, slightly flirty challenge they can complete in chat (voice note, selfie, emoji). Can hint at romance (e.g. "best smile", "describe your type in 3 words") but stay tasteful. Doable via text/voice/image in a dating app.';

    const rTruth = 'a spicier, more suggestive question about physical attraction, chemistry, kissing, what turns them on, romantic boldness, or physical preferences. Still tasteful and app-store safe — no explicit sexual content. Think: turn-ons, first kiss, making moves, what they find irresistible. Rated R vibe = bold and flirty.';
    const rDare = 'a bolder, more suggestive challenge they can complete in chat. Can be flirtier: suggestive selfies, voice notes with romantic tension, describing physical attraction, etc. Still tasteful — no explicit content. Doable via text/voice/image. Rated R = make them blush.';

    const spicyTruth = 'the boldest, most provocative question — fantasies, secret turn-ons, what would make them lose their cool, impulsive romantic moves, what they\'d never admit in person. Push boundaries. Make them blush. Still tasteful and app-store safe — NO explicit sexual content.';
    const spicyDare = 'the boldest challenge they can complete in chat — suggestive voice notes, steamy selfies, describing attraction boldly, flirty captions. Make them blush. Tasteful but provocative. Doable via text/voice/image. No explicit content.';

    const typeInstruction = type === 'truth'
      ? (isSpicy ? spicyTruth : isR ? rTruth : pg13Truth)
      : (isSpicy ? spicyDare : isR ? rDare : pg13Dare);

    const spiceLabel = isSpicy ? 'Spicy' : isR ? 'Rated R' : 'PG-13';
    const systemSpice = isSpicy
      ? `SPICE LEVEL: Spicy — the BOLDEST level. Provocative, suggestive, make them blush. Fantasies, secret turn-ons, steamy voice notes, bold flirting. Push boundaries. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : isR
      ? `SPICE LEVEL: Rated R — bolder, more suggestive, flirtier. Can touch on physical attraction, chemistry, kissing, turn-ons, romantic boldness. Still tasteful and app-store safe. NEVER explicit sexual content.`
      : `SPICE LEVEL: PG-13 — playfully flirty, romantic undertones. Never crude, sexual, or invasive.`;

    const systemPrompt = `You generate ${type} prompts for a dating app's "Truth or Dare" game. ${systemSpice}

- Concise: one sentence, under 100 characters.
- Specific to ${type}: ${typeInstruction}
- Output ONLY the prompt text, nothing else. No quotes, no numbering, no explanation.`;

    const spiceHint = isSpicy
      ? 'Make it bold and provocative — fantasies, turn-ons, steamy energy. Make them blush. Push boundaries but stay tasteful.'
      : isR
      ? 'Make it bolder and more suggestive — but keep it tasteful and app-store safe.'
      : 'Playfully flirty, spark chemistry without going too far.';

    const userPrompt = `Generate one unique ${typeLabel} prompt for two people playing on a dating app.${interestsContext}

Spice level: ${spiceLabel}. ${spiceHint}

Requirements: ${typeInstruction}

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
      if (!isBad) {
        return { prompt: content.replace(/^["']|["']$/g, ''), fromAI: true };
      }
    }

    throw new Error('Invalid AI response');
  } catch (error) {
    console.warn('Truth or Dare AI generation failed, using fallback:', error);
    const list = type === 'truth'
      ? (isSpicy ? TRUTH_FALLBACKS_SPICY : isR ? TRUTH_FALLBACKS_R : TRUTH_FALLBACKS)
      : (isSpicy ? DARE_FALLBACKS_SPICY : isR ? DARE_FALLBACKS_R : DARE_FALLBACKS);
    return { prompt: pickRandom(list), fromAI: false };
  }
}
