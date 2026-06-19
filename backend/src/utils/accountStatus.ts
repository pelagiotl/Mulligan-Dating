import { db } from '../database.js';
import type { ClientPlatform } from './clientPlatform.js';
import {
  getActivationSetupViolationsForUser,
  MIN_PHOTOS_TO_CONNECT,
  userGrandfatheredFromIntroVideoRequirement,
} from './connectRequirements.js';

export const ACCOUNT_STATUS_ONBOARDING = 'onboarding';
export const ACCOUNT_STATUS_ACTIVE = 'active';

/** Legacy rows without account_status are treated as active until backfill runs. */
export function isActiveAccountStatus(status: string | null | undefined): boolean {
  if (status == null || status === '') return true;
  return status === ACCOUNT_STATUS_ACTIVE;
}

/** SQL fragment — append after users alias is in scope (e.g. `FROM users u`). */
export function sqlOnlyActiveAccounts(userAlias = 'u'): string {
  return ` AND COALESCE(${userAlias}.account_status, '${ACCOUNT_STATUS_ACTIVE}') = '${ACCOUNT_STATUS_ACTIVE}'`;
}

export function sqlOnlyOnboardingAccounts(userAlias = 'u'): string {
  return ` AND COALESCE(${userAlias}.account_status, '${ACCOUNT_STATUS_ACTIVE}') = '${ACCOUNT_STATUS_ONBOARDING}'`;
}

/** Active accounts with at least MIN_PHOTOS_TO_CONNECT uploaded (raffle / “complete profile” definition). */
export function sqlUserHasMinPhotos(
  userAlias = 'u',
  minPhotos: number = MIN_PHOTOS_TO_CONNECT,
): string {
  const n = Math.max(1, Math.floor(minPhotos));
  return ` AND (
    SELECT COUNT(*) FROM photos ph
    INNER JOIN profiles p ON p.id = ph.profile_id
    WHERE p.user_id = ${userAlias}.id
  ) >= ${n}`;
}

export function sqlCompleteProfileAccounts(userAlias = 'u'): string {
  return `${sqlOnlyActiveAccounts(userAlias)}${sqlUserHasMinPhotos(userAlias)}`;
}

export async function activateUserAccount(
  userId: string,
  options?: { clientPlatform?: ClientPlatform | null },
): Promise<{
  accountStatus: typeof ACCOUNT_STATUS_ACTIVE;
  tokensGranted: number;
  alreadyActive: boolean;
}> {
  const userRow = (await db
    .prepare('SELECT account_status FROM users WHERE id = ?')
    .get([userId])) as { account_status: string | null } | undefined;

  if (!userRow) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const violations = await getActivationSetupViolationsForUser(userId, {
    clientPlatform: options?.clientPlatform,
  });
  if (violations.length > 0) {
    throw Object.assign(
      new Error('Complete your profile before finishing account setup.'),
      { status: 400, code: 'PROFILE_INCOMPLETE', missing: violations },
    );
  }

  const alreadyActive = userRow.account_status === ACCOUNT_STATUS_ACTIVE;

  if (!alreadyActive) {
    await (db
      .prepare(
        `UPDATE users SET account_status = ?, profile_activated_at = COALESCE(profile_activated_at, CURRENT_TIMESTAMP) WHERE id = ?`,
      )
      .run([ACCOUNT_STATUS_ACTIVE, userId]) as Promise<unknown>);
  } else {
    await (db
      .prepare(
        `UPDATE users SET profile_activated_at = COALESCE(profile_activated_at, CURRENT_TIMESTAMP) WHERE id = ?`,
      )
      .run([userId]) as Promise<unknown>);
  }

  // Tokens are not granted on activate — users claim their first weekly refill on Connect.
  return {
    accountStatus: ACCOUNT_STATUS_ACTIVE,
    tokensGranted: 0,
    alreadyActive,
  };
}

/**
 * Startup sync: demote incomplete profiles to onboarding only.
 * Account activation (active + tokens) happens exclusively via POST /profile/activate.
 */
export async function syncAccountStatusFromProfileReadiness(): Promise<void> {
  const usersResult = await db.prepare(
    'SELECT id, account_status, profile_activated_at FROM users',
  ).all([]);
  const users = Array.isArray(usersResult) ? usersResult : [];
  for (const row of users as {
    id: string;
    account_status: string | null;
    profile_activated_at: string | null;
  }[]) {
    const violations = await getActivationSetupViolationsForUser(row.id);
    if (violations.length > 0) {
      await (db
        .prepare('UPDATE users SET account_status = ? WHERE id = ?')
        .run([ACCOUNT_STATUS_ONBOARDING, row.id]) as Promise<unknown>);
      continue;
    }

    if (row.account_status === ACCOUNT_STATUS_ONBOARDING) {
      if (await userGrandfatheredFromIntroVideoRequirement(row.id)) {
        await (db
          .prepare(
            `UPDATE users SET account_status = ?, profile_activated_at = COALESCE(profile_activated_at, CURRENT_TIMESTAMP) WHERE id = ?`,
          )
          .run([ACCOUNT_STATUS_ACTIVE, row.id]) as Promise<unknown>);
      }
      continue;
    }

    // Legacy rows auto-promoted to active without tapping Complete Profile
    if (
      row.account_status === ACCOUNT_STATUS_ACTIVE &&
      (row.profile_activated_at == null || row.profile_activated_at === '')
    ) {
      await (db
        .prepare('UPDATE users SET account_status = ? WHERE id = ?')
        .run([ACCOUNT_STATUS_ONBOARDING, row.id]) as Promise<unknown>);
    }
  }
}
