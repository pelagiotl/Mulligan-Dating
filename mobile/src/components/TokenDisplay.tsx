import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { usePaymentSheet } from '@stripe/stripe-react-native';
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

// Animated hourglass for "waiting for refill" state — gentle sway + pulse
function AnimatedHourglass() {
  const sway = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    swayLoop.start();
    pulseLoop.start();
    return () => {
      swayLoop.stop();
      pulseLoop.stop();
    };
  }, []);

  const rotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <Animated.View
      style={[
        styles.refillEmojiWrap,
        {
          transform: [{ rotate }, { scale: pulse }],
        },
      ]}
    >
      <Text style={styles.refillEmoji}>⏳</Text>
    </Animated.View>
  );
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
  openModalRef?: React.MutableRefObject<(() => void) | null>;
  /** When set, parent can trigger claim directly (e.g. from "Claim your 7 tokens!" banner) and show custom success message */
  performClaimRef?: React.MutableRefObject<((opts?: { onSuccess?: () => void; successMessage?: string }) => Promise<void>) | null>;
}

export default function TokenDisplay({ compact = false, premium = false, openModalRef, performClaimRef }: TokenDisplayProps) {
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
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

  // Expose open-modal function to parent (e.g. for token count tap)
  useEffect(() => {
    if (openModalRef) {
      openModalRef.current = () => {
        setShowInfoModal(true);
        fetchPackages();
      };
      return () => {
        openModalRef.current = null;
      };
    }
  }, [openModalRef]);

  // Expose perform-claim function to parent (e.g. "Claim your 7 tokens!" banner - claim directly, show celebratory message)
  useEffect(() => {
    if (performClaimRef) {
      performClaimRef.current = async (opts?: { onSuccess?: () => void; successMessage?: string }) => {
        if (claiming || !data?.canClaimWeeklyToken) {
          if (!data?.canClaimWeeklyToken) {
            Alert.alert('Not Yet', 'You cannot claim weekly tokens right now. Check back next week!');
          }
          return;
        }
        setClaiming(true);
        setError('');
        setSuccess('');
        try {
          const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
          api.clearCache('/tokens');
          await fetchTokens();
          const msg = opts?.successMessage ?? `Congrats! You've been officially reupped and are ready to start matching! 🎉`;
          Alert.alert('🎉 Reupped!', msg, [{ text: 'Let\'s go!', onPress: () => opts?.onSuccess?.() }]);
        } catch (err: any) {
          const errorMessage = err?.message || 'Failed to claim tokens. Please try again.';
          Alert.alert('Oops', errorMessage);
        } finally {
          setClaiming(false);
        }
      };
      return () => {
        performClaimRef.current = null;
      };
    }
  }, [performClaimRef, data?.canClaimWeeklyToken, claiming]);

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
    const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey || !publishableKey.startsWith('pk_')) {
      Alert.alert(
        'Payment Not Configured',
        'Stripe is not configured. Please set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your environment.'
      );
      return;
    }

    try {
      setPurchasing(true);
      setError('');

      console.log('🛒 Purchase initiated for package ID:', packageId);

      const paymentIntent = await api.post<{
        clientSecret: string;
        paymentIntentId: string;
        amount: number;
        tokensToGrant: number;
      }>('/payments/create-intent', { packageId });

      if (!paymentIntent.clientSecret) {
        throw new Error('Invalid payment intent response');
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentIntent.clientSecret,
        merchantDisplayName: 'Mulligan',
      });

      if (initError) {
        console.error('PaymentSheet init error:', initError);
        setError(initError.message || 'Failed to initialize payment');
        Alert.alert('Payment Error', initError.message || 'Failed to initialize payment');
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          // User cancelled - no need to show error
          return;
        }
        console.error('PaymentSheet present error:', presentError);
        setError(presentError.message || 'Payment failed');
        Alert.alert('Payment Failed', presentError.message || 'Payment failed');
        return;
      }

      // Payment succeeded - webhook will grant tokens; refresh after short delay
      setShowPurchaseModal(false);
      setSuccess(`${paymentIntent.tokensToGrant} token${paymentIntent.tokensToGrant !== 1 ? 's' : ''} added!`);
      setTimeout(() => setSuccess(''), 4000);
      api.clearCache('/tokens');
      setTimeout(() => fetchTokens(), 1500);
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
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoModalHeaderGradient}
                >
                  <Text style={styles.infoModalTitle}>🎟️ Your Tokens</Text>
                  <TouchableOpacity onPress={() => setShowInfoModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={styles.infoModalClose}>✕</Text>
                  </TouchableOpacity>
                </LinearGradient>

                <ScrollView style={styles.infoModalScroll} showsVerticalScrollIndicator={false}>
                  {/* Current Token Count */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Current Balance</Text>
                    <LinearGradient
                      colors={['#667eea', '#764ba2', '#f093fb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tokenBalanceCard}
                    >
                      <Text style={styles.tokenBalanceNumber}>{data.availableTokens}</Text>
                      <Text style={styles.tokenBalanceLabel}>
                        Token{data.availableTokens !== 1 ? 's' : ''} Available
                      </Text>
                    </LinearGradient>
                  </View>

                  {/* Weekly Refill Info */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Weekly Refill</Text>
                    {data.canClaimWeeklyToken ? (
                      <LinearGradient colors={['#f8f9ff', '#f0f4ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refillCard}>
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
                          activeOpacity={0.9}
                          style={styles.refillButtonWrap}
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
                      </LinearGradient>
                    ) : data.nextRefillDate ? (
                      <LinearGradient colors={['#f8f9ff', '#f0f4ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refillCard}>
                        <AnimatedHourglass />
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
                      </LinearGradient>
                    ) : (
                      <LinearGradient colors={['#f8f9ff', '#f0f4ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refillCard}>
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
                          activeOpacity={0.9}
                          style={styles.refillButtonWrap}
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
                      </LinearGradient>
                    )}
                  </View>

                  {/* Buy More Section */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Need More Tokens?</Text>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        setShowInfoModal(false);
                        setTimeout(() => {
                          setShowPurchaseModal(true);
                          fetchPackages();
                        }, 300);
                      }}
                      style={styles.buyButtonWrap}
                    >
                      <LinearGradient
                        colors={['#10b981', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.buyButtonGradient}
                      >
                        <Text style={styles.buyButtonText}>💳 Cop some more</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {/* Info Text */}
                  <View style={styles.infoSection}>
                    <View style={styles.tokenInfoCard}>
                      <Text style={styles.tokenInfoText}>
                        💡 <Text style={styles.tokenInfoTextBold}>How tokens work:</Text>
                        {'\n'}• Use tokens to connect with people
                        {'\n'}• Get 7 tokens weekly
                      </Text>
                    </View>
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
              <View style={styles.purchaseModalContent}>
                <LinearGradient
                  colors={['#10b981', '#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.purchaseModalHeaderGradient}
                >
                  <Text style={styles.purchaseModalTitle}>🎟️ Buy Mulligan Tokens</Text>
                  <TouchableOpacity onPress={() => setShowPurchaseModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={styles.purchaseModalClose}>✕</Text>
                  </TouchableOpacity>
                </LinearGradient>

                {loadingPackages ? (
                  <ActivityIndicator size="large" color="#10b981" style={styles.modalLoading} />
                ) : (
                  <ScrollView style={styles.packagesList} showsVerticalScrollIndicator={false}>
                    {packages.map((pkg) => {
                      const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                      const isBestValue = pkg.id === 3 || pkg.id === 7;
                      return (
                        <TouchableOpacity
                          key={pkg.id}
                          activeOpacity={0.9}
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
                          style={styles.packageItemWrap}
                        >
                          <LinearGradient
                            colors={
                              isDisabled
                                ? ['#f1f5f9', '#e2e8f0']
                                : isBestValue
                                ? ['#d1fae5', '#a7f3d0', '#6ee7b7']
                                : ['#f8fafc', '#f1f5f9', '#e2e8f0']
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[
                              styles.packageItem,
                              isDisabled && styles.packageItemDisabled
                            ]}
                          >
                            <View style={styles.packageHeader}>
                              <Text style={[styles.packageTokens, isBestValue && styles.packageTokensBestValue]}>
                                {pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}
                              </Text>
                              {isBestValue && (
                                <View style={styles.bestValueBadgeWrap}>
                                  <Text style={styles.bestValueBadge}>★ Best Value</Text>
                                </View>
                              )}
                              {pkg.wouldExceedLimit && (
                                <Text style={styles.limitExceededBadge}>Limit</Text>
                              )}
                            </View>
                            <Text style={[styles.packagePrice, isBestValue && styles.packagePriceBestValue]}>{pkg.priceFormatted}</Text>
                            <Text style={[styles.packagePricePerToken, isBestValue && styles.packagePricePerTokenBestValue]}>
                              ${pkg.pricePerToken} per token
                            </Text>
                            {pkg.wouldExceedLimit && (
                              <Text style={styles.limitExceededText}>
                                Up to {pkg.maxTokensCanBuy} more token{(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''} available
                              </Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {purchasing && (
                  <View style={styles.purchasingOverlay}>
                    <ActivityIndicator size="large" color="#10b981" />
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
          <Text style={styles.claimButtonText}>💳 Cop some more</Text>
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
          <View style={styles.purchaseModalContent}>
            <LinearGradient
              colors={['#10b981', '#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.purchaseModalHeaderGradient}
            >
              <Text style={styles.purchaseModalTitle}>🎟️ Buy Mulligan Tokens</Text>
              <TouchableOpacity onPress={() => setShowPurchaseModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.purchaseModalClose}>✕</Text>
              </TouchableOpacity>
            </LinearGradient>

            {loadingPackages ? (
              <ActivityIndicator size="large" color="#10b981" style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.packagesList} showsVerticalScrollIndicator={false}>
                {packages.map((pkg) => {
                  const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                  const isBestValue = pkg.id === 3 || pkg.id === 7;
                  return (
                    <TouchableOpacity
                      key={pkg.id}
                      activeOpacity={0.9}
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
                      style={styles.packageItemWrap}
                    >
                      <LinearGradient
                        colors={
                          isDisabled
                            ? ['#f1f5f9', '#e2e8f0']
                            : isBestValue
                            ? ['#d1fae5', '#a7f3d0', '#6ee7b7']
                            : ['#f8fafc', '#f1f5f9', '#e2e8f0']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.packageItem,
                          isDisabled && styles.packageItemDisabled
                        ]}
                      >
                        <View style={styles.packageHeader}>
                          <Text style={[styles.packageTokens, isBestValue && styles.packageTokensBestValue]}>
                            {pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}
                          </Text>
                          {isBestValue && (
                            <View style={styles.bestValueBadgeWrap}>
                              <Text style={styles.bestValueBadge}>★ Best Value</Text>
                            </View>
                          )}
                          {pkg.wouldExceedLimit && (
                            <Text style={styles.limitExceededBadge}>Limit</Text>
                          )}
                        </View>
                        <Text style={[styles.packagePrice, isBestValue && styles.packagePriceBestValue]}>{pkg.priceFormatted}</Text>
                        <Text style={[styles.packagePricePerToken, isBestValue && styles.packagePricePerTokenBestValue]}>
                          ${pkg.pricePerToken} per token
                        </Text>
                        {pkg.wouldExceedLimit && (
                          <Text style={styles.limitExceededText}>
                            Up to {pkg.maxTokensCanBuy} more token{(pkg.maxTokensCanBuy || 0) > 1 ? 's' : ''} available
                          </Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {purchasing && (
              <View style={styles.purchasingOverlay}>
                <ActivityIndicator size="large" color="#10b981" />
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
              const result = await api.post<{ tokensGranted: number; totalAvailableTokens: number }>('/admin/grant-tokens-by-phone', {
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
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
  purchaseModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: 24,
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  purchaseModalHeaderGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  purchaseModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  purchaseModalClose: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '300',
    opacity: 0.95,
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
    paddingTop: 16,
  },
  packageItemWrap: {
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  packageItem: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.4)',
  },
  packageItemDisabled: {
    opacity: 0.65,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  limitExceededBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
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
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  packageTokens: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  packageTokensBestValue: {
    color: '#047857',
  },
  bestValueBadgeWrap: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  bestValueBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  packagePrice: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  packagePriceBestValue: {
    color: '#047857',
    fontSize: 28,
  },
  packagePricePerToken: {
    fontSize: 14,
    color: '#64748b',
  },
  packagePricePerTokenBestValue: {
    color: '#059669',
    fontWeight: '600',
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: 24,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  infoModalHeaderGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  infoModalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  infoModalClose: {
    fontSize: 26,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '300',
  },
  infoModalScroll: {
    padding: 24,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  tokenBalanceCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  tokenBalanceNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tokenBalanceLabel: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  refillCard: {
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.25)',
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  refillButtonWrap: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  refillEmojiWrap: {
    alignSelf: 'center',
  },
  refillEmoji: {
    fontSize: 36,
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
  buyButtonWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  buyButtonGradient: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tokenInfoCard: {
    backgroundColor: '#f8f9ff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.15)',
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

