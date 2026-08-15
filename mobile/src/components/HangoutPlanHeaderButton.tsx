import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import ChatHeaderIconGlow from './ChatHeaderIconGlow';

type Props = {
  onPress: () => void;
};

/** Chat header entry point for Smart Intentional Date Planner — always available. */
export default function HangoutPlanHeaderButton({ onPress }: Props) {
  return (
    <ChatHeaderIconGlow tint="sky">
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.button}
        accessibilityLabel="Smart hangout ideas"
      >
        <Text style={styles.emoji}>📅</Text>
      </TouchableOpacity>
    </ChatHeaderIconGlow>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
});
