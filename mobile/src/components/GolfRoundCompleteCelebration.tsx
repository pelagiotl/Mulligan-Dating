/**
 * Chill celebration when a Golf Date hole-prompt round completes.
 * Soft falling fairway particles from the top of the screen.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { playMatchSound } from '../utils/sounds';

type Props = {
  visible: boolean;
  totalHoles?: 9 | 18;
  onDismiss: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PARTICLE_COUNT = Platform.OS === 'android' ? 18 : 14;
const POOL = ['⛳', '🏌️', '🏌️‍♀️', '✨', '🥂', '⛳', '💚'] as const;

type ParticleSpec = {
  emoji: string;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
  spin: string;
};

function FallingParticle({
  spec,
  play,
  reduceMotion,
}: {
  spec: ParticleSpec;
  play: boolean;
  reduceMotion: boolean;
}) {
  const y = useRef(new Animated.Value(-48)).current;
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!play) {
      y.setValue(-48);
      x.setValue(0);
      opacity.setValue(0);
      rotate.setValue(0);
      return;
    }

    if (reduceMotion) {
      opacity.setValue(0.85);
      y.setValue(SCREEN_H * 0.28 + (spec.left % 40));
      return;
    }

    y.setValue(-48 - Math.random() * 80);
    x.setValue(0);
    opacity.setValue(0);
    rotate.setValue(0);

    const fall = Animated.parallel([
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 520,
          delay: Math.max(0, spec.duration - 800),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(y, {
          toValue: SCREEN_H + 60,
          duration: spec.duration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(x, {
          toValue: spec.drift,
          duration: spec.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(rotate, {
          toValue: 1,
          duration: spec.duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    ]);

    fall.start();
    return () => fall.stop();
  }, [play, reduceMotion, spec, y, x, opacity, rotate]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', spec.spin],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: spec.left,
          opacity,
          transform: [{ translateY: y }, { translateX: x }, { rotate: spin }],
        },
      ]}
    >
      <Text style={{ fontSize: spec.size }} allowFontScaling={false}>
        {spec.emoji}
      </Text>
    </Animated.View>
  );
}

export default function GolfRoundCompleteCelebration({
  visible,
  totalHoles = 18,
  onDismiss,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardY = useRef(new Animated.Value(18)).current;

  const particles = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const left = 6 + ((i * 17) % 88) + (i % 3) * 2;
        const duration = 3200 + (i % 5) * 420 + Math.floor(Math.random() * 400);
        const delay = (i % 7) * 110 + Math.floor(Math.random() * 180);
        const drift = (i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 8);
        const spin = i % 2 === 0 ? '28deg' : '-32deg';
        return {
          emoji: POOL[i % POOL.length],
          left: (left / 100) * SCREEN_W,
          size: 18 + (i % 6) * 3,
          duration,
          delay,
          drift,
          spin,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh layout each celebration open
    [visible],
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(!!v),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      cardOpacity.setValue(0);
      cardScale.setValue(0.92);
      cardY.setValue(18);
      return;
    }

    void playMatchSound().catch(() => {});
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    cardOpacity.setValue(0);
    cardScale.setValue(0.92);
    cardY.setValue(18);

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 420,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        delay: 180,
        tension: 56,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(cardY, {
        toValue: 0,
        duration: 480,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const auto = setTimeout(onDismiss, 4800);
    return () => clearTimeout(auto);
  }, [visible, onDismiss, cardOpacity, cardScale, cardY]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.root} onPress={onDismiss}>
        <LinearGradient
          colors={['rgba(6, 78, 59, 0.55)', 'rgba(15, 23, 42, 0.35)', 'rgba(15, 23, 42, 0.15)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {particles.map((spec, i) => (
          <FallingParticle key={`${visible}-${i}`} spec={spec} play={visible} reduceMotion={reduceMotion} />
        ))}

        <Pressable onPress={(e) => e.stopPropagation()} style={styles.cardHit}>
          <Animated.View
            style={[
              styles.cardWrap,
              {
                opacity: cardOpacity,
                transform: [{ translateY: cardY }, { scale: cardScale }],
              },
            ]}
          >
            <LinearGradient
              colors={['#0f766e', '#0d9488', '#14b8a6', '#5eead4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <Text style={styles.flag} allowFontScaling={false}>
                ⛳
              </Text>
              <Text style={styles.title}>{totalHoles} holes complete</Text>
              <Text style={styles.sub}>
                Nice round — you finished the prompts together. Keep the vibe going off the course.
              </Text>
              <Text style={styles.hint}>Tap anywhere to close</Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  particle: {
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  cardHit: {
    width: '100%',
    maxWidth: 340,
    zIndex: 2,
  },
  cardWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f766e',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  card: {
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 22,
  },
  flag: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    color: '#ecfdf5',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    color: 'rgba(236, 253, 245, 0.92)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 14,
  },
  hint: {
    color: 'rgba(236, 253, 245, 0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
});
