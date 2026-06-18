import { Router, type Response } from 'express';
import { db } from '../database.js';
import { authenticateToken, requireAdmin, AuthRequest, isOwnerAdmin } from '../middleware/auth.js';
import { deleteUserAccountData } from '../services/deleteUserAccount.js';
import { forceMatchByPhone } from '../services/forceMatchByPhone.js';
import {
  fetchAllUsersForAdminExport,
  sendAdminUsersExportEmail,
} from '../services/adminUsersExportEmail.js';
import {
  sqlCompleteProfileAccounts,
  sqlOnlyActiveAccounts,
  sqlOnlyOnboardingAccounts,
} from '../utils/accountStatus.js';
import {
  clientPlatformLabel,
  inferClientPlatformFromSignals,
} from '../utils/clientPlatform.js';
import { computeOnboardingProgress, type OnboardingProgress } from '../utils/connectRequirements.js';
import { v4 as uuidv4 } from 'uuid';

export const adminRouter = Router();

function parseAdminCount(row: { count: number | string } | undefined): number {
  const n = Number(row?.count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sevenDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

/** Users who opened the app recently (last_active_at), not token grants. */
async function countRecentlyActiveUsers(sinceIso: string): Promise<number> {
  const row = await (db
    .prepare(
      `SELECT COUNT(*) as count FROM users u
       WHERE u.last_active_at IS NOT NULL AND u.last_active_at >= ?`,
    )
    .get([sinceIso]) as Promise<{ count: number | string }>);
  return parseAdminCount(row);
}

/** Profile display name (normalized) that only the primary owner may review in admin. */
const PROTECTED_REVIEW_DISPLAY = 'taya';

function normalizeDisplayForPolicy(name: string | null | undefined): string {
  return (name || '').trim().toLowerCase();
}

async function isProtectedReviewUser(targetUserId: string): Promise<boolean> {
  const row = (await db
    .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
    .get([targetUserId])) as { display_name: string | null } | undefined;
  return normalizeDisplayForPolicy(row?.display_name ?? undefined) === PROTECTED_REVIEW_DISPLAY;
}

async function requesterPhone(userId: string): Promise<string | null> {
  const row = (await db
    .prepare('SELECT phone_number FROM users WHERE id = ?')
    .get([userId])) as { phone_number: string | null } | undefined;
  return row?.phone_number ?? null;
}

/** If target is policy-protected, only the primary owner may proceed. */
async function assertCanModerateUser(req: AuthRequest, res: Response, targetUserId: string): Promise<boolean> {
  if (!(await isProtectedReviewUser(targetUserId))) return true;
  const phone = await requesterPhone(req.userId!);
  if (!isOwnerAdmin(req.userId!, phone)) {
    res.status(403).json({
      error: 'Only the primary site owner can review or moderate this account.',
    });
    return false;
  }
  return true;
}

/** SQL fragment: hide protected user from admin directory unless requester is owner. */
function sqlExcludeProtectedDisplay(ownerView: boolean): string {
  if (ownerView) return '';
  return ` AND (COALESCE(LOWER(TRIM(p.display_name)), '') != '${PROTECTED_REVIEW_DISPLAY}')`;
}

type ClientPlatformSignals = {
  last_client_platform: string | null;
  push_token: string | null;
  has_web_push: boolean;
};

async function loadClientPlatformSignalsByUserId(
  userIds: string[],
): Promise<Record<string, ClientPlatformSignals>> {
  if (userIds.length === 0) return {};
  const placeholders = userIds.map(() => '?').join(',');
  const userRows = (await db
    .prepare(
      `SELECT id, last_client_platform, push_token FROM users WHERE id IN (${placeholders})`,
    )
    .all(userIds)) as {
    id: string;
    last_client_platform: string | null;
    push_token: string | null;
  }[];
  const webRows = (await db
    .prepare(
      `SELECT DISTINCT user_id FROM web_push_subscriptions WHERE user_id IN (${placeholders})`,
    )
    .all(userIds)) as { user_id: string }[];
  const webSet = new Set(webRows.map((r) => r.user_id));
  const out: Record<string, ClientPlatformSignals> = {};
  for (const row of userRows) {
    out[row.id] = {
      last_client_platform: row.last_client_platform,
      push_token: row.push_token,
      has_web_push: webSet.has(row.id),
    };
  }
  for (const id of userIds) {
    if (!out[id]) {
      out[id] = { last_client_platform: null, push_token: null, has_web_push: webSet.has(id) };
    }
  }
  return out;
}

function mapAdminListUser(
  u: {
    id: string;
    email?: string | null;
    phone_number?: string | null;
    display_name?: string | null;
    age?: number | null;
    gender?: string | null;
    location?: string | null;
    is_admin?: number | boolean;
    is_restricted?: number | boolean;
    hidden_from_browse?: number | boolean;
    created_at: string;
    last_active_at?: string | null;
    account_status?: string | null;
  },
  tokenCounts: Record<string, number>,
  platformSignals: Record<string, ClientPlatformSignals>,
  overrides?: { is_restricted?: boolean; account_status?: string; onboardingProgress?: OnboardingProgress },
) {
  const signals = platformSignals[u.id];
  const clientPlatform = inferClientPlatformFromSignals(signals || {});
  return {
    id: u.id,
    email: u.email || u.phone_number || 'N/A',
    phoneNumber: u.phone_number,
    display_name: u.display_name,
    age: u.age,
    gender: u.gender,
    location: u.location,
    is_admin: u.is_admin === 1 || u.is_admin === true,
    is_restricted:
      overrides?.is_restricted ?? (u.is_restricted === 1 || u.is_restricted === true),
    hiddenFromBrowse: u.hidden_from_browse === 1 || u.hidden_from_browse === true,
    created_at: u.created_at,
    last_active_at: u.last_active_at,
    tokenCount: tokenCounts[u.id] || 0,
    clientPlatform,
    clientPlatformLabel: clientPlatformLabel(clientPlatform),
    ...(overrides?.account_status != null ? { account_status: overrides.account_status } : {}),
    ...(overrides?.onboardingProgress != null
      ? { onboardingProgress: overrides.onboardingProgress }
      : {}),
  };
}

export type AdminUserPhoto = {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
};

/** Gallery rows for admin moderation; falls back to profiles.photo_url when the gallery table is empty. */
async function loadAdminProfilePhotos(
  profileId: string,
  legacyPhotoUrl?: string | null,
): Promise<AdminUserPhoto[]> {
  const raw = await db
    .prepare(
      `SELECT id, url, display_order, is_primary FROM photos WHERE profile_id = ? ORDER BY display_order ASC, id ASC`,
    )
    .all([profileId]);

  const rows = Array.isArray(raw) ? raw : [];
  const photos: AdminUserPhoto[] = rows
    .filter((p) => typeof p.url === 'string' && p.url.trim().length > 0)
    .map((p) => ({
      id: p.id,
      url: p.url.trim(),
      displayOrder: Number(p.display_order) || 0,
      isPrimary: p.is_primary === 1 || p.is_primary === true,
    }));

  if (photos.length > 0) return photos;

  const legacy = typeof legacyPhotoUrl === 'string' ? legacyPhotoUrl.trim() : '';
  if (!legacy) return [];

  return [
    {
      id: `legacy-${profileId}`,
      url: legacy,
      displayOrder: 0,
      isPrimary: true,
    },
  ];
}

// Create test users endpoint (admin only, or no auth in development)
adminRouter.post('/create-test-users', async (req: AuthRequest, res) => {
  // In development, allow without auth. In production, require admin.
  if (process.env.NODE_ENV === 'production') {
    // Check auth for production
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required in production' });
    }
    // Verify admin in production (simplified check for now)
    // In production, you'd want to properly verify the token and check is_admin
  }
  try {
    const testUsers = [
      {
        name: 'Alex',
        age: 28,
        gender: 'Man',
        location: 'San Francisco, CA',
        bio: 'Love hiking, coffee, and good conversations. Looking for someone to explore the city with!',
        lookingFor: 'Long-term relationship',
        interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'],
        phone: '+15551234567'
      },
      {
        name: 'Jordan',
        age: 26,
        gender: 'Woman',
        location: 'Los Angeles, CA',
        bio: 'Foodie, bookworm, and adventure seeker. Always up for trying something new!',
        lookingFor: 'Friendship or more',
        interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'],
        phone: '+15551234568'
      },
      {
        name: 'Sam',
        age: 30,
        gender: 'Non-binary',
        location: 'New York, NY',
        bio: 'Artist, musician, and creative soul. Love deep conversations and meaningful connections.',
        lookingFor: 'Meaningful connection',
        interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'],
        phone: '+15551234569'
      },
      {
        name: 'Taylor',
        age: 25,
        gender: 'Woman',
        location: 'Austin, TX',
        bio: 'Tech enthusiast, dog lover, and weekend explorer. Let\'s build something amazing together!',
        lookingFor: 'Long-term relationship',
        interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'],
        phone: '+15551234570'
      },
      {
        name: 'Casey',
        age: 29,
        gender: 'Man',
        location: 'Seattle, WA',
        bio: 'Coffee snob, music producer, and nature enthusiast. Looking for my person!',
        lookingFor: 'Serious relationship',
        interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'],
        phone: '+15551234571'
      }
    ];

    const createdUsers = [];

    for (const userData of testUsers) {
      try {
        const userId = uuidv4();
        const profileId = uuidv4();
        const now = new Date().toISOString();

        // Check if user already exists
        const existingUserStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
        const existingUser = await (existingUserStmt.get([userData.phone]) as Promise<{ id: string } | undefined>);

        if (existingUser) {
          console.log(`⏭️  User ${userData.name} already exists, skipping...`);
          continue;
        }

        // Create user
        const userStmt = db.prepare(`
          INSERT INTO users (
            id, phone_number, phone_verified, browse_unlocked_at, 
            tos_accepted_at, privacy_accepted_at, created_at, last_active_at
          ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
        `);
        
        await (userStmt.run([
          userId,
          userData.phone,
          now,
          now,
          now,
          now,
          now
        ]) as Promise<any>);

        // Create profile
        const profileStmt = db.prepare(`
          INSERT INTO profiles (
            id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        await (profileStmt.run([
          profileId,
          userId,
          userData.name,
          userData.age,
          userData.gender,
          userData.location,
          userData.bio,
          userData.lookingFor,
          now,
          now
        ]) as Promise<any>);

        // Create preferences
        const preferencesId = uuidv4();
        const preferencesStmt = db.prepare(`
          INSERT INTO preferences (
            id, profile_id, min_age, max_age, preferred_genders, max_distance
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        const minAge = Math.max(18, userData.age - 5);
        const maxAge = userData.age + 5;
        const preferredGenders = JSON.stringify(['Man', 'Woman', 'Non-binary']);

        await (preferencesStmt.run([
          preferencesId,
          profileId,
          minAge,
          maxAge,
          preferredGenders,
          50
        ]) as Promise<any>);

        // Create interests
        for (const interest of userData.interests) {
          const interestId = uuidv4();
          const interestStmt = db.prepare(`
            INSERT INTO interests (id, profile_id, name, category)
            VALUES (?, ?, ?, 'general')
          `);

          await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
        }

        // Grant a token
        const tokenId = uuidv4();
        const tokenStmt = db.prepare(`
          INSERT INTO mulligan_tokens (id, user_id, granted_at, source)
          VALUES (?, ?, ?, ?)
        `);

        await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

        createdUsers.push(userData.name);
      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.name}:`, error.message);
      }
    }

    res.json({
      message: `Successfully created ${createdUsers.length} test user accounts`,
      createdUsers,
      total: testUsers.length
    });
  } catch (error) {
    console.error('Error creating test users:', error);
    res.status(500).json({ error: 'Failed to create test users' });
  }
});

// Create unique test users (with random phone numbers) - Admin only
adminRouter.post('/create-unique-test-users', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const testUsersTemplate = [
      { name: 'Alex', age: 28, gender: 'Man', location: 'San Francisco, CA', bio: 'Love hiking, coffee, and good conversations.', lookingFor: 'Long-term relationship', interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'] },
      { name: 'Jordan', age: 26, gender: 'Woman', location: 'Los Angeles, CA', bio: 'Foodie, bookworm, and adventure seeker.', lookingFor: 'Friendship or more', interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'] },
      { name: 'Sam', age: 30, gender: 'Non-binary', location: 'New York, NY', bio: 'Artist, musician, and creative soul.', lookingFor: 'Meaningful connection', interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'] },
      { name: 'Taylor', age: 25, gender: 'Woman', location: 'Austin, TX', bio: 'Tech enthusiast, dog lover, and weekend explorer.', lookingFor: 'Long-term relationship', interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'] },
      { name: 'Casey', age: 29, gender: 'Man', location: 'Seattle, WA', bio: 'Coffee snob, music producer, and nature enthusiast.', lookingFor: 'Serious relationship', interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'] }
    ];

    const timestamp = Date.now();
    const createdUsers: string[] = [];

    for (let i = 0; i < testUsersTemplate.length; i++) {
      const userData = testUsersTemplate[i];
      // Generate unique phone number using timestamp + index + random
      const phone = `+1555${String(timestamp).slice(-6)}${String(i).padStart(2, '0')}${Math.floor(Math.random() * 10)}`;

      try {
        const userId = uuidv4();
        const profileId = uuidv4();
        const now = new Date().toISOString();

        // Check if phone already exists (unlikely but check anyway)
        const existingUserStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
        const existingUser = await (existingUserStmt.get([phone]) as Promise<{ id: string } | undefined>);
        if (existingUser) {
          // If exists, try again with different random suffix
          const newPhone = `+1555${String(Date.now()).slice(-6)}${String(i).padStart(2, '0')}${Math.floor(Math.random() * 100)}`;
          continue; // Skip this iteration and try next
        }

        // Create user
        const userStmt = db.prepare(`
          INSERT INTO users (
            id, email, phone_number, phone_verified, password, browse_unlocked_at, 
            tos_accepted_at, privacy_accepted_at, created_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await (userStmt.run([userId, null, phone, 1, '', now, now, now, now, now]) as Promise<any>);

        // Create profile
        const profileStmt = db.prepare(`
          INSERT INTO profiles (
            id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await (profileStmt.run([
          profileId, userId, userData.name, userData.age, userData.gender,
          userData.location, userData.bio, userData.lookingFor, now, now
        ]) as Promise<any>);

        // Create preferences
        const preferencesId = uuidv4();
        const preferencesStmt = db.prepare(`
          INSERT INTO preferences (
            id, profile_id, min_age, max_age, preferred_genders, max_distance
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        await (preferencesStmt.run([
          preferencesId, profileId, 18, 99, JSON.stringify(['Man', 'Woman', 'Non-binary']), 10000
        ]) as Promise<any>);

        // Create interests
        for (const interest of userData.interests) {
          const interestId = uuidv4();
          const interestStmt = db.prepare(`INSERT INTO interests (id, profile_id, name, category) VALUES (?, ?, ?, 'general')`);
          await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
        }

        // Grant a token
        const tokenId = uuidv4();
        const tokenStmt = db.prepare(`INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, ?)`);
        await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

        createdUsers.push(userData.name);
      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.name}:`, error.message);
      }
    }

    res.json({
      message: `Successfully created ${createdUsers.length} unique test user accounts`,
      createdUsers,
      total: testUsersTemplate.length
    });
  } catch (error: any) {
    console.error('Error creating unique test users:', error);
    res.status(500).json({ error: 'Failed to create unique test users', details: error.message });
  }
});

// Get admin statistics
adminRouter.get('/stats', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const activeOnly = sqlOnlyActiveAccounts('u');
    const completeOnly = sqlCompleteProfileAccounts('u');

    // All registered accounts (active + onboarding)
    const totalUsersResult = await (db
      .prepare('SELECT COUNT(*) as count FROM users')
      .get([]) as Promise<{ count: number | string }>);
    const totalUsers = parseAdminCount(totalUsersResult);

    // Active accounts with a profile row
    const totalProfilesResult = await (db
      .prepare(
        `SELECT COUNT(*) as count FROM profiles p INNER JOIN users u ON u.id = p.user_id WHERE 1=1${activeOnly}`,
      )
      .get([]) as Promise<{ count: number | string }>);
    const totalProfiles = parseAdminCount(totalProfilesResult);

    // Complete profiles: active + min photos (raffle / connect-ready)
    const completeUsersResult = await (db
      .prepare(`SELECT COUNT(*) as count FROM users u WHERE 1=1${completeOnly}`)
      .get([]) as Promise<{ count: number | string }>);
    const completeUsers = parseAdminCount(completeUsersResult);

    const totalMatchesResult = await (db.prepare('SELECT COUNT(*) as count FROM matches WHERE stage != ?').get(['expired']) as Promise<{ count: number | string }>);
    const totalMatches = parseAdminCount(totalMatchesResult);

    const restrictedUsersResult = await (db
      .prepare(
        `SELECT COUNT(*) as count FROM users u WHERE COALESCE(u.is_restricted, 0) = 1 AND COALESCE(u.is_admin, 0) = 0${activeOnly}`,
      )
      .get([]) as Promise<{ count: number | string }>);
    const restrictedUsers = parseAdminCount(restrictedUsersResult);

    const sinceActive = sevenDaysAgoIso();
    const activeUsers = await countRecentlyActiveUsers(sinceActive);

    const onboardingOnly = sqlOnlyOnboardingAccounts('u');
    const onboardingUsersResult = await (db
      .prepare(`SELECT COUNT(*) as count FROM users u WHERE 1=1${onboardingOnly}`)
      .get([]) as Promise<{ count: number | string }>);
    const onboardingUsers = parseAdminCount(onboardingUsersResult);

    res.json({
      totalUsers,
      totalProfiles,
      completeUsers,
      totalMatches,
      restrictedUsers,
      activeUsers,
      onboardingUsers,
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics', details: error.message });
  }
});

// Export report (stats + users summary) for sharing with partners
adminRouter.get('/export/report', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);
    const activeOnly = sqlOnlyActiveAccounts('u');
    const completeOnly = sqlCompleteProfileAccounts('u');

    const totalUsersResult = await (db
      .prepare('SELECT COUNT(*) as count FROM users')
      .get([]) as Promise<{ count: number | string }>);
    const totalUsers = parseAdminCount(totalUsersResult);

    const totalProfilesResult = await (db
      .prepare(
        `SELECT COUNT(*) as count FROM profiles p INNER JOIN users u ON u.id = p.user_id WHERE 1=1${activeOnly}`,
      )
      .get([]) as Promise<{ count: number | string }>);
    const totalProfiles = parseAdminCount(totalProfilesResult);

    const completeUsersResult = await (db
      .prepare(`SELECT COUNT(*) as count FROM users u WHERE 1=1${completeOnly}`)
      .get([]) as Promise<{ count: number | string }>);
    const completeUsers = parseAdminCount(completeUsersResult);

    const totalMatchesResult = await (db.prepare('SELECT COUNT(*) as count FROM matches WHERE stage != ?').get(['expired']) as Promise<{ count: number | string }>);
    const totalMatches = parseAdminCount(totalMatchesResult);

    const restrictedUsersResult = await (db
      .prepare(
        `SELECT COUNT(*) as count FROM users u WHERE COALESCE(u.is_restricted, 0) = 1 AND COALESCE(u.is_admin, 0) = 0${activeOnly}`,
      )
      .get([]) as Promise<{ count: number | string }>);
    const restrictedUsers = parseAdminCount(restrictedUsersResult);

    const sinceActive = sevenDaysAgoIso();
    const activeUsers = await countRecentlyActiveUsers(sinceActive);

    const onboardingOnly = sqlOnlyOnboardingAccounts('u');
    const onboardingUsersResult = await (db
      .prepare(`SELECT COUNT(*) as count FROM users u WHERE 1=1${onboardingOnly}`)
      .get([]) as Promise<{ count: number | string }>);
    const onboardingUsers = parseAdminCount(onboardingUsersResult);

    const usersResult = await (db.prepare(`
      SELECT 
        u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse, 
        u.created_at, u.last_active_at, u.account_status,
        p.display_name, p.age, p.gender, p.location
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT ?
    `).all([limit]) as Promise<any[]>);

    const userIds = usersResult.map((u: any) => u.id);
    let tokenCounts: Record<string, number> = {};

    if (userIds.length > 0) {
      const placeholders = userIds.map(() => '?').join(',');
      const tokensResult = await (db.prepare(`
        SELECT user_id, COUNT(*) as count FROM mulligan_tokens 
        WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL 
        GROUP BY user_id
      `).all(userIds) as Promise<{ user_id: string; count: number }[]>);

      tokensResult.forEach((row: any) => {
        tokenCounts[row.user_id] = parseInt(row.count) || 0;
      });
    }

    const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
    const users = usersResult.map((u: any) => mapAdminListUser(u, tokenCounts, platformSignals));

    const report = {
      exportedAt: new Date().toISOString(),
      stats: {
        totalUsers,
        totalProfiles,
        completeUsers,
        totalMatches,
        restrictedUsers,
        activeUsers,
        onboardingUsers,
      },
      users,
      usersIncluded: users.length,
      note: users.length < totalUsers ? `Showing most recent ${users.length} of ${totalUsers} users` : undefined
    };

    res.json(report);
  } catch (error: any) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report', details: error.message });
  }
});

// Email full user directory CSV to ops (retention / headcount review)
adminRouter.post('/users/export-email', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const requesterPhoneVal = await requesterPhone(req.userId!);
    const ownerView = isOwnerAdmin(req.userId!, requesterPhoneVal);
    const tayaHide = sqlExcludeProtectedDisplay(ownerView);

    const { rows, stats } = await fetchAllUsersForAdminExport(tayaHide);

    const requesterRow = (await db
      .prepare('SELECT email, phone_number FROM users WHERE id = ?')
      .get([req.userId!])) as { email: string | null; phone_number: string | null } | undefined;
    const requestedBy =
      requesterRow?.email?.trim() ||
      requesterRow?.phone_number?.trim() ||
      req.userId!;

    const emailResult = await sendAdminUsersExportEmail({ rows, stats, requestedBy });

    if (!emailResult.sent) {
      return res.status(503).json({
        error: emailResult.error || 'Failed to send export email',
        stats,
        userCount: rows.length,
      });
    }

    res.json({
      message: `User export emailed to ${emailResult.recipient}`,
      recipient: emailResult.recipient,
      userCount: rows.length,
      stats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error emailing user export:', error);
    res.status(500).json({ error: 'Failed to export users by email', details: message });
  }
});

// List match pairs (for drill-down from Matches stat)
adminRouter.get('/matches', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const requesterPhoneVal = await requesterPhone(req.userId!);
    const ownerView = isOwnerAdmin(req.userId!, requesterPhoneVal);
    const tayaMatchHide = ownerView
      ? ''
      : ` AND (COALESCE(LOWER(TRIM(p1.display_name)), '') != '${PROTECTED_REVIEW_DISPLAY}' AND COALESCE(LOWER(TRIM(p2.display_name)), '') != '${PROTECTED_REVIEW_DISPLAY}')`;

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const matchesResult = await (db.prepare(`
      SELECT m.id, m.stage, m.stage1_at,
        u1.id as user1_id, p1.display_name as user1_name, u1.phone_number as user1_phone,
        u2.id as user2_id, p2.display_name as user2_name, u2.phone_number as user2_phone
      FROM matches m
      JOIN users u1 ON u1.id = m.user1_id
      JOIN users u2 ON u2.id = m.user2_id
      LEFT JOIN profiles p1 ON p1.user_id = u1.id
      LEFT JOIN profiles p2 ON p2.user_id = u2.id
      WHERE m.stage != 'expired'${tayaMatchHide}
      ORDER BY m.stage1_at DESC
      LIMIT ? OFFSET ?
    `).all([limit, offset]) as Promise<any[]>);

    let totalResult: { count: number };
    if (ownerView) {
      totalResult = (await (db
        .prepare('SELECT COUNT(*) as count FROM matches WHERE stage != ?')
        .get(['expired']) as Promise<{ count: number }>)) as { count: number };
    } else {
      totalResult = (await (db
        .prepare(`
          SELECT COUNT(*) as count
          FROM matches m
          JOIN users u1 ON u1.id = m.user1_id
          JOIN users u2 ON u2.id = m.user2_id
          LEFT JOIN profiles p1 ON p1.user_id = u1.id
          LEFT JOIN profiles p2 ON p2.user_id = u2.id
          WHERE m.stage != 'expired'${tayaMatchHide}
        `)
        .get([]) as Promise<{ count: number }>)) as { count: number };
    }
    const total = totalResult?.count || 0;

    const matches = matchesResult.map((m: any) => ({
      id: m.id,
      stage: m.stage,
      stage1At: m.stage1_at,
      user1: { id: m.user1_id, name: m.user1_name || m.user1_phone || 'Unknown', phone: m.user1_phone },
      user2: { id: m.user2_id, name: m.user2_name || m.user2_phone || 'Unknown', phone: m.user2_phone }
    }));

    res.json({ matches, total });
  } catch (error: any) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
  }
});

// List users with pagination, search, and filter (restricted | active | with_profile)
adminRouter.get('/users', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const requesterPhoneVal = await requesterPhone(req.userId!);
    const ownerView = isOwnerAdmin(req.userId!, requesterPhoneVal);
    const tayaHide = sqlExcludeProtectedDisplay(ownerView);
    const activeOnly = sqlOnlyActiveAccounts('u');

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search as string || '';
    const filter = (req.query.filter as string || '').trim().toLowerCase();

    // Restricted: use a dedicated query - ONLY users explicitly marked restricted (is_restricted = 1)
    // COALESCE handles NULL; exclude admins from this list per product intent
    if (filter === 'restricted') {
      const baseWhere = `COALESCE(u.is_restricted, 0) = 1 AND COALESCE(u.is_admin, 0) = 0${activeOnly}`;
      const searchWhere = search
        ? ` AND (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)`
        : '';
      const searchTerm = `%${search}%`;
      const query = `
        SELECT DISTINCT u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse,
          u.created_at, u.last_active_at,
          p.display_name, p.age, p.gender, p.location
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ${baseWhere}${tayaHide}${searchWhere}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const params = search ? [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset] : [limit, offset];
      const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);

      const countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE ${baseWhere}${tayaHide}${searchWhere}
      `;
      const countParams = search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [];
      const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number }>);
      const total = totalResult?.count || 0;

      const userIds = usersResult.map((u: any) => u.id);
      let tokenCounts: Record<string, number> = {};
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',');
        const tokensResult = await (db.prepare(`
          SELECT user_id, COUNT(*) as count FROM mulligan_tokens
          WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL
          GROUP BY user_id
        `).all(userIds) as Promise<{ user_id: string; count: number }[]>);
        tokensResult.forEach((row: any) => { tokenCounts[row.user_id] = parseInt(row.count) || 0; });
      }

      const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
      const users = usersResult.map((u: any) =>
        mapAdminListUser(u, tokenCounts, platformSignals, { is_restricted: true }),
      );

      return res.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }

    // Users who have a profile row (aligns with Profiles count on /admin/stats)
    if (filter === 'with_profile' || filter === 'profiles') {
      const searchWhere = search
        ? ` AND (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)`
        : '';
      const searchTerm = `%${search}%`;
      const query = `
        SELECT DISTINCT u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse,
          u.created_at, u.last_active_at,
          p.display_name, p.age, p.gender, p.location
        FROM users u
        INNER JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${activeOnly}${tayaHide}${searchWhere}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const params = search ? [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset] : [limit, offset];
      const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);

      const countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        INNER JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${activeOnly}${tayaHide}${searchWhere}
      `;
      const countParams = search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [];
      const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number }>);
      const total = totalResult?.count || 0;

      const userIds = usersResult.map((u: any) => u.id);
      let tokenCounts: Record<string, number> = {};
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',');
        const tokensResult = await (db.prepare(`
          SELECT user_id, COUNT(*) as count FROM mulligan_tokens
          WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL
          GROUP BY user_id
        `).all(userIds) as Promise<{ user_id: string; count: number }[]>);
        tokensResult.forEach((row: any) => {
          tokenCounts[row.user_id] = parseInt(row.count) || 0;
        });
      }

      const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
      const users = usersResult.map((u: any) => mapAdminListUser(u, tokenCounts, platformSignals));

      return res.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }

    // Active accounts with min photos — aligns with Total Users stat / raffle eligibility
    if (filter === 'complete' || filter === 'complete_profile') {
      const completeOnly = sqlCompleteProfileAccounts('u');
      const searchWhere = search
        ? ` AND (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)`
        : '';
      const searchTerm = `%${search}%`;
      const query = `
        SELECT DISTINCT u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse,
          u.created_at, u.last_active_at,
          p.display_name, p.age, p.gender, p.location,
          (SELECT COUNT(*) FROM photos ph WHERE ph.profile_id = p.id) as photo_count
        FROM users u
        INNER JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${completeOnly}${tayaHide}${searchWhere}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const params = search ? [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset] : [limit, offset];
      const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);

      const countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        INNER JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${completeOnly}${tayaHide}${searchWhere}
      `;
      const countParams = search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [];
      const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number }>);
      const total = totalResult?.count || 0;

      const userIds = usersResult.map((u: any) => u.id);
      let tokenCounts: Record<string, number> = {};
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',');
        const tokensResult = await (db.prepare(`
          SELECT user_id, COUNT(*) as count FROM mulligan_tokens
          WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL
          GROUP BY user_id
        `).all(userIds) as Promise<{ user_id: string; count: number }[]>);
        tokensResult.forEach((row: any) => { tokenCounts[row.user_id] = parseInt(row.count) || 0; });
      }

      const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
      const users = usersResult.map((u: any) => mapAdminListUser(u, tokenCounts, platformSignals));

      return res.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }

    if (filter === 'onboarding') {
      const onboardingOnly = sqlOnlyOnboardingAccounts('u');
      const searchWhere = search
        ? ` AND (u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)`
        : '';
      const searchTerm = `%${search}%`;
      const query = `
        SELECT DISTINCT u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse,
          u.created_at, u.last_active_at, u.account_status,
          p.id as profile_id, p.display_name, p.age, p.gender, p.location,
          (SELECT COUNT(*) FROM photos ph WHERE ph.profile_id = p.id) as photo_count
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${onboardingOnly}${tayaHide}${searchWhere}
        ORDER BY u.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const params = search ? [searchTerm, searchTerm, searchTerm, searchTerm, limit, offset] : [limit, offset];
      const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);

      const countQuery = `
        SELECT COUNT(DISTINCT u.id) as count FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE 1=1${onboardingOnly}${tayaHide}${searchWhere}
      `;
      const countParams = search ? [searchTerm, searchTerm, searchTerm, searchTerm] : [];
      const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number }>);
      const total = totalResult?.count || 0;

      const userIds = usersResult.map((u: any) => u.id);
      let tokenCounts: Record<string, number> = {};
      if (userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(',');
        const tokensResult = await (db.prepare(`
          SELECT user_id, COUNT(*) as count FROM mulligan_tokens
          WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL
          GROUP BY user_id
        `).all(userIds) as Promise<{ user_id: string; count: number }[]>);
        tokensResult.forEach((row: any) => { tokenCounts[row.user_id] = parseInt(row.count) || 0; });
      }

      const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
      const users = usersResult.map((u: any) => {
        const hasProfileRow = Boolean(u.profile_id);
        const photoCount = Math.floor(Number(u.photo_count ?? 0));
        const onboardingProgress = computeOnboardingProgress(
          u.display_name,
          u.location,
          photoCount,
          hasProfileRow,
          u.age,
          u.gender,
        );
        return mapAdminListUser(u, tokenCounts, platformSignals, {
          account_status: u.account_status ?? 'onboarding',
          onboardingProgress,
        });
      });

      return res.json({ users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    }

    // Build base query for default list (all users) and 7-day active filter
    let query = `
      SELECT DISTINCT
        u.id, u.email, u.phone_number, u.is_admin, u.is_restricted, u.hidden_from_browse, 
        u.created_at, u.last_active_at, u.account_status,
        p.display_name, p.age, p.gender, p.location
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
    `;

    const params: any[] = [];
    const conditions: string[] = [];

    if (filter === 'active') {
      const sinceActive = sevenDaysAgoIso();
      conditions.push('u.last_active_at IS NOT NULL AND u.last_active_at >= ?');
      params.push(sinceActive);
    }

    if (search) {
      conditions.push('(u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (!ownerView) {
      conditions.push(`(COALESCE(LOWER(TRIM(p.display_name)), '') != '${PROTECTED_REVIEW_DISPLAY}')`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += filter === 'active'
      ? ` ORDER BY u.last_active_at DESC LIMIT ? OFFSET ?`
      : ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const usersResult = await (db.prepare(query).all(params) as Promise<any[]>);
    
    // Get total count for pagination (mirror filter logic)
    const sinceActive = sevenDaysAgoIso();
    let countQuery: string;
    const countParams: any[] = [];
    if (filter === 'active') {
      countQuery =
        'SELECT COUNT(DISTINCT u.id) as count FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.last_active_at IS NOT NULL AND u.last_active_at >= ?';
      countParams.push(sinceActive);
    } else {
      countQuery = 'SELECT COUNT(DISTINCT u.id) as count FROM users u LEFT JOIN profiles p ON p.user_id = u.id';
    }
    if (search) {
      countQuery += countQuery.includes('WHERE') ? ' AND ' : ' WHERE ';
      countQuery += '(u.email LIKE ? OR p.display_name LIKE ? OR u.phone_number LIKE ? OR u.id LIKE ?)';
      const st = `%${search}%`;
      countParams.push(st, st, st, st);
    }
    if (!ownerView) {
      countQuery += countQuery.includes('WHERE') ? ' AND ' : ' WHERE ';
      countQuery += `(COALESCE(LOWER(TRIM(p.display_name)), '') != '${PROTECTED_REVIEW_DISPLAY}')`;
    }
    const totalResult = await (db.prepare(countQuery).get(countParams) as Promise<{ count: number | string }>);
    const total = parseAdminCount(totalResult);

    // Get token counts for all users (more efficient than per-user queries)
    const userIds = usersResult.map((u: any) => u.id);
    let tokenCounts: Record<string, number> = {};
    
    if (userIds.length > 0) {
      // Create placeholders for IN clause
      const placeholders = userIds.map((_, i) => `?`).join(',');
      const tokensQuery = `SELECT user_id, COUNT(*) as count FROM mulligan_tokens WHERE user_id IN (${placeholders}) AND used_at IS NULL AND returned_at IS NULL GROUP BY user_id`;
      const tokensResult = await (db.prepare(tokensQuery).all(userIds) as Promise<{ user_id: string; count: number }[]>);
      
      // Build tokenCounts map
      tokensResult.forEach((row: any) => {
        tokenCounts[row.user_id] = parseInt(row.count) || 0;
      });
    }

    const platformSignals = await loadClientPlatformSignalsByUserId(userIds);
    const users = usersResult.map((u: any) =>
      mapAdminListUser(u, tokenCounts, platformSignals, {
        account_status: u.account_status ?? 'active',
      }),
    );

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Get user details
adminRouter.get('/users/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;

    // Get user
    const userResult = await (db.prepare('SELECT * FROM users WHERE id = ?').get([userId]) as Promise<any>);
    if (!userResult) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get profile
    const profileResult = await (db.prepare('SELECT * FROM profiles WHERE user_id = ?').get([userId]) as Promise<any>);

    let photos: AdminUserPhoto[] = [];
    let interests: string[] = [];
    let lifestyle: Record<string, string | null> | null = null;

    if (profileResult?.id) {
      const profileId = profileResult.id as string;

      photos = await loadAdminProfilePhotos(profileId, profileResult.photo_url);

      const interestsResult = await (db
        .prepare('SELECT name FROM interests WHERE profile_id = ? ORDER BY name ASC')
        .all([profileId]) as Promise<{ name: string }[]>);
      interests = interestsResult.map((r) => r.name).filter(Boolean);

      const lifestyleRow = (await db
        .prepare(
          `SELECT smoking, drinking, children, pets, religion, work_life_balance, works_out FROM lifestyle WHERE profile_id = ?`,
        )
        .get([profileId])) as Record<string, string | null> | undefined;

      if (lifestyleRow) {
        lifestyle = {
          smoking: lifestyleRow.smoking ?? null,
          drinking: lifestyleRow.drinking ?? null,
          children: lifestyleRow.children ?? null,
          pets: lifestyleRow.pets ?? null,
          religion: lifestyleRow.religion ?? null,
          workLifeBalance: lifestyleRow.work_life_balance ?? null,
          worksOut: lifestyleRow.works_out ?? null,
        };
      }
    }

    // Get token count
    const tokensResult = await (db.prepare(`
      SELECT * FROM mulligan_tokens 
      WHERE user_id = ? 
      ORDER BY granted_at DESC
    `).all([userId]) as Promise<any[]>);
    const tokenCount = tokensResult.filter((t: any) => !t.used_at && !t.returned_at).length;

    // Get matches count
    const matchesResult = await (db.prepare('SELECT COUNT(*) as count FROM matches WHERE (user1_id = ? OR user2_id = ?) AND stage != ?').get([userId, userId, 'expired']) as Promise<{ count: number }>);
    const matches = matchesResult?.count || 0;

    // Get blocks count
    const blocksResult = await (db.prepare('SELECT COUNT(*) as count FROM blocks WHERE blocker_id = ?').get([userId]) as Promise<{ count: number }>);
    const blocks = blocksResult?.count || 0;

    const webPushRow = await (db
      .prepare('SELECT 1 as ok FROM web_push_subscriptions WHERE user_id = ? LIMIT 1')
      .get([userId]) as Promise<{ ok: number } | undefined>);
    const clientPlatform = inferClientPlatformFromSignals({
      last_client_platform: userResult.last_client_platform,
      push_token: userResult.push_token,
      has_web_push: Boolean(webPushRow),
    });

    res.json({
      id: userResult.id,
      email: userResult.email || userResult.phone_number || 'N/A',
      phoneNumber: userResult.phone_number,
      is_admin: userResult.is_admin === 1,
      is_restricted: userResult.is_restricted === 1,
      hiddenFromBrowse: userResult.hidden_from_browse === 1,
      created_at: userResult.created_at,
      last_active_at: userResult.last_active_at,
      clientPlatform,
      clientPlatformLabel: clientPlatformLabel(clientPlatform),
      profile: profileResult || null,
      photos,
      interests,
      lifestyle,
      tokenCount,
      tokens: tokensResult,
      matches,
      blocks
    });
  } catch (error: any) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details', details: error.message });
  }
});

// Batch unrestrict users by display name (fix users wrongly marked restricted)
adminRouter.post('/users/batch-unrestrict', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { displayNames } = req.body as { displayNames: string[] };
    if (!Array.isArray(displayNames) || displayNames.length === 0) {
      return res.status(400).json({ error: 'displayNames must be a non-empty array' });
    }

    const touchesProtected = displayNames.some(
      (n) => normalizeDisplayForPolicy(n) === PROTECTED_REVIEW_DISPLAY
    );
    if (touchesProtected) {
      const phone = await requesterPhone(req.userId!);
      if (!isOwnerAdmin(req.userId!, phone)) {
        return res.status(403).json({
          error: 'Only the primary site owner can batch-change this account.',
        });
      }
    }

    const placeholders = displayNames.map(() => '?').join(',');
    const profilesResult = await (db.prepare(`
      SELECT p.user_id FROM profiles p
      WHERE p.display_name IN (${placeholders})
    `).all(displayNames) as Promise<{ user_id: string }[]>);

    const userIds = profilesResult.map((r: any) => r.user_id);
    if (userIds.length === 0) {
      return res.json({ message: 'No matching users found', unrestricted: 0, userIds: [] });
    }

    for (const userId of userIds) {
      await (db.prepare('UPDATE users SET is_restricted = 0 WHERE id = ?').run([userId]) as Promise<any>);
    }

    res.json({
      message: `Unrestricted ${userIds.length} user(s)`,
      unrestricted: userIds.length,
      userIds
    });
  } catch (error: any) {
    console.error('Error batch unrestricting:', error);
    res.status(500).json({ error: 'Failed to batch unrestrict', details: error.message });
  }
});

// Hide or show user in Connect / browse for other users
adminRouter.post(
  '/users/:id/set-browse-hidden',
  authenticateToken,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.params.id;
      if (!(await assertCanModerateUser(req, res, userId))) return;
      const { hidden } = req.body;

      if (typeof hidden !== 'boolean') {
        return res.status(400).json({ error: 'hidden must be a boolean' });
      }

      const { setUserHiddenFromBrowse } = await import('../config/hiddenFromBrowse.js');
      await setUserHiddenFromBrowse(userId, hidden);

      res.json({
        message: hidden
          ? 'User hidden from Connect / browse for other users'
          : 'User visible in Connect / browse for other users',
        userId,
        hiddenFromBrowse: hidden,
      });
    } catch (error: any) {
      console.error('Error updating browse visibility:', error);
      res.status(500).json({
        error: 'Failed to update browse visibility',
        details: error.message,
      });
    }
  },
);

// Restrict/unrestrict user; optional hiddenFromBrowse toggles Connect/browse visibility
adminRouter.post('/users/:id/restrict', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;
    const { restricted, hiddenFromBrowse } = req.body;

    const willRestrict = typeof restricted === 'boolean';
    const willSetBrowseHidden = typeof hiddenFromBrowse === 'boolean';

    if (!willRestrict && !willSetBrowseHidden) {
      return res.status(400).json({
        error: 'Provide restricted and/or hiddenFromBrowse as a boolean',
      });
    }

    const messageParts: string[] = [];

    if (willRestrict) {
      await (db
        .prepare('UPDATE users SET is_restricted = ? WHERE id = ?')
        .run([restricted ? 1 : 0, userId]) as Promise<any>);
      messageParts.push(restricted ? 'restricted' : 'unrestricted');
    }

    if (willSetBrowseHidden) {
      const { setUserHiddenFromBrowse } = await import('../config/hiddenFromBrowse.js');
      await setUserHiddenFromBrowse(userId, hiddenFromBrowse);
      messageParts.push(
        hiddenFromBrowse
          ? 'hidden from Connect / browse for other users'
          : 'visible in Connect / browse for other users',
      );
    }

    res.json({
      message: `User ${messageParts.join('; ')} successfully`,
      userId,
      ...(willRestrict ? { restricted } : {}),
      ...(willSetBrowseHidden ? { hiddenFromBrowse } : {}),
    });
  } catch (error: any) {
    console.error('Error restricting user:', error);
    res.status(500).json({ error: 'Failed to update user restriction', details: error.message });
  }
});

// Grant tokens to user
adminRouter.post('/users/:id/grant-tokens', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;
    const { count } = req.body;

    const requested = parseInt(count) || 1;
    if (requested < 1 || requested > 100) {
      return res.status(400).json({ error: 'Token count must be between 1 and 100' });
    }

    const tokensResult = await (db.prepare(`
      SELECT * FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL
    `).all([userId]) as Promise<any[]>);
    const availableTokens = tokensResult?.length ?? 0;
    const tokensToGrant = Math.min(requested, Math.max(0, 7 - availableTokens));

    if (tokensToGrant <= 0) {
      return res.status(400).json({
        error: `User already has ${availableTokens} tokens (max 7). Cannot grant more.`,
      });
    }

    const now = new Date().toISOString();
    let tokensGranted = 0;

    for (let i = 0; i < tokensToGrant; i++) {
      const tokenId = uuidv4();
      const tokenStmt = db.prepare('INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, ?)');
      await (tokenStmt.run([tokenId, userId, now, 'admin_grant']) as Promise<any>);
      tokensGranted++;
    }

    res.json({
      message: `Granted ${tokensGranted} token(s) (capped at 7 max; user had ${availableTokens})`,
      tokensGranted,
    });
  } catch (error: any) {
    console.error('Error granting tokens:', error);
    res.status(500).json({ error: 'Failed to grant tokens', details: error.message });
  }
});

// Grant tokens by phone number (for dev/test purposes)
adminRouter.post('/grant-tokens-by-phone', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { phoneNumber, tokenCount } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const requested = parseInt(tokenCount) || 10;
    if (requested < 1 || requested > 100) {
      return res.status(400).json({ error: 'Token count must be between 1 and 100' });
    }

    const userStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
    const user = await (userStmt.get([phoneNumber]) as Promise<{ id: string } | undefined>);

    if (!user) {
      return res.status(404).json({ error: 'User not found with that phone number' });
    }

    if (!(await assertCanModerateUser(req, res, user.id))) return;

    const tokensResult = await (db.prepare(`
      SELECT * FROM mulligan_tokens WHERE user_id = ? AND used_at IS NULL AND returned_at IS NULL
    `).all([user.id]) as Promise<any[]>);
    const availableTokens = tokensResult?.length ?? 0;
    const tokensToGrant = Math.min(requested, Math.max(0, 7 - availableTokens));

    if (tokensToGrant <= 0) {
      return res.status(400).json({
        error: `User already has ${availableTokens} tokens (max 7). Cannot grant more.`,
      });
    }

    const now = new Date().toISOString();
    let tokensGranted = 0;

    for (let i = 0; i < tokensToGrant; i++) {
      const tokenId = uuidv4();
      const tokenStmt = db.prepare('INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, ?)');
      await (tokenStmt.run([tokenId, user.id, now, 'admin_grant']) as Promise<any>);
      tokensGranted++;
    }

    const totalAvailableTokens = availableTokens + tokensGranted;

    res.json({
      message: `Granted ${tokensGranted} token(s) (capped at 7 max)`,
      tokensGranted,
      totalAvailableTokens,
    });
  } catch (error: any) {
    console.error('Error granting tokens by phone:', error);
    res.status(500).json({ error: 'Failed to grant tokens', details: error.message });
  }
});

// Force a stage1 match between two users by phone (bypasses tokens / preferences / distance)
adminRouter.post('/matches/force-by-phone', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const phoneA = String(req.body?.phoneA ?? req.body?.phone1 ?? '').trim();
    const phoneB = String(req.body?.phoneB ?? req.body?.phone2 ?? '').trim();

    if (!phoneA || !phoneB) {
      return res.status(400).json({ error: 'phoneA and phoneB are required' });
    }

    const result = await forceMatchByPhone(phoneA, phoneB);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.created) {
      return res.json({
        message: 'Match created',
        matchId: result.matchId,
        user1: result.user1,
        user2: result.user2,
        expiresAt: result.expiresAt,
      });
    }

    return res.json({
      message: 'Match already exists',
      matchId: result.matchId,
      stage: result.stage,
      user1: result.user1,
      user2: result.user2,
    });
  } catch (error: any) {
    console.error('Error forcing match by phone:', error);
    res.status(500).json({ error: 'Failed to force match', details: error.message });
  }
});

// Set admin status
adminRouter.post('/users/:id/set-admin', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;
    const { isAdmin } = req.body;

    if (typeof isAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isAdmin must be a boolean' });
    }

    await (db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run([isAdmin ? 1 : 0, userId]) as Promise<any>);

    res.json({
      message: `Admin status ${isAdmin ? 'granted' : 'removed'}`,
      userId,
      isAdmin
    });
  } catch (error: any) {
    console.error('Error setting admin status:', error);
    res.status(500).json({ error: 'Failed to update admin status', details: error.message });
  }
});

// List matches for a user (for admin: pick a conversation to review messages)
// includeExpired: default true so moderators can review old / expired threads (?includeExpired=false to hide)
adminRouter.get('/users/:id/matches', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;
    const includeExpired =
      req.query.includeExpired !== 'false' && req.query.includeExpired !== '0';

    const stageClause = includeExpired ? '' : ` AND m.stage != 'expired'`;

    const matchesResult = await (db.prepare(`
      SELECT m.id as match_id, m.stage, m.stage1_at,
        u2.id as other_user_id, p2.display_name as other_user_name,
        u2.phone_number as other_user_phone,
        (SELECT COUNT(*) FROM messages msg WHERE msg.match_id = m.id) as message_count
      FROM matches m
      JOIN users u2 ON u2.id = CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END
      LEFT JOIN profiles p2 ON p2.user_id = u2.id
      WHERE (m.user1_id = ? OR m.user2_id = ?)${stageClause}
      ORDER BY m.stage1_at DESC
    `).all([userId, userId, userId]) as Promise<any[]>);

    const matches = matchesResult.map((m: any) => ({
      matchId: m.match_id,
      stage: m.stage,
      stage1At: m.stage1_at,
      otherUserId: m.other_user_id,
      otherUserName: m.other_user_name || 'Unknown',
      otherUserPhone: m.other_user_phone || null,
      messageCount: Math.floor(Number(m.message_count ?? 0)),
    }));

    res.json({ matches });
  } catch (error: any) {
    console.error('Error fetching user matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
  }
});

// Get user messages (optional ?matchId= for one conversation).
// Query: limit (default 2000, max 5000), offset, order=asc|desc (default asc when matchId set, else desc).
adminRouter.get('/users/:id/messages', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (!(await assertCanModerateUser(req, res, userId))) return;
    const matchId = req.query.matchId as string | undefined;
    const rawLimit = parseInt(String(req.query.limit || ''), 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 2000, 1), 5000);
    const rawOffset = parseInt(String(req.query.offset || ''), 10);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    let orderDir = 'DESC';
    if (req.query.order === 'asc' || req.query.order === 'ASC') {
      orderDir = 'ASC';
    } else if (req.query.order === 'desc' || req.query.order === 'DESC') {
      orderDir = 'DESC';
    } else if (matchId) {
      orderDir = 'ASC';
    }

    const baseWhere = `(ma.user1_id = ? OR ma.user2_id = ?)`;
    const whereParams: any[] = [userId, userId];
    let matchClause = '';
    if (matchId) {
      matchClause = ` AND m.match_id = ?`;
      whereParams.push(matchId);
    }

    const countSql = `
      SELECT COUNT(*) as count
      FROM messages m
      INNER JOIN matches ma ON ma.id = m.match_id
      WHERE ${baseWhere}${matchClause}
    `;
    const countRow = await (db.prepare(countSql).get(whereParams) as Promise<{ count: number | string } | undefined>);
    const total = Math.floor(Number(countRow?.count ?? 0));

    let query = `
      SELECT 
        m.id, m.content, m.sent_at, m.read_at, m.match_id, m.image_url, m.video_url, m.audio_url,
        u1.id as sender_id, p1.display_name as sender_name,
        u2.id as other_user_id, p2.display_name as other_user_name,
        CASE WHEN m.sender_id = ? THEN 0 ELSE 1 END as is_from_target_user
      FROM messages m
      INNER JOIN matches ma ON ma.id = m.match_id
      LEFT JOIN users u1 ON u1.id = m.sender_id
      LEFT JOIN profiles p1 ON p1.user_id = m.sender_id
      LEFT JOIN users u2 ON u2.id = CASE WHEN m.sender_id = ma.user1_id THEN ma.user2_id ELSE ma.user1_id END
      LEFT JOIN profiles p2 ON p2.user_id = u2.id
      WHERE ${baseWhere}${matchClause}
      ORDER BY m.sent_at ${orderDir}, m.id ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const params: any[] = [userId, ...whereParams, limit, offset];

    const messagesResult = await (db.prepare(query).all(params) as Promise<any[]>);

    const messages = messagesResult.map((m: any) => ({
      id: m.id,
      content: m.content,
      imageUrl: m.image_url || null,
      videoUrl: m.video_url || null,
      audioUrl: m.audio_url || null,
      senderId: m.sender_id,
      senderName: m.sender_name || 'Unknown',
      otherUserId: m.other_user_id,
      otherUserName: m.other_user_name || 'Unknown',
      matchId: m.match_id,
      sentAt: m.sent_at,
      readAt: m.read_at,
      isFromTargetUser: m.is_from_target_user === 1
    }));

    res.json({
      messages,
      total,
      limit,
      offset,
      hasMore: offset + messages.length < total,
    });
  } catch (error: any) {
    console.error('Error fetching user messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

// Delete all test users
adminRouter.delete('/delete-test-users', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Identify test users by multiple criteria:
    // 1. Email patterns: test@, newtest@, testing@, testboy@, newaccount@
    // 2. Phone numbers from create-test-users endpoint: +15551234567-71
    // 3. Users with tokens from 'test_account' source
    // 4. Display names from test user list: Alex, Jordan, Sam, Taylor, Casey
    
    const testEmailPatterns = [
      '%test%@%',
      '%testing%@%',
      '%newtest%@%',
      '%testboy%@%',
      '%newaccount%@%'
    ];
    
    const testPhoneNumbers = [
      '+15551234567',
      '+15551234568',
      '+15551234569',
      '+15551234570',
      '+15551234571'
    ];
    
    const testDisplayNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey'];

    // Find all test users by email patterns OR phone numbers OR display names OR test account tokens
    const testUsersQuery = `
      SELECT DISTINCT u.id, u.email, u.phone_number, p.display_name
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN mulligan_tokens t ON t.user_id = u.id
      WHERE u.is_admin = 0
      AND (
        -- Email patterns
        ${testEmailPatterns.length > 0 ? `(${testEmailPatterns.map(() => 'u.email LIKE ?').join(' OR ')})` : '0=1'}
        -- Phone numbers
        ${testPhoneNumbers.length > 0 ? `OR u.phone_number IN (${testPhoneNumbers.map(() => '?').join(', ')})` : ''}
        -- Display names
        ${testDisplayNames.length > 0 ? `OR p.display_name IN (${testDisplayNames.map(() => '?').join(', ')})` : ''}
        -- Test account tokens
        OR t.source = 'test_account'
      )
    `;
    
    const queryParams = [
      ...testEmailPatterns,
      ...testPhoneNumbers,
      ...testDisplayNames
    ];
    
    const testUsers = await (db.prepare(testUsersQuery).all(queryParams) as Promise<Array<{
      id: string;
      email: string | null;
      phone_number: string | null;
      display_name: string | null;
    }>>);

    if (testUsers.length === 0) {
      return res.json({
        message: 'No test users found to delete',
        deleted: 0
      });
    }

    console.log(`🗑️  Deleting ${testUsers.length} test users...`);

    const deletedUsers: string[] = [];
    let deletedCount = 0;

    for (const user of testUsers) {
      try {
        const userId = user.id;
        await deleteUserAccountData(userId);
        deletedUsers.push(user.display_name || user.email || user.phone_number || userId);
        deletedCount++;
        
        console.log(`  ✅ Deleted: ${user.display_name || user.email || user.phone_number || userId}`);
      } catch (error: any) {
        console.error(`  ❌ Error deleting user ${user.id}:`, error.message);
      }
    }

    res.json({
      message: `Successfully deleted ${deletedCount} test user(s)`,
      deleted: deletedCount,
      deletedUsers
    });
  } catch (error: any) {
    console.error('Error deleting test users:', error);
    res.status(500).json({ error: 'Failed to delete test users', details: error.message });
  }
});

// One-shot launch announcement to all users with push (Expo + Web Push)
adminRouter.post('/announcements/launch-live-push', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const limit =
      typeof req.body?.limit === 'number' && Number.isFinite(req.body.limit)
        ? req.body.limit
        : undefined;
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const body = typeof req.body?.body === 'string' ? req.body.body : undefined;

    const { sendLaunchLivePushAnnouncement, formatLaunchAnnouncementSummary } = await import(
      '../services/launchAnnouncement.js'
    );
    const result = await sendLaunchLivePushAnnouncement({ dryRun, limit, title, body });

    res.json({
      ...result,
      channel: 'push',
      message: formatLaunchAnnouncementSummary(result),
    });
  } catch (error: any) {
    console.error('Launch announcement push error:', error);
    res.status(500).json({ error: 'Failed to send launch announcement', details: error.message });
  }
});

// One-shot push nudge for onboarding users (Expo + Web Push only)
adminRouter.post('/onboarding/complete-profile-nudge', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const limit =
      typeof req.body?.limit === 'number' && Number.isFinite(req.body.limit)
        ? req.body.limit
        : undefined;
    const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
    const body = typeof req.body?.body === 'string' ? req.body.body : undefined;

    const { sendOnboardingCompleteProfilePushNudges, formatPushNudgeSummary } = await import(
      '../services/onboardingNudge.js'
    );
    const result = await sendOnboardingCompleteProfilePushNudges({ dryRun, limit, title, body });

    res.json({
      ...result,
      channel: 'push',
      message: formatPushNudgeSummary(result),
    });
  } catch (error: any) {
    console.error('Onboarding push nudge error:', error);
    res.status(500).json({ error: 'Failed to send onboarding push nudges', details: error.message });
  }
});

// SMS profile nudge for onboarding users (Twilio Messages API — phone on file, not opted out)
adminRouter.post('/onboarding/complete-profile-sms-nudge', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const allowResend = req.body?.allowResend === true;
    const limit =
      typeof req.body?.limit === 'number' && Number.isFinite(req.body.limit)
        ? req.body.limit
        : undefined;
    const body = typeof req.body?.body === 'string' ? req.body.body : undefined;
    const minHoursSinceSignup =
      typeof req.body?.minHoursSinceSignup === 'number' && Number.isFinite(req.body.minHoursSinceSignup)
        ? req.body.minHoursSinceSignup
        : undefined;

    const { sendOnboardingCompleteProfileSmsNudges, formatSmsNudgeSummary } = await import(
      '../services/onboardingNudge.js'
    );
    const result = await sendOnboardingCompleteProfileSmsNudges({
      dryRun,
      limit,
      body,
      allowResend,
      minHoursSinceSignup,
    });

    res.json({
      ...result,
      channel: 'sms',
      message: formatSmsNudgeSummary(result),
    });
  } catch (error: any) {
    console.error('Onboarding SMS nudge error:', error);
    res.status(500).json({ error: 'Failed to send onboarding SMS nudges', details: error.message });
  }
});

// Browse pool funnel for a user (why Connect shows nobody)
adminRouter.get('/users/:userId/browse-pool', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { expireOldMatches } = await import('../utils/expireMatches.js');
    await expireOldMatches();

    const profileRow = await (db
      .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
      .get([userId]) as Promise<{ display_name: string } | undefined>);

    const { resolveBrowseCandidatePool } = await import('../services/browseCandidatePool.js');
    const {
      buildBrowsePoolSummary,
      formatBrowsePoolSummaryForAdmin,
    } = await import('../services/browsePoolSummary.js');

    const poolResult = await resolveBrowseCandidatePool(userId);
    if (!poolResult.ok) {
      return res.status(poolResult.status).json({
        error: poolResult.error,
        displayName: profileRow?.display_name ?? null,
      });
    }

    const poolSummary = buildBrowsePoolSummary(poolResult.funnel);
    const displayName = profileRow?.display_name ?? userId;

    res.json({
      userId,
      displayName,
      poolSummary,
      message: formatBrowsePoolSummaryForAdmin(displayName, poolSummary),
      sampleCandidates: poolResult.candidates.slice(0, 5).map((p) => ({
        userId: p.user_id,
        displayName: p.display_name,
        gender: p.gender,
        location: p.location,
      })),
    });
  } catch (error: any) {
    console.error('Admin browse-pool error:', error);
    res.status(500).json({ error: 'Failed to compute browse pool', details: error.message });
  }
});

// Delete a single user
adminRouter.delete('/users/:userId', authenticateToken, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    if (!(await assertCanModerateUser(req, res, userId))) return;

    // Prevent deleting admin users
    const userStmt = db.prepare('SELECT id, email, phone_number, is_admin FROM users WHERE id = ?');
    const user = await (userStmt.get([userId]) as Promise<{
      id: string;
      email: string | null;
      phone_number: string | null;
      is_admin: number;
    } | undefined>);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.is_admin === 1) {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }
    
    // Get user display name for logging
    const profileStmt = db.prepare('SELECT display_name FROM profiles WHERE user_id = ?');
    const profile = await (profileStmt.get([userId]) as Promise<{ display_name: string } | undefined>);
    const userName = profile?.display_name || user.email || user.phone_number || userId;
    
    console.log(`🗑️  Deleting user: ${userName} (${userId})`);
    
    await deleteUserAccountData(userId);
    
    console.log(`  ✅ Deleted user: ${userName}`);
    
    res.json({
      message: `Successfully deleted user ${userName}`,
      deletedUserId: userId
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});
