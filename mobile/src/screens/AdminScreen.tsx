import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
  Share,
  Image,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { api, API_URL } from '../utils/api';
import { getAdminDisplayPhotos } from '../utils/adminDisplayPhotos';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { AdminModerationAudio } from '../components/AdminModerationAudio';
import { androidShellBackdropColors } from '../utils/androidConnectShellChrome';

interface Stats {
  totalUsers: number;
  totalProfiles: number;
  totalMatches: number;
  restrictedUsers: number;
  activeUsers: number;
  onboardingUsers?: number;
}

interface User {
  id: string;
  email: string;
  phoneNumber?: string;
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

function resolveAdminMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const base = API_URL.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? '' : '/'}${u}`;
}

interface MatchPair {
  id: string;
  stage: string;
  stage1At: string;
  user1: { id: string; name: string; phone?: string };
  user2: { id: string; name: string; phone?: string };
}

interface AdminMessage {
  id: string;
  content: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  senderId: string;
  senderName: string;
  otherUserName: string;
  matchId: string;
  sentAt: string;
  readAt: string | null;
  isFromTargetUser: boolean;
}

interface AdminUserMatch {
  matchId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhone?: string | null;
  messageCount?: number;
  stage: string;
  stage1At: string;
}

type StatDrillDownType = 'users' | 'matches' | 'restricted' | 'active' | 'onboarding';

export default function AdminScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const { mode: connectShellMode } = useConnectShellTheme();
  const shellBackdropColors = useMemo(
    () => androidShellBackdropColors(connectShellMode),
    [connectShellMode]
  );
  const [loading, setLoading] = useState(false);
  const [creatingUsers, setCreatingUsers] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statDrillDown, setStatDrillDown] = useState<StatDrillDownType | null>(null);
  const [drillDownUsers, setDrillDownUsers] = useState<User[]>([]);
  const [drillDownMatches, setDrillDownMatches] = useState<MatchPair[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const drillDownRequestRef = React.useRef<StatDrillDownType | null>(null);
  const [drillDownUnrestricting, setDrillDownUnrestricting] = useState<string | null>(null);
  const [adminDenied, setAdminDenied] = useState(false);
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [messagesUserId, setMessagesUserId] = useState<string | null>(null);
  const [messagesUserDisplayName, setMessagesUserDisplayName] = useState<string>('');
  const [userMatchesList, setUserMatchesList] = useState<AdminUserMatch[]>([]);
  const [selectedMatchForMessages, setSelectedMatchForMessages] = useState<{ matchId: string; otherUserName: string } | null>(null);
  const [userMessages, setUserMessages] = useState<AdminMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    setAdminDenied(false);
    fetchStats();
    fetchUsers();
  }, [isFocused, page, search]);

  const fetchStats = async (skipCache = false) => {
    try {
      const data = await api.get<Stats>('/admin/stats', !skipCache);
      setStats(data);
      setAdminDenied(false);
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
      if (error?.status === 403) setAdminDenied(true);
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
      setAdminDenied(false);
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      if (error?.status === 403) setAdminDenied(true);
      else Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      const data = await api.get<UserDetails>(`/admin/users/${userId}`, false);
      setSelectedUser(data);
      setShowUserModal(true);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load user details');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchUsers()]);
    setRefreshing(false);
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const report = await api.get<any>('/admin/export/report', false);
      const json = JSON.stringify(report, null, 2);
      const filename = `mulligan-report-${new Date().toISOString().slice(0, 10)}.json`;
      await Share.share({
        message: json,
        title: 'Mulligan Activity Report',
        subject: filename,
      });
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'Could not export report');
    } finally {
      setExporting(false);
    }
  };

  const openStatDrillDown = async (type: StatDrillDownType) => {
    setStatDrillDown(type);
    setDrillDownLoading(true);
    drillDownRequestRef.current = type;
    const requestedType = type;
    fetchStats(true); // Refresh stats (no cache) so card and drill-down numbers stay in sync
    try {
      if (type === 'matches') {
        const data = await api.get<{ matches: MatchPair[]; total: number }>('/admin/matches', false);
        if (drillDownRequestRef.current === requestedType) {
          setDrillDownMatches(data.matches || []);
          setDrillDownUsers([]);
        }
      } else {
        const filter = type === 'users' ? '' : type;
        const params = new URLSearchParams({ limit: '200', ...(filter && { filter }) });
        const data = await api.get<{ users: User[] }>(`/admin/users?${params}`, false);
        if (drillDownRequestRef.current === requestedType) {
          setDrillDownUsers(data.users || []);
          setDrillDownMatches([]);
        }
      }
    } catch (error: any) {
      if (drillDownRequestRef.current === requestedType) {
        Alert.alert('Error', error.message || 'Failed to load data');
        setStatDrillDown(null);
      }
    } finally {
      if (drillDownRequestRef.current === requestedType) {
        setDrillDownLoading(false);
      }
    }
  };

  const handleUnrestrictFromDrillDown = async (userId: string) => {
    setDrillDownUnrestricting(userId);
    try {
      await api.post(`/admin/users/${userId}/restrict`, { restricted: false });
      setDrillDownUsers((prev) => prev.filter((u) => u.id !== userId));
      await fetchStats();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unrestrict');
    } finally {
      setDrillDownUnrestricting(null);
    }
  };

  const handleBatchUnrestrict = async (names: string[]) => {
    try {
      const data = await api.post<{ unrestricted: number; userIds: string[] }>('/admin/users/batch-unrestrict', { displayNames: names });
      Alert.alert('Success', `Unrestricted ${data.unrestricted} user(s)`);
      setDrillDownUsers((prev) => prev.filter((u) => !data.userIds.includes(u.id)));
      await fetchStats();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to batch unrestrict');
    }
  };

  const handleGrantTokens = async (userId: string, count: number) => {
    setActionLoading(userId);
    try {
      const data = await api.post<{ message: string; tokensGranted: number }>(`/admin/users/${userId}/grant-tokens`, { count });
      Alert.alert('Success', data.message || `Granted ${data.tokensGranted || count} token(s)`);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to grant tokens');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestrictUser = async (userId: string, restricted: boolean) => {
    setActionLoading(userId);
    try {
      const data = await api.post<{ message: string }>(`/admin/users/${userId}/restrict`, { restricted });
      Alert.alert('Success', data.message || `User ${restricted ? 'restricted' : 'unrestricted'}`);
      await fetchUsers();
      if (selectedUser?.id === userId) {
        await fetchUserDetails(userId);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update user restriction');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetAdmin = async (userId: string, isAdmin: boolean) => {
    const userToModify = users.find(u => u.id === userId) || selectedUser;
    const userName = userToModify?.display_name || userToModify?.email || 'this user';
    
    Alert.alert(
      isAdmin ? 'Make Admin' : 'Remove Admin',
      `Are you sure you want to ${isAdmin ? 'grant' : 'remove'} admin access to ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setActionLoading(userId);
            try {
              await api.post(`/admin/users/${userId}/set-admin`, { isAdmin });
              Alert.alert('Success', `Admin status ${isAdmin ? 'granted' : 'removed'}`);
              await fetchUsers();
              if (selectedUser?.id === userId) {
                await fetchUserDetails(userId);
              }
            } catch (error: any) {
              Alert.alert('Error', 'Failed to update admin status');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId) || selectedUser;
    const userName = userToDelete?.display_name || userToDelete?.email || 'this user';
    
    Alert.alert(
      '⚠️ Delete User',
      `This will permanently delete ${userName}!\n\n` +
      `This will delete:\n` +
      `- User account\n` +
      `- Profile and all profile data\n` +
      `- All matches and messages\n` +
      `- All tokens\n` +
      `- All blocks\n\n` +
      `This action CANNOT be undone. Are you absolutely sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(userId);
            try {
              await api.delete(`/admin/users/${userId}`);
              Alert.alert('Success', `Successfully deleted user ${userName}`);
              await fetchStats();
              await fetchUsers();
              // Close modal if deleted user was selected
              if (selectedUser?.id === userId) {
                setShowUserModal(false);
                setSelectedUser(null);
              }
            } catch (error: any) {
              const errorMessage = error.message || 'Failed to delete user';
              Alert.alert('Error', errorMessage);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const openMessagesForUser = (userId: string, displayName: string) => {
    setMessagesUserId(userId);
    setMessagesUserDisplayName(displayName);
    setSelectedMatchForMessages(null);
    setUserMessages([]);
    setUserMatchesList([]);
    setShowMessagesModal(true);
    setMatchesLoading(true);
    setMessagesLoading(false);
    api
      .get<{ matches: AdminUserMatch[] }>(`/admin/users/${userId}/matches`, false)
      .then((result) => setUserMatchesList(result.matches || []))
      .catch((err: any) => {
        setUserMatchesList([]);
        const msg = err?.message || 'Could not load matches';
        Alert.alert('Messages', msg);
      })
      .finally(() => setMatchesLoading(false));
  };

  const handleViewMessages = () => {
    if (!selectedUser) return;
    // Close user-details modal first — two RN Modals open at once often leaves the
    // second invisible / non-interactive on some platforms.
    setShowUserModal(false);
    openMessagesForUser(
      selectedUser.id,
      selectedUser.profile?.display_name ||
        selectedUser.email ||
        selectedUser.phoneNumber ||
        selectedUser.id
    );
  };

  const closeMessagesModal = () => {
    setSelectedMatchForMessages(null);
    setShowMessagesModal(false);
    if (selectedUser) setShowUserModal(true);
  };

  const openConversationForMatch = (matchId: string, otherUserName: string) => {
    if (!messagesUserId) return;
    setSelectedMatchForMessages({ matchId, otherUserName });
    setUserMessages([]);
    setMessagesLoading(true);
    api
      .get<{ messages: AdminMessage[]; total: number }>(
        `/admin/users/${messagesUserId}/messages?matchId=${encodeURIComponent(matchId)}&limit=5000&order=asc`,
        false
      )
      .then((result) => setUserMessages(result.messages || []))
      .catch((err: any) => {
        setUserMessages([]);
        Alert.alert('Messages', err?.message || 'Could not load conversation');
      })
      .finally(() => setMessagesLoading(false));
  };

  const handleCreateTestUsers = async () => {
    Alert.alert(
      'Create Test Users',
      'This will create 5 test user accounts. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setCreatingUsers(true);
            try {
              const result = await api.post('/create-test-users', {});
              console.log('📊 Create test users response:', result);
              
              // Backend returns: { createdUsers: string[], total: number, skipped: number, errors: number, success: boolean }
              const created = Array.isArray(result.createdUsers) ? result.createdUsers.length : (result.created || 0);
              const skipped = result.skipped || 0;
              const errors = result.errors || 0;
              const total = result.total || 5;
              
              let message = `Results:\n`;
              message += `✅ Created: ${created} out of ${total}\n`;
              if (skipped > 0) {
                message += `⏭️  Skipped: ${skipped} (already exist)\n`;
              }
              if (errors > 0) {
                message += `❌ Errors: ${errors}\n`;
              }
              
              if (created > 0) {
                message += `\nCreated users:\n${result.createdUsers?.join(', ') || 'None'}`;
              } else if (skipped === total) {
                message += `\nAll ${total} test users already exist in the database.`;
              }
              
              Alert.alert(created > 0 ? 'Success' : 'Info', message);
              await Promise.all([fetchStats(), fetchUsers()]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to create test users');
            } finally {
              setCreatingUsers(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateUniqueTestUsers = async () => {
    Alert.alert(
      'Create Unique Test Users',
      'This will create 5 new test users with unique phone numbers every time. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async () => {
            setCreatingUsers(true);
            try {
              const result = await api.post('/admin/create-unique-test-users', {});
              const created = result.createdUsers?.length || 0;
              const total = result.total || 5;
              
              let message = `Results:\n✅ Created: ${created} out of ${total}\n`;
              if (created > 0) {
                message += `\nCreated users:\n${result.createdUsers?.join(', ') || 'None'}`;
              }
              
              Alert.alert(created > 0 ? 'Success' : 'Error', message);
              await Promise.all([fetchStats(), fetchUsers()]);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to create unique test users');
            } finally {
              setCreatingUsers(false);
            }
          },
        },
      ]
    );
  };

  const isOwnerPhone = user?.phoneNumber && /^(1)?5413163939$/.test(user.phoneNumber.replace(/\D/g, ''));
  if (!user?.isAdmin && !isOwnerPhone) {
    return (
      <View style={styles.wrapper}>
        <LinearGradient
          colors={[...shellBackdropColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.container}>
          <Text style={styles.errorText}>Access Denied</Text>
          <Text style={styles.errorSubtext}>You must be an admin to access this page.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[...shellBackdropColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <Text style={styles.title}>👑 Admin Panel</Text>
            <Text style={styles.subtitle}>Manage your app</Text>
          </LinearGradient>
        </View>

      {adminDenied && (
        <View style={styles.adminDeniedBanner}>
          <Text style={styles.adminDeniedText}>Admin access denied</Text>
          <Text style={styles.adminDeniedSubtext}>The server did not grant admin access. Try logging out and back in.</Text>
        </View>
      )}

      {/* Stats */}
      {stats && !adminDenied && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Statistics</Text>
          <View style={styles.statsGrid}>
            <TouchableOpacity style={styles.statCardTouchable} onPress={() => openStatDrillDown('users')} activeOpacity={0.9}>
              <LinearGradient colors={['#667eea', '#764ba2']} style={styles.statCardGradient}>
                <Text style={styles.statValue}>{stats.totalUsers}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Users</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statCardTouchable} onPress={() => openStatDrillDown('matches')} activeOpacity={0.9}>
              <LinearGradient colors={['#4facfe', '#00f2fe']} style={styles.statCardGradient}>
                <Text style={styles.statValue}>{stats.totalMatches}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Matches</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statCardTouchable} onPress={() => openStatDrillDown('restricted')} activeOpacity={0.9}>
              <LinearGradient colors={['#fa709a', '#fee140']} style={styles.statCardGradient}>
                <Text style={styles.statValue}>{stats.restrictedUsers}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Restricted</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statCardTouchable} onPress={() => openStatDrillDown('active')} activeOpacity={0.9}>
              <LinearGradient colors={['#30cfd0', '#330867']} style={styles.statCardGradient}>
                <Text style={styles.statValue}>{stats.activeUsers}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Active (7d)</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statCardTouchable} onPress={() => openStatDrillDown('onboarding')} activeOpacity={0.9}>
              <LinearGradient colors={['#f093fb', '#f5576c']} style={styles.statCardGradient}>
                <Text style={styles.statValue}>{stats.onboardingUsers ?? 0}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>Onboarding</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.exportButton]}
            onPress={handleExportReport}
            disabled={exporting}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              {exporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>📤 Export Report</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Test Users */}
      {!adminDenied && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🧪 Test Users</Text>
        <Text style={styles.sectionDescription}>
          Create test user accounts for testing matching functionality.
        </Text>
        
        <TouchableOpacity
          style={[styles.button, { marginBottom: 12 }]}
          onPress={handleCreateTestUsers}
          disabled={creatingUsers}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
            {creatingUsers ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create 5 Test Users</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { marginBottom: 12 }]}
          onPress={handleCreateUniqueTestUsers}
          disabled={creatingUsers}
        >
          <LinearGradient
            colors={['#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
            {creatingUsers ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create 5 Unique Test Users</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            Alert.alert(
              '⚠️ Delete All Test Users',
              'This will permanently delete ALL test users!\n\n' +
              'Test users are identified by email patterns like:\n' +
              '• test@*\n' +
              '• newtest@*\n' +
              '• testing@*\n' +
              '• testboy@*\n' +
              '• newaccount@*\n\n' +
              'This action cannot be undone. Are you sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete All',
                  style: 'destructive',
                  onPress: async () => {
                    setActionLoading('delete-test-users');
                    try {
                      const data = await api.delete<{ message: string; deleted: number; deletedUsers: string[] }>('/admin/delete-test-users');
                      Alert.alert(
                        'Success',
                        data.message || `Successfully deleted ${data.deleted || 0} test user(s)`
                      );
                      await Promise.all([fetchStats(), fetchUsers()]);
                      if (selectedUser && data.deletedUsers?.includes(selectedUser.display_name || selectedUser.email || selectedUser.id)) {
                        setShowUserModal(false);
                        setSelectedUser(null);
                      }
                    } catch (error: any) {
                      const errorMessage = error.message || error.response?.data?.error || 'Failed to delete test users';
                      Alert.alert('Error', errorMessage);
                    } finally {
                      setActionLoading(null);
                    }
                  },
                },
              ]
            );
          }}
          disabled={actionLoading === 'delete-test-users'}
        >
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.buttonGradient}
          >
            {actionLoading === 'delete-test-users' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>🗑️ Delete All Test Users</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      )}

      {/* User List */}
      {!adminDenied && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 User Management</Text>
        <Text style={styles.sectionDescription}>Tap a user for details. Use 💬 to view their messages with matches.</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by email, name, or phone..."
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setPage(1);
          }}
          placeholderTextColor="#999"
        />

        {loading ? (
          <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
        ) : users.length === 0 ? (
          <Text style={styles.emptyText}>No users found</Text>
        ) : (
          users.map((u) => (
            <View key={u.id} style={styles.userCard}>
              <TouchableOpacity
                onPress={() => fetchUserDetails(u.id)}
                activeOpacity={0.7}
                style={styles.userCardTouchable}
              >
                <View style={styles.userCardContent}>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>{u.display_name || u.email || u.phoneNumber || 'N/A'}</Text>
                    <Text style={styles.userEmail} numberOfLines={1}>{u.email || u.phoneNumber || 'No contact'}</Text>
                    {u.age && u.gender && (
                      <Text style={styles.userDetails} numberOfLines={1}>{u.age} • {u.gender}{u.location ? ` • ${u.location}` : ''}</Text>
                    )}
                  </View>
                  <View style={styles.userBadges}>
                    {u.is_admin && (
                      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.badgeGradient}>
                        <Text style={styles.badgeText}>Admin</Text>
                      </LinearGradient>
                    )}
                    {u.is_restricted && (
                      <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.badgeGradient}>
                        <Text style={styles.badgeText}>Restricted</Text>
                      </LinearGradient>
                    )}
                    {!u.is_admin && !u.is_restricted && (
                      <LinearGradient colors={['#10b981', '#059669']} style={styles.badgeGradient}>
                        <Text style={styles.badgeText}>Active</Text>
                      </LinearGradient>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.userActions}>
                <View style={styles.tokenBadge}>
                  <Text style={styles.tokenEmoji}>🎟️</Text>
                  <Text style={styles.tokenCount}>{u.tokenCount}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallButton, styles.secondaryButton]}
                  onPress={() => openMessagesForUser(u.id, u.display_name || u.email || u.id)}
                >
                  <Text style={styles.smallButtonText}>💬</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, styles.primaryButton]}
                  onPress={() => handleGrantTokens(u.id, 1)}
                  disabled={actionLoading === u.id}
                >
                  <Text style={styles.smallButtonText}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, u.is_restricted ? styles.successButton : styles.warningButton]}
                  onPress={() => handleRestrictUser(u.id, !u.is_restricted)}
                  disabled={actionLoading === u.id}
                >
                  <Text style={styles.smallButtonText}>{u.is_restricted ? 'Unrestrict' : 'Restrict'}</Text>
                </TouchableOpacity>
                {!u.is_admin && (
                  <TouchableOpacity
                    style={[styles.smallButton, styles.dangerButton]}
                    onPress={() => handleDeleteUser(u.id)}
                    disabled={actionLoading === u.id}
                  >
                    <Text style={styles.smallButtonText}>🗑️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>
      )}

      {/* User Details Modal */}
      <Modal
        visible={showUserModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>User Details</Text>
                <TouchableOpacity onPress={() => setShowUserModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {selectedUser && (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Account Info</Text>
                    <Text style={styles.detailItem}>Email/Phone: {selectedUser.email || selectedUser.phoneNumber || 'N/A'}</Text>
                    <Text style={styles.detailItem}>User ID: {selectedUser.id}</Text>
                    <Text style={styles.detailItem}>Created: {new Date(selectedUser.created_at).toLocaleDateString()}</Text>
                    <Text style={styles.detailItem}>Last Active: {selectedUser.last_active_at ? new Date(selectedUser.last_active_at).toLocaleDateString() : 'Never'}</Text>
                  </View>

                  {selectedUser.profile && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Profile</Text>
                      <Text style={styles.detailItem}>Name: {selectedUser.profile.display_name}</Text>
                      <Text style={styles.detailItem}>Age: {selectedUser.profile.age ?? '—'}</Text>
                      <Text style={styles.detailItem}>Gender: {selectedUser.profile.gender || '—'}</Text>
                      <Text style={styles.detailItem}>Location: {selectedUser.profile.location || '—'}</Text>
                      {selectedUser.profile.bio ? (
                        <Text style={styles.detailItemBio}>Bio: {selectedUser.profile.bio}</Text>
                      ) : null}
                      {selectedUser.profile.looking_for ? (
                        <Text style={styles.detailItem}>Looking for: {selectedUser.profile.looking_for}</Text>
                      ) : null}
                      {selectedUser.interests && selectedUser.interests.length > 0 ? (
                        <Text style={styles.detailItem}>Interests: {selectedUser.interests.join(', ')}</Text>
                      ) : null}
                      {selectedUser.lifestyle &&
                        Object.entries(selectedUser.lifestyle).some(([, v]) => v) ? (
                          <View style={styles.lifestyleBlock}>
                            <Text style={styles.detailItem}>Lifestyle</Text>
                            {Object.entries(selectedUser.lifestyle)
                              .filter(([, v]) => v)
                              .map(([key, value]) => (
                                <Text key={key} style={styles.lifestyleItem}>
                                  {LIFESTYLE_FIELD_LABELS[key] || key}: {value}
                                </Text>
                              ))}
                          </View>
                        ) : null}
                    </View>
                  )}

                  {(() => {
                    const displayPhotos = getAdminDisplayPhotos(selectedUser.photos, selectedUser.profile);
                    if (displayPhotos.length > 0) {
                      return (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Photos ({displayPhotos.length})</Text>
                      <View style={styles.profilePhotosGrid}>
                        {displayPhotos.map((photo) => {
                          const uri = resolveAdminMediaUrl(photo.url);
                          if (!uri) return null;
                          return (
                            <TouchableOpacity
                              key={photo.id}
                              activeOpacity={0.85}
                              onPress={() => Linking.openURL(uri)}
                              style={styles.profilePhotoCard}
                            >
                              <Image source={{ uri }} style={styles.profilePhotoImg} resizeMode="cover" />
                              {photo.isPrimary ? (
                                <View style={styles.profilePhotoBadge}>
                                  <Text style={styles.profilePhotoBadgeText}>Primary</Text>
                                </View>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                      );
                    }
                    if (selectedUser.profile) {
                      return (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Photos</Text>
                      <Text style={styles.detailMuted}>No photos uploaded.</Text>
                    </View>
                      );
                    }
                    return null;
                  })()}

                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Stats</Text>
                    <Text style={styles.detailItem}>Tokens: {selectedUser.tokenCount}</Text>
                    <Text style={styles.detailItem}>Matches: {selectedUser.matches}</Text>
                    <Text style={styles.detailItem}>Blocks: {selectedUser.blocks}</Text>
                  </View>

                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Actions</Text>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryButton]}
                      onPress={handleViewMessages}
                      disabled={actionLoading === selectedUser.id}
                    >
                      <Text style={styles.actionButtonText}>💬 View messages</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryButton]}
                      onPress={() => handleGrantTokens(selectedUser.id, 1)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      <Text style={styles.actionButtonText}>Grant 1 Token</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryButton]}
                      onPress={() => handleGrantTokens(selectedUser.id, 3)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      <Text style={styles.actionButtonText}>Grant 3 Tokens</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, selectedUser.is_restricted ? styles.successButton : styles.warningButton]}
                      onPress={() => handleRestrictUser(selectedUser.id, !selectedUser.is_restricted)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      <Text style={styles.actionButtonText}>
                        {selectedUser.is_restricted ? 'Unrestrict User' : 'Restrict User'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.secondaryButton]}
                      onPress={() => handleSetAdmin(selectedUser.id, !selectedUser.is_admin)}
                      disabled={actionLoading === selectedUser.id}
                    >
                      <Text style={styles.actionButtonText}>
                        {selectedUser.is_admin ? 'Remove Admin' : 'Make Admin'}
                      </Text>
                    </TouchableOpacity>
                    {!selectedUser.is_admin && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.dangerButton]}
                        onPress={() => handleDeleteUser(selectedUser.id)}
                        disabled={actionLoading === selectedUser.id}
                      >
                        <Text style={styles.actionButtonText}>🗑️ Delete User</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Messages Modal */}
      <Modal
        visible={showMessagesModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (selectedMatchForMessages) setSelectedMatchForMessages(null);
          else closeMessagesModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.drillDownModalContent]}>
            <LinearGradient colors={['#667eea', '#764ba2']} style={styles.drillDownModalHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.messagesModalHeaderRow}>
                {selectedMatchForMessages ? (
                  <TouchableOpacity onPress={() => setSelectedMatchForMessages(null)} hitSlop={8}>
                    <Text style={styles.messageBackText}>← Back</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.messageBackPlaceholder} />
                )}
                <View style={styles.messagesModalTitleWrap}>
                  <Text style={styles.drillDownModalTitle} numberOfLines={1}>
                    {selectedMatchForMessages ? `With ${selectedMatchForMessages.otherUserName}` : `Messages — ${messagesUserDisplayName}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={closeMessagesModal} hitSlop={12}>
                  <Text style={styles.drillDownModalClose}>✕</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
            {selectedMatchForMessages ? (
              messagesLoading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : (
                <ScrollView style={styles.drillDownScroll} contentContainerStyle={styles.messagesScrollContent}>
                  {userMessages.length === 0 ? (
                    <View style={styles.drillDownEmpty}>
                      <Text style={styles.drillDownEmptyText}>No messages in this conversation</Text>
                    </View>
                  ) : (
                    userMessages.map((msg) => {
                      const dateStr = msg.sentAt ? new Date(msg.sentAt).toLocaleString() : '—';
                      const fromTo = `${msg.senderName} → ${msg.otherUserName}`;
                      const hasContent = !!(msg.content || msg.imageUrl || msg.videoUrl || msg.audioUrl);
                      const resolveUrl = (url: string | null | undefined) =>
                        !url ? null : url.startsWith('http') ? url : `${API_URL.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
                      const imageUri = resolveUrl(msg.imageUrl ?? null);
                      const videoUri = resolveUrl(msg.videoUrl ?? null);
                      const audioUri = resolveUrl(msg.audioUrl ?? null);
                      return (
                        <View key={msg.id} style={styles.messageRow}>
                          <Text style={styles.messageMeta}>{dateStr}</Text>
                          <Text style={styles.messageFromTo}>{fromTo}</Text>
                          {msg.content ? <Text style={styles.messageBody} numberOfLines={10}>{msg.content}</Text> : null}
                          {imageUri ? (
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => Linking.openURL(imageUri)}
                              style={styles.messageImageWrap}
                            >
                              <Image source={{ uri: imageUri }} style={styles.messageImage} resizeMode="cover" />
                            </TouchableOpacity>
                          ) : null}
                          {videoUri ? (
                            <Video
                              source={{ uri: videoUri }}
                              style={styles.adminMessageVideo}
                              useNativeControls
                              resizeMode={ResizeMode.CONTAIN}
                            />
                          ) : null}
                          {audioUri ? <AdminModerationAudio uri={audioUri} /> : null}
                          {!hasContent && <Text style={styles.messageBody}>—</Text>}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )
            ) : matchesLoading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : (
              <ScrollView style={styles.drillDownScroll} contentContainerStyle={styles.messagesScrollContent}>
                {userMatchesList.length === 0 ? (
                  <View style={styles.drillDownEmpty}>
                    <Text style={styles.drillDownEmptyText}>No matches yet</Text>
                  </View>
                ) : (
                  userMatchesList.map((match) => (
                    <TouchableOpacity
                      key={match.matchId}
                      style={styles.matchRow}
                      onPress={() => openConversationForMatch(match.matchId, match.otherUserName)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.matchRowName}>{match.otherUserName}</Text>
                      <Text style={styles.matchRowMeta}>
                        {match.stage} · {match.messageCount ?? '—'} msgs
                        {match.otherUserPhone ? ` · ${match.otherUserPhone}` : ''} · Matched{' '}
                        {new Date(match.stage1At).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Stat Drill-Down Modal */}
      <Modal
        visible={statDrillDown !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatDrillDown(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.drillDownModalContent]}>
            <LinearGradient
              colors={
                statDrillDown === 'restricted' ? ['#fa709a', '#fee140'] :
                statDrillDown === 'active' ? ['#30cfd0', '#330867'] :
                statDrillDown === 'matches' ? ['#4facfe', '#00f2fe'] :
                ['#667eea', '#764ba2']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.drillDownModalHeader}
            >
              <View style={styles.drillDownModalHeaderRow}>
                <Text style={styles.drillDownModalTitle}>
                  {statDrillDown === 'users' && '👥 All Users'}
                  {statDrillDown === 'matches' && '💕 Match Pairs'}
                  {statDrillDown === 'restricted' && '🚫 Restricted Users'}
                  {statDrillDown === 'active' && '✨ Active (7d)'}
                </Text>
                <TouchableOpacity onPress={() => setStatDrillDown(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.drillDownModalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              {!drillDownLoading && (
                <>
                  <Text style={styles.drillDownModalSubtitle}>
                    {statDrillDown === 'matches'
                      ? `${drillDownMatches.length} pair${drillDownMatches.length !== 1 ? 's' : ''}`
                      : `${drillDownUsers.length} user${drillDownUsers.length !== 1 ? 's' : ''}`}
                  </Text>
                  {statDrillDown === 'restricted' && drillDownUsers.length > 0 && (
                    <TouchableOpacity
                      style={styles.drillDownFixBtn}
                      onPress={() => {
                        Alert.alert(
                          'Unrestrict Leo, Dan, Luke?',
                          'This will unrestrict these users if they appear in the list.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Unrestrict', onPress: () => handleBatchUnrestrict(['Leo', 'Dan', 'Luke']) }
                          ]
                        );
                      }}
                    >
                      <Text style={styles.drillDownFixBtnText}>Fix: Unrestrict Leo, Dan, Luke</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </LinearGradient>
            {drillDownLoading ? (
              <View style={styles.drillDownLoadingWrap}>
                <ActivityIndicator size="large" color="#667eea" />
              </View>
            ) : statDrillDown === 'matches' ? (
              <ScrollView style={styles.drillDownScroll} showsVerticalScrollIndicator={false}>
                {drillDownMatches.length === 0 ? (
                  <View style={styles.drillDownEmpty}>
                    <Text style={styles.drillDownEmptyText}>No matches yet</Text>
                  </View>
                ) : (
                  drillDownMatches.map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.drillDownCard}
                      onPress={() => {
                        setStatDrillDown(null);
                        fetchUserDetails(m.user1.id);
                      }}
                      activeOpacity={0.85}
                    >
                      <LinearGradient colors={['#4facfe', '#00f2fe']} style={styles.drillDownCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                        <Text style={styles.drillDownPair}>{m.user1.name} ↔ {m.user2.name}</Text>
                        <Text style={styles.drillDownMetaLight}>{m.stage} • {new Date(m.stage1At).toLocaleDateString()}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            ) : (
              <ScrollView style={styles.drillDownScroll} showsVerticalScrollIndicator={false}>
                {drillDownUsers.length === 0 ? (
                  <View style={styles.drillDownEmpty}>
                    <Text style={styles.drillDownEmptyText}>No users found</Text>
                  </View>
                ) : (
                  drillDownUsers.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.drillDownCard}
                      onPress={() => {
                        setStatDrillDown(null);
                        fetchUserDetails(u.id);
                      }}
                      activeOpacity={0.85}
                    >
                      {statDrillDown === 'restricted' ? (
                        <LinearGradient colors={['#fa709a', '#fee140']} style={styles.drillDownCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                          <View style={styles.drillDownRestrictedRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.drillDownNameLight}>{u.display_name || u.email || u.phoneNumber || 'N/A'}</Text>
                              <Text style={styles.drillDownMetaLight}>{u.email || u.phoneNumber || 'No contact'}{u.age && u.gender ? ` • ${u.age} ${u.gender}` : ''}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.drillDownUnrestrictBtn}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleUnrestrictFromDrillDown(u.id);
                              }}
                              disabled={drillDownUnrestricting === u.id}
                            >
                              {drillDownUnrestricting === u.id ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.drillDownUnrestrictText}>Unrestrict</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </LinearGradient>
                      ) : statDrillDown === 'active' ? (
                        <LinearGradient colors={['#30cfd0', '#330867']} style={styles.drillDownCardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                          <View style={styles.drillDownActiveRow}>
                            <Text style={styles.drillDownNameLight}>{u.display_name || u.email || u.phoneNumber || 'N/A'}</Text>
                            {u.tokenCount > 0 && (
                              <View style={styles.drillDownTokenBadge}>
                                <Text style={styles.drillDownTokenText}>🎟️ {u.tokenCount}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.drillDownMetaLight}>{u.email || u.phoneNumber || 'No contact'}{u.age && u.gender ? ` • ${u.age} ${u.gender}` : ''}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={styles.drillDownCardPlain}>
                          <Text style={styles.drillDownName}>{u.display_name || u.email || u.phoneNumber || 'N/A'}</Text>
                          <Text style={styles.drillDownMeta}>{u.email || u.phoneNumber || 'No contact'}{u.age && u.gender ? ` • ${u.age} ${u.gender}` : ''}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    marginHorizontal: 16,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 14,
    borderWidth: 3,
    borderColor: '#fff',
  },
  headerGradient: {
    padding: 32,
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
    letterSpacing: -1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.98)',
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  sectionDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statCardTouchable: {
    flexBasis: '48%',
    marginBottom: 12,
    maxWidth: '48%',
  },
  statCardGradient: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minHeight: 120,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.98)',
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 0.3,
    width: '100%',
  },
  exportButton: {
    marginTop: 20,
  },
  button: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  searchInput: {
    backgroundColor: '#f8f9ff',
    borderRadius: 24,
    padding: 18,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    fontWeight: '500',
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  userCardTouchable: {
    marginBottom: 12,
  },
  userCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    fontWeight: '500',
  },
  userDetails: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  userBadges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  badge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeGradient: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  badgeAdmin: {
    backgroundColor: '#667eea',
    color: '#fff',
  },
  badgeRestricted: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  badgeActive: {
    backgroundColor: '#10b981',
    color: '#fff',
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  tokenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 'auto',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.35)',
  },
  tokenEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  tokenCount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#667eea',
  },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#667eea',
  },
  successButton: {
    backgroundColor: '#10b981',
  },
  warningButton: {
    backgroundColor: '#f59e0b',
  },
  secondaryButton: {
    backgroundColor: '#6b7280',
  },
  dangerButton: {
    backgroundColor: '#ef4444',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  drillDownModalContent: {
    overflow: 'hidden',
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  drillDownModalHeader: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 20,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  drillDownModalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  drillDownModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  drillDownModalClose: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '300',
  },
  drillDownModalSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 6,
    fontWeight: '600',
  },
  drillDownLoadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  drillDownScroll: {
    maxHeight: 400,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 24,
  },
  drillDownEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  drillDownEmptyText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  messagesModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  messagesModalTitleWrap: {
    flex: 1,
    marginHorizontal: 8,
    minWidth: 0,
  },
  messageBackText: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  messageBackPlaceholder: {
    width: 56,
  },
  messagesScrollContent: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 24,
  },
  matchRow: {
    backgroundColor: '#f0f2ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e4ff',
  },
  matchRowName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  matchRowMeta: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  messageRow: {
    backgroundColor: '#f0f2ff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e4ff',
  },
  messageMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '600',
  },
  messageFromTo: {
    fontSize: 13,
    color: '#444',
    marginBottom: 6,
    fontWeight: '700',
  },
  messageBody: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 22,
  },
  messageImageWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e4ff',
    alignSelf: 'flex-start',
    maxWidth: 260,
    maxHeight: 220,
  },
  messageImage: {
    width: 260,
    height: 220,
  },
  adminMessageVideo: {
    width: 280,
    height: 160,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#000',
    alignSelf: 'flex-start',
  },
  messageMediaLink: {
    marginTop: 6,
    fontSize: 14,
    color: '#6366f1',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  drillDownCard: {
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  drillDownCardGradient: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  drillDownCardPlain: {
    padding: 18,
    backgroundColor: '#f8f9ff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  drillDownName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  drillDownNameLight: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  drillDownPair: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  drillDownMeta: {
    fontSize: 14,
    color: '#666',
  },
  drillDownMetaLight: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.92)',
  },
  drillDownActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  drillDownTokenBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  drillDownTokenText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  drillDownRestrictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drillDownUnrestrictBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  drillDownUnrestrictText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  drillDownFixBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  drillDownFixBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 28,
    maxHeight: '90%',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -0.6,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  modalClose: {
    fontSize: 32,
    color: '#999',
    fontWeight: '300',
  },
  detailSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 16,
    letterSpacing: -0.4,
    textShadowColor: 'rgba(102, 126, 234, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  detailItem: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  detailItemBio: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  detailMuted: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  lifestyleBlock: {
    marginTop: 4,
  },
  lifestyleItem: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 8,
    marginBottom: 6,
  },
  profilePhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  profilePhotoCard: {
    width: 96,
    height: 128,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  profilePhotoImg: {
    width: '100%',
    height: '100%',
  },
  profilePhotoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  profilePhotoBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  errorText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 100,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  errorSubtext: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  adminDeniedBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  adminDeniedText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  adminDeniedSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
