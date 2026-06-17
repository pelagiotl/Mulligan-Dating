import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const BORDER_INSET = 2;
/** Full 360° rotation — keep in sync with web `--perimeter-rotate-duration` */
const LOOP_MS = 22_000;
/** Opacity breathe half-cycle */
const GLOW_HALF_MS = 6_500;

type ProfileEditableCardBorderProps = {
  children: React.ReactNode;
  /** Stagger start (ms) so cards do not pulse in sync */
  delay?: number;
  borderRadius?: number;
  /** Rotating trace colors on the outer ring */
  traceColors?: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
};

export default function ProfileEditableCardBorder({
  children,
  delay = 0,
  borderRadius = 28,
  traceColors = ['rgba(255,255,255,0.95)', 'rgba(103,232,249,0.9)', 'rgba(240,147,251,0.9)', 'rgba(255,255,255,0.95)'],
  style,
  onLayout,
}: ProfileEditableCardBorderProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.45)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(!!v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduceMotion(!!v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      glow.setValue(0.58);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: LOOP_MS,
        useNativeDriver: true,
      })
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: GLOW_HALF_MS, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration: GLOW_HALF_MS, useNativeDriver: true }),
      ])
    );
    let spinStarted = false;
    const t = setTimeout(() => {
      spinLoop.start();
      glowLoop.start();
      spinStarted = true;
    }, delay);
    return () => {
      clearTimeout(t);
      if (spinStarted) {
        spinLoop.stop();
        glowLoop.stop();
      }
    };
  }, [delay, spin, glow, reduceMotion]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const innerRadius = Math.max(0, borderRadius - BORDER_INSET);

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, { borderRadius, marginBottom: 10 }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ringLayer,
          {
            borderRadius,
            opacity: glow,
            transform: [{ rotate }],
          },
        ]}
      >
        <LinearGradient
          colors={traceColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[styles.innerClip, { borderRadius: innerRadius, margin: BORDER_INSET }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  innerClip: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
});
