import type { Request } from 'express';

export type ClientPlatform = 'web' | 'android' | 'ios' | 'unknown';

const VALID_PLATFORMS = new Set<ClientPlatform>(['web', 'android', 'ios']);

/** Read explicit client header (preferred). */
export function parseClientPlatformHeader(req: Request): ClientPlatform | null {
  const raw = req.headers['x-mulligan-client'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toString().trim().toLowerCase();
  if (!value) return null;
  if (value === 'web') return 'web';
  if (value === 'android') return 'android';
  if (value === 'ios') return 'ios';
  return null;
}

/** Fallback when header is missing (legacy clients). */
export function parseClientPlatformFromUserAgent(req: Request): ClientPlatform | null {
  const ua = (req.headers['user-agent'] || '').toString().toLowerCase();
  if (!ua) return null;
  if (
    ua.includes('mulligan-dating-web') ||
    ua.includes('mulligan-dating-app') ||
    ua.includes('mulligan/web')
  ) {
    return 'web';
  }
  if (ua.includes('reactnative') || ua.includes('mulligan/')) {
    if (ua.includes('ios')) return 'ios';
    if (ua.includes('android')) return 'android';
    return 'android';
  }
  return null;
}

export function detectClientPlatformFromRequest(req: Request): ClientPlatform | null {
  return parseClientPlatformHeader(req) ?? parseClientPlatformFromUserAgent(req);
}

/** Record platform + activity on login/signup and on authenticated requests. */
export async function persistClientPlatformForUser(req: Request, userId: string): Promise<void> {
  const clientPlatform = detectClientPlatformFromRequest(req);
  const { db } = await import('../database.js');
  if (clientPlatform) {
    const stmt = db.prepare(
      'UPDATE users SET last_active_at = CURRENT_TIMESTAMP, last_client_platform = ? WHERE id = ?',
    );
    await (stmt.run([clientPlatform, userId]) as Promise<unknown>);
  } else {
    const stmt = db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?');
    await (stmt.run([userId]) as Promise<unknown>);
  }
}

export function normalizeStoredClientPlatform(value: string | null | undefined): ClientPlatform | null {
  if (!value) return null;
  const v = value.trim().toLowerCase() as ClientPlatform;
  return VALID_PLATFORMS.has(v) ? v : null;
}

export function inferClientPlatformFromSignals(row: {
  last_client_platform?: string | null;
  push_token?: string | null;
  has_web_push?: number | boolean | null;
}): ClientPlatform {
  const stored = normalizeStoredClientPlatform(row.last_client_platform);
  if (stored) return stored;
  const hasWebPush = row.has_web_push === 1 || row.has_web_push === true;
  if (hasWebPush) return 'web';
  const token = (row.push_token || '').trim();
  if (token.startsWith('ExponentPushToken[')) {
    return 'android';
  }
  return 'unknown';
}

export function clientPlatformLabel(platform: ClientPlatform): string {
  switch (platform) {
    case 'web':
      return 'Web';
    case 'android':
      return 'Android';
    case 'ios':
      return 'iOS';
    default:
      return 'Unknown';
  }
}
