import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AccessibilityInfo, Easing } from 'react-native';

export type SmoothBreatheOptions = {
  cycleMs?: number;
  peakScale?: number;
  delay?: number;
  /** Landing emojis: slower cycle + slightly softer cosine curve. */
  variant?: 'default' | 'emoji';
};

/** Go to Profile CTA — full inhale + exhale. */
export const SMOOTH_BREATHE_CYCLE_MS = 5200;
export const SMOOTH_BREATHE_PEAK_SCALE = 1.035;

/** Connect landing ✨🎯💝 — slower reads calmer on Android. */
export const EMOJI_BREATHE_CYCLE_MS = 6600;
export const EMOJI_BREATHE_PEAK_SCALE = 1.04;

const COSINE_STEPS = 16;

/** scale = 1 + (peak-1) * (1 - cos(2πt)) / 2 — seamless at t=0 and t=1. */
export function cosineBreatheKeyframes(peakScale: number) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= COSINE_STEPS; i++) {
    const t = i / COSINE_STEPS;
    inputRange.push(t);
    const wave = (1 - Math.cos(2 * Math.PI * t)) / 2;
    outputRange.push(1 + (peakScale - 1) * wave);
  }
  return { inputRange, outputRange };
}

/**
 * Scale-only breathe loop. Cosine keyframes + linear phase = smooth Android loop
 * with no velocity kinks at inhale/exhale handoff.
 */
export function useSmoothBreathePulse({
  cycleMs,
  peakScale,
  delay = 0,
  variant = 'default',
}: SmoothBreatheOptions = {}) {
  const resolvedCycle =
    cycleMs ?? (variant === 'emoji' ? EMOJI_BREATHE_CYCLE_MS : SMOOTH_BREATHE_CYCLE_MS);
  const resolvedPeak =
    peakScale ?? (variant === 'emoji' ? EMOJI_BREATHE_PEAK_SCALE : SMOOTH_BREATHE_PEAK_SCALE);

  const phase = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  const keyframes = useMemo(
    () => cosineBreatheKeyframes(resolvedPeak),
    [resolvedPeak],
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }

    const breathe = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: resolvedCycle,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const anim =
      delay > 0
        ? Animated.sequence([Animated.delay(delay), breathe])
        : breathe;
    anim.start();
    return () => anim.stop();
  }, [delay, phase, reduceMotion, resolvedCycle]);

  const scale = phase.interpolate({
    ...keyframes,
    extrapolate: 'clamp',
  });

  return { scale, reduceMotion, motionEnabled: !reduceMotion };
}
