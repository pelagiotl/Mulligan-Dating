import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  TextInput,
  Animated,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { usePaymentSheet } from '@stripe/stripe-react-native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import LegalFooter from '../components/LegalFooter';

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export default function SettingsScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const navigation = useNavigation();
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Token purchase
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [packages, setPackages] = useState<Array<{
    id: number;
    tokens: number;
    price: number;
    priceFormatted: string;
    pricePerToken: string;
    available?: boolean;
    wouldExceedLimit?: boolean;
    maxTokensCanBuy?: number;
  }>>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Animations
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerIconRotate = useRef(new Animated.Value(0)).current;
  const sectionAnimations = useRef<Animated.Value[]>([]).current;
  const statCardAnimations = useRef<Animated.Value[]>([]).current;
  const sectionFallbackAnim = useRef(new Animated.Value(1)).current;
  const statCardFallbackAnim = useRef(new Animated.Value(1)).current;
  const gradientPos = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user) {
      fetchSettings();
    } else {
      setLoading(false);
    }

    // Header entrance animation
    Animated.parallel([
      Animated.spring(headerScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Continuous icon rotation
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerIconRotate, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(headerIconRotate, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    // Animated gradient background
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientPos, {
          toValue: 1,
          duration: 10000,
          useNativeDriver: false,
        }),
        Animated.timing(gradientPos, {
          toValue: 0,
          duration: 10000,
          useNativeDriver: false,
        }),
      ])
    ).start();
    
    // Initialize section animations
    for (let i = 0; i < 10; i++) {
      sectionAnimations[i] = new Animated.Value(0);
      Animated.timing(sectionAnimations[i], {
        toValue: 1,
        duration: 500,
        delay: i * 80,
        useNativeDriver: true,
      }).start();
    }
    
    // Initialize stat card animations
    for (let i = 0; i < 2; i++) {
      statCardAnimations[i] = new Animated.Value(0);
      Animated.spring(statCardAnimations[i], {
        toValue: 1,
        tension: 50,
        friction: 7,
        delay: 200 + i * 100,
        useNativeDriver: true,
      }).start();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get<SettingsData>('/settings');
      setSettings(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      setLoadingPackages(true);
      setError('');
      console.log('🔄 Fetching token packages...');
      const response = await api.get<{ 
        packages: Array<{
          id: number;
          tokens: number;
          price: number;
          priceFormatted: string;
          pricePerToken: string;
          available?: boolean;
          wouldExceedLimit?: boolean;
          maxTokensCanBuy?: number;
        }>;
        availableTokens?: number;
      }>('/payments/packages');
      console.log('✅ Packages fetched:', response);
      console.log('📦 Package details:', response.packages?.map(p => ({
        id: p.id,
        tokens: p.tokens,
        available: p.available,
        wouldExceedLimit: p.wouldExceedLimit,
        maxTokensCanBuy: p.maxTokensCanBuy
      })));
      setPackages(response.packages || []);
    } catch (err: any) {
      console.error('❌ Failed to fetch packages:', err);
      console.error('Error details:', {
        message: err?.message,
        status: err?.status,
        name: err?.name,
        stack: err?.stack
      });
      const errorMessage = err?.message || 'Failed to load token packages. Please try again.';
      setError(errorMessage);
      Alert.alert('Error', `Failed to load token packages: ${errorMessage}`);
      setShowPurchaseModal(false);
    } finally {
      setLoadingPackages(false);
    }
  };

  const handlePurchase = useCallback(async (packageId: number) => {
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
          return;
        }
        console.error('PaymentSheet present error:', presentError);
        setError(presentError.message || 'Payment failed');
        Alert.alert('Payment Failed', presentError.message || 'Payment failed');
        return;
      }

      setShowPurchaseModal(false);
      setSuccess(`${paymentIntent.tokensToGrant} token${paymentIntent.tokensToGrant !== 1 ? 's' : ''} added!`);
      setTimeout(() => setSuccess(''), 4000);
      api.clearCache('/tokens');
      setTimeout(() => {
        fetchSettings();
        fetchPackages();
      }, 1500);
    } catch (err: any) {
      console.error('Purchase error:', err);
      const errorMessage = err?.message || 'Failed to process purchase. Please try again.';
      setError(errorMessage);
      Alert.alert('Purchase Failed', errorMessage);
    } finally {
      setPurchasing(false);
    }
  }, [initPaymentSheet, presentPaymentSheet]);

  const handleDeleteAccount = useCallback(async () => {
    setError('');

    Alert.alert(
      'Delete Account',
      'Are you absolutely sure? This will permanently delete your account, profile, matches, and messages. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.post('/settings/delete-account', {});
              logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'PhoneLogin' as never }],
              });
            } catch (err: any) {
              setError(err?.message || 'Failed to delete account');
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [logout, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.headerGradient,
            {
              opacity: headerOpacity,
              transform: [{ scale: headerScale }],
            },
          ]}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.header}>
            <Animated.View
              style={[
                styles.headerIconContainer,
                {
                  transform: [
                    {
                      rotate: headerIconRotate.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['-5deg', '5deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['#fff', '#f8f9ff']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.headerIcon}>⚙️</Text>
            </Animated.View>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
          </View>
        </Animated.View>

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

      {/* Account Info */}
      <Animated.View
        style={[
          styles.section,
          {
            opacity: sectionAnimations[0],
            transform: [
              {
                translateY: sectionAnimations[0].interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>👤</Text>
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        {/* Account Stats Cards */}
        <View style={styles.statsRow}>
          <Animated.View
            style={[
              {
                flex: 1,
                transform: [
                  {
                    scale: statCardAnimations[0] ?? statCardFallbackAnim,
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCard}
            >
              <Text style={styles.statEmoji}>🎉</Text>
              <Text style={styles.statLabel}>Member Since</Text>
              <Text style={styles.statValue}>
                {settings?.createdAt
                  ? new Date(settings.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'N/A'}
              </Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View
            style={[
              {
                flex: 1,
                transform: [
                  {
                    scale: statCardAnimations[1] ?? statCardFallbackAnim,
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCard}
            >
              <Text style={styles.statEmoji}>🟢</Text>
              <Text style={styles.statLabel}>Last Active</Text>
              <Text style={styles.statValue}>
                {settings?.lastActiveAt
                  ? new Date(settings.lastActiveAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Just now'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </View>
      </Animated.View>

      {/* Buy Tokens */}
      <Animated.View
        style={[
          styles.section,
          {
            opacity: sectionAnimations[2] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnimations[2] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>💳</Text>
          <Text style={styles.sectionTitle}>Tokens</Text>
        </View>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.05)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tokensCard}
        >
          <Text style={styles.tokensCardTitle}>Need more tokens?</Text>
          <Text style={styles.tokensCardDescription}>
            Purchase Mulligan tokens to connect with more people
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setShowPurchaseModal(true);
              fetchPackages();
            }}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryButton}
            >
              <Text style={[styles.buttonText, styles.primaryButtonText]}>💳 Cop some more</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </Animated.View>

      {__DEV__ && (
        /* Test: Delete Profile (Temporary) - only visible in development */
        <Animated.View
          style={[
            styles.section,
            styles.testSection,
            {
              opacity: sectionAnimations[4] ?? sectionFallbackAnim,
              transform: [
                {
                  translateY: (sectionAnimations[4] ?? sectionFallbackAnim).interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionEmoji}>🧪</Text>
            <Text style={styles.sectionTitle}>Test: Delete Profile</Text>
          </View>
          <Text style={styles.testText}>
            This will delete your profile (but keep your account). You'll be redirected to create a new profile. Use this to test the profile creation flow.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={async () => {
              Alert.alert(
                'Delete Profile (Test)',
                'This will delete your profile data. Your account will remain, but you\'ll need to recreate your profile. This is for testing purposes only.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Profile',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        setLoading(true);
                        await api.delete('/profile');
                        await refreshProfile();
                        try {
                          const rootNavigation = (navigation as any).getParent?.() || navigation;
                          if (rootNavigation && rootNavigation.navigate) {
                            rootNavigation.navigate('CreateProfile');
                          } else {
                            (navigation as any).reset({
                              index: 0,
                              routes: [{ name: 'CreateProfile' }],
                            });
                          }
                        } catch (navErr: any) {
                          console.error('Navigation error:', navErr);
                        }
                      } catch (err: any) {
                        Alert.alert('Error', err?.message || 'Failed to delete profile');
                        setLoading(false);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Text style={[styles.buttonText, styles.testButtonText]}>🧪 Delete My Profile (Test)</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Delete Account */}
      <Animated.View
        style={[
          styles.section,
          styles.dangerSection,
          {
            opacity: sectionAnimations[5] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnimations[5] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>⚠️</Text>
          <Text style={styles.sectionTitle}>Danger Zone</Text>
        </View>
        {!showDeleteConfirm ? (
          <View>
            <Text style={styles.dangerText}>
              Deleting your account will permanently remove all your data, matches, and messages. This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.dangerButton]}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text style={[styles.buttonText, styles.dangerButtonText]}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.dangerText}>
              This action cannot be undone. All your data will be permanently deleted.
            </Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                }}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.dangerButton, deleting && styles.buttonDisabled]}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, styles.dangerButtonText]}>Yes, Delete My Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Help & Support */}
      <Animated.View
        style={[
          styles.section,
          {
            opacity: sectionAnimations[6] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnimations[6] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionEmoji}>💬</Text>
          <Text style={styles.sectionTitle}>Help & Support</Text>
        </View>
        <TouchableOpacity
          style={styles.supportRow}
          onPress={() => Linking.openURL('mailto:mulligandating@gmail.com')}
          activeOpacity={0.7}
        >
          <Text style={styles.supportRowText}>Contact us</Text>
          <Text style={styles.supportRowChevron}>›</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Logout */}
      <Animated.View
        style={[
          styles.section,
          {
            opacity: sectionAnimations[7] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnimations[7] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.button, styles.logoutButton]}
          onPress={() => {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Logout',
                style: 'destructive',
                onPress: () => {
                  logout();
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'PhoneLogin' as never }],
                  });
                },
              },
            ]);
          }}
        >
          <Text style={[styles.buttonText, styles.logoutButtonText]}>🚪 Logout</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Legal Footer */}
      <LegalFooter />

      {/* App version */}
      <Text style={styles.versionText}>
        Version {Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0'}
      </Text>

      </ScrollView>

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
                {packages.length === 0 ? (
                  <View style={styles.emptyPackages}>
                    <Text style={styles.emptyPackagesText}>No packages available</Text>
                  </View>
                ) : (
                  packages.map((pkg) => {
                    // Only disable if purchasing OR if it would exceed limit
                    // available can be undefined (backwards compatibility), so only check if it's explicitly false
                    const isDisabled = purchasing || (pkg.wouldExceedLimit === true);
                    console.log(`📦 Package ${pkg.id}: tokens=${pkg.tokens}, disabled=${isDisabled}, wouldExceed=${pkg.wouldExceedLimit}, available=${pkg.available}`);
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
                        if (!pkg.available) {
                          Alert.alert(
                            'Package Unavailable',
                            'This package is not available at this time.',
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
                  })
                )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 0,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerGradient: {
    marginTop: 56,
    paddingTop: 60,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  headerIcon: {
    fontSize: 40,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.8,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  successContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  successText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginBottom: 32,
    marginHorizontal: 20,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionEmoji: {
    fontSize: 26,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
  },
  infoItem: {
    paddingVertical: 0,
  },
  infoItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.2,
  },
  infoValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  tokensCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  tokensCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  tokensCardDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
  },
  editButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9ff',
    borderWidth: 2,
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#667eea',
    letterSpacing: 0.5,
  },
  formContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    borderRadius: 20,
    marginTop: 0,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#667eea',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  dangerButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  supportRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  supportRowChevron: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '300',
  },
  logoutButton: {
    backgroundColor: 'rgba(102, 102, 102, 0.9)',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    shadowColor: '#666',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  secondaryButtonText: {
    color: '#667eea',
  },
  dangerButtonText: {
    color: '#fff',
  },
  logoutButtonText: {
    color: '#fff',
  },
  versionText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  dangerSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  dangerText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  primaryButtonText: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '80%',
    paddingBottom: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
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
    borderWidth: 2.5,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    padding: 24,
    marginBottom: 18,
    backgroundColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  packageItemBestValue: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
    borderWidth: 3.5,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
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
    fontSize: 28,
    fontWeight: '800',
    color: '#8B1538',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  packagePricePerToken: {
    fontSize: 14,
    color: '#666',
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
  emptyPackages: {
    padding: 40,
    alignItems: 'center',
  },
  emptyPackagesText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
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
  testSection: {
    backgroundColor: 'rgba(255, 193, 7, 0.08)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 193, 7, 0.25)',
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  testText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  testButton: {
    backgroundColor: '#ffc107',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    shadowColor: '#ffc107',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  testButtonText: {
    color: '#1a1a1a',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  preferencesCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  preferencesCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  preferencesCardDescriptionWrap: {
    width: '100%',
    marginBottom: 20,
  },
  preferencesCardDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 22,
    fontWeight: '500',
  },
  sliderContainer: {
    marginTop: 8,
    width: '100%',
    overflow: 'hidden',
  },
  distanceButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
    width: '100%',
  },
  distanceButtonUnlimitedWrap: {
    width: '100%',
  },
  distanceButtonUnlimited: {
    minWidth: undefined,
    flex: undefined,
  },
  distanceButton: {
    flex: 1,
    minWidth: 0,
    maxWidth: '19%',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  distanceButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
  distanceButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  distanceButtonTextActive: {
    color: '#fff',
  },
  customDistanceButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
  },
  customDistanceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  customInputContainer: {
    marginTop: 12,
  },
  customInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 12,
  },
  customInputActions: {
    flexDirection: 'row',
    gap: 8,
  },
  customInputButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  customInputButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  customInputButtonSave: {
    backgroundColor: '#667eea',
    borderColor: '#fff',
  },
  customInputButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  customInputButtonTextSave: {
    color: '#fff',
  },
  sliderLoading: {
    marginTop: 20,
  },
  updatingIndicator: {
    marginTop: 12,
    alignSelf: 'center',
  },
});
