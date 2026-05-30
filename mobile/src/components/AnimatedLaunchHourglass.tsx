import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Easing,
  StyleSheet,
  AccessibilityInfo,
  type ViewStyle,
} from 'react-native';

export type AnimatedLaunchHourglassSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES = {
  xs: { wrap: 20, emoji: 12, sandW: 1.5, sandH: 8, glow: 4 },
  sm: { wrap: 32, emoji: 16, sandW: 2, sandH: 12, glow: 6 },
  md: { wrap: 40, emoji: 20, sandW: 2.5, sandH: 14, glow: 7 },
  lg: { wrap: 52, emoji: 26, sandW: 3, sandH: 16, glow: 8 },
} as const;

type Props = {
  size?: AnimatedLaunchHourglassSize;
  style?: ViewStyle;
};

/** Flip + glow + sand drip — mirrors web `launchHourglass*` keyframes. */
export default function AnimatedLaunchHourglass({ size = 'md', style }: Props) {
  const dim = SIZES[size];
  const [reduceMotion, setReduceMotion] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const sand = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(!!v),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      flip.setValue(0);
      glow.setValue(0.5);
      sand.setValue(0.5);
      return;
    }

    const flipLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1512),
        Animated.timing(flip, {
          toValue: 0.5,
          duration: 432,
          easing: Easing.bezier(0.68, -0.2, 0.32, 1.2),
          useNativeDriver: true,
        }),
        Animated.delay(1512),
        Animated.timing(flip, {
          toValue: 1,
          duration: 432,
          easing: Easing.bezier(0.68, -0.2, 0.32, 1.2),
          useNativeDriver: true,
        }),
        Animated.delay(1512),
        Animated.timing(flip, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1944,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1944,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 1512,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const sandLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sand, {
          toValue: 1,
          duration: 648,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sand, {
          toValue: 0.5,
          duration: 540,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sand, {
          toValue: 0,
          duration: 648,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sand, {
          toValue: 0.5,
          duration: 864,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    flipLoop.start();
    glowLoop.start();
    sandLoop.start();
    return () => {
      flipLoop.stop();
      glowLoop.stop();
      sandLoop.stop();
    };
  }, [reduceMotion, flip, glow, sand]);

  const rotate = flip.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '180deg', '360deg'],
  });
  const emojiScale = flip.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.52, 0.9] });
  const sandTranslateY = sand.interpolate({ inputRange: [0, 0.5, 1], outputRange: [6, 0, -6] });
  const sandScaleY = sand.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 1, 0.55] });
  const sandOpacity = sand.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 0.95, 0.8] });

  return (
    <View style={[styles.wrap, { width: dim.wrap, height: dim.wrap }, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            top: -dim.glow,
            left: -dim.glow,
            right: -dim.glow,
            bottom: -dim.glow,
            opacity: reduceMotion ? 0.6 : glowOpacity,
            transform: [{ scale: reduceMotion ? 1 : glowScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ rotate }, { scale: emojiScale }] }}>
        <Text style={{ fontSize: dim.emoji, lineHeight: dim.emoji + 2 }} allowFontScaling={false}>
          ⏳
        </Text>
      </Animated.View>
      {!reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sand,
            {
              width: dim.sandW,
              height: dim.sandH,
              marginLeft: -dim.sandW / 2,
              marginTop: -dim.sandH / 2,
              opacity: sandOpacity,
              transform: [{ translateY: sandTranslateY }, { scaleY: sandScaleY }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.28)',
  },
  sand: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderRadius: 999,
    backgroundColor: 'rgba(253, 230, 138, 0.95)',
  },
});
