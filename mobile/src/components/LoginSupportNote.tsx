import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { openLoginSupportEmail } from '../constants/support';

type Props = {
  phoneNumber?: string | null;
  step?: 'phone' | 'verify';
  /** Inside the white auth card (dark text); default is below card on gradient. */
  variant?: 'onCard' | 'onDark';
};

export default function LoginSupportNote({
  phoneNumber,
  step = 'phone',
  variant = 'onDark',
}: Props) {
  return (
    <TouchableOpacity
      onPress={() => openLoginSupportEmail({ phoneNumber, step })}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel="Email Mulligan support"
      style={styles.wrap}
    >
      <Text style={[styles.text, variant === 'onCard' && styles.textOnCard]}>
        Questions? <Text style={[styles.link, variant === 'onCard' && styles.linkOnCard]}>Email support</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 4,
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
  },
  link: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  textOnCard: {
    color: 'rgba(45, 17, 24, 0.75)',
  },
  linkOnCard: {
    color: '#e11d48',
  },
});
