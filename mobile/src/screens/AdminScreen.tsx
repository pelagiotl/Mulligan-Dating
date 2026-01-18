import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

interface Stats {
  totalUsers: number;
  totalProfiles: number;
  totalMatches: number;
  restrictedUsers: number;
  activeUsers: number;
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

interface UserDetails extends User {
  profile?: any;
  tokens: any[];
  matches: number;
  blocks: number;
}

export default function AdminScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
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

  useEffect(() => {
    fetchStats();
    fetchUsers();
  }, [page, search]);

  const fetchStats = async () => {
    try {
      const data = await api.get<Stats>('/admin/stats');
      setStats(data);
    } catch (error: any) {
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
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    try {
      const data = await api.get<UserDetails>(`/admin/users/${userId}`);
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
              const created = result.createdUsers?.length || 0;
              const skipped = result.skipped || 0;
              const errors = result.errors || 0;
              const total = result.total || 5;
              
              let message = `Results:\n`;
              message += `✅ Created: ${created}\n`;
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

  if (!user?.isAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Access Denied</Text>
        <Text style={styles.errorSubtext}>You must be an admin to access this page.</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <Text style={styles.subtitle}>Manage your app</Text>
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Statistics</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalUsers}</Text>
              <Text style={styles.statLabel}>Total Users</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalProfiles}</Text>
              <Text style={styles.statLabel}>Profiles</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.totalMatches}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.restrictedUsers}</Text>
              <Text style={styles.statLabel}>Restricted</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.activeUsers}</Text>
              <Text style={styles.statLabel}>Active (7d)</Text>
            </View>
          </View>
        </View>
      )}

      {/* Test Users */}
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
          style={styles.button}
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
      </View>

      {/* User List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 User Management</Text>
        
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
            <TouchableOpacity
              key={u.id}
              style={styles.userCard}
              onPress={() => fetchUserDetails(u.id)}
            >
              <View style={styles.userCardContent}>
                <View>
                  <Text style={styles.userName}>{u.display_name || u.email || u.phoneNumber || 'N/A'}</Text>
                  <Text style={styles.userEmail}>{u.email || u.phoneNumber || 'No contact'}</Text>
                  {u.age && u.gender && (
                    <Text style={styles.userDetails}>{u.age} • {u.gender}</Text>
                  )}
                </View>
                <View style={styles.userBadges}>
                  {u.is_admin && <Text style={[styles.badge, styles.badgeAdmin]}>Admin</Text>}
                  {u.is_restricted && <Text style={[styles.badge, styles.badgeRestricted]}>Restricted</Text>}
                  {!u.is_admin && !u.is_restricted && <Text style={[styles.badge, styles.badgeActive]}>Active</Text>}
                </View>
              </View>
              <View style={styles.userActions}>
                <Text style={styles.tokenCount}>🎟️ {u.tokenCount}</Text>
                <TouchableOpacity
                  style={[styles.smallButton, styles.primaryButton]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleGrantTokens(u.id, 1);
                  }}
                  disabled={actionLoading === u.id}
                >
                  <Text style={styles.smallButtonText}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, u.is_restricted ? styles.successButton : styles.warningButton]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleRestrictUser(u.id, !u.is_restricted);
                  }}
                  disabled={actionLoading === u.id}
                >
                  <Text style={styles.smallButtonText}>{u.is_restricted ? 'Unrestrict' : 'Restrict'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

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
                      <Text style={styles.detailItem}>Age: {selectedUser.profile.age}</Text>
                      <Text style={styles.detailItem}>Gender: {selectedUser.profile.gender}</Text>
                      <Text style={styles.detailItem}>Location: {selectedUser.profile.location || '—'}</Text>
                    </View>
                  )}

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
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  userCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  userCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  userDetails: {
    fontSize: 12,
    color: '#999',
  },
  userBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
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
    gap: 8,
  },
  tokenCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
    marginRight: 'auto',
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 24,
    color: '#999',
  },
  detailSection: {
    marginBottom: 24,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  detailItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 100,
  },
  errorSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 40,
  },
});
