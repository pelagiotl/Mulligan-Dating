import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { sendPushNotification, isExpoPushToken } from './pushNotifications.js';
import { getIO } from '../socket.js';

export type SecondDateInterest = 'yes' | 'no' | 'maybe';

export type DateReflection = {
  id: string;
  matchId: string;
  userId: string;
  wentWell: string;
  secondDateInterest: SecondDateInterest;
  extraNotes: string | null;
  voiceNoteUrl: string | null;
  createdAt: string;
};

const POSITIVE_INTEREST = new Set<SecondDateInterest>(['yes', 'maybe']);

function interestIsPositive(interest: string): boolean {
  return POSITIVE_INTEREST.has(interest as SecondDateInterest);
}

async function getMatchParticipants(matchId: string): Promise<{
  user1Id: string;
  user2Id: string;
  user1Name: string;
  user2Name: string;
} | null> {
  const row = await (db
    .prepare(
      `SELECT m.user1_id, m.user2_id, p1.display_name AS user1_name, p2.display_name AS user2_name
       FROM matches m
       JOIN profiles p1 ON p1.user_id = m.user1_id
       JOIN profiles p2 ON p2.user_id = m.user2_id
       WHERE m.id = ?`,
    )
    .get([matchId]) as Promise<
    | {
        user1_id: string;
        user2_id: string;
        user1_name: string;
        user2_name: string;
      }
    | undefined
  >);
  if (!row) return null;
  return {
    user1Id: row.user1_id,
    user2Id: row.user2_id,
    user1Name: row.user1_name,
    user2Name: row.user2_name,
  };
}

export async function saveDateReflection(
  userId: string,
  input: {
    matchId: string;
    wentWell: string;
    secondDateInterest: SecondDateInterest;
    extraNotes?: string;
    voiceNoteUrl?: string;
  },
): Promise<{ reflection: DateReflection; mutualSecondDate: boolean }> {
  const participants = await getMatchParticipants(input.matchId);
  if (!participants) {
    throw new Error('Match not found');
  }
  if (userId !== participants.user1Id && userId !== participants.user2Id) {
    throw new Error('Not authorized for this match');
  }

  const existing = await (db
    .prepare(
      'SELECT id, second_date_interest, partner_nudge_sent_at FROM date_reflections WHERE match_id = ? AND user_id = ?',
    )
    .get([input.matchId, userId]) as Promise<
    { id: string; second_date_interest: string; partner_nudge_sent_at: string | null } | undefined
  >);

  const reflectionId = existing?.id ?? uuidv4();

  if (existing) {
    await db
      .prepare(
        `UPDATE date_reflections
         SET went_well = ?, second_date_interest = ?, extra_notes = ?, voice_note_url = ?
         WHERE id = ?`,
      )
      .run([
        input.wentWell.trim(),
        input.secondDateInterest,
        input.extraNotes?.trim() || null,
        input.voiceNoteUrl?.trim() || null,
        reflectionId,
      ]);
  } else {
    await db
      .prepare(
        `INSERT INTO date_reflections
         (id, match_id, user_id, went_well, second_date_interest, extra_notes, voice_note_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      )
      .run([
        reflectionId,
        input.matchId,
        userId,
        input.wentWell.trim(),
        input.secondDateInterest,
        input.extraNotes?.trim() || null,
        input.voiceNoteUrl?.trim() || null,
      ]);
  }

  const reflection: DateReflection = {
    id: reflectionId,
    matchId: input.matchId,
    userId,
    wentWell: input.wentWell.trim(),
    secondDateInterest: input.secondDateInterest,
    extraNotes: input.extraNotes?.trim() || null,
    voiceNoteUrl: input.voiceNoteUrl?.trim() || null,
    createdAt: new Date().toISOString(),
  };

  const mutualSecondDate = await maybeNotifyMutualSecondDate(input.matchId, participants);
  if (!mutualSecondDate && interestIsPositive(input.secondDateInterest)) {
    await maybeNotifyPartnerReflectionNudge(input.matchId, userId, reflectionId, participants);
  }
  return { reflection, mutualSecondDate };
}

async function maybeNotifyPartnerReflectionNudge(
  matchId: string,
  submitterId: string,
  reflectionId: string,
  participants: { user1Id: string; user2Id: string; user1Name: string; user2Name: string },
): Promise<void> {
  const nudgeRow = await (db
    .prepare('SELECT partner_nudge_sent_at FROM date_reflections WHERE id = ?')
    .get([reflectionId]) as Promise<{ partner_nudge_sent_at: string | null } | undefined>);
  if (nudgeRow?.partner_nudge_sent_at) return;

  const allRows = await (db
    .prepare('SELECT user_id FROM date_reflections WHERE match_id = ?')
    .all([matchId]) as Promise<Array<{ user_id: string }>>);
  if (allRows.length >= 2) return;

  const partnerId = submitterId === participants.user1Id ? participants.user2Id : participants.user1Id;
  const submitterName =
    submitterId === participants.user1Id ? participants.user1Name : participants.user2Name;

  const title = 'Post-date reflection';
  const body = `${submitterName} shared a private reflection — add yours when you're ready.`;

  await db
    .prepare('UPDATE date_reflections SET partner_nudge_sent_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run([reflectionId]);

  const io = getIO();
  if (io) {
    io.to(`user:${partnerId}`).emit('date_reflection_nudge', {
      matchId,
      submitterName,
      title,
      body,
    });
  }

  const tokenRow = await (db
    .prepare('SELECT push_token FROM users WHERE id = ?')
    .get([partnerId]) as Promise<{ push_token: string | null } | undefined>);
  const token = tokenRow?.push_token;
  if (token && isExpoPushToken(token)) {
    await sendPushNotification(token, title, body, {
      type: 'date_reflection_nudge',
      matchId,
      submitterName,
    });
  }
}

async function maybeNotifyMutualSecondDate(
  matchId: string,
  participants: { user1Id: string; user2Id: string; user1Name: string; user2Name: string },
): Promise<boolean> {
  const rows = await (db
    .prepare(
      `SELECT user_id, second_date_interest, mutual_notified_at
       FROM date_reflections WHERE match_id = ?`,
    )
    .all([matchId]) as Promise<
    Array<{ user_id: string; second_date_interest: string; mutual_notified_at: string | null }>
  >);

  if (rows.length < 2) return false;

  const bothPositive = rows.every((r) => interestIsPositive(r.second_date_interest));
  if (!bothPositive) return false;

  if (rows.some((r) => r.mutual_notified_at)) return true;

  await db
    .prepare(`UPDATE date_reflections SET mutual_notified_at = CURRENT_TIMESTAMP WHERE match_id = ?`)
    .run([matchId]);

  const io = getIO();
  for (const row of rows) {
    const otherName =
      row.user_id === participants.user1Id ? participants.user2Name : participants.user1Name;

    const title = 'Second date vibes ❤️';
    const body = `Great news! ${otherName} also wants a second date. Ready to plan the next one?`;

    if (io) {
      io.to(`user:${row.user_id}`).emit('second_date_match', {
        matchId,
        partnerName: otherName,
        title,
        body,
      });
    }

    const tokenRow = await (db
      .prepare('SELECT push_token FROM users WHERE id = ?')
      .get([row.user_id]) as Promise<{ push_token: string | null } | undefined>);
    const token = tokenRow?.push_token;
    if (token && isExpoPushToken(token)) {
      await sendPushNotification(token, title, body, {
        type: 'second_date_match',
        matchId,
        partnerName: otherName,
      });
    }
  }

  return true;
}

export async function getDateReflectionStatus(
  userId: string,
  matchId: string,
): Promise<{
  mine: DateReflection | null;
  partnerSubmitted: boolean;
  mutualSecondDate: boolean;
}> {
  const participants = await getMatchParticipants(matchId);
  if (!participants) {
    throw new Error('Match not found');
  }
  if (userId !== participants.user1Id && userId !== participants.user2Id) {
    throw new Error('Not authorized for this match');
  }

  const rows = await (db
    .prepare(
      `SELECT id, match_id, user_id, went_well, second_date_interest, extra_notes, voice_note_url, created_at, mutual_notified_at
       FROM date_reflections WHERE match_id = ?`,
    )
    .all([matchId]) as Promise<
    Array<{
      id: string;
      match_id: string;
      user_id: string;
      went_well: string;
      second_date_interest: string;
      extra_notes: string | null;
      voice_note_url: string | null;
      created_at: string;
      mutual_notified_at: string | null;
    }>
  >);

  const mineRow = rows.find((r) => r.user_id === userId);
  const partnerRow = rows.find((r) => r.user_id !== userId);

  const mine = mineRow
    ? {
        id: mineRow.id,
        matchId: mineRow.match_id,
        userId: mineRow.user_id,
        wentWell: mineRow.went_well,
        secondDateInterest: mineRow.second_date_interest as SecondDateInterest,
        extraNotes: mineRow.extra_notes,
        voiceNoteUrl: mineRow.voice_note_url,
        createdAt: mineRow.created_at,
      }
    : null;

  const mutualSecondDate =
    rows.length >= 2 &&
    rows.every((r) => interestIsPositive(r.second_date_interest)) &&
    !!rows[0]?.mutual_notified_at;

  return {
    mine,
    partnerSubmitted: !!partnerRow,
    mutualSecondDate,
  };
}
