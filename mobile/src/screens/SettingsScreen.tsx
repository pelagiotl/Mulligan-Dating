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
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { clearPushToken } from '../utils/pushNotifications';
import LegalFooter from '../components/LegalFooter';
import ProfileCardAnimatedEmoji from '../components/ProfileCardAnimatedEmoji';

/** Android elevation renders as a harsh grey box behind rounded cards — disable it there. */
const E = (n: number) => (Platform.OS === 'android' ? 0 : n);
const SO = (n: number) => (Platform.OS === 'android' ? 0 : n);
/** Entrance opacity fades can stick below 1 on iOS and wash sections out — keep sections at full opacity. */
const USE_SETTINGS_ENTRANCE_FADE = false;
const SettingsSectionShell: React.ComponentType<{ style?: object; children: React.ReactNode }> =
  USE_SETTINGS_ENTRANCE_FADE ? Animated.View : View;
const SettingsHeaderShell: React.ComponentType<{ style?: object; children: React.ReactNode }> =
  USE_SETTINGS_ENTRANCE_FADE ? Animated.View : View;

function settingsSectionEntranceStyle(
  index: number,
  sectionAnimations: Animated.Value[],
  sectionFallbackAnim: Animated.Value
) {
  if (!USE_SETTINGS_ENTRANCE_FADE) return undefined;
  const anim = sectionAnimations[index] ?? sectionFallbackAnim;
  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [30, 0],
        }),
      },
    ],
  };
}

import {
  androidShellBackdropColors,
  iosFloatingTabBarInset,
  mainTabScrollBottomPadding,
} from '../utils/androidConnectShellChrome';

interface SettingsData {
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
  requiresPasswordForEmailChange?: boolean;
}

const DEBUG_TAP_COUNT = 7;
const SETTINGS_DISPLAY_EMAIL_KEY = 'mulligan:settings-display-email';

async function readStoredDisplayEmail(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(SETTINGS_DISPLAY_EMAIL_KEY);
    return v?.trim().toLowerCase() || '';
  } catch {
    return '';
  }
}

async function writeStoredDisplayEmail(email: string): Promise<void> {
  try {
    const normalized = email.trim().toLowerCase();
    if (normalized) {
      await AsyncStorage.setItem(SETTINGS_DISPLAY_EMAIL_KEY, normalized);
    } else {
      await AsyncStorage.removeItem(SETTINGS_DISPLAY_EMAIL_KEY);
    }
  } catch {
    /* ignore */
  }
}

const isExpoGo = Constants.appOwnership === 'expo';
const IAP_COMING_SOON_MSG = "In-app purchases are coming soon. We're switching to a new provider—stay tuned!";

/**
 * Android: match Danger Zone — semi-transparent saturated rgba gradients over the tab scene.
 * Opaque hex / nested glass cards render dark on Android; Danger Zone's rgba(251,113,133,0.52) does not.
 */
/** Saturated rgba over #12101c — same family as Danger Zone (opaque hex stacks dark on Android). */
const ANDROID_SETTINGS_HEADER_BRIGHT = [
  'rgba(251, 113, 133, 0.82)',
  'rgba(244, 114, 182, 0.76)',
  'rgba(167, 139, 250, 0.68)',
] as const;
const ANDROID_SETTINGS_SECTION_BRIGHT = [
  'rgba(251, 113, 133, 0.72)',
  'rgba(244, 114, 182, 0.66)',
  'rgba(167, 139, 250, 0.58)',
] as const;

function AndroidSettingsBrightCard({
  children,
  variant = 'section',
  shellMidnight = false,
}: {
  children: React.ReactNode;
  variant?: 'header' | 'section';
  shellMidnight?: boolean;
}) {
  if (variant === 'header') {
    if (Platform.OS !== 'android') return <>{children}</>;
    return (
      <LinearGradient
        colors={[...ANDROID_SETTINGS_HEADER_BRIGHT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.androidBrightHeader}
      >
        {children}
      </LinearGradient>
    );
  }

  const iosSectionColors = shellMidnight
    ? (['rgba(28, 24, 38, 0.94)', 'rgba(18, 16, 28, 0.9)'] as const)
    : (['rgba(255, 255, 255, 0.34)', 'rgba(255, 255, 255, 0.18)'] as const);
  const colors =
    Platform.OS === 'android' ? ANDROID_SETTINGS_SECTION_BRIGHT : iosSectionColors;
  const style = Platform.OS === 'android' ? styles.androidBrightSection : styles.iosBrightSection;

  return (
    <LinearGradient
      colors={[...colors]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

const SettingsSectionOuter: React.ComponentType<{ style?: object; children: React.ReactNode }> = View;

export default function SettingsScreen() {
  const { user, profile, logout, refreshProfile, refreshTokensBalance } = useAuth();
  const { mode: connectShellMode, toggleMode: toggleConnectShellMode } = useConnectShellTheme();
  const shellMidnight = connectShellMode === 'midnight';
  const shellBackdropColors = useMemo(
    () => androidShellBackdropColors(connectShellMode),
    [connectShellMode]
  );
  const settingsBackdropColors = shellBackdropColors;
  const showSettingsBackdropGradient = Platform.OS !== 'android';
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useMemo(() => mainTabScrollBottomPadding(insets.bottom), [insets.bottom]);
  const iosTabBarInset = useMemo(
    () => (Platform.OS === 'ios' ? iosFloatingTabBarInset(insets.bottom) : 0),
    [insets.bottom]
  );
  const glassSectionColors = shellMidnight
    ? (['rgba(28, 24, 38, 0.94)', 'rgba(18, 16, 28, 0.9)'] as const)
    : (['rgba(255, 255, 255, 0.34)', 'rgba(255, 255, 255, 0.18)'] as const);
  const settingsInnerPanelStyle = useMemo(() => {
    if (Platform.OS === 'android') return styles.androidBrightInnerPanel;
    if (Platform.OS !== 'ios') return undefined;
    if (shellMidnight) {
      return {
        backgroundColor: 'rgba(139, 92, 246, 0.26)',
        borderColor: 'rgba(216, 180, 254, 0.52)',
        shadowColor: '#a78bfa',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      };
    }
    if (connectShellMode === 'sunny') {
      return {
        backgroundColor: 'rgba(255, 255, 255, 0.88)',
        borderColor: 'rgba(251, 146, 60, 0.38)',
        shadowColor: '#fb923c',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      };
    }
    return {
      backgroundColor: 'rgba(167, 139, 250, 0.32)',
      borderColor: 'rgba(124, 58, 237, 0.38)',
      shadowColor: '#667eea',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
    };
  }, [shellMidnight, connectShellMode]);

  const settingsInputStyle = useMemo(() => {
    if (Platform.OS === 'android') return styles.emailInput;
    if (Platform.OS !== 'ios') return styles.emailInput;
    if (shellMidnight) {
      return [
        styles.emailInput,
        {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderColor: 'rgba(216, 180, 254, 0.42)',
        },
      ];
    }
    if (connectShellMode === 'sunny') {
      return [
        styles.emailInput,
        {
          backgroundColor: 'rgba(255, 251, 235, 0.95)',
          borderColor: 'rgba(251, 146, 60, 0.35)',
          color: '#431407',
        },
      ];
    }
    return [
      styles.emailInput,
      {
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(124, 58, 237, 0.32)',
      },
    ];
  }, [shellMidnight, connectShellMode]);
  const navigation = useNavigation();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [displayEmail, setDisplayEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailPassword, setEmailPassword] = useState('');
  const [emailNeedsPassword, setEmailNeedsPassword] = useState(false);
  const pendingDisplayEmailRef = React.useRef<string | null>(null);
  const debugTapCountRef = React.useRef(0);
  const debugTapTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const logoutModalScale = useRef(new Animated.Value(0.9)).current;
  const logoutModalOpacity = useRef(new Animated.Value(0)).current;
  const deleteModalScale = useRef(new Animated.Value(0.9)).current;
  const deleteModalOpacity = useRef(new Animated.Value(0)).current;

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
  const headerScale = useRef(new Animated.Value(USE_SETTINGS_ENTRANCE_FADE ? 0.9 : 1)).current;
  const headerOpacity = useRef(new Animated.Value(USE_SETTINGS_ENTRANCE_FADE ? 0 : 1)).current;
  const headerIconRotate = useRef(new Animated.Value(0)).current;
  const sectionAnimations = useRef<Animated.Value[]>([]).current;
  const sectionFallbackAnim = useRef(new Animated.Value(1)).current;
  const gradientPos = useRef(new Animated.Value(0)).current;
  const settingsFetchGen = useRef(0);
  const headerIconLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const gradientLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const isFocused = useIsFocused();
  const entrancePlayedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const stored = await readStoredDisplayEmail();
      if (!stored) return;
      pendingDisplayEmailRef.current = stored;
      setDisplayEmail(stored);
      setEmailDraft((prev) => (prev.trim() ? prev : stored));
    })();
  }, []);

  useEffect(() => {
    if (user) {
      fetchSettings();
    } else {
      setLoading(false);
      entrancePlayedRef.current = false;
    }
  }, [user]);

  // One-time entrance animations when settings loads (not repeated on tab blur)
  useEffect(() => {
    if (!user || entrancePlayedRef.current) return;
    entrancePlayedRef.current = true;

    if (USE_SETTINGS_ENTRANCE_FADE) {
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
    } else {
      headerScale.setValue(1);
      headerOpacity.setValue(1);
    }

    for (let i = 0; i < 10; i++) {
      // Sections 4+ (Danger Zone, Help, Session) must stay visible — iOS fade-in often stuck at opacity 0.
      const skipFade = !USE_SETTINGS_ENTRANCE_FADE || i >= 4;
      sectionAnimations[i] = new Animated.Value(skipFade ? 1 : 0);
      if (!skipFade) {
        Animated.timing(sectionAnimations[i], {
          toValue: 1,
          duration: 500,
          delay: i * 80,
          useNativeDriver: true,
        }).start();
      }
    }

  }, [user]);

  // Re-assert full opacity when returning to Settings (guards against stuck entrance values).
  useEffect(() => {
    if (!isFocused || !user) return;
    headerOpacity.setValue(1);
    headerScale.setValue(1);
    for (let i = 0; i < 10; i++) {
      if (sectionAnimations[i]) sectionAnimations[i].setValue(1);
    }
  }, [isFocused, user, headerOpacity, headerScale, sectionAnimations]);

  // Continuous header loops — pause when Settings tab is in background (gradient uses JS driver)
  useEffect(() => {
    headerIconLoopRef.current?.stop();
    gradientLoopRef.current?.stop();

    if (!isFocused || !user) {
      gradientPos.setValue(0);
      return;
    }

    headerIconLoopRef.current = Animated.loop(
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
    );
    gradientLoopRef.current = Animated.loop(
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
    );
    headerIconLoopRef.current.start();
    gradientLoopRef.current.start();

    return () => {
      headerIconLoopRef.current?.stop();
      gradientLoopRef.current?.stop();
    };
  }, [isFocused, user, gradientPos, headerIconRotate]);

  useEffect(() => {
    if (!profile) {
      setDisplayNameDraft('');
      return;
    }
    const p = profile as { display_name?: string; displayName?: string };
    setDisplayNameDraft((p.display_name ?? p.displayName ?? '').trim());
  }, [profile]);

  const persistDisplayEmail = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();
    pendingDisplayEmailRef.current = normalized || null;
    setDisplayEmail(normalized);
    await writeStoredDisplayEmail(normalized);
  }, []);

  const fetchSettings = async (opts?: { silent?: boolean }) => {
    const gen = ++settingsFetchGen.current;
    try {
      if (!opts?.silent) setLoading(true);
      // Don't use GET cache — stale /settings would clear the email field after save
      const data = await api.get<SettingsData>('/settings', false);
      if (gen !== settingsFetchGen.current) return;
      const loadedEmail = (data.email || '').trim().toLowerCase();
      const pending = pendingDisplayEmailRef.current?.trim() || '';
      const mergedEmail = pending || loadedEmail;
      setSettings({
        ...data,
        email: mergedEmail || data.email,
      });
      if (pending) {
        setDisplayEmail(pending);
      } else if (loadedEmail) {
        setDisplayEmail(loadedEmail);
        pendingDisplayEmailRef.current = null;
      }
      if (loadedEmail && pending && loadedEmail === pending) {
        pendingDisplayEmailRef.current = null;
      }
      if (mergedEmail) {
        setEmailDraft(mergedEmail);
      } else if (!pending) {
        setEmailDraft('');
      }
      if (data.requiresPasswordForEmailChange) {
        setEmailNeedsPassword(true);
      }
    } catch (err: any) {
      if (gen !== settingsFetchGen.current) return;
      setError(err?.message || 'Failed to load settings');
    } finally {
      if (!opts?.silent && gen === settingsFetchGen.current) setLoading(false);
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
    const normalizedEmail = email.toLowerCase();
    const currentSaved = (
      displayEmail ||
      settings?.email ||
      user?.email ||
      pendingDisplayEmailRef.current ||
      ''
    )
      .trim()
      .toLowerCase();
    if (normalizedEmail === currentSaved) {
      await persistDisplayEmail(normalizedEmail);
      setSuccess('Email already saved on your account.');
      setEmailSaving(false);
      return;
    }
    try {
      const res = await api.put<{ message?: string; email?: string }>('/settings/email', {
        email: normalizedEmail,
        ...(emailNeedsPassword && emailPassword.trim() ? { password: emailPassword } : {}),
      });
      const savedEmail = (res?.email ?? normalizedEmail).trim().toLowerCase();
      await persistDisplayEmail(savedEmail);
      setSettings((prev) =>
        prev
          ? { ...prev, email: savedEmail }
          : { email: savedEmail, createdAt: '', lastActiveAt: null, showActiveStatus: true },
      );
      setSuccess('Email updated.');
      setEmailNeedsPassword(false);
      setEmailPassword('');
      setEmailDraft(savedEmail);
      api.clearCache('/settings');
      api.clearCache('/auth/me');
      await refreshProfile();
      void fetchSettings({ silent: true });
    } catch (err: any) {
      const msg = err?.message || 'Failed to update email';
      const msgLower = String(msg).toLowerCase();
      if (msgLower.includes('password required')) {
        setEmailNeedsPassword(true);
        setError('Please enter your password to update your email.');
      } else if (
        msgLower.includes('already linked') ||
        msgLower.includes('already in use')
      ) {
        setError(
          'That email is on another Mulligan account. Sign in with that email or use a different address.',
        );
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

  const finishDeleteAccount = useCallback(async () => {
    setShowDeleteAccountModal(false);
    setDeleting(false);
    api.clearCache();
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'PhoneLogin' as never }],
    });
  }, [logout, navigation]);

  const handleConfirmDeleteAccount = useCallback(async () => {
    setError('');
    setDeleting(true);
    try {
      await clearPushToken();
      await api.post('/settings/delete-account', {});
      await finishDeleteAccount();
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete account';
      const alreadyGone =
        err?.status === 404 || String(msg).toLowerCase().includes('user not found');
      if (alreadyGone) {
        await finishDeleteAccount();
        return;
      }
      setError(msg);
      setDeleting(false);
    }
  }, [finishDeleteAccount]);

  useEffect(() => {
    if (showDeleteAccountModal) {
      deleteModalScale.setValue(0.9);
      deleteModalOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(deleteModalScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(deleteModalOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showDeleteAccountModal, deleteModalScale, deleteModalOpacity]);

  useEffect(() => {
    if (showLogoutModal) {
      logoutModalScale.setValue(0.9);
      logoutModalOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(logoutModalScale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(logoutModalOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showLogoutModal, logoutModalScale, logoutModalOpacity]);

  const handleConfirmLogout = useCallback(() => {
    setShowLogoutModal(false);
    logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'PhoneLogin' as never }],
    });
  }, [logout, navigation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[...settingsBackdropColors]}
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
    <View style={[styles.wrapper, Platform.OS === 'android' && styles.wrapperAndroid]}>
      {showSettingsBackdropGradient ? (
        <LinearGradient
          colors={[...settingsBackdropColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPad }]}
        contentInset={Platform.OS === 'ios' ? { bottom: iosTabBarInset } : undefined}
        scrollIndicatorInsets={Platform.OS === 'ios' ? { bottom: iosTabBarInset } : undefined}
        alwaysBounceVertical
        showsVerticalScrollIndicator
      >
        {Platform.OS === 'android' ? (
          <View style={styles.section}>
            <AndroidSettingsBrightCard variant="header">
              <View style={styles.header}>
                <View style={styles.headerIconContainer}>
                  <LinearGradient colors={['#fff', '#f8f9ff']} style={StyleSheet.absoluteFill} />
                  <ProfileCardAnimatedEmoji emoji="⚙️" variant="shimmer" fontSize={40} delay={0} />
                </View>
                <Text style={styles.headerTitle}>Settings</Text>
                <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
              </View>
            </AndroidSettingsBrightCard>
          </View>
        ) : (
          <SettingsHeaderShell
            style={[
              styles.headerGradient,
              USE_SETTINGS_ENTRANCE_FADE
                ? {
                    opacity: headerOpacity,
                    transform: [{ scale: headerScale }],
                  }
                : undefined,
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
                <LinearGradient colors={['#fff', '#f8f9ff']} style={StyleSheet.absoluteFill} />
                <ProfileCardAnimatedEmoji emoji="⚙️" variant="shimmer" fontSize={40} delay={0} />
              </Animated.View>
              <Text style={styles.headerTitle}>Settings</Text>
              <Text style={styles.headerSubtitle}>Manage your account preferences</Text>
            </View>
          </SettingsHeaderShell>
        )}

      {error ? (
        <View style={styles.errorContainer}>
          <View style={styles.bannerTextRow}>
            <ProfileCardAnimatedEmoji
              emoji="⚠️"
              variant="sway"
              fontSize={18}
              delay={0}
              containerStyle={styles.bannerEmojiWrap}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </View>
      ) : null}

      {success ? (
        <View style={styles.successContainer}>
          <View style={styles.bannerTextRow}>
            <ProfileCardAnimatedEmoji
              emoji="✅"
              variant="pulse"
              fontSize={18}
              delay={0}
              containerStyle={styles.bannerEmojiWrap}
            />
            <Text style={styles.successText}>{success}</Text>
          </View>
        </View>
      ) : null}

      {Platform.OS === 'android' ? (
        <View style={styles.section}>
          <AndroidSettingsBrightCard shellMidnight={shellMidnight}>
            <View style={styles.sectionTitleContainer}>
              <ProfileCardAnimatedEmoji
                emoji="🎨"
                variant="shimmer"
                fontSize={26}
                delay={0}
                containerStyle={styles.sectionEmojiWrap}
              />
              <Text style={styles.sectionTitle}>Connect tab appearance</Text>
            </View>
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
                styles.settingsShellToggleAndroidBright,
                connectShellMode === 'sunny'
                  ? styles.settingsShellToggleSunny
                  : connectShellMode === 'soft'
                    ? styles.settingsShellToggleSoft
                    : null,
              ]}
            >
              <Text
                style={[
                  styles.settingsShellToggleLabel,
                  styles.settingsShellToggleLabelAndroidBright,
                  connectShellMode === 'sunny'
                    ? styles.settingsShellToggleLabelSunny
                    : connectShellMode === 'soft'
                      ? styles.settingsShellToggleLabelSoft
                      : null,
                ]}
              >
                {connectShellDisplayLabel(connectShellMode)}
              </Text>
            </TouchableOpacity>
          </AndroidSettingsBrightCard>
        </View>
      ) : null}

      {/* Account Info */}
      <SettingsSectionOuter
        style={[styles.section, settingsSectionEntranceStyle(0, sectionAnimations, sectionFallbackAnim)]}
      >
        <AndroidSettingsBrightCard shellMidnight={shellMidnight}>
        <View style={styles.sectionTitleContainer}>
          <ProfileCardAnimatedEmoji
            emoji="👤"
            variant="bob"
            fontSize={26}
            delay={80}
            containerStyle={styles.sectionEmojiWrap}
          />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={[styles.pushNotificationsRow, settingsInnerPanelStyle]}
            onPress={() => navigationRef.current?.navigate('PushNotificationSettings')}
            activeOpacity={0.8}
          >
            <ProfileCardAnimatedEmoji
              emoji="🔔"
              variant="bob"
              fontSize={22}
              delay={0}
              containerStyle={styles.pushNotificationsRowIconWrap}
            />
            <Text style={styles.pushNotificationsRowText}>Push notifications</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pushNotificationsRowWrap}>
          <TouchableOpacity
            style={[styles.pushNotificationsRow, settingsInnerPanelStyle]}
            onPress={() => navigationRef.current?.navigate('BlockedUsers')}
            activeOpacity={0.8}
          >
            <ProfileCardAnimatedEmoji
              emoji="🚫"
              variant="peek"
              fontSize={22}
              delay={100}
              containerStyle={styles.pushNotificationsRowIconWrap}
            />
            <Text style={styles.pushNotificationsRowText}>Block list</Text>
            <Text style={styles.pushNotificationsRowChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Optional email for support / important account updates */}
        <View style={[styles.emailCard, settingsInnerPanelStyle]}>
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
            style={settingsInputStyle}
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
              style={settingsInputStyle}
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
            Current:{' '}
            {displayEmail ||
              settings?.email?.trim() ||
              user?.email?.trim() ||
              'none'}
          </Text>
        </View>

        <View style={[styles.emailCard, settingsInnerPanelStyle]}>
          <Text style={styles.emailCardLabel}>Display name</Text>
          <Text style={styles.emailCardSubLabel}>
            Shown to people you connect with. You need a name, location, and a photo before you can use Connect.
          </Text>
          <TextInput
            value={displayNameDraft}
            onChangeText={setDisplayNameDraft}
            placeholder="Your first name or nickname"
            placeholderTextColor="rgba(255,255,255,0.65)"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={50}
            style={settingsInputStyle}
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

        </AndroidSettingsBrightCard>
      </SettingsSectionOuter>

      {/* Buy Tokens */}
      <SettingsSectionOuter
        style={[styles.section, settingsSectionEntranceStyle(2, sectionAnimations, sectionFallbackAnim)]}
      >
        <AndroidSettingsBrightCard shellMidnight={shellMidnight}>
        <View style={styles.sectionTitleContainer}>
          <ProfileCardAnimatedEmoji
            emoji="💳"
            variant="heartbeat"
            fontSize={26}
            delay={0}
            containerStyle={styles.sectionEmojiWrap}
          />
          <Text style={styles.sectionTitle}>Tokens</Text>
        </View>
        {Platform.OS === 'android' ? (
          <>
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
                colors={['#fb7185', '#f472b6', '#a78bfa']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryButton}
              >
                <View style={styles.buttonTextRow}>
                  <ProfileCardAnimatedEmoji emoji="💳" variant="heartbeat" fontSize={20} delay={0} />
                  <Text style={[styles.buttonText, styles.primaryButtonText]}>Cop some more</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <>
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
                <View style={styles.buttonTextRow}>
                  <ProfileCardAnimatedEmoji emoji="💳" variant="heartbeat" fontSize={20} delay={0} />
                  <Text style={[styles.buttonText, styles.primaryButtonText]}>Cop some more</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
        </AndroidSettingsBrightCard>
      </SettingsSectionOuter>

      {/* Delete Account — no entrance fade (must stay visible on iOS) */}
      <View style={styles.section}>
        <LinearGradient
          colors={['rgba(251, 113, 133, 0.52)', 'rgba(185, 28, 28, 0.48)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dangerSection}
        >
        <View style={styles.sectionTitleContainer}>
          <ProfileCardAnimatedEmoji
            emoji="⚠️"
            variant="sway"
            fontSize={26}
            delay={0}
            containerStyle={styles.sectionEmojiWrap}
          />
          <Text style={styles.sectionTitle}>Danger Zone</Text>
        </View>
        <Text style={styles.dangerText}>
          Deleting your account permanently removes your profile, matches, messages, and tokens. This cannot be undone.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setShowDeleteAccountModal(true)}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
        >
          <LinearGradient
            colors={['#fb7185', '#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dangerButton}
          >
            <Text style={[styles.buttonText, styles.dangerButtonText]}>Delete Account</Text>
          </LinearGradient>
        </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Help & Support */}
      <View style={styles.section}>
        <LinearGradient
          colors={[...glassSectionColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.helpSupportCard, shellMidnight && styles.helpSupportCardMidnight]}
        >
          <View style={styles.sectionTitleContainer}>
            <ProfileCardAnimatedEmoji
              emoji="💬"
              variant="glow"
              fontSize={26}
              delay={80}
              containerStyle={styles.sectionEmojiWrap}
            />
            <Text style={styles.sectionTitle}>Help & Support</Text>
          </View>
          <Text style={styles.helpSupportHint}>
            Questions about your account, tokens, or the app? We&apos;re here to help.
          </Text>
          <TouchableOpacity
            style={styles.settingsActionButton}
            onPress={() => Linking.openURL('mailto:mulligandating@gmail.com')}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Contact us"
          >
            <LinearGradient
              colors={shellMidnight ? ['#2a2438', '#1c1828'] : ['#ffffff', '#f8f9ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.settingsActionButtonGradient}
            >
              <Text style={[styles.settingsActionButtonText, shellMidnight && styles.settingsActionButtonTextMidnight]}>
                Contact us
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Session / Log out */}
      <View style={styles.section}>
        <LinearGradient
          colors={[...glassSectionColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.sessionCard, shellMidnight && styles.sessionCardMidnight]}
        >
          <View style={styles.sectionTitleContainer}>
            <ProfileCardAnimatedEmoji
              emoji="🚪"
              variant="peek"
              fontSize={26}
              delay={0}
              containerStyle={styles.sectionEmojiWrap}
            />
            <Text style={styles.sectionTitle}>Session</Text>
          </View>
          <Text style={styles.sessionHint}>
            Log out of this device and return to the phone number login screen.
          </Text>
          <TouchableOpacity
            style={styles.settingsActionButton}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <LinearGradient
              colors={shellMidnight ? ['#2a2438', '#1c1828'] : ['#ffffff', '#f0f1ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.settingsActionButtonGradient}
            >
              <Text style={[styles.settingsActionButtonText, shellMidnight && styles.settingsActionButtonTextMidnight]}>
                Log out
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Legal Footer */}
      <LegalFooter />

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

      {/* Delete account confirmation */}
      <Modal
        visible={showDeleteAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setShowDeleteAccountModal(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <TouchableOpacity
            style={styles.logoutModalBackdrop}
            activeOpacity={1}
            onPress={() => !deleting && setShowDeleteAccountModal(false)}
            disabled={deleting}
          />
          <Animated.View
            style={[
              styles.logoutModalCardWrap,
              {
                opacity: deleteModalOpacity,
                transform: [{ scale: deleteModalScale }],
              },
            ]}
          >
            <View style={[styles.logoutModalCard, styles.deleteModalCard]}>
              <LinearGradient
                colors={['#7f1d1d', '#dc2626', '#f97316']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoutModalGradient}
              >
                <ProfileCardAnimatedEmoji
                  emoji="⚠️"
                  variant="sway"
                  fontSize={52}
                  delay={0}
                  containerStyle={styles.logoutModalEmojiWrap}
                />
                <Text style={styles.logoutModalTitle}>Delete your account?</Text>
                <Text style={styles.logoutModalSubtitle}>
                  This permanently deletes your profile, photos, matches, and messages. You cannot undo this.
                </Text>
                <View style={[styles.logoutModalActions, styles.deleteModalActions]}>
                  <TouchableOpacity
                    style={styles.deleteModalStayButton}
                    onPress={() => setShowDeleteAccountModal(false)}
                    activeOpacity={0.85}
                    disabled={deleting}
                  >
                    <Text style={styles.deleteModalStayText}>Keep my account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteModalConfirmWrap}
                    onPress={() => void handleConfirmDeleteAccount()}
                    activeOpacity={0.9}
                    disabled={deleting}
                  >
                    <LinearGradient
                      colors={['#450a0a', '#991b1b', '#7f1d1d']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.deleteModalConfirmButton}
                    >
                      {deleting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.deleteModalConfirmText}>Delete forever</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Logout confirmation */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <TouchableOpacity
            style={styles.logoutModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowLogoutModal(false)}
          />
          <Animated.View
            style={[
              styles.logoutModalCardWrap,
              {
                opacity: logoutModalOpacity,
                transform: [{ scale: logoutModalScale }],
              },
            ]}
          >
            <View style={styles.logoutModalCard}>
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f5576c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoutModalGradient}
              >
                <ProfileCardAnimatedEmoji
                  emoji="👋"
                  variant="bounce"
                  fontSize={48}
                  delay={0}
                  containerStyle={styles.logoutModalEmojiWrap}
                />
                <Text style={styles.logoutModalTitle}>Log out?</Text>
                <Text style={styles.logoutModalSubtitle}>
                  You&apos;ll need to sign in again to browse, match, and chat on Mulligan.
                </Text>
                <View style={styles.logoutModalActions}>
                  <TouchableOpacity
                    style={styles.logoutModalStayButton}
                    onPress={() => setShowLogoutModal(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.logoutModalStayText}>Stay</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.logoutModalConfirmWrap}
                    onPress={handleConfirmLogout}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.18)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.logoutModalConfirmButton}
                    >
                      <Text style={styles.logoutModalConfirmText}>Log out</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        </View>
      </Modal>

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
  wrapperAndroid: {
    backgroundColor: '#12101c',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 0,
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
    shadowOpacity: SO(0.4),
    shadowRadius: 30,
    elevation: E(16),
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  androidBrightHeader: {
    marginTop: 56,
    paddingTop: 60,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 24,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: 'rgba(254, 202, 202, 0.72)',
    overflow: 'hidden',
    backgroundColor: '#fb7185',
  },
  androidBrightSection: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(254, 202, 202, 0.72)',
    overflow: 'hidden',
    backgroundColor: '#fb7185',
  },
  iosBrightSection: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    overflow: 'hidden',
  },
  androidBrightInnerPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    borderColor: 'rgba(254, 202, 202, 0.55)',
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
    shadowOpacity: SO(0.45),
    shadowRadius: 20,
    elevation: E(12),
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
  sectionEmojiWrap: {
    marginRight: 12,
  },
  bannerTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerEmojiWrap: {
    flexShrink: 0,
  },
  buttonTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pushNotificationsRowIconWrap: {
    marginRight: 12,
    width: 28,
    alignItems: 'center',
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
    shadowOpacity: SO(0.2),
    shadowRadius: 24,
    elevation: E(12),
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
  tokensCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: SO(0.2),
    shadowRadius: 20,
    elevation: E(10),
  },
  settingsShellToggleAndroidBright: {
    borderColor: 'rgba(254, 202, 202, 0.72)',
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  settingsShellToggleLabelAndroidBright: {
    color: '#fff',
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
    shadowOpacity: SO(0.25),
    shadowRadius: 8,
    elevation: E(4),
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
    shadowOpacity: SO(0.3),
    shadowRadius: 16,
    elevation: E(10),
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
    shadowOpacity: SO(0.1),
    shadowRadius: 6,
    elevation: E(3),
  },
  dangerButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    minHeight: 52,
  },
  pushNotificationsRowWrap: {
    marginTop: 24,
  },
  pushNotificationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: SO(0.25),
    shadowRadius: 12,
    elevation: E(6),
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
    backgroundColor: 'transparent',
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
    backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0,0,0,0.10)',
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
  supportRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  supportRowChevron: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '300',
  },
  helpSupportCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  helpSupportHint: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.96)',
    marginBottom: 16,
    fontWeight: '500',
  },
  sessionCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  sessionCardMidnight: {
    borderColor: 'rgba(244, 114, 182, 0.28)',
  },
  helpSupportCardMidnight: {
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  sessionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.96)',
    marginBottom: 16,
    fontWeight: '500',
  },
  settingsActionButton: {
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  settingsActionButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  settingsActionButtonText: {
    color: '#4338ca',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  settingsActionButtonTextMidnight: {
    color: '#fda4af',
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
  versionText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  dangerSection: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(254, 202, 202, 0.72)',
  },
  dangerText: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 20,
    lineHeight: 22,
    fontWeight: '600',
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
  logoutModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  logoutModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 10, 22, 0.72)',
  },
  logoutModalCardWrap: {
    width: '100%',
    maxWidth: 340,
    zIndex: 2,
  },
  logoutModalCard: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  deleteModalCard: {
    borderColor: 'rgba(254, 202, 202, 0.55)',
    ...Platform.select({
      android: { elevation: 0 },
      ios: {
        shadowColor: '#7f1d1d',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
      },
    }),
  },
  logoutModalGradient: {
    paddingVertical: 32,
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  logoutModalEmoji: {
    fontSize: 52,
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  logoutModalEmojiWrap: {
    marginBottom: 12,
    alignItems: 'center',
  },
  logoutModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
  },
  logoutModalSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.92)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 26,
    paddingHorizontal: 4,
  },
  logoutModalActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    width: '100%',
  },
  deleteModalActions: {
    flexDirection: 'column',
    gap: 10,
  },
  deleteModalStayButton: {
    width: '100%',
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  deleteModalStayText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7f1d1d',
    textAlign: 'center',
    letterSpacing: 0.15,
    lineHeight: 20,
  },
  deleteModalConfirmWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.38)',
  },
  deleteModalConfirmButton: {
    width: '100%',
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 20,
  },
  logoutModalStayButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  logoutModalStayText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#5b21b6',
    letterSpacing: 0.2,
  },
  logoutModalConfirmWrap: {
    flex: 1,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  logoutModalConfirmButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutModalConfirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
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
    shadowOpacity: SO(0.3),
    shadowRadius: 24,
    elevation: E(20),
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
    shadowOpacity: SO(0.15),
    shadowRadius: 16,
    elevation: E(8),
  },
  packageItemBestValue: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
    borderWidth: 3.5,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: SO(0.3),
    shadowRadius: 20,
    elevation: E(12),
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
    shadowOpacity: SO(0.25),
    shadowRadius: 6,
    elevation: E(4),
  },
  distanceButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: SO(0.5),
    shadowRadius: 12,
    elevation: E(8),
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
