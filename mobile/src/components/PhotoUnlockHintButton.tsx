/**
 * Stage-1 “How photos unlock” chat hint with soft perimeter glow.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const RING_INSET = 2;
const SPIN_MS = 12_000;
const GLOW_HALF_MS = 1_500;

type Props = {
  onPress: () => void;
  /** Midnight shell — warmer rose/amber ring. */
  midnight?: boolean;
};

export default function PhotoUnlockHintButton({ onPress, midnight = false }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.55)).current;
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
      glow.setValue(0.7);
      spin.setValue(0);
      return;
    }
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_MS,
        useNativeDriver: true,
      }),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: GLOW_HALF_MS,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0.42,
          duration: GLOW_HALF_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    spinLoop.start();
    glowLoop.start();
    return () => {
      spinLoop.stop();
      glowLoop.stop();
    };
  }, [reduceMotion, spin, glow]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const haloOpacity = glow.interpolate({
    inputRange: [0.42, 1],
    outputRange: [0.32, 0.82],
  });

  const traceColors = midnight
    ? (['#fda4af', '#fbbf24', '#fb7185', '#fda4af'] as const)
    : (['#818cf8', '#a78bfa', '#67e8f9', '#818cf8'] as const);
  const haloColor = midnight ? '#fb7185' : '#818cf8';
  const pillBg = midnight ? 'rgba(30, 27, 46, 0.96)' : 'rgba(238, 242, 255, 0.96)';
  const textColor = midnight ? '#fde68a' : '#4338ca';

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: haloOpacity,
            borderColor: haloColor,
            shadowColor: haloColor,
            ...(Platform.OS === 'ios'
              ? {
                  shadowOpacity: 0.7,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 0 },
                }
              : null),
          },
        ]}
      />
      <View style={styles.ringClip}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringLayer,
            {
              opacity: glow,
              transform: [{ rotate }],
            },
          ]}
        >
          <LinearGradient
            colors={[...traceColors]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.85}
          style={[styles.pill, { margin: RING_INSET, backgroundColor: pillBg }]}
          accessibilityRole="button"
          accessibilityLabel="How photos unlock"
        >
          <Text style={[styles.pillText, { color: textColor }]}>📷 How photos unlock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 2,
    transform: [{ scale: 1.06 }],
  },
  ringClip: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
