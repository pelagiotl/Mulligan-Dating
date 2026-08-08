import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { GOLF_HOLE_COUNT, promptForHole } from '../constants/golfHolePrompts.js';
import { MATCH_POOL_GOLF_DATE } from '../utils/matchPools.js';

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
};

export type GolfHolePromptState = {
  matchId: string;
  currentHole: number;
  totalHoles: number;
  prompt: string;
  completed: boolean;
  startedAt: string;
  updatedAt: string;
};

function toState(session: SessionRow): GolfHolePromptState {
  const hole = Math.min(Math.max(Number(session.current_hole) || 1, 1), GOLF_HOLE_COUNT);
  const completed = !!session.completed_at || hole >= GOLF_HOLE_COUNT;
  return {
    matchId: session.match_id,
    currentHole: hole,
    totalHoles: GOLF_HOLE_COUNT,
    prompt: promptForHole(hole),
    completed,
    startedAt: session.started_at,
    updatedAt: session.updated_at,
  };
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

export async function getOrCreateGolfHolePromptSession(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  await requireGolfMatch(matchId, userId);

  let session = (await db
    .prepare('SELECT * FROM golf_hole_prompt_sessions WHERE match_id = ?')
    .get([matchId])) as SessionRow | undefined;

  if (!session) {
    await db
      .prepare(
        `INSERT INTO golf_hole_prompt_sessions (match_id, current_hole, started_at, updated_at)
         VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run([matchId]);
    session = (await db
      .prepare('SELECT * FROM golf_hole_prompt_sessions WHERE match_id = ?')
      .get([matchId])) as SessionRow;
  }

  return toState(session);
}

export async function advanceGolfHolePrompt(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  if (state.completed || state.currentHole >= GOLF_HOLE_COUNT) {
    await db
      .prepare(
        `UPDATE golf_hole_prompt_sessions
         SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
         WHERE match_id = ?`,
      )
      .run([matchId]);
    return { ...state, completed: true, currentHole: GOLF_HOLE_COUNT, prompt: promptForHole(GOLF_HOLE_COUNT) };
  }

  const nextHole = state.currentHole + 1;
  const completed = nextHole >= GOLF_HOLE_COUNT;
  await db
    .prepare(
      `UPDATE golf_hole_prompt_sessions
       SET current_hole = ?,
           completed_at = ${completed ? 'COALESCE(completed_at, CURRENT_TIMESTAMP)' : 'completed_at'},
           updated_at = CURRENT_TIMESTAMP
       WHERE match_id = ?`,
    )
    .run([nextHole, matchId]);

  const session = (await db
    .prepare('SELECT * FROM golf_hole_prompt_sessions WHERE match_id = ?')
    .get([matchId])) as SessionRow;

  return toState(session);
}

/** Post the current hole prompt into match chat (does not advance). */
export async function shareCurrentGolfHolePrompt(
  matchId: string,
  userId: string,
): Promise<GolfHolePromptState> {
  const state = await getOrCreateGolfHolePromptSession(matchId, userId);
  await sendHolePromptToChat(matchId, userId, state.currentHole);
  return state;
}

/** Optional: post current prompt into match chat as a message from the advancing user. */
export async function sendHolePromptToChat(
  matchId: string,
  userId: string,
  hole: number,
): Promise<void> {
  const content = `⛳ ${promptForHole(hole)}`;
  const id = uuidv4();
  await db
    .prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`)
    .run([id, matchId, userId, content]);
}
