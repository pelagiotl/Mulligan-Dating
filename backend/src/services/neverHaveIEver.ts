/**
 * Never Have I Ever - OpenAI generates a wide variety of unique prompts.
 * Static FALLBACK_PROMPTS are used ONLY when OPENAI_API_KEY is missing or the API fails.
 * With the key set, every prompt is AI-generated for maximum variety.
 * First to 10 strikes loses. "I have" = strike.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';

/** Debug logging for NHIE round/prompt flow. Set DEBUG_NHIE=1 for extra verbose (e.g. raw answer values). */
const NHIE_DEBUG = process.env.DEBUG_NHIE === '1' || process.env.DEBUG_NHIE === 'true';
function nhieLog(message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test' && !NHIE_DEBUG) return;
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[NHIE] ${message}${payload}`);
}
import { getSharedInterests } from './mulliganMoments.js';
import {
  filterBannedGamePrompts,
  GAME_PROMPT_HARD_BANS,
  GAME_PROMPT_INTERESTS_RULE,
  GAME_PROMPT_MATURE_TONE,
  GAME_PROMPT_SPICY_ADULT,
  GAME_PROMPT_SPICY_CLICHE_AVOID,
  hasBannedGamePromptTheme,
} from './gamePromptGuards.js';
import {
  appendUsedPrompt,
  buildExcludePromptList,
  isPromptAlreadyUsed,
  normalizeGamePrompt,
  parseUsedPromptsJson,
} from './gamePromptHistory.js';

const STRIKES_TO_LOSE = 10;

/** If either player has not touched NHIE in this long, the session restarts (web + mobile poll GET). */
export const NHIE_INACTIVITY_RESET_MS = 5 * 60 * 1000;

export type SpiceLevel = 'pg13' | 'ratedr' | 'spicy';

/** Use the more conservative of the two choices for prompt generation (no one is pushed past their comfort level). */
function moreConservative(a: SpiceLevel, b: SpiceLevel): SpiceLevel {
  const order: Record<SpiceLevel, number> = { pg13: 1, ratedr: 2, spicy: 3 };
  return order[a] <= order[b] ? a : b;
}

const FALLBACK_PROMPTS = [
  'kissed on a first date',
  'gone on a blind date',
  'stayed friends with an ex',
  'fallen for someone\'s smile before their personality',
  'sent a risky text and regretted it',
  'ghosted someone',
  'been ghosted',
  'had a crush on a coworker',
  'dated someone my friends didn\'t like',
  'reconnected with an ex',
  'lied about my age on a dating app',
  'swiped right on everyone',
  'gone back to someone I said I wouldn\'t',
  'had feelings for a friend',
  'made the first move',
  'been on a terrible first date',
  'fallen asleep on a date',
  'kissed someone to make someone else jealous',
  'had a one-night stand turn into more',
  'dated two people at once',
  'been caught checking someone out',
  'had a secret admirer',
  'sent a voice note to a match before meeting',
  'overthought a simple text for way too long',
  'kept a screenshot of a message that made me smile',
  'muted someone instead of ending things directly',
  'changed my mind about someone after one good conversation',
  'ignored a red flag because the chemistry was too good',
  'had a crush on someone I barely knew',
  'waited to reply so I seemed less interested',
  'sent a message and immediately wanted to unsend it',
  'felt nervous before meeting someone I actually liked',
  'been surprised by who I ended up attracted to',
  'pretended to be cooler than I felt',
  'kept talking to someone because the banter was too good',
  'wanted a second chance with someone I fumbled',
  'had my standards change after one bad connection',
  'realized I liked someone during a normal conversation',
  'had a first impression be completely wrong',
  'noticed someone because of their confidence',
  'wanted someone to text first but refused to say it',
];

const FALLBACK_PROMPTS_R = [
  'had a one-night stand',
  'made out with someone I just met',
  'slept in the same bed as a friend',
  'kissed someone to make someone else jealous',
  'had a friends-with-benefits situation',
  'dated two people at once',
  'sent a risqué text',
  'had a summer fling turn into more',
  'been the other person',
  'reconnected with an ex for one night',
  'had a crush on a roommate',
  'kissed someone at a party',
  'slept over at a crush\'s place',
  'had a workplace romance',
  'dated someone much older or younger',
  'been caught in a lie by a partner',
  'broken up with someone over text',
  'slept with an ex',
  'dated someone my friends hated',
  'had a secret relationship',
  'kissed someone I shouldn\'t have',
  'had a relationship that started as a hookup',
  'been attracted to a friend\'s partner',
  'had a one-sided crush for years',
  'lied about my relationship status',
  'had a casual thing that got complicated',
  'been ghosted after sleeping together',
  'ghosted someone after sleeping together',
  'had a romantic moment with a stranger',
  'sent a message I knew was too bold',
  'liked someone more because they were hard to read',
  'kept a casual thing going longer than I should have',
  'used jealousy to figure out how I really felt',
  'said I was fine when I absolutely was not',
  'wanted someone unavailable',
  'kept someone around because the attention felt good',
  'flirted with someone I knew was trouble',
  'changed my outfit just to get a reaction',
  'said less than I felt to keep the upper hand',
  'checked someone\'s social media before replying',
  'ended something because the chemistry was stronger than the compatibility',
  'wanted to be chosen but acted unbothered',
  'sent a voice note because texting felt too flat',
  'stayed in a situationship because it was exciting',
  'confused attention for actual interest',
];

// Spicy — boldest level, most provocative (app-store safe)
const FALLBACK_PROMPTS_SPICY = [
  'hooked up with someone I just met',
  'had a one-night stand',
  'slept with someone on the first date',
  'sent a risky text or pic',
  'had a friends-with-benefits situation',
  'made out with a stranger',
  'reconnected with an ex for one night',
  'been the other person',
  'slept over at a crush\'s place the first time we hung out',
  'had a workplace romance',
  'kissed someone to make someone else jealous',
  'had a secret relationship',
  'dated two people at once',
  'ghosted someone after sleeping together',
  'been ghosted after sleeping together',
  'had a relationship that started as a hookup',
  'kissed someone I shouldn\'t have',
  'had a casual thing that got complicated',
  'been attracted to a friend\'s partner',
  'had a summer fling turn into more',
  'lied about my relationship status',
  'slept with an ex',
  'had a romantic moment with a stranger',
  'made the first move physically',
  'been bold enough to kiss first',
  'had a crush on a roommate',
  'dated someone much older or younger',
  'had a one-sided crush for years',
  'been caught in a lie by a partner',
  'broken up with someone over text',
  'sent a text I would not want my friends to read',
  'wanted someone more after they pulled away',
  'used a harmless excuse to keep a conversation going',
  'had chemistry with someone who was clearly wrong for me',
  'kept a secret crush longer than I should have',
  'said something bold just to see what would happen',
  'wanted to kiss someone before I fully trusted them',
  'had a situationship I should have ended sooner',
  'missed someone I knew was bad for me',
  'made the first move and pretended it was casual',
  'liked being chased more than I expected',
  'sent a late-night message I meant more than I admitted',
  'wanted someone to be jealous',
  'had a crush that was mostly tension',
  'let chemistry override common sense',
  'wanted to know if someone thought about me later',
  'teased someone I knew I should not',
  'let someone watch me react to their message',
  'said less than I wanted because I liked the tension',
  'fantasized about someone from this app before we met',
  'wanted to be dominated or to dominate — even just in chat',
  'sent something that felt too honest for daylight',
  'stayed up replaying what they might do if we were alone',
  'used silence as flirting',
  'wanted them to beg a little — or begged myself',
  'crossed a line in my head before I crossed it in real life',
  'been turned on by jealousy',
  'held eye contact longer than was strictly friendly',
  'said "we should not" while meaning "convince me"',
  'wanted a slow burn but moved too fast anyway',
  'let someone hear my voice when I was already in bed',
  'been more honest drunk or horny than sober',
  'wanted to hear them say my name',
  'kept a match on read to feel in control',
  'broken my own rule about sexting before meeting',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NHIE_PROMPT_ANGLES = [
  'texting habits and overthinking at 1 a.m.',
  'emotional availability and mixed signals',
  'confidence, ego, and wanting to be chosen',
  'red flags ignored because the chemistry was unfair',
  'situationships and blurry boundaries',
  'jealousy, attention, and power dynamics',
  'late-night honesty and messages you almost unsent',
  'standards, dealbreakers, and self-respect',
  'exes, closure, and unfinished tension',
  'desire and tension without graphic detail',
  'vulnerability people hide behind cool',
  'being pursued versus doing the pursuing',
  'dating-app behavior and profile performance',
  'the moment someone became irresistible',
  'adult flirting that crossed a line — barely',
  'rules you broke for the right person',
  'chemistry that made you ignore your own standards',
  'a message you rewrote five times and still hesitated to send',
  'pretending to be unbothered when you were not',
  'wanting someone more after they went quiet',
  'the difference between attention and actual interest',
];

const NHIE_PROMPT_ANGLES_SPICY = [
  'sexual tension you pretended was casual',
  'a message you sent that felt too honest',
  'wanting someone who was slightly unavailable',
  'power — who had it and who gave it up',
  'restraint — stopping right before you would have gone further',
  'jealousy that turned you on',
  'a fantasy you would only act on with consent',
  'voice-note or late-night chat that crossed a line',
  'being desired vs being wanted for attention',
  'a boundary you bent for chemistry',
  'anticipation — dragging it out on purpose',
  'admitting what you want without saying it plainly',
  'almost sending something you knew was bold',
  'choosing tension over clarity',
  'what you would do if they were on your couch',
  'seduction through patience, not pressure',
  'a crush that was mostly mental',
  'saying "we should not" while hoping they would',
  'being turned on by confidence',
  'hiding how much someone affected you',
];

function parseNhieUsedPrompts(raw: unknown): string[] {
  return parseUsedPromptsJson(raw);
}

function fallbackPromptsForLevel(spiceLevel: SpiceLevel): string[] {
  const prompts =
    spiceLevel === 'spicy'
      ? FALLBACK_PROMPTS_SPICY
      : spiceLevel === 'ratedr'
      ? FALLBACK_PROMPTS_R
      : FALLBACK_PROMPTS;
  return filterBannedGamePrompts(prompts);
}

function normalizePromptForCompare(prompt: string | null | undefined): string {
  return normalizeGamePrompt(prompt);
}

function hasBannedTheme(prompt: string | null | undefined): boolean {
  return hasBannedGamePromptTheme(prompt);
}

function pickRandomExcludingNhie(fallbacks: string[], excludePrompts: string[]): string {
  const excludeNorm = new Set(excludePrompts.map((p) => normalizePromptForCompare(p)));
  const filtered = fallbacks.filter((activity) => {
    const full = normalizePromptForCompare(`Never have I ever ${activity}`);
    return !excludeNorm.has(full);
  });
  const pool = filtered.length > 0 ? filtered : fallbacks;
  return pickRandom(pool);
}

export async function generateNeverHaveIEverPrompt(
  matchId: string,
  spiceLevel: SpiceLevel = 'pg13',
  excludePrompts: string[] = [],
): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isR = spiceLevel === 'ratedr';
  const isSpicy = spiceLevel === 'spicy';
  const fallbacks = fallbackPromptsForLevel(spiceLevel);
  const toExclude = excludePrompts.filter((p) => p && p.trim().length > 0);

  if (!openaiApiKey) {
    return `Never have I ever ${pickRandomExcludingNhie(fallbacks, toExclude)}`;
  }

  try {
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
      ? ` Shared interests (background only, do not center the prompt on them): ${sharedInterests.slice(0, 5).join(', ')}. ${GAME_PROMPT_INTERESTS_RULE}`
      : '';

    const spiceInstruction = isSpicy
      ? `SPICE: SPICY — maximum heat for consenting adults on a dating app. Sexual tension, seduction, desire, power, jealousy, late-night honesty, sexting-adjacent choices, boundaries tested consensually. ${GAME_PROMPT_SPICY_ADULT} ${GAME_PROMPT_SPICY_CLICHE_AVOID}`
      : isR
      ? 'SPICE: RATED R — suggestive, sexually charged stories and habits without graphic porn. Hookups, exes, risqué DMs, attraction, tension, real adult dating messiness. Confident bar-stool honesty.'
      : 'SPICE: PG-13 — grown-up dating energy: witty, emotionally intelligent, flirty. Real chemistry and choices; never childish icebreakers or hobby-tourism prompts.';

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const anglePool = isSpicy ? NHIE_PROMPT_ANGLES_SPICY : NHIE_PROMPT_ANGLES;
    const creativeAngle = pickRandom(anglePool);

    const excludeHint =
      toExclude.length > 0
        ? `\n\nDo NOT repeat or closely paraphrase these (already used this game): ${toExclude
            .slice(-12)
            .map((p) => `"${p.replace(/^never have i ever\s+/i, '').trim()}"`)
            .join(', ')}.`
        : '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You generate "Never have I ever" prompts for a dating app game for adults. Output ONLY the activity part (the thing after "Never have I ever"), NOT the full phrase. 4-10 words. ${spiceInstruction}

${GAME_PROMPT_MATURE_TONE}

${GAME_PROMPT_HARD_BANS}

Do NOT make prompts about hobbies, music taste, playlists, travel stories, concerts, festivals, sports outings, or "gone to X" activities. Make them about choices, feelings, tension, habits, boundaries, texting, attraction, and dating behavior between adults.

Examples of the tone:
- "overthought a simple text"
- "ignored a red flag for chemistry"
- "wanted someone unavailable"
- "sent a message that felt too honest"
- "kept a situationship going too long"
- "pretended I was fine when I was jealous"
${isSpicy ? `\nSpicy examples (vary — do not copy verbatim):\n- "said something in chat I would not say in daylight"\n- "wanted them to make the first move physically"\n- "let tension build on purpose"\n- "been turned on by someone's voice note"\n- "almost sent a message I knew was too bold"` : ''}

Output ONLY the activity, nothing else.`,
        },
        {
          role: 'user',
          content: `Generate one unique "Never have I ever" activity for two adults playing on a dating app.

Spice: ${spiceLevel.toUpperCase()}.
Creative angle: ${creativeAngle}.
${interestsContext}

${GAME_PROMPT_INTERESTS_RULE}
${GAME_PROMPT_HARD_BANS}
${excludeHint}

Return ONLY the activity (4-10 words):`,
        },
      ],
      temperature: isSpicy ? 1.05 : 1.0,
      max_tokens: 50,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 2 && content.length < 80) {
      const badStarts = ['I ', 'Sorry', 'Never have I ever', 'Never have I'];
      const isBad = badStarts.some((s) => content.toLowerCase().startsWith(s.toLowerCase()));
      if (!isBad && !hasBannedTheme(content)) {
        const activity = content.replace(/^["']|["']$/g, '').trim();
        const full = `Never have I ever ${activity}`;
        if (!isPromptAlreadyUsed(full, toExclude)) return full;
      }
    }
  } catch (error) {
    console.warn('Never Have I Ever AI generation failed:', error);
  }

  return `Never have I ever ${pickRandomExcludingNhie(fallbacks, toExclude)}`;
}

const NHIE_DISTINCT_MAX_ATTEMPTS = 8;

/** Unique NHIE prompt for this match session (both players share used_prompts). */
export async function generateDistinctNeverHaveIEverPrompt(
  matchId: string,
  spiceLevel: SpiceLevel = 'pg13',
  previousPrompt?: string | null,
  usedPrompts: string[] = [],
): Promise<string> {
  const exclude = buildExcludePromptList(usedPrompts, previousPrompt);

  for (let attempt = 0; attempt < NHIE_DISTINCT_MAX_ATTEMPTS; attempt++) {
    const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel, exclude);
    if (!isPromptAlreadyUsed(prompt, exclude)) {
      return prompt;
    }
    exclude.push(prompt.trim());
  }

  const fallbackPool = fallbackPromptsForLevel(spiceLevel);
  return `Never have I ever ${pickRandomExcludingNhie(fallbackPool, exclude)}`;
}

interface GameRow {
  match_id: string;
  user1_strikes: number;
  user2_strikes: number;
  user1_spice_choice: string | null;
  user2_spice_choice: string | null;
  spice_level: string | null;
  used_prompts?: string | null;
  current_prompt: string | null;
  current_round_id?: string | null;
  current_turn_user_id: string | null;
  user1_answer: string | null;
  user2_answer: string | null;
  user1_answer_round_id?: string | null;
  user2_answer_round_id?: string | null;
  user1_last_active_at?: string | null;
  user2_last_active_at?: string | null;
}

function parseActivityTs(raw: string | null | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function isPlayerInactive(lastActiveAt: string | null | undefined): boolean {
  const t = parseActivityTs(lastActiveAt);
  if (t === null) return false;
  return Date.now() - t > NHIE_INACTIVITY_RESET_MS;
}

function nhieSessionEngaged(row: GameRow): boolean {
  const s1 = Number(row.user1_strikes) || 0;
  const s2 = Number(row.user2_strikes) || 0;
  return !!(
    row.user1_spice_choice ||
    row.user2_spice_choice ||
    row.current_prompt?.trim() ||
    s1 > 0 ||
    s2 > 0
  );
}

async function touchNeverHaveIEverActivity(matchId: string, userId: string, match: { user1_id: string; user2_id: string }): Promise<void> {
  const isUser1 = userId === match.user1_id;
  const col = isUser1 ? 'user1_last_active_at' : 'user2_last_active_at';
  const now = new Date().toISOString();
  const result = db.prepare(`UPDATE never_have_i_ever_games SET ${col} = ?, updated_at = ? WHERE match_id = ?`).run([now, now, matchId]);
  if (result instanceof Promise) await result;
}

async function setBothNeverHaveIEverActivity(matchId: string): Promise<void> {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE never_have_i_ever_games SET user1_last_active_at = ?, user2_last_active_at = ?, updated_at = ? WHERE match_id = ?`
    )
    .run([now, now, now, matchId]);
  if (result instanceof Promise) await result;
}

/** Restart NHIE when either player has been idle 5+ minutes. Returns true if a reset ran. */
export async function applyNeverHaveIEverInactivityReset(
  matchId: string,
  match: { user1_id: string; user2_id: string }
): Promise<boolean> {
  const rowResult = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;
  if (!row || !nhieSessionEngaged(row)) return false;

  const u1Idle = isPlayerInactive(row.user1_last_active_at);
  const u2Idle = isPlayerInactive(row.user2_last_active_at);
  if (!u1Idle && !u2Idle) return false;

  nhieLog('inactivity reset', { matchId, u1Idle, u2Idle, u1Last: row.user1_last_active_at, u2Last: row.user2_last_active_at });

  const c1 = row.user1_spice_choice as SpiceLevel | null;
  const c2 = row.user2_spice_choice as SpiceLevel | null;
  const now = new Date().toISOString();

  if (c1 && c2) {
    const level = moreConservative(c1, c2);
    const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, level, null, []);
    const updateResult = db
      .prepare(
        `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, user1_last_active_at = ?, user2_last_active_at = ?, updated_at = ? WHERE match_id = ?`
      )
      .run([level, prompt, uuidv4(), JSON.stringify([prompt]), now, now, now, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    const updateResult = db
      .prepare(
        `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_round_id = NULL, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, user1_last_active_at = ?, user2_last_active_at = ?, updated_at = ? WHERE match_id = ?`
      )
      .run([now, now, now, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  }

  try {
    const { getIO } = await import('../socket.js');
    const io = getIO();
    if (io) {
      io.to(`match:${matchId}`).emit('never_have_i_ever_updated', {
        matchId,
        roundReset: true,
        inactiveReset: true,
        user1Strikes: 0,
        user2Strikes: 0,
      });
    }
  } catch (_) {
    /* non-fatal */
  }

  return true;
}

export interface GameState {
  prompt: string;
  yourStrikes: number;
  theirStrikes: number;
  yourAnswer: 'have' | 'havent' | null;
  theirAnswer: 'have' | 'havent' | null;
  bothAnswered: boolean;
  gameOver: boolean;
  winner: 'you' | 'them' | null;
  roundResult?: { youStrike: boolean; themStrike: boolean };
  roundId?: string | null;
  phase: 'lobby' | 'playing';
  yourSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  theirSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  spiceReady: boolean;
  spiceLevel: 'pg13' | 'ratedr' | 'spicy' | null;
  tokenUnlocked?: boolean;
  currentTurnUserId?: string | null;
  isYourTurn?: boolean;
  /** True when the server restarted the game after 5+ min idle on either side. */
  inactiveReset?: boolean;
}

export type GetGameStateOptions = { completeRoundIfBothAnswered?: boolean };

function rowRoundId(row: GameRow | Record<string, unknown> | undefined | null): string | null {
  if (!row) return null;
  const raw = (row as any).current_round_id ?? (row as any).currentRoundId ?? null;
  return raw == null ? null : String(raw);
}

async function ensureCurrentRoundId(matchId: string, row: GameRow | undefined | null): Promise<string> {
  const existing = rowRoundId(row);
  if (existing) return existing;
  const next = uuidv4();
  const result = db.prepare('UPDATE never_have_i_ever_games SET current_round_id = ?, updated_at = ? WHERE match_id = ?').run([next, new Date().toISOString(), matchId]);
  if (result instanceof Promise) await result;
  if (row) row.current_round_id = next;
  return next;
}

/** Only treat an answer as belonging to the active round (prevents stuck rounds after roundId drift). */
function answerForCurrentRound(
  answer: 'have' | 'havent' | null,
  answerRoundId: string | null | undefined,
  currentRoundId: string
): 'have' | 'havent' | null {
  if (answer == null) return null;
  if (answerRoundId == null || String(answerRoundId).trim() === '') return answer;
  return String(answerRoundId) === String(currentRoundId) ? answer : null;
}

/** Clear answers tied to a previous round so completion logic and new submissions are not blocked. */
async function clearOrphanedAnswersForRound(matchId: string, currentRoundId: string): Promise<boolean> {
  const rowResult = db
    .prepare(
      'SELECT user1_answer, user2_answer, user1_answer_round_id, user2_answer_round_id FROM never_have_i_ever_games WHERE match_id = ?'
    )
    .get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;
  if (!row) return false;

  const r1 = row.user1_answer_round_id;
  const r2 = row.user2_answer_round_id;
  const u1Orphan =
    getAnswerVal(row as unknown as Record<string, unknown>, 'user1_answer') != null &&
    r1 != null &&
    String(r1) !== String(currentRoundId);
  const u2Orphan =
    getAnswerVal(row as unknown as Record<string, unknown>, 'user2_answer') != null &&
    r2 != null &&
    String(r2) !== String(currentRoundId);
  if (!u1Orphan && !u2Orphan) return false;

  nhieLog('clearOrphanedAnswersForRound', { matchId, currentRoundId, u1Orphan, u2Orphan });
  const ts = new Date().toISOString();
  const updateResult = db
    .prepare(
      `UPDATE never_have_i_ever_games SET
        user1_answer = CASE WHEN user1_answer_round_id IS NOT NULL AND user1_answer_round_id != ? THEN NULL ELSE user1_answer END,
        user1_answer_round_id = CASE WHEN user1_answer_round_id IS NOT NULL AND user1_answer_round_id != ? THEN NULL ELSE user1_answer_round_id END,
        user2_answer = CASE WHEN user2_answer_round_id IS NOT NULL AND user2_answer_round_id != ? THEN NULL ELSE user2_answer END,
        user2_answer_round_id = CASE WHEN user2_answer_round_id IS NOT NULL AND user2_answer_round_id != ? THEN NULL ELSE user2_answer_round_id END,
        updated_at = ?
      WHERE match_id = ?`
    )
    .run([currentRoundId, currentRoundId, currentRoundId, currentRoundId, ts, matchId]);
  if (updateResult instanceof Promise) await updateResult;
  return true;
}

export async function getGameState(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  options?: GetGameStateOptions
): Promise<GameState> {
  const isUser1 = userId === match.user1_id;

  const inactiveReset = await applyNeverHaveIEverInactivityReset(matchId, match);

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (row) {
    await touchNeverHaveIEverActivity(matchId, userId, match);
    const rowRefresh = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    row = (rowRefresh instanceof Promise ? await rowRefresh : rowRefresh) as GameRow | undefined;
  }

  const yourSpiceChoice = (isUser1 ? row?.user1_spice_choice : row?.user2_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
  const theirSpiceChoice = (isUser1 ? row?.user2_spice_choice : row?.user1_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
  const c1 = row?.user1_spice_choice as SpiceLevel | null | undefined;
  const c2 = row?.user2_spice_choice as SpiceLevel | null | undefined;
  const spiceReady = !!(c1 && c2);
  const spiceLevel = spiceReady && c1 && c2 ? moreConservative(c1, c2) : null;

  if (!row) {
    return {
      prompt: '',
      roundId: null,
      yourStrikes: 0,
      theirStrikes: 0,
      yourAnswer: null,
      theirAnswer: null,
      bothAnswered: false,
      gameOver: false,
      winner: null,
      phase: 'lobby',
      yourSpiceChoice: null,
      theirSpiceChoice: null,
      spiceReady: false,
      spiceLevel: null,
      inactiveReset: inactiveReset || undefined,
    };
  }

  const rowUser1Strikes = Number(row.user1_strikes) || 0;
  const rowUser2Strikes = Number(row.user2_strikes) || 0;
  const hasActivePrompt = !!(row.current_prompt && row.current_prompt.trim());
  const inLobby = !spiceReady && !hasActivePrompt && rowUser1Strikes < STRIKES_TO_LOSE && rowUser2Strikes < STRIKES_TO_LOSE;
  if (inLobby) {
    return {
      prompt: '',
      roundId: rowRoundId(row),
      yourStrikes: 0,
      theirStrikes: 0,
      yourAnswer: null,
      theirAnswer: null,
      bothAnswered: false,
      gameOver: false,
      winner: null,
      phase: 'lobby',
      yourSpiceChoice: yourSpiceChoice || null,
      theirSpiceChoice: theirSpiceChoice || null,
      spiceReady,
      spiceLevel,
      inactiveReset: inactiveReset || undefined,
    };
  }

  const yourStrikes = isUser1 ? rowUser1Strikes : rowUser2Strikes;
  const theirStrikes = isUser1 ? rowUser2Strikes : rowUser1Strikes;
  const level = (spiceLevel || row.spice_level || 'pg13') as SpiceLevel;
  const currentRoundId = await ensureCurrentRoundId(matchId, row);

  if (await clearOrphanedAnswersForRound(matchId, currentRoundId)) {
    const rowRefresh = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    row = (rowRefresh instanceof Promise ? await rowRefresh : rowRefresh) as GameRow | undefined;
    if (!row) {
      return {
        prompt: '',
        roundId: currentRoundId,
        yourStrikes: 0,
        theirStrikes: 0,
        yourAnswer: null,
        theirAnswer: null,
        bothAnswered: false,
        gameOver: false,
        winner: null,
        phase: 'playing',
        yourSpiceChoice: yourSpiceChoice || null,
        theirSpiceChoice: theirSpiceChoice || null,
        spiceReady: spiceReady || false,
        spiceLevel: level,
        currentTurnUserId: null,
        isYourTurn: false,
        inactiveReset: inactiveReset || undefined,
      };
    }
  }

  const rowAny = row as unknown as Record<string, unknown>;
  let yourAnswer = answerForCurrentRound(
    (isUser1 ? getAnswerVal(rowAny, 'user1_answer') : getAnswerVal(rowAny, 'user2_answer')) as 'have' | 'havent' | null,
    isUser1 ? row.user1_answer_round_id : row.user2_answer_round_id,
    currentRoundId
  );
  let theirAnswer = answerForCurrentRound(
    (isUser1 ? getAnswerVal(rowAny, 'user2_answer') : getAnswerVal(rowAny, 'user1_answer')) as 'have' | 'havent' | null,
    isUser1 ? row.user2_answer_round_id : row.user1_answer_round_id,
    currentRoundId
  );

  const bothAnswered = yourAnswer !== null && theirAnswer !== null;
  const gameOver = yourStrikes >= STRIKES_TO_LOSE || theirStrikes >= STRIKES_TO_LOSE;
  let winner: 'you' | 'them' | null = null;
  if (gameOver) {
    winner = theirStrikes >= STRIKES_TO_LOSE ? 'you' : 'them';
  }

  // Complete the round in this same read when GET asks for it: we already see both answers, so no second-read race
  if (options?.completeRoundIfBothAnswered && bothAnswered && !gameOver) {
    nhieLog('getGameState completing round (both answered)', { matchId, yourAnswer, theirAnswer, completeRoundIfBothAnswered: true });
    const completed = await completeRoundIfBothAnswered(matchId);
    if (completed.completed && completed.newPrompt) {
      const nextState = await getGameState(matchId, userId, match);
      return {
        ...nextState,
        prompt: completed.newPrompt,
        yourAnswer: null,
        theirAnswer: null,
        bothAnswered: false,
        currentTurnUserId: null,
        isYourTurn: false,
        inactiveReset: inactiveReset || undefined,
      };
    }
  }

  if (!row) {
    return { prompt: '', roundId: null, yourStrikes: 0, theirStrikes: 0, yourAnswer: null, theirAnswer: null, bothAnswered: false, gameOver: false, winner: null, phase: 'playing', yourSpiceChoice: null, theirSpiceChoice: null, spiceReady, spiceLevel: level, currentTurnUserId: null, isYourTurn: false, inactiveReset: inactiveReset || undefined };
  }
  let prompt = row.current_prompt?.trim() || '';
  // If we're in playing phase but prompt is missing/placeholder, generate one and persist (fixes UI showing only "Never have I ever...")
  if (!prompt || prompt === 'Never have I ever...') {
    try {
      const used = parseNhieUsedPrompts(row.used_prompts);
      prompt = await generateDistinctNeverHaveIEverPrompt(matchId, level, row.current_prompt, used);
      const newUsed = appendUsedPrompt(used, prompt);
      const promptResult = db
        .prepare(
          'UPDATE never_have_i_ever_games SET current_prompt = ?, used_prompts = ?, updated_at = ? WHERE match_id = ?',
        )
        .run([prompt, JSON.stringify(newUsed), new Date().toISOString(), matchId]);
      if (promptResult instanceof Promise) await promptResult;
    } catch (e) {
      console.warn('Never Have I Ever lazy prompt generation failed:', e);
      prompt = prompt || 'Never have I ever...';
    }
  }
  if (!prompt) prompt = 'Never have I ever...';

  const currentTurnUserId = row.current_turn_user_id ?? null;
  const isYourTurn = !!currentTurnUserId && currentTurnUserId === userId;

  return {
    prompt,
    roundId: currentRoundId,
    yourStrikes,
    theirStrikes,
    yourAnswer,
    theirAnswer: bothAnswered ? theirAnswer : null,
    bothAnswered,
    gameOver,
    winner,
    phase: 'playing',
    yourSpiceChoice: yourSpiceChoice || null,
    theirSpiceChoice: theirSpiceChoice || null,
    spiceReady: spiceReady || hasActivePrompt,
    spiceLevel: level,
    currentTurnUserId,
    isYourTurn,
    inactiveReset: inactiveReset || undefined,
  };
}

/**
 * If both users have answered (row has both user1_answer and user2_answer), complete the round:
 * generate new prompt and clear answers. Used by GET so that when POST didn't see both (e.g. concurrent requests),
 * the next poll completes the round and returns the new prompt.
 * Returns { completed: true, newPrompt } if we ran the update; { completed: false } otherwise.
 */
/** Read answer from row; handles PostgreSQL/node-pg returning different key shapes (e.g. lowercase, or Row object) */
function getAnswerVal(row: Record<string, unknown>, key: 'user1_answer' | 'user2_answer'): string | null {
  const wantUser = key === 'user1_answer' ? 'user1' : 'user2';
  // Try exact key first
  let raw = row[key] ?? (row as any)[key];
  if (raw == null && typeof row === 'object' && row !== null) {
    const keys = Object.keys(row);
    for (const k of keys) {
      const lower = k.toLowerCase();
      if (lower.includes(wantUser) && lower.includes('answer')) {
        raw = (row as any)[k];
        break;
      }
    }
  }
  if (raw == null || typeof raw !== 'string') return null;
  const s = String(raw).trim().toLowerCase();
  return s === 'have' || s === 'havent' ? s : null;
}

export async function completeRoundIfBothAnswered(matchId: string): Promise<{ completed: boolean; newPrompt?: string }> {
  function hasBoth(row: Record<string, unknown> | undefined, roundId?: string | null): boolean {
    if (!row) return false;
    const a1 = getAnswerVal(row, 'user1_answer');
    const a2 = getAnswerVal(row, 'user2_answer');
    if (a1 === null || a2 === null) return false;
    if (!roundId) return true;
    const r1 = (row as any).user1_answer_round_id ?? null;
    const r2 = (row as any).user2_answer_round_id ?? null;
    // Legacy rows may not have answer round ids. Treat present answers as current so old rounds can finish.
    return (r1 == null || String(r1) === roundId) && (r2 == null || String(r2) === roundId);
  }

  const readRow = async (): Promise<Record<string, unknown> | null> => {
    const rowResult = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    return (rowResult instanceof Promise ? await rowResult : rowResult) as Record<string, unknown> | null;
  };

  let row = await readRow();
  if (!row) {
    nhieLog('completeRoundIfBothAnswered exit: no row', { matchId });
    return { completed: false };
  }
  const currentRoundId = await ensureCurrentRoundId(matchId, row as unknown as GameRow);
  if (await clearOrphanedAnswersForRound(matchId, currentRoundId)) {
    row = await readRow();
    if (!row) return { completed: false };
  }
  // Retry with backoff so we see commits after replica lag (Render/PostgreSQL read replica can be seconds behind)
  const retryDelays = [400, 800, 1500, 3000, 5000, 8000];
  for (let i = 0; i < retryDelays.length; i++) {
    if (hasBoth(row, currentRoundId)) break;
    const u1 = getAnswerVal(row, 'user1_answer');
    const u2 = getAnswerVal(row, 'user2_answer');
    nhieLog('completeRoundIfBothAnswered: waiting then retry', { matchId, attempt: i + 1, delayMs: retryDelays[i], user1: u1, user2: u2 });
    // Diagnostic: log actual row keys and answer-like values once so we can see DB/driver shape (e.g. pg lowercasing)
    if (i === 0 && (u1 === null && u2 === null) && row && typeof row === 'object') {
      const keys = Object.keys(row);
      const answerKeys = keys.filter((k) => k.toLowerCase().includes('answer'));
      const answerVals: Record<string, unknown> = {};
      for (const k of answerKeys) answerVals[k] = (row as any)[k];
      nhieLog('completeRoundIfBothAnswered: row keys (answer-related)', { matchId, allKeys: keys, answerKeys, answerVals });
    }
    await new Promise((r) => setTimeout(r, retryDelays[i]));
    row = await readRow();
    if (!row) {
      nhieLog('completeRoundIfBothAnswered exit: no row after retry', { matchId });
      return { completed: false };
    }
  }
  if (!hasBoth(row, currentRoundId)) {
    nhieLog('completeRoundIfBothAnswered exit: still missing both after all retries', { matchId, user1: getAnswerVal(row, 'user1_answer'), user2: getAnswerVal(row, 'user2_answer') });
    return { completed: false };
  }

  const r = row as Record<string, unknown>;
  nhieLog('completeRoundIfBothAnswered: both answers present, generating new prompt', { matchId, user1Answer: getAnswerVal(r, 'user1_answer'), user2Answer: getAnswerVal(r, 'user2_answer') });
  const s1 = Number(r.user1_strikes) || 0;
  const s2 = Number(r.user2_strikes) || 0;
  if (s1 >= STRIKES_TO_LOSE || s2 >= STRIKES_TO_LOSE) {
    nhieLog('completeRoundIfBothAnswered exit: game over', { matchId, s1, s2 });
    return { completed: false };
  }

  // Derive level from spice choices or row (PostgreSQL may return different key casing; both answers are present so game was started)
  const c1 = (r.user1_spice_choice ?? (r as any).user1_spice_choice) as SpiceLevel | null;
  const c2 = (r.user2_spice_choice ?? (r as any).user2_spice_choice) as SpiceLevel | null;
  const rowSpice = (r as any).spice_level ?? (r as any).spiceLevel ?? r.spice_level;
  const effectiveLevel = (c1 && c2 ? moreConservative(c1, c2) : (rowSpice as SpiceLevel)) || 'pg13';
  let usedPrompts = parseNhieUsedPrompts((r as { used_prompts?: unknown }).used_prompts);
  const priorPrompt = String((r as { current_prompt?: string | null }).current_prompt ?? '').trim();
  if (priorPrompt) usedPrompts = [...usedPrompts, priorPrompt];

  let nextPrompt: string;
  try {
    nextPrompt = await generateDistinctNeverHaveIEverPrompt(
      matchId,
      effectiveLevel,
      String(r.current_prompt ?? ''),
      usedPrompts,
    );
    if (!nextPrompt || !nextPrompt.trim()) nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  } catch (e) {
    console.warn('NHIE completeRoundIfBothAnswered: generate failed', e);
    nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  }

  const newUsedPrompts = appendUsedPrompt(usedPrompts, nextPrompt);

  const ts = new Date().toISOString();
  const nextRoundId = uuidv4();
  const updateSql = `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ? AND current_round_id = ?`;
  const runResult = db
    .prepare(updateSql)
    .run([nextPrompt, nextRoundId, JSON.stringify(newUsedPrompts), ts, matchId, currentRoundId]);
  const resolved = runResult instanceof Promise ? await runResult : runResult;
  const changed = (resolved as { changes?: number }).changes !== undefined && (resolved as { changes: number }).changes > 0;

  nhieLog('completeRoundIfBothAnswered UPDATE result', { matchId, changed, newPromptPreview: nextPrompt.slice(0, 50) });
  const rowAfter = await readRow();
  const completed =
    changed ||
    !!(rowAfter && String(rowAfter.current_prompt ?? '').trim() === nextPrompt.trim() && rowRoundId(rowAfter) === nextRoundId && !hasBoth(rowAfter, nextRoundId));

  if (completed && process.env.NODE_ENV !== 'test') {
    console.log(`🙊 NHIE completeRoundIfBothAnswered: match=${matchId} completed round, newPromptLen=${nextPrompt.length}`);
  }
  if (completed) {
    const source = rowAfter ?? r;
    const user1Strikes = Math.max(0, Number(source.user1_strikes) || 0);
    const user2Strikes = Math.max(0, Number(source.user2_strikes) || 0);
    nhieLog('completeRoundIfBothAnswered emitting never_have_i_ever_updated', { matchId, user1Strikes, user2Strikes });
    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId, newPrompt: nextPrompt, roundId: nextRoundId, roundComplete: true, user1Strikes, user2Strikes });
    } catch (_) {}
  }
  return completed ? { completed: true, newPrompt: nextPrompt } : { completed: false };
}

export async function setSpiceChoice(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  choice: 'pg13' | 'ratedr' | 'spicy'
): Promise<GameState> {
  const isUser1 = userId === match.user1_id;

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row) {
    const insertResult = db
      .prepare(
        `INSERT INTO never_have_i_ever_games (match_id, user1_spice_choice, user2_spice_choice, updated_at) VALUES (?, ?, ?, ?)`
      )
      .run([matchId, isUser1 ? choice : null, isUser1 ? null : choice, new Date().toISOString()]);
    if (insertResult instanceof Promise) await insertResult;
  } else if (!row.spice_level && !row.current_prompt) {
    const updateResult = db
      .prepare(
        `UPDATE never_have_i_ever_games SET ${isUser1 ? 'user1_spice_choice' : 'user2_spice_choice'} = ?, updated_at = ? WHERE match_id = ?`
      )
      .run([choice, new Date().toISOString(), matchId]);
    if (updateResult instanceof Promise) await updateResult;
  }

  return getGameState(matchId, userId, match);
}

/** Each user sets their own spice choice; no waiting. When both have chosen, effective level = more conservative, and first prompt is generated. */
export async function setMySpiceChoice(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  choice: 'pg13' | 'ratedr' | 'spicy'
): Promise<GameState> {
  const isUser1 = userId === match.user1_id;
  const now = new Date().toISOString();

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row) {
    const insertResult = db.prepare(
      `INSERT INTO never_have_i_ever_games (match_id, user1_spice_choice, user2_spice_choice, updated_at) VALUES (?, ?, ?, ?)`
    ).run([matchId, isUser1 ? choice : null, isUser1 ? null : choice, now]);
    if (insertResult instanceof Promise) await insertResult;
  } else {
    const updateResult = db.prepare(
      `UPDATE never_have_i_ever_games SET ${isUser1 ? 'user1_spice_choice' : 'user2_spice_choice'} = ?, updated_at = ? WHERE match_id = ?`
    ).run([choice, now, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  }

  const nextRowResult = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
  row = (nextRowResult instanceof Promise ? await nextRowResult : nextRowResult) as GameRow;
  const c1 = row.user1_spice_choice as SpiceLevel | null;
  const c2 = row.user2_spice_choice as SpiceLevel | null;
  if (c1 && c2 && !row.current_prompt) {
    const effectiveLevel = moreConservative(c1, c2);
      const prompt = await generateDistinctNeverHaveIEverPrompt(
        matchId,
        effectiveLevel,
        row.current_prompt,
        parseNhieUsedPrompts(row.used_prompts),
      );
    // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
    const promptResult = db.prepare(
      `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ?`
    ).run([effectiveLevel, prompt, uuidv4(), JSON.stringify([prompt]), now, matchId]);
    if (promptResult instanceof Promise) await promptResult;
    await setBothNeverHaveIEverActivity(matchId);
  }

  await touchNeverHaveIEverActivity(matchId, userId, match);
  return getGameState(matchId, userId, match);
}

export async function startGame(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string }
): Promise<GameState> {
  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row || !row.user1_spice_choice || !row.user2_spice_choice || row.user1_spice_choice !== row.user2_spice_choice) {
    return getGameState(matchId, userId, match);
  }

  const spiceLevel = row.user1_spice_choice as SpiceLevel;
  const prompt = await generateDistinctNeverHaveIEverPrompt(
    matchId,
    spiceLevel,
    row.current_prompt,
    parseNhieUsedPrompts(row.used_prompts),
  );
  // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
  const startResult = db.prepare(
    `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ?`
  ).run([spiceLevel, prompt, uuidv4(), JSON.stringify([prompt]), new Date().toISOString(), matchId]);
  if (startResult instanceof Promise) await startResult;
  await setBothNeverHaveIEverActivity(matchId);

  return getGameState(matchId, userId, match);
}

export async function submitAnswer(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  answer: 'have' | 'havent',
  submittedRoundId?: string | null
): Promise<{
  state: GameState;
  roundResult?: { youStrike: boolean; themStrike: boolean };
  completedYourAnswer?: 'have' | 'havent';
  completedTheirAnswer?: 'have' | 'havent';
  pointsFromRound?: { newYourStrikes: number; newTheirStrikes: number };
  newPrompt?: string;
}> {
  const isUser1 = userId === match.user1_id;

  await applyNeverHaveIEverInactivityReset(matchId, match);

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row || !row.spice_level || !row.current_prompt) {
    return { state: await getGameState(matchId, userId, match) };
  }
  const alreadyOver =
    (Number(row.user1_strikes) || 0) >= STRIKES_TO_LOSE || (Number(row.user2_strikes) || 0) >= STRIKES_TO_LOSE;
  if (alreadyOver) {
    return { state: await getGameState(matchId, userId, match) };
  }

  // If both answers are already set (stale round never completed), complete it first so we can set our answer
  const u1 = getAnswerVal(row as unknown as Record<string, unknown>, 'user1_answer');
  const u2 = getAnswerVal(row as unknown as Record<string, unknown>, 'user2_answer');
  const bothSet = u1 !== null && u2 !== null;
  if (bothSet) {
    const completed = await completeRoundIfBothAnswered(matchId);
    if (completed.completed) {
      const rowResult2 = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
      row = (rowResult2 instanceof Promise ? await rowResult2 : rowResult2) as GameRow | undefined;
    }
  }
  if (!row) return { state: await getGameState(matchId, userId, match) };
  const currentRoundId = await ensureCurrentRoundId(matchId, row);
  const otherAnswerBefore = (isUser1
    ? getAnswerVal(row as unknown as Record<string, unknown>, 'user2_answer')
    : getAnswerVal(row as unknown as Record<string, unknown>, 'user1_answer')) as 'have' | 'havent' | null;
  const otherAnswerRoundBefore = isUser1 ? row.user2_answer_round_id : row.user1_answer_round_id;
  const otherAlreadyAnsweredThisRound =
    otherAnswerBefore !== null &&
    (otherAnswerRoundBefore == null || String(otherAnswerRoundBefore) === currentRoundId);
  if (submittedRoundId && submittedRoundId !== currentRoundId) {
    nhieLog('submitAnswer: stale roundId from client — clearing orphans and applying to current round', {
      matchId,
      submittedRoundId,
      currentRoundId,
    });
    await clearOrphanedAnswersForRound(matchId, currentRoundId);
    return submitAnswer(matchId, userId, match, answer, currentRoundId);
  }

  const ts = new Date().toISOString();
  // Only set answer when currently null/empty (idempotent: double-tap or double request won't add points)
  nhieLog('submitAnswer: saving answer', { matchId, isUser1, answer });
  const setAnswerSql = isUser1
    ? 'UPDATE never_have_i_ever_games SET user1_answer = ?, user1_answer_round_id = ?, updated_at = ? WHERE match_id = ? AND current_round_id = ? AND (user1_answer IS NULL OR user1_answer = \'\')'
    : 'UPDATE never_have_i_ever_games SET user2_answer = ?, user2_answer_round_id = ?, updated_at = ? WHERE match_id = ? AND current_round_id = ? AND (user2_answer IS NULL OR user2_answer = \'\')';
  let runResult = db.prepare(setAnswerSql).run([answer, currentRoundId, ts, matchId, currentRoundId]);
  if (runResult instanceof Promise) runResult = await runResult;
  const answerWasSet = (runResult as { changes?: number }).changes !== undefined && (runResult as { changes: number }).changes > 0;
  nhieLog('submitAnswer: answer UPDATE result', { matchId, isUser1, answerWasSet });
  await touchNeverHaveIEverActivity(matchId, userId, match);

  if (!answerWasSet) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`🙊 NHIE submitAnswer: answer already set for this user (match=${matchId} isUser1=${isUser1}), returning without updating`);
    }
    const completed = await completeRoundIfBothAnswered(matchId);
    if (completed.completed && completed.newPrompt) {
      const state = await getGameState(matchId, userId, match);
      state.prompt = completed.newPrompt;
      return {
        state,
        roundResult: { youStrike: false, themStrike: false },
        pointsFromRound: { newYourStrikes: state.yourStrikes, newTheirStrikes: state.theirStrikes },
        newPrompt: completed.newPrompt,
      };
    }
    const state = await getGameState(matchId, userId, match);
    const pts = row
      ? { newYourStrikes: Number(isUser1 ? row.user1_strikes : row.user2_strikes) || 0, newTheirStrikes: Number(isUser1 ? row.user2_strikes : row.user1_strikes) || 0 }
      : { newYourStrikes: 0, newTheirStrikes: 0 };
    return { state, pointsFromRound: pts };
  }

  // Add a point only when we actually set the answer (first time only)
  if (answer === 'have') {
    const strikeSql = isUser1
      ? 'UPDATE never_have_i_ever_games SET user1_strikes = COALESCE(user1_strikes, 0) + 1, updated_at = ? WHERE match_id = ?'
      : 'UPDATE never_have_i_ever_games SET user2_strikes = COALESCE(user2_strikes, 0) + 1, updated_at = ? WHERE match_id = ?';
    const strikeResult = db.prepare(strikeSql).run([ts, matchId]);
    if (strikeResult instanceof Promise) await strikeResult;
  }

  // Compute points from initial row + our update so response is correct even if DB read is stale (replica/cross-connection)
  const prevYour = Number(isUser1 ? row.user1_strikes : row.user2_strikes) || 0;
  const prevTheir = Number(isUser1 ? row.user2_strikes : row.user1_strikes) || 0;
  const pointsAfterAnswer: { newYourStrikes: number; newTheirStrikes: number } = {
    newYourStrikes: prevYour + (answer === 'have' ? 1 : 0),
    newTheirStrikes: prevTheir,
  };
  let pointsAfterRoundComplete: { newYourStrikes: number; newTheirStrikes: number } | undefined;
  let roundResult: { youStrike: boolean; themStrike: boolean } | undefined;
  let generatedNextPrompt: string | undefined;
  let user1Answer: 'have' | 'havent' | null = isUser1 ? answer : null;
  let user2Answer: 'have' | 'havent' | null = isUser1 ? null : answer;

  if (otherAlreadyAnsweredThisRound) {
    user1Answer = isUser1 ? answer : otherAnswerBefore;
    user2Answer = isUser1 ? otherAnswerBefore : answer;
    roundResult = {
      youStrike: answer === 'have',
      themStrike: otherAnswerBefore === 'have',
    };
    const user1After = Number(row.user1_strikes) + (isUser1 && answer === 'have' ? 1 : 0);
    const user2After = Number(row.user2_strikes) + (!isUser1 && answer === 'have' ? 1 : 0);
    const gameOver = user1After >= STRIKES_TO_LOSE || user2After >= STRIKES_TO_LOSE;
    pointsAfterRoundComplete = {
      newYourStrikes: isUser1 ? user1After : user2After,
      newTheirStrikes: isUser1 ? user2After : user1After,
    };
    if (!gameOver) {
      const c1 = row.user1_spice_choice as SpiceLevel | null;
      const c2 = row.user2_spice_choice as SpiceLevel | null;
      const effectiveLevel = (c1 && c2 ? moreConservative(c1, c2) : (row.spice_level as SpiceLevel)) || 'pg13';
      let usedForRound = parseNhieUsedPrompts((row as { used_prompts?: unknown }).used_prompts);
      if (row.current_prompt?.trim()) usedForRound = [...usedForRound, row.current_prompt.trim()];
      const nextPrompt = await generateDistinctNeverHaveIEverPrompt(
        matchId,
        effectiveLevel,
        row.current_prompt,
        usedForRound,
      );
      generatedNextPrompt = nextPrompt;
      const nextRoundId = uuidv4();
      const newUsed = appendUsedPrompt(usedForRound, nextPrompt);
      const completeResult = db.prepare(
        `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ? AND current_round_id = ?`
      ).run([nextPrompt, nextRoundId, JSON.stringify(newUsed), new Date().toISOString(), matchId, currentRoundId]);
      if (completeResult instanceof Promise) await completeResult;
      const completionApplied = (completeResult as { changes?: number }).changes !== undefined && (completeResult as { changes: number }).changes > 0;
      if (!completionApplied) {
        const currentRowResult = db.prepare('SELECT current_prompt FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
        const currentRow = currentRowResult instanceof Promise ? await currentRowResult : currentRowResult;
        if (currentRow && (currentRow as any).current_prompt) {
          generatedNextPrompt = (currentRow as any).current_prompt;
        }
      }
      nhieLog('submitAnswer: immediate second-answer round completion', { matchId, applied: completionApplied, newPromptPreview: (generatedNextPrompt ?? nextPrompt).slice(0, 50), nextRoundId });
    }
  }

  const state = await getGameState(matchId, userId, match);
  state.roundResult = roundResult;
  // When we just generated a new prompt, use it so client always gets it (getGameState may not see it yet in some DBs)
  if (generatedNextPrompt) state.prompt = generatedNextPrompt;
  const yourAnswerRaw = isUser1 ? user1Answer : user2Answer;
  const theirAnswerRaw = isUser1 ? user2Answer : user1Answer;
  const completedYourAnswer: 'have' | 'havent' | undefined = roundResult && yourAnswerRaw != null ? yourAnswerRaw : undefined;
  const completedTheirAnswer: 'have' | 'havent' | undefined = roundResult && theirAnswerRaw != null ? theirAnswerRaw : undefined;
  const pointsFromRound =
    pointsAfterRoundComplete ?? pointsAfterAnswer ??
    (roundResult ? { newYourStrikes: state.yourStrikes, newTheirStrikes: state.theirStrikes } : undefined);
  const newPrompt = generatedNextPrompt ?? (roundResult ? (state.prompt ?? undefined) : undefined);
  nhieLog('submitAnswer: returning', { matchId, hasNewPrompt: !!newPrompt, newPromptPreview: newPrompt?.slice(0, 50), roundResult: !!roundResult });
  return { state, roundResult, completedYourAnswer, completedTheirAnswer, pointsFromRound, newPrompt };
}

/**
 * Submit answer for turn-based mode (token-unlocked): only current turn user answers.
 * If "have", add strike. Switch turn, generate new prompt.
 */
export async function submitTurnAnswer(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  answer: 'have' | 'havent'
): Promise<{ state: GameState; roundResult?: { youStrike: boolean; themStrike: boolean }; newPrompt?: string }> {
  const isUser1 = userId === match.user1_id;
  const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row || !row.current_turn_user_id || row.current_turn_user_id !== userId) {
    return { state: await getGameState(matchId, userId, match) };
  }

  if (!row.spice_level || !row.current_prompt) {
    return { state: await getGameState(matchId, userId, match) };
  }

  const youStrike = answer === 'have';
  const s1 = Number(row.user1_strikes) || 0;
  const s2 = Number(row.user2_strikes) || 0;
  const newUser1Strikes = isUser1 ? s1 + (youStrike ? 1 : 0) : s1;
  const newUser2Strikes = isUser1 ? s2 : s2 + (youStrike ? 1 : 0);

  const gameOver = newUser1Strikes >= STRIKES_TO_LOSE || newUser2Strikes >= STRIKES_TO_LOSE;
  const spiceLevel = (row.spice_level || 'pg13') as SpiceLevel;

  let newPrompt: string;
  let nextTurnUserId: string | null;
  if (gameOver) {
    newPrompt = row.current_prompt!;
    nextTurnUserId = null;
  } else {
    const usedTurn = parseNhieUsedPrompts(row.used_prompts);
    newPrompt = await generateDistinctNeverHaveIEverPrompt(
      matchId,
      spiceLevel,
      row.current_prompt,
      usedTurn,
    );
    nextTurnUserId = otherUserId;
  }

  const usedAfterTurn = gameOver
    ? parseNhieUsedPrompts(row.used_prompts)
    : appendUsedPrompt(
        buildExcludePromptList(parseNhieUsedPrompts(row.used_prompts), row.current_prompt),
        newPrompt,
      );

  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET user1_strikes = ?, user2_strikes = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = ?, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ?`
  ).run([
    newUser1Strikes,
    newUser2Strikes,
    newPrompt,
    uuidv4(),
    nextTurnUserId,
    JSON.stringify(usedAfterTurn),
    new Date().toISOString(),
    matchId,
  ]);
  if (runResult instanceof Promise) await runResult;

  const state = await getGameState(matchId, userId, match);
  state.roundResult = { youStrike, themStrike: false };
  return { state, roundResult: { youStrike, themStrike: false }, newPrompt: state.prompt ?? newPrompt };
}

export async function advanceToNextRound(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string }
): Promise<GameState> {
  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row || row.user1_answer === null || row.user2_answer === null) {
    return getGameState(matchId, userId, match);
  }

  const spiceLevel = (row.spice_level || 'pg13') as SpiceLevel;
  let usedAdvance = parseNhieUsedPrompts(row.used_prompts);
  if (row.current_prompt?.trim()) usedAdvance = [...usedAdvance, row.current_prompt.trim()];
  const prompt = await generateDistinctNeverHaveIEverPrompt(
    matchId,
    spiceLevel,
    row.current_prompt,
    usedAdvance,
  );
  const newUsedAdvance = appendUsedPrompt(usedAdvance, prompt);
  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ?`
  ).run([prompt, uuidv4(), JSON.stringify(newUsedAdvance), new Date().toISOString(), matchId]);
  if (runResult instanceof Promise) await runResult;

  return getGameState(matchId, userId, match);
}

/** Reset NHIE to the spice lobby for both players (clears scores, prompt, and mode picks). */
export async function returnToLobby(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string }
): Promise<GameState> {
  const now = new Date().toISOString();
  const rowResult = db.prepare('SELECT match_id FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
  const row = rowResult instanceof Promise ? await rowResult : rowResult;

  if (row) {
    const updateResult = db
      .prepare(
        `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, user1_spice_choice = NULL, user2_spice_choice = NULL, spice_level = NULL, current_prompt = NULL, current_round_id = NULL, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = '[]', updated_at = ? WHERE match_id = ?`
      )
      .run([now, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  }

  await touchNeverHaveIEverActivity(matchId, userId, match);
  return getGameState(matchId, userId, match);
}

export async function startNewGame(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string }
): Promise<GameState> {
  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;
  const spiceLevel = (row?.spice_level || 'pg13') as SpiceLevel;
  const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, spiceLevel, row?.current_prompt, []);

  const ts = new Date().toISOString();
  const usedJson = JSON.stringify([prompt]);
  // Keep tally mode (current_turn_user_id = NULL): both users answer each prompt, then we tally and generate next.
  if (row) {
    const updateResult = db.prepare(
      `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, used_prompts = ?, updated_at = ? WHERE match_id = ?`
    ).run([prompt, uuidv4(), usedJson, ts, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    const insertResult = db.prepare(
      `INSERT INTO never_have_i_ever_games (match_id, user1_strikes, user2_strikes, spice_level, current_prompt, current_round_id, current_turn_user_id, user1_answer, user2_answer, user1_answer_round_id, user2_answer_round_id, used_prompts, updated_at) VALUES (?, 0, 0, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`
    ).run([matchId, spiceLevel, prompt, uuidv4(), usedJson, ts]);
    if (insertResult instanceof Promise) await insertResult;
  }

  await setBothNeverHaveIEverActivity(matchId);
  return getGameState(matchId, userId, match);
}
