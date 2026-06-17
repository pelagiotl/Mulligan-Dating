import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { sendPushNotification, isExpoPushToken } from './pushNotifications.js';

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

async function ensureSampleEvents(): Promise<void> {
  const countRow = await (db
    .prepare('SELECT COUNT(*) AS c FROM live_date_events WHERE is_published = 1')
    .get([]) as Promise<{ c: number } | undefined>);
  if ((countRow?.c ?? 0) > 0) return;

  const samples = [
    {
      title: 'Mulligan Live — Medford Mixer',
      description:
        'Speed-dating rounds, live DJ, and food trucks on the plaza. Come solo — we pair you with great Southern Oregon matches IRL.',
      venueName: 'Pearson Plaza',
      venueAddress: '415 W Main St, Medford, OR',
      daysFromNow: 14,
      foodTrucks: ['Taco Bus', 'River City Coffee', 'Farmstand Fry'],
      capacity: 48,
    },
    {
      title: 'Ashland Sunset Social',
      description:
        'Relaxed outdoor mixer with guided intros and lawn games. Perfect if you want a low-pressure first meetup.',
      venueName: 'Lithia Park Bandshell Lawn',
      venueAddress: 'Lithia Park, Ashland, OR',
      daysFromNow: 28,
      foodTrucks: ['Nomad Bowl', 'Sweet Spot Desserts'],
      capacity: 36,
    },
  ];

  for (const s of samples) {
    const eventAt = new Date();
    eventAt.setDate(eventAt.getDate() + s.daysFromNow);
    eventAt.setHours(18, 30, 0, 0);
    await db
      .prepare(
        `INSERT INTO live_date_events
         (id, title, description, venue_name, venue_address, event_at, food_trucks, capacity, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run([
        uuidv4(),
        s.title,
        s.description,
        s.venueName,
        s.venueAddress,
        eventAt.toISOString(),
        JSON.stringify(s.foodTrucks),
        s.capacity,
      ]);
  }
}

export async function listLiveDateEvents(userId: string): Promise<LiveDateEvent[]> {
  await ensureSampleEvents();

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
      signupCount += row.c;
      const g = (row.gender ?? '').toLowerCase();
      if (g === 'man') maleCount += row.c;
      else if (g === 'woman') femaleCount += row.c;
      else otherCount += row.c;
    }

    result.push({
      id: e.id,
      title: e.title,
      description: e.description,
      venueName: e.venue_name,
      venueAddress: e.venue_address,
      eventAt: e.event_at,
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
): Promise<{ signupId: string; event: LiveDateEvent }> {
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
    return { signupId: existing.id, event: current };
  }

  const countRow = await (db
    .prepare('SELECT COUNT(*) AS c FROM live_date_signups WHERE event_id = ?')
    .get([eventId]) as Promise<{ c: number } | undefined>);
  if ((countRow?.c ?? 0) >= event.capacity) {
    throw new Error('This event is full');
  }

  const signupId = uuidv4();
  await db
    .prepare('INSERT INTO live_date_signups (id, event_id, user_id) VALUES (?, ?, ?)')
    .run([signupId, eventId, userId]);

  const tokenRow = await (db
    .prepare('SELECT push_token FROM users WHERE id = ?')
    .get([userId]) as Promise<{ push_token: string | null } | undefined>);
  const token = tokenRow?.push_token;
  if (token && isExpoPushToken(token)) {
    const when = new Date(event.event_at);
    const dateLabel = when.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    await sendPushNotification(
      token,
      "You're signed up! 🎟️",
      `${event.title} — ${dateLabel}. We'll remind you before the event.`,
      { type: 'live_date_signup', eventId },
    );
  }

  const events = await listLiveDateEvents(userId);
  const current = events.find((x) => x.id === eventId);
  if (!current) throw new Error('Event not found');
  return { signupId, event: current };
}

export async function listUserLiveDateTickets(userId: string): Promise<LiveDateEvent[]> {
  const events = await listLiveDateEvents(userId);
  return events.filter((e) => e.isSignedUp);
}
