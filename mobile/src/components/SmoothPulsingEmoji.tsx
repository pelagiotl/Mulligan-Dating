import React from 'react';
import {
  Animated,
  Platform,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSmoothBreathePulse } from '../hooks/useSmoothBreathePulse';

type Props = {
  emoji: string;
  fontSize?: number;
  /** Stagger start (ms). Delay runs once, not each loop. */
  delay?: number;
  peakScale?: number;
  cycleMs?: number;
  variant?: 'default' | 'emoji' | 'prominent';
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
};

/**
 * Gentle scale-only emoji pulse for Connect landing. Cosine curve + linear phase
 * keeps Android loop seams smooth; opacity/rotate on Text are avoided.
 */
export default function SmoothPulsingEmoji({
  emoji,
  fontSize = 28,
  delay = 0,
  peakScale,
  cycleMs,
  variant = 'emoji',
  containerStyle,
  style,
}: Props) {
  const { scale, opacity, motionEnabled } = useSmoothBreathePulse({
    variant,
    delay,
    peakScale,
    cycleMs,
  });

  const textStyle = [
    { fontSize, textAlign: 'center' as const },
    Platform.OS === 'android' && {
      includeFontPadding: false,
      lineHeight: fontSize,
      textAlignVertical: 'center' as const,
    },
    style,
  ];

  const TextComponent = opacity ? Animated.Text : Text;
  const content = (
    <TextComponent style={[textStyle, opacity ? { opacity } : null]} allowFontScaling={false}>
      {emoji}
    </TextComponent>
  );

  if (!motionEnabled) {
    return <Animated.View style={containerStyle}>{content}</Animated.View>;
  }

  return (
    <Animated.View
      collapsable={false}
      style={[containerStyle, { transform: [{ scale }] }]}
    >
      {content}
    </Animated.View>
  );
}
