import { db } from '../database.js';
import { sendPushNotification, isExpoPushToken } from './pushNotifications.js';
import { sendWebPushToUser } from './webPushDelivery.js';

const EVENT_TIMEZONE = 'America/Los_Angeles';

type EventRow = {
  id: string;
  title: string;
  venue_address: string | null;
  event_at: string;
};

type SignupReminderRow = {
  id: string;
  user_id: string;
  event_id: string;
  title: string;
  venue_address: string | null;
  event_at: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatLiveDateWhen(eventAt: string): string {
  const when = new Date(eventAt);
  return when.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: EVENT_TIMEZONE,
    timeZoneName: 'short',
  });
}

async function getUserContact(userId: string): Promise<{
  email: string | null;
  pushToken: string | null;
  displayName: string | null;
}> {
  const row = await (db
    .prepare(
      `SELECT u.email, u.push_token, p.display_name
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`,
    )
    .get([userId]) as Promise<
    { email: string | null; push_token: string | null; display_name: string | null } | undefined
  >);
  return {
    email: row?.email?.trim() || null,
    pushToken: row?.push_token ?? null,
    displayName: row?.display_name?.trim() || null,
  };
}

async function deliverLiveDatePush(
  userId: string,
  title: string,
  body: string,
  eventId: string,
  kind: 'live_date_signup' | 'live_date_reminder_day' | 'live_date_reminder_soon',
): Promise<void> {
  const { pushToken } = await getUserContact(userId);

  if (pushToken && isExpoPushToken(pushToken)) {
    await sendPushNotification(pushToken, title, body, { type: kind, eventId });
  }

  await sendWebPushToUser(userId, {
    title,
    body,
    tag: `live-date-${eventId}`,
    url: '/live-dates',
    data: { type: kind, eventId },
  });
}

export async function sendLiveDateSignupConfirmationEmail(
  userId: string,
  event: EventRow,
): Promise<{ sent: boolean; error?: string }> {
  const { email, displayName } = await getUserContact(userId);
  if (!email) return { sent: false };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Mulligan <onboarding@resend.dev>';
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Live Dates email] RESEND_API_KEY not set — skipping confirmation email');
    }
    return { sent: false, error: 'RESEND_API_KEY not set' };
  }

  const whenLabel = formatLiveDateWhen(event.event_at);
  const venue = event.venue_address?.trim() || '812 S Riverside, Medford, OR 97501';
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : 'Hi there,';

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const run = resend.emails.send({
      from,
      to: [email],
      subject: `You're signed up for ${event.title}`,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;line-height:1.5;color:#1e1b4b;">
          <p>${greeting}</p>
          <p>You're confirmed for <strong>${escapeHtml(event.title)}</strong>.</p>
          <p style="margin:16px 0;padding:14px 16px;background:#f5f3ff;border-radius:12px;border:1px solid #ddd6fe;">
            <strong>When:</strong> ${escapeHtml(whenLabel)}<br />
            <strong>Where:</strong> ${escapeHtml(venue)}
          </p>
          <p>We'll send you push reminders before the event. You can view your spot anytime in the Live tab of the Mulligan app.</p>
          <p style="color:#64748b;font-size:14px;">See you there — real connections, zero swiping.</p>
        </div>
      `,
    });
    const result = await run;
    if (result.error) {
      console.error('[Live Dates email] Resend error:', result.error);
      return { sent: false, error: result.error.message };
    }
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email send failed';
    console.error('[Live Dates email]', message);
    return { sent: false, error: message };
  }
}

export async function notifyLiveDateSignup(
  userId: string,
  event: EventRow,
): Promise<{ pushSent: boolean; emailSent: boolean }> {
  const whenLabel = formatLiveDateWhen(event.event_at);
  const title = "You're signed up! 🎟️";
  const body = `${event.title} — ${whenLabel}. We'll remind you before the event.`;

  const { pushToken } = await getUserContact(userId);
  let pushSent = false;
  if (pushToken && isExpoPushToken(pushToken)) {
    const result = await sendPushNotification(pushToken, title, body, {
      type: 'live_date_signup',
      eventId: event.id,
    });
    pushSent = result.sent;
  }
  const webCount = await sendWebPushToUser(userId, {
    title,
    body,
    tag: `live-date-${event.id}`,
    url: '/live-dates',
    data: { type: 'live_date_signup', eventId: event.id },
  });
  pushSent = pushSent || webCount > 0;

  const emailResult = await sendLiveDateSignupConfirmationEmail(userId, event);

  return { pushSent, emailSent: emailResult.sent };
}

async function sendReminderPush(
  row: SignupReminderRow,
  kind: 'day_before' | 'soon',
): Promise<void> {
  const whenLabel = formatLiveDateWhen(row.event_at);
  const venue = row.venue_address?.trim() || '812 S Riverside, Medford, OR 97501';
  const title = kind === 'day_before' ? 'Mulligan Live Dates tomorrow' : 'Mulligan Live Dates starts soon';
  const body =
    kind === 'day_before'
      ? `${row.title} is tomorrow — ${whenLabel}. ${venue}`
      : `${row.title} starts in about 2 hours — ${whenLabel}. ${venue}`;

  await deliverLiveDatePush(
    row.user_id,
    title,
    body,
    row.event_id,
    kind === 'day_before' ? 'live_date_reminder_day' : 'live_date_reminder_soon',
  );

  const { email } = await getUserContact(row.user_id);
  if (email) {
    await sendLiveDateReminderEmail(email, row, kind, whenLabel, venue);
  }
}

async function sendLiveDateReminderEmail(
  email: string,
  row: SignupReminderRow,
  kind: 'day_before' | 'soon',
  whenLabel: string,
  venue: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Mulligan <onboarding@resend.dev>';
  if (!apiKey) return;

  const subject =
    kind === 'day_before'
      ? `Reminder: ${row.title} is tomorrow`
      : `Starting soon: ${row.title}`;
  const lead =
    kind === 'day_before'
      ? 'Just a friendly reminder that Mulligan Live Dates is tomorrow.'
      : 'Mulligan Live Dates starts in about 2 hours.';

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to: [email],
      subject,
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;line-height:1.5;color:#1e1b4b;">
          <p>${lead}</p>
          <p style="margin:16px 0;padding:14px 16px;background:#f5f3ff;border-radius:12px;border:1px solid #ddd6fe;">
            <strong>When:</strong> ${escapeHtml(whenLabel)}<br />
            <strong>Where:</strong> ${escapeHtml(venue)}
          </p>
          <p>See you there!</p>
        </div>
      `,
    });
  } catch (err) {
    console.warn('[Live Dates reminder email]', err instanceof Error ? err.message : err);
  }
}

/** Sends ~24h and ~2h reminders for upcoming signups. Run on a schedule from the API server. */
export async function processLiveDateReminders(): Promise<void> {
  const now = Date.now();
  const dayBeforeWindowStart = new Date(now + 23 * 60 * 60 * 1000).toISOString();
  const dayBeforeWindowEnd = new Date(now + 25 * 60 * 60 * 1000).toISOString();
  const soonWindowStart = new Date(now + 90 * 60 * 1000).toISOString();
  const soonWindowEnd = new Date(now + 150 * 60 * 1000).toISOString();

  const dayBeforeRows = await (db
    .prepare(
      `SELECT s.id, s.user_id, e.id AS event_id, e.title, e.venue_address, e.event_at
       FROM live_date_signups s
       JOIN live_date_events e ON e.id = s.event_id
       WHERE e.is_published = 1
         AND s.reminder_sent_at IS NULL
         AND e.event_at >= ?
         AND e.event_at <= ?`,
    )
    .all([dayBeforeWindowStart, dayBeforeWindowEnd]) as Promise<SignupReminderRow[]>);

  for (const row of dayBeforeRows) {
    try {
      await sendReminderPush(row, 'day_before');
      await db
        .prepare('UPDATE live_date_signups SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run([row.id]);
    } catch (err) {
      console.error('[Live Dates] day-before reminder failed:', err);
    }
  }

  const soonRows = await (db
    .prepare(
      `SELECT s.id, s.user_id, e.id AS event_id, e.title, e.venue_address, e.event_at
       FROM live_date_signups s
       JOIN live_date_events e ON e.id = s.event_id
       WHERE e.is_published = 1
         AND s.reminder_soon_sent_at IS NULL
         AND e.event_at >= ?
         AND e.event_at <= ?`,
    )
    .all([soonWindowStart, soonWindowEnd]) as Promise<SignupReminderRow[]>);

  for (const row of soonRows) {
    try {
      await sendReminderPush(row, 'soon');
      await db
        .prepare('UPDATE live_date_signups SET reminder_soon_sent_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run([row.id]);
    } catch (err) {
      console.error('[Live Dates] soon reminder failed:', err);
    }
  }
}
