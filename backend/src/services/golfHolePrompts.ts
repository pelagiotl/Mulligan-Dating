import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import {
  GOLF_HOLE_COUNT,
  GOLF_PROMPT_CATALOG,
  computeSharedInsight,
  getPromptById,
  promptsForDepth,
  type GolfPrompt,
  type GolfPromptChoice,
  type GolfPromptDepth,
} from '../constants/golfHolePrompts.js';
import { MATCH_POOL_GOLF_DATE } from '../utils/matchPools.js';

export type DepthPreference = 'light' | 'deeper' | 'auto';

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  connected_via?: string | null;
};

type SessionRow = {
  match_id: string;
  current_hole: number;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
  depth_preference?: string | null;
  prompt_ids_json?: string | null;
};

type AnswerRow = {
  match_id: string;
  hole: number;
  user_id: string;
  choice_id: string | null;
  write_in: string | null;
  created_at: string;
};

export type GolfHoleAnswerView = {
  choiceId: string | null;
  choiceLabel: string | null;
  writeIn: string | null;
  tags: string[];
};

export type GolfHolePromptState = {
  matchId: string;
  currentHole: number;
  totalHoles: number;
  promptId: string;
  prompt: string;
  depth: GolfPromptDepth;
  depthPreference: DepthPreference;
  choices: { id: string; label: string }[];
  myAnswer: GolfHoleAnswerView | null;
  partnerAnswer: GolfHoleAnswerView | null;
  partnerHasAnswered: boolean;
  bothAnswered: boolean;
  sharedInsight: string | null;
  myRating: 'up' | 'down' | null;
  completed: boolean;
  canAdvance: boolean;
  startedAt: string;
  updatedAt: string;
};

function parsePromptIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickPromptId(
  depth: GolfPromptDepth,
  used: Set<string>,
): string {
  const pool = shuffle(promptsForDepth(depth).map((p) => p.id)).filter((id) => !used.has(id));
  if (pool.length > 0) return pool[0];
  // Fallback: any unused from full catalog, then any from depth
  const anyUnused = shuffle(GOLF_PROMPT_CATALOG.map((p) => p.id)).find((id) => !used.has(id));
  if (anyUnused) return anyUnused;
  return promptsForDepth(depth)[0]?.id || GOLF_PROMPT_CATALOG[0].id;
}

function depthForHole(hole: number, preference: DepthPreference): GolfPromptDepth {
  if (preference === 'light') return 'light';
  if (preference === 'deeper') return 'deeper';
  return hole <= 9 ? 'light' : 'deeper';
}

function normalizePreference(raw: string | null | undefined): DepthPreference {
  if (raw === 'light' || raw === 'deeper' || raw === 'auto') return raw;
  return 'auto';
}

async function requireGolfMatch(matchId: string, userId: string): Promise<MatchRow> {
  const row = (await db
    .prepare('SELECT id, user1_id, user2_id, connected_via FROM matches WHERE id = ?')
    .get([matchId])) as MatchRow | undefined;
  if (!row) {
    const err = new Error('Match not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (row.user1_id !== userId && row.user2_id !== userId) {
    const err = new Error('Not authorized for this match') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  if ((row.connected_via || '') !== MATCH_POOL_GOLF_DATE) {
    const err = new Error('Hole prompts are for Golf Date matches') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  return row;
}

async function ensurePromptIds(session: SessionRow, preference: DepthPreference): Promise<string[]> {
  let ids = parsePromptIds(session.prompt_ids_json);
  const used = new Set(ids);
  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), GOLF_HOLE_COUNT);

  // Ensure we have an id for every hole up through current (and fill 18 eventually)
  let changed = false;
  for (let h = 1; h <= Math.max(hole, ids.length); h++) {
    if (!ids[h - 1]) {
      const depth = depthForHole(h, preference);
      const id = pickPromptId(depth, used);
      used.add(id);
      ids[h - 1] = id;
      changed = true;
    }
  }
  // Pre-fill remaining holes with current preference so toggle only affects unassigned
  while (ids.length < GOLF_HOLE_COUNT) {
    const h = ids.length + 1;
    const depth = depthForHole(h, preference);
    const id = pickPromptId(depth, used);
    used.add(id);
    ids.push(id);
    changed = true;
  }
  ids = ids.slice(0, GOLF_HOLE_COUNT);

  if (changed || !session.prompt_ids_json) {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_sessions
         SET prompt_ids_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE match_id = ?`,
      )
      .run([JSON.stringify(ids), session.match_id]);
  }
  return ids;
}

function answerView(prompt: GolfPrompt, row: AnswerRow | undefined): GolfHoleAnswerView | null {
  if (!row) return null;
  const choice = row.choice_id
    ? prompt.choices.find((c) => c.id === row.choice_id) || null
    : null;
  return {
    choiceId: row.choice_id,
    choiceLabel: choice?.label || null,
    writeIn: row.write_in,
    tags: choice?.tags || [],
  };
}

async function loadAnswers(matchId: string, hole: number): Promise<AnswerRow[]> {
  const result = await db
    .prepare(
      `SELECT match_id, hole, user_id, choice_id, write_in, created_at
       FROM golf_hole_prompt_answers
       WHERE match_id = ? AND hole = ?`,
    )
    .all([matchId, hole]);
  return (result as AnswerRow[]) || [];
}

async function loadMyRating(
  matchId: string,
  hole: number,
  userId: string,
): Promise<'up' | 'down' | null> {
  const row = (await db
    .prepare(
      `SELECT rating FROM golf_hole_prompt_ratings
       WHERE match_id = ? AND hole = ? AND user_id = ?`,
    )
    .get([matchId, hole, userId])) as { rating?: string } | undefined;
  if (row?.rating === 'up' || row?.rating === 'down') return row.rating;
  return null;
}

async function toState(
  session: SessionRow,
  userId: string,
  match: MatchRow,
): Promise<GolfHolePromptState> {
  const preference = normalizePreference(session.depth_preference);
  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), GOLF_HOLE_COUNT);
  const completed = !!session.completed_at;
  const ids = await ensurePromptIds(session, preference);
  const promptId = ids[hole - 1] || GOLF_PROMPT_CATALOG[0].id;
  const prompt = getPromptById(promptId) || GOLF_PROMPT_CATALOG[0];

  const answers = await loadAnswers(session.match_id, hole);
  const myRow = answers.find((a) => a.user_id === userId);
  const partnerId = match.user1_id === userId ? match.user2_id : match.user1_id;
  const partnerRow = answers.find((a) => a.user_id === partnerId);
  const bothAnswered = !!myRow && !!partnerRow;

  const myAnswer = answerView(prompt, myRow);
  const partnerAnswer = bothAnswered ? answerView(prompt, partnerRow) : null;

  let sharedInsight: string | null = null;
  if (bothAnswered) {
    const choiceA = myRow?.choice_id
      ? prompt.choices.find((c) => c.id === myRow.choice_id) || null
      : null;
    const choiceB = partnerRow?.choice_id
      ? prompt.choices.find((c) => c.id === partnerRow.choice_id) || null
      : null;
    sharedInsight = computeSharedInsight(prompt, choiceA as GolfPromptChoice | null, choiceB as GolfPromptChoice | null);
    if (!sharedInsight && (myRow?.write_in || partnerRow?.write_in)) {
      sharedInsight = 'You both showed up with a real answer — keep going.';
    }
  }

  const myRating = await loadMyRating(session.match_id, hole, userId);

  return {
    matchId: session.match_id,
    currentHole: hole,
    totalHoles: GOLF_HOLE_COUNT,
    promptId: prompt.id,
    prompt: prompt.text,
    depth: prompt.depth,
    depthPreference: preference,
    choices: prompt.choices.map((c) => ({ id: c.id, label: c.label })),
    myAnswer,
    partnerAnswer,
    partnerHasAnswered: !!partnerRow,
    bothAnswered,
    sharedInsight,
    myRating,
    completed,
    canAdvance: !!myRow && !completed,
    startedAt: session.started_at,
    updatedAt: session.updated_at,
  };
}

async function getSessionRow(matchId: string): Promise<SessionRow | undefined> {
  return (await db
    .prepare('SELECT * FROM golf_hole_prompt_sessions WHERE match_id = ?')
    .get([matchId])) as SessionRow | undefined;
}

export async function getOrCreateGolfHolePromptSession(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);

  let session = await getSessionRow(matchId);

  if (!session) {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_sessions
         (match_id, current_hole, depth_preference, started_at, updated_at)
         VALUES (?, 1, 'auto', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run([matchId]);
    session = await getSessionRow(matchId);
  }

  if (!session) {
    const err = new Error('Failed to create hole prompt session') as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  return toState(session, userId, match);
}

export async function setGolfHoleDepthPreference(
  matchId: string,
  userId: string,
  preference: DepthPreference,
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  if (preference !== 'light' && preference !== 'deeper' && preference !== 'auto') {
    const err = new Error('Invalid depth preference') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  let session = await getSessionRow(matchId);
  if (!session) {
    await getOrCreateGolfHolePromptSession(matchId, userId);
    session = await getSessionRow(matchId);
  }
  if (!session) {
    const err = new Error('Failed to load hole prompt session') as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), GOLF_HOLE_COUNT);
  let ids = parsePromptIds(session.prompt_ids_json);
  const used = new Set(ids.slice(0, hole)); // keep past + current fixed

  // Keep holes 1..current; reassign upcoming holes with new preference
  const nextIds: string[] = [];
  for (let h = 1; h <= GOLF_HOLE_COUNT; h++) {
    if (h <= hole && ids[h - 1]) {
      nextIds.push(ids[h - 1]);
    } else {
      const depth = depthForHole(h, preference);
      const id = pickPromptId(depth, used);
      used.add(id);
      nextIds.push(id);
    }
  }

  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET depth_preference = ?, prompt_ids_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([preference, JSON.stringify(nextIds), matchId]);

  session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

export async function answerGolfHolePrompt(
  matchId: string,
  userId: string,
  body: { choiceId?: string; writeIn?: string },
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  if (state.completed) {
    const err = new Error('Round already complete') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const prompt = getPromptById(state.promptId);
  if (!prompt) {
    const err = new Error('Prompt not found') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const writeIn = typeof body.writeIn === 'string' ? body.writeIn.trim().slice(0, 160) : '';
  const choiceId = typeof body.choiceId === 'string' ? body.choiceId : '';
  const choice = choiceId ? prompt.choices.find((c) => c.id === choiceId) : null;

  if (!choice && !writeIn) {
    const err = new Error('Pick a choice or write a short answer') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  if (choiceId && !choice) {
    const err = new Error('Invalid choice') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const id = uuidv4();
  try {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_answers
         (id, match_id, hole, user_id, choice_id, write_in, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run([id, matchId, state.currentHole, userId, choice?.id || null, writeIn || null]);
  } catch {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_answers
         SET choice_id = ?, write_in = ?, created_at = CURRENT_TIMESTAMP
         WHERE match_id = ? AND hole = ? AND user_id = ?`,
      )
      .run([choice?.id || null, writeIn || null, matchId, state.currentHole, userId]);
  }

  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions SET updated_at = CURRENT_TIMESTAMP WHERE match_id = ?`,
    )
    .run([matchId]);

  const session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

export async function rateGolfHolePrompt(
  matchId: string,
  userId: string,
  rating: 'up' | 'down',
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  if (rating !== 'up' && rating !== 'down') {
    const err = new Error('Rating must be up or down') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  const id = uuidv4();
  try {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_ratings
         (id, match_id, hole, user_id, prompt_id, rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run([id, matchId, state.currentHole, userId, state.promptId, rating]);
  } catch {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_ratings
         SET rating = ?, prompt_id = ?, created_at = CURRENT_TIMESTAMP
         WHERE match_id = ? AND hole = ? AND user_id = ?`,
      )
      .run([rating, state.promptId, matchId, state.currentHole, userId]);
  }

  const session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

export async function advanceGolfHolePrompt(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);

  if (state.completed) {
    return state;
  }

  if (!state.myAnswer) {
    const err = new Error('Answer this hole before advancing') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  // Finished answering hole 18 → complete the round
  if (state.currentHole >= GOLF_HOLE_COUNT) {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_sessions
         SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE match_id = ?`,
      )
      .run([matchId]);
    const sessionDone = await getSessionRow(matchId);
    return toState(sessionDone!, userId, match);
  }

  const nextHole = state.currentHole + 1;
  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET current_hole = ?, updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([nextHole, matchId]);

  const session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

/** Post the current hole prompt into match chat (does not advance). */
export async function shareCurrentGolfHolePrompt(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  await sendHolePromptToChat(matchId, userId, state.currentHole, state.prompt);
  return state;
}

export async function sendHolePromptToChat(
  matchId: string,
  userId: string,
  hole: number,
  promptText?: string,
): Promise<void> {
  const text = promptText || `Hole ${hole}`;
  const content = `⛳ Hole ${hole}: ${text}`;
  const id = uuidv4();
  await db
    .prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`)
    .run([id, matchId, userId, content]);
}
