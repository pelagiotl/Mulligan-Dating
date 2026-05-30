/**
 * Styled modal for chat photo/video/voice lock (3 messages each) — matches TruthOrDareMessageGateModal aesthetic.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface ChatMediaLockedGateModalProps {
  visible: boolean;
  onClose: () => void;
  myCount: number;
  theirCount: number;
  threshold: number;
  subtitle: string;
  moderationWarning: string;
}

export default function ChatMediaLockedGateModal({
  visible,
  onClose,
  myCount,
  theirCount,
  threshold,
  subtitle,
  moderationWarning,
}: ChatMediaLockedGateModalProps) {
  const myPct = Math.min(100, (myCount / threshold) * 100);
  const theirPct = Math.min(100, (theirCount / threshold) * 100);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.cardOuter}>
          <LinearGradient
            colors={['#12091c', '#261538', '#3d1850', '#241040']}
            locations={[0, 0.38, 0.74, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            <LinearGradient
              colors={['rgba(102,126,234,0.35)', 'transparent', 'rgba(244,63,94,0.18)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.cardGlow}
            />
            <View style={styles.handleBar} />

            <View style={styles.emojiRing}>
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f093fb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emojiRingGradient}
              >
                <View style={styles.emojiInner}>
                  <Text style={styles.emoji}>📷</Text>
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.kicker}>MEDIA IN CHAT</Text>
            <Text style={styles.title}>Almost unlocked</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.progressBlock}>
              <ProgressRow label="You" current={myCount} threshold={threshold} fillPct={myPct} />
              <View style={styles.progressSpacer} />
              <ProgressRow label="Your match" current={theirCount} threshold={threshold} fillPct={theirPct} />
            </View>

            <View style={styles.hintPill}>
              <Text style={[styles.hintIcon, styles.hintIconSpacing]}>🛡️</Text>
              <Text style={styles.hintText}>{moderationWarning}</Text>
            </View>

            <TouchableOpacity onPress={onClose} activeOpacity={0.88} style={styles.ctaTouchable}>
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f093fb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>Got it</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function ProgressRow({
  label,
  current,
  threshold,
  fillPct,
}: {
  label: string;
  current: number;
  threshold: number;
  fillPct: number;
}) {
  const capped = Math.min(current, threshold);
  const done = current >= threshold;

  return (
    <View>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowCount, done && styles.rowCountDone]}>
          {capped}/{threshold}
        </Text>
      </View>
      <View style={styles.track}>
        <LinearGradient
          colors={
            done
              ? ['#34d399', '#10b981', '#059669']
              : ['#a78bfa', '#667eea', '#764ba2']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${fillPct}%`, minWidth: fillPct > 0 ? 6 : 0 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 4, 16, 0.74)',
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
        shadowColor: '#764ba2',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.42,
        shadowRadius: 28,
      },
      android: { elevation: 18 },
    }),
  },
  cardGradient: {
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 24,
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
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#12091c',
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
    letterSpacing: 2,
    color: 'rgba(196, 181, 253, 0.95)',
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
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  progressBlock: {
    marginBottom: 18,
  },
  progressSpacer: {
    height: 16,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 0.2,
  },
  rowCount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  rowCountDone: {
    color: '#ecfdf5',
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderColor: 'rgba(110,231,183,0.45)',
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  hintIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  hintIconSpacing: {
    marginRight: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
  },
  ctaTouchable: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#667eea',
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
    borderColor: 'rgba(255,255,255,0.28)',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.6,
  },
});
