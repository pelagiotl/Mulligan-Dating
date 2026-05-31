import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { openLoginSupportEmail } from '../constants/support';

type Props = {
  phoneNumber?: string | null;
  step?: 'phone' | 'verify';
};

export default function LoginSupportNote({ phoneNumber, step = 'phone' }: Props) {
  return (
    <TouchableOpacity
      onPress={() => openLoginSupportEmail({ phoneNumber, step })}
      activeOpacity={0.7}
      accessibilityRole="link"
      accessibilityLabel="Email Mulligan support"
      style={styles.wrap}
    >
      <Text style={styles.text}>
        Questions? <Text style={styles.link}>Email support</Text>
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
});
