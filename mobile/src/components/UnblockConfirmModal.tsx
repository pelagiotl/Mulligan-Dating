import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';

export type UnblockConfirmVariant = 'user' | 'phone';

type Props = {
  visible: boolean;
  label: string;
  variant?: UnblockConfirmVariant;
  connectShell: ConnectShellMode;
  unblocking?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function unblockConfirmTheme(shell: ConnectShellMode) {
  switch (shell) {
    case 'midnight':
      return {
        cardBg: '#1a1528',
        cardBorder: 'rgba(129, 140, 248, 0.32)',
        headerGradient: ['#4338ca', '#6366f1', '#7c3aed', '#6d28d9'] as const,
        iconBg: ['rgba(224, 231, 255, 0.95)', 'rgba(199, 210, 254, 0.9)'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.88)',
        bodyBg: 'rgba(38, 32, 52, 0.85)',
        bodyBorder: 'rgba(129, 140, 248, 0.22)',
        bodyText: '#e2e8f0',
        bullet: '#a5b4fc',
        hint: 'rgba(148, 163, 184, 0.9)',
        cancelBg: 'rgba(38, 32, 52, 0.9)',
        cancelBorder: 'rgba(129, 140, 248, 0.35)',
        cancelText: '#e2e8f0',
        confirmGradient: ['#6366f1', '#7c3aed', '#5b21b6'] as const,
        confirmText: '#fff',
        shadow: '#000',
      };
    case 'sunny':
      return {
        cardBg: '#fffefb',
        cardBorder: 'rgba(99, 102, 241, 0.32)',
        headerGradient: ['#4f46e5', '#6366f1', '#7c3aed', '#6d28d9'] as const,
        iconBg: ['#eef2ff', '#e0e7ff'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.92)',
        bodyBg: 'rgba(238, 242, 255, 0.95)',
        bodyBorder: 'rgba(99, 102, 241, 0.28)',
        bodyText: '#44403c',
        bullet: '#4f46e5',
        hint: '#78716c',
        cancelBg: 'rgba(0, 0, 0, 0.05)',
        cancelBorder: 'rgba(0, 0, 0, 0.08)',
        cancelText: '#44403c',
        confirmGradient: ['#4f46e5', '#6366f1', '#5b21b6'] as const,
        confirmText: '#fff',
        shadow: '#312e81',
      };
    default:
      return {
        cardBg: '#ffffff',
        cardBorder: 'rgba(102, 126, 234, 0.28)',
        headerGradient: ['#667eea', '#6366f1', '#7c3aed', '#6d28d9'] as const,
        iconBg: ['#f8fafc', '#e0e7ff'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.92)',
        bodyBg: 'rgba(248, 250, 252, 0.98)',
        bodyBorder: 'rgba(102, 126, 234, 0.2)',
        bodyText: '#334155',
        bullet: '#667eea',
        hint: '#64748b',
        cancelBg: 'rgba(0, 0, 0, 0.05)',
        cancelBorder: 'rgba(0, 0, 0, 0.08)',
        cancelText: '#334155',
        confirmGradient: ['#667eea', '#7c3aed', '#5b21b6'] as const,
        confirmText: '#fff',
        shadow: '#4c1d95',
      };
  }
}

const USER_BULLETS = [
  'May appear in Browse again',
  'You could match and chat again',
  'You can block again anytime',
] as const;

const PHONE_BULLETS = [
  'Removed from your block list',
  'This number can be used on Mulligan again',
  'You can block the number again anytime',
] as const;

export default function UnblockConfirmModal({
  visible,
  label,
  variant = 'user',
  connectShell,
  unblocking = false,
  onCancel,
  onConfirm,
}: Props) {
  const theme = useMemo(() => unblockConfirmTheme(connectShell), [connectShell]);
  const name = label.trim() || (variant === 'phone' ? 'this number' : 'this person');
  const bullets = variant === 'phone' ? PHONE_BULLETS : USER_BULLETS;
  const title = `Unblock ${name}?`;
  const subtitle =
    variant === 'phone'
      ? 'They will no longer be blocked by phone on Mulligan.'
      : 'They may show up in Browse again — and you could match.';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.cardTouch} onPress={(e) => e.stopPropagation()}>
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
              <LinearGradient
                colors={[...theme.iconBg]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBadge}
              >
                <Text style={styles.iconEmoji} allowFontScaling={false}>
                  🔓
                </Text>
              </LinearGradient>
              <Text style={[styles.headerTitle, { color: theme.title }]}>{title}</Text>
              <Text style={[styles.headerSubtitle, { color: theme.subtitle }]}>{subtitle}</Text>
            </LinearGradient>

            <View style={styles.body}>
              <View
                style={[
                  styles.infoCard,
                  { backgroundColor: theme.bodyBg, borderColor: theme.bodyBorder },
                ]}
              >
                {bullets.map((line) => (
                  <View key={line} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: theme.bullet }]}>•</Text>
                    <Text style={[styles.bulletText, { color: theme.bodyText }]}>{line}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.hint, { color: theme.hint }]}>
                {variant === 'phone'
                  ? 'Only affects blocking by phone number.'
                  : 'Your past match history is not restored automatically.'}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: theme.cancelBg,
                    borderColor: theme.cancelBorder,
                  },
                ]}
                onPress={onCancel}
                disabled={unblocking}
                activeOpacity={0.85}
              >
                <Text style={[styles.cancelText, { color: theme.cancelText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onConfirm}
                disabled={unblocking}
                activeOpacity={0.9}
                style={styles.confirmBtnWrap}
              >
                <LinearGradient
                  colors={[...theme.confirmGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionBtn, styles.confirmBtn]}
                >
                  {unblocking ? (
                    <ActivityIndicator color={theme.confirmText} size="small" />
                  ) : (
                    <Text style={[styles.confirmText, { color: theme.confirmText }]}>Unblock</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  iconEmoji: {
    fontSize: 24,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 6,
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
    gap: 8,
  },
  bulletDot: {
    fontSize: 14,
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
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 48,
  },
  confirmBtnWrap: {
    flex: 1,
  },
  confirmBtn: {
    borderWidth: 0,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
