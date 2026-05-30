import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

type Props = {
  slotLimit: number;
  onViewMatches?: () => void;
};

export default function MatchCapacityBanner({ slotLimit, onViewMatches }: Props) {
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.title}>You&apos;re at capacity</Text>
      <Text style={styles.body}>
        You have {slotLimit} active connections — the maximum right now. Unmatch with someone or
        wait for a connection to expire after 7 days to connect with someone new.
      </Text>
      {onViewMatches ? (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={onViewMatches}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="View your connections"
        >
          <Text style={styles.linkText}>View your connections</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 21, 56, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 21, 56, 0.28)',
    ...Platform.select({
      ios: {
        shadowColor: '#8B1538',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8B1538',
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
  },
  linkBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B1538',
    textDecorationLine: 'underline',
  },
});
