import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../utils/api';

type SecondDateChoice = 'yes' | 'no' | 'maybe';

export type DateReflectionShared = {
  wentWell: string;
  secondDateInterest: SecondDateChoice;
  extraNotes: string | null;
};

type Props = {
  visible: boolean;
  matchId: string;
  partnerName: string;
  viewerName?: string;
  onClose: () => void;
  onSubmitted?: (mutualSecondDate: boolean) => void;
  onPlanDate2?: () => void;
};

const CHOICES: { id: SecondDateChoice; label: string; emoji: string }[] = [
  { id: 'yes', label: 'Yes', emoji: '❤️' },
  { id: 'maybe', label: 'Maybe', emoji: '🤔' },
  { id: 'no', label: 'No', emoji: '🙏' },
];

type ModalPhase = 'form' | 'saved' | 'mutual_reveal';

function secondDateLabel(interest: SecondDateChoice): string {
  if (interest === 'yes') return 'Yes — wants another date ❤️';
  if (interest === 'maybe') return 'Maybe — open to another date 🤔';
  return 'No';
}

function ReflectionSavedCard({
  partnerName,
  wantsAnotherDate,
  onDone,
}: {
  partnerName: string;
  wantsAnotherDate: boolean;
  onDone: () => void;
}) {
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const partnerFirst = partnerName.split(' ')[0] || partnerName;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardScale]);

  return (
    <View style={successStyles.wrap}>
      <LinearGradient
        colors={['#eef2ff', '#f5f3ff', '#fdf2f8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[successStyles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <LinearGradient
          colors={['#667eea', '#a855f7', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={successStyles.accent}
        />
        <View style={successStyles.iconRing}>
          <LinearGradient colors={['#667eea', '#764ba2', '#f093fb']} style={successStyles.iconGrad}>
            <Text style={successStyles.iconEmoji}>🔒</Text>
          </LinearGradient>
        </View>
        <Text style={successStyles.title}>Reflection saved</Text>
        <Text style={successStyles.lead}>
          Your notes are private — only you can see them right now.
        </Text>
        {wantsAnotherDate ? (
          <View style={successStyles.noteCard}>
            <Text style={successStyles.noteEmoji}>💫</Text>
            <Text style={successStyles.noteText}>
              If {partnerFirst} also wants another date, you'll each be able to see what the other shared.
            </Text>
          </View>
        ) : (
          <View style={successStyles.noteCard}>
            <Text style={successStyles.noteEmoji}>🤍</Text>
            <Text style={successStyles.noteText}>
              Your reflection stays with you — {partnerFirst} won't see your notes.
            </Text>
          </View>
        )}
        <TouchableOpacity style={successStyles.doneBtn} onPress={onDone} activeOpacity={0.88}>
          <LinearGradient colors={['#667eea', '#764ba2', '#a855f7']} style={successStyles.doneGrad}>
            <Text style={successStyles.doneText}>Done</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function ReflectionBlock({
  label,
  reflection,
  accent,
}: {
  label: string;
  reflection: DateReflectionShared;
  accent: 'mine' | 'partner';
}) {
  return (
    <View style={[revealStyles.block, accent === 'partner' ? revealStyles.blockPartner : revealStyles.blockMine]}>
      <Text style={revealStyles.blockLabel}>{label}</Text>
      <Text style={revealStyles.interest}>{secondDateLabel(reflection.secondDateInterest)}</Text>
      <Text style={revealStyles.sectionTitle}>What went well</Text>
      <Text style={revealStyles.body}>{reflection.wentWell}</Text>
      {reflection.extraNotes?.trim() ? (
        <>
          <Text style={revealStyles.sectionTitle}>Extra notes</Text>
          <Text style={revealStyles.body}>{reflection.extraNotes.trim()}</Text>
        </>
      ) : null}
    </View>
  );
}

function MutualRevealView({
  partnerName,
  viewerName,
  mine,
  partner,
  onPlanDate2,
  onDone,
}: {
  partnerName: string;
  viewerName: string;
  mine: DateReflectionShared;
  partner: DateReflectionShared;
  onPlanDate2?: () => void;
  onDone: () => void;
}) {
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const partnerFirst = partnerName.split(' ')[0] || partnerName;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardScale]);

  return (
    <View style={revealStyles.wrap}>
      <LinearGradient
        colors={['#fff1f2', '#fdf2f8', '#ede9fe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[revealStyles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <LinearGradient
          colors={['#f5576c', '#f093fb', '#667eea']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={revealStyles.accent}
        />
        <Text style={revealStyles.title}>Date 2 ready ✨</Text>
        <Text style={revealStyles.lead}>
          You and {partnerFirst} both want another date. Here is what you each shared.
        </Text>
        <ScrollView style={revealStyles.scroll} contentContainerStyle={revealStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <ReflectionBlock label={`${partnerFirst}'s reflection`} reflection={partner} accent="partner" />
          <ReflectionBlock label={`${viewerName}'s reflection`} reflection={mine} accent="mine" />
        </ScrollView>
        {onPlanDate2 ? (
          <TouchableOpacity style={revealStyles.planBtn} onPress={onPlanDate2} activeOpacity={0.88}>
            <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} style={revealStyles.planGrad}>
              <Text style={revealStyles.planText}>Plan date 2 📅</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={revealStyles.doneBtn} onPress={onDone} activeOpacity={0.88}>
          <Text style={revealStyles.doneText}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function DateReflectionModal({
  visible,
  matchId,
  partnerName,
  viewerName = 'You',
  onClose,
  onSubmitted,
  onPlanDate2,
}: Props) {
  const insets = useSafeAreaInsets();
  const [wentWell, setWentWell] = useState('');
  const [secondDate, setSecondDate] = useState<SecondDateChoice | null>(null);
  const [extraNotes, setExtraNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<ModalPhase>('form');
  const [partnerReflection, setPartnerReflection] = useState<DateReflectionShared | null>(null);
  const [mineReflection, setMineReflection] = useState<DateReflectionShared | null>(null);

  const applyStatus = useCallback(
    (data: {
      mine: { wentWell: string; secondDateInterest: SecondDateChoice; extraNotes?: string | null } | null;
      partner: DateReflectionShared | null;
      mutualSecondDate: boolean;
    }) => {
      if (data.mine) {
        setWentWell(data.mine.wentWell);
        setSecondDate(data.mine.secondDateInterest);
        setExtraNotes(data.mine.extraNotes ?? '');
        setMineReflection({
          wentWell: data.mine.wentWell,
          secondDateInterest: data.mine.secondDateInterest,
          extraNotes: data.mine.extraNotes ?? null,
        });
      }
      if (data.mutualSecondDate && data.partner && data.mine) {
        setPartnerReflection(data.partner);
        setMineReflection({
          wentWell: data.mine.wentWell,
          secondDateInterest: data.mine.secondDateInterest,
          extraNotes: data.mine.extraNotes ?? null,
        });
        setPhase('mutual_reveal');
      } else {
        setPartnerReflection(null);
        setPhase('form');
      }
    },
    [],
  );

  useEffect(() => {
    if (!visible) {
      setPhase('form');
      setPartnerReflection(null);
      setMineReflection(null);
      return;
    }
    if (!matchId) return;
    setLoading(true);
    api
      .get<{
        mine: { wentWell: string; secondDateInterest: SecondDateChoice; extraNotes?: string | null } | null;
        partner: DateReflectionShared | null;
        mutualSecondDate: boolean;
      }>(`/date-reflections/${matchId}`, false)
      .then(applyStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible, matchId, applyStatus]);

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
      const result = await api.post<{
        mutualSecondDate: boolean;
        partner: DateReflectionShared | null;
      }>('/date-reflections', {
        matchId,
        wentWell: wentWell.trim(),
        secondDateInterest: secondDate,
        extraNotes: extraNotes.trim() || undefined,
      });
      onSubmitted?.(!!result.mutualSecondDate);
      const mine: DateReflectionShared = {
        wentWell: wentWell.trim(),
        secondDateInterest: secondDate,
        extraNotes: extraNotes.trim() || null,
      };
      setMineReflection(mine);
      if (result.mutualSecondDate && result.partner) {
        setPartnerReflection(result.partner);
        setPhase('mutual_reveal');
      } else {
        setPhase('saved');
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save reflection');
    } finally {
      setSubmitting(false);
    }
  }, [wentWell, secondDate, extraNotes, matchId, onSubmitted]);

  const handleDone = useCallback(() => {
    setPhase('form');
    onClose();
  }, [onClose]);

  const handlePlanDate2 = useCallback(() => {
    onClose();
    onPlanDate2?.();
  }, [onClose, onPlanDate2]);

  const wantsAnotherDate = secondDate === 'yes' || secondDate === 'maybe';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={phase === 'form' ? onClose : handleDone}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {phase === 'saved' ? (
          <ReflectionSavedCard
            partnerName={partnerName}
            wantsAnotherDate={wantsAnotherDate}
            onDone={handleDone}
          />
        ) : phase === 'mutual_reveal' && mineReflection && partnerReflection ? (
          <MutualRevealView
            partnerName={partnerName}
            viewerName={viewerName}
            mine={mineReflection}
            partner={partnerReflection}
            onPlanDate2={onPlanDate2 ? handlePlanDate2 : undefined}
            onDone={handleDone}
          />
        ) : (
          <>
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
          <KeyboardAvoidingView
            style={styles.formFlex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
          >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
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
                    onPress={() => {
                      Keyboard.dismiss();
                      setSecondDate(c.id);
                    }}
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
              Only you see your answers for now. If you both pick Yes or Maybe for another date, you'll each
              be able to read what the other shared.
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
          </KeyboardAvoidingView>
        )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9ff' },
  formFlex: { flex: 1 },
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

const successStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.18)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconRing: {
    marginBottom: 16,
    borderRadius: 999,
    padding: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#764ba2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  iconGrad: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 34 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e1b4b',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.14)',
  },
  noteEmoji: { fontSize: 18, marginTop: 1 },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#5b21b6',
    fontWeight: '600',
  },
  doneBtn: {
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  doneGrad: {
    paddingVertical: Platform.OS === 'ios' ? 15 : 13,
    alignItems: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

const revealStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 87, 108, 0.22)',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#f5576c',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e1b4b',
    textAlign: 'center',
    marginBottom: 8,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8, gap: 12 },
  block: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  blockPartner: {
    backgroundColor: 'rgba(245, 87, 108, 0.06)',
    borderColor: 'rgba(245, 87, 108, 0.2)',
  },
  blockMine: {
    backgroundColor: 'rgba(102, 126, 234, 0.06)',
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  blockLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  interest: {
    fontSize: 14,
    fontWeight: '700',
    color: '#be185d',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: 4,
    marginTop: 4,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1e293b',
  },
  planBtn: {
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 10,
  },
  planGrad: {
    paddingVertical: Platform.OS === 'ios' ? 15 : 13,
    alignItems: 'center',
  },
  planText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  doneBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
  },
});
