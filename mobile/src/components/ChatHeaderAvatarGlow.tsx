/**
 * Soft breathing perimeter ring around the chat-header profile avatar.
 */

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

const RING_INSET = 2.5;
const SPIN_MS = 14_000;
const GLOW_HALF_MS = 1_800;

type Props = {
  size?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function ChatHeaderAvatarGlow({ size = 56, children, style }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.5)).current;
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
      glow.setValue(0.65);
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
          toValue: 0.4,
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
    inputRange: [0.4, 1],
    outputRange: [0.28, 0.72],
  });

  const outer = size + 8;

  return (
    <View style={[{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            opacity: haloOpacity,
            ...(Platform.OS === 'ios'
              ? {
                  shadowColor: '#5eead4',
                  shadowOpacity: 0.65,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 0 },
                }
              : null),
          },
        ]}
      />
      <View
        style={[
          styles.ringClip,
          { width: size + RING_INSET * 2, height: size + RING_INSET * 2, borderRadius: (size + RING_INSET * 2) / 2 },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { opacity: glow, transform: [{ rotate }] },
          ]}
        >
          <LinearGradient
            colors={['#5eead4', '#a78bfa', '#f0abfc', '#5eead4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            margin: RING_INSET,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(94, 234, 212, 0.55)',
  },
  ringClip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
