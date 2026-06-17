import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../utils/api';

type SecondDateChoice = 'yes' | 'no' | 'maybe';

type Props = {
  visible: boolean;
  matchId: string;
  partnerName: string;
  onClose: () => void;
  onSubmitted?: (mutualSecondDate: boolean) => void;
};

const CHOICES: { id: SecondDateChoice; label: string; emoji: string }[] = [
  { id: 'yes', label: 'Yes', emoji: '❤️' },
  { id: 'maybe', label: 'Maybe', emoji: '🤔' },
  { id: 'no', label: 'No', emoji: '🙏' },
];

export default function DateReflectionModal({
  visible,
  matchId,
  partnerName,
  onClose,
  onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets();
  const [wentWell, setWentWell] = useState('');
  const [secondDate, setSecondDate] = useState<SecondDateChoice | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !matchId) return;
    setLoading(true);
    api
      .get<{ mine: { wentWell: string; secondDateInterest: SecondDateChoice; extraNotes?: string } | null }>(
        `/date-reflections/${matchId}`,
        false,
      )
      .then((data) => {
        if (data.mine) {
          setWentWell(data.mine.wentWell);
          setSecondDate(data.mine.secondDateInterest);
          setExtraNotes(data.mine.extraNotes ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, matchId]);

  const submit = useCallback(async () => {
    if (!wentWell.trim()) {
      Alert.alert('Almost there', 'Share a quick note about what went well.');
      return;
    }
    if (!secondDate) {
      Alert.alert('One more thing', 'Let us know if you\'d like a second date.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ mutualSecondDate: boolean }>('/date-reflections', {
        matchId,
        wentWell: wentWell.trim(),
        secondDateInterest: secondDate,
        extraNotes: extraNotes.trim() || undefined,
      });
      onSubmitted?.(!!result.mutualSecondDate);
      if (result.mutualSecondDate) {
        Alert.alert(
          'Great news! ❤️',
          `${partnerName} also wants a second date. Ready to plan the next one?`,
        );
      } else {
        Alert.alert('Saved', 'Your reflection is private — only you can see it.');
      }
      onClose();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save reflection');
    } finally {
      setSubmitting(false);
    }
  }, [wentWell, secondDate, extraNotes, matchId, partnerName, onClose, onSubmitted]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <LinearGradient colors={['#667eea', '#764ba2', '#a855f7']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>We went on a date</Text>
          <Text style={styles.headerSub}>Private reflection with {partnerName}</Text>
        </LinearGradient>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#764ba2" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>What went well?</Text>
            <TextInput
              style={styles.input}
              value={wentWell}
              onChangeText={setWentWell}
              placeholder="A moment, vibe, or connection that stood out…"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
            />

            <Text style={styles.label}>Would you like a second date?</Text>
            <View style={styles.choiceRow}>
              {CHOICES.map((c) => {
                const selected = secondDate === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.choice, selected && styles.choiceSelected]}
                    onPress={() => setSecondDate(c.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.choiceEmoji}>{c.emoji}</Text>
                    <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Extra notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputShort]}
              value={extraNotes}
              onChangeText={setExtraNotes}
              placeholder="Anything else you want to remember…"
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={300}
            />

            <Text style={styles.privacy}>
              Only you see your answers. If you both pick Yes or Maybe, we'll let you both know — nothing
              else is shared.
            </Text>

            <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
              <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} style={styles.submitGrad}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Save reflection</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9ff' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 8 },
  headerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, marginTop: 4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 32 },
  label: { fontSize: 15, fontWeight: '700', color: '#1e1b4b', marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.25)',
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputShort: { minHeight: 72 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  choice: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  choiceSelected: {
    borderColor: '#764ba2',
    backgroundColor: 'rgba(118, 75, 162, 0.08)',
  },
  choiceEmoji: { fontSize: 22, marginBottom: 4 },
  choiceLabel: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  choiceLabelSelected: { color: '#5b21b6' },
  privacy: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  submitBtn: { borderRadius: 999, overflow: 'hidden' },
  submitGrad: {
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
