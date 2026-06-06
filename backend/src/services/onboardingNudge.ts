import { db } from '../database.js';
import { sqlOnlyOnboardingAccounts } from '../utils/accountStatus.js';
import { isExpoPushToken, sendPushNotification } from './pushNotifications.js';
import { sendWebPushToUser } from './webPushDelivery.js';
import {
  formatPhoneNumber,
  isTransactionalSmsConfigured,
  sendTransactionalSms,
} from './sms.js';

const DEFAULT_PUSH_TITLE = 'Finish your Mulligan profile 💘';
const DEFAULT_PUSH_BODY =
  'We launch tomorrow! Add your name and city & state — then tap Complete Profile. Add a photo on your Profile before you Connect.';

const DEFAULT_SMS_BODY =
  'Mulligan 💘 We launch tomorrow! Your account is not active yet — add your name and city & state to finish setup:';

const SMS_SUFFIX = ' Reply STOP to opt out.';

export type OnboardingNudgeChannel = 'push' | 'sms';

export type OnboardingPushNudgeResult = {
  dryRun: boolean;
  candidates: number;
  expoSent: number;
  webSent: number;
  skippedNoPush: number;
  expoFailed: number;
};

export type OnboardingSmsNudgeResult = {
  dryRun: boolean;
  candidates: number;
  smsSent: number;
  smsFailed: number;
  skippedNoPhone: number;
  skippedOptOut: number;
  skippedAlreadySent: number;
  skippedTooRecent: number;
  smsConfigured: boolean;
};

function frontendOrigin(): string | null {
  const direct = process.env.FRONTEND_URL?.trim();
  if (direct) return direct.replace(/\/$/, '');
  const origins = process.env.ALLOWED_ORIGINS?.split(',')[0]?.trim();
  if (origins) return origins.replace(/\/$/, '');
  return null;
}

export function buildOnboardingProfileUrl(): string {
  const origin = frontendOrigin();
  if (origin) return `${origin}/create-profile`;
  return 'https://mulligan-frontend.onrender.com/create-profile';
}

function buildDefaultSmsText(customBody?: string): string {
  const base = (customBody?.trim() || DEFAULT_SMS_BODY).replace(/\s*Reply STOP.*$/i, '').trim();
  const url = buildOnboardingProfileUrl();
  let text = `${base} ${url}${SMS_SUFFIX}`;
  if (text.length > 320) {
    text = `${DEFAULT_SMS_BODY} ${url}${SMS_SUFFIX}`;
  }
  return text;
}

type EligibleUserRow = {
  id: string;
  phone_number: string | null;
  push_token: string | null;
  sms_opt_out: number | null;
  onboarding_sms_nudge_sent_at: string | null;
  created_at: string;
};

async function fetchOnboardingNudgeCandidates(limit: number): Promise<EligibleUserRow[]> {
  const onboardingOnly = sqlOnlyOnboardingAccounts('u');
  return (await db
    .prepare(
      `SELECT u.id, u.phone_number, u.push_token, u.sms_opt_out, u.onboarding_sms_nudge_sent_at, u.created_at
       FROM users u
       WHERE 1=1${onboardingOnly}
         AND COALESCE(u.is_admin, 0) = 0
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
    .all([limit])) as EligibleUserRow[];
}

/**
 * Send push nudge to onboarding users with Expo token and/or Web Push subscription.
 */
export async function sendOnboardingCompleteProfilePushNudges(options?: {
  dryRun?: boolean;
  limit?: number;
  title?: string;
  body?: string;
}): Promise<OnboardingPushNudgeResult> {
  const dryRun = options?.dryRun === true;
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
  const title = options?.title?.trim() || DEFAULT_PUSH_TITLE;
  const body = options?.body?.trim() || DEFAULT_PUSH_BODY;

  const rows = await fetchOnboardingNudgeCandidates(limit);

  const result: OnboardingPushNudgeResult = {
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
        type: 'onboarding_complete_profile',
        url: '/create-profile',
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
      tag: 'onboarding-complete-profile',
      url: '/create-profile',
      data: { type: 'onboarding_complete_profile' },
    });
    if (webCount > 0) {
      result.webSent += webCount;
      delivered = true;
    }

    if (!delivered) result.skippedNoPush += 1;
  }

  return result;
}

/** @deprecated use sendOnboardingCompleteProfilePushNudges */
export async function sendOnboardingCompleteProfileNudges(options?: {
  dryRun?: boolean;
  limit?: number;
  title?: string;
  body?: string;
}): Promise<OnboardingPushNudgeResult> {
  return sendOnboardingCompleteProfilePushNudges(options);
}

/**
 * SMS profile nudge for onboarding users with a phone on file (Messages API + TWILIO_PHONE_NUMBER).
 * Respects sms_opt_out, skips users already nudged unless allowResend, optional min hours since signup.
 */
export async function sendOnboardingCompleteProfileSmsNudges(options?: {
  dryRun?: boolean;
  limit?: number;
  body?: string;
  /** If true, may message users who already received an onboarding SMS nudge. */
  allowResend?: boolean;
  /** Skip accounts newer than this many hours (default 24 — avoid nagging right after signup). */
  minHoursSinceSignup?: number;
}): Promise<OnboardingSmsNudgeResult> {
  const dryRun = options?.dryRun === true;
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 2000);
  const allowResend = options?.allowResend === true;
  const minHours = Math.max(0, options?.minHoursSinceSignup ?? 24);
  const smsConfigured = isTransactionalSmsConfigured();
  const smsText = buildDefaultSmsText(options?.body);

  const rows = await fetchOnboardingNudgeCandidates(limit);
  const now = Date.now();

  const result: OnboardingSmsNudgeResult = {
    dryRun,
    candidates: rows.length,
    smsSent: 0,
    smsFailed: 0,
    skippedNoPhone: 0,
    skippedOptOut: 0,
    skippedAlreadySent: 0,
    skippedTooRecent: 0,
    smsConfigured,
  };

  for (const row of rows) {
    const phoneRaw = (row.phone_number || '').trim();
    if (!phoneRaw) {
      result.skippedNoPhone += 1;
      continue;
    }

    if (row.sms_opt_out === 1) {
      result.skippedOptOut += 1;
      continue;
    }

    if (!allowResend && row.onboarding_sms_nudge_sent_at) {
      result.skippedAlreadySent += 1;
      continue;
    }

    if (minHours > 0 && row.created_at) {
      const createdMs = new Date(row.created_at).getTime();
      if (!Number.isNaN(createdMs) && now - createdMs < minHours * 60 * 60 * 1000) {
        result.skippedTooRecent += 1;
        continue;
      }
    }

    const formatted = formatPhoneNumber(phoneRaw);
    if (!formatted) {
      result.skippedNoPhone += 1;
      continue;
    }

    if (dryRun) {
      result.smsSent += 1;
      continue;
    }

    if (!smsConfigured) {
      result.smsFailed += 1;
      continue;
    }

    const sent = await sendTransactionalSms(formatted, smsText);
    if (sent) {
      result.smsSent += 1;
      await (db
        .prepare('UPDATE users SET onboarding_sms_nudge_sent_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run([row.id]) as Promise<unknown>);
    } else {
      result.smsFailed += 1;
    }
  }

  return result;
}

export function formatSmsNudgeSummary(result: OnboardingSmsNudgeResult): string {
  if (result.dryRun) {
    return `Dry run: ${result.candidates} onboarding user(s); ${result.smsSent} eligible for SMS; ${result.skippedOptOut} opted out; ${result.skippedAlreadySent} already nudged; ${result.skippedTooRecent} too new; ${result.skippedNoPhone} no valid phone.${result.smsConfigured ? '' : ' TWILIO_PHONE_NUMBER not configured — cannot send live SMS.'}`;
  }
  if (!result.smsConfigured) {
    return 'SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER (Messages API — not Verify).';
  }
  return `Sent ${result.smsSent} SMS. ${result.smsFailed} failed. Skipped: ${result.skippedOptOut} opt-out, ${result.skippedAlreadySent} already sent, ${result.skippedTooRecent} too new, ${result.skippedNoPhone} no phone.`;
}

export function formatPushNudgeSummary(result: OnboardingPushNudgeResult): string {
  if (result.dryRun) {
    return `Dry run: ${result.candidates} onboarding user(s); ${result.expoSent} with Expo token; ${result.webSent} with Web Push; ${result.skippedNoPush} with no push channel.`;
  }
  return `Sent ${result.expoSent} Expo push(es) and ${result.webSent} web push(es). ${result.skippedNoPush} user(s) had no push channel.`;
}
