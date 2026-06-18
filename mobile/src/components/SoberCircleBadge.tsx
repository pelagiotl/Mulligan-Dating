import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { soberCircleLevelEmoji, soberCircleLevelLabel } from '../constants/soberCircle';

type SoberCircleBadgeProps = {
  level?: string | null;
  /** Shown before the level label (e.g. "You" or a first name). */
  prefix?: string;
  compact?: boolean;
  /** Full-width stacked layout for match celebration cards. */
  stacked?: boolean;
  midnight?: boolean;
  style?: StyleProp<ViewStyle>;
  /** When level is unknown but match is from sober circle. */
  fallbackLabel?: string;
};

export default function SoberCircleBadge({
  level,
  prefix,
  compact = false,
  stacked = false,
  midnight = false,
  style,
  fallbackLabel = 'Sober Circle',
}: SoberCircleBadgeProps) {
  const label = soberCircleLevelLabel(level) ?? fallbackLabel;
  const emoji = level ? soberCircleLevelEmoji(level) : '💚';
  const text = prefix ? `${prefix}: ${label}` : label;

  return (
    <View
      style={[
        stacked ? styles.stacked : compact ? styles.compact : styles.badge,
        midnight ? styles.badgeMidnight : styles.badgeLight,
        style,
      ]}
    >
      <Text
        style={[
          stacked ? styles.stackedText : compact ? styles.compactText : styles.text,
          midnight && styles.textMidnight,
        ]}
        numberOfLines={stacked ? 2 : 1}
        adjustsFontSizeToFit={!stacked}
        minimumFontScale={stacked ? 1 : 0.85}
      >
        {emoji} {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  badgeLight: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  badgeMidnight: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderColor: 'rgba(74,222,128,0.4)',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  textMidnight: {
    color: '#bbf7d0',
  },
  compact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  compactText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803d',
  },
  stacked: {
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  stackedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    textAlign: 'center',
    lineHeight: 20,
  },
});
