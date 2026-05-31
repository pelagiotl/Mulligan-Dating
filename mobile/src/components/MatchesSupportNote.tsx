import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { openMatchesSupportEmail, type MatchesSupportContext } from '../constants/support';

type Props = Pick<
  MatchesSupportContext,
  'userId' | 'displayName' | 'phoneNumber' | 'availableTokens' | 'activeMatches' | 'slotLimit'
> & {
  hintColor?: string;
};

export default function MatchesSupportNote({
  userId,
  displayName,
  phoneNumber,
  availableTokens,
  activeMatches,
  slotLimit,
  hintColor,
}: Props) {
  const onPress = () => {
    openMatchesSupportEmail({
      userId,
      displayName,
      phoneNumber,
      availableTokens,
      activeMatches,
      slotLimit,
    });
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.wrap}
      accessibilityRole="link"
      accessibilityLabel="Email Mulligan support"
    >
      <Text style={[styles.text, hintColor != null && { color: hintColor }]}>
        Questions?{' '}
        <Text style={[styles.link, hintColor != null && { color: hintColor }]}>Email support</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
    textAlign: 'center',
  },
  link: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
