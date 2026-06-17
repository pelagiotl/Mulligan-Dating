import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api, ApiError } from '../utils/api';
import {
  DEV_DATE_PLAN_PREVIEW_MATCH_ID,
  getDatePlanPreviewMockIdeas,
} from '../utils/datePlanPreviewDemo';
import { budgetDisplay, formatVenuePinLabel, getDatePlanLaneVisual } from '../utils/datePlanLaneVisuals';
import {
  defaultDatetimeLocal,
  formatFriendlyDatetime,
  formatDatetimeParts,
  datetimeLocalToDate,
} from '../utils/datetimeLocal';
import { getCachedDateIdeas, setCachedDateIdeas } from '../utils/dateIdeasCache';
import DayTimePickerModal from './DayTimePickerModal';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { dateTimePickerTheme } from '../lib/dateTimePickerTheme';

export interface DatePlanIdea {
  laneId: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  budgetRange: 'low' | 'medium' | 'high';
  conversationTopics: string[];
}

export interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  title: string;
  description: string;
  laneId?: string;
  venueName?: string;
  venueAddress?: string;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: 'low' | 'medium' | 'high';
  conversationTopics: string[];
  status: 'pending' | 'accepted' | 'modified' | 'declined';
  user1Accepted: boolean;
  user2Accepted: boolean;
  isProposed?: boolean;
  user1Modifications?: string;
  user2Modifications?: string;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  matchId: string;
  partnerName: string;
  currentUserId: string;
  isCurrentUserMatchUser1: boolean;
  onProposalSent?: () => void;
};

function resolveLaneId(plan: DatePlan, ideas: DatePlanIdea[]): string | undefined {
  if (plan.laneId) return plan.laneId;
  return ideas.find((i) => i.title === plan.title)?.laneId;
}

function formatPlanWhen(plan: DatePlan): string {
  if (!plan.suggestedDate) return 'Time TBD';
  const datePart = plan.suggestedDate.split('T')[0];
  const d = new Date(datePart + (plan.suggestedTime ? `T${plan.suggestedTime}` : 'T12:00'));
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DateTimeTriggerRow({
  value,
  onPress,
  accessibilityLabel,
  theme,
}: {
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
  theme: ReturnType<typeof dateTimePickerTheme>;
}) {
  const { dateLine, timeLine } = formatDatetimeParts(value);
  return (
    <TouchableOpacity
      style={[
        styles.datetimeTrigger,
        {
          backgroundColor: theme.triggerBg,
          borderColor: theme.triggerBorder,
          shadowColor: theme.triggerShadow,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.82}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient
        colors={[...theme.triggerIconGradient]}
        style={[styles.datetimeTriggerIconWrap, { borderColor: theme.triggerIconBorder }]}
      >
        <Text style={styles.datetimeTriggerIcon}>📅</Text>
      </LinearGradient>
      <View style={styles.datetimeTriggerCopy}>
        <Text style={[styles.datetimeTriggerDate, { color: theme.triggerDate }]}>{dateLine}</Text>
        <Text style={[styles.datetimeTriggerTime, { color: theme.triggerTime }]}>{timeLine}</Text>
      </View>
      <View style={[styles.datetimeTriggerChevronWrap, { backgroundColor: theme.triggerChevronBg }]}>
        <Text style={[styles.datetimeTriggerChevron, { color: theme.triggerChevron }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function DatePlanHeroBanner({
  laneId,
  budgetRange,
  compact,
}: {
  laneId?: string;
  budgetRange?: string;
  compact?: boolean;
}) {
  const visual = getDatePlanLaneVisual(laneId);
  const budget = budgetDisplay(budgetRange);
  return (
    <ImageBackground
      source={{ uri: visual.imageUrl }}
      style={[styles.hero, compact && styles.heroCompact]}
      imageStyle={styles.heroImage}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(15,10,30,0.15)', 'rgba(15,10,30,0.88)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroBadges}>
        <View style={styles.laneBadge}>
          <Text style={styles.laneBadgeText}>
            {visual.emoji} {visual.label}
          </Text>
        </View>
        {budgetRange ? (
          <View style={styles.budgetPill}>
            <Text style={styles.budgetPillText}>{budget.tier}</Text>
          </View>
        ) : null}
      </View>
    </ImageBackground>
  );
}

function DatePlanIdeaCard({
  idea,
  selected,
  onSelect,
}: {
  idea: DatePlanIdea;
  selected: boolean;
  onSelect: () => void;
}) {
  const visual = getDatePlanLaneVisual(idea.laneId);
  const budget = budgetDisplay(idea.budgetRange);
  return (
    <TouchableOpacity
      style={[styles.ideaCard, selected && styles.ideaCardSelected]}
      onPress={onSelect}
      activeOpacity={0.88}
    >
      <ImageBackground
        source={{ uri: visual.imageUrl }}
        style={styles.ideaHero}
        imageStyle={styles.heroImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(15,10,30,0.1)', 'rgba(15,10,30,0.82)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBadges}>
          <View style={styles.laneBadge}>
            <Text style={styles.laneBadgeText}>
              {visual.emoji} {visual.label}
            </Text>
          </View>
          <View style={styles.budgetPill}>
            <Text style={styles.budgetPillText}>{budget.tier}</Text>
          </View>
        </View>
      </ImageBackground>
      <View style={styles.ideaBody}>
        <Text style={styles.ideaTitle}>{idea.title}</Text>
        {idea.venueName || idea.venueAddress ? (
          <Text style={styles.meta}>
            📍 {formatVenuePinLabel(idea.venueName ?? 'Suggested spot', idea.venueAddress)}
          </Text>
        ) : null}
        <Text style={styles.ideaDesc}>
          {idea.description.split('\n\n')[0]}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function IdeaSkeletonList() {
  return (
    <View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
        </View>
      ))}
    </View>
  );
}

export default function IntentionalDatePlanner({
  visible,
  onClose,
  matchId,
  partnerName,
  currentUserId,
  isCurrentUserMatchUser1,
  onProposalSent,
}: Props) {
  const [ideas, setIdeas] = useState<DatePlanIdea[]>([]);
  const [meetingLocation, setMeetingLocation] = useState('');
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [activePlan, setActivePlan] = useState<DatePlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<DatePlanIdea | null>(null);
  const [datetimeDraft, setDatetimeDraft] = useState(defaultDatetimeLocal);
  const [counterNote, setCounterNote] = useState('');
  const [counterDatetime, setCounterDatetime] = useState(defaultDatetimeLocal);
  const [showCounter, setShowCounter] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'propose' | 'counter' | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenLaneIdsRef = useRef<string[]>([]);
  const seenTitlesRef = useRef<string[]>([]);
  const seenVenueNamesRef = useRef<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const mineAccepted = activePlan
    ? isCurrentUserMatchUser1
      ? activePlan.user1Accepted
      : activePlan.user2Accepted
    : false;
  const bothConfirmed = !!(activePlan?.user1Accepted && activePlan?.user2Accepted);
  const isProposer = activePlan?.suggestedBy === currentUserId;
  const awaitingMyResponse =
    !!activePlan?.isProposed && !isProposer && activePlan.status === 'pending' && !mineAccepted;

  const isPreview = __DEV__ && matchId === DEV_DATE_PLAN_PREVIEW_MATCH_ID;
  const { mode: connectShellMode } = useConnectShellTheme();
  const dateTimeTheme = useMemo(() => dateTimePickerTheme(connectShellMode), [connectShellMode]);

  const fetchActivePlan = useCallback(async () => {
    if (isPreview) {
      setActivePlan(null);
      setLoadingPlan(false);
      return;
    }
    try {
      setLoadingPlan(true);
      const res = await api.get<{ plan?: DatePlan }>(`/matches/${matchId}/date-plan`, false);
      setActivePlan(res?.plan ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setActivePlan(null);
    } finally {
      setLoadingPlan(false);
    }
  }, [matchId, isPreview]);

  const fetchIdeas = useCallback(async (previousIdeas: DatePlanIdea[] = [], options?: { silent?: boolean }) => {
    const excludeLaneIds = [
      ...new Set([...seenLaneIdsRef.current, ...previousIdeas.map((idea) => idea.laneId)]),
    ];
    const excludeTitles = [
      ...new Set([...seenTitlesRef.current, ...previousIdeas.map((idea) => idea.title)]),
    ];

    const excludeVenueNames = [
      ...new Set([
        ...seenVenueNamesRef.current,
        ...previousIdeas.map((idea) => idea.venueName).filter((name): name is string => !!name),
      ]),
    ];

    if (isPreview) {
      setLoadingIdeas(true);
      setError('');
      await new Promise((r) => setTimeout(r, 500));
      const newIdeas = getDatePlanPreviewMockIdeas({
        excludeLaneIds,
        excludeTitles,
        excludeVenueNames,
      });
      setIdeas(newIdeas);
      seenLaneIdsRef.current = [...new Set([...seenLaneIdsRef.current, ...newIdeas.map((idea) => idea.laneId)])];
      seenTitlesRef.current = [...new Set([...seenTitlesRef.current, ...newIdeas.map((idea) => idea.title)])];
      seenVenueNamesRef.current = [
        ...new Set([
          ...seenVenueNamesRef.current,
          ...newIdeas.map((idea) => idea.venueName).filter((name): name is string => !!name),
        ]),
      ];
      setMeetingLocation('Medford, Oregon');
      setSharedInterests(['Hiking', 'Coffee', 'Live music']);
      setLoadingIdeas(false);
      return;
    }
    if (!options?.silent) {
      setLoadingIdeas(true);
    }
    setError('');
    try {
      const body: {
        count: number;
        excludeLaneIds?: string[];
        excludeTitles?: string[];
        excludeVenueNames?: string[];
      } = { count: 4 };
      if (excludeLaneIds.length > 0) body.excludeLaneIds = excludeLaneIds;
      if (excludeTitles.length > 0) body.excludeTitles = excludeTitles;
      if (excludeVenueNames.length > 0) body.excludeVenueNames = excludeVenueNames;
      const res = await api.post<{
        ideas: DatePlanIdea[];
        meetingLocation: string;
        sharedInterests: string[];
      }>(`/matches/${matchId}/generate-date-ideas`, body);
      const newIdeas = res.ideas ?? [];
      setIdeas(newIdeas);
      seenLaneIdsRef.current = [...new Set([...seenLaneIdsRef.current, ...newIdeas.map((idea) => idea.laneId)])];
      seenTitlesRef.current = [...new Set([...seenTitlesRef.current, ...newIdeas.map((idea) => idea.title)])];
      seenVenueNamesRef.current = [
        ...new Set([
          ...seenVenueNamesRef.current,
          ...newIdeas.map((idea) => idea.venueName).filter((name): name is string => !!name),
        ]),
      ];
      setMeetingLocation(res.meetingLocation ?? '');
      setSharedInterests(res.sharedInterests ?? []);
      setCachedDateIdeas(matchId, {
        ideas: newIdeas,
        meetingLocation: res.meetingLocation ?? '',
        sharedInterests: res.sharedInterests ?? [],
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.message.toLowerCase().includes('route not found')) {
        setError(
          'Smart hangout ideas need the latest backend deploy. The production server does not have this feature yet.',
        );
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not load date ideas.');
      }
    } finally {
      setLoadingIdeas(false);
    }
  }, [matchId, isPreview]);

  useEffect(() => {
    if (!visible) return;
    setSelectedIdea(null);
    setShowCounter(false);
    setPickerTarget(null);
    setShowPicker(false);
    if (pickerTimerRef.current) {
      clearTimeout(pickerTimerRef.current);
      pickerTimerRef.current = null;
    }
    seenLaneIdsRef.current = [];
    seenTitlesRef.current = [];
    seenVenueNamesRef.current = [];
    setError('');
    void fetchActivePlan();
    if (!isPreview) {
      const cached = getCachedDateIdeas(matchId);
      if (cached) {
        setIdeas(cached.ideas);
        setMeetingLocation(cached.meetingLocation);
        setSharedInterests(cached.sharedInterests);
        void fetchIdeas([], { silent: true });
        return;
      }
    }
    void fetchIdeas();
  }, [visible, matchId, isPreview, fetchActivePlan, fetchIdeas]);

  const openPicker = useCallback((target: 'propose' | 'counter') => {
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    setPickerTarget(target);
    pickerTimerRef.current = setTimeout(() => {
      setShowPicker(true);
      pickerTimerRef.current = null;
    }, 300);
  }, []);

  const closePicker = useCallback(
    (confirmedValue?: string) => {
      if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
      if (confirmedValue !== undefined) {
        if (pickerTarget === 'counter') setCounterDatetime(confirmedValue);
        else setDatetimeDraft(confirmedValue);
      }
      setShowPicker(false);
      pickerTimerRef.current = setTimeout(() => {
        setPickerTarget(null);
        pickerTimerRef.current = null;
      }, 300);
    },
    [pickerTarget],
  );

  useEffect(() => {
    return () => {
      if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    };
  }, []);

  const handlePropose = async () => {
    if (!selectedIdea) return;
    const d = datetimeLocalToDate(datetimeDraft);
    if (Number.isNaN(d.getTime())) {
      setError('Pick a valid date and time.');
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    const suggestedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const suggestedTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setSubmitting(true);
    setError('');
    try {
      if (isPreview) {
        await new Promise((r) => setTimeout(r, 450));
        setActivePlan({
          id: 'dev-preview-plan',
          matchId,
          suggestedBy: currentUserId,
          title: selectedIdea.title,
          description: selectedIdea.description,
          venueName: selectedIdea.venueName,
          venueAddress: selectedIdea.venueAddress,
          suggestedDate,
          suggestedTime,
          budgetRange: selectedIdea.budgetRange,
          conversationTopics: selectedIdea.conversationTopics,
          status: 'pending',
          user1Accepted: false,
          user2Accepted: false,
          isProposed: true,
        });
        setSelectedIdea(null);
        return;
      }

      const res = await api.post<{ plan: DatePlan }>(`/matches/${matchId}/date-plan/propose`, {
        idea: selectedIdea,
        suggestedDate,
        suggestedTime,
      });
      setActivePlan(res.plan);
      setSelectedIdea(null);
      onProposalSent?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to send proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (action: 'accept' | 'decline' | 'modify', extra?: Record<string, string>) => {
    if (!activePlan) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ plan: DatePlan }>(
        `/matches/${matchId}/date-plan/${activePlan.id}/action`,
        { action, ...extra },
      );
      setActivePlan(res.plan);
      setShowCounter(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCounter = async () => {
    if (!activePlan || !counterNote.trim()) {
      setError('Add a short note with your counter suggestion.');
      return;
    }
    const d = datetimeLocalToDate(counterDatetime);
    if (Number.isNaN(d.getTime())) {
      setError('Pick a valid counter date and time.');
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    await runAction('modify', {
      modifications: counterNote.trim(),
      counterDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      counterTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    });
  };

  const pickerValue = pickerTarget === 'counter' ? counterDatetime : datetimeDraft;

  return (
    <>
    <Modal visible={visible && pickerTarget === null && !showPicker} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <LinearGradient colors={['#fdf2f8', '#ede9fe', '#fffefb']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.emoji}>📅</Text>
            <Text style={styles.title}>Smart Date Ideas for You Two</Text>
            <Text style={styles.subtitle}>
              Tailored to your interests{meetingLocation ? ` near ${meetingLocation}` : ''} — propose a time to {partnerName}.
            </Text>

            {isPreview ? (
              <View style={styles.previewBanner}>
                <Text style={styles.previewBannerText}>
                  Dev preview — sample venues only. Real matches use live Google Places data for your area.
                </Text>
              </View>
            ) : null}

            {sharedInterests.length > 0 ? (
              <View style={styles.chips}>
                {sharedInterests.slice(0, 6).map((i) => (
                  <View key={i} style={styles.chip}>
                    <Text style={styles.chipText}>{i}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loadingPlan ? (
              <ActivityIndicator color="#7c3aed" style={{ marginVertical: 12 }} />
            ) : bothConfirmed && activePlan ? (
              <View style={styles.statusCard}>
                <DatePlanHeroBanner
                  laneId={resolveLaneId(activePlan, ideas)}
                  budgetRange={activePlan.budgetRange}
                  compact
                />
                <View style={styles.statusBody}>
                  <Text style={styles.confirmed}>✅ Hangout confirmed</Text>
                  <Text style={styles.ideaTitle}>{activePlan.title}</Text>
                  <Text style={styles.ideaDesc}>{activePlan.description}</Text>
                  {activePlan.venueName ? (
                    <Text style={styles.meta}>
                      📍 {formatVenuePinLabel(activePlan.venueName, activePlan.venueAddress)}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>🗓 {formatPlanWhen(activePlan)}</Text>
                </View>
              </View>
            ) : activePlan?.isProposed ? (
              <View style={styles.statusCard}>
                <DatePlanHeroBanner
                  laneId={resolveLaneId(activePlan, ideas)}
                  budgetRange={activePlan.budgetRange}
                  compact
                />
                <View style={styles.statusBody}>
                <Text style={styles.proposalLabel}>
                  {isProposer ? 'Your proposal' : `${partnerName}'s proposal`}
                </Text>
                {isPreview ? (
                  <Text style={styles.previewProposalNote}>
                    Preview only — not sent to chat. Match with someone for real to test messaging.
                  </Text>
                ) : null}
                <Text style={styles.ideaTitle}>{activePlan.title}</Text>
                <Text style={styles.ideaDesc}>{activePlan.description}</Text>
                {activePlan.venueName ? (
                  <Text style={styles.meta}>
                    📍 {formatVenuePinLabel(activePlan.venueName, activePlan.venueAddress)}
                  </Text>
                ) : null}
                <Text style={styles.meta}>🗓 {formatPlanWhen(activePlan)}</Text>
                {awaitingMyResponse && !showCounter ? (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryBtn} disabled={submitting} onPress={() => void runAction('accept')}>
                      <Text style={styles.primaryBtnText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} disabled={submitting} onPress={() => setShowCounter(true)}>
                      <Text style={styles.secondaryBtnText}>Counter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} disabled={submitting} onPress={() => void runAction('decline')}>
                      <Text style={styles.secondaryBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {showCounter ? (
                  <View style={styles.counter}>
                    <Text style={[styles.fieldLabel, { color: dateTimeTheme.fieldLabel }]}>Different time</Text>
                    <DateTimeTriggerRow
                      value={counterDatetime}
                      onPress={() => openPicker('counter')}
                      accessibilityLabel={`Counter time, ${formatFriendlyDatetime(counterDatetime)}`}
                      theme={dateTimeTheme}
                    />
                    <Text style={styles.fieldLabel}>Note</Text>
                    <TextInput
                      style={[styles.input, styles.textarea]}
                      value={counterNote}
                      onChangeText={setCounterNote}
                      multiline
                      placeholder="How about Saturday afternoon instead?"
                    />
                    <TouchableOpacity style={styles.primaryBtn} disabled={submitting} onPress={() => void handleCounter()}>
                      <Text style={styles.primaryBtnText}>Send counter</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {!awaitingMyResponse && !bothConfirmed ? (
                  <Text style={styles.waitingLabel}>
                    {mineAccepted
                      ? 'You accepted — waiting for your match.'
                      : isProposer
                        ? `Waiting for ${partnerName} to respond…`
                        : 'Waiting for a response…'}
                  </Text>
                ) : null}
                </View>
              </View>
            ) : null}

            {!bothConfirmed ? (
              <>
                {activePlan?.isProposed ? (
                  <Text style={styles.ideasSectionHeading}>
                    {isProposer ? 'Pick another idea to send' : `Or suggest a different hangout to ${partnerName}`}
                  </Text>
                ) : null}
                {loadingIdeas ? (
                  <>
                    <Text style={styles.loadingLabel}>Finding intentional ideas for you two…</Text>
                    <IdeaSkeletonList />
                  </>
                ) : (
                  ideas.map((idea) => (
                    <DatePlanIdeaCard
                      key={`${idea.laneId}-${idea.title}`}
                      idea={idea}
                      selected={selectedIdea?.title === idea.title}
                      onSelect={() => setSelectedIdea(idea)}
                    />
                  ))
                )}

                {selectedIdea ? (
                  <View
                    style={[
                      styles.proposePanel,
                      {
                        backgroundColor: dateTimeTheme.proposePanelBg,
                        borderColor: dateTimeTheme.proposePanelBorder,
                        shadowColor: dateTimeTheme.proposePanelShadow,
                      },
                    ]}
                  >
                    <Text style={[styles.proposeHeading, { color: dateTimeTheme.proposeHeading }]}>Propose “{selectedIdea.title}”</Text>
                    <Text style={[styles.fieldLabel, { color: dateTimeTheme.fieldLabel }]}>When works for you?</Text>
                    <DateTimeTriggerRow
                      value={datetimeDraft}
                      onPress={() => openPicker('propose')}
                      accessibilityLabel={`Proposed time, ${formatFriendlyDatetime(datetimeDraft)}`}
                      theme={dateTimeTheme}
                    />
                    <TouchableOpacity style={styles.primaryBtn} disabled={submitting} onPress={() => void handlePropose()}>
                      <Text style={styles.primaryBtnText}>
                        {submitting
                          ? 'Sending…'
                          : activePlan?.isProposed
                            ? `Send new proposal to ${partnerName}`
                            : `Send proposal to ${partnerName}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.refresh}
                  disabled={loadingIdeas}
                  onPress={() => {
                    setSelectedIdea(null);
                    void fetchIdeas(ideas);
                  }}
                >
                  <Text style={styles.refreshText}>{loadingIdeas ? 'Refreshing…' : '↻ New ideas'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <DayTimePickerModal
      visible={showPicker}
      value={pickerValue}
      title={pickerTarget === 'counter' ? 'Suggest a different time' : 'When works for you?'}
      onCancel={() => closePicker()}
      onConfirm={(next) => closePicker(next)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18,6,24,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 12,
  },
  scroll: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 16, fontWeight: '700' },
  emoji: { fontSize: 36, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#1e1b4b', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  previewBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  previewBannerText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
  previewProposalNote: { fontSize: 13, color: '#92400e', lineHeight: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    backgroundColor: 'rgba(167,139,250,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: '#5b21b6' },
  loadingLabel: { fontSize: 14, color: '#64748b', marginBottom: 12, textAlign: 'center' },
  ideasSectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e1b4b',
    marginTop: 8,
    marginBottom: 10,
    textAlign: 'center',
  },
  waitingLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  ideaCard: {
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.2)',
    shadowColor: '#1e1b4b',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  ideaCardSelected: {
    borderColor: '#a855f7',
    shadowColor: '#a855f7',
    shadowOpacity: 0.28,
  },
  ideaHero: {
    height: 148,
    justifyContent: 'flex-start',
  },
  hero: {
    height: 120,
    justifyContent: 'flex-start',
  },
  heroCompact: { height: 100 },
  heroImage: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  heroBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 10,
    width: '100%',
  },
  laneBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    maxWidth: '72%',
  },
  laneBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  budgetPill: {
    backgroundColor: 'rgba(124,58,237,0.92)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  budgetPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  ideaBody: { padding: 14, paddingTop: 12 },
  skeletonCard: {
    borderRadius: 18,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    paddingBottom: 14,
  },
  skeletonHero: {
    height: 148,
    backgroundColor: 'rgba(167,139,250,0.18)',
    marginBottom: 12,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(167,139,250,0.15)',
    marginHorizontal: 14,
    marginBottom: 8,
  },
  skeletonLineShort: { width: '55%' },
  ideaTitle: { fontSize: 16, fontWeight: '800', color: '#1e1b4b' },
  ideaDesc: { fontSize: 13, color: '#475569', marginTop: 6, lineHeight: 20 },
  meta: { fontSize: 12, color: '#334155', marginTop: 6 },
  proposePanel: {
    marginTop: 8,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  proposeHeading: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  datetimeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 2,
  },
  datetimeTriggerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  datetimeTriggerIcon: { fontSize: 20 },
  datetimeTriggerCopy: { flex: 1 },
  datetimeTriggerDate: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  datetimeTriggerTime: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  datetimeTriggerChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datetimeTriggerChevron: {
    fontSize: 20,
    fontWeight: '500',
    marginTop: -1,
  },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  primaryBtn: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#a855f7',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryBtnText: { color: '#7c3aed', fontWeight: '700' },
  actions: { marginTop: 12 },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    shadowColor: '#1e1b4b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statusBody: { padding: 14 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
  },
  proposalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7c3aed',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  confirmed: { fontWeight: '800', color: '#047857', marginBottom: 6 },
  counter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  refresh: { alignSelf: 'center', marginTop: 8, padding: 8 },
  refreshText: { color: '#7c3aed', fontWeight: '700' },
  error: { color: '#b91c1c', marginBottom: 8, fontSize: 14 },
});
