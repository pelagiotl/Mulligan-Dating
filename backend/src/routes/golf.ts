import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { rateLimitAPI } from '../middleware/security.js';
import { db } from '../database.js';
import { getMedfordGolfCourse, MEDFORD_GOLF_COURSES } from '../data/medfordGolfCourses.js';
import { MATCH_POOL_GOLF_DATE } from '../utils/matchPools.js';

export const golfRouter = Router();

golfRouter.get('/courses', authenticateToken, async (_req: AuthRequest, res) => {
  res.json({ courses: MEDFORD_GOLF_COURSES });
});

type BringingNotes = {
  balls?: boolean;
  tees?: boolean;
  snacks?: boolean;
  other?: string;
};

async function requireGolfMatchMember(matchId: string, userId: string) {
  const row = (await db
    .prepare('SELECT id, user1_id, user2_id, connected_via FROM matches WHERE id = ?')
    .get([matchId])) as
    | { id: string; user1_id: string; user2_id: string; connected_via?: string | null }
    | undefined;
  if (!row) {
    const err = new Error('Match not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (row.user1_id !== userId && row.user2_id !== userId) {
    const err = new Error('Not authorized') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  if ((row.connected_via || '') !== MATCH_POOL_GOLF_DATE) {
    const err = new Error('Golf date planner is for Golf Date matches') as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  return row;
}

function formatBringing(notes: BringingNotes): string {
  const parts: string[] = [];
  if (notes.balls) parts.push('balls');
  if (notes.tees) parts.push('tees');
  if (notes.snacks) parts.push('snacks');
  if (notes.other?.trim()) parts.push(notes.other.trim());
  return parts.length ? parts.join(', ') : 'TBD';
}

golfRouter.get('/date-plans/:matchId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const matchId = req.params.matchId;
    await requireGolfMatchMember(matchId, req.userId!);
    const rows = (await db
      .prepare(
        `SELECT * FROM golf_date_plans WHERE match_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .all([matchId])) as any[];
    res.json({
      plans: rows.map((r) => ({
        id: r.id,
        matchId: r.match_id,
        courseId: r.course_id,
        course: getMedfordGolfCourse(r.course_id) || null,
        proposedAt: r.proposed_at,
        notes: r.notes_json ? JSON.parse(r.notes_json) : {},
        createdBy: r.created_by,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Golf date plans GET error:', error);
    res.status(500).json({ error: 'Failed to load golf date plans' });
  }
});

golfRouter.post('/date-plans/:matchId', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const matchId = req.params.matchId;
    const userId = req.userId!;
    await requireGolfMatchMember(matchId, userId);

    const courseId = String(req.body?.courseId || '');
    const course = getMedfordGolfCourse(courseId);
    if (!course) return res.status(400).json({ error: 'Pick a course from the curated list' });

    const proposedAt = req.body?.proposedAt ? new Date(req.body.proposedAt) : null;
    if (proposedAt && Number.isNaN(proposedAt.getTime())) {
      return res.status(400).json({ error: 'Invalid day/time' });
    }

    const notes: BringingNotes = {
      balls: !!req.body?.notes?.balls,
      tees: !!req.body?.notes?.tees,
      snacks: !!req.body?.notes?.snacks,
      other: typeof req.body?.notes?.other === 'string' ? req.body.notes.other.slice(0, 200) : '',
    };

    const id = uuidv4();
    await db
      .prepare(
        `INSERT INTO golf_date_plans
         (id, match_id, course_id, proposed_at, notes_json, created_by, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'proposed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run([
        id,
        matchId,
        courseId,
        proposedAt ? proposedAt.toISOString() : null,
        JSON.stringify(notes),
        userId,
      ]);

    const whenLabel = proposedAt
      ? proposedAt.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'time TBD';

    const content =
      `⛳ Golf date plan\n` +
      `${course.name} · ${whenLabel}\n` +
      `Bringing: ${formatBringing(notes)}\n` +
      `Book tee time: ${course.bookingUrl}`;

    const msgId = uuidv4();
    await db
      .prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`)
      .run([msgId, matchId, userId, content]);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        io.to(`match:${matchId}`).emit('new_message', {
          id: msgId,
          matchId,
          senderId: userId,
          content,
          sentAt: new Date().toISOString(),
        });
      }
    } catch {
      /* non-fatal */
    }

    res.json({
      plan: {
        id,
        matchId,
        courseId,
        course,
        proposedAt: proposedAt ? proposedAt.toISOString() : null,
        notes,
        createdBy: userId,
        status: 'proposed',
      },
      message: 'Golf date plan shared in chat',
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Golf date plan create error:', error);
    res.status(500).json({ error: 'Failed to create golf date plan' });
  }
});
