import { db } from '../database.js';
import { isExpoPushToken, sendPushNotification } from './pushNotifications.js';
import { sendWebPushToUser } from './webPushDelivery.js';

export const DEFAULT_LAUNCH_PUSH_TITLE = 'Mulligan is live ✨';
export const DEFAULT_LAUNCH_PUSH_BODY =
  "Connect's open — tap in and meet someone new when you're ready.";

export type LaunchAnnouncementPushResult = {
  dryRun: boolean;
  candidates: number;
  expoSent: number;
  webSent: number;
  skippedNoPush: number;
  expoFailed: number;
};

type PushCandidateRow = {
  id: string;
  push_token: string | null;
};

async function fetchLaunchPushCandidates(limit: number): Promise<PushCandidateRow[]> {
  return (await db
    .prepare(
      `SELECT u.id, u.push_token
       FROM users u
       WHERE COALESCE(u.is_admin, 0) = 0
         AND COALESCE(u.is_restricted, 0) = 0
         AND (
           (u.push_token IS NOT NULL AND TRIM(u.push_token) != '')
           OR EXISTS (SELECT 1 FROM web_push_subscriptions w WHERE w.user_id = u.id)
         )
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .all([limit])) as PushCandidateRow[];
}

/**
 * One-shot launch announcement to users with Expo and/or Web Push registered.
 */
export async function sendLaunchLivePushAnnouncement(options?: {
  dryRun?: boolean;
  limit?: number;
  title?: string;
  body?: string;
}): Promise<LaunchAnnouncementPushResult> {
  const dryRun = options?.dryRun === true;
  const limit = Math.min(Math.max(options?.limit ?? 2000, 1), 5000);
  const title = options?.title?.trim() || DEFAULT_LAUNCH_PUSH_TITLE;
  const body = options?.body?.trim() || DEFAULT_LAUNCH_PUSH_BODY;

  const rows = await fetchLaunchPushCandidates(limit);

  const result: LaunchAnnouncementPushResult = {
    dryRun,
    candidates: rows.length,
    expoSent: 0,
    webSent: 0,
    skippedNoPush: 0,
    expoFailed: 0,
  };

  for (const row of rows) {
    const token = (row.push_token || '').trim();
    const hasExpo = token.length > 0 && isExpoPushToken(token);

    if (dryRun) {
      const webRow = (await db
        .prepare('SELECT COUNT(*) as c FROM web_push_subscriptions WHERE user_id = ?')
        .get([row.id])) as { c: number };
      const hasWeb = Number(webRow?.c ?? 0) > 0;
      if (hasExpo) result.expoSent += 1;
      if (hasWeb) result.webSent += 1;
      if (!hasExpo && !hasWeb) result.skippedNoPush += 1;
      continue;
    }

    let delivered = false;
    if (hasExpo) {
      const push = await sendPushNotification(token, title, body, {
        type: 'launch_live',
        url: '/browse',
      });
      if (push.sent) {
        result.expoSent += 1;
        delivered = true;
      } else {
        result.expoFailed += 1;
      }
    }

    const webCount = await sendWebPushToUser(row.id, {
      title,
      body,
      tag: 'launch-live',
      url: '/browse',
      data: { type: 'launch_live' },
    });
    if (webCount > 0) {
      result.webSent += webCount;
      delivered = true;
    }

    if (!delivered) result.skippedNoPush += 1;
  }

  return result;
}

export function formatLaunchAnnouncementSummary(result: LaunchAnnouncementPushResult): string {
  if (result.dryRun) {
    return `Dry run: ${result.candidates} user(s) with push; ${result.expoSent} Expo; ${result.webSent} Web Push; ${result.skippedNoPush} no channel.`;
  }
  return `Sent ${result.expoSent} Expo push(es) and ${result.webSent} web push(es). ${result.skippedNoPush} had no push channel.${result.expoFailed > 0 ? ` ${result.expoFailed} Expo failed.` : ''}`;
}
