/**
 * Composer “We went on a date” CTA with a soft perimeter glow + rotating trace.
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
const SPIN_MS = 10_000;
const GLOW_HALF_MS = 1_400;

type Props = {
  mutualSecondDate: boolean;
  onPress: () => void;
};

export default function DateReflectionPillButton({ mutualSecondDate, onPress }: Props) {
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
          toValue: 0.45,
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
    inputRange: [0.45, 1],
    outputRange: [0.35, 0.85],
  });

  const traceColors = mutualSecondDate
    ? (['#fda4af', '#f472b6', '#fb7185', '#fda4af'] as const)
    : (['#a78bfa', '#818cf8', '#f0abfc', '#a78bfa'] as const);
  const haloColor = mutualSecondDate ? '#f472b6' : '#8b5cf6';

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
          style={[
            styles.pill,
            mutualSecondDate ? styles.pillMutual : null,
            { margin: RING_INSET },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            mutualSecondDate ? 'Date 2 ready. Open date reflection.' : 'We went on a date'
          }
        >
          <Text style={[styles.pillText, mutualSecondDate ? styles.pillTextMutual : null]}>
            {mutualSecondDate ? 'Date 2 ready ✨' : '💑 We went on a date'}
          </Text>
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
    backgroundColor: 'rgba(245, 243, 255, 0.96)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillMutual: {
    backgroundColor: 'rgba(255, 241, 242, 0.96)',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b21b6',
  },
  pillTextMutual: {
    color: '#be185d',
  },
});
