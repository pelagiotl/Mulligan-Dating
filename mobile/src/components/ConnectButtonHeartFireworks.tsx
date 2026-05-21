import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type HeartSpec = {
  emoji: string;
  /** Horizontal anchor within the button (percent string). */
  left: string;
  delay: number;
  duration: number;
  /** Start above the button, end near the lower interior. */
  startY: number;
  endY: number;
  driftX: number;
  size: number;
  startRotation: string;
  endRotation: string;
};

const SHOOTING_HEARTS: HeartSpec[] = [
  { emoji: '💕', left: '6%', delay: 0, duration: 2200, startY: -36, endY: 34, driftX: 14, size: 15, startRotation: '-18deg', endRotation: '8deg' },
  { emoji: '💖', left: '22%', delay: 280, duration: 2400, startY: -42, endY: 30, driftX: -10, size: 17, startRotation: '12deg', endRotation: '-6deg' },
  { emoji: '✨', left: '38%', delay: 520, duration: 2000, startY: -38, endY: 36, driftX: 6, size: 14, startRotation: '0deg', endRotation: '0deg' },
  { emoji: '💝', left: '54%', delay: 120, duration: 2600, startY: -44, endY: 32, driftX: -14, size: 16, startRotation: '-8deg', endRotation: '14deg' },
  { emoji: '💗', left: '70%', delay: 640, duration: 2300, startY: -40, endY: 35, driftX: 10, size: 15, startRotation: '16deg', endRotation: '-10deg' },
  { emoji: '💕', left: '86%', delay: 400, duration: 2100, startY: -34, endY: 38, driftX: -8, size: 14, startRotation: '-12deg', endRotation: '6deg' },
  { emoji: '✨', left: '48%', delay: 900, duration: 1800, startY: -48, endY: 28, driftX: 0, size: 13, startRotation: '0deg', endRotation: '0deg' },
  { emoji: '💖', left: '14%', delay: 1100, duration: 2500, startY: -46, endY: 40, driftX: 18, size: 16, startRotation: '20deg', endRotation: '-12deg' },
];

type BurstSpec = {
  emoji: string;
  delay: number;
  duration: number;
  offsetX: number;
  offsetY: number;
  size: number;
};

/** Small hearts that pop outward from the button surface like tiny fireworks. */
const BURST_HEARTS: BurstSpec[] = [
  { emoji: '💕', delay: 0, duration: 1400, offsetX: -42, offsetY: -8, size: 12 },
  { emoji: '💖', delay: 450, duration: 1500, offsetX: 38, offsetY: -12, size: 13 },
  { emoji: '✨', delay: 900, duration: 1200, offsetX: -28, offsetY: 14, size: 11 },
  { emoji: '💗', delay: 1350, duration: 1400, offsetX: 44, offsetY: 10, size: 12 },
  { emoji: '💝', delay: 1800, duration: 1300, offsetX: 0, offsetY: -16, size: 13 },
];

function ShootingHeart({ spec }: { spec: HeartSpec }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: spec.duration,
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress, spec.delay, spec.duration]);

  const opacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.12, 0.55, 0.88, 1],
        outputRange: [0, 1, 1, 0.85, 0],
      }),
    [progress]
  );

  const translateY = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [spec.startY, spec.endY],
      }),
    [progress, spec.endY, spec.startY]
  );

  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, spec.driftX * 0.55, spec.driftX],
      }),
    [progress, spec.driftX]
  );

  const scale = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.35, 0.7, 1],
        outputRange: [0.15, 1.15, 0.95, 0.35],
      }),
    [progress]
  );

  const rotate = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [spec.startRotation, spec.endRotation],
      }),
    [progress, spec.endRotation, spec.startRotation]
  );

  return (
    <Animated.Text
      allowFontScaling={false}
      style={[
        styles.particle,
        {
          left: spec.left,
          fontSize: spec.size,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }, { rotate }],
        },
      ]}
    >
      {spec.emoji}
    </Animated.Text>
  );
}

function BurstHeart({ spec }: { spec: BurstSpec }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: spec.duration,
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress, spec.delay, spec.duration]);

  const opacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.2, 0.75, 1],
        outputRange: [0, 1, 0.7, 0],
      }),
    [progress]
  );

  const scale = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.4, 1],
        outputRange: [0.2, 1.25, 0.5],
      }),
    [progress]
  );

  const travel = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [progress]
  );

  const translateX = useMemo(
    () => Animated.multiply(travel, spec.offsetX),
    [travel, spec.offsetX]
  );

  const translateY = useMemo(
    () => Animated.multiply(travel, spec.offsetY),
    [travel, spec.offsetY]
  );

  return (
    <Animated.Text
      allowFontScaling={false}
      style={[
        styles.burstParticle,
        {
          fontSize: spec.size,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      {spec.emoji}
    </Animated.Text>
  );
}

type ConnectButtonHeartFireworksProps = {
  active?: boolean;
};

/** Shooting-star hearts that arc onto the Connect CTA from above. */
export default function ConnectButtonHeartFireworks({ active = true }: ConnectButtonHeartFireworksProps) {
  if (!active) return null;

  return (
    <View style={styles.layer} pointerEvents="none">
      {SHOOTING_HEARTS.map((spec, i) => (
        <ShootingHeart key={`shoot-${spec.emoji}-${spec.left}-${i}`} spec={spec} />
      ))}
      <View style={styles.burstOrigin} pointerEvents="none">
        {BURST_HEARTS.map((spec, i) => (
          <BurstHeart key={`burst-${spec.emoji}-${i}`} spec={spec} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    top: -44,
    bottom: -10,
    left: -12,
    right: -12,
    overflow: 'visible',
    zIndex: 2,
  },
  particle: {
    position: 'absolute',
    top: 0,
    marginLeft: -8,
    textShadowColor: 'rgba(255, 105, 180, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  burstOrigin: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    width: 1,
    height: 1,
    marginLeft: -0.5,
    overflow: 'visible',
  },
  burstParticle: {
    position: 'absolute',
    left: -6,
    top: -6,
    textShadowColor: 'rgba(255, 182, 193, 0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
