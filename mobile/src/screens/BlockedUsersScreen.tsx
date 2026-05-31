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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import UnblockConfirmModal from '../components/UnblockConfirmModal';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';

interface BlockedUser {
  id: string;
  displayName: string | null;
  email: string;
  phoneDisplay: string | null;
  phoneNational10: string | null;
  blockedAt: string;
}

interface BlockedPhone {
  id: string;
  phoneNational10: string;
  phoneDisplay: string;
  blockedAt: string;
}

type UnblockPending =
  | { variant: 'user'; user: BlockedUser; label: string }
  | { variant: 'phone'; entry: BlockedPhone; label: string };

export default function BlockedUsersScreen() {
  const navigation = useNavigation();
  const { mode: connectShellMode } = useConnectShellTheme();
  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedPhoneNumbers, setBlockedPhoneNumbers] = useState<BlockedPhone[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [blockingPhone, setBlockingPhone] = useState(false);

  const fetchBlocked = useCallback(async () => {
    try {
      setError('');
      const data = await api.get<{
        blockedUsers: BlockedUser[];
        blockedPhoneNumbers: BlockedPhone[];
      }>('/blocks', false);
      setBlockedUsers(data?.blockedUsers ?? []);
      setBlockedPhoneNumbers(data?.blockedPhoneNumbers ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load blocked users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleBlockPhone = useCallback(async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      Alert.alert('Phone required', 'Enter a phone number to block.');
      return;
    }
    setBlockingPhone(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.post<{
        message: string;
        alreadyBlocked?: boolean;
      }>('/blocks/by-phone', { phoneNumber: trimmed });
      setPhoneInput('');
      setSuccess(result?.message || 'Number blocked.');
      await fetchBlocked();
    } catch (e: any) {
      setError(e?.message || 'Failed to block phone number');
    } finally {
      setBlockingPhone(false);
    }
  }, [phoneInput, fetchBlocked]);

  const handleUnblockUser = useCallback((user: BlockedUser) => {
    const label = user.displayName || user.phoneDisplay || user.email || 'this user';
    setUnblockPending({ variant: 'user', user, label });
  }, []);

  const handleUnblockPhone = useCallback((entry: BlockedPhone) => {
    setUnblockPending({ variant: 'phone', entry, label: entry.phoneDisplay });
  }, []);

  const confirmUnblock = useCallback(async () => {
    if (!unblockPending || unblockingId) return;
    try {
      if (unblockPending.variant === 'user') {
        const { user } = unblockPending;
        setUnblockingId(user.id);
        if (user.phoneNational10) {
          await api.delete(`/blocks/by-phone/${encodeURIComponent(user.phoneNational10)}`);
        } else {
          await api.delete(`/blocks/${user.id}`);
        }
        setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
        setBlockedPhoneNumbers((prev) =>
          prev.filter((p) => p.phoneNational10 !== user.phoneNational10)
        );
        setSuccess('Unblocked.');
      } else {
        const { entry } = unblockPending;
        setUnblockingId(entry.id);
        await api.delete(`/blocks/by-phone/${encodeURIComponent(entry.phoneNational10)}`);
        setBlockedPhoneNumbers((prev) => prev.filter((p) => p.id !== entry.id));
        setSuccess('Number unblocked.');
      }
      setUnblockPending(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to unblock');
    } finally {
      setUnblockingId(null);
    }
  }, [unblockPending, unblockingId]);

  const hasAnyBlocks = blockedUsers.length > 0 || blockedPhoneNumbers.length > 0;

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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🚫</Text>
          <Text style={styles.headerTitle}>Block list</Text>
          <Text style={styles.headerSubtitle}>
            Add phone numbers of people you do not want to match with. They will not appear in browse,
            and you cannot Connect with them. Works even if they have not signed up yet.
          </Text>
        </View>

        <View style={styles.addCard}>
          <Text style={styles.addLabel}>Block a phone number</Text>
          <TextInput
            style={styles.phoneInput}
            value={phoneInput}
            onChangeText={setPhoneInput}
            placeholder="e.g. 541-555-1234"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <TouchableOpacity
            style={[styles.blockButton, blockingPhone && styles.blockButtonDisabled]}
            onPress={() => void handleBlockPhone()}
            disabled={blockingPhone}
            activeOpacity={0.85}
          >
            {blockingPhone ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.blockButtonText}>Block number</Text>
            )}
          </TouchableOpacity>
        </View>

        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color="#fff" style={styles.loader} />
        ) : !hasAnyBlocks ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No blocked numbers yet.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {blockedUsers.map((user, index) => (
              <View
                key={`user-${user.id}`}
                style={[
                  styles.row,
                  index < blockedUsers.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {user.displayName || user.phoneDisplay || user.email || 'Unknown'}
                  </Text>
                  {user.phoneDisplay && user.displayName ? (
                    <Text style={styles.rowHint} numberOfLines={1}>
                      {user.phoneDisplay}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={[styles.unblockButton, unblockingId === user.id && styles.unblockButtonDisabled]}
                  onPress={() => handleUnblockUser(user)}
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
            {blockedPhoneNumbers.map((entry, index) => (
              <View
                key={`phone-${entry.id}`}
                style={[
                  styles.row,
                  index < blockedPhoneNumbers.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {entry.phoneDisplay}
                  </Text>
                  <Text style={styles.rowHint}>Not on Mulligan yet</Text>
                </View>
                <TouchableOpacity
                  style={[styles.unblockButton, unblockingId === entry.id && styles.unblockButtonDisabled]}
                  onPress={() => handleUnblockPhone(entry)}
                  disabled={unblockingId === entry.id}
                  activeOpacity={0.8}
                >
                  {unblockingId === entry.id ? (
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

      <UnblockConfirmModal
        visible={unblockPending != null}
        label={unblockPending?.label ?? ''}
        variant={unblockPending?.variant ?? 'user'}
        connectShell={connectShellMode}
        unblocking={unblockingId != null}
        onCancel={() => {
          if (!unblockingId) setUnblockPending(null);
        }}
        onConfirm={() => void confirmUnblock()}
      />
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
    marginBottom: 20,
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
    lineHeight: 22,
  },
  addCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  addLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 10,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#1a1a2e',
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  blockButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  blockButtonDisabled: {
    opacity: 0.7,
  },
  blockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  successText: {
    color: '#ecfdf5',
    fontSize: 15,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
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
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
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
    backgroundColor: '#64748b',
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
