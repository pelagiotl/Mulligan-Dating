import React, { memo, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { launchCountdownTheme } from '../lib/launchCountdownTheme';
import {
  connectSetupGapLeadSub,
  connectSetupGapMessage,
  connectSetupGapModalEmoji,
  connectSetupGapModalTitle,
  connectSetupGapPrimaryActionLabel,
  type ConnectSetupMissing,
} from '../utils/connectSetup';

export type ConnectSetupGapModalGap = Exclude<ConnectSetupMissing, 'photos'>;

export interface ConnectSetupGapModalProps {
  gap: ConnectSetupGapModalGap | null;
  onClose: () => void;
  onPrimaryAction: () => void;
  connectShell: ConnectShellMode;
}

type GapModalChrome = {
  overlay: string;
  handleBar: string;
  rim: readonly [string, string, ...string[]];
  innerBg: string;
  header: readonly [string, string, ...string[]];
  lead: string;
  leadSub: string;
  secondaryText: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  cta: readonly [string, string, ...string[]];
  emojiRing: string;
  emojiRingBorder: string;
};

function gapModalChrome(mode: ConnectShellMode): GapModalChrome {
  const t = launchCountdownTheme(mode);
  if (mode === 'midnight') {
    return {
      overlay: 'rgba(6, 8, 18, 0.78)',
      handleBar: 'rgba(167, 139, 250, 0.55)',
      rim: ['rgba(167, 139, 250, 0.65)', 'rgba(99, 102, 241, 0.45)', 'rgba(236, 72, 153, 0.5)'],
      innerBg: '#1e1b2e',
      header: ['#7c3aed', '#6366f1', '#db2777'],
      lead: t.sub,
      leadSub: '#94a3b8',
      secondaryText: '#94a3b8',
      chipBg: 'rgba(167, 139, 250, 0.18)',
      chipBorder: 'rgba(167, 139, 250, 0.45)',
      chipText: '#e9d5ff',
      cta: ['#a855f7', '#6366f1', '#ec4899'],
      emojiRing: 'rgba(38, 32, 58, 0.95)',
      emojiRingBorder: 'rgba(167, 139, 250, 0.55)',
    };
  }
  if (mode === 'sunny') {
    return {
      overlay: 'rgba(45, 17, 24, 0.55)',
      handleBar: 'rgba(255,255,255,0.4)',
      rim: ['#fbbf24', '#fb923c', '#f472b6', '#38bdf8'],
      innerBg: '#fffefb',
      header: ['#ea580c', '#f59e0b', '#d97706'],
      lead: '#57534e',
      leadSub: '#a8a29e',
      secondaryText: '#a8a29e',
      chipBg: 'rgba(254, 243, 199, 0.98)',
      chipBorder: 'rgba(251, 191, 36, 0.45)',
      chipText: '#9a3412',
      cta: ['#ea580c', '#f59e0b', '#f472b6'],
      emojiRing: 'rgba(255, 251, 235, 0.98)',
      emojiRingBorder: 'rgba(234, 88, 12, 0.4)',
    };
  }
  return {
    overlay: 'rgba(45, 17, 24, 0.62)',
    handleBar: 'rgba(255,255,255,0.4)',
    rim: ['#ec4899', '#f97316', '#eab308', '#a855f7'],
    innerBg: '#fffefb',
    header: ['#be185d', '#ea580c', '#d97706'],
    lead: '#475569',
    leadSub: '#94a3b8',
    secondaryText: '#94a3b8',
    chipBg: 'rgba(253, 242, 248, 0.98)',
    chipBorder: 'rgba(251, 191, 36, 0.4)',
    chipText: '#581c87',
    cta: ['#db2777', '#ea580c', '#f59e0b'],
    emojiRing: 'rgba(255, 241, 245, 0.98)',
    emojiRingBorder: 'rgba(244, 63, 94, 0.4)',
  };
}

const ConnectSetupGapModal = memo(function ConnectSetupGapModal({
  gap,
  onClose,
  onPrimaryAction,
  connectShell,
}: ConnectSetupGapModalProps) {
  const chrome = useMemo(() => gapModalChrome(connectShell), [connectShell]);
  const visible = gap != null;
  const leadSub = gap ? connectSetupGapLeadSub(gap) : null;

  if (!gap) return null;

  const emoji = connectSetupGapModalEmoji(gap);
  const title = connectSetupGapModalTitle(gap);
  const message = connectSetupGapMessage(gap);
  const primaryLabel = connectSetupGapPrimaryActionLabel(gap);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: chrome.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            style={[styles.handleBar, { backgroundColor: chrome.handleBar }]}
            accessibilityElementsHidden
          />

          <LinearGradient
            colors={chrome.rim}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.rim,
              connectShell === 'midnight' && Platform.OS === 'ios' ? { shadowColor: '#7c3aed' } : null,
            ]}
          >
            <View style={[styles.inner, { backgroundColor: chrome.innerBg }]}>
              <LinearGradient
                colors={chrome.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
              >
                <Text style={styles.kicker}>One quick step</Text>
                <Text style={styles.title}>{title}</Text>
              </LinearGradient>

              <View style={styles.body}>
                <View
                  style={[
                    styles.emojiRing,
                    {
                      backgroundColor: chrome.emojiRing,
                      borderColor: chrome.emojiRingBorder,
                    },
                  ]}
                  accessibilityElementsHidden
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </View>

                <Text style={[styles.lead, { color: chrome.lead }]}>{message}</Text>

                {leadSub ? (
                  <Text style={[styles.leadSub, { color: chrome.leadSub }]}>{leadSub}</Text>
                ) : null}

                {gap === 'age' ? (
                  <View style={styles.chips}>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: chrome.chipBg, borderColor: chrome.chipBorder },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: chrome.chipText }]}>⚡ Quick edit</Text>
                    </View>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: chrome.chipBg, borderColor: chrome.chipBorder },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: chrome.chipText }]}>🎯 Better matches</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={onPrimaryAction}
                  activeOpacity={0.88}
                  style={styles.primaryTouchable}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <LinearGradient
                    colors={chrome.cta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryText}>{primaryLabel} →</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.secondaryBtn}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryText, { color: chrome.secondaryText }]}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

export default ConnectSetupGapModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
  },
  handleBar: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  rim: {
    borderRadius: 22,
    padding: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  inner: {
    borderRadius: 19,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'center',
  },
  emojiRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#a855f7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  emoji: {
    fontSize: 34,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  leadSub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
  },
  chip: {
    marginHorizontal: 4,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
  },
  primaryTouchable: {
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#f43f5e',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  primaryGradient: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: 10,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
