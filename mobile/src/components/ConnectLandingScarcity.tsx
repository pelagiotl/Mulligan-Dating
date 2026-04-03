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
            <Text style={styles.taglineLead}>Every Connect uses one Mulligan.</Text>
            {'\n'}
            <Text style={styles.taglineSoft}>You have </Text>
            <Text style={styles.taglineFraction}>{tokensCapped}</Text>
            <Text style={styles.taglineFractionMuted}>/{MAX_MULLIGANS}</Text>
            <Text style={styles.taglineSoft}> left this week.</Text>
          </Text>
          {showRefillCountdown ? (
            <View style={styles.countdownRibbon} accessibilityLiveRegion="polite">
              <Text style={styles.countdownRibbonLabel}>Next refill in</Text>
              <Text style={styles.countdownRibbonTime}>
                {refillMs != null ? formatCountdown(refillMs) : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.row}>
          <View
            style={[
              styles.statTile,
              styles.statTilePrimary,
              statTileShadow,
              tokenScarce ? styles.statTileWarm : styles.statTileNeutral,
            ]}
          >
            <Text style={styles.cellLabel}>Mulligans ready</Text>
            <Text style={[styles.cellValueHero, tokenScarce && styles.cellValueWarm]}>
              {tokensCapped}
              <Text style={styles.cellValueHeroSuffix}> / {MAX_MULLIGANS}</Text>
            </Text>
          </View>

          <View
            style={[
              styles.statTile,
              styles.statTileSecondary,
              statTileShadow,
              slotScarce ? styles.statTileCool : styles.statTileNeutral,
            ]}
          >
            <Text style={styles.cellLabelSecondary}>Open connections</Text>
            <Text style={[styles.cellValueSlot, slotScarce && styles.cellValueCool]}>
              {slotsOpen}
              <Text style={styles.cellValueSlotSuffix}> / {slotLimit}</Text>
            </Text>
          </View>
        </View>

        {canClaimWeeklyToken && tokensCapped < MAX_MULLIGANS ? (
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
    marginBottom: 18,
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
    marginBottom: 14,
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
    textAlign: 'center',
    paddingHorizontal: 6,
    alignSelf: 'center',
  },
  taglineLead: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(26, 26, 46, 0.58)',
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  taglineSoft: {
    fontSize: 12,
    lineHeight: 20,
    color: 'rgba(26, 26, 46, 0.48)',
    fontWeight: '500',
  },
  taglineFraction: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: BURGUNDY,
    fontVariant: ['tabular-nums'],
  },
  taglineFractionMuted: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.35)',
    fontVariant: ['tabular-nums'],
  },
  countdownRibbon: {
    marginTop: 12,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 21, 56, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139, 21, 56, 0.12)',
  },
  countdownRibbonLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(107, 13, 46, 0.65)',
    textTransform: 'uppercase',
  },
  countdownRibbonTime: {
    fontSize: 14,
    fontWeight: '800',
    color: BURGUNDY,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statTilePrimary: {
    paddingVertical: 14,
    minWidth: 0,
  },
  statTileSecondary: {
    paddingVertical: 12,
    minWidth: 0,
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
  cellLabelSecondary: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.4)',
    marginBottom: 6,
    letterSpacing: 0.15,
    textAlign: 'center',
  },
  cellValueHero: {
    fontSize: 40,
    fontWeight: '900',
    color: INK,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  cellValueHeroSuffix: {
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(26, 26, 46, 0.28)',
    fontVariant: ['tabular-nums'],
  },
  cellValueSlot: {
    fontSize: 26,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  cellValueSlotSuffix: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(26, 26, 46, 0.3)',
    fontVariant: ['tabular-nums'],
  },
  cellValueWarm: {
    color: '#9f1239',
  },
  cellValueCool: {
    color: '#5b21b6',
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
  countdownTextMuted: {
    fontSize: 12,
    color: 'rgba(26, 26, 46, 0.46)',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
});

export default ConnectLandingScarcity;
