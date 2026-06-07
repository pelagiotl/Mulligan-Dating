import { db } from '../database.js';

const DEFAULT_EXPORT_TO = 'mulligandating@gmail.com';

export type AdminExportUserRow = {
  id: string;
  phone_number: string | null;
  email: string | null;
  display_name: string | null;
  age: number | null;
  location: string | null;
  is_admin: number;
  is_restricted: number;
  account_status: string | null;
  photo_count: number;
  created_at: string;
  last_active_at: string | null;
  tokenCount: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsvCell(val: string): string {
  const s = val ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildAdminUsersCsv(rows: AdminExportUserRow[]): string {
  const headers = [
    'Phone',
    'Email',
    'Display Name',
    'Age',
    'Location',
    'Available Tokens',
    'Account Status',
    'Photo Count',
    'Admin',
    'Restricted',
    'Created',
    'Last Active',
    'User ID',
  ];
  const lines = [headers.join(',')];
  for (const u of rows) {
    lines.push(
      [
        u.phone_number ?? '',
        u.email ?? '',
        u.display_name ?? '',
        u.age != null ? String(u.age) : '',
        u.location ?? '',
        String(u.tokenCount),
        u.account_status ?? 'active',
        String(u.photo_count ?? 0),
        u.is_admin ? 'yes' : 'no',
        u.is_restricted ? 'yes' : 'no',
        u.created_at,
        u.last_active_at ?? '',
        u.id,
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

export async function fetchAllUsersForAdminExport(
  tayaHideSql: string,
): Promise<{ rows: AdminExportUserRow[]; stats: AdminExportStats }> {
  const usersResult = (await db
    .prepare(
      `
      SELECT DISTINCT
        u.id, u.email, u.phone_number, u.is_admin, u.is_restricted,
        u.created_at, u.last_active_at,
        COALESCE(u.account_status, 'active') AS account_status,
        p.display_name, p.age, p.location,
        (SELECT COUNT(*) FROM photos ph WHERE ph.profile_id = p.id) AS photo_count
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE 1=1${tayaHideSql}
      ORDER BY u.created_at DESC
    `,
    )
    .all([])) as AdminExportUserRow[];

  const userIds = usersResult.map((u) => u.id);
  const tokenCounts: Record<string, number> = {};
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    const tokensResult = (await db
      .prepare(
        `SELECT user_id, COUNT(*) as count FROM mulligan_tokens
         WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL
         GROUP BY user_id`,
      )
      .all(userIds)) as { user_id: string; count: number }[];
    for (const row of tokensResult) {
      tokenCounts[row.user_id] = Number(row.count) || 0;
    }
  }

  const rows = usersResult.map((u) => ({
    ...u,
    photo_count: Math.floor(Number(u.photo_count ?? 0)),
    tokenCount: tokenCounts[u.id] || 0,
  }));

  const totalUsers = rows.length;
  const activeUsers = rows.filter((u) => (u.account_status ?? 'active') === 'active').length;
  const onboardingUsers = rows.filter((u) => u.account_status === 'onboarding').length;
  const withProfile = rows.filter((u) => Boolean(u.display_name?.trim())).length;
  const completeProfiles = rows.filter(
    (u) => (u.account_status ?? 'active') === 'active' && (u.photo_count ?? 0) >= 1,
  ).length;

  return {
    rows,
    stats: {
      totalUsers,
      activeUsers,
      onboardingUsers,
      withProfile,
      completeProfiles,
      exportedAt: new Date().toISOString(),
    },
  };
}

export type AdminExportStats = {
  totalUsers: number;
  activeUsers: number;
  onboardingUsers: number;
  withProfile: number;
  completeProfiles: number;
  exportedAt: string;
};

export async function sendAdminUsersExportEmail(params: {
  rows: AdminExportUserRow[];
  stats: AdminExportStats;
  requestedBy?: string | null;
}): Promise<{ sent: boolean; recipient?: string; error?: string }> {
  const recipient =
    process.env.ADMIN_USER_EXPORT_EMAIL?.trim() || DEFAULT_EXPORT_TO;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Mulligan <onboarding@resend.dev>';

  if (!apiKey) {
    return {
      sent: false,
      error: 'RESEND_API_KEY is not configured on the server.',
    };
  }

  const csv = buildAdminUsersCsv(params.rows);
  const csvBase64 = Buffer.from(csv, 'utf8').toString('base64');
  const dateLabel = new Date(params.stats.exportedAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const subject = `[Mulligan Admin] User directory export (${params.stats.totalUsers} accounts)`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;line-height:1.5;color:#222;">
      <h2 style="margin:0 0 12px 0;">Mulligan user directory export</h2>
      <p style="margin:0 0 16px 0;">Generated ${escapeHtml(dateLabel)}${
        params.requestedBy ? ` · requested by ${escapeHtml(params.requestedBy)}` : ''
      }.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Total accounts</td><td>${params.stats.totalUsers}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Active</td><td>${params.stats.activeUsers}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Onboarding</td><td>${params.stats.onboardingUsers}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">With profile name</td><td>${params.stats.withProfile}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Complete profiles (active + photo)</td><td>${params.stats.completeProfiles}</td></tr>
      </table>
      <p style="margin:16px 0 0 0;font-size:13px;color:#555;">
        The full user list is attached as <strong>mulligan-users.csv</strong> (phone, email, profile, tokens, status, photo count). Filter <strong>Account Status = active</strong> and <strong>Photo Count ≥ 1</strong> for raffle eligibility.
      </p>
    </div>
  `;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const run = resend.emails.send({
      from,
      to: [recipient],
      subject,
      html,
      attachments: [
        {
          filename: `mulligan-users-${new Date().toISOString().slice(0, 10)}.csv`,
          content: csvBase64,
        },
      ],
    });
    const result = run instanceof Promise ? await run : run;
    if (result.error) {
      return { sent: false, error: String(result.error?.message ?? result.error) };
    }
    console.log('[Admin export] Sent user CSV to', recipient, `(${params.rows.length} rows)`);
    return { sent: true, recipient };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Admin export] Send failed:', message);
    return { sent: false, error: message };
  }
}
