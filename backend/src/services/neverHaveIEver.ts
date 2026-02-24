/**
 * Never Have I Ever - Game with AI-generated prompts
 * First to 10 strikes loses. "I have" = strike.
 */

import { db } from '../database.js';
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
          content: `You generate "Never have I ever" prompts for a dating app game. Output ONLY the activity part (the thing after "Never have I ever"), NOT the full phrase. 3-8 words. ${spiceInstruction} Examples for PG-13: "kissed on a first date", "had a crush on a friend". Examples for R: "had a one-night stand", "slept with an ex". Examples for SPICY: "hooked up with someone I just met", "sent a risky text or pic", "slept with someone on the first date", "had a friends-with-benefits situation". Output ONLY the activity, nothing else.`,
        },
        {
          role: 'user',
          content: `Generate one unique "Never have I ever" activity for two people playing on a dating app. Spice: ${spiceLevel.toUpperCase()}.${interestsContext} Return ONLY the activity (3-8 words):`,
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

export async function getGameState(
  matchId: string,
  userId: string,
  match: { user1_id: string; user2_id: string }
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
  const yourAnswer = (isUser1 ? row.user1_answer : row.user2_answer) as 'have' | 'havent' | null;
  const theirAnswer = (isUser1 ? row.user2_answer : row.user1_answer) as 'have' | 'havent' | null;

  const bothAnswered = yourAnswer !== null && theirAnswer !== null;
  const gameOver = yourStrikes >= STRIKES_TO_LOSE || theirStrikes >= STRIKES_TO_LOSE;
  let winner: 'you' | 'them' | null = null;
  if (gameOver) {
    winner = theirStrikes >= STRIKES_TO_LOSE ? 'you' : 'them';
  }

  let prompt = row.current_prompt?.trim() || '';
  const level = (spiceLevel || row.spice_level || 'pg13') as SpiceLevel;
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

  // Turn-based (token-unlock): current_turn_user_id set
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
    db.prepare(
      `INSERT INTO never_have_i_ever_games (match_id, user1_spice_choice, user2_spice_choice, updated_at) VALUES (?, ?, ?, ?)`
    ).run([matchId, isUser1 ? choice : null, isUser1 ? null : choice, now]);
  } else {
    db.prepare(
      `UPDATE never_have_i_ever_games SET ${isUser1 ? 'user1_spice_choice' : 'user2_spice_choice'} = ?, updated_at = ? WHERE match_id = ?`
    ).run([choice, now, matchId]);
  }

  row = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]) as GameRow;
  const c1 = row.user1_spice_choice as SpiceLevel | null;
  const c2 = row.user2_spice_choice as SpiceLevel | null;
  if (c1 && c2 && !row.current_prompt) {
    const effectiveLevel = moreConservative(c1, c2);
    const prompt = await generateNeverHaveIEverPrompt(matchId, effectiveLevel);
    // No current_turn_user_id: both users answer each prompt, then we generate the next (tally mode)
    db.prepare(
      `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_turn_user_id = NULL, updated_at = ? WHERE match_id = ?`
    ).run([effectiveLevel, prompt, now, matchId]);
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
  db.prepare(
    `UPDATE never_have_i_ever_games SET spice_level = ?, current_prompt = ?, current_turn_user_id = NULL, updated_at = ? WHERE match_id = ?`
  ).run([spiceLevel, prompt, new Date().toISOString(), matchId]);

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
}> {
  const isUser1 = userId === match.user1_id;

  const rowResult = db
    .prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?')
    .get([matchId]);
  let row = (rowResult instanceof Promise ? await rowResult : rowResult) as GameRow | undefined;

  if (!row || !row.spice_level || !row.current_prompt) {
    return { state: await getGameState(matchId, userId, match) };
  }

  if (isUser1) {
    if (row.user1_answer !== null) {
      return { state: await getGameState(matchId, userId, match) };
    }
    const updateResult = db
      .prepare('UPDATE never_have_i_ever_games SET user1_answer = ?, updated_at = ? WHERE match_id = ?')
      .run([answer, new Date().toISOString(), matchId]);
    if (updateResult instanceof Promise) await updateResult;
  } else {
    if (row.user2_answer !== null) {
      return { state: await getGameState(matchId, userId, match) };
    }
    const updateResult = db
      .prepare('UPDATE never_have_i_ever_games SET user2_answer = ?, updated_at = ? WHERE match_id = ?')
      .run([answer, new Date().toISOString(), matchId]);
    if (updateResult instanceof Promise) await updateResult;
  }

  const rowAfter = db.prepare('SELECT * FROM never_have_i_ever_games WHERE match_id = ?').get([matchId]);
  row = (rowAfter instanceof Promise ? await rowAfter : rowAfter) as GameRow;
  const user1Answer = row.user1_answer as 'have' | 'havent' | null;
  const user2Answer = row.user2_answer as 'have' | 'havent' | null;

  let roundResult: { youStrike: boolean; themStrike: boolean } | undefined;

  if (user1Answer !== null && user2Answer !== null) {
    // Scoring: point for "you" iff you answered "I have". Both have → both get +1. Both haven't → +0. A have / B haven't → A +1, B +0.
    const user1Strike = user1Answer === 'have';
    const user2Strike = user2Answer === 'have';
    const s1 = Number(row.user1_strikes) || 0;
    const s2 = Number(row.user2_strikes) || 0;
    const newUser1Strikes = s1 + (user1Strike ? 1 : 0);
    const newUser2Strikes = s2 + (user2Strike ? 1 : 0);

    roundResult = {
      youStrike: isUser1 ? user1Strike : user2Strike,
      themStrike: isUser1 ? user2Strike : user1Strike,
    };

    const gameOver = newUser1Strikes >= STRIKES_TO_LOSE || newUser2Strikes >= STRIKES_TO_LOSE;
    const ts = new Date().toISOString();

    let runResult = db.prepare(
      `UPDATE never_have_i_ever_games SET user1_strikes = ?, user2_strikes = ?, updated_at = ? WHERE match_id = ?`
    ).run([newUser1Strikes, newUser2Strikes, ts, matchId]);
    if (runResult instanceof Promise) await runResult;

    // Always generate and show the next prompt when both have answered (so UI never sticks on the old prompt).
    const c1 = row.user1_spice_choice as SpiceLevel | null;
    const c2 = row.user2_spice_choice as SpiceLevel | null;
    const effectiveLevel = (c1 && c2 ? moreConservative(c1, c2) : (row.spice_level as SpiceLevel)) || 'pg13';
    const nextPrompt = await generateNeverHaveIEverPrompt(matchId, effectiveLevel);
    runResult = db.prepare(
      `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
    ).run([nextPrompt, ts, matchId]);
    if (runResult instanceof Promise) await runResult;
  }

  const state = await getGameState(matchId, userId, match);
  state.roundResult = roundResult;
  // When round completed, expose the answers that just completed (for client to show "You said / They said" and apply points)
  const yourAnswerRaw = isUser1 ? user1Answer : user2Answer;
  const theirAnswerRaw = isUser1 ? user2Answer : user1Answer;
  const completedYourAnswer: 'have' | 'havent' | undefined = roundResult && yourAnswerRaw != null ? yourAnswerRaw : undefined;
  const completedTheirAnswer: 'have' | 'havent' | undefined = roundResult && theirAnswerRaw != null ? theirAnswerRaw : undefined;
  return { state, roundResult, completedYourAnswer, completedTheirAnswer };
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
): Promise<{ state: GameState; roundResult?: { youStrike: boolean; themStrike: boolean } }> {
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

  db.prepare(
    `UPDATE never_have_i_ever_games SET user1_strikes = ?, user2_strikes = ?, current_prompt = ?, current_turn_user_id = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
  ).run([newUser1Strikes, newUser2Strikes, newPrompt, nextTurnUserId, new Date().toISOString(), matchId]);

  const state = await getGameState(matchId, userId, match);
  state.roundResult = { youStrike, themStrike: false };
  return { state, roundResult: { youStrike, themStrike: false } };
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
  db.prepare(
    `UPDATE never_have_i_ever_games SET current_prompt = ?, user1_answer = NULL, user2_answer = NULL, updated_at = ? WHERE match_id = ?`
  ).run([prompt, new Date().toISOString(), matchId]);

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
