/**
 * In-chat Golf Date invitation card — richer than a plain text bubble.
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import DayTimePickerModal from './DayTimePickerModal';
import { dateToDatetimeLocal, datetimeLocalToDate } from '../utils/datetimeLocal';

export type GolfDatePlanMessageSnapshot = {
  id: string;
  courseId: string;
  courseName: string;
  courseCity: string;
  bookingUrl: string;
  holes?: '9' | '18' | 'both';
  difficulty?: 'easy' | 'moderate' | 'challenging';
  bestForFirstDate?: boolean;
  proposedAt?: string | null;
  notes: {
    balls?: boolean;
    tees?: boolean;
    snacks?: boolean;
    other?: string;
  };
  status?: string;
  createdBy?: string;
};

function formatWhen(iso?: string | null): string {
  if (!iso) return 'Time TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Time TBD';
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function firstNamePossessive(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || 'They';
  return /s$/i.test(first) ? `${first}'` : `${first}'s`;
}

function holesLabel(h?: GolfDatePlanMessageSnapshot['holes']): string | null {
  if (h === '9') return '9️⃣ 9 holes';
  if (h === '18') return '🏌️ 18 holes';
  if (h === 'both') return '🔁 9 or 18';
  return null;
}

function difficultyLabel(d?: GolfDatePlanMessageSnapshot['difficulty']): string | null {
  if (d === 'easy') return '🌱 Easygoing';
  if (d === 'moderate') return '⚖️ Moderate';
  if (d === 'challenging') return '🔥 Challenging';
  return null;
}

function bringingChips(notes: GolfDatePlanMessageSnapshot['notes']): string[] {
  const chips: string[] = [];
  if (notes.balls) chips.push('⚪ Balls');
  if (notes.tees) chips.push('🪵 Tees');
  if (notes.snacks) chips.push('🥤 Snacks');
  if (notes.other?.trim()) chips.push(`✨ ${notes.other.trim()}`);
  return chips;
}

export default function GolfDatePlanMessageCard({
  plan,
  proposerName,
  matchId,
  currentUserId,
  isOwnInvite,
  onPlanUpdated,
}: {
  plan: GolfDatePlanMessageSnapshot;
  proposerName: string;
  matchId?: string;
  currentUserId?: string | null;
  /** True when the viewer sent this invite (they cannot retune their own proposal here). */
  isOwnInvite?: boolean;
  onPlanUpdated?: (next: GolfDatePlanMessageSnapshot) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const holes = holesLabel(plan.holes);
  const difficulty = difficultyLabel(plan.difficulty);
  const bringing = bringingChips(plan.notes);
  const bringingTitle = `🎒 ${firstNamePossessive(proposerName)} bringing`;

  const canAdjustDate = Boolean(
    matchId &&
      currentUserId &&
      (isOwnInvite === false ||
        (plan.createdBy != null && plan.createdBy !== currentUserId)),
  );

  const pickerValue = useMemo(() => {
    if (plan.proposedAt) {
      const d = new Date(plan.proposedAt);
      if (!Number.isNaN(d.getTime())) return dateToDatetimeLocal(d);
    }
    return dateToDatetimeLocal(new Date());
  }, [plan.proposedAt]);

  const openBooking = () => {
    void Linking.openURL(plan.bookingUrl).catch(() => {
      Alert.alert('Golf Date', 'Could not open booking link');
    });
  };

  const submitNewTime = async (value: string) => {
    if (!matchId || saving) return;
    setSaving(true);
    try {
      const data = await api.put<{
        golfDatePlan?: GolfDatePlanMessageSnapshot;
      }>(`/golf/date-plans/${matchId}/${plan.id}`, {
        proposedAt: datetimeLocalToDate(value).toISOString(),
      });
      setPickerOpen(false);
      if (data.golfDatePlan) {
        onPlanUpdated?.(data.golfDatePlan);
      }
    } catch (e) {
      Alert.alert('Golf Date', e instanceof Error ? e.message : 'Could not update tee time');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#0f766e', '#0d9488', '#134e4a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroGlow} />
        <Text style={styles.heroEyebrow}>GOLF DATE INVITE</Text>
        <Text style={styles.heroTitle}>You're invited ⛳</Text>
        <Text style={styles.heroSub}>{proposerName} proposed a round</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.courseName}>{plan.courseName}</Text>
        <Text style={styles.courseCity}>📍 {plan.courseCity}</Text>

        {canAdjustDate ? (
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.85}
            style={styles.whenBtn}
            disabled={saving}
            accessibilityLabel="Suggest a different tee time"
            accessibilityHint="Opens a date and time picker"
          >
            <Text style={styles.when}>📅 {formatWhen(plan.proposedAt)}</Text>
            <Text style={styles.whenHint}>{saving ? 'Saving…' : 'Tap to suggest a new time'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.when}>📅 {formatWhen(plan.proposedAt)}</Text>
        )}

        {(holes || difficulty || plan.bestForFirstDate) && (
          <View style={styles.metaRow}>
            {plan.bestForFirstDate ? (
              <View style={[styles.metaChip, styles.metaFirst]}>
                <Text style={styles.metaChipText}>⭐ First-date friendly</Text>
              </View>
            ) : null}
            {difficulty ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{difficulty}</Text>
              </View>
            ) : null}
            {holes ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{holes}</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.bringingLabel}>{bringingTitle}</Text>
        {bringing.length > 0 ? (
          <View style={styles.metaRow}>
            {bringing.map((chip) => (
              <View key={chip} style={[styles.metaChip, styles.metaBring]}>
                <Text style={styles.metaChipText}>{chip}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.bringingTbd}>TBD — talk it out in chat</Text>
        )}

        <TouchableOpacity onPress={openBooking} style={styles.bookBtn} activeOpacity={0.88}>
          <LinearGradient
            colors={['#0f766e', '#14b8a6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bookGrad}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bookBtnText}>📅 Book Tee Time</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <DayTimePickerModal
        visible={pickerOpen}
        value={pickerValue}
        title="Suggest a new tee time"
        onCancel={() => setPickerOpen(false)}
        onConfirm={(value) => {
          void submitNewTime(value);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.28)',
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
    maxWidth: 320,
    width: '100%',
  },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    minHeight: 108,
    justifyContent: 'flex-end',
  },
  heroGlow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  body: {
    padding: 14,
    paddingTop: 12,
    gap: 6,
  },
  courseName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#134e4a',
    lineHeight: 22,
  },
  courseCity: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  whenBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingVertical: 4,
    paddingRight: 8,
  },
  when: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f766e',
    marginTop: 2,
  },
  whenHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: '#14b8a6',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaChip: {
    backgroundColor: '#f0fdfa',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.18)',
  },
  metaFirst: {
    backgroundColor: '#ecfdf5',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  metaBring: {
    backgroundColor: '#fff7ed',
    borderColor: 'rgba(251, 146, 60, 0.28)',
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  bringingLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.2,
  },
  bringingTbd: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  bookBtn: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookGrad: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
