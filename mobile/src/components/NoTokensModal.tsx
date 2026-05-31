import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';
import { playTokenClaimSound } from '../utils/sounds';

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
}

interface NoTokensModalProps {
  visible: boolean;
  onClose: () => void;
  onTokenClaimed?: () => void;
}

export default function NoTokensModal({ visible, onClose, onTokenClaimed }: NoTokensModalProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchData();
    }
  }, [visible]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const tokenResponse = await api.get<TokenData>('/tokens');
      setTokenData(tokenResponse);
    } catch (err: any) {
      // 401/403: session expired; logout will run and unmount this modal — skip log only
      if (err?.status !== 401 && err?.status !== 403) {
        console.error('Failed to fetch token data:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || !tokenData?.canClaimWeeklyToken) return;

    setClaiming(true);
    try {
      const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
      const granted = result.tokensGranted ?? 0;
      if (granted > 0) {
        void playTokenClaimSound();
      }
      Alert.alert('Success!', result.message || `${granted} token(s) claimed!`);
      await fetchData();
      if (onTokenClaimed) {
        onTokenClaimed();
      }
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to claim tokens. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>🎟️ No Tokens Available</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8B1538" />
            </View>
          ) : tokenData?.canClaimWeeklyToken ? (
            <View style={styles.content}>
              <Text style={styles.message}>
                You're out of mulligan tokens! Claim your weekly tokens to start connecting with people.
              </Text>
              <TouchableOpacity
                style={[styles.button, claiming && styles.buttonDisabled]}
                onPress={handleClaim}
                disabled={claiming}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  {claiming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>✨ Claim Weekly Tokens</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.message}>
                You're out of mulligan tokens and you've already claimed your weekly tokens. Cop some more in the app to keep connecting!
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    width: '100%',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
});

