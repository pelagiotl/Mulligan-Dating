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
import {
  connectionLimitsPanelColors,
  type ConnectShellMode,
} from '../lib/connectShellTheme';

const MAX_MULLIGANS = 7;
const COLLAPSED_STORAGE_KEY = 'mulligan_matches_limits_panel_collapsed';

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
  connectShell: ConnectShellMode;
  /** Tighter spacing when rendered inside the matches header (Android). */
  embeddedInHeader?: boolean;
  loading: boolean;
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate: string | null;
  activeMatches: number;
  slotLimit: number;
};

const ConnectLandingScarcity = memo(function ConnectLandingScarcity({
  connectShell,
  embeddedInHeader = false,
  loading,
  availableTokens,
  canClaimWeeklyToken,
  nextRefillDate,
  activeMatches,
  slotLimit,
}: Props) {
  const colors = useMemo(() => connectionLimitsPanelColors(connectShell), [connectShell]);
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

  const outerSpacing = embeddedInHeader ? styles.embeddedOuter : null;

  const shellShadow =
    Platform.OS === 'ios'
      ? {
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: connectShell === 'midnight' ? 0.35 : 0.08,
          shadowRadius: 8,
        }
      : { elevation: connectShell === 'midnight' ? 3 : 2 };

  if (loading || !prefsLoaded) {
    return (
      <View style={[styles.loadingWrap, outerSpacing]} accessibilityLabel="Loading connection limits">
        <ActivityIndicator size="small" color={colors.eyebrow} />
        <Text style={[styles.loadingText, { color: colors.loadingText }]}>Loading limits…</Text>
      </View>
    );
  }

  if (collapsed) {
    return (
      <TouchableOpacity
        style={[
          styles.collapsedBar,
          outerSpacing,
          {
            backgroundColor: colors.collapsedBarBg,
            borderColor: colors.collapsedBarBorder,
          },
          shellShadow,
        ]}
        onPress={() => void persistCollapsed(false)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Your limits. Mulligans ${tokensCapped} of ${MAX_MULLIGANS}. Connections ${activeMatches} of ${slotLimit}. Double tap to expand.`}
        accessibilityHint="Shows full limits details"
      >
        <Text style={[styles.collapsedGem, { color: colors.collapsedGem }]} accessibilityElementsHidden>
          ✦
        </Text>
        <Text style={[styles.collapsedEyebrow, { color: colors.eyebrow }]}>Your limits</Text>
        <View style={styles.collapsedStats}>
          <Text style={[styles.collapsedStat, { color: colors.collapsedStat }]}>
            <Text style={styles.collapsedStatIcon}>🎟 </Text>
            {tokensCapped}/{MAX_MULLIGANS}
          </Text>
          <View style={[styles.collapsedDivider, { backgroundColor: colors.collapsedDivider }]} />
          <Text
            style={[
              styles.collapsedStat,
              { color: atCapacity ? colors.collapsedStatFull : colors.collapsedStat },
            ]}
          >
            <Text style={styles.collapsedStatIcon}>💞 </Text>
            {activeMatches}/{slotLimit}
          </Text>
        </View>
        <Text style={[styles.collapsedAction, { color: colors.collapsedAction }]}>Show</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.shellOuter, outerSpacing, shellShadow]} accessibilityRole="summary">
      <LinearGradient
        colors={[...colors.shellGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.shell, { borderColor: colors.shellBorder }]}
      >
        <LinearGradient
          colors={[...colors.accentGradient]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.accentBar}
        />

        <View style={styles.toolbar}>
          <View style={styles.titleGroup}>
            <Text style={[styles.eyebrow, { color: colors.eyebrow }]}>Your limits</Text>
            <Text style={[styles.lede, { color: colors.lede }]}>
              {MAX_MULLIGANS} Mulligans weekly · {slotLimit} connections max
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.hideBtn,
              { borderColor: colors.hideBorder, backgroundColor: colors.hideBg },
            ]}
            onPress={() => void persistCollapsed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Hide limits panel"
          >
            <Text style={[styles.hideBtnText, { color: colors.hideText }]}>Hide</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View
            style={[
              styles.metric,
              { backgroundColor: colors.metricTokensBg, borderColor: colors.metricTokensBorder },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.iconWrapBg, borderColor: colors.iconWrapTokensBorder },
              ]}
            >
              <Text style={styles.iconEmoji} accessibilityElementsHidden>
                🎟
              </Text>
            </View>
            <View style={styles.metricContent}>
              <Text style={[styles.metricLabel, { color: colors.label }]}>Mulligans</Text>
              <Text style={[styles.metricValue, { color: colors.value }]}>
                {tokensCapped}
                <Text style={[styles.metricDenom, { color: colors.denom }]}> / {MAX_MULLIGANS}</Text>
              </Text>
              <View style={[styles.track, { backgroundColor: colors.trackBg }]}>
                <View style={[styles.trackFill, { width: `${tokenPct}%`, backgroundColor: colors.fillTokens }]} />
              </View>
            </View>
          </View>

          <View
            style={[
              styles.metric,
              {
                backgroundColor: atCapacity ? colors.metricFullBg : colors.metricSlotsBg,
                borderColor: atCapacity ? colors.metricFullBorder : colors.metricSlotsBorder,
              },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: colors.iconWrapBg, borderColor: colors.iconWrapSlotsBorder },
              ]}
            >
              <Text style={styles.iconEmoji} accessibilityElementsHidden>
                💞
              </Text>
            </View>
            <View style={styles.metricContent}>
              <Text style={[styles.metricLabel, { color: colors.label }]}>Connections</Text>
              <Text style={[styles.metricValue, { color: atCapacity ? colors.valueFull : colors.value }]}>
                {activeMatches}
                <Text style={[styles.metricDenom, { color: colors.denom }]}> / {slotLimit}</Text>
              </Text>
              <View style={[styles.track, { backgroundColor: colors.trackBg }]}>
                <View
                  style={[
                    styles.trackFill,
                    {
                      width: `${slotPct}%`,
                      backgroundColor: atCapacity ? colors.fillFull : colors.fillSlots,
                    },
                  ]}
                />
              </View>
              {!atCapacity ? (
                <View
                  style={[
                    styles.metricChip,
                    { backgroundColor: colors.chipBg, borderColor: colors.chipBorder },
                  ]}
                >
                  <Text style={[styles.metricChipText, { color: colors.chipText }]}>
                    {slotsOpen} slot{slotsOpen === 1 ? '' : 's'} available
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {statusNote ? (
          <View
            style={[
              styles.note,
              {
                backgroundColor: atCapacity ? colors.noteCapacityBg : colors.noteBg,
                borderColor: atCapacity ? colors.metricFullBorder : colors.metricBorder,
              },
            ]}
          >
            <Text
              style={[
                styles.noteText,
                { color: atCapacity ? colors.noteCapacityText : colors.noteText },
              ]}
            >
              {statusNote}
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  embeddedOuter: {
    marginBottom: 0,
  },
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
    fontWeight: '500',
  },
  collapsedGem: {
    fontSize: 9,
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
  },
  collapsedEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
    fontVariant: ['tabular-nums'],
  },
  collapsedStatIcon: {
    fontSize: 11,
  },
  collapsedDivider: {
    width: 1,
    height: 12,
  },
  collapsedAction: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  shellOuter: {
    width: '100%',
    marginBottom: 10,
    borderRadius: 12,
  },
  shell: {
    width: '100%',
    borderRadius: 14,
    paddingTop: 11,
    paddingBottom: 10,
    paddingHorizontal: 11,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
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
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  lede: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  hideBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hideBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 0,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
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
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  metricDenom: {
    fontSize: 12,
    fontWeight: '700',
  },
  track: {
    height: 3,
    borderRadius: 99,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 99,
  },
  metricChip: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metricChipText: {
    fontSize: 9,
    fontWeight: '700',
  },
  note: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
});

export default ConnectLandingScarcity;
