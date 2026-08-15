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
export type GolfRoundHoleCount = 9 | 18;

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
  total_holes?: number | null;
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
  totalHoles: number | null;
  needsHoleSelection: boolean;
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
  sharedToChat: boolean;
  myRating: 'up' | 'down' | null;
  completed: boolean;
  canAdvance: boolean;
  startedAt: string;
  updatedAt: string;
};

function normalizeHoleCount(raw: unknown): GolfRoundHoleCount | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (n === 9 || n === 18) return n;
  return null;
}

function sessionHoleCount(session: SessionRow): GolfRoundHoleCount | null {
  const explicit = normalizeHoleCount(session.total_holes);
  if (explicit) return explicit;
  // Legacy sessions created before total_holes existed
  const ids = parsePromptIds(session.prompt_ids_json);
  if (session.completed_at || Number(session.current_hole) > 1 || ids.length > 0) {
    return 18;
  }
  return null;
}

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

type PromptFeedback = {
  likedTags: Set<string>;
  dislikedTags: Set<string>;
};

function promptTags(prompt: GolfPrompt): string[] {
  return Array.from(
    new Set([
      ...prompt.choices.flatMap((choice) => choice.tags),
      ...prompt.insightTemplates.flatMap((template) => template.tags),
    ]),
  );
}

function promptScore(prompt: GolfPrompt, feedback?: PromptFeedback): number {
  if (!feedback || (feedback.likedTags.size === 0 && feedback.dislikedTags.size === 0)) return 0;

  return promptTags(prompt).reduce((score, tag) => {
    // A single "less like this" vote wins over a conflicting like, so the shared
    // deck never pushes either person toward a topic they opted away from.
    if (feedback.dislikedTags.has(tag)) return score - 6;
    if (feedback.likedTags.has(tag)) return score + 2;
    return score;
  }, 0);
}

function pickPromptId(
  depth: GolfPromptDepth,
  used: Set<string>,
  feedback?: PromptFeedback,
): string {
  const pool = shuffle(promptsForDepth(depth).map((p) => p.id)).filter((id) => !used.has(id));
  if (pool.length > 0) {
    if (!feedback || (feedback.likedTags.size === 0 && feedback.dislikedTags.size === 0)) {
      return pool[0];
    }
    return pool.reduce((bestId, id) => {
      const best = getPromptById(bestId);
      const candidate = getPromptById(id);
      if (!best || !candidate) return bestId;
      return promptScore(candidate, feedback) > promptScore(best, feedback) ? id : bestId;
    });
  }
  const anyUnused = shuffle(GOLF_PROMPT_CATALOG.map((p) => p.id)).find((id) => !used.has(id));
  if (anyUnused) return anyUnused;
  return promptsForDepth(depth)[0]?.id || GOLF_PROMPT_CATALOG[0].id;
}

/** Auto depth: Front half light, back half deeper (works for both 9 and 18). */
function depthForHole(
  hole: number,
  preference: DepthPreference,
  totalHoles: GolfRoundHoleCount,
): GolfPromptDepth {
  if (preference === 'light') return 'light';
  if (preference === 'deeper') return 'deeper';
  const frontEnd = Math.ceil(totalHoles / 2);
  return hole <= frontEnd ? 'light' : 'deeper';
}

function normalizePreference(raw: string | null | undefined): DepthPreference {
  if (raw === 'light' || raw === 'deeper' || raw === 'auto') return raw;
  return 'auto';
}

function buildPromptIds(
  totalHoles: GolfRoundHoleCount,
  preference: DepthPreference,
  keepThroughHole: number,
  existingIds: string[],
  feedback?: PromptFeedback,
): string[] {
  const used = new Set(existingIds.slice(0, Math.max(0, keepThroughHole)));
  const nextIds: string[] = [];
  for (let h = 1; h <= totalHoles; h++) {
    if (h <= keepThroughHole && existingIds[h - 1]) {
      nextIds.push(existingIds[h - 1]);
      used.add(existingIds[h - 1]);
    } else {
      const depth = depthForHole(h, preference, totalHoles);
      const id = pickPromptId(depth, used, feedback);
      used.add(id);
      nextIds.push(id);
    }
  }
  return nextIds;
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

async function ensurePromptIds(
  session: SessionRow,
  preference: DepthPreference,
  totalHoles: GolfRoundHoleCount,
): Promise<string[]> {
  let ids = parsePromptIds(session.prompt_ids_json);
  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), totalHoles);
  const feedback = await loadPromptFeedback(session.match_id);
  const nextIds = buildPromptIds(totalHoles, preference, hole, ids, feedback);
  const changed =
    nextIds.length !== ids.length || nextIds.some((id, i) => id !== ids[i]) || !session.prompt_ids_json;

  if (changed) {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_sessions
         SET prompt_ids_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE match_id = ?`,
      )
      .run([JSON.stringify(nextIds), session.match_id]);
  }
  return nextIds;
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

async function loadPromptFeedback(matchId: string): Promise<PromptFeedback> {
  const rows = (await db
    .prepare(
      `SELECT prompt_id, rating
       FROM golf_hole_prompt_ratings
       WHERE match_id = ?`,
    )
    .all([matchId])) as { prompt_id?: string; rating?: string }[];
  const likedTags = new Set<string>();
  const dislikedTags = new Set<string>();

  for (const row of rows || []) {
    if (row.rating !== 'up' && row.rating !== 'down') continue;
    const prompt = row.prompt_id ? getPromptById(row.prompt_id) : null;
    if (!prompt) continue;
    const target = row.rating === 'up' ? likedTags : dislikedTags;
    for (const tag of promptTags(prompt)) target.add(tag);
  }

  return { likedTags, dislikedTags };
}

async function isHolePromptShared(matchId: string, hole: number): Promise<boolean> {
  const row = (await db
    .prepare(
      `SELECT 1 as ok
       FROM golf_hole_prompt_shares
       WHERE match_id = ? AND hole = ?`,
    )
    .get([matchId, hole])) as { ok?: number } | undefined;
  return !!row?.ok;
}

async function toState(
  session: SessionRow,
  userId: string,
  match: MatchRow,
): Promise<GolfHolePromptState> {
  const preference = normalizePreference(session.depth_preference);
  const totalHoles = sessionHoleCount(session);
  const needsHoleSelection = totalHoles == null;
  const completed = !!session.completed_at;
  const effectiveTotal = totalHoles ?? GOLF_HOLE_COUNT;
  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), effectiveTotal);

  let prompt = GOLF_PROMPT_CATALOG[0];
  let myAnswer: GolfHoleAnswerView | null = null;
  let partnerAnswer: GolfHoleAnswerView | null = null;
  let partnerHasAnswered = false;
  let bothAnswered = false;
  let sharedInsight: string | null = null;
  let sharedToChat = false;
  let myRating: 'up' | 'down' | null = null;

  if (!needsHoleSelection && totalHoles) {
    const ids = await ensurePromptIds(session, preference, totalHoles);
    const promptId = ids[hole - 1] || GOLF_PROMPT_CATALOG[0].id;
    prompt = getPromptById(promptId) || GOLF_PROMPT_CATALOG[0];

    const answers = await loadAnswers(session.match_id, hole);
    const myRow = answers.find((a) => a.user_id === userId);
    const partnerId = match.user1_id === userId ? match.user2_id : match.user1_id;
    const partnerRow = answers.find((a) => a.user_id === partnerId);
    bothAnswered = !!myRow && !!partnerRow;
    partnerHasAnswered = !!partnerRow;
    myAnswer = answerView(prompt, myRow);
    partnerAnswer = bothAnswered ? answerView(prompt, partnerRow) : null;

    if (bothAnswered) {
      const choiceA = myRow?.choice_id
        ? prompt.choices.find((c) => c.id === myRow.choice_id) || null
        : null;
      const choiceB = partnerRow?.choice_id
        ? prompt.choices.find((c) => c.id === partnerRow.choice_id) || null
        : null;
      sharedInsight = computeSharedInsight(
        prompt,
        choiceA as GolfPromptChoice | null,
        choiceB as GolfPromptChoice | null,
      );
      if (!sharedInsight && (myRow?.write_in || partnerRow?.write_in)) {
        sharedInsight = 'You both showed up with a real answer — keep going.';
      }
    }
    myRating = await loadMyRating(session.match_id, hole, userId);
    sharedToChat = await isHolePromptShared(session.match_id, hole);
  }

  return {
    matchId: session.match_id,
    currentHole: hole,
    totalHoles,
    needsHoleSelection,
    promptId: prompt.id,
    prompt: needsHoleSelection ? 'Pick 9 or 18 holes to start this round.' : prompt.text,
    depth: prompt.depth,
    depthPreference: preference,
    choices: needsHoleSelection ? [] : prompt.choices.map((c) => ({ id: c.id, label: c.label })),
    myAnswer,
    partnerAnswer,
    partnerHasAnswered,
    bothAnswered,
    sharedInsight,
    sharedToChat,
    myRating,
    completed,
    canAdvance: !!myAnswer && !completed && !needsHoleSelection,
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

  const totalHoles = sessionHoleCount(session);
  if (!totalHoles) {
    const err = new Error('Pick 9 or 18 holes first') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), totalHoles);
  const ids = parsePromptIds(session.prompt_ids_json);
  // Keep past holes only. Replace the current prompt (and futures) so "Go a bit deeper"
  // actually swaps the visible question — unless someone already answered this hole.
  const answersOnCurrent = await loadAnswers(matchId, hole);
  const keepThroughHole = answersOnCurrent.length > 0 ? hole : Math.max(0, hole - 1);
  const nextIds = buildPromptIds(totalHoles, preference, keepThroughHole, ids);
  const currentPromptChanged =
    keepThroughHole < hole && (nextIds[hole - 1] || '') !== (ids[hole - 1] || '');

  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET depth_preference = ?, prompt_ids_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([preference, JSON.stringify(nextIds), matchId]);

  if (currentPromptChanged) {
    await db
      .prepare(`DELETE FROM golf_hole_prompt_ratings WHERE match_id = ? AND hole = ?`)
      .run([matchId, hole]);
  }

  session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

/** Set or change round length (9 or 18). Safe before answering starts; otherwise use restart. */
export async function configureGolfHolePromptSession(
  matchId: string,
  userId: string,
  totalHoles: GolfRoundHoleCount,
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  if (totalHoles !== 9 && totalHoles !== 18) {
    const err = new Error('totalHoles must be 9 or 18') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  await getOrCreateGolfHolePromptSession(matchId, userId);
  let session = await getSessionRow(matchId);
  if (!session) {
    const err = new Error('Failed to load hole prompt session') as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  const preference = normalizePreference(session.depth_preference);
  const alreadyStarted = Number(session.current_hole) > 1 || !!session.completed_at;
  const answersExist = (await db
    .prepare(`SELECT 1 as ok FROM golf_hole_prompt_answers WHERE match_id = ? LIMIT 1`)
    .get([matchId])) as { ok?: number } | undefined;

  if ((alreadyStarted || answersExist) && sessionHoleCount(session) != null) {
    const err = new Error('Round already started — use restart for a new 9 or 18') as Error & {
      status?: number;
    };
    err.status = 400;
    throw err;
  }

  const ids = buildPromptIds(totalHoles, preference, 0, []);
  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET total_holes = ?,
           current_hole = 1,
           prompt_ids_json = ?,
           completed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([totalHoles, JSON.stringify(ids), matchId]);

  session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

/** Wipe answers/ratings and start a fresh round at 9 or 18 holes. */
export async function restartGolfHolePromptSession(
  matchId: string,
  userId: string,
  totalHoles: GolfRoundHoleCount,
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  if (totalHoles !== 9 && totalHoles !== 18) {
    const err = new Error('totalHoles must be 9 or 18') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  await getOrCreateGolfHolePromptSession(matchId, userId);
  await db.prepare(`DELETE FROM golf_hole_prompt_answers WHERE match_id = ?`).run([matchId]);
  await db.prepare(`DELETE FROM golf_hole_prompt_ratings WHERE match_id = ?`).run([matchId]);
  await db.prepare(`DELETE FROM golf_hole_prompt_shares WHERE match_id = ?`).run([matchId]);

  const preference: DepthPreference = 'auto';
  const ids = buildPromptIds(totalHoles, preference, 0, []);
  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET total_holes = ?,
           current_hole = 1,
           prompt_ids_json = ?,
           depth_preference = 'auto',
           completed_at = NULL,
           started_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([totalHoles, JSON.stringify(ids), matchId]);

  const session = await getSessionRow(matchId);
  return toState(session!, userId, match);
}

export async function answerGolfHolePrompt(
  matchId: string,
  userId: string,
  body: { choiceId?: string; writeIn?: string },
): Promise<GolfHolePromptState> {
  const match = await requireGolfMatch(matchId, userId);
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  if (state.needsHoleSelection) {
    const err = new Error('Pick 9 or 18 holes first') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
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
  if (!session) {
    const err = new Error('Failed to load hole prompt session') as Error & { status?: number };
    err.status = 500;
    throw err;
  }

  // Keep the rated hole and every past answer unchanged. Rebuild only future holes
  // with the pair's combined feedback: likes are favored, while either person's
  // dislike takes priority so the shared deck stays comfortable for both people.
  const totalHoles = sessionHoleCount(session);
  if (totalHoles && !session.completed_at) {
    const preference = normalizePreference(session.depth_preference);
    const existingIds = parsePromptIds(session.prompt_ids_json);
    const feedback = await loadPromptFeedback(matchId);
    const nextIds = buildPromptIds(
      totalHoles,
      preference,
      Math.min(state.currentHole, totalHoles),
      existingIds,
      feedback,
    );
    await db
      .prepare(
        `UPDATE golf_hole_prompt_sessions
         SET prompt_ids_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE match_id = ?`,
      )
      .run([JSON.stringify(nextIds), matchId]);
  }

  const updatedSession = await getSessionRow(matchId);
  return toState(updatedSession!, userId, match);
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

  if (state.needsHoleSelection || !state.totalHoles) {
    const err = new Error('Pick 9 or 18 holes first') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  if (!state.myAnswer) {
    const err = new Error('Answer this hole before advancing') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const totalHoles = state.totalHoles;

  // Finished answering last hole → complete the round
  if (state.currentHole >= totalHoles) {
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
  if (state.needsHoleSelection) {
    const err = new Error('Pick 9 or 18 holes first') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  if (!state.myAnswer) {
    const err = new Error('Answer this hole before sharing it') as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  await sendHolePromptToChat(matchId, userId, state.currentHole, state.prompt, state.promptId);
  const session = await getSessionRow(matchId);
  const match = await requireGolfMatch(matchId, userId);
  return toState(session!, userId, match);
}

/** Post one copy of a hole prompt into match chat. Retries are intentionally idempotent. */
export async function sendHolePromptToChat(
  matchId: string,
  userId: string,
  hole: number,
  promptText?: string,
  promptId = '',
): Promise<void> {
  const shareId = uuidv4();
  try {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_shares
         (id, match_id, hole, prompt_id, shared_by, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run([shareId, matchId, hole, promptId, userId]);
  } catch (error) {
    // The unique match/hole constraint makes retries and simultaneous taps safe;
    // propagate any other database failure instead of pretending the share succeeded.
    if (await isHolePromptShared(matchId, hole)) return;
    throw error;
  }

  const text = promptText || `Hole ${hole}`;
  const content = `⛳ Hole ${hole}: ${text}`;
  try {
    await db
      .prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`)
      .run([uuidv4(), matchId, userId, content]);
  } catch (error) {
    // A failed write must leave the prompt eligible to share again.
    await db.prepare(`DELETE FROM golf_hole_prompt_shares WHERE id = ?`).run([shareId]);
    throw error;
  }
}
