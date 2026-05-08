import { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
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
  display_name?: string;
  age?: number;
  gender?: string;
  location?: string;
  is_admin: boolean;
  is_restricted: boolean;
  created_at: string;
  last_active_at?: string;
  tokenCount: number;
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

interface UserDetails extends User {
  profile?: any;
  tokens: any[];
  matches: number;
  blocks: number;
  messages?: Message[];
}

interface Stats {
  totalUsers: number;
  totalProfiles: number;
  totalMatches: number;
  restrictedUsers: number;
  activeUsers: number;
}

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
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

  // Check if current user is the super admin
  const isSuperAdmin = user?.email === 'pelagiotl@gmail.com';

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [page, search]);

  const fetchStats = async () => {
    try {
      const data = await api.get<Stats>('/admin/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
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

  const fetchUserDetails = async (userId: string) => {
    try {
      const data = await api.get<UserDetails>(`/admin/users/${userId}`);
      setSelectedUser(data);
      setSelectedConversation(null);
      setUserMessages([]);
      setMessagesError(null);
      setMatchesError(null);
      setUserMatches([]);
      setMessagesTotal(0);
      setMessagesHasMore(false);
      void fetchUserMatches(userId);
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      setMessage({ type: 'error', text: 'Failed to load user details' });
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
          <div className="stat-card">
            <div className="stat-icon" aria-hidden>👥</div>
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden>📋</div>
            <div className="stat-value">{stats.totalProfiles}</div>
            <div className="stat-label">Profiles</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden>💕</div>
            <div className="stat-value">{stats.totalMatches}</div>
            <div className="stat-label">Active Matches</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden>🚫</div>
            <div className="stat-value">{stats.restrictedUsers}</div>
            <div className="stat-label">Restricted</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" aria-hidden>✨</div>
            <div className="stat-value">{stats.activeUsers}</div>
            <div className="stat-label">Active (7d)</div>
          </div>
        </div>
      )}

      <div className="admin-actions-section">
        <h2>Bulk Actions</h2>
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
        <p className="admin-actions-note">
          This will delete all users with test email patterns (test@, newtest@, testing@, etc.) and all their associated data.
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
                Search users by email or display name
              </label>
              <div className="admin-search admin-search--prominent">
                <input
                  id="admin-user-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Search email or name…"
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
                      <th scope="col">Email</th>
                      <th scope="col">Name</th>
                      <th scope="col" className="users-table-col-narrow">
                        Age
                      </th>
                      <th scope="col">Location</th>
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
                        className={selectedUser?.id === user.id ? 'selected' : ''}
                        onClick={() => fetchUserDetails(user.id)}
                      >
                        <td className="users-table-cell-email">
                          <span className="users-table-email" title={user.email}>
                            {user.email}
                          </span>
                        </td>
                        <td className="users-table-cell-name">{user.display_name || '—'}</td>
                        <td>{user.age ?? '—'}</td>
                        <td className="users-table-cell-location">
                          <span className="users-table-location" title={user.location || undefined}>
                            {user.location || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="admin-token-pill">{user.tokenCount}</span>
                        </td>
                        <td>
                          {(() => {
                            const isAdmin = Boolean(user.is_admin);
                            const isRestricted = Boolean(user.is_restricted);

                            if (isAdmin) {
                              return <span className="badge badge-admin">Admin</span>;
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
                              className="btn btn-sm btn-primary admin-action-tokens"
                              onClick={() => grantTokens(user.id, 1)}
                              disabled={actionLoading === user.id}
                              title="Grant 1 Mulligan token"
                            >
                              +1
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

        {selectedUser && (
          <div className="admin-user-details">
            <div className="user-details-header">
              <h2>User Details</h2>
              <button onClick={() => setSelectedUser(null)}>×</button>
            </div>

            <div className="user-details-content">
              <div className="detail-section">
                <h3>Account Info</h3>
                <p><strong>Email:</strong> {selectedUser.email}</p>
                <p><strong>User ID:</strong> {selectedUser.id}</p>
                <p><strong>Created:</strong> {new Date(selectedUser.created_at).toLocaleDateString()}</p>
                <p><strong>Last Active:</strong> {selectedUser.last_active_at ? new Date(selectedUser.last_active_at).toLocaleDateString() : 'Never'}</p>
              </div>

              {selectedUser.profile && (
                <div className="detail-section">
                  <h3>Profile</h3>
                  <p><strong>Name:</strong> {selectedUser.profile.display_name}</p>
                  <p><strong>Age:</strong> {selectedUser.profile.age}</p>
                  <p><strong>Gender:</strong> {selectedUser.profile.gender}</p>
                  <p><strong>Location:</strong> {selectedUser.profile.location || '—'}</p>
                </div>
              )}

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
                    className={`btn ${Boolean(selectedUser.is_restricted) ? 'btn-success' : 'btn-warning'}`}
                    onClick={() => restrictUser(selectedUser.id, !Boolean(selectedUser.is_restricted))}
                    disabled={actionLoading === selectedUser.id}
                  >
                    {Boolean(selectedUser.is_restricted) ? 'Unrestrict User' : 'Restrict User'}
                  </button>
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
          </div>
        )}
      </div>
    </div>
  );
}

