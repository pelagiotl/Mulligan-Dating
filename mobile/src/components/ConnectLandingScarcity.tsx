import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

const MAX_MULLIGANS = 7;
const COLLAPSED_STORAGE_KEY = 'mulligan_matches_limits_panel_collapsed';

const BURGUNDY = '#8B1538';
const INK = '#1a1a2e';
const MUTED = 'rgba(26, 26, 46, 0.52)';

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Any moment now';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

async function readCollapsedPreference(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(COLLAPSED_STORAGE_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

type Props = {
  loading: boolean;
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate: string | null;
  activeMatches: number;
  slotLimit: number;
};

const ConnectLandingScarcity = memo(function ConnectLandingScarcity({
  loading,
  availableTokens,
  canClaimWeeklyToken,
  nextRefillDate,
  activeMatches,
  slotLimit,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const slotsOpen = Math.max(0, slotLimit - activeMatches);
  const tokensCapped = Math.min(Math.max(0, availableTokens), MAX_MULLIGANS);
  const atCapacity = activeMatches >= slotLimit;
  const tokenPct = Math.round((tokensCapped / MAX_MULLIGANS) * 100);
  const slotPct = Math.min(100, Math.round((activeMatches / slotLimit) * 100));

  const refillMs = useMemo(() => {
    if (!nextRefillDate || canClaimWeeklyToken) return null;
    const t = new Date(nextRefillDate).getTime();
    if (Number.isNaN(t)) return null;
    return t - now;
  }, [nextRefillDate, canClaimWeeklyToken, now]);

  useEffect(() => {
    let mounted = true;
    void readCollapsedPreference().then((v) => {
      if (mounted) {
        setCollapsed(v);
        setPrefsLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (refillMs == null || refillMs <= 0 || collapsed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [refillMs, collapsed]);

  const persistCollapsed = useCallback(async (next: boolean) => {
    setCollapsed(next);
    try {
      await AsyncStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const showRefillCountdown =
    refillMs != null &&
    refillMs > 0 &&
    !canClaimWeeklyToken &&
    tokensCapped < MAX_MULLIGANS;

  const statusNote = atCapacity
    ? `At ${slotLimit} connections — unmatch or wait for expiry`
    : canClaimWeeklyToken && tokensCapped < MAX_MULLIGANS
      ? 'Weekly Mulligans ready on Connect'
      : showRefillCountdown && refillMs != null
        ? `Next Mulligan in ${formatCountdown(refillMs)}`
        : null;

  if (loading || !prefsLoaded) {
    return (
      <View style={styles.loadingWrap} accessibilityLabel="Loading connection limits">
        <ActivityIndicator size="small" color={`${BURGUNDY}99`} />
        <Text style={styles.loadingText}>Loading limits…</Text>
      </View>
    );
  }

  if (collapsed) {
    return (
      <TouchableOpacity
        style={styles.collapsedBar}
        onPress={() => void persistCollapsed(false)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Your limits. Mulligans ${tokensCapped} of ${MAX_MULLIGANS}. Connections ${activeMatches} of ${slotLimit}. Double tap to expand.`}
        accessibilityHint="Shows full limits details"
      >
        <Text style={styles.collapsedGem} accessibilityElementsHidden>
          ✦
        </Text>
        <Text style={styles.collapsedEyebrow}>Your limits</Text>
        <View style={styles.collapsedStats}>
          <Text style={styles.collapsedStat}>
            <Text style={styles.collapsedStatIcon}>🎟 </Text>
            {tokensCapped}/{MAX_MULLIGANS}
          </Text>
          <View style={styles.collapsedDivider} />
          <Text style={[styles.collapsedStat, atCapacity && styles.collapsedStatFull]}>
            <Text style={styles.collapsedStatIcon}>💞 </Text>
            {activeMatches}/{slotLimit}
          </Text>
        </View>
        <Text style={styles.collapsedAction}>Show</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.shellOuter} accessibilityRole="summary">
      <LinearGradient
        colors={['#ffffff', '#fcf8fa', '#f5f3ff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shell}
      >
        <LinearGradient
          colors={['#c084fc', '#d9467a', BURGUNDY]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.accentBar}
        />

        <View style={styles.toolbar}>
          <View style={styles.titleGroup}>
            <Text style={styles.eyebrow}>Your limits</Text>
            <Text style={styles.lede}>
              {MAX_MULLIGANS} Mulligans weekly · {slotLimit} connections max
            </Text>
          </View>
          <TouchableOpacity
            style={styles.hideBtn}
            onPress={() => void persistCollapsed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Hide limits panel"
          >
            <Text style={styles.hideBtnText}>Hide</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metric, styles.metricTokens]}>
            <View style={[styles.iconWrap, styles.iconWrapTokens]}>
              <Text style={styles.iconEmoji} accessibilityElementsHidden>
                🎟
              </Text>
            </View>
            <View style={styles.metricContent}>
              <Text style={styles.metricLabel}>Mulligans</Text>
              <Text style={styles.metricValue}>
                {tokensCapped}
                <Text style={styles.metricDenom}> / {MAX_MULLIGANS}</Text>
              </Text>
              <View style={styles.track}>
                <View style={[styles.trackFill, styles.trackFillTokens, { width: `${tokenPct}%` }]} />
              </View>
            </View>
          </View>

          <View style={[styles.metric, styles.metricSlots, atCapacity && styles.metricFull]}>
            <View style={[styles.iconWrap, styles.iconWrapSlots]}>
              <Text style={styles.iconEmoji} accessibilityElementsHidden>
                💞
              </Text>
            </View>
            <View style={styles.metricContent}>
              <Text style={styles.metricLabel}>Connections</Text>
              <Text style={[styles.metricValue, atCapacity && styles.metricValueFull]}>
                {activeMatches}
                <Text style={styles.metricDenom}> / {slotLimit}</Text>
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.trackFill,
                    atCapacity ? styles.trackFillFull : styles.trackFillSlots,
                    { width: `${slotPct}%` },
                  ]}
                />
              </View>
              {!atCapacity ? (
                <View style={styles.metricChip}>
                  <Text style={styles.metricChipText}>
                    {slotsOpen} slot{slotsOpen === 1 ? '' : 's'} available
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {statusNote ? (
          <View style={[styles.note, atCapacity && styles.noteCapacity]}>
            <Text style={[styles.noteText, atCapacity && styles.noteTextCapacity]}>
              {statusNote}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  collapsedGem: {
    fontSize: 9,
    color: 'rgba(139, 21, 56, 0.45)',
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.14)',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: INK,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
    }),
  },
  collapsedEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: BURGUNDY,
  },
  collapsedStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  collapsedStat: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    fontVariant: ['tabular-nums'],
  },
  collapsedStatFull: {
    color: BURGUNDY,
  },
  collapsedStatIcon: {
    fontSize: 11,
  },
  collapsedDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(26, 26, 46, 0.12)',
  },
  collapsedAction: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  shellOuter: {
    width: '100%',
    marginBottom: 10,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: INK,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  shell: {
    width: '100%',
    borderRadius: 14,
    paddingTop: 11,
    paddingBottom: 10,
    paddingHorizontal: 11,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.12)',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
    paddingTop: 2,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: BURGUNDY,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  lede: {
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
    fontWeight: '500',
  },
  hideBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 26, 46, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  hideBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: MUTED,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  metric: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 26, 46, 0.07)',
    minWidth: 0,
  },
  metricTokens: {
    borderColor: 'rgba(99, 102, 241, 0.14)',
    backgroundColor: 'rgba(238, 242, 255, 0.35)',
  },
  metricSlots: {
    borderColor: 'rgba(244, 63, 94, 0.12)',
    backgroundColor: 'rgba(255, 241, 245, 0.35)',
  },
  metricFull: {
    backgroundColor: 'rgba(139, 21, 56, 0.06)',
    borderColor: 'rgba(139, 21, 56, 0.2)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 26, 46, 0.08)',
  },
  iconWrapTokens: {
    borderColor: 'rgba(99, 102, 241, 0.18)',
  },
  iconWrapSlots: {
    borderColor: 'rgba(244, 63, 94, 0.16)',
  },
  iconEmoji: {
    fontSize: 15,
    lineHeight: 17,
  },
  metricContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: MUTED,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
    color: INK,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  metricValueFull: {
    color: BURGUNDY,
  },
  metricDenom: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.3)',
  },
  track: {
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(26, 26, 46, 0.08)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 99,
  },
  trackFillTokens: {
    backgroundColor: '#6366f1',
  },
  trackFillSlots: {
    backgroundColor: '#f43f5e',
  },
  trackFillFull: {
    backgroundColor: BURGUNDY,
  },
  metricChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  metricChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
  },
  note: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(26, 26, 46, 0.04)',
  },
  noteCapacity: {
    backgroundColor: 'rgba(139, 21, 56, 0.06)',
  },
  noteText: {
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
    fontWeight: '500',
  },
  noteTextCapacity: {
    color: BURGUNDY,
    fontWeight: '600',
  },
});

export default ConnectLandingScarcity;
