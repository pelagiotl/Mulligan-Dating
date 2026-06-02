import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Vibration,
  Pressable,
  AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { playTokenClaimSound } from '../utils/sounds';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const ORBIT_STARS = [
  { glyph: '⭐', styleKey: 'orbit1' as const, delay: 0 },
  { glyph: '✦', styleKey: 'orbit2' as const, delay: 400 },
  { glyph: '💫', styleKey: 'orbit3' as const, delay: 900 },
];

function AnimatedCelebrationStarBadge({ visible }: { visible: boolean }) {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const orbit1 = useRef(new Animated.Value(0)).current;
  const orbit2 = useRef(new Animated.Value(0)).current;
  const orbit3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(!!v),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      sway.setValue(0);
      pulse.setValue(1);
      glow.setValue(0);
      orbit1.setValue(0);
      orbit2.setValue(0);
      orbit3.setValue(0);
      return;
    }

    Animated.spring(entrance, {
      toValue: 1,
      tension: 40,
      friction: 6,
      delay: 120,
      useNativeDriver: true,
    }).start();

    if (reduceMotion) return;

    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.08, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const orbitLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );

    const o1 = orbitLoop(orbit1, 0);
    const o2 = orbitLoop(orbit2, 400);
    const o3 = orbitLoop(orbit3, 900);
    swayLoop.start();
    pulseLoop.start();
    glowLoop.start();
    o1.start();
    o2.start();
    o3.start();
    return () => {
      swayLoop.stop();
      pulseLoop.stop();
      glowLoop.stop();
      o1.stop();
      o2.stop();
      o3.stop();
    };
  }, [visible, reduceMotion, entrance, sway, pulse, glow, orbit1, orbit2, orbit3]);

  const entranceScale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const rotate = sway.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-12deg', '0deg', '12deg'] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.14] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });

  const orbitValues = { orbit1, orbit2, orbit3 };

  return (
    <View style={styles.emojiWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.emojiGlow,
          {
            opacity: reduceMotion ? 0.65 : glowOpacity,
            transform: [{ scale: reduceMotion ? 1 : glowScale }],
          },
        ]}
      />
      {ORBIT_STARS.map(({ glyph, styleKey, delay }) => {
        const orbit = orbitValues[styleKey];
        const orbitOpacity = orbit.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
        const orbitScale = orbit.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.08] });
        const orbitY = orbit.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
        return (
          <Animated.Text
            key={styleKey}
            allowFontScaling={false}
            style={[
              styles.orbitStar,
              styles[styleKey],
              {
                opacity: reduceMotion ? 0.7 : orbitOpacity,
                transform: reduceMotion
                  ? undefined
                  : [{ translateY: orbitY }, { scale: orbitScale }],
              },
            ]}
          >
            {glyph}
          </Animated.Text>
        );
      })}
      <Animated.View
        style={[
          styles.emojiBadge,
          {
            transform: reduceMotion
              ? [{ scale: entranceScale }]
              : [{ scale: Animated.multiply(entranceScale, pulse) }, { rotate }],
          },
        ]}
      >
        <Text style={styles.emoji} allowFontScaling={false}>
          ✨
        </Text>
      </Animated.View>
    </View>
  );
}

function AnimatedGetItButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      pulse.setValue(1);
      shimmer.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );

    pulseLoop.start();
    shimmerLoop.start();
    return () => {
      pulseLoop.stop();
      shimmerLoop.stop();
    };
  }, [visible, pulse, shimmer]);

  const shimmerTranslateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 260],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={styles.ctaTouchable}
      onPressIn={() => {
        Animated.timing(pressScale, {
          toValue: 0.96,
          duration: 80,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(pressScale, {
          toValue: 1,
          friction: 6,
          tension: 280,
          useNativeDriver: true,
        }).start();
      }}
    >
      <Animated.View style={{ transform: [{ scale: Animated.multiply(pulse, pressScale) }] }}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaGradient}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ctaShimmer,
              { transform: [{ translateX: shimmerTranslateX }, { rotate: '-18deg' }] },
            ]}
          />
          <Text style={styles.ctaText}>Let&apos;s get it</Text>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function BetterMatchesCompleteCelebration({ visible, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.88);
      opacity.setValue(0);
      return;
    }

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(35);
    }
    void playTokenClaimSound();

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 52,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, scale, opacity]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View style={[styles.cardWrap, { opacity, transform: [{ scale }] }]}>
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.rim}
            >
              <LinearGradient
                colors={['#ffffff', '#f5f3ff', '#fff1f2']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.card}
              >
                <AnimatedCelebrationStarBadge visible={visible} />
                <Text style={styles.kicker}>Better matches</Text>
                <Text style={styles.title}>You&apos;re all set!</Text>
                <Text style={styles.body}>
                  Every profile tip is complete. We&apos;ll use what you shared to curate stronger
                  connections when you Connect.
                </Text>
                <AnimatedGetItButton visible={visible} onPress={onClose} />
              </LinearGradient>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 380,
  },
  rim: {
    borderRadius: 28,
    padding: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  card: {
    borderRadius: 25,
    paddingVertical: 32,
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  emojiWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emojiGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(251, 191, 36, 0.28)',
  },
  emojiBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  emoji: {
    fontSize: 38,
  },
  orbitStar: {
    position: 'absolute',
    fontSize: 14,
    lineHeight: 16,
  },
  orbit1: {
    top: 2,
    right: 4,
  },
  orbit2: {
    bottom: 8,
    left: 0,
  },
  orbit3: {
    top: 14,
    left: 2,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#7c3aed',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#1e1b4b',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: 'rgba(30, 27, 75, 0.72)',
    textAlign: 'center',
    marginBottom: 22,
  },
  ctaTouchable: {
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
});
