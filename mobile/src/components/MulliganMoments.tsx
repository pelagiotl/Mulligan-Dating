import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { Socket } from 'socket.io-client';
import MulliganMomentModal from './MulliganMomentModal';

interface MulliganMomentsProps {
  matchId: string;
  socket: Socket | null;
  onStarterGenerated?: (starter: string) => void;
  compact?: boolean;
}

export default function MulliganMoments({ matchId, socket, onStarterGenerated, compact }: MulliganMomentsProps) {
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [starter, setStarter] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  useEffect(() => {
    checkConversationStatus();
  }, [matchId]);

  useEffect(() => {
    if (!socket) return;

    const handleReset = (data: { matchId: string; starter: string; explanation: string }) => {
      if (data.matchId === matchId) {
        setStarter(data.starter);
        setExplanation(data.explanation);
        setCanReset(false);
        setModalVisible(false);
        if (onStarterGenerated) {
          onStarterGenerated(data.starter);
        }
      }
    };

    socket.on('conversation_reset', handleReset);

    return () => {
      socket.off('conversation_reset', handleReset);
    };
  }, [socket, matchId, onStarterGenerated]);

  const checkConversationStatus = async () => {
    try {
      setChecking(true);
      const response = await api.get(`/matches/${matchId}/conversation-status`);
      if (response && typeof response.isDead === 'boolean') {
        setCanReset(response.isDead || response.canReset || false);
      } else {
        setCanReset(false);
      }
    } catch (error: any) {
      console.error('Failed to check conversation status:', error?.message || error);
      setCanReset(false);
    } finally {
      setChecking(false);
    }
  };

  const performReset = async () => {
    try {
      setResetting(true);
      const response = await api.post<{ success?: boolean; starter?: string; explanation?: string; message?: string }>(
        `/matches/${matchId}/reset-conversation`
      );

      if (response?.success) {
        setStarter(response.starter ?? null);
        setExplanation(response.explanation ?? null);
        setCanReset(false);
        setModalVisible(false);

        if (onStarterGenerated && response.starter) {
          onStarterGenerated(response.starter);
        }
      }
    } catch (error: any) {
      setModalVisible(false);
      Alert.alert('Error', error?.message || 'Failed to reset conversation');
    } finally {
      setResetting(false);
    }
  };

  if (checking) {
    return null;
  }

  if (starter) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.starterCardOuter}>
          <LinearGradient
            colors={['#f5576c', '#f093fb', '#667eea']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.starterCardBorder}
          >
            <LinearGradient
              colors={['#1a0b22', '#2d1240', '#351048']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.starterCard, compact && styles.starterCardCompact]}
            >
              <LinearGradient
                colors={['rgba(245,87,108,0.25)', 'transparent', 'rgba(102,126,234,0.2)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.starterHeader}>
                <View style={styles.starterBadge}>
                  <Text style={styles.starterBadgeText}>MULLIGAN MOMENT</Text>
                </View>
                <Text style={styles.starterEmoji}>✨</Text>
              </View>
              <Text style={styles.starterLabel}>Your fresh opener</Text>
              <Text style={styles.starterText}>{starter}</Text>
              {explanation ? (
                <Text style={styles.explanationText}>{explanation}</Text>
              ) : null}
              <Text style={styles.starterHint}>Already in your message box — edit or send when ready</Text>
              {onStarterGenerated ? (
                <TouchableOpacity
                  onPress={() => onStarterGenerated(starter)}
                  activeOpacity={0.85}
                  style={styles.useAgainTouchable}
                >
                  <LinearGradient
                    colors={['#f5576c', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.useAgainGradient}
                  >
                    <Text style={styles.useAgainText}>Paste into chat again</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </LinearGradient>
          </LinearGradient>
        </View>
      </View>
    );
  }

  if (!canReset) {
    return null;
  }

  return (
    <>
      <MulliganMomentModal
        visible={modalVisible}
        onCancel={() => !resetting && setModalVisible(false)}
        onConfirm={performReset}
        confirming={resetting}
      />
      <View style={[styles.container, compact && styles.containerCompact]}>
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          disabled={resetting}
          style={[styles.resetButton, compact && styles.resetButtonCompact]}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#f093fb', '#f5576c', '#667eea']}
            style={[styles.resetButtonGradient, compact && styles.resetButtonGradientCompact]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {resetting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <View style={styles.resetEmojiRing}>
                  <Text style={[styles.resetButtonEmoji, compact && styles.resetButtonEmojiCompact]}>🔄</Text>
                </View>
                <Text style={[styles.resetButtonText, compact && styles.resetButtonTextCompact]}>Mulligan Moment</Text>
                <Text style={[styles.resetButtonSubtext, compact && styles.resetButtonSubtextCompact]}>
                  Fresh AI opener · tap to spark the chat
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  containerCompact: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  resetButton: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#f5576c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  resetButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonCompact: {
    borderRadius: 12,
  },
  resetButtonGradientCompact: {
    padding: 10,
  },
  resetEmojiRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resetButtonEmoji: {
    fontSize: 26,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  resetButtonTextCompact: {
    fontSize: 14,
    marginBottom: 2,
  },
  resetButtonSubtext: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 17,
  },
  resetButtonSubtextCompact: {
    fontSize: 10,
  },
  resetButtonEmojiCompact: {
    fontSize: 22,
  },
  starterCardOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  starterCardBorder: {
    padding: 2,
    borderRadius: 18,
  },
  starterCard: {
    padding: 18,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  starterCardCompact: {
    padding: 14,
  },
  starterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  starterBadge: {
    backgroundColor: 'rgba(245, 87, 108, 0.35)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  starterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  starterEmoji: {
    fontSize: 22,
  },
  starterLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  starterText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 25,
  },
  explanationText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  starterHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  useAgainTouchable: {
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  useAgainGradient: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  useAgainText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
