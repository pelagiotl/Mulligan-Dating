/**
 * Modal shown when User B receives a game invite (Truth or Dare / Never Have I Ever)
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import type { PendingGameRequest } from '../utils/pendingGameRequest';

interface GameRequestModalProps {
  visible: boolean;
  request: PendingGameRequest | null;
  onClose: () => void;
  onAccepted: (matchId: string, gameType: 'truth_or_dare' | 'never_have_i_ever') => void;
}

export default function GameRequestModal({
  visible,
  request,
  onClose,
  onAccepted,
}: GameRequestModalProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!request) return null;

  const gameLabel = request.gameType === 'truth_or_dare' ? 'Truth or Dare' : 'Never Have I Ever';
  const emoji = request.gameType === 'truth_or_dare' ? '🎲' : '🙊';

  const handleRespond = async (accept: boolean) => {
    if (submitting) return;
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    setSubmitting(true);
    try {
      await api.post(`/matches/${request.matchId}/game-request/${request.requestId}/respond`, {
        accept,
      });
      if (accept) {
        onAccepted(request.matchId, request.gameType);
      }
      onClose();
    } catch (err) {
      console.warn('Game request respond error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.card}
        >
          <LinearGradient
            colors={request.gameType === 'truth_or_dare' ? ['#ff006e', '#ff4081', '#667eea'] : ['#00e676', '#00b8d4', '#667eea']}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.title}>Game Invite</Text>
            <Text style={styles.body}>
              {request.fromUserName} wants to play {gameLabel} with you!
            </Text>
            {submitting ? (
              <ActivityIndicator size="large" color="#fff" style={styles.loader} />
            ) : (
              <View style={styles.buttons}>
                <TouchableOpacity
                  onPress={() => handleRespond(true)}
                  style={styles.acceptButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#00c853', '#00e676']}
                    style={styles.acceptGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.acceptText}>Accept</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRespond(false)}
                  style={styles.declineButton}
                  activeOpacity={0.8}
                >
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeArea}>
              <Text style={styles.closeText}>Maybe later</Text>
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  gradient: {
    padding: 28,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  loader: {
    marginVertical: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  acceptButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  acceptGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  declineText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeArea: {
    paddingVertical: 8,
  },
  closeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textDecorationLine: 'underline',
  },
});
