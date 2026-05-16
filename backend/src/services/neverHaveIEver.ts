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
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BANNED_THEME_RE =
  /\b(concert|concerts|festival|festivals|gig|gigs|band|bands|playlist|playlists|karaoke|song|songs|music scene|live music|travel|travels|traveled|travelling|traveling|trip|trips|vacation|vacations|airport|airports|flight|flights|road trip|roadtrip|hotel|resort|sports game|game day|stadium)\b/i;

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
];

function fallbackPromptsForLevel(spiceLevel: SpiceLevel): string[] {
  const prompts =
    spiceLevel === 'spicy'
      ? FALLBACK_PROMPTS_SPICY
      : spiceLevel === 'ratedr'
      ? FALLBACK_PROMPTS_R
      : FALLBACK_PROMPTS;
  return prompts.filter((prompt) => !hasBannedTheme(prompt));
}

function normalizePromptForCompare(prompt: string | null | undefined): string {
  return String(prompt || '')
    .toLowerCase()
    .replace(/^never\s+have\s+i\s+ever\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasBannedTheme(prompt: string | null | undefined): boolean {
  return BANNED_THEME_RE.test(String(prompt || ''));
}

export async function generateNeverHaveIEverPrompt(matchId: string, spiceLevel: SpiceLevel = 'pg13'): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isR = spiceLevel === 'ratedr';
  const isSpicy = spiceLevel === 'spicy';
  const fallbacks = fallbackPromptsForLevel(spiceLevel);

  if (!openaiApiKey) {
    return `Never have I ever ${pickRandom(fallbacks)}`;
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
      ? ` Shared interests are background only: ${sharedInterests.slice(0, 5).join(', ')}. Do not build the prompt around hobbies, concerts, music events, sports, travel, or vacations even if those interests are listed.`
      : '';

    const spiceInstruction = isSpicy
      ? 'SPICY: Maximum heat for consenting adults — almost edgy. Center on hookups, first-date tension, risky late-night texts, FWB, secret crushes, jealousy, power plays, situationships, and desire people hide. Sound like a VIP lounge after midnight: bold, seductive, self-aware. No pornographic anatomy or illegal content. App-store safe but push the line.'
      : isR
      ? 'RATED R: Mature audience — suggestive, sexually charged stories and habits without graphic porn. Hookups, exes, risqué DMs, attraction, boundaries bent, and real adult dating messiness. Confident bar-stool honesty, not teen party games.'
      : 'PG-13: Grown-up dating energy — witty, emotionally intelligent, flirty. Real chemistry and choices, never childish icebreakers.';

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const creativeAngle = pickRandom(NHIE_PROMPT_ANGLES);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You generate "Never have I ever" prompts for a dating app game for adults. Output ONLY the activity part (the thing after "Never have I ever"), NOT the full phrase. 4-10 words. ${spiceInstruction}

Be mature, cool, varied, and psychologically sharp. Write for adults who date — attraction, texting, vulnerability, boundaries, mixed signals, chemistry, jealousy, ego, confidence, exes, situationships, risk, and self-awareness. Never sound like a schoolyard party game.

Hard bans: no concerts, festivals, bands, songs, playlists, karaoke, music scenes, travel, trips, vacations, airports, hotels, road trips, sports games, stadiums, or public-event prompts.

Do not make prompts about hobbies or outings. Make them about choices, feelings, tension, habits, boundaries, and dating behavior.

Examples of the tone:
- "overthought a simple text"
- "ignored a red flag for chemistry"
- "wanted someone unavailable"
- "sent a message that felt too honest"
- "kept a situationship going too long"

Output ONLY the activity, nothing else.`,
        },
        {
          role: 'user',
          content: `Generate one unique "Never have I ever" activity for two adults playing on a dating app.

Spice: ${spiceLevel.toUpperCase()}.
Creative angle: ${creativeAngle}.
${interestsContext}

Avoid any concert/music/travel/vacation/sports/public-event theme. Return ONLY the activity (4-10 words):`,
        },
      ],
      temperature: 1.0,
      max_tokens: 50,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 2 && content.length < 80) {
      const badStarts = ['I ', 'Sorry', 'Never have I ever', 'Never have I'];
      const isBad = badStarts.some((s) => content.toLowerCase().startsWith(s.toLowerCase()));
      if (!isBad && !hasBannedTheme(content)) {
        const activity = content.replace(/^["']|["']$/g, '').trim();
        return `Never have I ever ${activity}`;
      }
    }
  } catch (error) {
    console.warn('Never Have I Ever AI generation failed:', error);
  }

  return `Never have I ever ${pickRandom(fallbacks)}`;
}

async function generateDistinctNeverHaveIEverPrompt(
  matchId: string,
  spiceLevel: SpiceLevel = 'pg13',
  previousPrompt?: string | null
): Promise<string> {
  const previous = normalizePromptForCompare(previousPrompt);
  for (let attempt = 0; attempt < 4; attempt++) {
    const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
    if (normalizePromptForCompare(prompt) !== previous) return prompt;
  }

  const fallbackPool = fallbackPromptsForLevel(spiceLevel).filter(
    (activity) => normalizePromptForCompare(`Never have I ever ${activity}`) !== previous
  );
  return `Never have I ever ${pickRandom(fallbackPool.length > 0 ? fallbackPool : FALLBACK_PROMPTS)}`;
}

interface GameRow {
  match_id: string;
  user1_strikes: number;
  user2_strikes: number;
  user1_spice_choice: string | null;
  user2_spice_choice: string | null;
  spice_level: string | null;
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
    const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, level, null);
    const updateResult = db
      .prepare(
        `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, user1_last_active_at = ?, user2_last_active_at = ?, updated_at = ? WHERE match_id = ?`
      )
      .run([level, prompt, uuidv4(), now, now, now, matchId]);
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
  const rowAny = row as unknown as Record<string, unknown>;
  let yourAnswer = (isUser1 ? getAnswerVal(rowAny, 'user1_answer') : getAnswerVal(rowAny, 'user2_answer')) as 'have' | 'havent' | null;
  let theirAnswer = (isUser1 ? getAnswerVal(rowAny, 'user2_answer') : getAnswerVal(rowAny, 'user1_answer')) as 'have' | 'havent' | null;

  const bothAnswered = yourAnswer !== null && theirAnswer !== null;
  const gameOver = yourStrikes >= STRIKES_TO_LOSE || theirStrikes >= STRIKES_TO_LOSE;
  let winner: 'you' | 'them' | null = null;
  if (gameOver) {
    winner = theirStrikes >= STRIKES_TO_LOSE ? 'you' : 'them';
  }

  const level = (spiceLevel || row.spice_level || 'pg13') as SpiceLevel;
  const currentRoundId = await ensureCurrentRoundId(matchId, row);

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
      prompt = await generateNeverHaveIEverPrompt(matchId, level);
      const promptResult = db.prepare('UPDATE never_have_i_ever_games SET current_prompt = ?, updated_at = ? WHERE match_id = ?').run([prompt, new Date().toISOString(), matchId]);
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
  let nextPrompt: string;
  try {
    nextPrompt = await generateDistinctNeverHaveIEverPrompt(matchId, effectiveLevel, String(r.current_prompt ?? ''));
    if (!nextPrompt || !nextPrompt.trim()) nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  } catch (e) {
    console.warn('NHIE completeRoundIfBothAnswered: generate failed', e);
    nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  }

  const ts = new Date().toISOString();
  const nextRoundId = uuidv4();
  const updateSql = `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ? AND current_round_id = ?`;
  const runResult = db.prepare(updateSql).run([nextPrompt, nextRoundId, ts, matchId, currentRoundId]);
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
      const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, effectiveLevel, row.current_prompt);
    // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
    const promptResult = db.prepare(
      `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ?`
    ).run([effectiveLevel, prompt, uuidv4(), now, matchId]);
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
  const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, spiceLevel, row.current_prompt);
  // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
  const startResult = db.prepare(
    `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ?`
  ).run([spiceLevel, prompt, uuidv4(), new Date().toISOString(), matchId]);
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
    const state = await getGameState(matchId, userId, match);
    return {
      state,
      pointsFromRound: {
        newYourStrikes: state.yourStrikes,
        newTheirStrikes: state.theirStrikes,
      },
    };
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
      const nextPrompt = await generateDistinctNeverHaveIEverPrompt(matchId, effectiveLevel, row.current_prompt);
      generatedNextPrompt = nextPrompt;
      const nextRoundId = uuidv4();
      const completeResult = db.prepare(
        `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ? AND current_round_id = ?`
      ).run([nextPrompt, nextRoundId, new Date().toISOString(), matchId, currentRoundId]);
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
    newPrompt = await generateDistinctNeverHaveIEverPrompt(matchId, spiceLevel, row.current_prompt);
    nextTurnUserId = otherUserId;
  }

  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET user1_strikes = ?, user2_strikes = ?, current_prompt = ?, current_round_id = ?, current_turn_user_id = ?, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ?`
  ).run([newUser1Strikes, newUser2Strikes, newPrompt, uuidv4(), nextTurnUserId, new Date().toISOString(), matchId]);
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
  const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, spiceLevel, row.current_prompt);
  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ?`
  ).run([prompt, uuidv4(), new Date().toISOString(), matchId]);
  if (runResult instanceof Promise) await runResult;

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
  const prompt = await generateDistinctNeverHaveIEverPrompt(matchId, spiceLevel, row?.current_prompt);

  const ts = new Date().toISOString();
  // Keep tally mode (current_turn_user_id = NULL): both users answer each prompt, then we tally and generate next.
  if (row) {
    const updateResult = db.prepare(
      `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, current_prompt = ?, current_round_id = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, user1_answer_round_id = NULL, user2_answer_round_id = NULL, updated_at = ? WHERE match_id = ?`
    ).run([prompt, uuidv4(), ts, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    const insertResult = db.prepare(
      `INSERT INTO never_have_i_ever_games (match_id, user1_strikes, user2_strikes, spice_level, current_prompt, current_round_id, current_turn_user_id, user1_answer, user2_answer, user1_answer_round_id, user2_answer_round_id, updated_at) VALUES (?, 0, 0, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`
    ).run([matchId, spiceLevel, prompt, uuidv4(), ts]);
    if (insertResult instanceof Promise) await insertResult;
  }

  await setBothNeverHaveIEverActivity(matchId);
  return getGameState(matchId, userId, match);
}
