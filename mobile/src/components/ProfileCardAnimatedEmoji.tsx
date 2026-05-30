import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AccessibilityInfo,
  Easing,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type ProfileCardEmojiVariant =
  | 'celebrate'
  | 'pulse'
  | 'peek'
  | 'shimmer'
  | 'bounce'
  | 'glow'
  | 'bob'
  | 'sway'
  | 'heartbeat'
  | 'crown';

type Props = {
  emoji: string;
  variant?: ProfileCardEmojiVariant;
  fontSize?: number;
  delay?: number;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
};

/**
 * Looping emoji motion for profile cards, Admin panel, and Settings (mirrors web keyframes).
 */
export default function ProfileCardAnimatedEmoji({
  emoji,
  variant = 'shimmer',
  fontSize = 36,
  delay = 0,
  containerStyle,
  style,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => setReduceMotion(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(!!v),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }

    const duration =
      variant === 'celebrate'
        ? 3500
        : variant === 'crown'
          ? 3200
          : variant === 'bounce'
            ? 2800
            : variant === 'glow'
              ? 3200
              : variant === 'bob'
                ? 2400
                : variant === 'sway'
                  ? 2600
                  : variant === 'heartbeat'
                    ? 1500
                    : variant === 'peek'
                      ? 2500
                      : variant === 'pulse'
                        ? 2000
                        : 3000;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [delay, progress, reduceMotion, variant]);

  const scale = (() => {
    switch (variant) {
      case 'celebrate':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 1.14, 1],
        });
      case 'pulse':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 1.12, 1],
        });
      case 'peek':
        return progress.interpolate({
          inputRange: [0, 0.35, 0.55, 0.75, 1],
          outputRange: [1, 0.9, 1.08, 0.96, 1],
        });
      case 'bounce':
        return progress.interpolate({
          inputRange: [0, 0.35, 0.55, 0.75, 1],
          outputRange: [1, 1.06, 1.02, 1.04, 1],
        });
      case 'glow':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 1.1, 1],
        });
      case 'heartbeat':
        return progress.interpolate({
          inputRange: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1],
          outputRange: [1, 1.18, 1, 1.14, 1, 1.06, 1],
        });
      case 'crown':
        return progress.interpolate({
          inputRange: [0, 0.45, 0.7, 1],
          outputRange: [1, 1.1, 1.04, 1],
        });
      case 'shimmer':
      case 'bob':
      case 'sway':
      default:
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, 1.1, 1],
        });
    }
  })();

  const rotate = (() => {
    switch (variant) {
      case 'celebrate':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: ['0deg', '10deg', '0deg'],
        });
      case 'shimmer':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: ['-6deg', '6deg', '-6deg'],
        });
      case 'sway':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: ['-7deg', '7deg', '-7deg'],
        });
      case 'crown':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: ['-5deg', '5deg', '-5deg'],
        });
      case 'bounce':
        return progress.interpolate({
          inputRange: [0, 0.55, 0.75, 1],
          outputRange: ['0deg', '-5deg', '3deg', '0deg'],
        });
      case 'glow':
      case 'pulse':
      case 'peek':
      case 'bob':
      case 'heartbeat':
      default:
        return '0deg';
    }
  })();

  const translateY = (() => {
    switch (variant) {
      case 'bounce':
        return progress.interpolate({
          inputRange: [0, 0.35, 0.55, 0.75, 1],
          outputRange: [0, -5, -2, -3, 0],
        });
      case 'bob':
      case 'crown':
        return progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: variant === 'crown' ? [0, -3, 0] : [0, -4, 0],
        });
      default:
        return 0;
    }
  })();

  const opacity =
    variant === 'pulse' || variant === 'glow' || variant === 'crown'
      ? progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange:
            variant === 'pulse'
              ? [0.82, 1, 0.82]
              : variant === 'crown'
                ? [0.92, 1, 0.92]
                : [0.88, 1, 0.88],
        })
      : 1;

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          { fontSize, textAlign: 'center' },
          style,
          reduceMotion
            ? null
            : {
                opacity,
                transform: [{ translateY }, { scale }, { rotate }],
              },
        ]}
      >
        {emoji}
      </Animated.Text>
    </Animated.View>
  );
}
