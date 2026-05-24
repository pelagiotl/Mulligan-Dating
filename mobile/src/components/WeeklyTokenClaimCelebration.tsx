import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  visible: boolean;
  tokensGranted: number;
  onDismiss: () => void;
};

export default function WeeklyTokenClaimCelebration({ visible, tokensGranted, onDismiss }: Props) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  const n = Math.max(1, Math.floor(tokensGranted));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.cardWrap} onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <Text style={styles.emoji} accessibilityElementsHidden>
              🎟️
            </Text>
            <Text style={styles.title}>Weekly refill claimed</Text>
            <Text style={styles.sub}>
              {n} token{n !== 1 ? 's' : ''} added — you&apos;re ready to connect.
            </Text>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 36,
  },
  cardWrap: {
    alignSelf: 'stretch',
  },
  card: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  emoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  sub: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
});
