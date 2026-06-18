import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
  Image,
  Animated,
  Easing,
  useWindowDimensions,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { api } from '../utils/api';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { connectShellGradientStops, liveDatesButtonShimmerColors } from '../lib/connectShellTheme';
import { iosFloatingTabBarInset } from '../utils/androidConnectShellChrome';
import ConnectButtonShimmerEffect, { CONNECT_SHIMMER_DURATION_MS } from '../components/ConnectButtonShimmerEffect';

const LIVE_DATES_HERO = require('../../assets/live-dates-hero.png');

type LiveEvent = {
  id: string;
  title: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  eventAt: string;
  foodTrucks: string[];
  capacity: number;
  signupCount: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  isSignedUp: boolean;
};

const EVENT_TIMEZONE = 'America/Los_Angeles';

function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: EVENT_TIMEZONE,
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: EVENT_TIMEZONE,
  });
  return `${date} · ${time}`;
}

function descriptionParagraphs(description: string | null): string[] {
  if (!description?.trim()) return [];
  return description
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function toCount(value: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function LiveEventStats({ event, midnight }: { event: LiveEvent; midnight: boolean }) {
  const total = toCount(event.signupCount);
  const men = toCount(event.maleCount);
  const women = toCount(event.femaleCount);
  const capacity = toCount(event.capacity);
  const spotsLeft = Math.max(0, capacity - total);
  const fillPct = capacity > 0 ? Math.min(100, (total / capacity) * 100) : 0;
  const almostFull = spotsLeft > 0 && spotsLeft <= 5;
  const full = spotsLeft === 0;

  const eyebrow = full ? 'Sold out' : almostFull ? '🔥 Almost full' : '✨ Filling up fast';

  return (
    <View style={[styles.statsPanel, midnight && styles.statsPanelMidnight]}>
      <View style={styles.statsHeaderRow}>
        <Text style={[styles.statsEyebrow, midnight && styles.statsEyebrowMidnight]}>{eyebrow}</Text>
        <Text style={[styles.statsFraction, midnight && styles.statsFractionMidnight]}>
          {total} / {capacity} spots
        </Text>
      </View>

      <View style={[styles.statsTrack, midnight && styles.statsTrackMidnight]}>
        <LinearGradient
          colors={full ? ['#94a3b8', '#64748b'] : ['#f5576c', '#f093fb', '#667eea']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.statsFill, { width: `${Math.max(fillPct, total > 0 ? 8 : 0)}%` }]}
        />
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCell, midnight && styles.statCellMidnight]}>
          <Text style={[styles.statValue, midnight && styles.textLight]}>{total}</Text>
          <Text style={[styles.statLabel, midnight && styles.leadMidnight]}>Signed up</Text>
        </View>
        <View style={[styles.statDivider, midnight && styles.statDividerMidnight]} />
        <View style={[styles.statCell, midnight && styles.statCellMidnight]}>
          <Text style={[styles.statValue, midnight && styles.textLight]}>{men}</Text>
          <Text style={[styles.statLabel, midnight && styles.leadMidnight]}>Men</Text>
        </View>
        <View style={[styles.statDivider, midnight && styles.statDividerMidnight]} />
        <View style={[styles.statCell, midnight && styles.statCellMidnight]}>
          <Text style={[styles.statValue, midnight && styles.textLight]}>{women}</Text>
          <Text style={[styles.statLabel, midnight && styles.leadMidnight]}>Women</Text>
        </View>
      </View>

      {!full ? (
        <LinearGradient
          colors={
            almostFull
              ? ['rgba(245, 87, 108, 0.18)', 'rgba(240, 147, 251, 0.22)']
              : ['rgba(102, 126, 234, 0.12)', 'rgba(118, 75, 162, 0.14)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.spotsLeftBanner, almostFull && styles.spotsLeftBannerHot]}
        >
          <Text style={[styles.spotsLeftNumber, midnight && styles.spotsLeftNumberMidnight]}>
            {spotsLeft}
          </Text>
          <Text style={[styles.spotsLeftCopy, midnight && styles.leadMidnight]}>
            {spotsLeft === 1 ? 'spot left — grab it' : 'spots left — don\'t wait'}
          </Text>
        </LinearGradient>
      ) : (
        <View style={[styles.spotsLeftBanner, styles.spotsLeftBannerFull]}>
          <Text style={[styles.spotsLeftCopy, styles.spotsLeftCopyFull]}>This event is at capacity</Text>
        </View>
      )}
    </View>
  );
}

export default function LiveDatesScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { mode: shellMode } = useConnectShellTheme();
  const midnight = shellMode === 'midnight';
  const [event, setEvent] = useState<LiveEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  const signupButtonSweepWidth = Math.max(240, windowWidth - 76);

  const signupButtonPulse = useRef(new Animated.Value(1)).current;
  const signupButtonShimmer = useRef(new Animated.Value(0)).current;
  const signupButtonScale = useRef(new Animated.Value(1)).current;
  const signupButtonLoopsRef = useRef<{
    pulseLoop: Animated.CompositeAnimation;
    shimmerLoop: Animated.CompositeAnimation;
  } | null>(null);

  const startSignupButtonAnimations = useCallback(() => {
    const loops = signupButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      signupButtonLoopsRef.current = null;
    }
    signupButtonPulse.setValue(1);
    signupButtonShimmer.stopAnimation();
    signupButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(signupButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(signupButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(signupButtonShimmer, {
          toValue: 1,
          duration: CONNECT_SHIMMER_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(50),
        Animated.timing(signupButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    shimmerLoop.start();
    signupButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, [signupButtonPulse, signupButtonShimmer]);

  const stopSignupButtonAnimations = useCallback(() => {
    const loops = signupButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      signupButtonLoopsRef.current = null;
    }
    signupButtonPulse.setValue(1);
    signupButtonShimmer.stopAnimation();
    signupButtonShimmer.setValue(0);
  }, [signupButtonPulse, signupButtonShimmer]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ events: LiveEvent[] }>('/live-dates/events', false);
      setEvent(data.events?.[0] ?? null);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not load event');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signup = async () => {
    if (!event) return;
    setSigningUp(true);
    try {
      const result = await api.post<{ emailSent?: boolean; pushSent?: boolean }>(
        '/live-dates/signup',
        { eventId: event.id },
      );
      await load();
      const parts = ['Your spot is saved.'];
      if (result.emailSent) {
        parts.push('Check your email for confirmation.');
      }
      if (result.pushSent) {
        parts.push('Push reminders are on for this event.');
      } else {
        parts.push('Enable notifications in Settings to get reminders before the event.');
      }
      Alert.alert('You\'re in! 🎟️', parts.join(' '));
    } catch (err: unknown) {
      Alert.alert('Signup failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSigningUp(false);
    }
  };

  const bottomPad = iosFloatingTabBarInset(insets.bottom) + 16;
  const paragraphs = descriptionParagraphs(event?.description ?? null);
  const spotsLeft = event ? Math.max(0, toCount(event.capacity) - toCount(event.signupCount)) : 0;
  const showSignupButton = Boolean(event && !event.isSignedUp);
  const animateSignupButton = showSignupButton && spotsLeft > 0;

  useFocusEffect(
    useCallback(() => {
      if (!animateSignupButton) return () => {};
      const timeoutId = setTimeout(() => {
        if (isFocused) startSignupButtonAnimations();
      }, 80);
      return () => {
        clearTimeout(timeoutId);
        stopSignupButtonAnimations();
      };
    }, [animateSignupButton, isFocused, startSignupButtonAnimations, stopSignupButtonAnimations]),
  );

  return (
    <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
        }
      >
        <View style={styles.heroWrap}>
          <Image
            source={LIVE_DATES_HERO}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityLabel="Summer evening outdoor social event at Mulligan Live Dates"
          />
          <LinearGradient
            colors={['transparent', 'rgba(15, 10, 28, 0.55)', 'rgba(15, 10, 28, 0.92)']}
            locations={[0.35, 0.72, 1]}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <View style={[styles.heroCopy, { paddingTop: insets.top + 14 }]}>
            <Text style={styles.heroTitle}>Mulligan Live Dates</Text>
            <Text style={styles.heroTagline}>Real connections, zero swiping.</Text>
          </View>
        </View>

        <View style={styles.body}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={midnight ? '#f472b6' : '#8B1538'} />
        ) : !event ? (
          <View style={[styles.emptyCard, midnight && styles.emptyCardMidnight]}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={[styles.emptyTitle, midnight && styles.textLight]}>No event scheduled yet</Text>
            <Text style={[styles.emptySub, midnight && styles.leadMidnight]}>
              Check back soon for our next Mulligan Live Dates night.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, midnight && styles.cardMidnight]}>
            {event.isSignedUp ? (
              <View style={styles.ticketBadge}>
                <Text style={styles.ticketBadgeText}>🎟️ You're signed up</Text>
              </View>
            ) : null}

            <View style={[styles.whenCard, midnight && styles.whenCardMidnight]}>
              <Text style={[styles.whenLabel, midnight && styles.leadMidnight]}>First event</Text>
              <Text style={[styles.when, midnight && styles.whenMidnight]}>{formatEventWhen(event.eventAt)}</Text>
              {event.venueAddress ? (
                <Text style={[styles.venue, midnight && styles.leadMidnight]}>📍 {event.venueAddress}</Text>
              ) : null}
            </View>

            {paragraphs.map((paragraph) => (
              <Text key={paragraph} style={[styles.desc, midnight && styles.leadMidnight]}>
                {paragraph}
              </Text>
            ))}

            <LiveEventStats event={event} midnight={midnight} />

            {!event.isSignedUp ? (
              <TouchableOpacity
                style={styles.signupBtn}
                onPress={() => { void signup(); }}
                onPressIn={() => {
                  if (signingUp || spotsLeft === 0) return;
                  try {
                    Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30);
                  } catch (_) {}
                  Animated.timing(signupButtonScale, {
                    toValue: 0.96,
                    duration: 30,
                    useNativeDriver: true,
                  }).start();
                }}
                onPressOut={() => {
                  Animated.spring(signupButtonScale, {
                    toValue: 1,
                    friction: 6,
                    tension: 300,
                    useNativeDriver: true,
                  }).start();
                }}
                disabled={signingUp || spotsLeft === 0}
                activeOpacity={1}
              >
                <Animated.View
                  style={{
                    transform: [{ scale: Animated.multiply(signupButtonPulse, signupButtonScale) }],
                  }}
                >
                  <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} style={styles.signupGrad}>
                    <ConnectButtonShimmerEffect
                      key={`live-signup-shimmer-${shellMode}`}
                      shell={shellMode}
                      colors={liveDatesButtonShimmerColors}
                      progress={signupButtonShimmer}
                      borderRadius={28}
                      sweepWidth={signupButtonSweepWidth}
                      showHearts={false}
                    />
                    {signingUp ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.signupText}>
                        {spotsLeft === 0 ? 'Event full' : 'Sign up for this event'}
                      </Text>
                    )}
                  </LinearGradient>
                </Animated.View>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.signedUpNote, midnight && styles.leadMidnight]}>
                See you there — we'll send email and push reminders before the event.
              </Text>
            )}
          </View>
        )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  heroWrap: {
    width: '100%',
    height: 248,
    marginBottom: 18,
    backgroundColor: '#1a1028',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroCopy: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroTagline: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.94)',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  body: {
    paddingHorizontal: 20,
  },
  leadMidnight: { color: 'rgba(248,250,252,0.75)' },
  textLight: { color: '#f1f5f9' },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.2)',
  },
  emptyCardMidnight: {
    backgroundColor: 'rgba(30,27,46,0.85)',
    borderColor: 'rgba(244,114,182,0.25)',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', color: '#64748b' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.22)',
    shadowColor: '#667eea',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardMidnight: {
    backgroundColor: 'rgba(26,22,40,0.92)',
    borderColor: 'rgba(167,139,250,0.28)',
  },
  ticketBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  ticketBadgeText: { fontSize: 12, fontWeight: '700', color: '#15803d' },
  whenCard: {
    backgroundColor: 'rgba(102,126,234,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.16)',
  },
  whenCardMidnight: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderColor: 'rgba(167,139,250,0.22)',
  },
  whenLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 4,
  },
  when: { fontSize: 16, fontWeight: '800', color: '#5b21b6', marginBottom: 6, lineHeight: 22 },
  whenMidnight: { color: '#e9d5ff' },
  venue: { fontSize: 14, lineHeight: 20, color: '#475569' },
  desc: { fontSize: 14, lineHeight: 22, color: '#334155', marginBottom: 12 },
  statsPanel: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  statsPanelMidnight: {
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statsEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#5b21b6',
    textTransform: 'uppercase',
  },
  statsEyebrowMidnight: { color: '#f0abfc' },
  statsFraction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  statsFractionMidnight: { color: 'rgba(248,250,252,0.7)' },
  statsTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  statsTrackMidnight: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  statsFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statCellMidnight: {},
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
  },
  statDividerMidnight: {
    backgroundColor: 'rgba(167, 139, 250, 0.25)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e1b4b',
    lineHeight: 26,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  spotsLeftBanner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spotsLeftBannerHot: {
    borderWidth: 1,
    borderColor: 'rgba(245, 87, 108, 0.35)',
  },
  spotsLeftBannerFull: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  spotsLeftNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#5b21b6',
    letterSpacing: -0.5,
  },
  spotsLeftNumberMidnight: {
    color: '#f0abfc',
  },
  spotsLeftCopy: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  spotsLeftCopyFull: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  signupBtn: {
    borderRadius: 999,
    overflow: 'visible',
    shadowColor: '#f5576c',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  signupGrad: {
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    alignItems: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  signupText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  signedUpNote: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    color: '#475569',
    marginTop: 4,
  },
});
