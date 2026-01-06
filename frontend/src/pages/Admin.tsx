import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import './Admin.css';

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

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
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
  const [showMessages, setShowMessages] = useState(false);
  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

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
        limit: '50',
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
      setShowMessages(false);
      setUserMessages([]);
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      setMessage({ type: 'error', text: 'Failed to load user details' });
    }
  };

  const fetchUserMessages = async (userId: string) => {
    console.log('fetchUserMessages called with userId:', userId);
    if (!userId) {
      console.error('No userId provided to fetchUserMessages');
      setMessage({ type: 'error', text: 'User ID is missing' });
      return;
    }
    
    setLoadingMessages(true);
    setMessage(null); // Clear any previous messages
    try {
      console.log('Fetching messages for user:', userId);
      const endpoint = `/admin/users/${userId}/messages?limit=50`;
      console.log('API endpoint:', endpoint);
      const data = await api.get<{ messages: Message[]; total: number }>(endpoint);
      console.log('Messages received:', data);
      
      // Ensure we have the messages array
      const messages = data.messages || [];
      console.log('Setting messages:', messages.length, 'messages');
      
      setUserMessages(messages);
      setShowMessages(true);
      
      // Scroll to messages section after a brief delay to ensure DOM update
      setTimeout(() => {
        const messagesSection = document.querySelector('.admin-messages-list');
        if (messagesSection) {
          messagesSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      
      if (messages.length === 0) {
        setMessage({ type: 'success', text: 'No messages found for this user' });
      } else {
        setMessage({ type: 'success', text: `Loaded ${messages.length} message${messages.length !== 1 ? 's' : ''}` });
        // Clear success message after 3 seconds
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error: any) {
      console.error('Failed to fetch messages:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        status: error.status
      });
      const errorMessage = error.message || error.response?.data?.error || 'Failed to load messages';
      setMessage({ type: 'error', text: errorMessage });
      setShowMessages(false);
      setUserMessages([]);
    } finally {
      setLoadingMessages(false);
    }
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

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>🔐 Admin Dashboard</h1>
        {message && (
          <div className={`admin-message admin-message-${message.type}`}>
            {message.text}
            <button onClick={() => setMessage(null)}>×</button>
          </div>
        )}
      </div>

      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalProfiles}</div>
            <div className="stat-label">Profiles</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalMatches}</div>
            <div className="stat-label">Active Matches</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.restrictedUsers}</div>
            <div className="stat-label">Restricted Users</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.activeUsers}</div>
            <div className="stat-label">Active (7 days)</div>
          </div>
        </div>
      )}

      <div className="admin-content">
        <div className="admin-users-section">
          <div className="admin-section-header">
            <h2>User Management</h2>
            <div className="admin-search">
              <input
                type="text"
                placeholder="Search by email or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading users...</div>
          ) : (
            <>
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Age</th>
                      <th>Location</th>
                      <th>Tokens</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={selectedUser?.id === user.id ? 'selected' : ''}
                        onClick={() => fetchUserDetails(user.id)}
                      >
                        <td>{user.email}</td>
                        <td>{user.display_name || '—'}</td>
                        <td>{user.age || '—'}</td>
                        <td>{user.location || '—'}</td>
                        <td>{user.tokenCount}</td>
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
                          <div className="action-buttons">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => grantTokens(user.id, 1)}
                              disabled={actionLoading === user.id}
                            >
                              +1 Token
                            </button>
                            <button
                              className={`btn btn-sm ${Boolean(user.is_restricted) ? 'btn-success' : 'btn-warning'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                restrictUser(user.id, !Boolean(user.is_restricted));
                              }}
                              disabled={actionLoading === user.id}
                            >
                              {Boolean(user.is_restricted) ? 'Unrestrict' : 'Restrict'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next
                </button>
              </div>
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

              <div className="detail-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h3 style={{ margin: 0 }}>Messages</h3>
                  {!showMessages ? (
                    <button
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('View Messages button clicked');
                        console.log('selectedUser:', selectedUser);
                        console.log('selectedUser.id:', selectedUser?.id);
                        if (selectedUser?.id) {
                          fetchUserMessages(selectedUser.id);
                        } else {
                          console.error('selectedUser.id is missing!');
                          setMessage({ type: 'error', text: 'User ID is missing. Please select a user first.' });
                        }
                      }}
                      disabled={loadingMessages}
                    >
                      {loadingMessages ? 'Loading...' : 'View Messages'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMessages(false);
                        setUserMessages([]);
                      }}
                    >
                      Hide Messages
                    </button>
                  )}
                </div>
                {loadingMessages && (
                  <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading messages...
                  </div>
                )}
                {showMessages && !loadingMessages && (
                  <div className="admin-messages-list">
                    {userMessages.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: 'var(--space-4)' }}>No messages found</p>
                    ) : (
                      <div style={{ maxHeight: '400px', overflowY: 'auto', padding: 'var(--space-2)' }}>
                        {userMessages.map((msg) => (
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
                            <div className="admin-message-content">{msg.content}</div>
                            {msg.readAt && (
                              <div className="admin-message-read">✓ Read {new Date(msg.readAt).toLocaleString()}</div>
                            )}
                          </div>
                        ))}
                      </div>
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
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

