import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../utils/api';

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
}

interface ReferralData {
  referralCode: string;
  referralLink: string;
  tokensEarned: number;
}

interface NoTokensModalProps {
  visible: boolean;
  onClose: () => void;
  onTokenClaimed?: () => void;
}

export default function NoTokensModal({ visible, onClose, onTokenClaimed }: NoTokensModalProps) {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
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
      // Fetch token data
      const tokenResponse = await api.get<TokenData>('/tokens');
      setTokenData(tokenResponse);

      // If can't claim weekly token, fetch referral data
      if (!tokenResponse.canClaimWeeklyToken) {
        try {
          const referralResponse = await api.get<ReferralData>('/referrals');
          setReferralData(referralResponse);
        } catch (err) {
          console.error('Failed to fetch referral data:', err);
        }
      }
    } catch (err) {
      console.error('Failed to fetch token data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || !tokenData?.canClaimWeeklyToken) return;

    setClaiming(true);
    try {
      const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
      Alert.alert('Success!', result.message || `${result.tokensGranted} token(s) claimed!`);
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

  const handleShareReferral = async () => {
    if (!referralData) return;

    try {
      const result = await Share.share({
        message: `Join me on Mulligan! Use my referral code: ${referralData.referralCode}\n\n${referralData.referralLink}\n\nWe'll both get rewards!`,
        url: referralData.referralLink,
      });

      if (result.action === Share.sharedAction) {
        // User shared successfully
      }
    } catch (err) {
      // Fallback to copying if share fails
      handleCopyReferral();
    }
  };

  const handleCopyReferral = async () => {
    if (!referralData) return;

    try {
      // Copy the referral code to clipboard
      await Clipboard.setStringAsync(referralData.referralCode);
      Alert.alert('Copied!', `Referral code "${referralData.referralCode}" has been copied to your clipboard.`);
    } catch (err) {
      console.error('Copy error:', err);
      // Fallback: Show in alert if copy fails
      Alert.alert(
        'Your Referral Code',
        `Code: ${referralData.referralCode}\n\nLink: ${referralData.referralLink}\n\nPlease copy this manually.`,
        [{ text: 'OK' }]
      );
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
                You're out of mulligan tokens and you've already claimed your weekly tokens. Refer a friend to get more tokens!
              </Text>
              
              {referralData && (
                <View style={styles.referralSection}>
                  <Text style={styles.referralLabel}>Your Referral Code:</Text>
                  <View style={styles.referralCodeContainer}>
                    <Text style={styles.referralCode}>{referralData.referralCode}</Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleShareReferral}
                  >
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>📤 Share Referral Link</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={handleCopyReferral}
                  >
                    <Text style={styles.secondaryButtonText}>
                      📋 Copy Code & Link
                    </Text>
                  </TouchableOpacity>

                  {referralData.tokensEarned > 0 && (
                    <Text style={styles.tokensEarned}>
                      You've earned {referralData.tokensEarned} token{referralData.tokensEarned !== 1 ? 's' : ''} from referrals!
                    </Text>
                  )}
                </View>
              )}
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
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#8B1538',
  },
  secondaryButtonText: {
    color: '#8B1538',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 12,
  },
  referralSection: {
    width: '100%',
    marginTop: 8,
  },
  referralLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  referralCodeContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8B1538',
  },
  referralCode: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8B1538',
    textAlign: 'center',
    letterSpacing: 2,
  },
  tokensEarned: {
    fontSize: 14,
    color: '#10b981',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
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

