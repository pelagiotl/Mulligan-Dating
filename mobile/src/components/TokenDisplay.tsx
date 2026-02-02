import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate?: string | null;
}

interface TokenPackage {
  id: number;
  tokens: number;
  price: number;
  priceFormatted: string;
  pricePerToken: string;
  available?: boolean;
  wouldExceedLimit?: boolean;
  maxTokensCanBuy?: number;
}

// Premium Token Display Component with animations
function PremiumTokenDisplay({ 
  count, 
  onPress 
}: { 
  count: number;
  onPress: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Subtle pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      delayPressIn={0}
    >
      <Animated.View
        style={[
          styles.premiumContainer,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.premiumGradient}
        >
          {/* Shimmer overlay */}
          <Animated.View
            style={[
              styles.shimmerOverlay,
              {
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
          
          <View style={styles.premiumContent}>
            <Text style={styles.premiumIcon}>🎟️</Text>
            <Text style={styles.premiumCount}>{count}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

interface TokenDisplayProps {
  compact?: boolean; // If true, only show token count (for header use)
  premium?: boolean; // If true, show premium styled version with animations
}

export default function TokenDisplay({ compact = false, premium = false }: TokenDisplayProps) {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin || false;
  const [data, setData] = useState<TokenData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (user) {
      fetchTokens();
    }
  }, [user]);

  // Refresh tokens when screen is focused — clear cache so count is always up to date (e.g. after admin grant)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        api.clearCache('/tokens');
        fetchTokens();
      }
    }, [user])
  );

  // Periodic refresh while screen is focused so token count stays up to date in real time
  useEffect(() => {
    if (!user || !isFocused) return;
    const interval = setInterval(() => {
      api.clearCache('/tokens');
      fetchTokens();
    }, 20 * 1000); // every 20 seconds when this screen is focused
    return () => clearInterval(interval);
  }, [user, isFocused]);

  const fetchTokens = async () => {
    if (!user) return;
    try {
      setError('');
      const tokenData = await api.get<TokenData>('/tokens');
      setData(tokenData);
    } catch (err: any) {
      console.error('Failed to fetch tokens:', err);
      setError(err?.message || 'Failed to load tokens');
    }
  };

  const fetchPackages = async () => {
    try {
      setLoadingPackages(true);
      const response = await api.get<{ packages: TokenPackage[]; availableTokens?: number }>('/payments/packages');
      setPackages(response.packages || []);
    } catch (err: any) {
      console.error('Failed to fetch packages:', err);
      Alert.alert('Error', 'Failed to load token packages. Please try again.');
      setShowPurchaseModal(false);
    } finally {
      setLoadingPackages(false);
    }
  };

  const handlePurchase = async (packageId: number) => {
    try {
      setPurchasing(true);
      setError('');

      console.log('🛒 Purchase initiated for package ID:', packageId);

      // Create payment intent
      const paymentIntent = await api.post<{
        clientSecret: string;
        paymentIntentId: string;
        amount: number;
        tokensToGrant: number;
      }>('/payments/create-intent', { packageId });

      console.log('✅ Payment intent created:', {
        packageId,
        tokensToGrant: paymentIntent.tokensToGrant,
        amount: paymentIntent.amount,
        paymentIntentId: paymentIntent.paymentIntentId
      });

      // TODO: Stripe PaymentSheet requires a development build (not Expo Go)
      // For now, show a message that payment processing will be available in production builds
      Alert.alert(
        'Payment Integration',
        `Payment intent created for ${paymentIntent.tokensToGrant} token${paymentIntent.tokensToGrant !== 1 ? 's' : ''}. \n\nNote: Full payment processing requires a development build (not Expo Go). This will work in production builds.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setShowPurchaseModal(false);
              setPurchasing(false);
            }
          }
        ]
      );
    } catch (err: any) {
      console.error('Purchase error:', err);
      const errorMessage = err?.message || 'Failed to process purchase. Please try again.';
      setError(errorMessage);
      Alert.alert('Purchase Failed', errorMessage);
    } finally {
      setPurchasing(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || !data?.canClaimWeeklyToken) {
      if (!data?.canClaimWeeklyToken) {
        setError('You cannot claim weekly tokens right now.');
        setTimeout(() => setError(''), 5000);
      }
      return;
    }

    setClaiming(true);
    setError('');
    setSuccess('');

    try {
      const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
      setSuccess(result.message || `${result.tokensGranted} token(s) claimed successfully!`);
      setTimeout(() => setSuccess(''), 3000);
      await fetchTokens();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to claim tokens. Please try again.';
      setError(errorMessage);
      setTimeout(() => setError(''), 8000);
    } finally {
      setClaiming(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading tokens...</Text>
      </View>
    );
  }

  // Compact mode: only show token count (for header)
  if (compact) {
    // Premium mode: slick, animated token display
    if (premium) {
      return (
        <>
          <PremiumTokenDisplay 
            count={data.availableTokens} 
            onPress={() => {
              setShowInfoModal(true);
              fetchPackages();
            }}
          />
          {/* Token Info Modal */}
          <Modal
            visible={showInfoModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowInfoModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.infoModalContent}>
                <View style={styles.infoModalHeader}>
                  <Text style={styles.infoModalTitle}>🎟️ Your Tokens</Text>
                  <TouchableOpacity onPress={() => setShowInfoModal(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.infoModalScroll} showsVerticalScrollIndicator={false}>
                  {/* Current Token Count */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Current Balance</Text>
                    <View style={styles.tokenBalanceCard}>
                      <Text style={styles.tokenBalanceNumber}>{data.availableTokens}</Text>
                      <Text style={styles.tokenBalanceLabel}>
                        Token{data.availableTokens !== 1 ? 's' : ''} Available
                      </Text>
                    </View>
                  </View>

                  {/* Weekly Refill Info */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Weekly Refill</Text>
                    {data.canClaimWeeklyToken ? (
                      <View style={styles.refillCard}>
                        <Text style={styles.refillEmoji}>✨</Text>
                        <Text style={styles.refillText}>
                          Your weekly tokens are ready! Claim them now to fill up to 7 tokens.
                        </Text>
                        <TouchableOpacity
                          onPress={async () => {
                            await handleClaim();
                            setShowInfoModal(false);
                          }}
                          disabled={claiming}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={claiming ? ['#999', '#777'] : ['#667eea', '#764ba2', '#f093fb']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.claimButtonGradient, claiming && styles.claimButtonDisabled]}
                          >
                            {claiming ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.claimButtonText}>✨ Claim Weekly Tokens</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    ) : data.nextRefillDate ? (
                      <View style={styles.refillCard}>
                        <Text style={styles.refillEmoji}>⏰</Text>
                        <Text style={styles.refillText}>
                          Next weekly refill available:
                        </Text>
                        <Text style={styles.refillDate}>
                          {new Date(data.nextRefillDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Text>
                        <Text style={styles.refillSubtext}>
                          You'll get 7 tokens to fill up to your maximum of 7.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.refillCard}>
                        <Text style={styles.refillEmoji}>🎉</Text>
                        <Text style={styles.refillText}>
                          Claim your first weekly tokens now!
                        </Text>
                        <TouchableOpacity
                          onPress={async () => {
                            await handleClaim();
                            setShowInfoModal(false);
                          }}
                          disabled={claiming}
                          activeOpacity={0.8}
                        >
                          <LinearGradient
                            colors={claiming ? ['#999', '#777'] : ['#667eea', '#764ba2', '#f093fb']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.claimButtonGradient, claiming && styles.claimButtonDisabled]}
                          >
                            {claiming ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.claimButtonText}>✨ Claim Weekly Tokens</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Buy More Section */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Need More Tokens?</Text>
                    <TouchableOpacity
                      style={[styles.buyButton]}
                      onPress={() => {
                        setShowInfoModal(false);
                        // Small delay to ensure info modal closes before purchase modal opens
                        setTimeout(() => {
                          setShowPurchaseModal(true);
                          fetchPackages();
                        }, 300);
                      }}
                    >
                      <Text style={styles.buyButtonText}>💳 Buy More Tokens</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Info Text */}
                  <View style={styles.infoSection}>
                    <Text style={styles.tokenInfoText}>
                      💡 <Text style={styles.tokenInfoTextBold}>How tokens work:</Text>
                      {'\n'}• Use tokens to connect with people
                      {'\n'}• Get 7 tokens weekly (fills up to 7 max)
                      {'\n'}• Maximum of 7 tokens at a time
                    </Text>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Purchase Modal - Also available in compact/premium mode */}
          <Modal
            visible={showPurchaseModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowPurchaseModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Buy Mulligan Tokens</Text>
                  <TouchableOpacity onPress={() => setShowPurchaseModal(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {loadingPackages ? (
                  <ActivityIndicator size="large" color="#8B1538" style={styles.modalLoading} />
                ) : (
                  <ScrollView style={styles.packagesList}>
                    {packages.map((pkg) => {
                      const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                      return (
                        <TouchableOpacity
                          key={pkg.id}
                          style={[
                            styles.packageItem,
                            (pkg.id === 3 || pkg.id === 7) && styles.packageItemBestValue,
                            isDisabled && styles.packageItemDisabled
                          ]}
                          onPress={() => {
                            if (pkg.wouldExceedLimit) {
                              Alert.alert(
                                'Token Limit Reached',
                                `This purchase would exceed your 7 token limit. You can only purchase up to ${pkg.maxTokensCanBuy || 0} more token${(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''}.`,
                                [{ text: 'OK' }]
                              );
                              return;
                            }
                            handlePurchase(pkg.id);
                          }}
                          disabled={isDisabled}
                        >
                          <View style={styles.packageHeader}>
                            <Text style={styles.packageTokens}>{pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}</Text>
                            {(pkg.id === 3 || pkg.id === 7) && (
                              <Text style={styles.bestValueBadge}>Best Value</Text>
                            )}
                            {pkg.wouldExceedLimit && (
                              <Text style={styles.limitExceededBadge}>Limit Exceeded</Text>
                            )}
                          </View>
                          <Text style={styles.packagePrice}>{pkg.priceFormatted}</Text>
                          <Text style={styles.packagePricePerToken}>
                            ${pkg.pricePerToken} per token
                          </Text>
                          {pkg.wouldExceedLimit && (
                            <Text style={styles.limitExceededText}>
                              You can only purchase up to {pkg.maxTokensCanBuy} more token{(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {purchasing && (
                  <View style={styles.purchasingOverlay}>
                    <ActivityIndicator size="large" color="#8B1538" />
                    <Text style={styles.purchasingText}>Processing payment...</Text>
                  </View>
                )}
              </View>
            </View>
          </Modal>
        </>
      );
    }
    
    // Standard compact mode
    return (
      <View style={styles.compactContainer}>
        <Text style={styles.tokenIcon}>🎟️</Text>
        <Text style={styles.compactTokenNumber}>{data.availableTokens}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tokenCount}>
        <Text style={styles.tokenIcon}>🎟️</Text>
        <Text style={styles.tokenNumber}>{data.availableTokens}</Text>
        <Text style={styles.tokenLabel}>
          Mulligan Token{data.availableTokens !== 1 ? 's' : ''}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {success ? (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>✅ {success}</Text>
        </View>
      ) : null}

      {data.canClaimWeeklyToken ? (
        <TouchableOpacity
          style={[styles.claimButton, claiming && styles.claimButtonDisabled]}
          onPress={handleClaim}
          disabled={claiming}
        >
          {claiming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.claimButtonText}>✨ Claim Weekly Tokens</Text>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={styles.cannotClaimText}>
          {data.availableTokens >= 3
            ? 'You already have 3 tokens. Use them to connect!'
            : 'You can claim 3 tokens next week!'}
        </Text>
      )}

      <Text style={styles.infoText}>
        Use tokens to connect with people. Get 3 new tokens each week!
      </Text>

      {/* Buy More Button - Only show when tokens are 0 or very low */}
      {data.availableTokens <= 1 && (
        <TouchableOpacity
          style={[styles.claimButton, { marginTop: 12, backgroundColor: '#10b981' }]}
          onPress={() => {
            setShowPurchaseModal(true);
            fetchPackages();
          }}
        >
          <Text style={styles.claimButtonText}>💳 Buy More Tokens</Text>
        </TouchableOpacity>
      )}

      {/* Purchase Modal */}
      <Modal
        visible={showPurchaseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPurchaseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Buy Mulligan Tokens</Text>
              <TouchableOpacity onPress={() => setShowPurchaseModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingPackages ? (
              <ActivityIndicator size="large" color="#8B1538" style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.packagesList}>
                {packages.map((pkg) => {
                  const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                  return (
                    <TouchableOpacity
                      key={pkg.id}
                      style={[
                        styles.packageItem,
                        (pkg.id === 3 || pkg.id === 7) && styles.packageItemBestValue,
                        isDisabled && styles.packageItemDisabled
                      ]}
                      onPress={() => {
                        if (pkg.wouldExceedLimit) {
                          Alert.alert(
                            'Token Limit Reached',
                            `This purchase would exceed your 7 token limit. You can only purchase up to ${pkg.maxTokensCanBuy || 0} more token${(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''}.`,
                            [{ text: 'OK' }]
                          );
                          return;
                        }
                        handlePurchase(pkg.id);
                      }}
                      disabled={isDisabled}
                    >
                      <View style={styles.packageHeader}>
                        <Text style={styles.packageTokens}>{pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}</Text>
                        {(pkg.id === 3 || pkg.id === 7) && (
                          <Text style={styles.bestValueBadge}>Best Value</Text>
                        )}
                        {pkg.wouldExceedLimit && (
                          <Text style={styles.limitExceededBadge}>Limit Exceeded</Text>
                        )}
                      </View>
                      <Text style={styles.packagePrice}>{pkg.priceFormatted}</Text>
                      <Text style={styles.packagePricePerToken}>
                        ${pkg.pricePerToken} per token
                      </Text>
                      {pkg.wouldExceedLimit && (
                        <Text style={styles.limitExceededText}>
                          You can only purchase up to {pkg.maxTokensCanBuy} more token{(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {purchasing && (
              <View style={styles.purchasingOverlay}>
                <ActivityIndicator size="large" color="#8B1538" />
                <Text style={styles.purchasingText}>Processing payment...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Test token grant button (for admins in production, or dev mode) */}
      {(isAdmin || __DEV__) && (
        <TouchableOpacity
          style={[styles.claimButton, { marginTop: 12, backgroundColor: '#666' }]}
          onPress={async () => {
            try {
              const result = await api.post('/admin/grant-tokens-by-phone', {
                phoneNumber: '+15413163939',
                tokenCount: 10,
              });
              Alert.alert('Success', `Granted ${result.tokensGranted} tokens! You now have ${result.totalAvailableTokens} tokens.`);
              await fetchTokens();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to grant tokens');
            }
          }}
        >
          <Text style={styles.claimButtonText}>🧪 Grant 10 Test Tokens</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 21, 56, 0.1)',
    borderRadius: 20,
  },
  compactTokenNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B1538',
    marginLeft: 6,
  },
  premiumContainer: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  premiumGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  premiumIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  premiumCount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    letterSpacing: 0.5,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  tokenCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tokenIcon: {
    fontSize: 32,
    marginRight: 8,
  },
  tokenNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B1538',
    marginRight: 8,
  },
  tokenLabel: {
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    width: '100%',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  successContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    width: '100%',
  },
  successText: {
    color: '#10b981',
    fontSize: 14,
    textAlign: 'center',
  },
  claimButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  claimButtonGradient: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cannotClaimText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  modalLoading: {
    padding: 40,
  },
  packagesList: {
    padding: 20,
  },
  packageItem: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  packageItemBestValue: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  packageItemDisabled: {
    opacity: 0.5,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  limitExceededBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ef4444',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  limitExceededText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 8,
    fontStyle: 'italic',
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageTokens: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  bestValueBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B1538',
    marginBottom: 4,
  },
  packagePricePerToken: {
    fontSize: 14,
    color: '#666',
  },
  purchasingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchasingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  // Info Modal Styles
  infoModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: 0.5,
  },
  infoModalScroll: {
    padding: 20,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  tokenBalanceCard: {
    backgroundColor: '#f8f9ff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#667eea',
  },
  tokenBalanceNumber: {
    fontSize: 48,
    fontWeight: '900',
    color: '#667eea',
    marginBottom: 8,
  },
  tokenBalanceLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  refillCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  refillEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  refillText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  refillDate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#667eea',
    textAlign: 'center',
    marginBottom: 8,
  },
  refillSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buyButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  tokenInfoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  tokenInfoTextBold: {
    fontWeight: '700',
    color: '#333',
  },
});

