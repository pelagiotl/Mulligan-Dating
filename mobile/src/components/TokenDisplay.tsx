import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';

const isExpoGo = Constants.appOwnership === 'expo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  ensurePurchasesConfigured,
  findRevenueCatPackage,
  formatPurchasesError,
  getRevenueCatPackageForProductId,
  pickCurrentOfferingPackages,
} from '../utils/purchasesReady';
import { purchaseTokensWithGooglePay } from '../utils/googlePay';
import { formatPackagePerTokenLine, normalizePackageFormattedPrice } from '../utils/formatPackagePrice';
import BrowseConnectLandingTokenStrip from './BrowseConnectLandingTokenStrip';
import WeeklyTokenClaimCelebration from './WeeklyTokenClaimCelebration';
import { playTokenClaimSound } from '../utils/sounds';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { TOKEN_PURCHASE_REUP_MESSAGE } from '../constants/tokenCelebration';
import SmoothPulsingEmoji from './SmoothPulsingEmoji';

interface TokenData {
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate?: string | null;
}

interface TokenPackage {
  id: number;
  productId?: string;
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

// Animated re-up celebration card (replaces native alert)
function ReupCelebrationModal({
  visible,
  message,
  onLetsGo,
  onRequestClose,
}: {
  visible: boolean;
  message: string;
  onLetsGo: () => void;
  onRequestClose: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0);
      opacity.setValue(0);
      sparkle1.setValue(0);
      sparkle2.setValue(0);
      sparkle3.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const sparkleDuration = 600;
    const sparkleStagger = 150;
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(sparkle1, { toValue: 1, duration: sparkleDuration, useNativeDriver: true }),
          Animated.timing(sparkle1, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(sparkleStagger),
          Animated.timing(sparkle2, { toValue: 1, duration: sparkleDuration, useNativeDriver: true }),
          Animated.timing(sparkle2, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(sparkleStagger * 2),
          Animated.timing(sparkle3, { toValue: 1, duration: sparkleDuration, useNativeDriver: true }),
          Animated.timing(sparkle3, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]),
    ]).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, [visible]);

  const s1Opacity = sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const s1Scale = sparkle1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] });
  const s2Opacity = sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const s2Scale = sparkle2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] });
  const s3Opacity = sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const s3Scale = sparkle3.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Animated.View style={[styles.reupOverlay, { opacity }]} pointerEvents="box-none">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onRequestClose} />
        <View style={styles.reupCardWrap} pointerEvents="box-none">
          {/* Sparkles */}
          <Animated.View style={[styles.reupSparkle, styles.reupSparkle1, { opacity: s1Opacity, transform: [{ scale: s1Scale }] }]} />
          <Animated.View style={[styles.reupSparkle, styles.reupSparkle2, { opacity: s2Opacity, transform: [{ scale: s2Scale }] }]} />
          <Animated.View style={[styles.reupSparkle, styles.reupSparkle3, { opacity: s3Opacity, transform: [{ scale: s3Scale }] }]} />

          <Animated.View style={[styles.reupCardInner, { transform: [{ scale }] }]}>
            <Animated.View style={{ transform: [{ scale: glowPulse }] }}>
              <LinearGradient
                colors={['#10b981', '#059669', '#047857', '#065f46']}
                locations={[0, 0.35, 0.7, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.reupCardGradient}
              >
                <Text style={styles.reupEmoji}>💰</Text>
                <Text style={styles.reupTitle}>You're Reupped!</Text>
                <Text style={styles.reupMessage}>{message}</Text>
                <TouchableOpacity
                  style={styles.reupButtonWrap}
                  onPress={() => {
                    onLetsGo();
                    onRequestClose();
                  }}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#fff', '#f0fdf4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.reupButton}
                  >
                    <Text style={styles.reupButtonText}>Slay</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// Animated purchase success card
function PurchaseSuccessModal({
  visible,
  tokensGranted,
  onDismiss,
}: {
  visible: boolean;
  tokensGranted: number;
  onDismiss: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0);
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    glowLoop.start();
    return () => glowLoop.stop();
  }, [visible]);

  if (!visible) return null;

  const tokenText = tokensGranted === 1 ? '1 token' : `${tokensGranted} tokens`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Animated.View style={[styles.reupOverlay, { opacity }]} pointerEvents="box-none">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />
        <View style={styles.reupCardWrap} pointerEvents="box-none">
          <Animated.View style={[styles.reupCardInner, { transform: [{ scale }] }]}>
            <Animated.View style={{ transform: [{ scale: glowPulse }] }}>
              <LinearGradient
                colors={['#10b981', '#059669', '#047857', '#065f46']}
                locations={[0, 0.35, 0.7, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.reupCardGradient}
              >
                <Text style={styles.reupEmoji}>🎟️</Text>
                <Text style={styles.reupTitle}>Purchase complete!</Text>
                <Text style={styles.reupMessage}>
                  {tokenText} added to your account. You're ready to connect!
                </Text>
                <TouchableOpacity
                  style={styles.reupButtonWrap}
                  onPress={onDismiss}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#fff', '#f0fdf4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.reupButton}
                  >
                    <Text style={styles.reupButtonText}>Nice! ✨</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** Solid high-contrast badge for the Sober Circle quantity overlay (🎫 + count). */
function WebNavbarTokenBadge({
  count,
  loading,
  shell,
  onPress,
}: {
  count: number;
  loading?: boolean;
  shell: ConnectShellMode;
  onPress: () => void;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pressed, setPressed] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const badgeScaleLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(!!v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    pulseLoopRef.current?.stop();
    shimmerLoopRef.current?.stop();
    badgeScaleLoopRef.current?.stop();

    // Android: static navbar badge (no scale loop — avoids flicker with emoji).
    if (reduceMotion || loading || Platform.OS === 'android') {
      pulse.setValue(0);
      shimmer.setValue(0);
      badgeScale.setValue(1);
      return;
    }

    badgeScaleLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(badgeScale, {
          toValue: 1.045,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(badgeScale, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    badgeScaleLoopRef.current.start();

    if (Platform.OS === 'ios') {
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      );
      pulseLoopRef.current.start();

      shimmerLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, {
            toValue: 1,
            duration: 3000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(shimmer, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      shimmerLoopRef.current.start();
    } else {
      pulse.setValue(0);
      shimmer.setValue(0);
    }

    return () => {
      pulseLoopRef.current?.stop();
      shimmerLoopRef.current?.stop();
      badgeScaleLoopRef.current?.stop();
    };
  }, [reduceMotion, loading, pulse, shimmer, badgeScale]);

  const shimmerTranslateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-72, 168],
  });

  const gradientColors =
    shell === 'midnight'
      ? (['#15803d', '#16a34a', '#0f766e'] as const)
      : shell === 'sunny'
        ? (['#ca8a04', '#eab308', '#16a34a'] as const)
        : (['#16a34a', '#22c55e', '#0d9488'] as const);
  const androidNavbarBorderColor = 'rgba(255, 255, 255, 0.9)';
  const borderColor = 'rgba(255, 255, 255, 0.85)';
  const textColor = '#ffffff';

  /** Strong green glow — readable on light and dark Sober Circle surfaces */
  const pulseShadowColor = '#166534';

  const badgeInnerStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 2,
    borderColor,
    minWidth: loading ? 56 : undefined,
    overflow: 'hidden' as const,
  };

  const badgeInner = (
    <>
      {/* Android: skip white shimmer — it composites as a grey patch over the count. iOS keeps web-parity gleam. */}
      {!reduceMotion && !loading && Platform.OS !== 'android' && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 30,
            backgroundColor: 'rgba(255, 255, 255, 0.28)',
            transform: [{ skewX: '-20deg' }, { translateX: shimmerTranslateX }],
          }}
        />
      )}
      <View
        {...(Platform.OS === 'android' ? { collapsable: false } : {})}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <>
            <SmoothPulsingEmoji emoji="🎫" fontSize={17} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: textColor,
                letterSpacing: 0.2,
                marginLeft: 6,
                textShadowColor: 'rgba(0, 0, 0, 0.35)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
                ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
              }}
            >
              {count}
            </Text>
          </>
        )}
      </View>
    </>
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel="Mulligan tokens, open details"
    >
      {/* Shadow pulse uses JS driver; scale uses native driver — must be separate Animated.Views. */}
      <Animated.View
        style={{
          borderRadius: 14,
          transform: [{ translateY: pressed ? -2 : 0 }],
          shadowColor: pulseShadowColor,
          shadowOffset: { width: 0, height: pressed ? 5 : 3 },
          shadowOpacity:
            Platform.OS === 'ios'
              ? reduceMotion || loading
                ? 0.35
                : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.5] })
              : 0.4,
          shadowRadius:
            Platform.OS === 'ios'
              ? reduceMotion || loading
                ? 10
                : pulse.interpolate({ inputRange: [0, 1], outputRange: [8, 14] })
              : 10,
          elevation: pressed ? 12 : 8,
        }}
      >
        <Animated.View
          style={{
            transform: reduceMotion || loading ? [] : [{ scale: badgeScale }],
          }}
        >
          <LinearGradient
            colors={[...gradientColors]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              badgeInnerStyle,
              Platform.OS === 'android'
                ? { borderColor: androidNavbarBorderColor, elevation: pressed ? 12 : 8 }
                : null,
            ]}
          >
            {badgeInner}
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function premiumTokenBadgeChrome(shell: ConnectShellMode): {
  gradient: readonly [string, string, string];
  androidBg: string;
  shadowColor: string;
} {
  switch (shell) {
    case 'midnight':
      return {
        gradient: ['#5b21b6', '#86198f', '#db2777'],
        androidBg: '#6b21a8',
        shadowColor: '#db2777',
      };
    case 'sunny':
      return {
        gradient: ['#ea580c', '#fb923c', '#fbbf24'],
        androidBg: '#ea580c',
        shadowColor: '#f97316',
      };
    case 'soft':
      return {
        gradient: ['#667eea', '#764ba2', '#f093fb'],
        androidBg: '#7367dc',
        shadowColor: '#667eea',
      };
  }
}

// Premium Token Display Component with animations
function PremiumTokenDisplay({
  count,
  shell,
  onPress,
}: {
  count: number;
  shell: ConnectShellMode;
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

    if (Platform.OS !== 'android') {
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
    }
  }, []);

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  const chrome = premiumTokenBadgeChrome(shell);

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
        {Platform.OS === 'android' ? (
          <LinearGradient
            colors={[...chrome.gradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.premiumGradient, { shadowColor: chrome.shadowColor, elevation: 6 }]}
          >
            <View style={styles.premiumContent} collapsable={false}>
              <Text style={styles.premiumIcon}>🏌️</Text>
              <Text style={[styles.premiumCount, styles.premiumCountAndroid]}>{count}</Text>
            </View>
          </LinearGradient>
        ) : (
          <LinearGradient
            colors={[...chrome.gradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.premiumGradient, { shadowColor: chrome.shadowColor }]}
          >
            <Animated.View
              style={[
                styles.shimmerOverlay,
                {
                  transform: [{ translateX: shimmerTranslateX }],
                },
              ]}
            />
            <View style={styles.premiumContent}>
              <Text style={styles.premiumIcon}>🏌️</Text>
              <Text style={styles.premiumCount}>{count}</Text>
            </View>
          </LinearGradient>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

interface TokenDisplayProps {
  compact?: boolean; // If true, only show token count (for header use)
  premium?: boolean; // If true, show premium styled version with animations
  /** Full-width Connect landing token card (web `.browse-connect-landing-token`); ignores compact/premium chrome. */
  browseLandingStrip?: boolean;
  connectShell?: ConnectShellMode;
  openModalRef?: React.MutableRefObject<(() => void) | null>;
  /** When set, parent can trigger claim directly (e.g. from "Claim your 7 tokens!" banner) and show custom success message */
  performClaimRef?: React.MutableRefObject<((opts?: { onSuccess?: () => void; successMessage?: string }) => Promise<void>) | null>;
  /** Called after token balance is refreshed (claim, purchase, or poll). */
  onTokensUpdated?: () => void;
  /** With `compact` (non-premium): mirror web `.navbar-token-badge` — gradient, shadow pulse, skew shimmer (respects reduce motion). */
  compactNavbarChrome?: boolean;
}

const IAP_COMING_SOON_MSG = "In-app purchases are coming soon. We're switching to a new provider—stay tuned!";

export default function TokenDisplay({
  compact = false,
  premium = false,
  browseLandingStrip = false,
  connectShell = 'midnight',
  openModalRef,
  performClaimRef,
  onTokensUpdated,
  compactNavbarChrome = false,
}: TokenDisplayProps) {
  const { user, registerTokensBalanceRefresh } = useAuth();
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
  const [reupCelebration, setReupCelebration] = useState<{ message: string; onSuccess?: () => void } | null>(null);
  const [weeklyClaimCelebration, setWeeklyClaimCelebration] = useState<number | null>(null);

  const balanceRef = useRef(0);
  useEffect(() => {
    balanceRef.current = data?.availableTokens ?? 0;
  }, [data?.availableTokens]);

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
            Alert.alert('Not Yet', 'You cannot claim monthly tokens right now. Check back next month!');
          }
          return;
        }
        setClaiming(true);
        setError('');
        setSuccess('');
        try {
          const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
          const granted = result.tokensGranted ?? 0;
          if (granted > 0) {
            void playTokenClaimSound();
          }
          api.clearCache('/tokens');
          await fetchTokens();
          const msg = opts?.successMessage ?? `You've been reupped. Cool 🤑`;
          setReupCelebration({ message: msg, onSuccess: opts?.onSuccess });
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
  }, [user?.id]);

  // Refresh tokens when screen is focused — clear cache so count is always up to date (e.g. after admin grant)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        api.clearCache('/tokens');
        fetchTokens();
      }
    }, [user?.id])
  );

  // Periodic refresh while focused; cache (60s) avoids rate limit (429) while keeping balance reasonably fresh
  useEffect(() => {
    if (!user || !isFocused) return;
    const interval = setInterval(() => {
      fetchTokens(); // uses cache when valid, so we don't hit /tokens every 20s
    }, 30 * 1000); // every 30 seconds when focused
    return () => clearInterval(interval);
  }, [user?.id, isFocused]);

  const fetchTokens = async () => {
    if (!user) return;
    try {
      setError('');
      const tokenData = await api.get<TokenData>('/tokens');
      setData(tokenData);
      onTokensUpdated?.();
    } catch (err: any) {
      // 401/403: session expired; API client clears token and notifies AuthContext to logout — don't log or set error
      if (err?.status === 401 || err?.status === 403) return;
      console.error('Failed to fetch tokens:', err);
      setError(err?.message || 'Failed to load tokens');
    }
  };

  /** Bypass GET cache and poll — RevenueCat webhook grants async; /tokens is cached 60s. */
  const syncTokensAfterPurchase = useCallback(async () => {
    if (!user) return;
    const start = balanceRef.current;
    const maxAttempts = 10;
    const delayMs = 1500;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      api.clearCache('/tokens');
      try {
        const tokenData = await api.get<TokenData>('/tokens', false);
        setData(tokenData);
        if (tokenData.availableTokens > start) return;
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) return;
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    onTokensUpdated?.();
  }, [user?.id, onTokensUpdated]);

  useEffect(() => {
    registerTokensBalanceRefresh(syncTokensAfterPurchase);
    return () => registerTokensBalanceRefresh(null);
  }, [registerTokensBalanceRefresh, syncTokensAfterPurchase]);

  const revenueCatPackagesByProductId = useRef<Record<string, PurchasesPackage>>({});

  const fetchPackages = async (isRetry = false) => {
    try {
      if (!isRetry) setLoadingPackages(true);
      const response = await api.get<{ packages: TokenPackage[]; availableTokens?: number }>('/payments/packages');
      let list = response.packages || [];
      if (!isRetry) revenueCatPackagesByProductId.current = {};
      const tryRevenueCat = async (): Promise<boolean> => {
        if (list.length === 0 || Platform.OS !== 'ios') return false;
        if (!(await ensurePurchasesConfigured())) return false;
        try {
          const offerings = await Purchases.getOfferings();
          const available = pickCurrentOfferingPackages(offerings);
          if (__DEV__) {
            console.log('[IAP] getOfferings: packages count=', available.length);
            available.forEach((p) => console.log('[IAP] RC package product.identifier=', p.product.identifier));
            console.log('[IAP] Backend productIds=', list.map((p) => p.productId));
          }
          if (available.length) {
            let matched = 0;
            list = list.map((pkg) => {
              const productId = pkg.productId;
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
          console.warn('[IAP] getOfferings failed:', rcErr);
        }
        return false;
      };
      const gotPrices = await tryRevenueCat();
      if (!gotPrices && !isExpoGo && list.length > 0 && !isRetry) {
        await new Promise((r) => setTimeout(r, 2000));
        await tryRevenueCat();
      }
      list = list.map((pkg) => {
        if (pkg.priceFormatted) return pkg;
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

  const handlePurchase = async (pkg: TokenPackage) => {
    if (Platform.OS === 'android') {
      setPurchasing(true);
      try {
        const result = await purchaseTokensWithGooglePay({
          id: pkg.id,
          tokens: pkg.tokens,
          price: pkg.price,
        });
        await syncTokensAfterPurchase();
        await fetchPackages();
        setReupCelebration({ message: TOKEN_PURCHASE_REUP_MESSAGE });
      } catch (err: any) {
        const msg = err?.message || 'Google Pay purchase failed. Please try again.';
        Alert.alert('Purchase failed', msg);
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
    const pid = pkg.productId;
    let rcPkg = pid ? revenueCatPackagesByProductId.current[pid] : null;
    if (!rcPkg && pid) {
      rcPkg = await getRevenueCatPackageForProductId(pid);
      if (rcPkg) revenueCatPackagesByProductId.current[pid] = rcPkg;
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
      await syncTokensAfterPurchase();
      await fetchPackages();
      setReupCelebration({ message: TOKEN_PURCHASE_REUP_MESSAGE });
    } catch (err: unknown) {
      const e = err as { userCancelled?: boolean };
      if (e?.userCancelled) return;
      Alert.alert('Purchase failed', formatPurchasesError(err));
    } finally {
      setPurchasing(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || !data?.canClaimWeeklyToken) {
      if (!data?.canClaimWeeklyToken) {
        setError('You cannot claim monthly tokens right now.');
        setTimeout(() => setError(''), 5000);
      }
      return;
    }

    setClaiming(true);
    setError('');
    setSuccess('');

    try {
      const result = await api.post<{ message: string; tokensGranted: number }>('/tokens/claim', {});
      const granted = result.tokensGranted ?? 0;
      setSuccess(result.message || `${granted} token(s) claimed successfully!`);
      if (granted > 0) {
        void playTokenClaimSound();
        setWeeklyClaimCelebration(granted);
      }
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
    if (browseLandingStrip) {
      return (
        <View style={styles.browseLandingLoadingOuter}>
          <ActivityIndicator size="small" color="#a78bfa" />
          <Text style={styles.browseLandingLoadingText}>Loading tokens...</Text>
        </View>
      );
    }
    if (compact) {
      const midnight = connectShell === 'midnight';
      if (compactNavbarChrome) {
        return (
          <WebNavbarTokenBadge loading shell={connectShell} onPress={() => void fetchTokens()} />
        );
      }
      return (
        <View
          style={[
            styles.compactContainer,
            midnight && styles.compactContainerMidnight,
            { minWidth: 56, justifyContent: 'center' },
          ]}
        >
          <ActivityIndicator
            size="small"
            color={
              connectShell === 'midnight'
                ? '#fda4af'
                : connectShell === 'sunny'
                  ? '#ea580c'
                  : '#7c3aed'
            }
          />
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading tokens...</Text>
      </View>
    );
  }

  const tokenManagementModals = (
    <>
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

                  {/* Monthly Refill Info */}
                  <View style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>Monthly Refill</Text>
                    {data.canClaimWeeklyToken ? (
                      <LinearGradient colors={['#f8f9ff', '#f0f4ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refillCard}>
                        <Text style={styles.refillEmoji}>✨</Text>
                        <Text style={styles.refillText}>
                          Your monthly tokens are ready! Claim them now to fill up to 7 tokens.
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
                              <Text style={styles.claimButtonText}>✨ Claim Monthly Tokens</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </LinearGradient>
                    ) : data.nextRefillDate ? (
                      <LinearGradient colors={['#f8f9ff', '#f0f4ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refillCard}>
                        <AnimatedHourglass />
                        <Text style={styles.refillText}>
                          Next monthly refill available:
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
                          Claim your first monthly tokens now!
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
                              <Text style={styles.claimButtonText}>✨ Claim Monthly Tokens</Text>
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
                        {'\n'}• Use tokens to match with people
                        {'\n'}• Get 7 tokens monthly
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          <ReupCelebrationModal
            visible={!!reupCelebration}
            message={reupCelebration?.message ?? ''}
            onLetsGo={() => reupCelebration?.onSuccess?.()}
            onRequestClose={() => setReupCelebration(null)}
          />

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

                {isExpoGo && packages.length > 0 && !loadingPackages && (
                  <View style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fef3c7', marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}>
                    <Text style={{ color: '#92400e', fontSize: 14, textAlign: 'center' }}>
                      Install the app from TestFlight or the App Store to see prices and buy tokens.
                    </Text>
                  </View>
                )}

                {!isExpoGo && packages.length > 0 && !loadingPackages && packages.every((p) => p.priceFormatted === '—' || !p.priceFormatted) && (
                  <View style={{ paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 16, marginTop: 8 }}>
                    <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                      Prices couldn't load. Tap Retry to try again, or update to the latest app version.
                    </Text>
                    <TouchableOpacity onPress={() => fetchPackages(true)} style={{ backgroundColor: '#10b981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {loadingPackages ? (
                  <ActivityIndicator size="large" color="#10b981" style={styles.modalLoading} />
                ) : packages.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={[styles.packagePrice, { marginBottom: 8 }]}>In-app purchases coming soon</Text>
                    <Text style={[styles.packagePricePerToken, { textAlign: 'center' }]}>We're switching to a new provider. Stay tuned!</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.packagesList} showsVerticalScrollIndicator={false}>
                    {packages.map((pkg) => {
                      const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                      const isBestValue = pkg.tokens === 7;
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
                            handlePurchase(pkg);
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
                            <Text style={[styles.packagePrice, isBestValue && styles.packagePriceBestValue]}>
                              {normalizePackageFormattedPrice(pkg.priceFormatted || '—')}
                            </Text>
                            <Text style={[styles.packagePricePerToken, isBestValue && styles.packagePricePerTokenBestValue]}>
                              {formatPackagePerTokenLine(pkg.pricePerToken)}
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
      <WeeklyTokenClaimCelebration
        visible={weeklyClaimCelebration != null}
        tokensGranted={weeklyClaimCelebration ?? 0}
        onDismiss={() => setWeeklyClaimCelebration(null)}
      />
    </>
  );

  if (browseLandingStrip) {
    return (
      <>
        <View style={styles.browseLandingTokenWrap}>
          <BrowseConnectLandingTokenStrip
            availableTokens={data.availableTokens}
            canClaimWeeklyToken={data.canClaimWeeklyToken}
            nextRefillDate={data.nextRefillDate}
            connectShell={connectShell}
            claiming={claiming}
            error={error}
            success={success}
            onClaim={handleClaim}
            onBuyPress={() => {
              setShowPurchaseModal(true);
              fetchPackages();
            }}
            onOpenTokenSheet={() => {
              setShowInfoModal(true);
              fetchPackages();
            }}
          />
        </View>
        {tokenManagementModals}
      </>
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
            shell={connectShell}
            onPress={() => {
              setShowInfoModal(true);
              fetchPackages();
            }}
          />
          {tokenManagementModals}
        </>
      );
    }
    
    // Standard compact mode (navbar / global tab badge — tap opens same token modals as web)
    const compactContainerShell =
      connectShell === 'midnight'
        ? styles.compactContainerMidnight
        : connectShell === 'sunny'
          ? styles.compactContainerSunny
          : styles.compactContainerSoft;
    const compactNumberShell =
      connectShell === 'midnight'
        ? styles.compactTokenNumberMidnight
        : connectShell === 'sunny'
          ? styles.compactTokenNumberSunny
          : styles.compactTokenNumberSoft;
    if (compactNavbarChrome) {
      return (
        <>
          <WebNavbarTokenBadge
            count={data.availableTokens}
            shell={connectShell}
            onPress={() => {
              setShowInfoModal(true);
              fetchPackages();
            }}
          />
          {tokenManagementModals}
        </>
      );
    }
    return (
      <>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setShowInfoModal(true);
            fetchPackages();
          }}
          style={[styles.compactContainer, compactContainerShell]}
        >
          <Text style={styles.tokenIcon}>🎫</Text>
          <Text style={[styles.compactTokenNumber, compactNumberShell]}>
            {data.availableTokens}
          </Text>
        </TouchableOpacity>
        {tokenManagementModals}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tokenCount}>
        <Text style={styles.tokenIcon}>🏌️</Text>
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
            <Text style={styles.claimButtonText}>✨ Claim Monthly Tokens</Text>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={styles.cannotClaimText}>
          {data.availableTokens >= 7
            ? 'You already have 7 tokens. Use them to match!'
            : data.nextRefillDate
              ? `Next monthly refill: ${new Date(data.nextRefillDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.`
              : 'You can claim more tokens on your next monthly refill.'}
        </Text>
      )}

      <Text style={styles.infoText}>
        Use tokens to match with people. Get 7 tokens monthly (up to 7 max).
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

            {isExpoGo && packages.length > 0 && !loadingPackages && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fef3c7', marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}>
                <Text style={{ color: '#92400e', fontSize: 14, textAlign: 'center' }}>
                  Install the app from TestFlight or the App Store to see prices and buy tokens.
                </Text>
              </View>
            )}

            {!isExpoGo && packages.length > 0 && !loadingPackages && packages.every((p) => p.priceFormatted === '—' || !p.priceFormatted) && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 12, marginHorizontal: 16, marginTop: 8 }}>
                <Text style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>
                  Prices couldn't load. Tap Retry to try again, or update to the latest app version.
                </Text>
                <TouchableOpacity onPress={() => fetchPackages(true)} style={{ backgroundColor: '#10b981', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {loadingPackages ? (
              <ActivityIndicator size="large" color="#10b981" style={styles.modalLoading} />
            ) : packages.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={[styles.packagePrice, { marginBottom: 8 }]}>In-app purchases coming soon</Text>
                <Text style={[styles.packagePricePerToken, { textAlign: 'center' }]}>We're switching to a new provider. Stay tuned!</Text>
              </View>
            ) : (
              <ScrollView style={styles.packagesList} showsVerticalScrollIndicator={false}>
                {packages.map((pkg) => {
                  const isDisabled = purchasing || pkg.wouldExceedLimit || !pkg.available;
                  const isBestValue = pkg.tokens === 7;
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
                        handlePurchase(pkg);
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
                        <Text style={[styles.packagePrice, isBestValue && styles.packagePriceBestValue]}>
                          {normalizePackageFormattedPrice(pkg.priceFormatted || '—')}
                        </Text>
                        <Text style={[styles.packagePricePerToken, isBestValue && styles.packagePricePerTokenBestValue]}>
                          {formatPackagePerTokenLine(pkg.pricePerToken)}
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
  compactContainerMidnight: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.35)',
  },
  compactContainerSunny: {
    backgroundColor: 'rgba(251, 146, 60, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.38)',
  },
  compactContainerSoft: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.42)',
  },
  compactTokenNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B1538',
    marginLeft: 6,
  },
  compactTokenNumberMidnight: {
    color: '#fda4af',
  },
  compactTokenNumberSunny: {
    color: '#c2410c',
  },
  compactTokenNumberSoft: {
    color: '#6d28d9',
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
  premiumGlyphAndroid: {
    backgroundColor: '#7367dc',
    includeFontPadding: false,
  },
  premiumCountAndroid: {
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
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
  browseLandingLoadingOuter: {
    position: 'relative',
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  /** Android Connect landing: top-right pill (web navbar parity); parent must be `position: 'relative'`. */
  browseLandingNavbarBadgeAnchor: {
    position: 'absolute',
    top: 0,
    right: 12,
    zIndex: 8,
    elevation: 10,
  },
  browseLandingTokenWrap: {
    position: 'relative',
    alignSelf: 'stretch',
    width: '100%',
    // Room for the token card’s perimeter glow
    paddingHorizontal: 3,
    paddingVertical: 3,
    overflow: 'visible',
  },
  browseLandingLoadingText: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '600',
    marginTop: 10,
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
  reupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  reupCardWrap: {
    width: '100%',
    maxWidth: Math.min(SCREEN_WIDTH - 48, 340),
    position: 'relative',
  },
  reupSparkle: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  reupSparkle1: { top: -8, left: -8 },
  reupSparkle2: { top: -12, right: 20 },
  reupSparkle3: { bottom: 40, right: -6 },
  reupCardInner: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  reupCardGradient: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  reupEmoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  reupTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  reupMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  reupButtonWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  reupButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    minWidth: 160,
    alignItems: 'center',
  },
  reupButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#047857',
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

