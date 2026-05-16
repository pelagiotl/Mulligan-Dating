/**
 * Rich modal explaining Truth or Dare message gate (replaces plain Alert on Android/iOS).
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

export interface TruthOrDareMessageGateModalProps {
  visible: boolean;
  onClose: () => void;
  /** Messages you've sent in this chat (count toward unlock). */
  myCount: number;
  /** Messages your match sent (count toward unlock). */
  theirCount: number;
  /** Required from each side (e.g. 7). */
  threshold: number;
  emoji?: string;
  kicker?: string;
  title?: string;
  subtitle?: string;
  hintText?: string;
}

export default function TruthOrDareMessageGateModal({
  visible,
  onClose,
  myCount,
  theirCount,
  threshold,
  emoji = '🎲',
  kicker = 'TRUTH OR DARE',
  title = 'Warm up the chat first',
  subtitle,
  hintText = "Real back-and-forth keeps prompts fun — we'll nudge you until you've both chimed in enough.",
}: TruthOrDareMessageGateModalProps) {
  const myPct = Math.min(100, (myCount / threshold) * 100);
  const theirPct = Math.min(100, (theirCount / threshold) * 100);
  const resolvedSubtitle =
    subtitle ??
    `Send at least ${threshold} messages each — then Truth or Dare unlocks for this match.`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.cardOuter}>
          <LinearGradient
            colors={['#1a0b22', '#2d1240', '#4a1452', '#351048']}
            locations={[0, 0.35, 0.72, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
            <LinearGradient
              colors={['rgba(255,0,128,0.35)', 'transparent', 'rgba(124,77,255,0.2)']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.cardGlow}
            />
            <View style={styles.handleBar} />

            <View style={styles.emojiRing}>
              <LinearGradient
                colors={['#ff66b2', '#ff0080', '#b388ff', '#7c4dff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.emojiRingGradient}
              >
                <View style={styles.emojiInner}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </View>
              </LinearGradient>
            </View>

            <Text style={styles.kicker}>{kicker}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{resolvedSubtitle}</Text>

            <View style={styles.progressBlock}>
              <ProgressRow label="You" current={myCount} threshold={threshold} fillPct={myPct} />
              <View style={styles.progressSpacer} />
              <ProgressRow label="Your match" current={theirCount} threshold={threshold} fillPct={theirPct} />
            </View>

            <View style={styles.hintPill}>
              <Text style={[styles.hintIcon, styles.hintIconSpacing]}>💬</Text>
              <Text style={styles.hintText}>{hintText}</Text>
            </View>

            <TouchableOpacity onPress={onClose} activeOpacity={0.88} style={styles.ctaTouchable}>
              <LinearGradient
                colors={['#ff0080', '#ff4da6', '#c026d3']}
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
              : ['#ff66b2', '#ff0080', '#e91e8c']
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
    backgroundColor: 'rgba(6, 2, 12, 0.72)',
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
        shadowColor: '#ff0080',
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
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
    fontVariant: ['tabular-nums'],
  },
  rowCountDone: {
    color: '#6ee7b7',
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
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
  },
  ctaTouchable: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#ff0080',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
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
    borderColor: 'rgba(255,255,255,0.25)',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.6,
  },
});
