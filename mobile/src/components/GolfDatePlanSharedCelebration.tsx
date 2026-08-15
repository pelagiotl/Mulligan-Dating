/**
 * Success card after sharing a Golf Date plan — replaces the system Alert.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

type Props = {
  visible: boolean;
  partnerName: string;
  courseName?: string | null;
  onDismiss: () => void;
};

export default function GolfDatePlanSharedCelebration({
  visible,
  partnerName,
  courseName,
  onDismiss,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const y = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(!!v),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.9);
      y.setValue(20);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    if (reduceMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      y.setValue(0);
      return;
    }

    opacity.setValue(0);
    scale.setValue(0.9);
    y.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 68,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reduceMotion, opacity, scale, y]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View
          style={[
            styles.cardWrap,
            { opacity, transform: [{ scale }, { translateY: y }] },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              <LinearGradient
                colors={['#0f766e', '#0d9488', '#134e4a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <View style={styles.heroGlow} />
                <Text style={styles.heroEmoji}>⛳</Text>
                <Text style={styles.heroEyebrow}>GOLF DATE</Text>
                <Text style={styles.heroTitle}>Invite sent!</Text>
              </LinearGradient>

              <View style={styles.body}>
                <Text style={styles.message}>
                  Your plan was shared with{' '}
                  <Text style={styles.partner}>{partnerName}</Text>.
                </Text>
                {courseName ? (
                  <View style={styles.courseChip}>
                    <Text style={styles.courseChipText}>🏌️ {courseName}</Text>
                  </View>
                ) : null}
                <Text style={styles.hint}>
                  They’ll see the invitation in chat — you can still book the tee time anytime.
                </Text>

                <Pressable onPress={onDismiss} style={styles.okBtn} accessibilityRole="button">
                  <LinearGradient
                    colors={['#0f766e', '#14b8a6']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.okGrad}
                  >
                    <Text style={styles.okText}>Nice 👍</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 340,
  },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.28)',
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 10,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -36,
    right: -24,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
    fontWeight: '600',
    textAlign: 'center',
  },
  partner: {
    color: '#0f766e',
    fontWeight: '800',
  },
  courseChip: {
    marginTop: 12,
    backgroundColor: '#f0fdfa',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.2)',
  },
  courseChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#134e4a',
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  okBtn: {
    marginTop: 18,
    alignSelf: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
  },
  okGrad: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
