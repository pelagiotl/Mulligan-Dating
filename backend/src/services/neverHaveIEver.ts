/**
 * Never Have I Ever - OpenAI generates a wide variety of unique prompts.
 * Static FALLBACK_PROMPTS are used ONLY when OPENAI_API_KEY is missing or the API fails.
 * With the key set, every prompt is AI-generated for maximum variety.
 * First to 10 strikes loses. "I have" = strike.
 */

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

export type SpiceLevel = 'pg13' | 'ratedr' | 'spicy';

/** Use the more conservative of the two choices for prompt generation (no one is pushed past their comfort level). */
function moreConservative(a: SpiceLevel, b: SpiceLevel): SpiceLevel {
  const order: Record<SpiceLevel, number> = { pg13: 1, ratedr: 2, spicy: 3 };
  return order[a] <= order[b] ? a : b;
}

const FALLBACK_PROMPTS = [
  'kissed on a first date',
  'gone on a blind date',
  'had a summer fling',
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
  'slept in past noon on a weekend',
  'eaten pizza for breakfast',
  'cried at a rom-com',
  'danced alone in my room',
  'sung karaoke',
  'binge-watched a show in one day',
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
  'had a fling while on vacation',
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
  'had a fling while on vacation',
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
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateNeverHaveIEverPrompt(matchId: string, spiceLevel: SpiceLevel = 'pg13'): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isR = spiceLevel === 'ratedr';
  const isSpicy = spiceLevel === 'spicy';
  const fallbacks = isSpicy ? FALLBACK_PROMPTS_SPICY : isR ? FALLBACK_PROMPTS_R : FALLBACK_PROMPTS;

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
      ? ` They have shared interests: ${sharedInterests.slice(0, 5).join(', ')}.`
      : '';

    const spiceInstruction = isSpicy
      ? 'SPICY: The BOLDEST level. Hookups, one-night stands, risky texts, sleeping with someone on first date, friends-with-benefits, secret relationships, exes, vacation flings. Provocative but tasteful. No explicit sexual content. App-store safe.'
      : isR
      ? 'RATED R: Bolder, more suggestive. Can touch on hookups, one-night stands, exes, risqué situations, physical attraction, secrets. Still tasteful and app-store safe — no explicit sexual content.'
      : 'PG-13: Fun, relatable, dating/romance/life themed. Light and playful. Dating-appropriate.';

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You generate "Never have I ever" prompts for a dating app game. Output ONLY the activity part (the thing after "Never have I ever"), NOT the full phrase. 3-8 words. ${spiceInstruction} Be creative and varied — we want a plethora of different prompts, not a fixed list. Examples for PG-13: "kissed on a first date", "had a crush on a friend". Examples for R: "had a one-night stand", "slept with an ex". Examples for SPICY: "hooked up with someone I just met", "sent a risky text or pic", "slept with someone on the first date", "had a friends-with-benefits situation". Output ONLY the activity, nothing else.`,
        },
        {
          role: 'user',
          content: `Generate one unique "Never have I ever" activity for two people playing on a dating app. Spice: ${spiceLevel.toUpperCase()}. Be fresh and unexpected.${interestsContext} Return ONLY the activity (3-8 words):`,
        },
      ],
      temperature: 1.0,
      max_tokens: 50,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content && content.length > 2 && content.length < 80) {
      const badStarts = ['I ', 'Sorry', 'Never have I ever', 'Never have I'];
      const isBad = badStarts.some((s) => content.toLowerCase().startsWith(s.toLowerCase()));
      if (!isBad) {
        const activity = content.replace(/^["']|["']$/g, '').trim();
        return `Never have I ever ${activity}`;
      }
    }
  } catch (error) {
    console.warn('Never Have I Ever AI generation failed:', error);
  }

  return `Never have I ever ${pickRandom(fallbacks)}`;
}

interface GameRow {
  match_id: string;
  user1_strikes: number;
  user2_strikes: number;
  user1_spice_choice: string | null;
  user2_spice_choice: string | null;
  spice_level: string | null;
  current_prompt: string | null;
  current_turn_user_id: string | null;
  user1_answer: string | null;
  user2_answer: string | null;
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
  phase: 'lobby' | 'playing';
  yourSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  theirSpiceChoice: 'pg13' | 'ratedr' | 'spicy' | null;
  spiceReady: boolean;
  spiceLevel: 'pg13' | 'ratedr' | 'spicy' | null;
  tokenUnlocked?: boolean;
  currentTurnUserId?: string | null;
  isYourTurn?: boolean;
}

export type GetGameStateOptions = { completeRoundIfBothAnswered?: boolean };

export async function getGameState(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  options?: GetGameStateOptions
): Promise<GameState> {
  const isUser1 = userId === match.user1_id;

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  const yourSpiceChoice = (isUser1 ? row?.user1_spice_choice : row?.user2_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
  const theirSpiceChoice = (isUser1 ? row?.user2_spice_choice : row?.user1_spice_choice) as 'pg13' | 'ratedr' | 'spicy' | null;
  const c1 = row?.user1_spice_choice as SpiceLevel | null | undefined;
  const c2 = row?.user2_spice_choice as SpiceLevel | null | undefined;
  const spiceReady = !!(c1 && c2);
  const spiceLevel = spiceReady && c1 && c2 ? moreConservative(c1, c2) : null;

  if (!row) {
    return {
      prompt: '',
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
    };
  }

  const inLobby = !spiceReady;
  if (inLobby) {
    return {
      prompt: '',
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
    };
  }

  const yourStrikes = Number(isUser1 ? row.user1_strikes : row.user2_strikes) || 0;
  const theirStrikes = Number(isUser1 ? row.user2_strikes : row.user1_strikes) || 0;
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

  // Complete the round in this same read when GET asks for it: we already see both answers, so no second-read race
  if (options?.completeRoundIfBothAnswered && bothAnswered && !gameOver) {
    nhieLog('getGameState completing round (both answered)', { matchId, yourAnswer, theirAnswer, completeRoundIfBothAnswered: true });
    let nextPrompt: string;
    try {
      nextPrompt = await generateNeverHaveIEverPrompt(matchId, level);
      if (!nextPrompt?.trim()) nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
    } catch (e) {
      console.warn('NHIE getGameState complete round: generate failed', e);
      nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
    }
    const ts = new Date().toISOString();
    const updateSql = `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ? AND user1_answer IS NOT NULL AND user2_answer IS NOT NULL`;
    const runResult = db.prepare(updateSql).run([nextPrompt, ts, matchId]);
    const resolved = runResult instanceof Promise ? await runResult : runResult;
    const changed = (resolved as { changes?: number }).changes !== undefined && (resolved as { changes: number }).changes > 0;
    nhieLog('getGameState round-completion UPDATE result', { matchId, changed, newPromptPreview: nextPrompt.slice(0, 50) });
    if (changed && process.env.NODE_ENV !== 'test') {
      console.log(`🙊 NHIE getGameState: completed round match=${matchId} newPromptLen=${nextPrompt.length}`);
    }
    // Re-read so we return state with new prompt and cleared answers; emit so other client gets new prompt
    const reread = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const rowAfter = (reread instanceof Promise ? await reread : reread) as GameRow | undefined;
    if (rowAfter && changed) {
      const newPromptVal = rowAfter.current_prompt?.trim() || nextPrompt;
      const user1Strikes = Math.max(0, Number(rowAfter.user1_strikes) || 0);
      const user2Strikes = Math.max(0, Number(rowAfter.user2_strikes) || 0);
      nhieLog('getGameState emitting never_have_i_ever_updated (round complete)', { matchId, newPromptPreview: newPromptVal.slice(0, 50), user1Strikes, user2Strikes });
      try {
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId, newPrompt: newPromptVal, roundComplete: true, user1Strikes, user2Strikes });
        }
      } catch (_) {}
      return {
        prompt: newPromptVal,
        yourStrikes,
        theirStrikes,
        yourAnswer: null,
        theirAnswer: null,
        bothAnswered: false,
        gameOver,
        winner,
        phase: 'playing',
        yourSpiceChoice: yourSpiceChoice || null,
        theirSpiceChoice: theirSpiceChoice || null,
        spiceReady,
        spiceLevel: level,
        currentTurnUserId: rowAfter.current_turn_user_id ?? null,
        isYourTurn: !!(rowAfter.current_turn_user_id && rowAfter.current_turn_user_id === userId),
      };
    }
  }

  if (!row) {
    return { prompt: '', yourStrikes: 0, theirStrikes: 0, yourAnswer: null, theirAnswer: null, bothAnswered: false, gameOver: false, winner: null, phase: 'playing', yourSpiceChoice: null, theirSpiceChoice: null, spiceReady, spiceLevel: level, currentTurnUserId: null, isYourTurn: false };
  }
  let prompt = row.current_prompt?.trim() || '';
  // If we're in playing phase but prompt is missing/placeholder, generate one and persist (fixes UI showing only "Never have I ever...")
  if (!prompt || prompt === 'Never have I ever...') {
    try {
      prompt = await generateNeverHaveIEverPrompt(matchId, level);
      db.prepare('UPDATE never_have_i_ever_games SET current_prompt = ?, updated_at = ? WHERE match_id = ?').run([prompt, new Date().toISOString(), matchId]);
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
    spiceReady,
    spiceLevel: level,
    currentTurnUserId,
    isYourTurn,
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
  function hasBoth(row: Record<string, unknown> | undefined): boolean {
    if (!row) return false;
    const a1 = getAnswerVal(row, 'user1_answer');
    const a2 = getAnswerVal(row, 'user2_answer');
    return a1 !== null && a2 !== null;
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
  // Retry with backoff so we see commits after replica lag (Render/PostgreSQL read replica can be seconds behind)
  const retryDelays = [400, 800, 1500, 3000, 5000, 8000];
  for (let i = 0; i < retryDelays.length; i++) {
    if (hasBoth(row)) break;
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
  if (!hasBoth(row)) {
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
    nextPrompt = await generateNeverHaveIEverPrompt(matchId, effectiveLevel);
    if (!nextPrompt || !nextPrompt.trim()) nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  } catch (e) {
    console.warn('NHIE completeRoundIfBothAnswered: generate failed', e);
    nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
  }

  const ts = new Date().toISOString();
  const updateSql = `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`;
  const runResult = db.prepare(updateSql).run([nextPrompt, ts, matchId]);
  const resolved = runResult instanceof Promise ? await runResult : runResult;
  const changed = (resolved as { changes?: number }).changes !== undefined && (resolved as { changes: number }).changes > 0;

  nhieLog('completeRoundIfBothAnswered UPDATE result', { matchId, changed, newPromptPreview: nextPrompt.slice(0, 50) });
  const rowAfter = await readRow();
  const completed =
    changed ||
    !!(rowAfter && String(rowAfter.current_prompt ?? '').trim() === nextPrompt.trim() && !hasBoth(rowAfter));

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
      if (io) io.to(`match:${matchId}`).emit('never_have_i_ever_updated', { matchId, newPrompt: nextPrompt, roundComplete: true, user1Strikes, user2Strikes });
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
    const prompt = await generateNeverHaveIEverPrompt(matchId, effectiveLevel);
    // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
    const promptResult = db.prepare(
      `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_turn_user_id = NULL, updated_at = ? WHERE match_id = ?`
    ).run([effectiveLevel, prompt, now, matchId]);
    if (promptResult instanceof Promise) await promptResult;
  }

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
  const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
  // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
  const startResult = db.prepare(
    `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_turn_user_id = NULL, updated_at = ? WHERE match_id = ?`
  ).run([spiceLevel, prompt, new Date().toISOString(), matchId]);
  if (startResult instanceof Promise) await startResult;

  return getGameState(matchId, userId, match);
}

export async function submitAnswer(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string },
  answer: 'have' | 'havent'
): Promise<{
  state: GameState;
  roundResult?: { youStrike: boolean; themStrike: boolean };
  completedYourAnswer?: 'have' | 'havent';
  completedTheirAnswer?: 'have' | 'havent';
  pointsFromRound?: { newYourStrikes: number; newTheirStrikes: number };
  newPrompt?: string;
}> {
  const isUser1 = userId === match.user1_id;

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

  const ts = new Date().toISOString();
  // Only set answer when currently null/empty (idempotent: double-tap or double request won't add points)
  nhieLog('submitAnswer: saving answer', { matchId, isUser1, answer });
  const setAnswerSql = isUser1
    ? 'UPDATE never_have_i_ever_games SET user1_answer = ?, updated_at = ? WHERE match_id = ? AND (user1_answer IS NULL OR user1_answer = \'\')'
    : 'UPDATE never_have_i_ever_games SET user2_answer = ?, updated_at = ? WHERE match_id = ? AND (user2_answer IS NULL OR user2_answer = \'\')';
  let runResult = db.prepare(setAnswerSql).run([answer, ts, matchId]);
  if (runResult instanceof Promise) runResult = await runResult;
  const answerWasSet = (runResult as { changes?: number }).changes !== undefined && (runResult as { changes: number }).changes > 0;
  nhieLog('submitAnswer: answer UPDATE result', { matchId, isUser1, answerWasSet });

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

  // Give the other user's connection time to commit so we see both answers (cross-connection / replica visibility).
  // Use 1s so when both users submit at once, the first read is more likely to see the other's commit.
  await new Promise((r) => setTimeout(r, 1000));

  let rowAfter = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
  row = (rowAfter instanceof Promise ? await rowAfter : rowAfter) as GameRow;
  // Use key-agnostic read so we see both answers regardless of DB/driver key shape (e.g. PostgreSQL lowercase)
  let user1Answer = (row ? getAnswerVal(row as unknown as Record<string, unknown>, 'user1_answer') : null) as 'have' | 'havent' | null;
  let user2Answer = (row ? getAnswerVal(row as unknown as Record<string, unknown>, 'user2_answer') : null) as 'have' | 'havent' | null;

  nhieLog('submitAnswer: after 1s read', { matchId, user1Answer, user2Answer, bothPresent: user1Answer != null && user2Answer != null });

  // Early completion: if we don't see both yet, try completeRoundIfBothAnswered once (it does its own read).
  // Helps when the other user's commit isn't visible to this connection yet (e.g. PostgreSQL / replica).
  let roundCompletedByHelper = false;
  if (user1Answer == null || user2Answer == null) {
    nhieLog('submitAnswer: calling completeRoundIfBothAnswered (early) - only one answer visible', { matchId });
    const earlyComplete = await completeRoundIfBothAnswered(matchId);
    if (earlyComplete.completed && earlyComplete.newPrompt) {
      roundCompletedByHelper = true;
      generatedNextPrompt = earlyComplete.newPrompt;
      nhieLog('submitAnswer: early completeRoundIfBothAnswered succeeded', { matchId, newPromptPreview: earlyComplete.newPrompt.slice(0, 50) });
      roundResult = { youStrike: answer === 'have', themStrike: false };
      const finalRead = db.prepare('SELECT user1_strikes, user2_strikes FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
      const finalRow = (finalRead instanceof Promise ? await finalRead : finalRead) as { user1_strikes?: number; user2_strikes?: number } | undefined;
      if (finalRow) {
        pointsAfterRoundComplete = {
          newYourStrikes: Number(isUser1 ? finalRow.user1_strikes : finalRow.user2_strikes) || 0,
          newTheirStrikes: Number(isUser1 ? finalRow.user2_strikes : finalRow.user1_strikes) || 0,
        };
      }
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🙊 NHIE submitAnswer: early completeRoundIfBothAnswered completed round match=${matchId}`);
      }
    }
  }

  // If we only see one answer (and helper didn't complete), retry with backoff for replica/commit visibility
  const retryDelays = [150, 350, 600, 1000, 1500, 2500, 4000, 6000, 8000];
  for (const delayMs of retryDelays) {
    if (roundCompletedByHelper) break;
    if (user1Answer != null && user2Answer != null) break;
    await new Promise((r) => setTimeout(r, delayMs));
    const rowRetryResult = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const rowRetry = (rowRetryResult instanceof Promise ? await rowRetryResult : rowRetryResult) as GameRow | undefined;
    if (!rowRetry) break;
    user1Answer = getAnswerVal(rowRetry as unknown as Record<string, unknown>, 'user1_answer') as 'have' | 'havent' | null;
    user2Answer = getAnswerVal(rowRetry as unknown as Record<string, unknown>, 'user2_answer') as 'have' | 'havent' | null;
    if (user1Answer != null && user2Answer != null) {
      row = rowRetry;
      break;
    }
  }
  // One final wait and read in case of replica lag (skip if we already completed via early helper)
  if (!roundCompletedByHelper && (user1Answer == null || user2Answer == null)) {
    await new Promise((r) => setTimeout(r, 2000));
    const finalRead = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
    const finalRow = (finalRead instanceof Promise ? await finalRead : finalRead) as GameRow | undefined;
    if (finalRow) {
      const f1 = getAnswerVal(finalRow as unknown as Record<string, unknown>, 'user1_answer') as 'have' | 'havent' | null;
      const f2 = getAnswerVal(finalRow as unknown as Record<string, unknown>, 'user2_answer') as 'have' | 'havent' | null;
      if (f1 != null && f2 != null) {
        user1Answer = f1;
        user2Answer = f2;
        row = finalRow;
      }
    }
  }
  const raw1 = row ? getAnswerVal(row as unknown as Record<string, unknown>, 'user1_answer') : null;
  const raw2 = row ? getAnswerVal(row as unknown as Record<string, unknown>, 'user2_answer') : null;
  nhieLog('submitAnswer: state after retries', { matchId, isUser1, user1Answer, user2Answer, bothPresent: user1Answer != null && user2Answer != null, roundCompletedByHelper });
  if (NHIE_DEBUG) {
    console.log(`🙊 NHIE submitAnswer: match=${matchId} isUser1=${isUser1} answer=${answer} user1Answer=${user1Answer} user2Answer=${user2Answer} raw1=${JSON.stringify(raw1)} raw2=${JSON.stringify(raw2)}`);
  }

  if (!roundCompletedByHelper && user1Answer !== null && user2Answer !== null) {
    // Points were already added when each user submitted "I have". Here we only clear answers and advance the prompt.
    roundResult = {
      youStrike: (isUser1 ? user1Answer : user2Answer) === 'have',
      themStrike: (isUser1 ? user2Answer : user1Answer) === 'have',
    };

    const s1 = Number(row.user1_strikes) || 0;
    const s2 = Number(row.user2_strikes) || 0;
    const gameOver = s1 >= STRIKES_TO_LOSE || s2 >= STRIKES_TO_LOSE;

    if (!gameOver) {
      const c1 = row.user1_spice_choice as SpiceLevel | null;
      const c2 = row.user2_spice_choice as SpiceLevel | null;
      const effectiveLevel = (c1 && c2 ? moreConservative(c1, c2) : (row.spice_level as SpiceLevel)) || 'pg13';
      let nextPrompt: string;
      try {
        nextPrompt = await generateNeverHaveIEverPrompt(matchId, effectiveLevel);
        if (!nextPrompt || !nextPrompt.trim()) nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
      } catch (e) {
        console.warn('NHIE generate prompt failed, using fallback:', e);
        nextPrompt = `Never have I ever ${pickRandom(FALLBACK_PROMPTS)}`;
      }
      generatedNextPrompt = nextPrompt;
      nhieLog('submitAnswer: both answered, generated new prompt', { matchId, newPromptPreview: nextPrompt.slice(0, 50) });
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🙊 NHIE submitAnswer: both answered, generated new prompt for match=${matchId} promptLen=${nextPrompt.length}`);
      }
      const runResult = db.prepare(
        `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
      ).run([nextPrompt, new Date().toISOString(), matchId]);
      const runRes = runResult instanceof Promise ? await runResult : runResult;
      const updateChanged = (runRes as { changes?: number }).changes !== undefined && (runRes as { changes: number }).changes > 0;
      nhieLog('submitAnswer: round-completion UPDATE (submitAnswer path)', { matchId, updateChanged });

      // Re-read strikes after round completion so client always gets definitive counts (avoids any read timing)
      const finalRead = db.prepare('SELECT user1_strikes, user2_strikes FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
      const finalRow = (finalRead instanceof Promise ? await finalRead : finalRead) as { user1_strikes?: number; user2_strikes?: number } | undefined;
      if (finalRow) {
        pointsAfterRoundComplete = {
          newYourStrikes: Number(isUser1 ? finalRow.user1_strikes : finalRow.user2_strikes) || 0,
          newTheirStrikes: Number(isUser1 ? finalRow.user2_strikes : finalRow.user1_strikes) || 0,
        };
      }
    } else {
      // Game over: don't clear answers or generate next prompt; return current strikes so client shows final score
      pointsAfterRoundComplete = {
        newYourStrikes: isUser1 ? s1 : s2,
        newTheirStrikes: isUser1 ? s2 : s1,
      };
    }
  }

  // Fallback: if we didn't see both answers in our retry loop (e.g. PostgreSQL read visibility / timing),
  // try completing the round once more so at least one request returns roundComplete + newPrompt.
  if (!roundResult && (user1Answer == null || user2Answer == null)) {
    const completed = await completeRoundIfBothAnswered(matchId);
    if (completed.completed && completed.newPrompt) {
      generatedNextPrompt = completed.newPrompt;
      roundResult = { youStrike: answer === 'have', themStrike: false };
      const finalRead = db.prepare('SELECT user1_strikes, user2_strikes FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
      const finalRow = (finalRead instanceof Promise ? await finalRead : finalRead) as { user1_strikes?: number; user2_strikes?: number } | undefined;
      if (finalRow) {
        pointsAfterRoundComplete = {
          newYourStrikes: Number(isUser1 ? finalRow.user1_strikes : finalRow.user2_strikes) || 0,
          newTheirStrikes: Number(isUser1 ? finalRow.user2_strikes : finalRow.user1_strikes) || 0,
        };
      }
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🙊 NHIE submitAnswer: fallback completeRoundIfBothAnswered completed round match=${matchId}`);
      }
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
    newPrompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
    nextTurnUserId = otherUserId;
  }

  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET user1_strikes = ?, user2_strikes = ?, current_prompt = ?, current_turn_user_id = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
  ).run([newUser1Strikes, newUser2Strikes, newPrompt, nextTurnUserId, new Date().toISOString(), matchId]);
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
  const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);
  const runResult = db.prepare(
    `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
  ).run([prompt, new Date().toISOString(), matchId]);
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
  const prompt = await generateNeverHaveIEverPrompt(matchId, spiceLevel);

  const ts = new Date().toISOString();
  // Keep tally mode (current_turn_user_id = NULL): both users answer each prompt, then we tally and generate next.
  if (row) {
    const updateResult = db.prepare(
      `UPDATE never_have_i_ever_games SET user1_strikes = 0, user2_strikes = 0, current_prompt = ?, current_turn_user_id = NULL, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
    ).run([prompt, ts, matchId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    const insertResult = db.prepare(
      `INSERT INTO never_have_i_ever_games (match_id, user1_strikes, user2_strikes, spice_level, current_prompt, current_turn_user_id, user1_answer, user2_answer, updated_at) VALUES (?, 0, 0, ?, ?, NULL, NULL, NULL, ?)`
    ).run([matchId, spiceLevel, prompt, ts]);
    if (insertResult instanceof Promise) await insertResult;
  }

  return getGameState(matchId, userId, match);
}
