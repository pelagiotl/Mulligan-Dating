import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import ChatHeaderFeatureHint from './ChatHeaderFeatureHint';

type Props = {
  onPress: () => void;
};

/** Chat header entry point for Smart Intentional Date Planner — always available. */
export default function HangoutPlanHeaderButton({ onPress }: Props) {
  return (
    <ChatHeaderFeatureHint
      storageKey="mulligan_chat_hint_hangout_plan_v1"
      label="Smart date ideas"
      priority={40}
      glowColor="rgba(251, 191, 36, 0.4)"
      enablePulse={false}
    >
      {({ onPressWithHintDismiss }) => (
        <TouchableOpacity
          onPress={() => onPressWithHintDismiss(onPress)}
          activeOpacity={0.8}
          style={styles.button}
          accessibilityLabel="Smart hangout ideas"
        >
          <Text style={styles.emoji}>📅</Text>
        </TouchableOpacity>
      )}
    </ChatHeaderFeatureHint>
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
