import { db } from '../database.js';

export const MIN_PHOTOS_TO_CONNECT = 3;

export function hasConnectDisplayName(displayName: string | null | undefined): boolean {
  return typeof displayName === 'string' && displayName.trim().length >= 2;
}

/** Same rule as profile Zod: city and state separated by a comma. */
export function isValidConnectLocation(location: string | null | undefined): boolean {
  if (location == null || typeof location !== 'string') return false;
  const t = location.trim();
  const i = t.indexOf(',');
  if (i === -1) return false;
  return t.slice(0, i).trim().length > 0 && t.slice(i + 1).trim().length > 0;
}

export async function getConnectSetupViolationsForUser(userId: string): Promise<string[]> {
  const profileResult = db
    .prepare('SELECT id, display_name, location FROM profiles WHERE user_id = ?')
    .get([userId]);
  const profile = (profileResult instanceof Promise ? await profileResult : profileResult) as
    | { id: string; display_name: string; location: string | null }
    | undefined;

  if (!profile) return ['profile'];

  const violations: string[] = [];
  if (!hasConnectDisplayName(profile.display_name)) violations.push('name');
  if (!isValidConnectLocation(profile.location)) violations.push('location');

  const countResult = db.prepare('SELECT COUNT(*) as c FROM photos WHERE profile_id = ?').get([profile.id]);
  const countRow = (countResult instanceof Promise ? await countResult : countResult) as
    | { c: number | string }
    | undefined;
  const photoCount = Math.floor(Number(countRow?.c ?? 0));
  if (photoCount < MIN_PHOTOS_TO_CONNECT) violations.push('photos');

  return violations;
}

export function connectSetupErrorPayload(violations: string[]) {
  const messages: Record<string, string> = {
    profile: 'Complete your profile first.',
    name: 'Add your name in Settings before connecting.',
    location: 'Add your city and state on your Profile before connecting (e.g. Medford, Oregon).',
    photos: `Add at least ${MIN_PHOTOS_TO_CONNECT} photo${MIN_PHOTOS_TO_CONNECT === 1 ? '' : 's'} on your Profile before connecting.`,
  };
  const primary = violations[0] ?? 'profile';
  return {
    error: messages[primary] || 'Complete your profile to connect.',
    code: 'CONNECT_SETUP_INCOMPLETE' as const,
    missing: violations,
  };
}
