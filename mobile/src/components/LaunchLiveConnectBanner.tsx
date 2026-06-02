import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { LAUNCH_LIVE_BANNER_MESSAGE } from '../utils/launchLiveConnectPrompt';

type Props = {
  shell: ConnectShellMode;
  onConnect: () => void;
  onDismiss: () => void;
  connecting?: boolean;
};

const SHELL: Record<
  ConnectShellMode,
  { border: string; message: string; dismiss: string; cta: readonly [string, string, ...string[]] }
> = {
  midnight: {
    border: 'rgba(52, 211, 153, 0.45)',
    message: '#ecfdf5',
    dismiss: 'rgba(236, 253, 245, 0.75)',
    cta: ['#6ee7b7', '#34d399'],
  },
  sunny: {
    border: 'rgba(234, 88, 12, 0.35)',
    message: '#7c2d12',
    dismiss: 'rgba(124, 45, 18, 0.7)',
    cta: ['#fbbf24', '#fb923c'],
  },
  soft: {
    border: 'rgba(244, 114, 182, 0.35)',
    message: '#4c1d34',
    dismiss: 'rgba(76, 29, 52, 0.65)',
    cta: ['#f472b6', '#fda4af'],
  },
};

export default function LaunchLiveConnectBanner({ shell, onConnect, onDismiss, connecting }: Props) {
  const palette = SHELL[shell];

  return (
    <View
      style={[styles.wrap, { borderColor: palette.border }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.badge} accessibilityElementsHidden>
        🎉
      </Text>
      <Text style={[styles.message, { color: palette.message }]}>{LAUNCH_LIVE_BANNER_MESSAGE}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={onConnect}
          disabled={connecting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={connecting ? 'Connecting' : 'Connect'}
        >
          <LinearGradient colors={palette.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
            <Text style={styles.ctaText}>{connecting ? 'Connecting…' : 'Connect'}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Dismiss launch message"
        >
          <Text style={[styles.dismiss, { color: palette.dismiss }]}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  badge: {
    fontSize: 20,
    marginBottom: 4,
  },
  message: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cta: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#052e16',
  },
  dismiss: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
