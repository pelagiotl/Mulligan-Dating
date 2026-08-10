import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, type TextStyle } from 'react-native';

export type LimitsMetricIconKind = 'golf' | 'heart';

type Props = {
  kind: LimitsMetricIconKind;
  style?: TextStyle;
};

/** Animated ⛳ / 💞 on the Limits panel metric cards. */
export default function AnimatedLimitsMetricIcon({ kind, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = kind === 'golf' ? 1400 : 1100;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, kind]);

  const transform =
    kind === 'golf'
      ? [
          {
            rotate: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ['-10deg', '10deg', '-10deg'],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 1.14, 1],
            }),
          },
        ]
      : [
          {
            scale: anim.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [1, 1.16, 1, 1.1, 1],
            }),
          },
        ];

  return (
    <Animated.Text
      style={[styles.emoji, style, { transform }]}
      allowFontScaling={false}
      accessibilityElementsHidden
    >
      {kind === 'golf' ? '⛳' : '💞'}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  emoji: {
    fontSize: 15,
    lineHeight: 17,
  },
});
