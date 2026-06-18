import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** When false, renders nothing. */
  verified?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Admin-granted Mulligan verification — not automated photo verification. */
export default function VerifiedBadge({ verified, size = 18, style }: Props) {
  if (!verified) return null;
  const dim = size;
  return (
    <View
      style={[styles.badge, { width: dim, height: dim, borderRadius: dim / 2 }, style]}
      accessibilityLabel="Verified by Mulligan"
      accessibilityRole="image"
    >
      <Text style={[styles.check, { fontSize: Math.max(10, dim * 0.62) }]}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  check: {
    color: '#fff',
    fontWeight: '800',
    lineHeight: undefined,
    includeFontPadding: false,
    marginTop: -1,
  },
});
