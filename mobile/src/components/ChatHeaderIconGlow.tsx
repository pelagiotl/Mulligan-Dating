/**
 * Soft breathing perimeter ring for chat-header icon buttons (ToD, NHIE, planner).
 * Subtle only — no scale pulse. Honors reduce-motion.
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

export type ChatHeaderIconGlowTint = 'rose' | 'amber' | 'sky';

const GLOW_HALF_MS = 1_900;

const TINTS: Record<
  ChatHeaderIconGlowTint,
  { border: string; borderDim: string; shadow: string }
> = {
  rose: {
    border: 'rgba(251, 113, 133, 0.95)',
    borderDim: 'rgba(251, 113, 133, 0.35)',
    shadow: '#fb7185',
  },
  amber: {
    border: 'rgba(251, 191, 36, 0.95)',
    borderDim: 'rgba(251, 191, 36, 0.35)',
    shadow: '#fbbf24',
  },
  sky: {
    border: 'rgba(56, 189, 248, 0.95)',
    borderDim: 'rgba(56, 189, 248, 0.35)',
    shadow: '#38bdf8',
  },
};

type Props = {
  tint?: ChatHeaderIconGlowTint;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function ChatHeaderIconGlow({ tint = 'rose', children, style }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const colors = TINTS[tint];

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
      pulse.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: GLOW_HALF_MS,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: GLOW_HALF_MS,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);

  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderDim, colors.border],
  });
  const shadowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.62],
  });

  return (
    <Animated.View
      style={[
        styles.shell,
        {
          borderColor,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: colors.shadow,
                shadowOpacity,
                shadowRadius: 7,
                shadowOffset: { width: 0, height: 0 },
              }
            : null),
        },
        style,
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
    overflow: 'visible',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
