import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';

const TOKEN_MAX = 7;

export interface BrowseConnectLandingTokenStripProps {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate?: string | null;
  connectShell: ConnectShellMode;
  claiming: boolean;
  error: string;
  success: string;
  onClaim: () => void;
  onBuyPress: () => void;
}

/**
 * Full-width “Mulligan tokens available” card for Connect landing — mirrors web
 * `.browse-connect-landing-token .token-display-card` + connect-shell-theme overrides.
 */
export default function BrowseConnectLandingTokenStrip({
  availableTokens,
  canClaimWeeklyToken,
  nextRefillDate,
  connectShell,
  claiming,
  error,
  success,
  onClaim,
  onBuyPress,
}: BrowseConnectLandingTokenStripProps) {
  const meterPct = Math.min(100, (availableTokens / TOKEN_MAX) * 100);
  const midnight = connectShell === 'midnight';

  const refillFormatted =
    nextRefillDate &&
    (() => {
      try {
        return new Date(nextRefillDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      } catch {
        return null;
      }
    })();

  const cannotClaimFull =
    availableTokens >= TOKEN_MAX
      ? `You're at your maximum of ${TOKEN_MAX} tokens. Use them to match with people!`
      : refillFormatted
        ? `Next weekly refill: ${refillFormatted}. You'll get up to ${TOKEN_MAX} tokens.`
        : "Weekly tokens aren't ready to claim yet. Check back after your refill date.";

  const headerColors = midnight
    ? (['#553c9a', '#6b21a8', '#863bb9'] as const)
    : (['#667eea', '#764ba2', '#f093fb'] as const);

  return (
    <View
      style={[styles.cardOuter, midnight ? styles.cardOuterMidnight : styles.cardOuterSoft]}
      accessibilityRole="summary"
      accessibilityLabel="Mulligan tokens"
    >
      <LinearGradient colors={headerColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.headerEmoji} allowFontScaling={false}>
          🎟️
        </Text>
        <View style={styles.countRow}>
          <Text style={styles.headerNumber}>{availableTokens}</Text>
          <Text style={styles.headerCap}>/ {TOKEN_MAX}</Text>
        </View>
        <Text style={styles.headerLabel}>
          Mulligan Token{availableTokens !== 1 ? 's' : ''} available
        </Text>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${meterPct}%` }]} />
        </View>
      </LinearGradient>

      <View style={[styles.body, midnight ? styles.bodyMidnight : styles.bodySoft]}>
        {error ? (
          <View style={styles.banner}>
            <Text style={[styles.bannerText, midnight && styles.bannerTextMidnight]}>⚠️ {error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.bannerSuccess}>
            <Text style={[styles.bannerText, midnight && styles.bannerTextMidnight]}>✅ {success}</Text>
          </View>
        ) : null}

        {canClaimWeeklyToken ? (
          <TouchableOpacity
            style={[styles.claimBtn, claiming && styles.claimBtnDisabled]}
            onPress={onClaim}
            disabled={claiming}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={claiming ? ['#94a3b8', '#64748b'] : ['#667eea', '#764ba2', '#f093fb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.claimGradient}
            >
              {claiming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.claimBtnText}>✨ Claim Weekly Tokens</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.cannotClaim, midnight && styles.cannotClaimMidnight]}>{cannotClaimFull}</Text>
        )}

        {availableTokens <= 1 ? (
          <TouchableOpacity onPress={onBuyPress} activeOpacity={0.9} style={styles.buyWrap}>
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buyGradient}
            >
              <Text style={styles.buyText}>💳 Cop some more</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.footerHint, midnight && styles.footerHintMidnight]}>
          Use tokens to match with people. Get {TOKEN_MAX} tokens weekly (up to {TOKEN_MAX} max).
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    width: '100%',
    borderRadius: 26,
    overflow: 'hidden',
  },
  cardOuterMidnight: {
    borderWidth: 2,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 14,
  },
  cardOuterSoft: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  headerEmoji: {
    fontSize: 22,
    marginBottom: 4,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headerCap: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  headerLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
  },
  meterTrack: {
    marginTop: 10,
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  body: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 8,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  bodyMidnight: {
    backgroundColor: 'rgba(18, 16, 28, 0.92)',
  },
  bodySoft: {
    backgroundColor: '#fff',
  },
  banner: {
    paddingVertical: 6,
  },
  bannerSuccess: {
    paddingVertical: 4,
  },
  bannerText: {
    fontSize: 13,
    color: '#b45309',
    fontWeight: '600',
  },
  bannerTextMidnight: {
    color: '#fde68a',
  },
  cannotClaim: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    fontWeight: '500',
    textAlign: 'center',
  },
  cannotClaimMidnight: {
    color: '#e2e8f0',
  },
  claimBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  claimBtnDisabled: {
    opacity: 0.85,
  },
  claimGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  buyWrap: {
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  buyGradient: {
    paddingVertical: 11,
    alignItems: 'center',
  },
  buyText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  footerHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
  },
  footerHintMidnight: {
    color: '#94a3b8',
  },
});
