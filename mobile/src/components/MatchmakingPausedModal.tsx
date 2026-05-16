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
import MatchmakingPausedCard from './MatchmakingPausedCard';

export interface MatchmakingPausedModalProps {
  visible: boolean;
  onClose: () => void;
  connectShell: ConnectShellMode;
  message?: string | null;
}

function ctaGradient(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  if (mode === 'midnight') return ['#a855f7', '#6366f1', '#ec4899'];
  if (mode === 'sunny') return ['#fbbf24', '#fb923c', '#38bdf8'];
  return ['#667eea', '#764ba2', '#f093fb'];
}

const MatchmakingPausedModal = memo(function MatchmakingPausedModal({
  visible,
  onClose,
  connectShell,
  message,
}: MatchmakingPausedModalProps) {
  const theme = useMemo(() => launchCountdownTheme(connectShell), [connectShell]);
  const ctaColors = useMemo(() => ctaGradient(connectShell), [connectShell]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <View style={styles.handleBar} accessibilityElementsHidden />
          <MatchmakingPausedCard connectShell={connectShell} message={message} />
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.88}
            style={styles.ctaTouchable}
            accessibilityRole="button"
            accessibilityLabel="Got it"
          >
            <LinearGradient
              colors={ctaColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.ctaGradient, { borderColor: theme.expandedBorder }]}
            >
              <Text style={styles.ctaText}>Got it</Text>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

export default MatchmakingPausedModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
  },
  handleBar: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 14,
  },
  ctaTouchable: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  ctaGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
