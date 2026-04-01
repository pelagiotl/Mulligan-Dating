import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const MAX_MULLIGANS = 7;

const BURGUNDY = '#8B1538';
const BURGUNDY_SOFT = 'rgba(139, 21, 56, 0.14)';
const INK = '#1a1a2e';

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

const statTileShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: INK,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
      }
    : { elevation: 2 };

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

  const slotsOpen = Math.max(0, slotLimit - activeMatches);
  const tokensCapped = Math.min(Math.max(0, availableTokens), MAX_MULLIGANS);

  const refillMs = useMemo(() => {
    if (!nextRefillDate || canClaimWeeklyToken) return null;
    const t = new Date(nextRefillDate).getTime();
    if (Number.isNaN(t)) return null;
    return t - now;
  }, [nextRefillDate, canClaimWeeklyToken, now]);

  useEffect(() => {
    if (refillMs == null || refillMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [refillMs]);

  const showRefillCountdown =
    refillMs != null &&
    refillMs > 0 &&
    !canClaimWeeklyToken &&
    tokensCapped < MAX_MULLIGANS;

  const tokenScarce = tokensCapped <= 1;
  const slotScarce = slotsOpen <= 5;

  if (loading) {
    return (
      <View style={styles.shellOuter} accessibilityLabel="Loading connection limits">
        <View style={[styles.shell, styles.shellLoading]}>
          <ActivityIndicator size="small" color={`${BURGUNDY}99`} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.shellOuter} accessibilityRole="summary">
      <LinearGradient
        colors={['#ffffff', '#fff9fa', '#f8f7fc']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shell}
      >
        <LinearGradient
          colors={['#d9467a', BURGUNDY, '#6b0d2e']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.accentBar}
        />

        <View style={styles.headerBlock}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrow}>Limited supply</Text>
          </View>
          <Text style={styles.tagline}>
            Every Connect uses a Mulligan. Match slots cap how many chats stay open.
          </Text>
        </View>

        <View style={styles.row}>
          <View
            style={[
              styles.statTile,
              statTileShadow,
              tokenScarce ? styles.statTileWarm : styles.statTileNeutral,
            ]}
          >
            <Text style={styles.cellLabel}>Mulligans ready</Text>
            <Text style={[styles.cellValue, tokenScarce && styles.cellValueWarm]}>
              {tokensCapped}
              <Text style={styles.cellValueSuffix}> / {MAX_MULLIGANS}</Text>
            </Text>
            <Text style={styles.cellHint}>1 per Connect</Text>
          </View>

          <View
            style={[
              styles.statTile,
              statTileShadow,
              slotScarce ? styles.statTileCool : styles.statTileNeutral,
            ]}
          >
            <Text style={styles.cellLabel}>Open match slots</Text>
            <Text style={[styles.cellValue, slotScarce && styles.cellValueCool]}>
              {slotsOpen}
              <Text style={styles.cellValueSuffix}> / {slotLimit}</Text>
            </Text>
            <Text style={styles.cellHint}>Active matches max</Text>
          </View>
        </View>

        {showRefillCountdown ? (
          <View style={styles.footerInset}>
            <View style={styles.refillDot} />
            <Text style={styles.countdownText}>
              Next refill in{' '}
              <Text style={styles.countdownEmph}>{formatCountdown(refillMs)}</Text>
            </Text>
          </View>
        ) : canClaimWeeklyToken && tokensCapped < MAX_MULLIGANS ? (
          <View style={styles.footerInset}>
            <Text style={styles.countdownTextMuted}>
              Weekly Mulligans are available — tap Claim above when you’re ready.
            </Text>
          </View>
        ) : tokensCapped >= MAX_MULLIGANS ? (
          <View style={styles.footerInset}>
            <Text style={styles.countdownTextMuted}>
              You’re maxed on Mulligans. Use one to Connect, then you can refill again.
            </Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  shellOuter: {
    width: '100%',
    marginBottom: 28,
    borderRadius: 22,
    ...Platform.select({
      ios: {
        shadowColor: INK,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.09,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
    }),
  },
  shell: {
    width: '100%',
    borderRadius: 22,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.1)',
  },
  shellLoading: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 18,
    paddingTop: 4,
  },
  eyebrowPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: BURGUNDY_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.18)',
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: 'rgba(107, 13, 46, 0.85)',
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(26, 26, 46, 0.52)',
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 6,
    maxWidth: 320,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statTileNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(26, 26, 46, 0.07)',
  },
  statTileWarm: {
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    borderColor: 'rgba(159, 18, 57, 0.14)',
  },
  statTileCool: {
    backgroundColor: 'rgba(245, 243, 255, 0.95)',
    borderColor: 'rgba(76, 29, 149, 0.12)',
  },
  cellLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.45)',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  cellValue: {
    fontSize: 30,
    fontWeight: '800',
    color: INK,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  cellValueWarm: {
    color: '#9f1239',
  },
  cellValueCool: {
    color: '#5b21b6',
  },
  cellValueSuffix: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.32)',
    fontVariant: ['tabular-nums'],
  },
  cellHint: {
    marginTop: 6,
    fontSize: 10,
    color: 'rgba(26, 26, 46, 0.38)',
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  footerInset: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 46, 0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(26, 26, 46, 0.06)',
    gap: 10,
  },
  refillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BURGUNDY,
    opacity: 0.55,
  },
  countdownText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(26, 26, 46, 0.58)',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  countdownEmph: {
    color: BURGUNDY,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countdownTextMuted: {
    fontSize: 12,
    color: 'rgba(26, 26, 46, 0.46)',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default ConnectLandingScarcity;
