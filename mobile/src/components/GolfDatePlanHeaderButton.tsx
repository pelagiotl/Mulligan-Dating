import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ChatHeaderFeatureHint from './ChatHeaderFeatureHint';

type Props = {
  onPress: () => void;
};

/** Prominent chat header CTA for Plan Golf Date. */
export default function GolfDatePlanHeaderButton({ onPress }: Props) {
  return (
    <ChatHeaderFeatureHint
      storageKey="mulligan_chat_hint_golf_date_plan_v1"
      label="Plan Golf Date"
      priority={10}
      glowColor="rgba(45, 212, 191, 0.45)"
      alwaysPulse
    >
      {({ onPressWithHintDismiss }) => (
        <TouchableOpacity
          onPress={() => onPressWithHintDismiss(onPress)}
          activeOpacity={0.85}
          style={styles.button}
          accessibilityLabel="Plan Golf Date"
        >
          <Text style={styles.emoji}>⛳</Text>
          <View style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={1}>
              Plan
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </ChatHeaderFeatureHint>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 52,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(15, 118, 110, 0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(94, 234, 212, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  emoji: { fontSize: 16 },
  labelWrap: { maxWidth: 40 },
  label: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
