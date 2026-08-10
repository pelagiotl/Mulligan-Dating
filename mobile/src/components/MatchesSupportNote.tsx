import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { openMatchesSupportEmail, type MatchesSupportContext } from '../constants/support';

type Props = Pick<
  MatchesSupportContext,
  'userId' | 'displayName' | 'phoneNumber' | 'availableTokens' | 'activeMatches' | 'slotLimit'
> & {
  hintColor?: string;
  /** Tighter spacing when nested in LegalFooter. */
  embeddedInFooter?: boolean;
};

export default function MatchesSupportNote({
  userId,
  displayName,
  phoneNumber,
  availableTokens,
  activeMatches,
  slotLimit,
  hintColor,
  embeddedInFooter = false,
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
      style={[styles.wrap, embeddedInFooter && styles.wrapInFooter]}
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
  wrapInFooter: {
    marginTop: 0,
    marginBottom: 14,
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
