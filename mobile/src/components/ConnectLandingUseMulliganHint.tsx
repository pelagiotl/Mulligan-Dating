import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import SmoothPulsingEmoji from './SmoothPulsingEmoji';

type Props = {
  textStyle: TextStyle;
};

/** “⛳ Use a Mulligan” below the Connect CTA — flag pulses to draw the eye. */
export default function ConnectLandingUseMulliganHint({ textStyle }: Props) {
  return (
    <View style={styles.row}>
      <SmoothPulsingEmoji
        emoji="⛳"
        fontSize={16}
        variant="prominent"
        containerStyle={styles.emojiWrap}
      />
      <Text style={textStyle}>Use a Mulligan</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emojiWrap: {
    marginBottom: 0,
  },
});
