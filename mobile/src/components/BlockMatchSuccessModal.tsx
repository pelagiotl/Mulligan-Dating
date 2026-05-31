import React, { useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';

type Props = {
  visible: boolean;
  displayName: string;
  connectShell: ConnectShellMode;
  onDismiss: () => void;
};

function blockSuccessTheme(shell: ConnectShellMode) {
  switch (shell) {
    case 'midnight':
      return {
        cardBg: '#1a1528',
        cardBorder: 'rgba(52, 211, 153, 0.32)',
        headerGradient: ['#0f766e', '#059669', '#047857', '#065f46'] as const,
        iconBg: ['rgba(209, 250, 229, 0.95)', 'rgba(167, 243, 208, 0.9)'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.9)',
        bodyBg: 'rgba(38, 32, 52, 0.85)',
        bodyBorder: 'rgba(52, 211, 153, 0.22)',
        bodyText: '#e2e8f0',
        bullet: '#6ee7b7',
        hint: 'rgba(148, 163, 184, 0.9)',
        btnGradient: ['#059669', '#10b981', '#34d399'] as const,
        btnText: '#fff',
        shadow: '#000',
      };
    case 'sunny':
      return {
        cardBg: '#fffefb',
        cardBorder: 'rgba(16, 185, 129, 0.35)',
        headerGradient: ['#0d9488', '#059669', '#10b981', '#34d399'] as const,
        iconBg: ['#ecfdf5', '#d1fae5'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.94)',
        bodyBg: 'rgba(236, 253, 245, 0.95)',
        bodyBorder: 'rgba(16, 185, 129, 0.3)',
        bodyText: '#44403c',
        bullet: '#059669',
        hint: '#78716c',
        btnGradient: ['#059669', '#10b981', '#047857'] as const,
        btnText: '#fff',
        shadow: '#065f46',
      };
    default:
      return {
        cardBg: '#ffffff',
        cardBorder: 'rgba(16, 185, 129, 0.28)',
        headerGradient: ['#0d9488', '#059669', '#10b981', '#34d399'] as const,
        iconBg: ['#f0fdf4', '#d1fae5'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.94)',
        bodyBg: 'rgba(240, 253, 244, 0.98)',
        bodyBorder: 'rgba(16, 185, 129, 0.22)',
        bodyText: '#334155',
        bullet: '#059669',
        hint: '#64748b',
        btnGradient: ['#059669', '#10b981', '#047857'] as const,
        btnText: '#fff',
        shadow: '#065f46',
      };
  }
}

const BULLETS = [
  'Removed from your matches',
  "Won't appear in Browse",
  'Unblock anytime in Settings',
] as const;

export default function BlockMatchSuccessModal({
  visible,
  displayName,
  connectShell,
  onDismiss,
}: Props) {
  const theme = useMemo(() => blockSuccessTheme(connectShell), [connectShell]);
  const name = displayName.trim() || 'This person';
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.92);
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, scale]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <Animated.View style={[styles.cardTouch, { transform: [{ scale }] }]}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.cardBg,
                  borderColor: theme.cardBorder,
                  shadowColor: theme.shadow,
                },
              ]}
            >
              <LinearGradient
                colors={[...theme.headerGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
              >
                <View style={styles.headerGlow} pointerEvents="none" />
                <View style={styles.headerGlowSecondary} pointerEvents="none" />
                <LinearGradient
                  colors={[...theme.iconBg]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.iconBadge}
                >
                  <Text style={styles.iconEmoji} allowFontScaling={false}>
                    ✓
                  </Text>
                </LinearGradient>
                <Text style={[styles.headerTitle, { color: theme.title }]}>You&apos;re all set</Text>
                <Text style={[styles.headerSubtitle, { color: theme.subtitle }]}>
                  {name} has been blocked.
                </Text>
              </LinearGradient>

              <View style={styles.body}>
                <View
                  style={[
                    styles.infoCard,
                    { backgroundColor: theme.bodyBg, borderColor: theme.bodyBorder },
                  ]}
                >
                  {BULLETS.map((line) => (
                    <View key={line} style={styles.bulletRow}>
                      <Text style={[styles.bulletDot, { color: theme.bullet }]}>✓</Text>
                      <Text style={[styles.bulletText, { color: theme.bodyText }]}>{line}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.hint, { color: theme.hint }]}>
                  They weren&apos;t notified. Your block list is private.
                </Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity onPress={onDismiss} activeOpacity={0.9} style={styles.doneBtnWrap}>
                  <LinearGradient
                    colors={[...theme.btnGradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.doneBtn}
                  >
                    <Text style={[styles.doneText, { color: theme.btnText }]}>Got it</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    justifyContent: 'center',
    padding: 20,
  },
  cardTouch: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: Platform.OS === 'android' ? 2 : 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: -36,
    right: -24,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  headerGlowSecondary: {
    position: 'absolute',
    bottom: -20,
    left: -16,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  iconEmoji: {
    fontSize: 28,
    fontWeight: '900',
    color: '#047857',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 4,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  doneBtnWrap: {
    width: '100%',
  },
  doneBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
