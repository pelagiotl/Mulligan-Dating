/**
 * Golf Dates hole prompts — shared question per hole during an IRL golf date.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';

type HolePromptState = {
  matchId: string;
  currentHole: number;
  totalHoles: number;
  prompt: string;
  completed: boolean;
};

type Props = {
  matchId: string;
  headerMode?: boolean;
  onPromptShared?: () => void;
};

export default function GolfHolePrompts({ matchId, headerMode, onPromptShared }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<HolePromptState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<HolePromptState>(`/matches/${matchId}/hole-prompts`, false);
      setState(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load hole prompts';
      Alert.alert('Golf Dates', msg);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const shareCurrent = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const next = await api.post<HolePromptState>(`/matches/${matchId}/hole-prompts/share`, {});
      setState(next);
      onPromptShared?.();
    } catch (e: unknown) {
      Alert.alert('Golf Dates', e instanceof Error ? e.message : 'Failed to share');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!state || state.completed || busy) return;
    setBusy(true);
    try {
      const next = await api.post<HolePromptState>(`/matches/${matchId}/hole-prompts/advance`, {
        shareToChat: true,
      });
      setState(next);
      onPromptShared?.();
    } catch (e: unknown) {
      Alert.alert('Golf Dates', e instanceof Error ? e.message : 'Failed to advance');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.85}
        style={headerMode ? styles.headerBtn : styles.btn}
        accessibilityLabel="Golf hole prompts"
      >
        <Text style={headerMode ? styles.headerBtnText : styles.btnText}>⛳</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <LinearGradient colors={['#0f766e', '#115e59', '#134e4a']} style={styles.cardHeader}>
              <Text style={styles.cardEyebrow}>Golf Date</Text>
              <Text style={styles.cardTitle}>Hole prompts</Text>
              <Text style={styles.cardSub}>
                Same question for both of you at each hole — learn more as you play.
              </Text>
            </LinearGradient>

            <View style={styles.body}>
              {loading || !state ? (
                <ActivityIndicator color="#0f766e" />
              ) : (
                <>
                  <Text style={styles.holeLabel}>
                    Hole {state.currentHole} of {state.totalHoles}
                  </Text>
                  <Text style={styles.prompt}>{state.prompt}</Text>
                  {state.completed ? (
                    <Text style={styles.done}>
                      Round complete — nice work. Use post-date reflection when you’re ready.
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.actions}>
              {!state?.completed ? (
                <>
                  <TouchableOpacity
                    style={[styles.primary, busy && styles.disabled]}
                    disabled={busy || loading || !state}
                    onPress={() => void shareCurrent()}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Share this hole to chat</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.next, busy && styles.disabled]}
                    disabled={busy || loading || !state}
                    onPress={() => void advance()}
                  >
                    <Text style={styles.nextText}>Next hole</Text>
                  </TouchableOpacity>
                </>
              ) : null}
              <TouchableOpacity style={styles.secondary} onPress={() => setVisible(false)}>
                <Text style={styles.secondaryText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 118, 110, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 18 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  btnText: { color: '#fff', fontWeight: '700' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  cardHeader: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18 },
  cardEyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 },
  cardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 8, lineHeight: 20 },
  body: { paddingHorizontal: 20, paddingVertical: 20, minHeight: 120 },
  holeLabel: { fontSize: 13, fontWeight: '700', color: '#0f766e', marginBottom: 10 },
  prompt: { fontSize: 18, lineHeight: 26, color: '#1a1a2e', fontWeight: '600' },
  done: { marginTop: 14, fontSize: 14, color: '#475569', lineHeight: 20 },
  actions: { paddingHorizontal: 20, gap: 10 },
  primary: {
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  next: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0f766e',
  },
  nextText: { color: '#0f766e', fontWeight: '700', fontSize: 15 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#64748b', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.7 },
});
