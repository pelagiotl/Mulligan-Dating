import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { Socket } from 'socket.io-client';

interface MulliganMomentsProps {
  matchId: string;
  socket: Socket | null;
  onStarterGenerated?: (starter: string) => void;
}

export default function MulliganMoments({ matchId, socket, onStarterGenerated }: MulliganMomentsProps) {
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);
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
      console.log('💬 Conversation status response:', response);
      // API utility returns data directly, not wrapped in .data
      if (response && typeof response.isDead === 'boolean') {
        setCanReset(response.isDead || response.canReset || false);
      } else {
        console.warn('⚠️ Unexpected conversation status response format:', response);
        setCanReset(false);
      }
    } catch (error: any) {
      console.error('❌ Failed to check conversation status:', error);
      console.error('❌ Error details:', error?.response?.data || error?.message);
      setCanReset(false);
    } finally {
      setChecking(false);
    }
  };

  const handleReset = async () => {
    Alert.alert(
      'Mulligan Moment',
      'Use a token to reset this conversation and get a fresh AI-generated starter based on your shared interests?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Conversation',
          style: 'default',
          onPress: async () => {
            try {
              setResetting(true);
              const response = await api.post(`/matches/${matchId}/reset-conversation`);
              
              if (response.data.success) {
                setStarter(response.data.starter);
                setExplanation(response.data.explanation);
                setCanReset(false);
                
                if (onStarterGenerated) {
                  onStarterGenerated(response.data.starter);
                }

                Alert.alert(
                  '✨ Conversation Reset!',
                  response.data.message || 'A new conversation starter has been generated.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error: any) {
              if (error?.response?.data?.code === 'NO_TOKENS') {
                Alert.alert(
                  'No Tokens Available',
                  'You need a Mulligan token to reset a conversation. Get more tokens in Settings.',
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert('Error', error?.message || 'Failed to reset conversation');
              }
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#667eea" />
      </View>
    );
  }

  if (starter) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.starterCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.starterLabel}>✨ New Conversation Starter</Text>
          <Text style={styles.starterText}>{starter}</Text>
          {explanation && (
            <Text style={styles.explanationText}>{explanation}</Text>
          )}
        </LinearGradient>
      </View>
    );
  }

  if (!canReset) {
    return null;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleReset}
        disabled={resetting}
        style={styles.resetButton}
      >
        <LinearGradient
          colors={['#f093fb', '#f5576c']}
          style={styles.resetButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {resetting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.resetButtonEmoji}>🔄</Text>
              <Text style={styles.resetButtonText}>Mulligan Moment</Text>
              <Text style={styles.resetButtonSubtext}>Reset conversation</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  resetButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  resetButtonGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resetButtonSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  starterCard: {
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  starterLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  starterText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 24,
  },
  explanationText: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    fontStyle: 'italic',
  },
});

