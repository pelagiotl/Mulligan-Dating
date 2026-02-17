import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';

export default function PushNotificationSettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushNotifyMatches, setPushNotifyMatches] = useState(true);
  const [pushNotifyMessages, setPushNotifyMessages] = useState(true);
  const [error, setError] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      setError('');
      const data = await api.get<{ pushNotifyMatches: boolean; pushNotifyMessages: boolean }>(
        '/settings/notification-preferences',
        false
      );
      setPushNotifyMatches(data?.pushNotifyMatches ?? true);
      setPushNotifyMessages(data?.pushNotifyMessages ?? true);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const msg = e?.message ?? '';
      if (status === 404 || /route not found|not found/i.test(msg)) {
        setError('This feature requires a backend update. Deploy your backend (e.g. push to Render) and try again.');
      } else {
        setError(msg || 'Failed to load preferences');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const savePrefs = useCallback(async (matches: boolean, messages: boolean) => {
    try {
      setSaving(true);
      setError('');
      setSavedFeedback(false);
      await api.put('/settings/notification-preferences', {
        pushNotifyMatches: matches,
        pushNotifyMessages: messages,
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const msg = e?.message ?? '';
      if (status === 404 || /route not found|not found/i.test(msg)) {
        setError('Backend not updated. Deploy your backend (e.g. push to Render) to save preferences.');
      } else {
        setError(msg || 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const handleMatchesChange = useCallback(
    (value: boolean) => {
      setPushNotifyMatches(value);
      savePrefs(value, pushNotifyMessages);
    },
    [pushNotifyMessages, savePrefs]
  );

  const handleMessagesChange = useCallback(
    (value: boolean) => {
      setPushNotifyMessages(value);
      savePrefs(pushNotifyMatches, value);
    },
    [pushNotifyMatches, savePrefs]
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
          <Text style={styles.headerIcon}>🔔</Text>
          <Text style={styles.headerTitle}>Push notifications</Text>
          <Text style={styles.headerSubtitle}>
            Choose when to get notified on your device
          </Text>
        </View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        ) : null}
        {savedFeedback ? (
          <View style={styles.savedBox}>
            <Text style={styles.savedText}>✓ Saved — applies to outside-app notifications immediately</Text>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator size="large" color="#fff" style={styles.loader} />
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowLabel}>New matches</Text>
                <Text style={styles.rowHint}>When someone likes you back</Text>
              </View>
              <Switch
                value={pushNotifyMatches}
                onValueChange={handleMatchesChange}
                disabled={saving}
                trackColor={{ false: '#cbd5e1', true: '#a78bfa' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowLabel}>New messages</Text>
                <Text style={styles.rowHint}>When you receive a chat message</Text>
              </View>
              <Switch
                value={pushNotifyMessages}
                onValueChange={handleMessagesChange}
                disabled={saving}
                trackColor={{ false: '#cbd5e1', true: '#a78bfa' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>
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
  savedBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  savedText: {
    color: '#ecfdf5',
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
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
    paddingVertical: 12,
  },
  rowLeft: {
    flex: 1,
    marginRight: 16,
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
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
});
