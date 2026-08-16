import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Animated, Platform } from 'react-native';
import ChatHeaderFeatureHint from './ChatHeaderFeatureHint';

type Props = {
  onPress: () => void;
};

/** Prominent chat header CTA for Plan Golf Date — tip stays visible. */
export default function GolfDatePlanHeaderButton({ onPress }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(94, 234, 212, 0.4)', 'rgba(94, 234, 212, 0.95)'],
  });
  const shadowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.7],
  });

  return (
    <ChatHeaderFeatureHint
      storageKey="mulligan_chat_hint_golf_date_plan_v3"
      label="Plan Golf Date"
      priority={10}
      glowColor="rgba(45, 212, 191, 0.55)"
      alwaysPulse
      alwaysShowTip
      tipPlacement="above"
      tipAlign="center"
      tipLift={40}
      tipWidth={104}
    >
      {({ onPressWithHintDismiss }) => (
        <Animated.View
          style={[
            styles.buttonShell,
            {
              borderColor,
              ...(Platform.OS === 'ios'
                ? { shadowOpacity, shadowColor: '#2dd4bf', shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }
                : null),
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => onPressWithHintDismiss(onPress)}
            activeOpacity={0.85}
            style={styles.button}
            accessibilityLabel="Plan Golf Date"
          >
            <Text style={styles.emoji}>🏌️</Text>
            <View style={styles.labelWrap}>
              <Text style={styles.label} numberOfLines={1}>
                Plan
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ChatHeaderFeatureHint>
  );
}

const styles = StyleSheet.create({
  buttonShell: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'rgba(15, 118, 110, 0.55)',
    overflow: 'hidden',
  },
  button: {
    minWidth: 52,
    height: 40,
    paddingHorizontal: 10,
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
