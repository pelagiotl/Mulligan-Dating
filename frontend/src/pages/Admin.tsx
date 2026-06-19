import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import { getAdminDisplayPhotos } from '../utils/adminDisplayPhotos';
import { adminEmailLabel, adminPhoneLabel } from '../utils/adminContact';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

const API_ORIGIN = String(
  (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || ''
).replace(/\/$/, '');

const ADMIN_USER_PAGE_SIZE = 50;

function resolveAdminMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`;
}

interface User {
  id: string;
  email: string;
  phoneNumber?: string | null;
  display_name?: string;
  age?: number;
  gender?: string;
  location?: string;
  is_admin: boolean;
  is_restricted: boolean;
  hiddenFromBrowse?: boolean;
  photoVerified?: boolean;
  photo_verified_at?: string | null;
  created_at: string;
  last_active_at?: string;
  tokenCount: number;
  clientPlatform?: 'web' | 'android' | 'ios' | 'unknown';
  clientPlatformLabel?: string;
  onboardingProgress?: {
    hasName: boolean;
    hasLocation: boolean;
    photoCount: number;
    photosRequired: number;
    percentComplete: number;
    missing: Array<'profile' | 'name' | 'location' | 'photos'>;
    readyToActivate: boolean;
  };
}

function onboardingMissingLabel(m: 'profile' | 'name' | 'location' | 'photos'): string {
  switch (m) {
    case 'profile':
      return 'no profile';
    case 'name':
      return 'name';
    case 'location':
      return 'city, state';
    case 'photos':
      return 'photos';
    default:
      return m;
  }
}

function AdminOnboardingProgressCell({ progress }: { progress: NonNullable<User['onboardingProgress']> }) {
  if (progress.readyToActivate) {
    return (
      <span className="admin-onboarding-progress admin-onboarding-progress--ready" title="Has name and city/state — needs Complete Profile tap">
        Ready ✓
      </span>
    );
  }
  return (
    <span className="admin-onboarding-progress" title={`Missing: ${progress.missing.map(onboardingMissingLabel).join(', ')}`}>
      <span className="admin-onboarding-checklist">
        <span className={progress.hasName ? 'admin-onboarding-check admin-onboarding-check--done' : 'admin-onboarding-check'}>
          Name
        </span>
        <span className={progress.hasLocation ? 'admin-onboarding-check admin-onboarding-check--done' : 'admin-onboarding-check'}>
          Location
        </span>
        <span
          className={
            progress.photoCount >= progress.photosRequired
              ? 'admin-onboarding-check admin-onboarding-check--done'
              : 'admin-onboarding-check'
          }
        >
          Photos {progress.photoCount}/{progress.photosRequired}
        </span>
      </span>
    </span>
  );
}

function adminClientPlatformPill(user: Pick<User, 'clientPlatform' | 'clientPlatformLabel'>) {
  const platform = user.clientPlatform || 'unknown';
  const label = user.clientPlatformLabel || 'Unknown';
  return <span className={`admin-platform-pill admin-platform-pill--${platform}`}>{label}</span>;
}

interface AdminMatchRow {
  matchId: string;
  stage: string;
  stage1At: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhone: string | null;
  messageCount: number;
}

interface Message {
  id: string;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  senderId: string;
  senderName: string;
  otherUserId?: string;
  otherUserName?: string;
  matchId: string;
  sentAt: string;
  readAt: string | null;
  isFromTargetUser: boolean;
}

interface AdminUserPhoto {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface UserDetails extends User {
  profile?: {
    display_name?: string;
    age?: number;
    gender?: string;
    location?: string;
    bio?: string;
    looking_for?: string;
    photo_url?: string | null;
    [key: string]: unknown;
  } | null;
  photos?: AdminUserPhoto[];
  interests?: string[];
  lifestyle?: Record<string, string | null> | null;
  tokens: any[];
  matches: number;
  blocks: number;
  messages?: Message[];
}

const LIFESTYLE_FIELD_LABELS: Record<string, string> = {
  smoking: 'Smoking',
  drinking: 'Drinking',
  children: 'Children',
  pets: 'Pets',
  religion: 'Religion',
  workLifeBalance: 'Work/life balance',
  worksOut: 'Works out',
};

interface Stats {
  totalUsers: number;
  completeUsers?: number;
  totalProfiles: number;
  totalMatches: number;
  restrictedUsers: number;
  activeUsers: number;
  onboardingUsers?: number;
  verifiedUsers?: number;
  notVerifiedUsers?: number;
}

/** Drill-down from dashboard stat cards */
type StatDrillKey = 'totalUsers' | 'profiles' | 'matches' | 'restricted' | 'active7d' | 'onboarding' | 'verified' | 'not_verified';

interface AdminPairMatchRow {
  id: string;
  stage: string;
  stage1At: string;
  user1: { id: string; name: string; phone: string | null };
  user2: { id: string; name: string; phone: string | null };
}

const ADMIN_STAT_DRILL_USER_PAGE = 50;
const ADMIN_STAT_DRILL_MATCH_PAGE = 40;

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [userDetailsOpen, setUserDetailsOpen] = useState(false);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userMatches, setUserMatches] = useState<AdminMatchRow[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<{
    matchId: string;
    otherUserName: string;
  } | null>(null);
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const messagesSectionRef = useRef<HTMLDivElement | null>(null);

  const [statDrill, setStatDrill] = useState<StatDrillKey | null>(null);
  const [statDrillPage, setStatDrillPage] = useState(1);
  const [statDrillLoading, setStatDrillLoading] = useState(false);
  const [statDrillError, setStatDrillError] = useState<string | null>(null);
  const [statDrillUsers, setStatDrillUsers] = useState<User[]>([]);
  const [statDrillMatches, setStatDrillMatches] = useState<AdminPairMatchRow[]>([]);
  const [statDrillPagination, setStatDrillPagination] = useState({ total: 0, totalPages: 1 });
  const [onboardingNudgeLoading, setOnboardingNudgeLoading] = useState(false);
  const [onboardingNudgeMessage, setOnboardingNudgeMessage] = useState<string | null>(null);
  const [launchAnnouncementLoading, setLaunchAnnouncementLoading] = useState(false);
  const [launchAnnouncementMessage, setLaunchAnnouncementMessage] = useState<string | null>(null);
  const [browsePoolLoading, setBrowsePoolLoading] = useState(false);
  const [browsePoolMessage, setBrowsePoolMessage] = useState<string | null>(null);

  // Check if current user is the super admin
  const isSuperAdmin = user?.email === 'pelagiotl@gmail.com';

  const closeStatDrill = useCallback(() => {
    setStatDrill(null);
    setStatDrillPage(1);
    setStatDrillError(null);
    setStatDrillUsers([]);
    setStatDrillMatches([]);
  }, []);

  const closeUserDetails = useCallback(() => {
    setUserDetailsOpen(false);
    setUserDetailsLoading(false);
    setSelectedUser(null);
    setSelectedConversation(null);
    setUserMessages([]);
    setMessagesError(null);
    setMatchesError(null);
    setUserMatches([]);
    setMessagesTotal(0);
    setMessagesHasMore(false);
  }, []);

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [page, search]);

  useEffect(() => {
    if (!statDrill) return;
    let cancelled = false;
    (async () => {
      setStatDrillLoading(true);
      setStatDrillError(null);
      try {
        if (statDrill === 'matches') {
          const offset = (statDrillPage - 1) * ADMIN_STAT_DRILL_MATCH_PAGE;
          const data = await api.get<{ matches: AdminPairMatchRow[]; total: number }>(
            `/admin/matches?limit=${ADMIN_STAT_DRILL_MATCH_PAGE}&offset=${offset}`
          );
          if (cancelled) return;
          setStatDrillMatches(data.matches || []);
          setStatDrillUsers([]);
          const total = data.total ?? 0;
          setStatDrillPagination({
            total,
            totalPages: Math.max(1, Math.ceil(total / ADMIN_STAT_DRILL_MATCH_PAGE)),
          });
        } else {
          const params = new URLSearchParams({
            page: String(statDrillPage),
            limit: String(ADMIN_STAT_DRILL_USER_PAGE),
          });
          if (statDrill === 'profiles') params.set('filter', 'with_profile');
          else if (statDrill === 'restricted') params.set('filter', 'restricted');
          else if (statDrill === 'active7d') params.set('filter', 'active');
          else if (statDrill === 'onboarding') params.set('filter', 'onboarding');
          else if (statDrill === 'totalUsers') params.set('filter', 'complete');
          else if (statDrill === 'verified') params.set('filter', 'verified');
          else if (statDrill === 'not_verified') params.set('filter', 'not_verified');
          const data = await api.get<{ users: User[]; pagination: { total: number; totalPages: number } }>(
            `/admin/users?${params}`
          );
          if (cancelled) return;
          setStatDrillUsers(data.users || []);
          setStatDrillMatches([]);
          setStatDrillPagination(data.pagination);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setStatDrillError(e instanceof Error ? e.message : 'Failed to load');
          setStatDrillUsers([]);
          setStatDrillMatches([]);
        }
      } finally {
        if (!cancelled) setStatDrillLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statDrill, statDrillPage]);

  const openStatDrill = (key: StatDrillKey) => {
    setStatDrillPage(1);
    setStatDrill(key);
  };

  const pickUserFromDrill = (userId: string) => {
    void fetchUserDetails(userId);
    closeStatDrill();
  };

  const statDrillMeta = (key: StatDrillKey | null) => {
    if (!key) return { title: '', subtitle: '' };
    const map: Record<StatDrillKey, { title: string; subtitle: string }> = {
      totalUsers: {
        title: 'Complete profiles',
        subtitle:
          'Active accounts with at least 1 photo uploaded — raffle-eligible. Click a row to open details in the side panel.',
      },
      profiles: {
        title: 'Users with a profile',
        subtitle: 'Accounts that have saved profile data — aligns with the Profiles stat count.',
      },
      matches: {
        title: 'Active matches',
        subtitle: 'Match pairs that are not expired. Open either participant from the row actions.',
      },
      restricted: {
        title: 'Restricted users',
        subtitle: 'Non-admin accounts marked restricted. Click a row to review in the side panel.',
      },
      active7d: {
        title: 'Active (7 days)',
        subtitle: 'Users who received a Mulligan token in the last 7 days — same definition as the dashboard stat.',
      },
      onboarding: {
        title: 'Onboarding',
        subtitle:
          'Accounts still setting up — signed up but have not finished account setup (Complete Profile). Often they saved part of the wizard but still need name, city/state, 3+ photos, then tap Complete Profile. Incomplete profiles can be moved back here automatically.',
      },
      verified: {
        title: 'Verified users',
        subtitle:
          'Users granted the Mulligan verification badge (includes onboarding accounts). Click a row to review or revoke verification.',
      },
      not_verified: {
        title: 'Not verified',
        subtitle:
          'All registered users without the verification badge yet (includes onboarding). Grant verification from the user detail panel.',
      },
    };
    return map[key];
  };

  const onboardingProgressSummary = useMemo(() => {
    if (statDrill !== 'onboarding') return null;
    let ready = 0;
    let needPhotos = 0;
    let needName = 0;
    let needLocation = 0;
    let noProfile = 0;
    for (const u of statDrillUsers) {
      const p = u.onboardingProgress;
      if (!p) continue;
      if (p.readyToActivate) ready += 1;
      else {
        if (p.missing.includes('profile')) noProfile += 1;
        if (p.missing.includes('name')) needName += 1;
        if (p.missing.includes('location')) needLocation += 1;
        if (p.missing.includes('photos')) needPhotos += 1;
      }
    }
    return {
      ready,
      needPhotos,
      needName,
      needLocation,
      noProfile,
      onPage: statDrillUsers.length,
    };
  }, [statDrill, statDrillUsers]);

  useEffect(() => {
    if (!statDrill) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeStatDrill();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [statDrill, closeStatDrill]);

  useEffect(() => {
    if (!userDetailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUserDetails();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userDetailsOpen, closeUserDetails]);

  const fetchStats = async () => {
    try {
      const data = await api.get<Stats>('/admin/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const sendLaunchAnnouncement = async (dryRun: boolean) => {
    setLaunchAnnouncementLoading(true);
    setLaunchAnnouncementMessage(null);
    try {
      const data = await api.post<{ message: string }>('/admin/announcements/launch-live-push', {
        dryRun,
        limit: 2000,
        title: 'Mulligan is live ✨',
        body: "Connect's open — tap in and meet someone new when you're ready.",
      });
      const summary = `Launch push: ${data.message}`;
      setLaunchAnnouncementMessage(summary);
      setMessage({ type: 'success', text: summary });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send launch announcement';
      setLaunchAnnouncementMessage(msg);
      setMessage({ type: 'error', text: msg });
    } finally {
      setLaunchAnnouncementLoading(false);
    }
  };

  const sendOnboardingPushNudge = async (dryRun: boolean) => {
    setOnboardingNudgeLoading(true);
    setOnboardingNudgeMessage(null);
    try {
      const data = await api.post<{ message: string }>('/admin/onboarding/complete-profile-nudge', {
        dryRun,
        limit: 500,
      });
      setOnboardingNudgeMessage(`Push: ${data.message}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send push nudges';
      setOnboardingNudgeMessage(msg);
    } finally {
      setOnboardingNudgeLoading(false);
    }
  };

  const sendOnboardingSmsNudge = async (dryRun: boolean) => {
    setOnboardingNudgeLoading(true);
    setOnboardingNudgeMessage(null);
    setMessage({ type: 'success', text: dryRun ? 'Running SMS preview…' : 'Sending SMS reminders…' });
    try {
      const data = await api.post<{ message: string; smsConfigured?: boolean }>(
        '/admin/onboarding/complete-profile-sms-nudge',
        { dryRun, limit: 500, minHoursSinceSignup: 24 },
      );
      const summary = `SMS: ${data.message}`;
      setOnboardingNudgeMessage(summary);
      setMessage({ type: 'success', text: summary });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send SMS nudges';
      setOnboardingNudgeMessage(msg);
      setMessage({ type: 'error', text: msg });
    } finally {
      setOnboardingNudgeLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: String(ADMIN_USER_PAGE_SIZE),
        ...(search && { search }),
      });
      const data = await api.get<{ users: User[]; pagination: any }>(`/admin/users?${params}`);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setMessage({ type: 'error', text: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const fetchBrowsePool = async (userId: string) => {
    setBrowsePoolLoading(true);
    setBrowsePoolMessage(null);
    try {
      const data = await api.get<{ message: string; poolSummary?: { eligible: number } }>(
        `/admin/users/${userId}/browse-pool`,
      );
      setBrowsePoolMessage(data.message);
    } catch (err: unknown) {
      setBrowsePoolMessage(err instanceof Error ? err.message : 'Failed to load browse pool');
    } finally {
      setBrowsePoolLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setUserDetailsOpen(true);
    setUserDetailsLoading(true);
    setSelectedUser(null);
    setSelectedConversation(null);
    setUserMessages([]);
    setMessagesError(null);
    setMatchesError(null);
    setUserMatches([]);
    setMessagesTotal(0);
    setMessagesHasMore(false);
    try {
      const data = await api.get<UserDetails>(`/admin/users/${userId}?_=${Date.now()}`);
      setSelectedUser(data);
      void fetchUserMatches(userId);
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      setMessage({ type: 'error', text: 'Failed to load user details' });
      setUserDetailsOpen(false);
    } finally {
      setUserDetailsLoading(false);
    }
  };

  const fetchUserMatches = async (userId: string) => {
    setLoadingMatches(true);
    setMatchesError(null);
    try {
      const data = await api.get<{ matches: AdminMatchRow[] }>(`/admin/users/${userId}/matches`);
      setUserMatches(data.matches || []);
    } catch (error: any) {
      console.error('Failed to fetch user matches:', error);
      const err = error.message || 'Failed to load conversations';
      setMatchesError(err);
      setUserMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  };

  const fetchConversationMessages = async (userId: string, matchId: string, offset: number) => {
    const append = offset > 0;
    setLoadingMessages(true);
    setMessagesError(null);
    try {
      const params = new URLSearchParams({
        matchId,
        limit: '2000',
        order: 'asc',
        offset: String(offset),
      });
      const data = await api.get<{
        messages: Message[];
        total: number;
        hasMore: boolean;
      }>(`/admin/users/${userId}/messages?${params}`);
      const batch = data.messages || [];
      setUserMessages((prev) => (append ? [...prev, ...batch] : batch));
      setMessagesTotal(typeof data.total === 'number' ? data.total : batch.length);
      setMessagesHasMore(Boolean(data.hasMore));

      requestAnimationFrame(() => {
        messagesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      const errorMessage = error.message || 'Failed to load messages';
      setMessagesError(errorMessage);
      if (!append) setUserMessages([]);
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoadingMessages(false);
    }
  };

  const openConversation = (matchId: string, otherUserName: string) => {
    if (!selectedUser?.id) return;
    setSelectedConversation({ matchId, otherUserName });
    setUserMessages([]);
    setMessagesTotal(0);
    setMessagesHasMore(false);
    void fetchConversationMessages(selectedUser.id, matchId, 0);
  };

  const backToConversationList = () => {
    setSelectedConversation(null);
    setUserMessages([]);
    setMessagesError(null);
    setMessagesTotal(0);
    setMessagesHasMore(false);
  };

  const loadMoreConversationMessages = () => {
    if (!selectedUser?.id || !selectedConversation || loadingMessages || !messagesHasMore) return;
    void fetchConversationMessages(
      selectedUser.id,
      selectedConversation.matchId,
      userMessages.length
    );
  };

  const restrictUser = async (userId: string, restricted: boolean) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{ message: string; userId: string; restricted: boolean }>(`/admin/users/${userId}/restrict`, { restricted });
      setMessage({ type: 'success', text: response.message || `User ${restricted ? 'restricted' : 'unrestricted'} successfully` });
      fetchUsers();
      if (selectedUser?.id === userId) {
        fetchUserDetails(userId);
      }
    } catch (error: any) {
      console.error('Restrict user error:', error);
      const errorMessage = error.message || error.response?.data?.error || 'Failed to update user restriction';
      setMessage({ 
        type: 'error', 
        text: errorMessage
      });
    } finally {
      setActionLoading(null);
    }
  };

  const setPhotoVerified = async (userId: string, verified: boolean) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{ message: string; verified: boolean }>(
        `/admin/users/${userId}/photo-verify`,
        { verified },
      );
      setMessage({
        type: 'success',
        text: response.message || (verified ? 'Verification granted' : 'Verification removed'),
      });
      fetchUsers();
      fetchStats();
      if (selectedUser?.id === userId) {
        fetchUserDetails(userId);
      }
      if (statDrill === 'verified' || statDrill === 'not_verified') {
        setStatDrillPage(1);
        setStatDrill(statDrill);
      }
    } catch (error: any) {
      console.error('Photo verify error:', error);
      setMessage({
        type: 'error',
        text: error.message || error.response?.data?.error || 'Failed to update verification',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const setBrowseHidden = async (userId: string, hidden: boolean) => {
    setActionLoading(userId);
    try {
      const postBrowseHidden = async () => {
        try {
          return await api.post<{ message: string; userId: string; hiddenFromBrowse: boolean }>(
            `/admin/users/${userId}/set-browse-hidden`,
            { hidden },
          );
        } catch (error: unknown) {
          const status = (error as { status?: number })?.status;
          if (status !== 404) throw error;
          return api.post<{ message: string; userId: string; hiddenFromBrowse: boolean }>(
            `/admin/users/${userId}/restrict`,
            { hiddenFromBrowse: hidden },
          );
        }
      };

      const response = await postBrowseHidden();
      setMessage({
        type: 'success',
        text:
          response.message ||
          (hidden ? 'User hidden from Connect / browse' : 'User visible in Connect / browse'),
      });
      fetchUsers();
      if (selectedUser?.id === userId) {
        fetchUserDetails(userId);
      }
    } catch (error: any) {
      console.error('Set browse hidden error:', error);
      const errorMessage =
        error.message || error.response?.data?.error || 'Failed to update Connect visibility';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setActionLoading(null);
    }
  };

  const grantTokens = async (userId: string, count: number) => {
    setActionLoading(userId);
    try {
      const data = await api.post<{ message: string; tokensGranted: number }>(`/admin/users/${userId}/grant-tokens`, { count });
      setMessage({ type: 'success', text: data.message || `Granted ${data.tokensGranted || count} token(s)` });
      // Refresh users list and selected user details
      await fetchUsers();
      if (selectedUser?.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error: any) {
      // ApiError has message property directly
      const errorMessage = error.message || 'Failed to grant tokens';
      setMessage({ type: 'error', text: errorMessage });
      console.error('Grant tokens error:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const setAdmin = async (userId: string, isAdmin: boolean) => {
    // Find the user to show their name/email in the confirmation
    const userToModify = users.find(u => u.id === userId) || selectedUser;
    const userName = userToModify?.display_name || userToModify?.email || 'this user';
    
    // Show confirmation dialog
    const action = isAdmin ? 'grant admin access to' : 'remove admin access from';
    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${userName}?\n\n` +
      `${isAdmin ? 'This will give them full administrative privileges.' : 'This will revoke their administrative privileges.'}`
    );
    
    if (!confirmed) {
      return; // User cancelled
    }
    
    setActionLoading(userId);
    try {
      await api.post(`/admin/users/${userId}/set-admin`, { isAdmin });
      setMessage({ type: 'success', text: `User admin status ${isAdmin ? 'granted' : 'removed'}` });
      fetchUsers();
      if (selectedUser?.id === userId) {
        fetchUserDetails(userId);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update admin status' });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    // Find the user to show their name/email in the confirmation
    const userToDelete = users.find(u => u.id === userId) || selectedUser;
    const userName = userToDelete?.display_name || userToDelete?.email || 'this user';
    
    // Show confirmation dialog
    const confirmed = window.confirm(
      `⚠️ WARNING: This will permanently delete ${userName}!\n\n` +
      `This will delete:\n` +
      `- User account\n` +
      `- Profile and all profile data\n` +
      `- All matches and messages\n` +
      `- All tokens\n` +
      `- All blocks\n\n` +
      `This action CANNOT be undone. Are you absolutely sure?`
    );
    
    if (!confirmed) {
      return; // User cancelled
    }
    
    setActionLoading(userId);
    try {
      await api.delete(`/admin/users/${userId}`);
      setMessage({ type: 'success', text: `Successfully deleted user ${userName}` });
      // Refresh stats and users list
      await fetchStats();
      await fetchUsers();
      // Clear selected user if it was deleted
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
      }
    } catch (error: any) {
      const errorMessage = error.message || error.response?.data?.error || 'Failed to delete user';
      setMessage({ type: 'error', text: errorMessage });
      console.error('Delete user error:', error);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="admin-subtitle">User & moderation control</p>
        </div>
        {message && (
          <div className={`admin-message admin-message-${message.type}`}>
            {message.text}
            <button onClick={() => setMessage(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>

      {stats && (
        <div className="admin-stats">
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'totalUsers' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('totalUsers')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>👥</div>
            <div className="stat-value">{stats.completeUsers ?? 0}</div>
            <div className="stat-label">Complete Profiles</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'profiles' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('profiles')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>📋</div>
            <div className="stat-value">{stats.totalProfiles}</div>
            <div className="stat-label">Profiles</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'matches' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('matches')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>💕</div>
            <div className="stat-value">{stats.totalMatches}</div>
            <div className="stat-label">Active Matches</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'restricted' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('restricted')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>🚫</div>
            <div className="stat-value">{stats.restrictedUsers}</div>
            <div className="stat-label">Restricted</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'active7d' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('active7d')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>✨</div>
            <div className="stat-value">{stats.activeUsers}</div>
            <div className="stat-label">Active (7d)</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'onboarding' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('onboarding')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>📝</div>
            <div className="stat-value">{stats.onboardingUsers ?? 0}</div>
            <div className="stat-label">Onboarding</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'verified' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('verified')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>✓</div>
            <div className="stat-value">{stats.verifiedUsers ?? 0}</div>
            <div className="stat-label">Verified</div>
            <span className="stat-card-hint">View list</span>
          </button>
          <button
            type="button"
            className={`stat-card stat-card--interactive${statDrill === 'not_verified' ? ' stat-card--active' : ''}`}
            onClick={() => openStatDrill('not_verified')}
            aria-haspopup="dialog"
          >
            <div className="stat-icon" aria-hidden>○</div>
            <div className="stat-value">{stats.notVerifiedUsers ?? 0}</div>
            <div className="stat-label">Not verified</div>
            <span className="stat-card-hint">View list</span>
          </button>
        </div>
      )}

      <div className="admin-actions-section">
        <h2>Bulk Actions</h2>
        <div className="admin-launch-announcement">
          <p className="admin-onboarding-nudge-hint">
            <strong>Launch push</strong> — chill one-time alert for users who allowed notifications (Android
            Expo + iPhone/web PWA). Does not SMS everyone. Preview reach first.
          </p>
          <p className="admin-onboarding-nudge-hint admin-onboarding-nudge-hint--secondary">
            Message: <em>Mulligan is live ✨</em> — Connect&apos;s open — tap in and meet someone new when
            you&apos;re ready.
          </p>
          <div className="admin-onboarding-nudge-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={launchAnnouncementLoading}
              onClick={() => void sendLaunchAnnouncement(true)}
            >
              {launchAnnouncementLoading ? 'Previewing…' : 'Preview launch push reach'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={launchAnnouncementLoading}
              onClick={() => {
                if (
                  window.confirm(
                    'Send launch push to all users with notifications enabled?\n\n' +
                      'Title: Mulligan is live ✨\n' +
                      "Body: Connect's open — tap in and meet someone new when you're ready.",
                  )
                ) {
                  void sendLaunchAnnouncement(false);
                }
              }}
            >
              {launchAnnouncementLoading ? 'Sending…' : 'Send launch push'}
            </button>
          </div>
          {launchAnnouncementMessage ? (
            <p className="admin-onboarding-nudge-result" role="status">
              {launchAnnouncementMessage}
            </p>
          ) : null}
        </div>
        <div className="admin-actions-row">
        <button
          type="button"
          className="btn btn-secondary admin-export-email-btn"
          onClick={async () => {
            const confirmed = window.confirm(
              'Email a CSV of all users to mulligandating@gmail.com for retention review?\n\n' +
                'Includes phone, email, profile, tokens, account status, and photo count. Filter active + Photo Count ≥ 1 for raffle.',
            );
            if (!confirmed) return;

            setActionLoading('export-users-email');
            try {
              const data = await api.post<{
                message: string;
                recipient: string;
                userCount: number;
              }>('/admin/users/export-email', {});
              setMessage({
                type: 'success',
                text:
                  data.message ||
                  `Exported ${data.userCount} users to ${data.recipient}`,
              });
            } catch (error: unknown) {
              const err = error as { message?: string };
              setMessage({
                type: 'error',
                text: err?.message || 'Failed to email user export',
              });
            } finally {
              setActionLoading(null);
            }
          }}
          disabled={Boolean(actionLoading)}
        >
          {actionLoading === 'export-users-email'
            ? 'Sending export…'
            : '📧 Email user list to ops'}
        </button>
        <button
          className="btn btn-danger"
          onClick={async () => {
            const confirmed = window.confirm(
              '⚠️ WARNING: This will permanently delete ALL test users!\n\n' +
              'Test users are identified by email patterns like:\n' +
              '- test@*\n' +
              '- newtest@*\n' +
              '- testing@*\n' +
              '- testboy@*\n' +
              '- newaccount@*\n\n' +
              'This action cannot be undone. Are you sure?'
            );
            
            if (!confirmed) {
              return;
            }

            setActionLoading('delete-test-users');
            try {
              const data = await api.delete<{ message: string; deleted: number; deletedUsers: string[] }>('/admin/delete-test-users');
              setMessage({ 
                type: 'success', 
                text: data.message || `Successfully deleted ${data.deleted || 0} test user(s)` 
              });
              // Refresh stats and users list
              await fetchStats();
              await fetchUsers();
              if (selectedUser) {
                // Check if selected user was deleted
                if (data.deletedUsers?.includes(selectedUser.display_name || selectedUser.email || selectedUser.id)) {
                  setSelectedUser(null);
                } else {
                  fetchUserDetails(selectedUser.id);
                }
              }
            } catch (error: any) {
              const errorMessage = error.message || error.response?.data?.error || 'Failed to delete test users';
              setMessage({ type: 'error', text: errorMessage });
              console.error('Delete test users error:', error);
            } finally {
              setActionLoading(null);
            }
          }}
          disabled={actionLoading === 'delete-test-users'}
          style={{ 
            padding: 'var(--space-3) var(--space-4)',
            fontSize: '1rem',
            fontWeight: '600'
          }}
        >
          {actionLoading === 'delete-test-users' ? 'Deleting...' : '🗑️ Delete All Test Users'}
        </button>
        </div>
        <p className="admin-actions-note">
          Export sends a CSV to mulligandating@gmail.com (requires RESEND_API_KEY on the backend). Complete Profiles stat = active with ≥1 photo.
          Delete removes test email patterns (test@, newtest@, testing@, etc.) and all associated data.
        </p>
      </div>

      <div className="admin-content">
        <div className="admin-users-section admin-users-section--modern">
          <header className="admin-um-header">
            <div className="admin-um-header-main">
              <span className="admin-um-kicker">Directory</span>
              <h2 className="admin-um-title">User management</h2>
              <p className="admin-um-lede">
                Search and browse accounts. Select a row to review profile, moderation, and tokens in the panel.
              </p>
            </div>
            <div className="admin-um-search-wrap" role="search">
              <label htmlFor="admin-user-search" className="sr-only">
                Search users by phone, email, or display name
              </label>
              <div className="admin-search admin-search--prominent">
                <input
                  id="admin-user-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Search phone, email, or name…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </header>

          {!loading && (
            <p className="admin-um-results-meta" aria-live="polite">
              {users.length === 0 ? (
                <>
                  <strong>0</strong> users {search.trim() ? (
                    <>matching &ldquo;{search.trim()}&rdquo;</>
                  ) : (
                    <>on this page</>
                  )}
                </>
              ) : (
                <>
                  Showing{' '}
                  <strong>{(page - 1) * ADMIN_USER_PAGE_SIZE + 1}</strong>
                  –
                  <strong>{(page - 1) * ADMIN_USER_PAGE_SIZE + users.length}</strong>
                  {' '}of <strong>{pagination.total}</strong> users
                  {search.trim() ? (
                    <> · filtered by &ldquo;{search.trim()}&rdquo;</>
                  ) : null}
                </>
              )}
            </p>
          )}

          {loading ? (
            <div className="admin-um-loading" aria-busy="true">
              <span className="admin-um-loading-dot" />
              <span className="admin-um-loading-dot" />
              <span className="admin-um-loading-dot" />
              <span>Loading directory…</span>
            </div>
          ) : (
            <>
              <div className="users-table users-table--modern">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Phone</th>
                      <th scope="col">Email</th>
                      <th scope="col">Name</th>
                      <th scope="col" className="users-table-col-narrow">
                        Age
                      </th>
                      <th scope="col">Location</th>
                      <th scope="col" className="users-table-col-platform">
                        Platform
                      </th>
                      <th scope="col" className="users-table-col-narrow">
                        Tokens
                      </th>
                      <th scope="col" className="users-table-col-status">
                        Status
                      </th>
                      <th scope="col" className="users-table-col-actions">
                        Quick actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        role="button"
                        tabIndex={0}
                        className={`users-table-row-selectable${selectedUser?.id === user.id ? ' selected' : ''}`}
                        onClick={() => void fetchUserDetails(user.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void fetchUserDetails(user.id);
                          }
                        }}
                      >
                        <td className="users-table-cell-phone">
                          <span
                            className="users-table-phone"
                            title={adminPhoneLabel(user.phoneNumber)}
                          >
                            {adminPhoneLabel(user.phoneNumber)}
                          </span>
                        </td>
                        <td className="users-table-cell-email">
                          <span
                            className="users-table-email"
                            title={adminEmailLabel(user.email, user.phoneNumber)}
                          >
                            {adminEmailLabel(user.email, user.phoneNumber)}
                          </span>
                        </td>
                        <td className="users-table-cell-name">{user.display_name || '—'}</td>
                        <td>{user.age ?? '—'}</td>
                        <td className="users-table-cell-location">
                          <span className="users-table-location" title={user.location || undefined}>
                            {user.location || '—'}
                          </span>
                        </td>
                        <td className="users-table-cell-platform">{adminClientPlatformPill(user)}</td>
                        <td>
                          <span className="admin-token-pill">{user.tokenCount}</span>
                        </td>
                        <td>
                          {(() => {
                            const isAdmin = Boolean(user.is_admin);
                            const isRestricted = Boolean(user.is_restricted);
                            const isHiddenFromBrowse = Boolean(user.hiddenFromBrowse);
                            const isVerified = Boolean(user.photoVerified);

                            if (isAdmin) {
                              return <span className="badge badge-admin">Admin</span>;
                            }
                            if (isVerified) {
                              return <span className="badge badge-verified">Verified</span>;
                            }
                            if (isHiddenFromBrowse) {
                              return <span className="badge badge-hidden-browse">Hidden</span>;
                            }
                            if (isRestricted) {
                              return <span className="badge badge-restricted">Restricted</span>;
                            }
                            return <span className="badge badge-active">Active</span>;
                          })()}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="action-buttons action-buttons--compact">
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary admin-action-view"
                              onClick={() => void fetchUserDetails(user.id)}
                              title="View profile and photos"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary admin-action-tokens"
                              onClick={() => grantTokens(user.id, 1)}
                              disabled={actionLoading === user.id}
                              title="Grant 1 Mulligan token"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm admin-action-browse-hidden ${Boolean(user.hiddenFromBrowse) ? 'btn-success' : 'btn-secondary'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setBrowseHidden(user.id, !Boolean(user.hiddenFromBrowse));
                              }}
                              disabled={actionLoading === user.id}
                              title={
                                Boolean(user.hiddenFromBrowse)
                                  ? 'Show in Connect / browse for other users'
                                  : 'Hide from Connect / browse for other users'
                              }
                            >
                              {Boolean(user.hiddenFromBrowse) ? 'Show' : 'Hide'}
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm admin-action-restrict ${Boolean(user.is_restricted) ? 'btn-success' : 'btn-warning'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                restrictUser(user.id, !Boolean(user.is_restricted));
                              }}
                              disabled={actionLoading === user.id}
                              title={Boolean(user.is_restricted) ? 'Remove restriction' : 'Restrict account'}
                            >
                              {Boolean(user.is_restricted) ? 'Unrestrict' : 'Restrict'}
                            </button>
                            {!Boolean(user.is_admin) ? (
                              <button
                                type="button"
                                className={`btn btn-sm admin-action-verify ${Boolean(user.photoVerified) ? 'btn-success' : 'btn-secondary'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoVerified(user.id, !Boolean(user.photoVerified));
                                }}
                                disabled={actionLoading === user.id}
                                title={
                                  Boolean(user.photoVerified)
                                    ? 'Remove Mulligan verification badge'
                                    : 'Grant Mulligan verification badge'
                                }
                              >
                                {Boolean(user.photoVerified) ? 'Unverify' : 'Verify'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-sm btn-danger admin-action-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteUser(user.id);
                              }}
                              disabled={actionLoading === user.id || Boolean(user.is_admin)}
                              title={Boolean(user.is_admin) ? 'Cannot delete admin users' : 'Delete user'}
                              aria-label="Delete user"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav className="pagination pagination--modern" aria-label="User list pages">
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span className="pagination-status">
                  Page <strong>{page}</strong> of <strong>{pagination.totalPages}</strong>
                </span>
                <button
                  type="button"
                  className="pagination-btn"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </div>

      </div>

      {userDetailsOpen && typeof document !== 'undefined'
        ? createPortal(
        <div className="admin-user-details-overlay" role="presentation">
          <div
            className="admin-user-details-backdrop"
            aria-hidden="true"
            onClick={() => closeUserDetails()}
          />
          <div
            className="admin-user-details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-details-title"
          >
            <div className="user-details-header">
              <h2 id="admin-user-details-title">User Details</h2>
              <button
                type="button"
                className="admin-user-details-close"
                onClick={() => closeUserDetails()}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {userDetailsLoading ? (
              <div className="admin-user-details-loading" aria-busy="true">
                <span className="admin-um-loading-dot" />
                <span className="admin-um-loading-dot" />
                <span className="admin-um-loading-dot" />
                <span>Loading profile…</span>
              </div>
            ) : selectedUser ? (
            <div className="user-details-content">
              <div className="detail-section">
                <h3>Account Info</h3>
                <p><strong>Phone:</strong> {adminPhoneLabel(selectedUser.phoneNumber)}</p>
                <p>
                  <strong>Email:</strong>{' '}
                  {adminEmailLabel(selectedUser.email, selectedUser.phoneNumber)}
                </p>
                <p><strong>User ID:</strong> {selectedUser.id}</p>
                <p><strong>Created:</strong> {new Date(selectedUser.created_at).toLocaleDateString()}</p>
                <p><strong>Last Active:</strong> {selectedUser.last_active_at ? new Date(selectedUser.last_active_at).toLocaleDateString() : 'Never'}</p>
                <p>
                  <strong>Platform:</strong> {adminClientPlatformPill(selectedUser)}
                </p>
                <div className="admin-onboarding-nudge-actions" style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={browsePoolLoading}
                    onClick={() => void fetchBrowsePool(selectedUser.id)}
                  >
                    {browsePoolLoading ? 'Checking…' : 'Check Connect pool'}
                  </button>
                </div>
                {browsePoolMessage ? (
                  <pre
                    className="admin-onboarding-nudge-result"
                    style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '0.5rem' }}
                    role="status"
                  >
                    {browsePoolMessage}
                  </pre>
                ) : null}
              </div>

              {selectedUser.profile && (
                <div className="detail-section">
                  <h3>Profile</h3>
                  <p><strong>Name:</strong> {selectedUser.profile.display_name}</p>
                  <p><strong>Age:</strong> {selectedUser.profile.age ?? '—'}</p>
                  <p><strong>Gender:</strong> {selectedUser.profile.gender || '—'}</p>
                  <p><strong>Location:</strong> {selectedUser.profile.location || '—'}</p>
                  {selectedUser.profile.bio ? (
                    <p className="admin-profile-bio"><strong>Bio:</strong> {selectedUser.profile.bio}</p>
                  ) : null}
                  {selectedUser.profile.looking_for ? (
                    <p><strong>Looking for:</strong> {selectedUser.profile.looking_for}</p>
                  ) : null}
                  {selectedUser.interests && selectedUser.interests.length > 0 ? (
                    <p><strong>Interests:</strong> {selectedUser.interests.join(', ')}</p>
                  ) : null}
                  {selectedUser.lifestyle &&
                    Object.entries(selectedUser.lifestyle).some(([, v]) => v) ? (
                      <div className="admin-profile-lifestyle">
                        <strong>Lifestyle</strong>
                        <ul>
                          {Object.entries(selectedUser.lifestyle)
                            .filter(([, v]) => v)
                            .map(([key, value]) => (
                              <li key={key}>
                                {LIFESTYLE_FIELD_LABELS[key] || key}: {value}
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}
                </div>
              )}

              {(() => {
                const displayPhotos = getAdminDisplayPhotos(selectedUser.photos, selectedUser.profile);
                if (displayPhotos.length > 0) {
                  return (
                <div className="detail-section">
                  <h3>Photos ({displayPhotos.length})</h3>
                  <div className="admin-profile-photos">
                    {displayPhotos.map((photo) => {
                      const src = resolveAdminMediaUrl(photo.url);
                      if (!src) return null;
                      return (
                        <a
                          key={photo.id}
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-profile-photo-card"
                          title={photo.isPrimary ? 'Primary photo — open full size' : 'Open full size'}
                        >
                          <img src={src} alt="" className="admin-profile-photo-img" />
                          {photo.isPrimary ? <span className="admin-profile-photo-badge">Primary</span> : null}
                        </a>
                      );
                    })}
                  </div>
                </div>
                  );
                }
                if (selectedUser.profile) {
                  return (
                <div className="detail-section">
                  <h3>Photos</h3>
                  <p className="admin-moderation-muted">No photos uploaded.</p>
                </div>
                  );
                }
                return null;
              })()}

              <div className="detail-section">
                <h3>Stats</h3>
                <p><strong>Tokens:</strong> {selectedUser.tokenCount}</p>
                <p><strong>Matches:</strong> {selectedUser.matches}</p>
                <p><strong>Blocks:</strong> {selectedUser.blocks}</p>
              </div>

              <div className="detail-section" ref={messagesSectionRef} id="admin-messages-section">
                <div className="admin-moderation-header">
                  <h3 style={{ margin: 0 }}>Messages (moderation)</h3>
                  <p className="admin-moderation-sub">
                    Open a matched conversation to review full history: text, photos, video, and voice notes. Expired
                    matches are included.
                  </p>
                </div>

                {loadingMatches && (
                  <p className="admin-moderation-muted">Loading conversations…</p>
                )}
                {matchesError && (
                  <p className="admin-messages-error" style={{ fontWeight: 600 }}>
                    {matchesError}
                  </p>
                )}

                {!loadingMatches && !matchesError && !selectedConversation && (
                  <div className="admin-conversation-list">
                    {userMatches.length === 0 ? (
                      <p className="admin-moderation-muted">No matched conversations for this user.</p>
                    ) : (
                      userMatches.map((m) => (
                        <button
                          key={m.matchId}
                          type="button"
                          className="admin-conversation-row"
                          onClick={() => openConversation(m.matchId, m.otherUserName)}
                        >
                          <div className="admin-conversation-row-main">
                            <strong>{m.otherUserName}</strong>
                            <span className="admin-conversation-meta">
                              {m.stage}
                              {m.otherUserPhone ? ` · ${m.otherUserPhone}` : ''}
                            </span>
                          </div>
                          <div className="admin-conversation-row-sub">
                            {m.messageCount} message{m.messageCount !== 1 ? 's' : ''} · matched{' '}
                            {m.stage1At ? new Date(m.stage1At).toLocaleDateString() : '—'}
                          </div>
                        </button>
                      ))
                    )}
                    {selectedUser?.id && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary admin-refresh-convos"
                        onClick={() => fetchUserMatches(selectedUser.id)}
                      >
                        Refresh conversation list
                      </button>
                    )}
                  </div>
                )}

                {selectedConversation && (
                  <div className="admin-thread-panel">
                    <div className="admin-thread-toolbar">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={backToConversationList}>
                        ← All conversations
                      </button>
                      <span className="admin-thread-title">
                        With <strong>{selectedConversation.otherUserName}</strong>
                        <span className="admin-thread-count">
                          {messagesTotal > 0
                            ? ` · ${userMessages.length} loaded${messagesTotal > userMessages.length ? ` of ${messagesTotal}` : ''}`
                            : ''}
                        </span>
                      </span>
                    </div>

                    {loadingMessages && userMessages.length === 0 && (
                      <p className="admin-moderation-muted">Loading messages…</p>
                    )}

                    {messagesError && (
                      <p className="admin-messages-error" style={{ fontWeight: 600 }}>
                        {messagesError}
                      </p>
                    )}

                    {!messagesError && userMessages.length === 0 && !loadingMessages && (
                      <p className="admin-moderation-muted">No messages in this conversation.</p>
                    )}

                    {userMessages.length > 0 && (
                      <div className="admin-messages-scroll admin-messages-scroll-tall">
                        {userMessages.map((msg) => {
                          const imgSrc = resolveAdminMediaUrl(msg.imageUrl ?? null);
                          const videoSrc = resolveAdminMediaUrl(msg.videoUrl ?? null);
                          const audioSrc = resolveAdminMediaUrl(msg.audioUrl ?? null);
                          return (
                            <div
                              key={msg.id}
                              className={`admin-message-item ${msg.isFromTargetUser ? 'from-user' : 'to-user'}`}
                            >
                              <div className="admin-message-header">
                                <strong>{msg.senderName}</strong>
                                {msg.otherUserName && (
                                  <span className="admin-message-to"> → {msg.otherUserName}</span>
                                )}
                                <span className="admin-message-time">
                                  {new Date(msg.sentAt).toLocaleString()}
                                </span>
                              </div>
                              {msg.content || imgSrc || videoSrc || audioSrc ? (
                                <>
                                  {msg.content ? (
                                    <div className="admin-message-content">{msg.content}</div>
                                  ) : null}
                                  {imgSrc ? (
                                    <div className="admin-message-media">
                                      <a
                                        href={imgSrc}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="admin-message-photo-link"
                                      >
                                        <img src={imgSrc} alt="Sent attachment" className="admin-message-photo" />
                                      </a>
                                      <span className="admin-message-media-label">Photo · open full size</span>
                                    </div>
                                  ) : null}
                                  {videoSrc ? (
                                    <div className="admin-message-media">
                                      <video
                                        className="admin-message-video"
                                        controls
                                        playsInline
                                        preload="metadata"
                                        src={videoSrc}
                                      >
                                        <a href={videoSrc} target="_blank" rel="noopener noreferrer">
                                          Open video
                                        </a>
                                      </video>
                                    </div>
                                  ) : null}
                                  {audioSrc ? (
                                    <div className="admin-message-media">
                                      <audio
                                        className="admin-message-audio"
                                        controls
                                        preload="metadata"
                                        src={audioSrc}
                                      >
                                        <a href={audioSrc} target="_blank" rel="noopener noreferrer">
                                          Open voice message
                                        </a>
                                      </audio>
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="admin-message-content admin-message-empty">—</div>
                              )}
                              {msg.readAt && (
                                <div className="admin-message-read">
                                  ✓ Read {new Date(msg.readAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {messagesHasMore && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary admin-load-more-msgs"
                        onClick={loadMoreConversationMessages}
                        disabled={loadingMessages}
                      >
                        {loadingMessages ? 'Loading…' : 'Load more messages'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h3>Actions</h3>
                <div className="action-buttons-vertical">
                  <button
                    className="btn btn-primary"
                    onClick={() => grantTokens(selectedUser.id, 1)}
                    disabled={actionLoading === selectedUser.id}
                  >
                    Grant 1 Token
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => grantTokens(selectedUser.id, 3)}
                    disabled={actionLoading === selectedUser.id}
                  >
                    Grant 3 Tokens
                  </button>
                  <button
                    className={`btn ${Boolean(selectedUser.hiddenFromBrowse) ? 'btn-success' : 'btn-secondary'}`}
                    onClick={() =>
                      setBrowseHidden(selectedUser.id, !Boolean(selectedUser.hiddenFromBrowse))
                    }
                    disabled={actionLoading === selectedUser.id}
                  >
                    {Boolean(selectedUser.hiddenFromBrowse)
                      ? 'Show in Connect / Browse'
                      : 'Hide from Connect / Browse'}
                  </button>
                  <button
                    className={`btn ${Boolean(selectedUser.is_restricted) ? 'btn-success' : 'btn-warning'}`}
                    onClick={() => restrictUser(selectedUser.id, !Boolean(selectedUser.is_restricted))}
                    disabled={actionLoading === selectedUser.id}
                  >
                    {Boolean(selectedUser.is_restricted) ? 'Unrestrict User' : 'Restrict User'}
                  </button>
                  {!selectedUser.is_admin ? (
                    <button
                      className={`btn ${Boolean(selectedUser.photoVerified) ? 'btn-success' : 'btn-primary'}`}
                      onClick={() => setPhotoVerified(selectedUser.id, !Boolean(selectedUser.photoVerified))}
                      disabled={actionLoading === selectedUser.id}
                    >
                      {Boolean(selectedUser.photoVerified)
                        ? 'Remove verification badge'
                        : 'Grant verification badge'}
                    </button>
                  ) : null}
                  {isSuperAdmin && !selectedUser.is_admin && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setAdmin(selectedUser.id, true)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      Make Admin
                    </button>
                  )}
                  {isSuperAdmin && selectedUser.is_admin && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setAdmin(selectedUser.id, false)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      Remove Admin
                    </button>
                  )}
                  {!selectedUser.is_admin && (
                    <button
                      className="btn btn-danger"
                      onClick={() => deleteUser(selectedUser.id)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      🗑️ Delete User
                    </button>
                  )}
                </div>
              </div>
            </div>
            ) : (
              <p className="admin-moderation-muted">Could not load user details.</p>
            )}
          </div>
        </div>,
        document.body,
      )
        : null}

      {statDrill
        ? createPortal(
        <div className="admin-stat-drill-overlay" role="presentation">
          <div
            className="admin-stat-drill-backdrop"
            aria-hidden="true"
            onClick={() => closeStatDrill()}
          />
          <div
            className="admin-stat-drill-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-stat-drill-title"
          >
            <button
              type="button"
              className="admin-stat-drill-close"
              onClick={() => closeStatDrill()}
              aria-label="Close"
            >
              ×
            </button>
            <div className="admin-stat-drill-head">
              <div>
                <h2 id="admin-stat-drill-title" className="admin-stat-drill-title">
                  {statDrillMeta(statDrill).title}
                </h2>
                <p className="admin-stat-drill-sub">{statDrillMeta(statDrill).subtitle}</p>
                <p className="admin-stat-drill-count" aria-live="polite">
                  <strong>{statDrillPagination.total}</strong>{' '}
                  {statDrill === 'matches' ? 'match pairs' : 'users'}
                  {statDrillPagination.totalPages > 1
                    ? ` · page ${statDrillPage} of ${statDrillPagination.totalPages}`
                    : ''}
                </p>
                {statDrill === 'onboarding' ? (
                  <div className="admin-onboarding-nudge">
                    <p className="admin-onboarding-nudge-hint">
                      <strong>SMS (recommended)</strong> — reaches onboarding users by phone (Twilio Messages API +
                      TWILIO_PHONE_NUMBER). Skips opt-outs and accounts nudged in the last 24h. One SMS per user by
                      default. Configure Twilio inbound webhook: <code>POST /api/sms/webhook/inbound</code> for STOP.
                    </p>
                    <div className="admin-onboarding-nudge-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={onboardingNudgeLoading}
                        onClick={() => void sendOnboardingSmsNudge(true)}
                      >
                        {onboardingNudgeLoading ? 'Previewing…' : 'Preview SMS reach'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={onboardingNudgeLoading}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Send profile reminder SMS to eligible onboarding users? Requires TWILIO_PHONE_NUMBER. One message per user unless already sent.',
                            )
                          ) {
                            void sendOnboardingSmsNudge(false);
                          }
                        }}
                      >
                        {onboardingNudgeLoading ? 'Sending…' : 'Send SMS reminder'}
                      </button>
                    </div>
                    <p className="admin-onboarding-nudge-hint admin-onboarding-nudge-hint--secondary">
                      <strong>Push</strong> — Expo + Web Push only (users who allowed notifications).
                    </p>
                    <div className="admin-onboarding-nudge-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={onboardingNudgeLoading}
                        onClick={() => void sendOnboardingPushNudge(true)}
                      >
                        Preview push reach
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={onboardingNudgeLoading}
                        onClick={() => {
                          if (window.confirm('Send push to onboarding users with a registered device?')) {
                            void sendOnboardingPushNudge(false);
                          }
                        }}
                      >
                        Send push reminder
                      </button>
                    </div>
                    {onboardingNudgeMessage ? (
                      <p className="admin-onboarding-nudge-result" role="status">
                        {onboardingNudgeMessage}
                      </p>
                    ) : null}
                    {onboardingProgressSummary && onboardingProgressSummary.onPage > 0 ? (
                      <p className="admin-onboarding-progress-summary" role="status">
                        <strong>This page:</strong>{' '}
                        {onboardingProgressSummary.ready > 0
                          ? `${onboardingProgressSummary.ready} ready to tap Complete Profile`
                          : 'none ready yet'}
                        {onboardingProgressSummary.needPhotos > 0
                          ? ` · ${onboardingProgressSummary.needPhotos} need photos`
                          : ''}
                        {onboardingProgressSummary.needName > 0
                          ? ` · ${onboardingProgressSummary.needName} need name`
                          : ''}
                        {onboardingProgressSummary.needLocation > 0
                          ? ` · ${onboardingProgressSummary.needLocation} need city, state`
                          : ''}
                        {onboardingProgressSummary.noProfile > 0
                          ? ` · ${onboardingProgressSummary.noProfile} no profile row`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="admin-stat-drill-body">
            {statDrillError ? (
              <p className="admin-stat-drill-error">{statDrillError}</p>
            ) : null}

            {statDrillLoading ? (
              <div className="admin-stat-drill-loading" aria-busy="true">
                <span className="admin-um-loading-dot" />
                <span className="admin-um-loading-dot" />
                <span className="admin-um-loading-dot" />
                <span>Loading…</span>
              </div>
            ) : statDrill === 'matches' ? (
              <>
                <div className="admin-stat-drill-table-wrap">
                  <table className="admin-stat-drill-table">
                    <thead>
                      <tr>
                        <th scope="col">Stage</th>
                        <th scope="col">User A</th>
                        <th scope="col">User B</th>
                        <th scope="col">Matched</th>
                        <th scope="col" className="admin-stat-drill-actions-col">
                          Open
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statDrillMatches.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="admin-stat-drill-empty">
                            No matches returned.
                          </td>
                        </tr>
                      ) : (
                        statDrillMatches.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <span className="admin-stat-drill-pill">{m.stage}</span>
                            </td>
                            <td>
                              <span className="admin-stat-drill-name">{m.user1.name}</span>
                              <span className="admin-stat-drill-id">{m.user1.id.length > 10 ? `${m.user1.id.slice(0, 10)}…` : m.user1.id}</span>
                            </td>
                            <td>
                              <span className="admin-stat-drill-name">{m.user2.name}</span>
                              <span className="admin-stat-drill-id">{m.user2.id.length > 10 ? `${m.user2.id.slice(0, 10)}…` : m.user2.id}</span>
                            </td>
                            <td className="admin-stat-drill-date">
                              {m.stage1At ? new Date(m.stage1At).toLocaleDateString() : '—'}
                            </td>
                            <td className="admin-stat-drill-actions-col">
                              <div className="admin-stat-drill-open-btns">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => pickUserFromDrill(m.user1.id)}
                                >
                                  A
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => pickUserFromDrill(m.user2.id)}
                                >
                                  B
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {statDrillPagination.totalPages > 1 ? (
                  <nav className="admin-stat-drill-pagination" aria-label="Match list pages">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={statDrillPage <= 1}
                      onClick={() => setStatDrillPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-status">
                      Page <strong>{statDrillPage}</strong> of{' '}
                      <strong>{statDrillPagination.totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={statDrillPage >= statDrillPagination.totalPages}
                      onClick={() =>
                        setStatDrillPage((p) => Math.min(statDrillPagination.totalPages, p + 1))
                      }
                    >
                      Next
                    </button>
                  </nav>
                ) : null}
              </>
            ) : (
              <>
                <div className="admin-stat-drill-table-wrap">
                  <table className="admin-stat-drill-table">
                    <thead>
                      <tr>
                        <th scope="col">Phone</th>
                        <th scope="col">Name</th>
                        {statDrill === 'onboarding' ? (
                          <>
                            <th scope="col">Platform</th>
                            <th scope="col">Setup progress</th>
                          </>
                        ) : (
                          <>
                            <th scope="col">Email</th>
                            <th scope="col">Status</th>
                            <th scope="col">Tokens</th>
                          </>
                        )}
                        <th scope="col">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statDrillUsers.length === 0 ? (
                        <tr>
                          <td colSpan={statDrill === 'onboarding' ? 5 : 6} className="admin-stat-drill-empty">
                            No users on this page.
                          </td>
                        </tr>
                      ) : statDrill === 'onboarding' ? (
                        statDrillUsers.map((u) => (
                          <tr key={u.id} className="admin-stat-drill-row-click" onClick={() => pickUserFromDrill(u.id)}>
                            <td className="admin-stat-drill-phone" title={adminPhoneLabel(u.phoneNumber)}>
                              {adminPhoneLabel(u.phoneNumber)}
                            </td>
                            <td>{u.display_name?.trim() || '—'}</td>
                            <td>{adminClientPlatformPill(u)}</td>
                            <td>
                              {u.onboardingProgress ? (
                                <AdminOnboardingProgressCell progress={u.onboardingProgress} />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="admin-stat-drill-date">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      ) : (
                        statDrillUsers.map((u) => (
                          <tr key={u.id} className="admin-stat-drill-row-click" onClick={() => pickUserFromDrill(u.id)}>
                            <td className="admin-stat-drill-phone" title={adminPhoneLabel(u.phoneNumber)}>
                              {adminPhoneLabel(u.phoneNumber)}
                            </td>
                            <td className="admin-stat-drill-email" title={adminEmailLabel(u.email, u.phoneNumber)}>
                              {adminEmailLabel(u.email, u.phoneNumber)}
                            </td>
                            <td>{u.display_name || '—'}</td>
                            <td>
                              {u.is_admin ? (
                                <span className="badge badge-admin">Admin</span>
                              ) : u.photoVerified ? (
                                <span className="badge badge-verified">Verified</span>
                              ) : u.is_restricted ? (
                                <span className="badge badge-restricted">Restricted</span>
                              ) : (
                                <span className="badge badge-active">Active</span>
                              )}
                            </td>
                            <td>{u.tokenCount}</td>
                            <td className="admin-stat-drill-date">
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {statDrillPagination.totalPages > 1 ? (
                  <nav className="admin-stat-drill-pagination" aria-label="User list pages">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={statDrillPage <= 1}
                      onClick={() => setStatDrillPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-status">
                      Page <strong>{statDrillPage}</strong> of{' '}
                      <strong>{statDrillPagination.totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={statDrillPage >= statDrillPagination.totalPages}
                      onClick={() =>
                        setStatDrillPage((p) => Math.min(statDrillPagination.totalPages, p + 1))
                      }
                    >
                      Next
                    </button>
                  </nav>
                ) : null}
              </>
            )}
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}

