import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { launchCountdownTheme } from '../lib/launchCountdownTheme';

export const DEFAULT_MATCHMAKING_PAUSED_MESSAGE =
  "Matching isn't open yet. Check back on launch day!";

function splitMessage(message: string): { title: string; body: string } {
  const trimmed = message.trim();
  if (!trimmed) {
    return { title: 'Matching isn\u2019t open yet', body: 'Check back on launch day!' };
  }
  const dot = trimmed.indexOf('. ');
  if (dot > 0 && dot < trimmed.length - 2) {
    return {
      title: trimmed.slice(0, dot + 1).trim(),
      body: trimmed.slice(dot + 2).trim(),
    };
  }
  return { title: trimmed, body: 'We\u2019ll turn on Connect when we launch.' };
}

type ShellChrome = {
  frameGradient: readonly [string, string, ...string[]];
  frameBorder: string;
  cardGradient: readonly [string, string, ...string[]];
  accentGradient: readonly [string, string, ...string[]];
  title: string;
  body: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
  shadowColor: string;
};

function shellChrome(mode: ConnectShellMode): ShellChrome {
  const t = launchCountdownTheme(mode);
  if (mode === 'midnight') {
    return {
      frameGradient: ['rgba(167, 139, 250, 0.55)', 'rgba(99, 102, 241, 0.35)', 'rgba(236, 72, 153, 0.4)'],
      frameBorder: t.expandedBorder,
      cardGradient: ['rgba(38, 32, 58, 0.98)', 'rgba(24, 20, 38, 0.99)', 'rgba(30, 27, 46, 0.97)'],
      accentGradient: ['#a855f7', '#6366f1', '#ec4899'],
      title: t.heading,
      body: t.sub,
      chipBg: 'rgba(167, 139, 250, 0.18)',
      chipText: '#e9d5ff',
      chipBorder: 'rgba(167, 139, 250, 0.45)',
      shadowColor: '#000',
    };
  }
  if (mode === 'sunny') {
    return {
      frameGradient: ['rgba(251, 191, 36, 0.65)', 'rgba(251, 146, 60, 0.45)', 'rgba(56, 189, 248, 0.35)'],
      frameBorder: t.expandedBorder,
      cardGradient: ['#ffffff', '#fffbeb', '#fef3c7'],
      accentGradient: ['#fbbf24', '#fb923c', '#38bdf8'],
      title: t.heading,
      body: t.sub,
      chipBg: 'rgba(251, 191, 36, 0.22)',
      chipText: '#9a3412',
      chipBorder: 'rgba(251, 146, 60, 0.45)',
      shadowColor: '#ea580c',
    };
  }
  return {
    frameGradient: ['rgba(102, 126, 234, 0.5)', 'rgba(168, 85, 247, 0.4)', 'rgba(236, 72, 153, 0.35)'],
    frameBorder: t.expandedBorder,
    cardGradient: ['#ffffff', '#f8faff', '#f3f4ff'],
    accentGradient: ['#667eea', '#764ba2', '#f093fb'],
    title: t.heading,
    body: t.sub,
    chipBg: 'rgba(129, 140, 248, 0.14)',
    chipText: '#4c1d95',
    chipBorder: 'rgba(129, 140, 248, 0.4)',
    shadowColor: '#6366f1',
  };
}

export interface MatchmakingPausedCardProps {
  message?: string | null;
  connectShell: ConnectShellMode;
}

const MatchmakingPausedCard = memo(function MatchmakingPausedCard({
  message,
  connectShell,
}: MatchmakingPausedCardProps) {
  const chrome = useMemo(() => shellChrome(connectShell), [connectShell]);
  const { title, body } = useMemo(
    () => splitMessage(message?.trim() || DEFAULT_MATCHMAKING_PAUSED_MESSAGE),
    [message],
  );

  return (
    <View
      style={[styles.wrap, Platform.OS === 'android' ? styles.wrapAndroid : styles.wrapIos]}
      accessibilityRole="summary"
      accessibilityLabel={`${title} ${body}`}
    >
      <LinearGradient
        colors={chrome.frameGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.frame, { borderColor: chrome.frameBorder }]}
      >
        <LinearGradient
          colors={chrome.cardGradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.sheen}
            pointerEvents="none"
          />

          <View style={styles.badgeRow}>
            <LinearGradient
              colors={chrome.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBadge}
            >
              <Text style={styles.iconEmoji} allowFontScaling={false}>
                ⏳
              </Text>
            </LinearGradient>
            <View
              style={[
                styles.chip,
                { backgroundColor: chrome.chipBg, borderColor: chrome.chipBorder },
              ]}
            >
              <Text style={[styles.chipText, { color: chrome.chipText }]}>June 6 launch</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: chrome.title }]}>{title}</Text>
          <Text style={[styles.body, { color: chrome.body }]}>{body}</Text>

          <View style={styles.footerRow}>
            <Text style={[styles.footerDot, { color: chrome.accentGradient[0] }]}>
              ●
            </Text>
            <Text style={[styles.footer, { color: chrome.body }]}>
              Your profile & tokens are ready — matching unlocks at launch
            </Text>
          </View>
        </LinearGradient>
      </LinearGradient>
    </View>
  );
});

export default MatchmakingPausedCard;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 4,
    marginBottom: 8,
  },
  wrapAndroid: {
    elevation: 0,
  },
  wrapIos: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  frame: {
    borderRadius: 22,
    padding: 2,
    borderWidth: 1,
  },
  card: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    height: '42%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
    }),
  },
  iconEmoji: {
    fontSize: 26,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
  },
  footerDot: {
    fontSize: 10,
    lineHeight: 20,
    marginTop: 1,
  },
  footer: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    opacity: 0.92,
  },
});
