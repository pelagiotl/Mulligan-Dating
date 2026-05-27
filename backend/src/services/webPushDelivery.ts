import webpush from "web-push";
import { db } from "../database.js";

let webPushReady = false;

export function initWebPushFromEnv(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_CONTACT_EMAIL?.trim() ||
    process.env.VAPID_SUBJECT?.trim() ||
    "mailto:Mulligandating@gmail.com";
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      webPushReady = true;
      console.log("✅ Web Push (VAPID) configured — browser / PWA clients can subscribe");
    } catch (e) {
      console.warn("⚠️  Web Push: failed to set VAPID details:", e);
    }
  } else {
    console.log("ℹ️  Web Push: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable browser notifications");
  }
}

export function isWebPushConfigured(): boolean {
  return webPushReady;
}

export type WebPushOsPayload = {
  title: string;
  body: string;
  tag?: string;
  /** Open this path on notification click (relative to site origin, e.g. /matches) */
  url?: string;
  data?: Record<string, unknown>;
};

function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Send a Web Push to every subscription for this user. Removes subscriptions that return 404/410.
 * @returns number of successful sends
 */
export async function sendWebPushToUser(userId: string, payload: WebPushOsPayload): Promise<number> {
  if (!webPushReady) return 0;

  let rowsResult = db.prepare("SELECT id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id = ?").all([
    userId,
  ]);
  const rows = (rowsResult instanceof Promise ? await rowsResult : rowsResult) as SubRow[];
  if (!rows?.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? "mulligan",
    url: payload.url ?? "/matches",
    data: stringifyData(payload.data),
  });

  let ok = 0;
  for (const row of rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(subscription as webpush.PushSubscription, body, {
        TTL: 60 * 60 * 24,
        urgency: "normal",
      });
      ok += 1;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        try {
          const del = db.prepare("DELETE FROM web_push_subscriptions WHERE id = ?").run([row.id]);
          if (del instanceof Promise) await del;
          console.log(`📲 Web Push: removed stale subscription for user ${userId} (${status})`);
        } catch (_) {
          /* ignore */
        }
      } else {
        console.warn(`📲 Web Push: send failed for user ${userId}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  return ok;
}

/** Whether the user wants message-related push (default on). */
export async function userWantsMessagePush(userId: string): Promise<boolean> {
  let rowResult = db.prepare("SELECT push_notify_messages FROM users WHERE id = ?").get([userId]);
  const row = (rowResult instanceof Promise ? await rowResult : rowResult) as {
    push_notify_messages: number | null;
  } | undefined;
  return (
    row?.push_notify_messages === undefined ||
    row?.push_notify_messages === null ||
    row.push_notify_messages !== 0
  );
}

/**
 * Send message Web Push if VAPID is configured and user prefs allow.
 * Runs independently of Expo native push.
 */
export async function sendMessageWebPush(
  recipientUserId: string,
  payload: WebPushOsPayload
): Promise<number> {
  if (!webPushReady) return 0;
  const wants = await userWantsMessagePush(recipientUserId);
  if (!wants) return 0;
  const n = await sendWebPushToUser(recipientUserId, payload);
  if (n === 0) {
    console.warn(
      `📲 Web Push (message): no delivery for user ${recipientUserId} — no active browser subscription (re-enable in Settings on that device)`
    );
  }
  return n;
}
