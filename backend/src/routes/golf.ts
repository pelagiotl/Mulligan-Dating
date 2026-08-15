import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { rateLimitAPI } from '../middleware/security.js';
import { db } from '../database.js';
import { getMedfordGolfCourse, MEDFORD_GOLF_COURSES } from '../data/medfordGolfCourses.js';
import { MATCH_POOL_GOLF_DATE } from '../utils/matchPools.js';
import {
  formatGolfWhenLabel,
  golfDatePlanFallbackContent,
  serializeGolfDatePlanForMessage,
  type GolfDatePlanBringingNotes,
} from '../services/golfDatePlanMessage.js';

export const golfRouter = Router();

golfRouter.get('/courses', authenticateToken, async (_req: AuthRequest, res) => {
  res.json({ courses: MEDFORD_GOLF_COURSES });
});

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

    const notes: GolfDatePlanBringingNotes = {
      balls: !!req.body?.notes?.balls,
      tees: !!req.body?.notes?.tees,
      snacks: !!req.body?.notes?.snacks,
      other: typeof req.body?.notes?.other === 'string' ? req.body.notes.other.slice(0, 200) : '',
    };

    const id = uuidv4();
    const proposedAtIso = proposedAt ? proposedAt.toISOString() : null;
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
        proposedAtIso,
        JSON.stringify(notes),
        userId,
      ]);

    const whenLabel = formatGolfWhenLabel(proposedAtIso);

    const golfDatePlan = serializeGolfDatePlanForMessage({
      id,
      courseId,
      course,
      proposedAt: proposedAtIso,
      notes,
      status: 'proposed',
      createdBy: userId,
    });
    if (!golfDatePlan) {
      return res.status(500).json({ error: 'Failed to build golf date plan message' });
    }

    const content = golfDatePlanFallbackContent(golfDatePlan, whenLabel);

    const profileResult = await db
      .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
      .get([userId]);
    const profile = profileResult as { display_name: string | null } | undefined;
    const proposerName = profile?.display_name || 'Someone';

    const msgId = uuidv4();
    await db
      .prepare(
        `INSERT INTO messages (id, match_id, sender_id, content, golf_date_plan_id) VALUES (?, ?, ?, ?, ?)`,
      )
      .run([msgId, matchId, userId, content, id]);

    try {
      const { getIO } = await import('../socket.js');
      const io = getIO();
      if (io) {
        const payload = {
          id: msgId,
          matchId,
          senderId: userId,
          senderName: proposerName,
          content,
          sentAt: new Date().toISOString(),
          readAt: null,
          golfDatePlan,
        };
        io.to(`match:${matchId}`).emit('new_message', payload);
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
        proposedAt: proposedAtIso,
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

/** Recipient (not the creator) can suggest a new tee time on an invite. */
golfRouter.put(
  '/date-plans/:matchId/:planId',
  authenticateToken,
  rateLimitAPI,
  async (req: AuthRequest, res) => {
    try {
      const matchId = req.params.matchId;
      const planId = req.params.planId;
      const userId = req.userId!;
      await requireGolfMatchMember(matchId, userId);

      const planRow = (await db
        .prepare(`SELECT * FROM golf_date_plans WHERE id = ? AND match_id = ?`)
        .get([planId, matchId])) as
        | {
            id: string;
            match_id: string;
            course_id: string;
            proposed_at: string | null;
            notes_json: string | null;
            created_by: string;
            status: string;
          }
        | undefined;

      if (!planRow) {
        return res.status(404).json({ error: 'Golf date plan not found' });
      }
      if (planRow.created_by === userId) {
        return res.status(400).json({
          error: 'Only your match can suggest a different tee time on this invite',
        });
      }

      const proposedAt = req.body?.proposedAt ? new Date(req.body.proposedAt) : null;
      if (!proposedAt || Number.isNaN(proposedAt.getTime())) {
        return res.status(400).json({ error: 'Pick a valid day and time' });
      }
      const proposedAtIso = proposedAt.toISOString();

      await db
        .prepare(
          `UPDATE golf_date_plans
           SET proposed_at = ?, updated_at = CURRENT_TIMESTAMP, status = 'proposed'
           WHERE id = ?`,
        )
        .run([proposedAtIso, planId]);

      let notes: GolfDatePlanBringingNotes = {};
      if (planRow.notes_json) {
        try {
          notes = JSON.parse(planRow.notes_json) as GolfDatePlanBringingNotes;
        } catch {
          notes = {};
        }
      }

      const golfDatePlan = serializeGolfDatePlanForMessage({
        id: planId,
        courseId: planRow.course_id,
        proposedAt: proposedAtIso,
        notes,
        status: 'proposed',
        createdBy: planRow.created_by,
      });
      if (!golfDatePlan) {
        return res.status(500).json({ error: 'Failed to update golf date plan' });
      }

      const whenLabel = formatGolfWhenLabel(proposedAtIso);
      const content = golfDatePlanFallbackContent(golfDatePlan, whenLabel);

      const inviteMsg = (await db
        .prepare(
          `SELECT id FROM messages WHERE match_id = ? AND golf_date_plan_id = ? ORDER BY sent_at ASC LIMIT 1`,
        )
        .get([matchId, planId])) as { id: string } | undefined;

      if (inviteMsg?.id) {
        await db
          .prepare(`UPDATE messages SET content = ? WHERE id = ?`)
          .run([content, inviteMsg.id]);
      }

      const profileResult = await db
        .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
        .get([userId]);
      const profile = profileResult as { display_name: string | null } | undefined;
      const adjusterName = profile?.display_name || 'Someone';

      const noteId = uuidv4();
      const noteContent = `🗓️ ${adjusterName} suggested a new tee time: ${whenLabel}`;
      await db
        .prepare(`INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`)
        .run([noteId, matchId, userId, noteContent]);

      try {
        const { getIO } = await import('../socket.js');
        const io = getIO();
        if (io) {
          if (inviteMsg?.id) {
            io.to(`match:${matchId}`).emit('golf_date_plan_updated', {
              matchId,
              messageId: inviteMsg.id,
              content,
              golfDatePlan,
            });
          }
          io.to(`match:${matchId}`).emit('new_message', {
            id: noteId,
            matchId,
            senderId: userId,
            senderName: adjusterName,
            content: noteContent,
            sentAt: new Date().toISOString(),
            readAt: null,
          });
        }
      } catch {
        /* non-fatal */
      }

      res.json({
        plan: {
          id: planId,
          matchId,
          courseId: planRow.course_id,
          course: getMedfordGolfCourse(planRow.course_id) || null,
          proposedAt: proposedAtIso,
          notes,
          createdBy: planRow.created_by,
          status: 'proposed',
        },
        messageId: inviteMsg?.id || null,
        golfDatePlan,
        message: 'Tee time updated',
      });
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('Golf date plan PUT error:', error);
      res.status(500).json({ error: 'Failed to update tee time' });
    }
  },
);