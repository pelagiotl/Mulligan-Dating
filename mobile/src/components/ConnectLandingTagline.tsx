import React from 'react';
import { Platform, StyleSheet, Text, type TextStyle } from 'react-native';
import { CONNECT_LANDING_TAGLINE } from '../constants/connectLanding';

type ConnectLandingTaglineProps = {
  style?: TextStyle;
};

/**
 * Connect landing subtitle — one line when possible; shrinks on large system font (Samsung, etc.).
 */
export default function ConnectLandingTagline({ style }: ConnectLandingTaglineProps) {
  return (
    <Text
      style={[styles.base, style]}
      adjustsFontSizeToFit
      numberOfLines={1}
      minimumFontScale={0.72}
      {...(Platform.OS === 'android' ? { textBreakStrategy: 'simple' as const } : {})}
    >
      {CONNECT_LANDING_TAGLINE}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    maxWidth: '100%',
    textAlign: 'center',
    alignSelf: 'center',
  },
});
