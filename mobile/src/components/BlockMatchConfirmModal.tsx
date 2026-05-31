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

type Props = {
  visible: boolean;
  displayName: string;
  connectShell: ConnectShellMode;
  blocking?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function blockConfirmTheme(shell: ConnectShellMode) {
  switch (shell) {
    case 'midnight':
      return {
        cardBg: '#1a1528',
        cardBorder: 'rgba(167, 139, 250, 0.28)',
        headerGradient: ['#475569', '#64748b', '#9f1239', '#be123c'] as const,
        iconBg: ['rgba(254, 226, 226, 0.95)', 'rgba(254, 202, 202, 0.9)'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.88)',
        bodyBg: 'rgba(38, 32, 52, 0.85)',
        bodyBorder: 'rgba(167, 139, 250, 0.22)',
        bodyText: '#e2e8f0',
        bullet: '#fda4af',
        hint: 'rgba(148, 163, 184, 0.9)',
        cancelBg: 'rgba(38, 32, 52, 0.9)',
        cancelBorder: 'rgba(167, 139, 250, 0.35)',
        cancelText: '#e2e8f0',
        blockGradient: ['#9f1239', '#be123c', '#e11d48'] as const,
        blockText: '#fff',
        shadow: '#000',
      };
    case 'sunny':
      return {
        cardBg: '#fffefb',
        cardBorder: 'rgba(251, 191, 36, 0.35)',
        headerGradient: ['#78716c', '#a8a29e', '#ea580c', '#dc2626'] as const,
        iconBg: ['#fff7ed', '#fecaca'] as const,
        title: '#fff',
        subtitle: 'rgba(255, 255, 255, 0.92)',
        bodyBg: 'rgba(255, 251, 235, 0.95)',
        bodyBorder: 'rgba(251, 191, 36, 0.35)',
        bodyText: '#44403c',
        bullet: '#ea580c',
        hint: '#78716c',
        cancelBg: 'rgba(0, 0, 0, 0.05)',
        cancelBorder: 'rgba(0, 0, 0, 0.08)',
        cancelText: '#44403c',
        blockGradient: ['#dc2626', '#ea580c', '#b91c1c'] as const,
        blockText: '#fff',
        shadow: '#9a3412',
      };
    default:
      return {
        cardBg: '#ffffff',
        cardBorder: 'rgba(148, 163, 184, 0.35)',
        headerGradient: ['#64748b', '#667eea', '#be123c', '#e11d48'] as const,
        iconBg: ['#f8fafc', '#fee2e2'] as const,
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
        blockGradient: ['#be123c', '#e11d48', '#9f1239'] as const,
        blockText: '#fff',
        shadow: '#4c1d95',
      };
  }
}

const BULLETS = [
  'Removed from your matches right away',
  "Won't show up in your Browse",
  'You can unblock later in Settings',
] as const;

export default function BlockMatchConfirmModal({
  visible,
  displayName,
  connectShell,
  blocking = false,
  onCancel,
  onConfirm,
}: Props) {
  const theme = useMemo(() => blockConfirmTheme(connectShell), [connectShell]);
  const name = displayName.trim() || 'this person';

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
                  🚫
                </Text>
              </LinearGradient>
              <Text style={[styles.headerTitle, { color: theme.title }]}>Block {name}?</Text>
              <Text style={[styles.headerSubtitle, { color: theme.subtitle }]}>
                This keeps your experience safe and intentional.
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
                    <Text style={[styles.bulletDot, { color: theme.bullet }]}>•</Text>
                    <Text style={[styles.bulletText, { color: theme.bodyText }]}>{line}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.hint, { color: theme.hint }]}>
                They won&apos;t be notified that you blocked them.
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
                disabled={blocking}
                activeOpacity={0.85}
              >
                <Text style={[styles.cancelText, { color: theme.cancelText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onConfirm}
                disabled={blocking}
                activeOpacity={0.9}
                style={styles.blockBtnWrap}
              >
                <LinearGradient
                  colors={[...theme.blockGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.actionBtn, styles.blockBtn]}
                >
                  {blocking ? (
                    <ActivityIndicator color={theme.blockText} size="small" />
                  ) : (
                    <Text style={[styles.blockText, { color: theme.blockText }]}>Block</Text>
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
  blockBtnWrap: {
    flex: 1,
  },
  blockBtn: {
    borderWidth: 0,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
  },
  blockText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
