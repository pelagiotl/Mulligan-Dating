import React, { useEffect, useRef } from 'react';
import { Animated, AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GLOW_INSET = 3;

export type LaunchCountdownPerimeterGlowProps = {
  children: React.ReactNode;
  /** Inner card/chip corner radius (px). */
  borderRadius: number;
  colors: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
};

/**
 * Animated gradient ring around the launch countdown card/chip (parity with web perimeter glow).
 */
export default function LaunchCountdownPerimeterGlow({
  children,
  borderRadius,
  colors,
  style,
}: LaunchCountdownPerimeterGlowProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!cancelled) setReduceMotion(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      spin.setValue(0);
      pulse.setValue(0.65);
      return;
    }
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [reduceMotion, spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.52, 1],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });

  const outerRadius = borderRadius + GLOW_INSET;

  return (
    <View style={[styles.shell, { padding: GLOW_INSET, borderRadius: outerRadius }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ringLayer,
          {
            borderRadius: outerRadius,
            opacity: ringOpacity,
            transform: [{ rotate }, { scale: haloScale }],
          },
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: outerRadius }]}
        />
      </Animated.View>
      <View style={[styles.content, { borderRadius }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'visible',
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  content: {
    overflow: 'hidden',
  },
});
