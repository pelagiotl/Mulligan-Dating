/**
 * In-chat Plan Golf Date flow: course → day/time → who's bringing what → confirm.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import DayTimePickerModal from './DayTimePickerModal';
import {
  defaultDatetimeLocal,
  formatFriendlyDatetime,
  datetimeLocalToDate,
} from '../utils/datetimeLocal';

export type MedfordGolfCourse = {
  id: string;
  name: string;
  city: string;
  holes: '9' | '18' | 'both';
  difficulty: 'easy' | 'moderate' | 'challenging';
  bestForFirstDate: boolean;
  bookingUrl: string;
  note: string;
  phone?: string;
};

type Step = 'course' | 'when' | 'bringing' | 'confirm';

const STEPS: { id: Step; emoji: string; label: string }[] = [
  { id: 'course', emoji: '⛳', label: 'Course' },
  { id: 'when', emoji: '📅', label: 'When' },
  { id: 'bringing', emoji: '🎒', label: 'Bring' },
  { id: 'confirm', emoji: '✓', label: 'Confirm' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  partnerName: string;
  onPlanSent?: () => void;
};

function difficultyMeta(d: MedfordGolfCourse['difficulty']): {
  emoji: string;
  label: string;
  tone: 'easy' | 'moderate' | 'challenging';
} {
  if (d === 'easy') return { emoji: '🌱', label: 'Easygoing', tone: 'easy' };
  if (d === 'challenging') return { emoji: '🔥', label: 'Challenging', tone: 'challenging' };
  return { emoji: '⚖️', label: 'Moderate', tone: 'moderate' };
}

function holesMeta(h: MedfordGolfCourse['holes']): { emoji: string; label: string } {
  if (h === 'both') return { emoji: '🔁', label: '9 or 18' };
  if (h === '9') return { emoji: '9️⃣', label: '9 holes' };
  return { emoji: '🏌️', label: '18 holes' };
}

export default function GolfDatePlanner({
  visible,
  onClose,
  matchId,
  partnerName,
  onPlanSent,
}: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('course');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<MedfordGolfCourse[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [proposedAt, setProposedAt] = useState<string>(defaultDatetimeLocal());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [balls, setBalls] = useState(true);
  const [tees, setTees] = useState(true);
  const [snacks, setSnacks] = useState(false);
  const [other, setOther] = useState('');

  const selected = useMemo(
    () => courses.find((c) => c.id === courseId) || null,
    [courses, courseId],
  );

  const sortedCourses = useMemo(
    () =>
      [...courses].sort((a, b) => {
        if (a.bestForFirstDate === b.bestForFirstDate) return a.name.localeCompare(b.name);
        return a.bestForFirstDate ? -1 : 1;
      }),
    [courses],
  );

  const reset = useCallback(() => {
    setStep('course');
    setCourseId(null);
    setProposedAt(defaultDatetimeLocal());
    setBalls(true);
    setTees(true);
    setSnacks(false);
    setOther('');
  }, []);

  useEffect(() => {
    if (!visible) return;
    reset();
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await api.get<{ courses: MedfordGolfCourse[] }>('/golf/courses', false);
        if (!cancelled) setCourses(data.courses || []);
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            'Golf Date',
            e instanceof Error ? e.message : 'Could not load courses',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, reset]);

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/golf/date-plans/${matchId}`, {
        courseId: selected.id,
        proposedAt: datetimeLocalToDate(proposedAt).toISOString(),
        notes: { balls, tees, snacks, other: other.trim() },
      });
      onPlanSent?.();
      onClose();
      Alert.alert('Golf Date', `Plan shared with ${partnerName}.`);
    } catch (e) {
      Alert.alert('Golf Date', e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setSubmitting(false);
    }
  };

  const openBooking = (url: string) => {
    void Linking.openURL(url).catch(() => {
      Alert.alert('Golf Date', 'Could not open booking link');
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>GOLF DATE</Text>
            <Text style={styles.title}>Plan Golf Date</Text>
            <Text style={styles.sub}>With {partnerName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.steps}>
          {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = STEPS.findIndex((x) => x.id === step) > i;
            return (
              <View key={s.id} style={[styles.stepChip, active && styles.stepChipOn, done && styles.stepChipDone]}>
                <Text style={[styles.stepChipEmoji, active && styles.stepChipEmojiOn]}>
                  {done && !active ? '✓' : s.emoji}
                </Text>
                <Text
                  style={[styles.stepChipLabel, active && styles.stepChipLabelOn, done && styles.stepChipLabelDone]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 80 }]}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color="#0f766e" style={{ marginTop: 40 }} />
          ) : null}

          {step === 'course' && !loading ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choose a course</Text>
              <Text style={styles.sectionHint}>
                ⭐ = great for a first golf date · chips show pace & length
              </Text>
              {sortedCourses.map((c) => {
                const on = courseId === c.id;
                const difficulty = difficultyMeta(c.difficulty);
                const holes = holesMeta(c.holes);
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.88}
                    onPress={() => setCourseId(c.id)}
                    style={[styles.courseCard, on && styles.courseCardOn]}
                  >
                    <View style={styles.courseTop}>
                      <Text style={styles.courseName}>{c.name}</Text>
                      {on ? <Text style={styles.courseSelectedMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.courseCity}>{c.city}</Text>
                    <View style={styles.chipRow}>
                      {c.bestForFirstDate ? (
                        <View style={[styles.metaChip, styles.metaChipFirst]}>
                          <Text style={styles.metaChipText}>⭐ Best for first dates</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.metaChip,
                          difficulty.tone === 'easy'
                            ? styles.metaChip_easy
                            : difficulty.tone === 'challenging'
                              ? styles.metaChip_challenging
                              : styles.metaChip_moderate,
                        ]}
                      >
                        <Text style={styles.metaChipText}>
                          {difficulty.emoji} {difficulty.label}
                        </Text>
                      </View>
                      <View style={[styles.metaChip, styles.metaChipHoles]}>
                        <Text style={styles.metaChipText}>
                          {holes.emoji} {holes.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.courseNote}>{c.note}</Text>
                    <TouchableOpacity
                      onPress={() => openBooking(c.bookingUrl)}
                      style={styles.bookBtn}
                    >
                      <Text style={styles.bookBtnText}>📅 Book Tee Time</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {step === 'when' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggest a day & time</Text>
              <TouchableOpacity
                style={styles.whenBtn}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.whenBtnText}>
                  {formatFriendlyDatetime(proposedAt)}
                </Text>
              </TouchableOpacity>
              <Text style={styles.sectionHint}>
                You can still confirm details in chat after sharing.
              </Text>
            </View>
          ) : null}

          {step === 'bringing' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Who’s bringing what?</Text>
              {(
                [
                  ['balls', balls, setBalls, 'Extra balls'],
                  ['tees', tees, setTees, 'Tees'],
                  ['snacks', snacks, setSnacks, 'Snacks / drinks'],
                ] as const
              ).map(([key, val, setVal, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.checkRow, val && styles.checkRowOn]}
                  onPress={() => setVal(!val)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.checkMark}>{val ? '✓' : ''}</Text>
                  <Text style={styles.checkLabel}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.otherInput}
                value={other}
                onChangeText={setOther}
                placeholder="Anything else? (sunscreen, range balls…)"
                placeholderTextColor="#94a3b8"
                maxLength={200}
              />
            </View>
          ) : null}

          {step === 'confirm' && selected ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Confirm plan</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLine}>{selected.name}</Text>
                {(() => {
                  const difficulty = difficultyMeta(selected.difficulty);
                  return (
                    <View style={[styles.chipRow, { marginTop: 8 }]}>
                      {selected.bestForFirstDate ? (
                        <View style={[styles.metaChip, styles.metaChipFirst]}>
                          <Text style={styles.metaChipText}>⭐ First-date friendly</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.metaChip,
                          difficulty.tone === 'easy'
                            ? styles.metaChip_easy
                            : difficulty.tone === 'challenging'
                              ? styles.metaChip_challenging
                              : styles.metaChip_moderate,
                        ]}
                      >
                        <Text style={styles.metaChipText}>
                          {difficulty.emoji} {difficulty.label}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
                <Text style={styles.summaryMeta}>
                  📅 {formatFriendlyDatetime(proposedAt)}
                </Text>
                <Text style={styles.summaryMeta}>
                  🎒 Bringing:{' '}
                  {[
                    balls ? 'balls' : null,
                    tees ? 'tees' : null,
                    snacks ? 'snacks' : null,
                    other.trim() || null,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'TBD'}
                </Text>
                <TouchableOpacity
                  onPress={() => openBooking(selected.bookingUrl)}
                  style={[styles.bookBtn, { marginTop: 12 }]}
                >
                  <Text style={styles.bookBtnText}>📅 Book Tee Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {step !== 'course' ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                if (step === 'when') setStep('course');
                else if (step === 'bringing') setStep('when');
                else setStep('bringing');
              }}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <TouchableOpacity
            activeOpacity={0.9}
            disabled={
              submitting ||
              (step === 'course' && !courseId) ||
              (step === 'confirm' && !selected)
            }
            onPress={() => {
              if (step === 'course') setStep('when');
              else if (step === 'when') setStep('bringing');
              else if (step === 'bringing') setStep('confirm');
              else void submit();
            }}
            style={[
              styles.primaryWrap,
              ((step === 'course' && !courseId) || submitting) && styles.disabled,
            ]}
          >
            <LinearGradient
              colors={['#0f766e', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryGrad}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {step === 'confirm' ? 'Share plan' : 'Continue'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      <DayTimePickerModal
        visible={pickerOpen}
        value={proposedAt}
        title="Suggest tee time"
        onCancel={() => setPickerOpen(false)}
        onConfirm={(value) => {
          setProposedAt(value);
          setPickerOpen(false);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  sub: { color: '#64748b', fontSize: 14, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#334155', fontWeight: '700' },
  steps: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  stepChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 1,
  },
  stepChipOn: {
    backgroundColor: '#0f766e',
  },
  stepChipDone: {
    backgroundColor: '#ccfbf1',
  },
  stepChipEmoji: {
    fontSize: 13,
    color: '#64748b',
  },
  stepChipEmojiOn: {
    color: '#fff',
  },
  stepChipLabel: {
    color: '#64748b',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.1,
  },
  stepChipLabelOn: {
    color: '#fff',
  },
  stepChipLabelDone: {
    color: '#0f766e',
  },
  body: { paddingHorizontal: 18, paddingTop: 8 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sectionHint: { color: '#64748b', fontSize: 13, marginBottom: 4, lineHeight: 18 },
  courseCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  courseCardOn: {
    borderColor: '#0f766e',
    backgroundColor: '#f0fdfa',
  },
  courseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  courseName: { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },
  courseSelectedMark: {
    color: '#0f766e',
    fontWeight: '900',
    fontSize: 16,
  },
  courseCity: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
  },
  metaChipFirst: {
    backgroundColor: '#fef3c7',
  },
  metaChip_easy: {
    backgroundColor: '#d1fae5',
  },
  metaChip_moderate: {
    backgroundColor: '#e0e7ff',
  },
  metaChip_challenging: {
    backgroundColor: '#ffe4e6',
  },
  metaChipHoles: {
    backgroundColor: '#ecfeff',
  },
  metaChipText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '700',
  },
  courseNote: { color: '#64748b', fontSize: 12, marginTop: 8 },
  bookBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bookBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  whenBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    padding: 16,
  },
  whenBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  checkRowOn: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' },
  checkMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#0f766e',
    color: '#fff',
    textAlign: 'center',
    overflow: 'hidden',
    fontWeight: '800',
    lineHeight: 22,
  },
  checkLabel: { color: '#0f172a', fontWeight: '700', fontSize: 15 },
  otherInput: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#0f172a',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  summaryLine: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  summaryMeta: { marginTop: 6, color: '#475569', fontSize: 14, fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#334155', fontWeight: '800' },
  primaryWrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  primaryGrad: { paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
