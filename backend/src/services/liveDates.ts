import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { notifyLiveDateSignup } from './liveDateNotifications.js';
import { liveEventAtForApi, liveEventAtForDb } from './liveDateTime.js';

export const MULLIGAN_LIVE_DATES_EVENT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const FEATURED_EVENT = {
  id: MULLIGAN_LIVE_DATES_EVENT_ID,
  title: 'Mulligan Live Dates',
  description: `Speed dating IRL — 5-minute rounds, then music, food trucks, and time to keep talking.

Low pressure, gated venue, built for real connections. Only 25 spots for our first night.`,
  venueName: 'Mulligan Live Dates',
  venueAddress: '812 S Riverside, Medford, OR 97501',
  /** 5:30 PM Pacific — offset re-applied on API read (TIMESTAMP columns lose tz). */
  eventAt: '2026-07-25T17:30:00-07:00',
  foodTrucks: [] as string[],
  capacity: 25,
};

export type LiveDateEvent = {
  id: string;
  title: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  eventAt: string;
  foodTrucks: string[];
  capacity: number;
  signupCount: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  isSignedUp: boolean;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  event_at: string;
  food_trucks: string | null;
  capacity: number;
};

function parseFoodTrucks(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function parseCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseGenderCounts(gender: string | null, count: number): {
  male: number;
  female: number;
  other: number;
} {
  const g = (gender ?? '').trim().toLowerCase();
  if (g === 'man' || g === 'male') return { male: count, female: 0, other: 0 };
  if (g === 'woman' || g === 'female') return { male: 0, female: count, other: 0 };
  return { male: 0, female: 0, other: count };
}

async function ensureFeaturedEvent(): Promise<void> {
  await db
    .prepare('UPDATE live_date_events SET is_published = 0 WHERE id != ?')
    .run([FEATURED_EVENT.id]);

  const existing = await (db
    .prepare('SELECT id FROM live_date_events WHERE id = ?')
    .get([FEATURED_EVENT.id]) as Promise<{ id: string } | undefined>);

  if (existing) {
    await db
      .prepare(
        `UPDATE live_date_events
         SET title = ?, description = ?, venue_name = ?, venue_address = ?, event_at = ?,
             food_trucks = ?, capacity = ?, is_published = 1
         WHERE id = ?`,
      )
      .run([
        FEATURED_EVENT.title,
        FEATURED_EVENT.description,
        FEATURED_EVENT.venueName,
        FEATURED_EVENT.venueAddress,
        liveEventAtForDb(FEATURED_EVENT.eventAt),
        JSON.stringify(FEATURED_EVENT.foodTrucks),
        FEATURED_EVENT.capacity,
        FEATURED_EVENT.id,
      ]);
    return;
  }

  await db
    .prepare(
      `INSERT INTO live_date_events
       (id, title, description, venue_name, venue_address, event_at, food_trucks, capacity, is_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run([
      FEATURED_EVENT.id,
      FEATURED_EVENT.title,
      FEATURED_EVENT.description,
      FEATURED_EVENT.venueName,
      FEATURED_EVENT.venueAddress,
      liveEventAtForDb(FEATURED_EVENT.eventAt),
      JSON.stringify(FEATURED_EVENT.foodTrucks),
      FEATURED_EVENT.capacity,
    ]);
}

export async function listLiveDateEvents(userId: string): Promise<LiveDateEvent[]> {
  await ensureFeaturedEvent();

  const events = await (db
    .prepare(
      `SELECT id, title, description, venue_name, venue_address, event_at, food_trucks, capacity
       FROM live_date_events
       WHERE is_published = 1 AND event_at >= CURRENT_TIMESTAMP
       ORDER BY event_at ASC`,
    )
    .all([]) as Promise<EventRow[]>);

  const mySignups = await (db
    .prepare('SELECT event_id FROM live_date_signups WHERE user_id = ?')
    .all([userId]) as Promise<Array<{ event_id: string }>>);
  const signedSet = new Set(mySignups.map((s) => s.event_id));

  const result: LiveDateEvent[] = [];
  for (const e of events) {
    const stats = await (db
      .prepare(
        `SELECT p.gender, COUNT(*) AS c
         FROM live_date_signups s
         JOIN profiles p ON p.user_id = s.user_id
         WHERE s.event_id = ?
         GROUP BY p.gender`,
      )
      .all([e.id]) as Promise<Array<{ gender: string; c: number }>>);

    let maleCount = 0;
    let femaleCount = 0;
    let otherCount = 0;
    let signupCount = 0;
    for (const row of stats) {
      const count = parseCount(row.c);
      signupCount += count;
      const split = parseGenderCounts(row.gender, count);
      maleCount += split.male;
      femaleCount += split.female;
      otherCount += split.other;
    }

    result.push({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue_name,
      venueAddress: e.venue_address,
      eventAt: liveEventAtForApi(e.event_at),
      foodTrucks: parseFoodTrucks(e.food_trucks),
      capacity: e.capacity,
      signupCount,
      maleCount,
      femaleCount,
      otherCount,
      isSignedUp: signedSet.has(e.id),
    });
  }

  return result;
}

export async function signupForLiveDate(
  userId: string,
  eventId: string,
): Promise<{ signupId: string; event: LiveDateEvent; emailSent: boolean; pushSent: boolean }> {
  const event = await (db
    .prepare(
      `SELECT id, title, description, venue_name, venue_address, event_at, food_trucks, capacity
       FROM live_date_events WHERE id = ? AND is_published = 1`,
    )
    .get([eventId]) as Promise<EventRow | undefined>);
  if (!event) throw new Error('Event not found');

  const existing = await (db
    .prepare('SELECT id FROM live_date_signups WHERE event_id = ? AND user_id = ?')
    .get([eventId, userId]) as Promise<{ id: string } | undefined>);
  if (existing) {
    const events = await listLiveDateEvents(userId);
    const current = events.find((x) => x.id === eventId);
    if (!current) throw new Error('Event not found');
    return { signupId: existing.id, event: current, emailSent: false, pushSent: false };
  }

  const countRow = await (db
    .prepare('SELECT COUNT(*) AS c FROM live_date_signups WHERE event_id = ?')
    .get([eventId]) as Promise<{ c: number } | undefined>);
  if (parseCount(countRow?.c) >= event.capacity) {
    throw new Error('This event is full');
  }

  const signupId = uuidv4();
  await db
    .prepare('INSERT INTO live_date_signups (id, event_id, user_id) VALUES (?, ?, ?)')
    .run([signupId, eventId, userId]);

  const notifyResult = await notifyLiveDateSignup(userId, {
    id: event.id,
    title: event.title,
    venue_address: event.venue_address,
    event_at: event.event_at,
  });

  const events = await listLiveDateEvents(userId);
  const current = events.find((x) => x.id === eventId);
  if (!current) throw new Error('Event not found');
  return {
    signupId,
    event: current,
    emailSent: notifyResult.emailSent,
    pushSent: notifyResult.pushSent,
  };
}

export async function listUserLiveDateTickets(userId: string): Promise<LiveDateEvent[]> {
  const events = await listLiveDateEvents(userId);
  return events.filter((e) => e.isSignedUp);
}
