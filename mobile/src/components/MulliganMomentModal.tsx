/**
 * Styled confirm prompt for Mulligan Moment (conversation reset + AI opener).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface MulliganMomentModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

const FEATURES = [
  'Fresh AI opener tuned to your shared interests',
  'Great when the chat went quiet or stale',
  'Paste it into chat and kick things off again',
];

export default function MulliganMomentModal({
  visible,
  onCancel,
  onConfirm,
  confirming = false,
}: MulliganMomentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.cardOuter}>
          <LinearGradient
            colors={['#1a0b22', '#2d1240', '#4a1452', '#351048']}
            locations={[0, 0.35, 0.72, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            <LinearGradient
              colors={['rgba(255,0,128,0.32)', 'transparent', 'rgba(124,77,255,0.22)']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.cardGlow}
            />
            <View style={styles.handleBar} />

            <View style={styles.emojiRing}>
              <LinearGradient
                colors={['#f093fb', '#f5576c', '#667eea']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emojiRingGradient}
              >
                <View style={styles.emojiInner}>
                  <Text style={styles.emoji}>🔄</Text>
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.kicker}>MULLIGAN MOMENT</Text>
            <Text style={styles.title}>Need a fresh start?</Text>
            <Text style={styles.subtitle}>
              We{"'"}ll cook up a bold new opener based on your vibes and what you have in common.
            </Text>

            <View style={styles.featuresPill}>
              {FEATURES.map((line) => (
                <View key={line} style={styles.featureRow}>
                  <Text style={styles.featureBullet}>✨</Text>
                  <Text style={styles.featureText}>{line}</Text>
                </View>
              ))}
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={onCancel}
                disabled={confirming}
                activeOpacity={0.85}
                style={[styles.cancelTouchable, confirming && styles.buttonDisabled]}
              >
                <Text style={styles.cancelText}>Not now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onConfirm}
                disabled={confirming}
                activeOpacity={0.88}
                style={[styles.confirmTouchable, confirming && styles.buttonDisabled]}
              >
                <LinearGradient
                  colors={['#f5576c', '#f093fb', '#667eea']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmGradient}
                >
                  {confirming ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmText}>Get my opener</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 2, 12, 0.74)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  cardOuter: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    ...Platform.select({
      ios: {
        shadowColor: '#f5576c',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.45,
        shadowRadius: 28,
      },
      android: { elevation: 18 },
    }),
  },
  cardGradient: {
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 22,
    borderRadius: 26,
    position: 'relative',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
  },
  handleBar: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginBottom: 18,
  },
  emojiRing: {
    alignSelf: 'center',
    marginBottom: 14,
  },
  emojiRingGradient: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiInner: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    backgroundColor: '#1a0b22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 34,
  },
  kicker: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
    color: 'rgba(255, 182, 220, 0.95)',
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginBottom: 10,
    lineHeight: 28,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 21,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  featuresPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  featureBullet: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  cancelTouchable: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.3,
  },
  confirmTouchable: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#f5576c',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  confirmGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    minHeight: 48,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
