import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';

interface BlockedUser {
  id: string;
  displayName: string | null;
  email: string;
  blockedAt: string;
}

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [error, setError] = useState('');
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlocked = useCallback(async () => {
    try {
      setError('');
      const data = await api.get<{ blockedUsers: BlockedUser[] }>('/blocks', false);
      setBlockedUsers(data?.blockedUsers ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load blocked users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleUnblock = useCallback(
    (user: BlockedUser) => {
      const label = user.displayName || user.email || 'this user';
      Alert.alert(
        'Unblock',
        `Unblock ${label}? They may appear in browse again and you could match with them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              try {
                setUnblockingId(user.id);
                await api.delete(`/blocks/${user.id}`);
                setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to unblock');
              } finally {
                setUnblockingId(null);
              }
            },
          },
        ]
      );
    },
    []
  );

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#c026d3']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🚫</Text>
          <Text style={styles.headerTitle}>Blocked users</Text>
          <Text style={styles.headerSubtitle}>
            Unblock someone to allow them to appear in browse and potentially match with you again.
          </Text>
        </View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator size="large" color="#fff" style={styles.loader} />
        ) : blockedUsers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {blockedUsers.map((user, index) => (
              <View
                key={user.id}
                style={[
                  styles.row,
                  index === blockedUsers.length - 1 && styles.rowLast,
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {user.displayName || user.email || 'Unknown'}
                  </Text>
                  {user.displayName && user.email ? (
                    <Text style={styles.rowHint} numberOfLines={1}>
                      {user.email}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.unblockButton, unblockingId === user.id && styles.unblockButtonDisabled]}
                  onPress={() => handleUnblock(user)}
                  disabled={unblockingId === user.id}
                  activeOpacity={0.8}
                >
                  {unblockingId === user.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.unblockButtonText}>Unblock</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 48,
    left: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingTop: Platform.OS === 'ios' ? 100 : 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 28,
  },
  headerIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    color: '#fef2f2',
    fontSize: 15,
  },
  loader: {
    marginTop: 40,
  },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flex: 1,
    marginRight: 16,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  rowHint: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  unblockButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#667eea',
  },
  unblockButtonDisabled: {
    opacity: 0.7,
  },
  unblockButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
