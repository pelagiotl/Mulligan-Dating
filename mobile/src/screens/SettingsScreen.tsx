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
import Purchases from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';
import { api } from '../utils/api';
import { connectShellDisplayLabel } from '../lib/connectShellTheme';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import {
  ensurePurchasesConfigured,
  findRevenueCatPackage,
  formatPurchasesError,
  getRevenueCatPackageForProductId,
  pickCurrentOfferingPackages,
} from '../utils/purchasesReady';
import { formatPackagePerTokenLine, normalizePackageFormattedPrice } from '../utils/formatPackagePrice';
import { purchaseTokensWithGooglePay } from '../utils/googlePay';
import { navigationRef } from '../navigation/navigationRef';
import LegalFooter from '../components/LegalFooter';
import { androidShellBackdropColors } from '../utils/androidConnectShellChrome';
import { requestMatchCelebrationDemo } from '../utils/matchCelebrationDemo';

interface SettingsData {
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
}

const DEBUG_TAP_COUNT = 7;

const isExpoGo = Constants.appOwnership === 'expo';
const IAP_COMING_SOON_MSG = "In-app purchases are coming soon. We're switching to a new provider—stay tuned!";

export default function SettingsScreen() {
  const { user, profile, logout, refreshProfile, refreshTokensBalance } = useAuth();
  const { mode: connectShellMode, toggleMode: toggleConnectShellMode } = useConnectShellTheme();
  const shellBackdropColors = useMemo(
    () => androidShellBackdropColors(connectShellMode),
    [connectShellMode]
  );
  const navigation = useNavigation();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [emailNeedsPassword, setEmailNeedsPassword] = useState(false);
  const debugTapCountRef = React.useRef(0);
  const debugTapTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Token purchase (backend packages + RevenueCat price/package for purchase)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [packages, setPackages] = useState<Array<{
    id: number;
    productId?: string;
    tokens: number;
    price: number;
    priceFormatted: string;
    pricePerToken: string;
    available?: boolean;
    wouldExceedLimit?: boolean;
    maxTokensCanBuy?: number;
  }>>([]);
  const revenueCatPackagesByProductId = useRef<Record<string, PurchasesPackage>>({});
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

  useEffect(() => {
    if (!profile) {
      setDisplayNameDraft('');
      return;
    }
    const p = profile as { display_name?: string; displayName?: string };
    setDisplayNameDraft((p.display_name ?? p.displayName ?? '').trim());
  }, [profile]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      // Don't use GET cache — stale /settings would clear the email field after save
      const data = await api.get<SettingsData>('/settings', false);
      setSettings(data);
      setEmailDraft((data.email || '').trim());
      setEmailNeedsPassword(false);
      setEmailPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveDisplayName = async () => {
    setError('');
    setSuccess('');
    const name = displayNameDraft.trim();
    if (name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    setDisplayNameSaving(true);
    try {
      await api.put('/profile/basics', { displayName: name });
      api.clearCache('/auth/me');
      await refreshProfile();
      setSuccess('Name saved.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save name');
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const saveEmail = async () => {
    setError('');
    setSuccess('');
    const email = emailDraft.trim();
    if (!email) {
      setError('Email is required');
      return;
    }
    setEmailSaving(true);
    try {
      await api.put('/settings/email', {
        email,
        ...(emailNeedsPassword && emailPassword.trim() ? { password: emailPassword } : {}),
      });
      setSuccess('Email updated.');
      setEmailNeedsPassword(false);
      setEmailPassword('');
      setEmailDraft(email.toLowerCase());
      await fetchSettings();
    } catch (err: any) {
      const msg = err?.message || 'Failed to update email';
      // If the server requires password, reveal the password field and keep user on this section
      if (String(msg).toLowerCase().includes('password required')) {
        setEmailNeedsPassword(true);
        setError('Please enter your password to update your email.');
      } else {
        setError(msg);
      }
    } finally {
      setEmailSaving(false);
    }
  };

  const fetchPackages = async (isRetry = false) => {
    try {
      if (!isRetry) {
        setLoadingPackages(true);
        setError('');
      }
      const response = await api.get<{
        packages: Array<{
          id: number;
          productId?: string;
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
      let list = response.packages || [];
      if (!isRetry) revenueCatPackagesByProductId.current = {};
      const tryRevenueCat = async (): Promise<boolean> => {
        if (list.length === 0 || Platform.OS !== 'ios') return false;
        if (!(await ensurePurchasesConfigured())) return false;
        try {
          const offerings = await Purchases.getOfferings();
          const available = pickCurrentOfferingPackages(offerings);
          if (__DEV__) {
            console.log('[IAP Settings] getOfferings: packages count=', available.length);
            available.forEach((p) => console.log('[IAP Settings] RC package product.identifier=', p.product.identifier));
            console.log('[IAP Settings] Backend productIds=', list.map((p) => (p as { productId?: string }).productId));
          }
          if (available.length) {
            let matched = 0;
            list = list.map((pkg) => {
              const productId = (pkg as { productId?: string }).productId;
              const rcPkg = productId ? findRevenueCatPackage(available, productId) : undefined;
              if (rcPkg && productId) {
                revenueCatPackagesByProductId.current[productId] = rcPkg;
                matched++;
                const price = rcPkg.product.priceString;
                const perToken = pkg.tokens > 0 ? `$${(rcPkg.product.price / pkg.tokens).toFixed(2)}` : '';
                return { ...pkg, priceFormatted: price, pricePerToken: perToken };
              }
              return pkg;
            });
            return matched > 0;
          }
        } catch (rcErr) {
          console.warn('[IAP Settings] getOfferings failed:', rcErr);
        }
        return false;
      };
      const gotPrices = await tryRevenueCat();
      if (!gotPrices && !isExpoGo && list.length > 0 && !isRetry) {
        await new Promise((r) => setTimeout(r, 2000));
        await tryRevenueCat();
      }
      list = list.map((pkg) => {
        const p = pkg as { priceFormatted?: string; pricePerToken?: string };
        if (p.priceFormatted) return pkg;
        return {
          ...pkg,
          priceFormatted: isExpoGo ? 'Price in app' : '—',
          pricePerToken: '—',
        };
      });
      setPackages(list);
    } catch (err: any) {
      setPackages([]);
    } finally {
      setLoadingPackages(false);
    }
  };

  const handlePurchase = useCallback(async (pkg: { id: number; productId?: string; tokens: number }) => {
    if (Platform.OS === 'android') {
      setPurchasing(true);
      try {
        const pkgWithPrice = packages.find((p) => p.id === pkg.id);
        const result = await purchaseTokensWithGooglePay({
          id: pkg.id,
          tokens: pkg.tokens,
          price: pkgWithPrice?.price ?? 0,
        });
        await refreshTokensBalance();
        await fetchPackages();
        refreshProfile?.();
        const granted = result.tokens_granted ?? pkg.tokens;
        Alert.alert('Success', `${granted} token(s) added! Use them to connect with more people.`);
      } catch (err: any) {
        Alert.alert('Purchase failed', err?.message || 'Google Pay purchase failed. Please try again.');
      } finally {
        setPurchasing(false);
      }
      return;
    }

    if (!(await ensurePurchasesConfigured())) {
      Alert.alert(
        'Store unavailable',
        'In-app purchases are still loading. Wait a moment and try again, or force-quit and reopen the app.'
      );
      return;
    }
    const productId = pkg.productId;
    let rcPkg = productId ? revenueCatPackagesByProductId.current[productId] : null;
    if (!rcPkg && productId) {
      rcPkg = await getRevenueCatPackageForProductId(productId);
      if (rcPkg) revenueCatPackagesByProductId.current[productId] = rcPkg;
    }
    if (!rcPkg) {
      const msg = isExpoGo
        ? "In-app purchases aren't available in Expo Go. Install the app from TestFlight or the App Store to buy tokens."
        : "Prices didn't load for this session. Tap Retry below, or update to the latest app version. If it keeps happening, contact Mulligandating@gmail.com.";
      Alert.alert(isExpoGo ? 'Not available' : 'Prices not loaded', msg);
      return;
    }
    setPurchasing(true);
    try {
      await Purchases.purchasePackage(rcPkg);
      await refreshTokensBalance();
      await fetchPackages();
      refreshProfile?.();
      Alert.alert('Success', `${pkg.tokens} token(s) added! Use them to connect with more people.`);
    } catch (err: unknown) {
      const e = err as { userCancelled?: boolean };
      if (e?.userCancelled) return;
      Alert.alert('Purchase failed', formatPurchasesError(err));
    } finally {
      setPurchasing(false);
    }
  }, [packages, refreshProfile, refreshTokensBalance]);

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
          colors={[...shellBackdropColors]}
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
        colors={[...shellBackdropColors]}
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

      {Platform.OS === 'android' ? (
        <Animated.View
          style={[
            styles.section,
            {
              opacity: sectionAnimations[1],
              transform: [
                {
                  translateY: sectionAnimations[1].interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionEmoji}>🎨</Text>
            <Text style={styles.sectionTitle}>Connect tab appearance</Text>
          </View>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tokensCard}
          >
            <Text style={styles.tokensCardTitle}>Hero card & chrome</Text>
            <Text style={[styles.tokensCardDescription, { marginBottom: 14 }]}>
              Cycle through Midnight, Sunny, and Soft Connect chrome. Tokens on Connect landing, tab bar, and backdrop follow
              this choice. Saved on this device only.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={toggleConnectShellMode}
              style={[
                styles.settingsShellToggleBase,
                connectShellMode === 'midnight'
                  ? styles.settingsShellToggleMidnight
                  : connectShellMode === 'sunny'
                    ? styles.settingsShellToggleSunny
                    : styles.settingsShellToggleSoft,
              ]}
            >
              <Text
                style={[
                  styles.settingsShellToggleLabel,
                  connectShellMode === 'midnight'
                    ? styles.settingsShellToggleLabelMidnight
                    : connectShellMode === 'sunny'
                      ? styles.settingsShellToggleLabelSunny
                      : styles.settingsShellToggleLabelSoft,
                ]}
              >
                {connectShellDisplayLabel(connectShellMode)}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
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

        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={styles.pushNotificationsRow}
            onPress={() => navigationRef.current?.navigate('PushNotificationSettings')}
            activeOpacity={0.8}
          >
            <Text style={styles.pushNotificationsRowIcon}>🔔</Text>
            <Text style={styles.pushNotificationsRowText}>Push notifications</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={styles.pushNotificationsRow}
            onPress={() => navigationRef.current?.navigate('BlockedUsers')}
            activeOpacity={0.8}
          >
            <Text style={styles.pushNotificationsRowIcon}>🚫</Text>
            <Text style={styles.pushNotificationsRowText}>Blocked users</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Optional email for support / important account updates */}
        <View style={styles.emailCard}>
          <Text style={styles.emailCardLabel}>Email address (optional)</Text>
          <Text style={styles.emailCardSubLabel}>
            Add an email for account support and important updates. We’ll only contact you if needed.
          </Text>
          <TextInput
            value={emailDraft}
            onChangeText={setEmailDraft}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.65)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.emailInput}
          />
          {emailNeedsPassword && (
            <TextInput
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.65)"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.emailInput}
            />
          )}
          <TouchableOpacity
            style={[styles.emailSaveButton, emailSaving ? styles.buttonDisabled : undefined]}
            onPress={() => void saveEmail()}
            disabled={emailSaving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#fff', '#f8f9ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emailSaveButtonGradient}
            >
              {emailSaving ? (
                <ActivityIndicator color="#667eea" />
              ) : (
                <Text style={styles.emailSaveText}>Save email</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.emailCardHint}>
            Current: {settings?.email ? settings.email : 'none'}
          </Text>
        </View>

        <View style={styles.emailCard}>
          <Text style={styles.emailCardLabel}>Display name</Text>
          <Text style={styles.emailCardSubLabel}>
            Shown to people you connect with. You need a name, location, and three photos before you can use Connect.
          </Text>
          <TextInput
            value={displayNameDraft}
            onChangeText={setDisplayNameDraft}
            placeholder="Your first name or nickname"
            placeholderTextColor="rgba(255,255,255,0.65)"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={50}
            style={styles.emailInput}
          />
          <TouchableOpacity
            style={[styles.emailSaveButton, displayNameSaving ? styles.buttonDisabled : undefined]}
            onPress={() => void saveDisplayName()}
            disabled={displayNameSaving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#fff', '#f8f9ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emailSaveButtonGradient}
            >
              {displayNameSaving ? (
                <ActivityIndicator color="#667eea" />
              ) : (
                <Text style={styles.emailSaveText}>Save name</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={styles.pushNotificationsRow}
            onPress={() => (navigation as any).navigate('MyProfile')}
            activeOpacity={0.8}
          >
            <Text style={styles.pushNotificationsRowIcon}>📍</Text>
            <Text style={styles.pushNotificationsRowText}>Location, bio & preferences (Profile tab)</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={styles.pushNotificationsRow}
            onPress={() => (navigation as any).navigate('MyProfile', { scrollToPhotos: true })}
            activeOpacity={0.8}
          >
            <Text style={styles.pushNotificationsRowIcon}>📷</Text>
            <Text style={styles.pushNotificationsRowText}>Photos (need 3 to Connect)</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
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

      {/* Delete Account */}
      <Animated.View
        style={[
          styles.section,
          styles.dangerSection,
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

      {__DEV__ ? (
        <TouchableOpacity
          style={styles.devCelebrationButton}
          activeOpacity={0.85}
          onPress={() => requestMatchCelebrationDemo()}
        >
          <Text style={styles.devCelebrationButtonText}>🎉 Preview match celebration</Text>
        </TouchableOpacity>
      ) : null}

      {/* App version — tap 7× to toggle Sentry debug logging (see DEBUGGING.md) */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={async () => {
          debugTapCountRef.current += 1;
          if (debugTapTimeoutRef.current) clearTimeout(debugTapTimeoutRef.current);
          if (debugTapCountRef.current >= DEBUG_TAP_COUNT) {
            debugTapCountRef.current = 0;
            const { isDebugLoggingEnabled, setDebugLoggingEnabled } = await import('../utils/debugLogger');
            const currently = await isDebugLoggingEnabled();
            await setDebugLoggingEnabled(!currently);
            Alert.alert(
              'Debug logging',
              currently
                ? 'Debug logging for Sentry is now OFF. Detailed flow messages will not be sent.'
                : 'Debug logging for Sentry is now ON. When issues occur, detailed flow (e.g. NHIE points, Back to Connect) will appear in Sentry. Tap version 7 times again to disable.',
              [{ text: 'OK' }]
            );
          } else {
            debugTapTimeoutRef.current = setTimeout(() => { debugTapCountRef.current = 0; }, 2000);
          }
        }}
      >
        <Text style={styles.versionText}>
          Version {Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0'}
        </Text>
      </TouchableOpacity>

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

            {isExpoGo && packages.length > 0 && !loadingPackages && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fef3c7', marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}>
                <Text style={{ color: '#92400e', fontSize: 14, textAlign: 'center' }}>
                  Install the app from TestFlight or the App Store to see prices and buy tokens.
                </Text>
              </View>
            )}

            {!isExpoGo && packages.length > 0 && !loadingPackages && packages.every((p) => (p as { priceFormatted?: string }).priceFormatted === '—' || !(p as { priceFormatted?: string }).priceFormatted) && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 16, marginTop: 8 }}>
                <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                  Prices couldn't load. Tap Retry to try again, or update to the latest app version.
                </Text>
                <TouchableOpacity onPress={() => fetchPackages(true)} style={{ backgroundColor: '#8B1538', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {loadingPackages ? (
              <ActivityIndicator size="large" color="#8B1538" style={styles.modalLoading} />
            ) : (
              <ScrollView style={styles.packagesList}>
                {packages.length === 0 ? (
                  <View style={styles.emptyPackages}>
                    <Text style={styles.emptyPackagesText}>In-app purchases coming soon</Text>
                    <Text style={[styles.emptyPackagesText, { marginTop: 8, opacity: 0.9 }]}>We're switching to a new provider. Stay tuned!</Text>
                  </View>
                ) : (
                  packages.map((pkg) => {
                    // Only disable if purchasing OR if it would exceed limit
                    // available can be undefined (backwards compatibility), so only check if it's explicitly false
                    const isDisabled = purchasing || (pkg.wouldExceedLimit === true);
                    return (
                    <TouchableOpacity
                      key={pkg.id}
                      style={[
                        styles.packageItem,
                        pkg.tokens === 7 && styles.packageItemBestValue,
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
                        handlePurchase(pkg);
                      }}
                      disabled={isDisabled}
                    >
                      <View style={styles.packageHeader}>
                        <Text style={styles.packageTokens}>{pkg.tokens} Token{pkg.tokens > 1 ? 's' : ''}</Text>
                        {pkg.tokens === 7 && (
                          <Text style={styles.bestValueBadge}>Best Value</Text>
                        )}
                        {pkg.wouldExceedLimit && (
                          <Text style={styles.limitExceededBadge}>Limit Exceeded</Text>
                        )}
                      </View>
                      <Text style={styles.packagePrice}>{normalizePackageFormattedPrice(pkg.priceFormatted || '—')}</Text>
                      <Text style={styles.packagePricePerToken}>{formatPackagePerTokenLine(pkg.pricePerToken)}</Text>
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
  settingsShellToggleBase: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 2,
    minWidth: 132,
    alignItems: 'center',
  },
  settingsShellToggleMidnight: {
    borderColor: 'rgba(244, 114, 182, 0.55)',
    backgroundColor: 'rgba(18, 16, 28, 0.85)',
  },
  settingsShellToggleSunny: {
    borderColor: 'rgba(251, 191, 36, 0.65)',
    backgroundColor: 'rgba(255, 251, 235, 0.98)',
  },
  settingsShellToggleSoft: {
    borderColor: 'rgba(167, 139, 250, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  settingsShellToggleLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
    letterSpacing: 0.4,
  },
  settingsShellToggleLabelMidnight: {
    color: '#fda4af',
  },
  settingsShellToggleLabelSunny: {
    color: '#9a3412',
  },
  settingsShellToggleLabelSoft: {
    color: '#5b21b6',
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
  pushNotificationsRowWrap: {
    marginTop: 24,
  },
  pushNotificationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  pushNotificationsRowIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  pushNotificationsRowText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  pushNotificationsRowChevron: {
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  emailCard: {
    marginTop: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  emailCardLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 6,
  },
  emailCardSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 18,
    marginBottom: 12,
  },
  emailInput: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(0,0,0,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  emailSaveButton: {
    borderRadius: 16,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  emailSaveButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailSaveText: {
    color: '#667eea',
    fontSize: 15,
    fontWeight: '900',
  },
  emailCardHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
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
  devCelebrationButton: {
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(236, 72, 153, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.45)',
  },
  devCelebrationButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fce7f3',
    textAlign: 'center',
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
