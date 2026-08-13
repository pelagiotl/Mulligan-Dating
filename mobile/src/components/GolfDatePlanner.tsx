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

type Props = {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  partnerName: string;
  onPlanSent?: () => void;
};

function difficultyLabel(d: MedfordGolfCourse['difficulty']) {
  if (d === 'easy') return 'Easygoing';
  if (d === 'challenging') return 'Challenging';
  return 'Moderate';
}

function holesLabel(h: MedfordGolfCourse['holes']) {
  if (h === 'both') return '9 or 18';
  return `${h} holes`;
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
          {(['course', 'when', 'bringing', 'confirm'] as Step[]).map((s, i) => (
            <View key={s} style={[styles.stepDot, step === s && styles.stepDotOn]}>
              <Text style={[styles.stepDotText, step === s && styles.stepDotTextOn]}>{i + 1}</Text>
            </View>
          ))}
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
              <Text style={styles.sectionHint}>Curated Medford-area publics & semi-publics.</Text>
              {courses.map((c) => {
                const on = courseId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.88}
                    onPress={() => setCourseId(c.id)}
                    style={[styles.courseCard, on && styles.courseCardOn]}
                  >
                    <View style={styles.courseTop}>
                      <Text style={styles.courseName}>{c.name}</Text>
                      {c.bestForFirstDate ? (
                        <View style={styles.firstDateBadge}>
                          <Text style={styles.firstDateBadgeText}>Best for first dates</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.courseMeta}>
                      {c.city} · {holesLabel(c.holes)} · {difficultyLabel(c.difficulty)}
                    </Text>
                    <Text style={styles.courseNote}>{c.note}</Text>
                    <TouchableOpacity
                      onPress={() => openBooking(c.bookingUrl)}
                      style={styles.bookBtn}
                    >
                      <Text style={styles.bookBtnText}>Book Tee Time</Text>
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
                <Text style={styles.summaryMeta}>
                  {formatFriendlyDatetime(proposedAt)}
                </Text>
                <Text style={styles.summaryMeta}>
                  Bringing:{' '}
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
                  <Text style={styles.bookBtnText}>Book Tee Time</Text>
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
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: '#0f766e' },
  stepDotText: { color: '#64748b', fontWeight: '800', fontSize: 12 },
  stepDotTextOn: { color: '#fff' },
  body: { paddingHorizontal: 18, paddingTop: 8 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sectionHint: { color: '#64748b', fontSize: 13, marginBottom: 4 },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  courseName: { fontSize: 16, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  firstDateBadge: {
    backgroundColor: '#ccfbf1',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  firstDateBadgeText: { color: '#0f766e', fontSize: 11, fontWeight: '700' },
  courseMeta: { color: '#475569', fontSize: 13, fontWeight: '600' },
  courseNote: { color: '#64748b', fontSize: 12, marginTop: 4 },
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
