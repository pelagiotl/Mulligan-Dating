import { db } from '../database.js';
import { getConnectSetupViolationsForUser } from './connectRequirements.js';

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

export async function activateUserAccount(userId: string): Promise<{
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

  const violations = await getConnectSetupViolationsForUser(userId);
  if (violations.length > 0) {
    throw Object.assign(
      new Error('Complete your profile before finishing account setup.'),
      { status: 400, code: 'PROFILE_INCOMPLETE', missing: violations },
    );
  }

  const alreadyActive = userRow.account_status === ACCOUNT_STATUS_ACTIVE;

  if (!alreadyActive) {
    await (db
      .prepare(`UPDATE users SET account_status = ? WHERE id = ?`)
      .run([ACCOUNT_STATUS_ACTIVE, userId]) as Promise<unknown>);
  }

  let tokensGranted = 0;
  const tokenCountRow = (await db
    .prepare('SELECT COUNT(*) as c FROM mulligan_tokens WHERE user_id = ?')
    .get([userId])) as { c: number | string } | undefined;
  const existingTokens = Math.floor(Number(tokenCountRow?.c ?? 0));

  if (existingTokens === 0) {
    const { grantInitialTokens } = await import('../routes/tokens.js');
    await grantInitialTokens(userId);
    tokensGranted = 7;
  }

  return {
    accountStatus: ACCOUNT_STATUS_ACTIVE,
    tokensGranted,
    alreadyActive,
  };
}

/** One-time style sync: incomplete profiles → onboarding; connect-ready → active. */
export async function syncAccountStatusFromProfileReadiness(): Promise<void> {
  const usersResult = await db.prepare('SELECT id FROM users').all([]);
  const users = Array.isArray(usersResult) ? usersResult : [];
  for (const row of users as { id: string }[]) {
    const violations = await getConnectSetupViolationsForUser(row.id);
    const next =
      violations.length === 0 ? ACCOUNT_STATUS_ACTIVE : ACCOUNT_STATUS_ONBOARDING;
    await (db
      .prepare('UPDATE users SET account_status = ? WHERE id = ?')
      .run([next, row.id]) as Promise<unknown>);
  }
}
