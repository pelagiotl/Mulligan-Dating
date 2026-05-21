import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  Platform,
  Vibration,
  Modal,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { TouchableOpacity as GestureTouchable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect, useIsFocused, CommonActions } from '@react-navigation/native';
import { setPendingOpenMatchId, clearPendingOpenMatchId } from '../utils/pendingMatchOpen';
import { initiatorMatchIdRef, connectInitiatorAtRef } from '../utils/currentMatchView';
import { navigationRef } from '../navigation/navigationRef';
import { playMatchSound } from '../utils/sounds';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, prefetchToken, ensureTokenPrefetched, clearTokenCache } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import TokenDisplay from '../components/TokenDisplay';
import LaunchCountdownBubble from '../components/LaunchCountdownBubble';
import MatchmakingPausedModal from '../components/MatchmakingPausedModal';
import ConnectLandingValueProps, { ConnectFeatureLabel } from '../components/ConnectLandingValueProps';
import { CONNECT_LANDING_TAGLINE } from '../constants/connectLanding';
import ConnectLandingMark from '../components/ConnectLandingMark';
import MatchCelebration from '../components/MatchCelebration';
import LegalFooter from '../components/LegalFooter';
import NoTokensModal from '../components/NoTokensModal';
import OptimizedImage from '../components/OptimizedImage';
import {
  MIN_PHOTOS_TO_CONNECT,
  getConnectSetupMissing,
  isConnectSetupComplete,
} from '../utils/connectSetup';
import {
  endMatchCelebrationDemoSession,
  isMatchCelebrationDemoSession,
  subscribeMatchCelebrationDemo,
} from '../utils/matchCelebrationDemo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MAX_DISTANCE_OPTIONS: (number | null)[] = [10, 25, 50, 100, 250, 500, null]; // null = Any distance

// Helper function to render location with proper formatting
function renderLocation(location: string | null | undefined) {
  if (!location) return null;
  
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || '';
  const state = locationParts.slice(1).join(', ') || '';
  
  if (!state) {
    return <Text style={styles.location}>📍 {location}</Text>;
  }
  
  return (
    <View style={styles.locationContainer}>
      <Text style={styles.locationEmoji}>📍</Text>
      <View style={styles.locationTextContainer}>
        <Text style={styles.locationCity}>{city}</Text>
        <Text style={styles.locationComma}>, </Text>
        <Text style={styles.locationState}>{state}</Text>
      </View>
    </View>
  );
}

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location?: string;
  bio?: string;
  photoUrl?: string;
  photos?: Photo[];
  interests: string[];
  lookingFor?: string;
  distance?: number | null;
}

/**
 * Scroll padding below Connect landing so the white card + shadow sit above the floating tab bar.
 * Uses full bottom inset on iOS (navigator uses half-inset for bar height only; clearance must not underestimate).
 */
function landingTabBarClearancePx(insetBottom: number): number {
  const iosBar = 56;
  /** Keep in sync with `AppNavigator` Android `tabBarStyle.height` base (42 + insetBottom). */
  const androidBar = 42;
  const tabBarHeight =
    Platform.OS === 'ios'
      ? iosBar + insetBottom
      : androidBar + insetBottom;
  // Extra space so white card + shadow clear the floating tab bar when scrolled to end
  return tabBarHeight + 80;
}

export default function BrowseScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** iPad / large tablets: white Connect card should fill the viewport (not a short strip on gradient). */
  const connectLandingFillTablet =
    windowWidth >= 768 || (Platform.OS === 'ios' && Platform.isPad);
  const connectLandingFillStyles = useMemo(() => {
    if (!connectLandingFillTablet) return undefined;
    const tabClear = landingTabBarClearancePx(insets.bottom);
    const wrapperPadTop = 74;
    const wrapperPadBottom = 36;
    const containerVMargin = 4 + 28;
    const minPageWrapperH = windowHeight - insets.top - tabClear;
    const minWhiteH = Math.max(
      440,
      minPageWrapperH - wrapperPadTop - wrapperPadBottom - containerVMargin
    );
    return {
      // Padding (not margin) on wrapper avoids width:100% + horizontal margin overflow on iPad.
      pageWrapper: {
        minHeight: minPageWrapperH,
        paddingLeft: Math.max(40, insets.left),
        paddingRight: Math.max(40, insets.right),
      },
      container: { flexGrow: 1 as const, minHeight: minWhiteH },
      content: {
        flexGrow: 1 as const,
        minHeight: minWhiteH,
        justifyContent: 'space-between' as const,
      },
    };
  }, [connectLandingFillTablet, windowHeight, insets.top, insets.bottom, insets.left, insets.right]);
  const isFocused = useIsFocused();
  /** useIsFocused() can be false on the first paint; hiding then causes a black screen (transparent scene over default black). */
  const browseWasFocusedRef = useRef(false);
  if (isFocused) browseWasFocusedRef.current = true;
  const hideBrowseWhenBlurred = !isFocused && browseWasFocusedRef.current;
  const { profile: userProfile, user, isAuthenticated, refreshProfile } = useAuth();
  const { mode: connectShellMode } = useConnectShellTheme();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  
  // Profile card animations
  const profileCardScale = useRef(new Animated.Value(0.9)).current;
  const profileCardOpacity = useRef(new Animated.Value(0)).current;
  const profileCardTranslateY = useRef(new Animated.Value(30)).current;
  const profileCardGlow = useRef(new Animated.Value(1)).current;
  const profileCardGlowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const profileCardRotate = useRef(new Animated.Value(0)).current;
  const profileCardTiltX = useRef(new Animated.Value(0)).current;
  const profileCardTiltY = useRef(new Animated.Value(0)).current;
  const profileCardShadow = useRef(new Animated.Value(0)).current;
  
  // Connect button animations
  const connectButtonPulse = useRef(new Animated.Value(1)).current;
  const connectButtonShimmer = useRef(new Animated.Value(0)).current;
  const connectButtonScale = useRef(new Animated.Value(1)).current;
  const connectButtonLoopsRef = useRef<{ pulseLoop: Animated.CompositeAnimation; shimmerLoop: Animated.CompositeAnimation } | null>(null);
  const shouldShowConnectButtonRef = useRef(false);
  const connectSpinnerOpacity = useRef(new Animated.Value(0)).current;
  const connectTextOpacity = useRef(new Animated.Value(1)).current;
  const connectOverlayOpacity = useRef(new Animated.Value(0)).current;
  
  // Header gradient animation
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  
  // Interest tags animations
  const interestTagScales = useRef<{ [key: number]: Animated.Value }>({}).current;
  const interestTagOpacities = useRef<{ [key: number]: Animated.Value }>({}).current;
  const interestTagScaleFallback = useRef(new Animated.Value(0.9)).current;
  const interestTagOpacityFallback = useRef(new Animated.Value(0.9)).current;
  
  // Floating particles for background
  const particleAnimations = useRef<Array<{
    translateY: Animated.Value;
    translateX: Animated.Value;
    opacity: Animated.Value;
    scale: Animated.Value;
  }>>([]).current;
  
  // Photo gallery animations
  const photoScale = useRef(new Animated.Value(1)).current;
  const photoOpacity = useRef(new Animated.Value(1)).current;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false); // Start false so Connect tab is interactive immediately
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const connectPressOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRequestedRef = useRef(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [showNoTokensModal, setShowNoTokensModal] = useState(false);
  const [matchmakingPausedModalVisible, setMatchmakingPausedModalVisible] = useState(false);
  const [showMatchLimitModal, setShowMatchLimitModal] = useState(false);
  const [matchLimitCanExpand, setMatchLimitCanExpand] = useState(false);
  const [matchLimitProfile, setMatchLimitProfile] = useState<Profile | null>(null);
  const [showNoProfilesModal, setShowNoProfilesModal] = useState(false);
  const [noProfilesDistanceMode, setNoProfilesDistanceMode] = useState(false);
  const [noProfilesSelectedDistance, setNoProfilesSelectedDistance] = useState<number | null>(50);
  const [noProfilesCurrentPrefs, setNoProfilesCurrentPrefs] = useState<{ min_age: number; max_age: number | null; preferred_genders: string | string[] | null } | null>(null);
  const [noProfilesUpdating, setNoProfilesUpdating] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<{
    reasons: string[];
    sharedInterests: string[];
    sharedValues: number;
  } | null>(null);
  const [hasFetched, setHasFetched] = useState(true); // Start true so we show landing page immediately, no loading screen
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [browseUnlocked, setBrowseUnlocked] = useState<boolean>(false); // Start as locked (false)
  const [unlocking, setUnlocking] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false); // Track when auto-matching to prevent UI flash
  const [canClaimTokens, setCanClaimTokens] = useState<boolean>(false); // Weekly claim available from API
  const [availableTokens, setAvailableTokens] = useState<number>(0);
  const [photoCount, setPhotoCount] = useState<number | null>(null); // User's photo count (for 5-photo minimum)
  const [photoCountLoading, setPhotoCountLoading] = useState(false); // True while fetching count so we don't briefly show wrong state
  const profileConnectKey = `${(userProfile as { display_name?: string } | null)?.display_name ?? ''}|${userProfile?.displayName ?? ''}|${userProfile?.location ?? ''}`;
  const connectReady = isConnectSetupComplete(userProfile, photoCount);
  const connectMissing = getConnectSetupMissing(userProfile, photoCount);
  const socketRef = useRef<Socket | null>(null);
  const matchIdFromConnectRef = useRef<string | null>(null);
  const openTokenModalRef = useRef<(() => void) | null>(null);
  const performClaimRef = useRef<((opts?: { onSuccess?: () => void; successMessage?: string }) => Promise<void>) | null>(null);
  const unlockErrorHandledRef = useRef(false); // So finally doesn't overwrite browseUnlocked(false) when we show landing after error (e.g. Southern Oregon)
  const lastMeRefreshOnBrowseRef = useRef(0);
  
  // Button animations
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shimmerTranslate = useRef(new Animated.Value(-200)).current;
  
  // Animated gradient colors (matching web version)
  const gradientPosition = useRef(new Animated.Value(0)).current;
  
  // Animated "Discover People" text
  const titleScale = useRef(new Animated.Value(0.9)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;

  // "Use a Mulligan" hint fade-in when landing page is shown
  const landingHintOpacity = useRef(new Animated.Value(0)).current;

  // Claim banner animations (pulse + shimmer feel)
  const claimBannerPulse = useRef(new Animated.Value(1)).current;
  const claimBannerScale = useRef(new Animated.Value(1)).current;

  // Claim banner pulse animation (subtle breath effect)
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(claimBannerPulse, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
        Animated.timing(claimBannerPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [claimBannerPulse]);

  useEffect(() => {
    if (!connecting) {
      connectRequestedRef.current = false;
      connectSpinnerOpacity.setValue(0);
      connectTextOpacity.setValue(1);
      connectOverlayOpacity.setValue(0);
    }
  }, [connecting]);

  useEffect(() => {
    if (isAuthenticated) prefetchToken();
  }, [isAuthenticated]);

  // Prefetch token as soon as a profile is shown (before user taps Connect) — eliminates AsyncStorage read delay
  useEffect(() => {
    if (currentProfile && isAuthenticated) ensureTokenPrefetched();
  }, [currentProfile, isAuthenticated]);

  const refreshConnectLandingEconomy = useCallback(async () => {
    if (!isAuthenticated) {
      setCanClaimTokens(false);
      setAvailableTokens(0);
      return;
    }
    try {
      api.clearCache('/tokens');
      const tokenData = await api.get<{
        availableTokens: number;
        canClaimWeeklyToken: boolean;
        nextRefillDate?: string | null;
      }>('/tokens', false);
      const balance = tokenData.availableTokens ?? 0;
      setAvailableTokens(balance);
      setCanClaimTokens(!!tokenData.canClaimWeeklyToken);
    } catch {
      setCanClaimTokens(false);
      setAvailableTokens(0);
    }
  }, [isAuthenticated]);

  const checkBrowseUnlocked = async () => {
    try {
      // Try to fetch a profile - if we get 403, browsing is locked
      console.log('🔍 Checking browse status...');
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`);
      
      console.log('📊 Browse API response:', { 
        hasProfile: !!data.profile, 
        profile: data.profile ? 'exists' : 'null',
        hasMore: data.hasMore,
        total: data.total
      });
      
      // Only unlock if we actually got a profile (not just empty data)
      // If profile is null, browsing is still locked
      if (data.profile !== null && data.profile !== undefined) {
        console.log('✅ Browsing is unlocked - profile found:', data.profile.displayName);
        setBrowseUnlocked(true);
        return true;
      } else {
        // No profile returned - browsing is locked
        console.log('🔒 No profile returned - browsing is locked');
        setBrowseUnlocked(false);
        return false;
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const errorMessage = err?.message || err?.error || '';
      
      // 403 status means browsing is locked
      if (status === 403) {
        console.log('🔒 Browsing is locked - need to unlock with token');
        setBrowseUnlocked(false);
        return false;
      }
      
      // Check error message for lock-related text
      if (errorMessage.toLowerCase().includes('browsing is locked') || 
          errorMessage.toLowerCase().includes('locked') ||
          errorMessage.toLowerCase().includes('use a token to unlock')) {
        console.log('🔒 Browsing is locked (from error message)');
        setBrowseUnlocked(false);
        return false;
      }
      
      // For other errors (network, etc), don't assume unlocked - show error
      console.error('❌ Browse check error:', err);
      setBrowseUnlocked(false); // Default to locked to be safe
      setError('Failed to check browse status. Please try again.');
      return false;
    }
  };

  const handleUnlockBrowse = useCallback(async () => {
    if (unlocking) return;

    if (user?.matchmakingEnabled === false) {
      setMatchmakingPausedModalVisible(true);
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticated || !user) {
      setError('Please log in first');
      setTimeout(() => setError(''), 5000);
      return;
    }
    
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      setError('Session expired. Please log in again.');
      setTimeout(() => setError(''), 5000);
      return;
    }

    let count = photoCount;
    if (count === null) {
      try {
        const data = await api.get<{ photos: unknown[] }>('/photos/me', false);
        count = Array.isArray(data?.photos) ? data.photos.length : 0;
        setPhotoCount(count);
      } catch {
        count = 0;
      }
    }
    const missing = getConnectSetupMissing(userProfile, count);
    if (missing.length > 0) {
      const first = missing[0];
      const msg =
        first === 'name'
          ? 'Add your name in Settings (at least 2 characters) before you can Connect.'
          : first === 'location'
            ? 'Add your city and state on your Profile (e.g. Medford, Oregon) before you can Connect.'
            : `Add at least ${MIN_PHOTOS_TO_CONNECT} photos on your Profile before you can Connect.`;
      Alert.alert('Finish your profile', msg, [
        {
          text: first === 'name' ? 'Open Settings' : 'Open Profile',
          onPress: () => {
            if (first === 'name') (navigation as any).navigate('Settings');
            else (navigation as any).navigate('MyProfile', first === 'photos' ? { scrollToPhotos: true } : undefined);
          },
        },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    
    // Guard: do not enter unlock/auto-match flow when user has no tokens.
    // This keeps the user on landing and shows the no-tokens modal immediately.
    try {
      const tokenData = await api.get<{ availableTokens: number; canClaimWeeklyToken: boolean }>('/tokens', false);
      const balance = tokenData.availableTokens || 0;
      setAvailableTokens(balance);
      setCanClaimTokens(!!tokenData.canClaimWeeklyToken);
      if (balance <= 0) {
        setShowNoTokensModal(true);
        return;
      }
    } catch {
      // If token check fails, continue and let backend handle with a clear API error.
    }

    setUnlocking(true);
    setError('');
    setIsAutoMatching(true); // Mark that we're auto-matching to prevent UI flash

    try {
      await api.post('/users/unlock-browse', {});
      // DON'T set browseUnlocked yet - wait until after match is created
      
      // Fetch the first profile after unlocking (skip cache so we get a NEW profile, not the one just matched)
      setLoading(true);
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`, false);

          if (data.profile) {
            // Connect immediately — skip photos fetch to speed up match; celebration shows placeholder if no photo
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
              setLoading(false);
              return;
            }
            setCurrentProfile(data.profile); // So we never show blank if connect returns no matchId or fails
            try {
              await handleConnect(data.profile);
            } finally {
              setLoading(false);
            }
            setTimeout(() => {
              setBrowseUnlocked(true);
              setIsAutoMatching(false);
            }, 200);
          } else {
            // No profiles available - show notification and stay on landing page
            console.log('⚠️ No profiles available to match with');
            // Reset all states first - do this synchronously
            setCurrentProfile(null);
            setHasMore(data.hasMore);
            setIsAutoMatching(false);
            setUnlocking(false);
            setLoading(false);
            // Explicitly set browseUnlocked to false to show landing page
            setBrowseUnlocked(false);
            console.log('🔄 Set browseUnlocked to false, should show landing page');
            // Show custom "no profiles available" modal
            setTimeout(() => setShowNoProfilesModal(true), 100);
            return; // Exit early to prevent any further state changes
          }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to unlock browsing. Please try again.';
      const errorLower = errorMessage.toLowerCase();

      if (err?.status === 403 && err?.code === 'MATCHMAKING_DISABLED') {
        unlockErrorHandledRef.current = true;
        setIsAutoMatching(false);
        setLoading(false);
        setBrowseUnlocked(false);
        setCurrentProfile(null);
        void refreshProfile();
        setMatchmakingPausedModalVisible(true);
        return;
      }

      if (err?.status === 400 && err?.code === 'CONNECT_SETUP_INCOMPLETE') {
        unlockErrorHandledRef.current = true;
        setIsAutoMatching(false);
        setLoading(false);
        setBrowseUnlocked(false);
        setCurrentProfile(null);
        const missing = Array.isArray((err as any).missing) ? (err as any).missing as string[] : [];
        const first = missing[0];
        Alert.alert('Finish your profile', errorMessage, [
          {
            text: first === 'name' ? 'Open Settings' : 'Open Profile',
            onPress: () => {
              if (first === 'name') (navigation as any).navigate('Settings');
              else (navigation as any).navigate('MyProfile', first === 'photos' ? { scrollToPhotos: true } : undefined);
            },
          },
          { text: 'OK', style: 'cancel' },
        ]);
        return;
      }
      
      // If already unlocked, this is expected - just continue to fetch and match
      if (errorLower.includes('already unlocked') || errorLower.includes('browsing is already unlocked')) {
        console.log('✅ Browsing already unlocked, fetching and matching with first profile...');
        setIsAutoMatching(true); // Mark that we're auto-matching
        // DON'T set browseUnlocked yet - wait until after match is created
        setLoading(true);
        try {
          const data = await api.get<{
            profile: Profile | null;
            hasMore: boolean;
            offset: number;
            total: number;
          }>(`/users/browse?offset=0`, false);

          console.log('📊 Browse API response:', { 
            hasProfile: !!data.profile, 
            profile: data.profile ? data.profile.displayName : 'null',
            hasMore: data.hasMore,
            total: data.total
          });

          if (data.profile) {
            // Connect immediately — skip photos fetch to speed up match
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
              setLoading(false);
              return;
            }
            setCurrentProfile(data.profile);
            try {
              await handleConnect(data.profile);
            } finally {
              setLoading(false);
            }
            setTimeout(() => {
              setBrowseUnlocked(true);
              setIsAutoMatching(false);
            }, 200);
          } else {
            // No profiles available - show notification and stay on landing page
            console.log('⚠️ No profiles available to match with');
            // Reset all states first
            setCurrentProfile(null);
            setHasMore(data.hasMore);
            setIsAutoMatching(false);
            setUnlocking(false);
            setLoading(false);
            // Explicitly set browseUnlocked to false to show landing page
            setBrowseUnlocked(false);
            console.log('🔄 Set browseUnlocked to false, should show landing page');
            // Show custom "no profiles available" modal
            setTimeout(() => setShowNoProfilesModal(true), 100);
            return; // Exit early to prevent any further state changes
          }
        } catch (fetchErr: any) {
          if (fetchErr?.status === 403 && fetchErr?.code === 'MATCHMAKING_DISABLED') {
            unlockErrorHandledRef.current = true;
            setIsAutoMatching(false);
            setLoading(false);
            setBrowseUnlocked(false);
            setCurrentProfile(null);
            void refreshProfile();
            setMatchmakingPausedModalVisible(true);
            return;
          }
          console.error('❌ Fetch profile error:', fetchErr);
          setError(fetchErr?.message || 'Failed to load profiles');
          setTimeout(() => setError(''), 8000);
          setIsAutoMatching(false);
          setLoading(false);
          setBrowseUnlocked(true); // Unlock so error can be shown
        }
      } else {
        unlockErrorHandledRef.current = true; // So finally keeps us on landing page
        // Region lock (403) is logged as warn in api.ts; log other errors here
        const isRegionLock = err?.status === 403 || errorLower.includes('southern oregon') || errorLower.includes('only available for people');
        if (!isRegionLock) {
          console.error('❌ Unlock browse error:', err);
        }
        
        // Check if it's an authentication error
        if (errorLower.includes('authentication required') || errorLower.includes('authentication')) {
          setError('Session expired. Please log in again.');
          clearTokenCache();
          await AsyncStorage.removeItem('token');
          setTimeout(() => setError(''), 5000);
          return;
        }
        
        setError(errorMessage);
        setTimeout(() => setError(''), 8000);
        setIsAutoMatching(false);
        setLoading(false);
        setCurrentProfile(null);
        // Stay on landing page so user can tap Connect again (don't set browseUnlocked true)
        setBrowseUnlocked(false);
        // Show Alert so user sees the message (error UI is only in non-landing branch)
        if (isRegionLock) {
          Alert.alert(
            'Matching unavailable',
            errorMessage,
            [{ text: 'OK' }]
          );
        }
      }
    } finally {
      setUnlocking(false);
      if (unlockErrorHandledRef.current) {
        unlockErrorHandledRef.current = false;
        setBrowseUnlocked(false); // Keep landing page after region/error
      } else if (!isAutoMatching && !error) {
        setBrowseUnlocked(true);
      }
    }
  }, [unlocking, isAuthenticated, user, userProfile, photoCount, handleConnect, refreshProfile, navigation]);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=${offset}`);

      console.log('📊 Browse API response:', { 
        hasProfile: !!data.profile, 
        profile: data.profile ? data.profile.displayName : 'null',
        hasMore: data.hasMore,
        total: data.total,
        offset
      });

      // If we get here, browsing is unlocked
      setBrowseUnlocked(true);

      if (data.profile) {
        // Fetch photos for this profile
        try {
          const photosData = await api.get<{ photos: Photo[] }>(
            `/photos/profile/${data.profile.id}`
          );
          data.profile.photos = photosData.photos;
        } catch (photoErr) {
          data.profile.photos = [];
        }
        setCurrentPhotoIndex(0);
      }

      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
      
      // Animate profile card entrance when new profile loads
      if (data.profile) {
        // Reset animation values
        profileCardScale.setValue(0.9);
        profileCardOpacity.setValue(0);
        profileCardTranslateY.setValue(30);
        profileCardGlow.setValue(1);
        
        // Initialize interest tag scales and opacities with staggered entrance
        data.profile.interests.slice(0, 6).forEach((_, idx) => {
          if (!interestTagScales[idx]) {
            interestTagScales[idx] = new Animated.Value(0.8);
          }
          if (!interestTagOpacities[idx]) {
            interestTagOpacities[idx] = new Animated.Value(0);
          }
          // Staggered entrance animation for interest tags
          Animated.sequence([
            Animated.delay(idx * 100),
            Animated.parallel([
              Animated.spring(interestTagScales[idx], {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
              }),
              Animated.timing(interestTagOpacities[idx], {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
            ]),
          ]).start();
        });
        
        // Animate profile card entrance
        Animated.parallel([
          Animated.spring(profileCardScale, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(profileCardOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(profileCardTranslateY, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Continuous glow pulse — use native driver so it doesn't block touch
        profileCardGlowLoopRef.current?.stop();
        const glowLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(profileCardGlow, { toValue: 1.15, duration: 2000, useNativeDriver: true }),
            Animated.timing(profileCardGlow, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ])
        );
        profileCardGlowLoopRef.current = glowLoop;
        glowLoop.start();

        // Card rotation removed — reduces animation load for snappier tab
        profileCardRotate.setValue(0);
        
        // Connect button pulse/shimmer started in useEffect when tab is focused (so they restart when returning to tab)
        
        // Photo entrance animation
        photoScale.setValue(0.95);
        photoOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(photoScale, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(photoOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Header gradient: static — one less loop for snappier tab
        headerGradientPos.setValue(0.2);
      }
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.error ||
        err?.message ||
        'Failed to load profiles';

      const errorLower = errorMessage.toLowerCase();
      const status = err?.status || err?.response?.status;

      // Check if browsing is locked (403 status)
      if (status === 403) {
        console.log('🔒 Browse endpoint returned 403 - browsing is locked');
        setBrowseUnlocked(false);
        setCurrentProfile(null);
        setError('');
        setLoading(false);
        return;
      }

      if (
        status === 400 ||
        errorLower.includes('complete your profile') ||
        errorLower.includes('please complete your profile') ||
        (errorLower.includes('profile') &&
          (errorLower.includes('not found') || errorLower.includes('complete')))
      ) {
        setCurrentProfile(null);
        setError('');
      } else {
        setError(errorMessage);
        setCurrentProfile(null);
      }
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [offset]);

  useEffect(() => {
    // Always start with landing page - don't check unlock status on mount
    // User must explicitly unlock browsing to see profiles
    if (!hasFetched) {
      console.log('🔍 Initial load - showing landing page (browsing locked by default)');
      setBrowseUnlocked(false);
      setHasFetched(true);
      setLoading(false);
    }
  }, []);

  // On focus: only refresh token/claim state so returning to tab keeps current profile and Connect button animations
  useFocusEffect(
    useCallback(() => {
      void refreshConnectLandingEconomy();
      prefetchToken();
    }, [refreshConnectLandingEconomy])
  );

  const clearCelebrationAndConnectingState = useCallback(() => {
    endMatchCelebrationDemoSession();
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setMatchId(null);
    matchIdFromConnectRef.current = null;
    initiatorMatchIdRef.current = null;
    connectInitiatorAtRef.current = null;
    setMatchExplanation(null);
    setIsAutoMatching(false);
    setUnlocking(false);
    clearPendingOpenMatchId();
    setBrowseUnlocked(false);
    setCurrentProfile(null);
    connectRequestedRef.current = false;
    setConnecting(false);
    connectSpinnerOpacity.setValue(0);
    connectTextOpacity.setValue(1);
    connectOverlayOpacity.setValue(0);
  }, []);

  const launchMatchCelebrationDemo = useCallback(() => {
    if (!__DEV__) return;
    const demoPhoto =
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80';
    setMatchedProfile({
      id: 'demo-profile',
      userId: 'demo-user',
      displayName: 'Alex',
      age: 28,
      gender: 'woman',
      location: 'Portland, OR',
      bio: 'Preview match for celebration QA.',
      photoUrl: demoPhoto,
      photos: [
        {
          id: 'demo-photo',
          url: demoPhoto,
          displayOrder: 0,
          isPrimary: true,
        },
      ],
      interests: ['Hiking', 'Coffee', 'Live music'],
      lookingFor: 'Relationship',
    });
    setMatchExplanation({
      reasons: ['Shared interests in outdoors and music', 'Similar relationship goals'],
      sharedInterests: ['Hiking', 'Coffee'],
      sharedValues: 3,
    });
    setMatchId(null);
    setShowMatchCelebration(true);
    setTimeout(() => setMatchId('dev-celebration-demo'), 1200);
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    return subscribeMatchCelebrationDemo(launchMatchCelebrationDemo);
  }, [launchMatchCelebrationDemo]);

  // When navigated with resetToLanding (e.g. "Back to Connect" from celebration), show Connect landing page
  useFocusEffect(
    useCallback(() => {
      const params = route.params as { resetToLanding?: boolean } | undefined;
      if (!params?.resetToLanding) return;
      clearCelebrationAndConnectingState();
      navigation.setParams({ resetToLanding: undefined });
    }, [route.params, navigation, clearCelebrationAndConnectingState])
  );

  // When already on Browse and params get resetToLanding, clear celebration so Modal unmounts and doesn't block touches
  useEffect(() => {
    const params = route.params as { resetToLanding?: boolean } | undefined;
    if (!params?.resetToLanding) return;
    clearCelebrationAndConnectingState();
    navigation.setParams({ resetToLanding: undefined });
  }, [route.params, navigation, clearCelebrationAndConnectingState]);

  // When user returns to Connect tab with no profile (e.g. after "no one to match", or "all caught up"), show landing
  // so they always see the Connect button instead of a blank or empty state.
  const userProfileId = userProfile?.id;
  useFocusEffect(
    useCallback(() => {
      if (isMatchCelebrationDemoSession() || showMatchCelebration) return;
      if (currentProfile === null && !loading && !unlocking && userProfileId) {
        clearCelebrationAndConnectingState();
      }
    }, [
      currentProfile,
      loading,
      unlocking,
      userProfileId,
      showMatchCelebration,
      clearCelebrationAndConnectingState,
    ])
  );

  // Fetch user's photo count when on landing page (for 5-photo minimum to Connect)
  // Refetch when tab is focused so count updates after user adds photos on Profile tab
  useEffect(() => {
    if (!showLandingPage || !isAuthenticated || !isFocused) return;
    let cancelled = false;
    setPhotoCountLoading(true);
    (async () => {
      try {
        const data = await api.get<{ photos: { id: string }[] }>('/photos/me', false);
        if (!cancelled && Array.isArray(data?.photos)) {
          setPhotoCount(data.photos.length);
        }
      } catch {
        if (!cancelled) setPhotoCount(0);
      } finally {
        if (!cancelled) setPhotoCountLoading(false);
      }
    })();
    return () => { cancelled = true; setPhotoCountLoading(false); };
  }, [showLandingPage, isAuthenticated, isFocused, profileConnectKey]);

  useEffect(() => {
    if (hasFetched && offset > 0) {
      fetchProfile();
    }
  }, [offset]);

  // Initialize socket connection
  useEffect(() => {
    let socket: Socket | null = null;

    const initSocket = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !user?.id) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Browse: Connected to WebSocket server');
      });

      socket.on('disconnect', () => {
        console.log('❌ Browse: Disconnected from WebSocket server');
      });

      // When User B gets a new match (socket), go straight to big MatchCelebration. Skip if we're the connect initiator (we already show it).
      socket.on('new_match', (data: {
        matchId: string;
        otherUserId: string;
        otherUserName: string;
        message: string;
        stage: string;
      }) => {
        if (matchIdFromConnectRef.current === data.matchId) return;
        if (data.matchId && navigationRef.current?.isReady()) {
          navigationRef.current.navigate('MainTabs' as never, {
            screen: 'Matches',
            params: { matchId: data.matchId, showMatchCelebration: true, matchName: data.otherUserName || 'Someone' },
          } as never);
        }
      });

      // In-app message notification (Alert + sound) is handled by AuthContext's dedicated socket
      // so it works from any tab. No handler needed here.
    };

    initSocket();

    return () => {
      const s = socketRef.current;
      if (s) s.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  // Pick up server-side matchmaking flag without an app update (GET /auth/me).
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) return;
      const now = Date.now();
      if (now - lastMeRefreshOnBrowseRef.current < 45_000) return;
      lastMeRefreshOnBrowseRef.current = now;
      api.clearCache('/auth/me');
      void refreshProfile();
    }, [isAuthenticated, refreshProfile]),
  );

  const needsProfile = !userProfile && !loading;
  const matchmakingPaused = !!(user && user.matchmakingEnabled === false);
  const matchmakingPausedMessage =
    (user?.matchmakingDisabledMessage && String(user.matchmakingDisabledMessage).trim()) || undefined;
  const hasActiveProfile = !!(currentProfile?.id && currentProfile?.userId);

  // Show landing page when: browsing is locked, auto-matching, no profile to show, or server paused matchmaking
  const showLandingPage =
    (!needsProfile && !showMatchCelebration) &&
    ((browseUnlocked === false || isAutoMatching) || (!hasActiveProfile && !loading) || matchmakingPaused);

  const openMatchmakingPausedModal = useCallback(() => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(30);
    }
    setMatchmakingPausedModalVisible(true);
  }, []);

  const handleLandingConnectPress = useCallback(() => {
    if (unlocking) return;
    if (matchmakingPaused) {
      openMatchmakingPausedModal();
      return;
    }
    if (connectReady) {
      void handleUnlockBrowse();
      return;
    }
    if (photoCount === null) {
      void handleUnlockBrowse();
      return;
    }
    const m = connectMissing[0];
    if (m === 'name') (navigation as any).navigate('Settings');
    else if (m === 'location') (navigation as any).navigate('MyProfile');
    else if (m === 'photos') (navigation as any).navigate('MyProfile', { scrollToPhotos: true });
  }, [
    unlocking,
    matchmakingPaused,
    openMatchmakingPausedModal,
    connectReady,
    handleUnlockBrowse,
    photoCount,
    connectMissing,
    navigation,
  ]);

  // Button pulse animation (only when landing page is shown)
  // MUST be before any early returns
  useEffect(() => {
    let buttonLoop: Animated.CompositeAnimation | null = null;
    let shimmerLoop: Animated.CompositeAnimation | null = null;
    if (showLandingPage && !unlocking) {
      // Animate "Discover People" title
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.spring(titleScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();

      // "Use a Mulligan" hint: gentle fade-in after a short delay
      landingHintOpacity.setValue(0);
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(landingHintOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]).start();

      buttonLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(buttonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      buttonLoop.start();

      shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerTranslate, { toValue: 400, duration: 2000, useNativeDriver: true }),
          Animated.timing(shimmerTranslate, { toValue: -200, duration: 0, useNativeDriver: true }),
        ])
      );
      shimmerLoop.start();
    } else {
      buttonPulse.setValue(1);
      shimmerTranslate.setValue(-200);
      gradientPosition.setValue(0);
      titleScale.setValue(0.9);
      titleOpacity.setValue(0);
      titleTranslateY.setValue(20);
      landingHintOpacity.setValue(0);
    }
    return () => {
      buttonLoop?.stop();
      shimmerLoop?.stop();
    };
  }, [showLandingPage, unlocking, landingHintOpacity]);

  // Connect button pulse/shimmer — always stop then start so tab blur (opacity 0 on Android) cannot leave stale "running" refs.
  const startConnectButtonAnimations = useCallback(() => {
    const loops = connectButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      connectButtonLoopsRef.current = null;
    }
    connectButtonPulse.setValue(1);
    connectButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(connectButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectButtonShimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(connectButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    connectButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, [connectButtonPulse, connectButtonShimmer]);

  const stopConnectButtonAnimations = useCallback(() => {
    const loops = connectButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      connectButtonLoopsRef.current = null;
    }
    connectButtonPulse.setValue(1);
    connectButtonShimmer.setValue(0);
  }, []);

  const scheduleConnectButtonAnimationStart = useCallback(() => {
    if (!shouldShowConnectButtonRef.current) return () => {};
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const delayMs = Platform.OS === 'android' ? 80 : 0;
    const task = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        if (!cancelled && shouldShowConnectButtonRef.current) {
          startConnectButtonAnimations();
        }
      }, delayMs);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [startConnectButtonAnimations]);

  const handleConnectButtonLayout = useCallback(() => {
    scheduleConnectButtonAnimationStart();
  }, [scheduleConnectButtonAnimationStart]);

  const openNoProfilesDistancePicker = useCallback(async () => {
    setNoProfilesUpdating(true);
    try {
      const data = await api.get<{ preferences: { min_age: number; max_age: number | null; preferred_genders: string | string[] | null; max_distance: number | null } | null }>('/profile');
      const prefs = data?.preferences;
      if (prefs) {
        setNoProfilesCurrentPrefs({ min_age: prefs.min_age, max_age: prefs.max_age, preferred_genders: prefs.preferred_genders });
        setNoProfilesSelectedDistance(prefs.max_distance ?? 50);
      } else {
        setNoProfilesSelectedDistance(50);
      }
      setNoProfilesDistanceMode(true);
    } catch {
      Alert.alert('Error', 'Could not load preferences. Try again.');
    } finally {
      setNoProfilesUpdating(false);
    }
  }, []);

  const saveNoProfilesDistance = useCallback(async () => {
    setNoProfilesUpdating(true);
    try {
      const prefs = noProfilesCurrentPrefs;
      const preferredGenders = prefs?.preferred_genders == null
        ? null
        : Array.isArray(prefs.preferred_genders)
          ? prefs.preferred_genders
          : (typeof prefs.preferred_genders === 'string' ? (() => {
              try { return JSON.parse(prefs.preferred_genders as string) as string[]; } catch { return null; }
            })() : null);
      await api.put('/profile/preferences', {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: preferredGenders ?? null,
        maxDistance: noProfilesSelectedDistance,
      });
      setShowNoProfilesModal(false);
      setNoProfilesDistanceMode(false);
      setBrowseUnlocked(false);
      setIsAutoMatching(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update distance.');
    } finally {
      setNoProfilesUpdating(false);
    }
  }, [noProfilesCurrentPrefs, noProfilesSelectedDistance]);

  useEffect(() => {
    const visible = hasActiveProfile && !showLandingPage && !needsProfile && !loading;
    shouldShowConnectButtonRef.current = visible;
    if (!visible) {
      stopConnectButtonAnimations();
      return;
    }
    if (isFocused) {
      const cancel = scheduleConnectButtonAnimationStart();
      return () => {
        cancel?.();
        stopConnectButtonAnimations();
      };
    }
    return () => stopConnectButtonAnimations();
  }, [
    hasActiveProfile,
    showLandingPage,
    needsProfile,
    loading,
    isFocused,
    stopConnectButtonAnimations,
    scheduleConnectButtonAnimationStart,
  ]);

  const shouldShowConnectButton = hasActiveProfile && !showLandingPage && !needsProfile && !loading;
  shouldShowConnectButtonRef.current = shouldShowConnectButton;

  // Tab blur hides this screen (opacity 0); Android pauses native-driver loops. Stop on blur, restart after focus when visible again.
  useFocusEffect(
    useCallback(() => {
      const cancelScheduled = scheduleConnectButtonAnimationStart();
      return () => {
        cancelScheduled?.();
        stopConnectButtonAnimations();
      };
    }, [scheduleConnectButtonAnimationStart, stopConnectButtonAnimations])
  );

  const handleConnect = useCallback((profile: Profile, expandSlot?: boolean) => {
    if (user?.matchmakingEnabled === false) {
      setMatchmakingPausedModalVisible(true);
      return;
    }
    setError('');
    setConnecting(true);
    connectRequestedRef.current = true;
    connectInitiatorAtRef.current = Date.now(); // Suppress "matched with you" push for initiator (celebration only)
    connectOverlayOpacity.setValue(1);
    connectSpinnerOpacity.setValue(1);
    connectTextOpacity.setValue(0);

    // Show celebration loading modal immediately (reveal when API returns)
    setMatchedProfile(profile);
    setMatchId(null);
    setMatchExplanation(null);
    setShowMatchCelebration(true);

    type ConnectResult = {
      message?: string;
      isMutual?: boolean;
      matchId: string;
      stage?: string;
      existingMatch?: boolean;
      explanation?: { reasons: string[]; sharedInterests: string[]; sharedValues: number } | null;
    };

    api
      .post<ConnectResult>('/matches/connect', { targetUserId: profile.userId, expandSlot: expandSlot || false })
      .then((result) => {
        connectRequestedRef.current = false;
        connectSpinnerOpacity.setValue(0);
        connectTextOpacity.setValue(1);
        connectOverlayOpacity.setValue(0);
        setConnecting(false);
        if (!result?.matchId) {
          setShowMatchCelebration(false);
          setMatchedProfile(null);
          setMatchId(null);
          setError('Connection did not complete. Please try again.');
          setTimeout(() => setError(''), 6000);
          return;
        }
        if (result.existingMatch) {
          setShowMatchCelebration(false);
          setMatchedProfile(null);
          setMatchId(null);
          setCurrentProfile(null);
          setPendingOpenMatchId(result.matchId);
          if (navigationRef.current?.isReady()) {
            navigationRef.current.dispatch(
              CommonActions.navigate({
                name: 'MainTabs',
                params: { screen: 'Matches', params: { matchId: result.matchId } },
              })
            );
          } else {
            navigation.navigate('Matches' as never, { matchId: result.matchId } as never);
          }
          return;
        }
        // Match succeeded: set matchId so MatchCelebration (revealWhenMatchIdReady) reveals the celebration
        setMatchId(result.matchId);
        matchIdFromConnectRef.current = result.matchId;
        initiatorMatchIdRef.current = result.matchId; // So AuthContext skips in-app match notification (celebration only for User A)
        setMatchExplanation(result.explanation ?? null);
        // If profile has no photo (e.g. browse fast path didn't include it), fetch so celebration shows User B's picture
        const hasPhoto = profile.photoUrl || (profile.photos && profile.photos.length > 0);
        if (!hasPhoto && profile.id) {
          api.get<{ photos: Photo[] }>(`/photos/profile/${profile.id}`, false).then((photosData) => {
            if (photosData?.photos?.length) {
              const primary = photosData.photos.find((p) => p.isPrimary) || photosData.photos[0];
              setMatchedProfile((prev) => (prev ? { ...prev, photos: photosData.photos, photoUrl: primary?.url ?? prev.photoUrl } : null));
            }
          }).catch(() => {});
        }
      })
      .catch((err: any) => {
        // Rollback optimistic state so user can retry
        setShowMatchCelebration(false);
        setMatchedProfile(null);
        setMatchId(null);
        matchIdFromConnectRef.current = null;
        initiatorMatchIdRef.current = null;
        connectInitiatorAtRef.current = null;
        setMatchExplanation(null);
        setCurrentProfile(profile);
        setConnecting(false);
        connectRequestedRef.current = false;
        connectSpinnerOpacity.setValue(0);
        connectTextOpacity.setValue(1);
        connectOverlayOpacity.setValue(0);

        let errorMessage = 'Failed to connect. Please try again.';

        if (err instanceof Error && 'status' in err) {
          const apiErr = err as Error & { status: number; code?: string; canExpand?: boolean; currentLimit?: number; newLimit?: number };
          if (apiErr.status === 403 && apiErr.code === 'MATCHMAKING_DISABLED') {
            setCurrentProfile(null);
            setBrowseUnlocked(false);
            if (isAutoMatching) setIsAutoMatching(false);
            void refreshProfile();
            setMatchmakingPausedModalVisible(true);
            return;
          }
          if (apiErr.status === 400 && apiErr.code === 'CONNECT_SETUP_INCOMPLETE') {
            const missing = Array.isArray((apiErr as any).missing) ? ((apiErr as any).missing as string[]) : [];
            const first = missing[0];
            Alert.alert('Finish your profile', err.message || 'Complete your profile to connect.', [
              {
                text: first === 'name' ? 'Open Settings' : 'Open Profile',
                onPress: () => {
                  if (first === 'name') (navigation as any).navigate('Settings');
                  else (navigation as any).navigate('MyProfile', first === 'photos' ? { scrollToPhotos: true } : undefined);
                },
              },
              { text: 'OK', style: 'cancel' },
            ]);
            return;
          }
          if (apiErr.status === 400 && apiErr.code === 'AT_MATCH_LIMIT') {
            setMatchLimitCanExpand(!!apiErr.canExpand);
            setMatchLimitProfile(profile);
            setShowMatchLimitModal(true);
            return;
          }
          if (
            apiErr.status === 400 &&
            (String(err.message || '').toLowerCase().includes('no tokens') ||
              String(err.message || '').toLowerCase().includes('claim your weekly token') ||
              (err as any).code === 'NO_TOKENS')
          ) {
            setShowNoTokensModal(true);
            if (isAutoMatching) {
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
            }
            return;
          }
          // Distance preference: person is outside range — go back to landing so user can tap Connect for a new profile
          if (apiErr.status === 400 && (apiErr.code === 'DISTANCE_EXCEEDS_YOUR_MAX' || apiErr.code === 'DISTANCE_EXCEEDS_THEIR_MAX')) {
            setCurrentProfile(null);
            setBrowseUnlocked(false);
            if (isAutoMatching) {
              setIsAutoMatching(false);
            }
            return;
          }
          errorMessage =
            err.message ||
            'Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.';
          if (apiErr.status === 401 || apiErr.status === 403) {
            errorMessage = 'Session expired. Please log in again.';
            AsyncStorage.removeItem('token');
          } else if (apiErr.status === 404) {
            errorMessage = 'Profile not found. Please refresh and try again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
        const lower = String(errorMessage).toLowerCase();
        if (
          lower.includes('authentication required') ||
          lower.includes('invalid or expired token') ||
          lower.includes('authentication')
        ) {
          errorMessage = 'Session expired. Please log in again.';
          clearTokenCache();
          AsyncStorage.removeItem('token');
        }
        setError(errorMessage);
        setTimeout(() => setError(''), 8000);
        if (isAutoMatching) {
          setIsAutoMatching(false);
          setBrowseUnlocked(true);
        }
      });
  }, [isAutoMatching, user, refreshProfile, navigation]);

  const handleCelebrationClose = useCallback(() => {
    clearCelebrationAndConnectingState();
  }, [clearCelebrationAndConnectingState]);

  const activeProfile = hasActiveProfile ? currentProfile : null;
  const photos = activeProfile?.photos || [];
  const primaryPhoto = photos.find((p) => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : activeProfile?.photoUrl
    ? getPhotoUrl(activeProfile.photoUrl)
    : null;

  // Stop profile card glow loop when tab loses focus to avoid leaked native animation callbacks
  useEffect(() => {
    if (!isFocused) {
      profileCardGlowLoopRef.current?.stop();
      profileCardGlowLoopRef.current = null;
    }
  }, [isFocused]);

  const showConnectButton = hasActiveProfile && !showLandingPage && !needsProfile && !loading;

  // Only show initial loading screen if we're not auto-matching (auto-matching should show landing page)
  if (loading && !hasFetched && !isAutoMatching) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Finding Amazing People</Text>
        <Text style={styles.loadingSubtitle}>Searching for your perfect match</Text>
      </View>
    );
  }

  const showClaimTokenBanner = canClaimTokens && availableTokens <= 0;

  const claimTokenBannerEl =
    showClaimTokenBanner ? (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            if (Platform.OS === 'ios') Vibration.vibrate([0, 30]);
            else Vibration.vibrate(30);
            performClaimRef.current?.({
              onSuccess: () => {
                setCanClaimTokens(false);
                api.clearCache('/tokens');
                void refreshConnectLandingEconomy();
                setBrowseUnlocked(false);
                setCurrentProfile(null);
                setHasMore(true);
              },
              successMessage: "Congrats! You've been officially reupped and are ready to start matching! 🤑",
            });
          }}
          onPressIn={() => {
            Animated.spring(claimBannerScale, { toValue: 0.95, useNativeDriver: true }).start();
          }}
          onPressOut={() => {
            Animated.spring(claimBannerScale, { toValue: 1, useNativeDriver: true }).start();
          }}
        >
          <Animated.View
            style={[
              styles.claimTokenBanner,
              {
                transform: [
                  { scale: Animated.multiply(claimBannerPulse, claimBannerScale) },
                ],
              },
            ]}
          >
            <Text style={styles.claimTokenText}>Claim your Mulligans 😉</Text>
          </Animated.View>
        </TouchableOpacity>
      ) : null;

  const mulliganTokenControls = (
    <View style={styles.tokenOverlayInner}>
      {claimTokenBannerEl}
      <TokenDisplay
        compact={true}
        premium={true}
        connectShell={connectShellMode}
        openModalRef={openTokenModalRef}
        performClaimRef={performClaimRef}
        onTokensUpdated={refreshConnectLandingEconomy}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        showLandingPage && { backgroundColor: 'transparent' },
        hideBrowseWhenBlurred && { opacity: 0, pointerEvents: 'none' as const },
      ]}
    >
      {/* Beautiful gradient background (matching web version) - full screen behind everything */}
      {showLandingPage && (
        <LinearGradient
          colors={
            connectShellMode === 'midnight'
              ? ['#15102a', '#221a32', '#1a1528', '#0f172a']
              : connectShellMode === 'sunny'
                ? ['#38bdf8', '#fcd34d', '#fb923c', '#fda4af', '#fef08a']
                : ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        />
      )}

      {/* Token strip: fixed overlay when browsing; inside white card on Connect landing */}
      {!showLandingPage && (
        <View style={styles.tokenOverlay} pointerEvents="box-none">
          {mulliganTokenControls}
        </View>
      )}

      <ScrollView 
        style={[styles.scrollView, showLandingPage && { backgroundColor: 'transparent' }]} 
        contentContainerStyle={[
          styles.contentContainer,
          showLandingPage && {
            paddingBottom: landingTabBarClearancePx(insets.bottom),
          },
          !showLandingPage && !needsProfile && hasActiveProfile && !loading && { paddingBottom: 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        {/* Match Notification */}
        {matchNotification && (
          <TouchableOpacity
            style={styles.notification}
            onPress={() => {
              setMatchNotification(null);
              navigation.navigate('Matches' as never);
            }}
          >
            <Text style={styles.notificationText}>{matchNotification}</Text>
          </TouchableOpacity>
        )}

        {/* Browse Locked State - Beautiful Landing Page */}
        {showLandingPage ? (
          <View style={[styles.landingPageWrapper, connectLandingFillStyles?.pageWrapper]}>
            <View style={[styles.landingColumn, connectLandingFillStyles?.container]}>
              <View style={styles.browseConnectLandingToken} pointerEvents="box-none">
                {claimTokenBannerEl}
                <TokenDisplay
                  browseLandingStrip
                  connectShell={connectShellMode}
                  openModalRef={openTokenModalRef}
                  performClaimRef={performClaimRef}
                  onTokensUpdated={refreshConnectLandingEconomy}
                />
              </View>

              {Platform.OS === 'android' && (
                <View style={styles.connectShellHintWrap} pointerEvents="box-none">
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => (navigation as any).navigate('Settings')}
                    style={[
                      styles.connectShellHintPill,
                      connectShellMode === 'midnight' && styles.connectShellHintPillMidnight,
                      connectShellMode === 'sunny' && styles.connectShellHintPillSunny,
                      connectShellMode === 'soft' && styles.connectShellHintPillSoft,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Open Settings to change Connect colors and layout"
                  >
                    <Text style={styles.connectShellHintEmoji} allowFontScaling={false}>
                      🎨
                    </Text>
                    <Text
                      style={[
                        styles.connectShellHintLabel,
                        connectShellMode === 'midnight' && styles.connectShellHintLabelMidnight,
                        connectShellMode !== 'midnight' && styles.connectShellHintLabelLightShell,
                      ]}
                      numberOfLines={1}
                    >
                      Colors · Settings
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {connectShellMode === 'midnight' ? (
            <LinearGradient
              colors={['#211d33', '#121018', '#181427']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={[styles.landingCardMidnightShell, connectLandingFillStyles?.content]}
            >
              <LinearGradient
                colors={['rgba(167, 139, 250, 0.38)', 'rgba(167, 139, 250, 0.06)', 'transparent']}
                locations={[0, 0.28, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.62 }}
                style={[StyleSheet.absoluteFillObject, { opacity: 1 }]}
                pointerEvents="none"
              />
              <View style={styles.landingCardMidnightInner}>
              <View style={styles.landingContentTop}>
              <View style={styles.landingLogoContainer}>
                <ConnectLandingMark size={72} />
                <Text style={styles.midnightBrand}>Mulligan</Text>
              </View>

              <Animated.Text
                style={[
                  styles.midnightHeroTitle,
                  {
                    opacity: titleOpacity,
                    transform: [
                      { scale: titleScale },
                      { translateY: titleTranslateY },
                    ],
                  },
                ]}
              >
                Discover People
              </Animated.Text>
              <Text style={styles.midnightSubtitle}>{CONNECT_LANDING_TAGLINE}</Text>

              {isAuthenticated ? <ConnectLandingValueProps variant="midnightFeatures" /> : null}

              <Animated.View
                style={[
                  styles.landingButtonContainer,
                  {
                    transform: [{ scale: buttonPulse }],
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={handleLandingConnectPress}
                  onPressIn={() => {
                    Animated.spring(buttonScale, {
                      toValue: 0.95,
                      useNativeDriver: true,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(buttonScale, {
                      toValue: 1,
                      useNativeDriver: true,
                    }).start();
                  }}
                  disabled={unlocking}
                  activeOpacity={0.9}
                  style={styles.landingButtonTouchable}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.landingButton,
                      styles.midnightConnectGradient,
                      unlocking && styles.landingButtonDisabled,
                    ]}
                  >
                    {!unlocking && connectReady && (
                      <Animated.View
                        style={[
                          styles.buttonShimmer,
                          {
                            transform: [{ translateX: shimmerTranslate }],
                          },
                        ]}
                      />
                    )}

                    <Animated.View
                      style={{
                        transform: [{ scale: buttonScale }],
                      }}
                    >
                      {unlocking ? (
                        <ActivityIndicator color="#fff" size="large" />
                      ) : connectReady ? (
                        <Text style={[styles.landingButtonText, styles.midnightConnectLabel]} numberOfLines={1}>
                          Connect
                        </Text>
                      ) : photoCount === null ? (
                        <Text style={[styles.landingButtonText, styles.midnightConnectLabel]} numberOfLines={1}>
                          Connect
                        </Text>
                      ) : connectMissing[0] === 'name' ? (
                        <Text style={[styles.landingButtonText, styles.midnightConnectLabel]} numberOfLines={2}>
                          Add your name
                        </Text>
                      ) : connectMissing[0] === 'location' ? (
                        <Text style={[styles.landingButtonText, styles.midnightConnectLabel]} numberOfLines={2}>
                          Add location
                        </Text>
                      ) : (
                        <Text style={[styles.landingButtonText, styles.midnightConnectLabel]} numberOfLines={2}>
                          Add 3+ photos
                        </Text>
                      )}
                    </Animated.View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              <Animated.View style={[styles.landingHintWrap, { opacity: landingHintOpacity }]}>
                <Text style={styles.midnightHint}>
                  {matchmakingPaused
                    ? 'Tap Connect — matching opens at launch'
                    : !connectReady && photoCount !== null
                    ? connectMissing[0] === 'name'
                      ? 'Add your name in Settings to Connect'
                      : connectMissing[0] === 'location'
                        ? 'Add city & state on Profile to Connect'
                        : `Add at least ${MIN_PHOTOS_TO_CONNECT} photos on Profile to Connect`
                    : '⛳ Use a Mulligan'}
                </Text>
              </Animated.View>
              </View>
              </View>
            </LinearGradient>
              ) : connectShellMode === 'sunny' ? (
                <View style={[styles.landingCardSunnyShell, connectLandingFillStyles?.content]}>
                  <LinearGradient
                    colors={['rgba(251, 191, 36, 0.38)', 'rgba(251, 146, 60, 0.14)', 'transparent']}
                    locations={[0, 0.22, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.55 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                  <View style={styles.landingCardSunnyInner}>
                    <View style={styles.sunnyLogoRow}>
                      <ConnectLandingMark size={62} />
                      <Text style={styles.sunnyBrand}>Mulligan</Text>
                    </View>

                    <Animated.Text
                      style={[
                        styles.sunnyHeroTitle,
                        {
                          opacity: titleOpacity,
                          transform: [
                            { scale: titleScale },
                            { translateY: titleTranslateY },
                          ],
                        },
                      ]}
                    >
                      Discover People
                    </Animated.Text>
                    <Text style={styles.sunnySubtitle}>{CONNECT_LANDING_TAGLINE}</Text>

                    {isAuthenticated ? (
                      <View style={styles.sunnyFeaturesRow} accessibilityRole="summary">
                        <View style={styles.sunnyFeature}>
                          <Text style={styles.sunnyFeatureEmoji} allowFontScaling={false}>✨</Text>
                          <ConnectFeatureLabel lines={['Quality', 'Matches']} style={styles.sunnyFeatureText} />
                        </View>
                        <View style={styles.sunnyFeature}>
                          <Text style={styles.sunnyFeatureEmoji} allowFontScaling={false}>🎯</Text>
                          <ConnectFeatureLabel lines={['Shared', 'Interests']} style={styles.sunnyFeatureText} />
                        </View>
                        <View style={styles.sunnyFeature}>
                          <Text style={styles.sunnyFeatureEmoji} allowFontScaling={false}>💝</Text>
                          <ConnectFeatureLabel lines={['Meaningful', 'Connections']} style={styles.sunnyFeatureText} />
                        </View>
                      </View>
                    ) : null}

                    <Animated.View
                      style={[
                        styles.landingButtonContainer,
                        {
                          transform: [{ scale: buttonPulse }],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={handleLandingConnectPress}
                        onPressIn={() => {
                          Animated.spring(buttonScale, {
                            toValue: 0.95,
                            useNativeDriver: true,
                          }).start();
                        }}
                        onPressOut={() => {
                          Animated.spring(buttonScale, {
                            toValue: 1,
                            useNativeDriver: true,
                          }).start();
                        }}
                        disabled={unlocking}
                        activeOpacity={0.9}
                        style={styles.landingButtonTouchable}
                      >
                        <LinearGradient
                          colors={['#0284c7', '#ea580c', '#fb923c', '#fbbf24']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.landingButton, unlocking && styles.landingButtonDisabled]}
                        >
                          {!unlocking && connectReady && (
                            <Animated.View
                              style={[
                                styles.buttonShimmer,
                                {
                                  transform: [{ translateX: shimmerTranslate }],
                                },
                              ]}
                            />
                          )}

                          <Animated.View
                            style={{
                              transform: [{ scale: buttonScale }],
                            }}
                          >
                            {unlocking ? (
                              <ActivityIndicator color="#fff" size="large" />
                            ) : connectReady ? (
                              <Text style={[styles.landingButtonText, styles.sunnyConnectLabel]} numberOfLines={1}>
                                Connect
                              </Text>
                            ) : photoCount === null ? (
                              <Text style={[styles.landingButtonText, styles.sunnyConnectLabel]} numberOfLines={1}>
                                Connect
                              </Text>
                            ) : connectMissing[0] === 'name' ? (
                              <Text style={[styles.landingButtonText, styles.sunnyConnectLabel]} numberOfLines={2}>
                                Add your name
                              </Text>
                            ) : connectMissing[0] === 'location' ? (
                              <Text style={[styles.landingButtonText, styles.sunnyConnectLabel]} numberOfLines={2}>
                                Add location
                              </Text>
                            ) : (
                              <Text style={[styles.landingButtonText, styles.sunnyConnectLabel]} numberOfLines={2}>
                                Add 3+ photos
                              </Text>
                            )}
                          </Animated.View>
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>

                    <Animated.View style={[styles.landingHintWrap, { opacity: landingHintOpacity }]}>
                      <Text style={styles.sunnyHint}>
                        {matchmakingPaused
                          ? 'Tap Connect — matching opens at launch'
                          : !connectReady && photoCount !== null
                          ? connectMissing[0] === 'name'
                            ? 'Add your name in Settings to Connect'
                            : connectMissing[0] === 'location'
                              ? 'Add city & state on Profile to Connect'
                              : `Add at least ${MIN_PHOTOS_TO_CONNECT} photos on Profile to Connect`
                          : '⛳ Use a Mulligan'}
                      </Text>
                    </Animated.View>
                  </View>
                </View>
              ) : (
                <View style={[styles.landingCardSoftShell, connectLandingFillStyles?.content]}>
                  <LinearGradient
                    colors={['rgba(102, 126, 234, 0.14)', 'rgba(102, 126, 234, 0.05)', 'transparent']}
                    locations={[0, 0.22, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.55 }}
                    style={StyleSheet.absoluteFillObject}
                    pointerEvents="none"
                  />
                  <View style={styles.landingCardSoftInner}>
                    <View style={styles.softLogoRow}>
                      <ConnectLandingMark size={62} />
                      <Text style={styles.softBrand}>Mulligan</Text>
                    </View>

                    <Animated.Text
                      style={[
                        styles.softHeroTitle,
                        {
                          opacity: titleOpacity,
                          transform: [
                            { scale: titleScale },
                            { translateY: titleTranslateY },
                          ],
                        },
                      ]}
                    >
                      Discover People
                    </Animated.Text>
                    <Text style={styles.softSubtitle}>{CONNECT_LANDING_TAGLINE}</Text>

                    {isAuthenticated ? (
                      <View style={styles.softFeaturesRow} accessibilityRole="summary">
                        <View style={styles.softFeature}>
                          <Text style={styles.softFeatureEmoji} allowFontScaling={false}>✨</Text>
                          <ConnectFeatureLabel lines={['Quality', 'Matches']} style={styles.softFeatureText} />
                        </View>
                        <View style={styles.softFeature}>
                          <Text style={styles.softFeatureEmoji} allowFontScaling={false}>🎯</Text>
                          <ConnectFeatureLabel lines={['Shared', 'Interests']} style={styles.softFeatureText} />
                        </View>
                        <View style={styles.softFeature}>
                          <Text style={styles.softFeatureEmoji} allowFontScaling={false}>💝</Text>
                          <ConnectFeatureLabel lines={['Meaningful', 'Connections']} style={styles.softFeatureText} />
                        </View>
                      </View>
                    ) : null}

                    <Animated.View
                      style={[
                        styles.landingButtonContainer,
                        {
                          transform: [{ scale: buttonPulse }],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        onPress={handleLandingConnectPress}
                        onPressIn={() => {
                          Animated.spring(buttonScale, {
                            toValue: 0.95,
                            useNativeDriver: true,
                          }).start();
                        }}
                        onPressOut={() => {
                          Animated.spring(buttonScale, {
                            toValue: 1,
                            useNativeDriver: true,
                          }).start();
                        }}
                        disabled={unlocking}
                        activeOpacity={0.9}
                        style={styles.landingButtonTouchable}
                      >
                        <LinearGradient
                          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.landingButton, unlocking && styles.landingButtonDisabled]}
                        >
                          {!unlocking && connectReady && (
                            <Animated.View
                              style={[
                                styles.buttonShimmer,
                                {
                                  transform: [{ translateX: shimmerTranslate }],
                                },
                              ]}
                            />
                          )}

                          <Animated.View
                            style={{
                              transform: [{ scale: buttonScale }],
                            }}
                          >
                            {unlocking ? (
                              <ActivityIndicator color="#fff" size="large" />
                            ) : connectReady ? (
                              <Text style={[styles.landingButtonText, styles.softConnectLabel]} numberOfLines={1}>
                                Connect
                              </Text>
                            ) : photoCount === null ? (
                              <Text style={[styles.landingButtonText, styles.softConnectLabel]} numberOfLines={1}>
                                Connect
                              </Text>
                            ) : connectMissing[0] === 'name' ? (
                              <Text style={[styles.landingButtonText, styles.softConnectLabel]} numberOfLines={2}>
                                Add your name
                              </Text>
                            ) : connectMissing[0] === 'location' ? (
                              <Text style={[styles.landingButtonText, styles.softConnectLabel]} numberOfLines={2}>
                                Add location
                              </Text>
                            ) : (
                              <Text style={[styles.landingButtonText, styles.softConnectLabel]} numberOfLines={2}>
                                Add 3+ photos
                              </Text>
                            )}
                          </Animated.View>
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>

                    <Animated.View style={[styles.landingHintWrap, { opacity: landingHintOpacity }]}>
                      <Text style={styles.softHint}>
                        {matchmakingPaused
                          ? 'Tap Connect — matching opens at launch'
                          : !connectReady && photoCount !== null
                          ? connectMissing[0] === 'name'
                            ? 'Add your name in Settings to Connect'
                            : connectMissing[0] === 'location'
                              ? 'Add city & state on Profile to Connect'
                              : `Add at least ${MIN_PHOTOS_TO_CONNECT} photos on Profile to Connect`
                          : '⛳ Use a Mulligan'}
                      </Text>
                    </Animated.View>
                  </View>
                </View>
              )}
            </View>
          </View>
      ) : (
        <>
          {/* Header - only show when not on landing page */}
          <Animated.View style={styles.header}>
            <Animated.View 
              style={[
                styles.headerGradientOverlay,
                {
                  opacity: headerGradientPos.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.15, 0.25],
                  }),
                },
              ]}
            />
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }} />
              {/* Token is in fixed overlay above ScrollView for instant taps */}
            </View>
            <Animated.Text
              style={[
                styles.title,
                {
                  opacity: titleOpacity,
                  transform: [
                    { scale: titleScale },
                    { translateY: titleTranslateY },
                  ],
                },
              ]}
            >
              Discover People
            </Animated.Text>
          </Animated.View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Other states - only show when not on landing page */}
      {!showLandingPage && (
        <>
          {needsProfile ? (
        <View style={styles.noProfileContainer}>
          <Text style={styles.noProfileEmoji}>🚀</Text>
          <Text style={styles.noProfileText}>
            We couldn’t load your profile. Open Settings or try logging in again.
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('Settings' as never)}
          >
            <Text style={styles.createButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : !hasActiveProfile && !loading ? (
        <View style={styles.noMoreWrapper}>
          <LinearGradient
            colors={['#f8f7ff', '#ffffff', '#fff5f8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.noMoreCard}
          >
            <View style={styles.noMoreEmojiRing}>
              <Text style={styles.noMoreEmoji}>✨</Text>
            </View>
            <Text style={styles.noMoreTitle}>You're all caught up</Text>
            <Text style={styles.noMoreText}>
              You've seen everyone for now. New people join every day — check back soon!
            </Text>
          </LinearGradient>
        </View>
      ) : hasActiveProfile && currentProfile ? (
        <Animated.View 
          style={[
            styles.profileCard,
            {
              opacity: profileCardOpacity,
              transform: [
                { scale: profileCardScale },
                { translateY: profileCardTranslateY },
                {
                  rotate: profileCardRotate.interpolate({
                    inputRange: [0, 0.5],
                    outputRange: ['0deg', '1deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Pulsating glow effect around profile card */}
          <Animated.View
            style={[
              styles.profileCardGlow,
              {
                opacity: profileCardGlow.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.3, 0.6],
                }),
                transform: [
                  {
                    scale: profileCardGlow,
                  },
                ],
              },
            ]}
          />
          <View style={styles.profileCardContent}>
          {/* Photo Gallery */}
          {photos.length > 0 ? (
            <View style={styles.photoGallery}>
              <Animated.View
                style={{
                  transform: [{ scale: photoScale }],
                  opacity: photoOpacity,
                }}
              >
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(event) => {
                    const index = Math.round(
                      event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                    );
                    setCurrentPhotoIndex(index);
                    // Animate photo change
                    photoScale.setValue(0.98);
                    photoOpacity.setValue(0.9);
                    Animated.parallel([
                      Animated.spring(photoScale, {
                        toValue: 1,
                        tension: 50,
                        friction: 8,
                        useNativeDriver: true,
                      }),
                      Animated.timing(photoOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                      }),
                    ]).start();
                  }}
                  style={styles.photoScrollView}
                >
                  {photos.map((photo) => (
                    <OptimizedImage
                      key={photo.id}
                      source={photo.url}
                      style={[styles.profilePhoto, { width: SCREEN_WIDTH - 40 }]}
                      resizeMode="cover"
                      showLoadingIndicator={false}
                    />
                  ))}
                </ScrollView>
              </Animated.View>
              {photos.length > 1 && (
                <View style={styles.photoIndicators}>
                  {photos.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.photoIndicator,
                        index === currentPhotoIndex && styles.photoIndicatorActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : profilePhotoUrl ? (
            <OptimizedImage
              source={currentProfile.photoUrl}
              style={styles.profilePhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {currentProfile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{currentProfile.displayName}</Text>
              <Text style={styles.age}>{currentProfile.age}</Text>
            </View>

            {renderLocation(currentProfile.location)}

            {currentProfile.distance !== null && currentProfile.distance !== undefined && (
              <Text style={styles.distance}>
                {Math.round(currentProfile.distance)} miles away
              </Text>
            )}

            {currentProfile.bio && (
              <Text style={styles.bio}>{currentProfile.bio}</Text>
            )}

            {currentProfile.interests.length > 0 && (
              <View style={styles.interestsContainer}>
                <Text style={styles.interestsLabel}>Interests:</Text>
                <View style={styles.interestsList}>
                  {currentProfile.interests.slice(0, 6).map((interest, idx) => {
                    const scaleAnim = interestTagScales[idx] ?? interestTagScaleFallback;
                    const opacityAnim = interestTagOpacities[idx] ?? interestTagOpacityFallback;
                    return (
                      <Animated.View
                        key={idx}
                        style={[
                          styles.interestTag,
                          {
                            transform: [{ scale: scaleAnim }],
                            opacity: opacityAnim,
                          },
                        ]}
                      >
                        <Text style={styles.interestText}>{interest}</Text>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          <View style={{ height: 16 }} />
          </View>
        </Animated.View>
      ) : null}
        </>
      )}

      {/* Match Celebration Modal - hide when resetToLanding so modal never blocks tab bar / Connect button after "Back to Connect" */}
      {showMatchCelebration && matchedProfile && !(route.params as { resetToLanding?: boolean } | undefined)?.resetToLanding && (
        <MatchCelebration
          key="connect-celeb"
          profileName={matchedProfile.displayName || 'Someone'}
          photoUrl={
            matchedProfile.photos?.find((p) => p.isPrimary)?.url ||
            matchedProfile.photos?.[0]?.url ||
            matchedProfile.photoUrl ||
            undefined
          }
          onClose={handleCelebrationClose}
          explanation={matchExplanation}
          matchId={matchId}
          skipLoadingReveal={false}
          revealWhenMatchIdReady={true}
        />
      )}

      <MatchmakingPausedModal
        visible={matchmakingPausedModalVisible}
        onClose={() => setMatchmakingPausedModalVisible(false)}
        connectShell={connectShellMode}
        message={matchmakingPausedMessage}
      />

      {/* No Tokens Modal */}
      <NoTokensModal
        visible={showNoTokensModal}
        onClose={() => {
          setShowNoTokensModal(false);
          // Reset to landing page when modal closes
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
          setCurrentProfile(null);
        }}
        onTokenClaimed={() => {
          // Claim just happened, so weekly-claim CTA should disappear immediately.
          setCanClaimTokens(false);
          api.clearCache('/tokens');
          void refreshConnectLandingEconomy();
          setShowNoTokensModal(false);
          // Reset to landing page after claiming tokens
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
          setCurrentProfile(null);
        }}
      />

      {/* Match Limit Reached Modal */}
      <Modal
        visible={showMatchLimitModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowMatchLimitModal(false);
          setBrowseUnlocked(false);
          setCurrentProfile(null);
          setIsAutoMatching(false);
          setMatchLimitProfile(null);
        }}
      >
        <View style={styles.matchLimitOverlay}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.matchLimitCard}>
            <Text style={styles.matchLimitEmoji}>🎯</Text>
            <Text style={styles.matchLimitTitle}>Match limit reached</Text>
            <Text style={styles.matchLimitBody}>
              You've reached your limit of 20 matches. To connect with more people:
            </Text>
            <View style={styles.matchLimitBullets}>
              <Text style={styles.matchLimitBullet}>• Unmatch with someone to free a slot</Text>
              <Text style={styles.matchLimitBullet}>• Wait for a match to expire (7-day limit)</Text>
            </View>
            {matchLimitCanExpand && matchLimitProfile && (
              <Text style={styles.matchLimitExpand}>
                Spend 2 tokens to connect with {matchLimitProfile.displayName || 'them'}?
              </Text>
            )}
            <View style={styles.matchLimitButtons}>
              <TouchableOpacity
                style={styles.matchLimitCancelButton}
                onPress={() => {
                  setShowMatchLimitModal(false);
                  setBrowseUnlocked(false);
                  setCurrentProfile(null);
                  setIsAutoMatching(false);
                  setMatchLimitProfile(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.matchLimitCancelText}>{matchLimitCanExpand ? 'Cancel' : 'OK'}</Text>
              </TouchableOpacity>
              {matchLimitCanExpand && matchLimitProfile && (
                <TouchableOpacity
                  style={styles.matchLimitTokensButton}
                  onPress={() => {
                    const profileToConnect = matchLimitProfile;
                    setShowMatchLimitModal(false);
                    setMatchLimitProfile(null);
                    connectRequestedRef.current = true;
                    connectOverlayOpacity.setValue(1);
                    connectSpinnerOpacity.setValue(1);
                    connectTextOpacity.setValue(0);
                    setConnecting(true);
                    handleConnect(profileToConnect, true);
                  }}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.matchLimitTokensGradient}
                  >
                    <Text style={styles.matchLimitTokensText}>Use 2 Tokens</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* No Profiles Available Modal */}
      <Modal
        visible={showNoProfilesModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowNoProfilesModal(false);
          setNoProfilesDistanceMode(false);
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
        }}
      >
        <View style={styles.noProfilesModalOverlay}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.noProfilesModalCard}>
            <LinearGradient
              colors={['#f8f7ff', '#ffffff', '#fff5f8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.noProfilesModalCardInner}
            >
              {!noProfilesDistanceMode ? (
                <>
                  <View style={styles.noProfilesModalEmojiRing}>
                    <Text style={styles.noProfilesModalEmoji}>👋</Text>
                  </View>
                  <Text style={styles.noProfilesModalTitle}>No profiles available</Text>
                  <Text style={styles.noProfilesModalBody}>
                    There are no other profiles to match with right now. New people join every day — check back soon!
                  </Text>
                  <TouchableOpacity
                    style={styles.noProfilesModalButton}
                    onPress={() => {
                      setShowNoProfilesModal(false);
                      setBrowseUnlocked(false);
                      setIsAutoMatching(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2', '#f093fb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.noProfilesModalButtonGradient}
                    >
                      <Text style={styles.noProfilesModalButtonText}>OK</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.noProfilesModalUpdateDistanceButton}
                    onPress={openNoProfilesDistancePicker}
                    disabled={noProfilesUpdating}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.noProfilesModalUpdateDistanceText}>
                      {noProfilesUpdating ? 'Loading…' : 'Update distance'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.noProfilesModalEmojiRing}>
                    <Text style={styles.noProfilesModalEmoji}>📏</Text>
                  </View>
                  <Text style={styles.noProfilesModalTitle}>Max distance</Text>
                  <Text style={styles.noProfilesModalBody}>
                    Show me people within this distance. Try increasing it to see more profiles.
                  </Text>
                  <View style={styles.noProfilesDistanceOptionsRow}>
                    {MAX_DISTANCE_OPTIONS.map((value) => (
                      <TouchableOpacity
                        key={value ?? 'any'}
                        style={[
                          styles.noProfilesDistanceOptionButton,
                          noProfilesSelectedDistance === value && styles.noProfilesDistanceOptionButtonActive,
                        ]}
                        onPress={() => setNoProfilesSelectedDistance(value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.noProfilesDistanceOptionText,
                          noProfilesSelectedDistance === value && styles.noProfilesDistanceOptionTextActive,
                        ]}>
                          {value == null ? 'Any' : `${value} mi`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.noProfilesModalDistanceActions}>
                    <TouchableOpacity
                      style={styles.noProfilesModalBackButton}
                      onPress={() => setNoProfilesDistanceMode(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.noProfilesModalBackButtonText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noProfilesModalSaveDistanceButton}
                      onPress={saveNoProfilesDistance}
                      disabled={noProfilesUpdating}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={['#667eea', '#764ba2', '#f093fb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.noProfilesModalButtonGradient}
                      >
                        <Text style={styles.noProfilesModalButtonText}>{noProfilesUpdating ? 'Saving…' : 'Save'}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Legal Footer */}
      <LegalFooter />
      </ScrollView>

      {/* Launch bubble after ScrollView so it stacks above and stays draggable/tappable on Android */}
      {showLandingPage && Platform.OS === 'android' && (
        <LaunchCountdownBubble
          bottomTabOccupancy={42 + insets.bottom}
          topInset={insets.top}
          leftInset={insets.left}
          rightInset={insets.right}
          connectShell={connectShellMode}
        />
      )}

      {/* Full-screen loading overlay - shows IMMEDIATELY on tap (Animated, no React re-render) */}
      {!showLandingPage && hasActiveProfile && (
        <Animated.View
          pointerEvents={connecting ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: connectOverlayOpacity,
              backgroundColor: 'rgba(0,0,0,0.3)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
            },
          ]}
        >
          <ActivityIndicator size="large" color="#fff" />
        </Animated.View>
      )}

      {/* Connect Button - OUTSIDE ScrollView. Mounts fresh when returning to tab (minimal view when blurred); onLayout stops any stale ref then starts animations. */}
      {!showLandingPage && !needsProfile && hasActiveProfile && !loading && (
        <View
          style={styles.connectButtonFixed}
          pointerEvents="box-none"
          onLayout={handleConnectButtonLayout}
        >
          <GestureTouchable
            style={styles.connectButton}
            delayPressIn={0}
            delayPressOut={0}
            activeOpacity={0.9}
            onPressIn={() => {
              if (connecting || connectRequestedRef.current) return;
              const profile = currentProfile;
              if (!profile) return;
              connectRequestedRef.current = true;
              try { Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30); } catch (_) {}
              Animated.timing(connectButtonScale, {
                toValue: 0.92,
                duration: 30,
                useNativeDriver: true,
              }).start();
              // Optimistic: show celebration immediately; API confirms in background
              handleConnect(profile);
            }}
            onPressOut={() => {
              Animated.spring(connectButtonScale, {
                toValue: 1,
                friction: 6,
                tension: 300,
                useNativeDriver: true,
              }).start();
              connectPressOutTimer.current = setTimeout(() => {
                if (!connectRequestedRef.current) {
                  setConnecting(false);
                  connectSpinnerOpacity.setValue(0);
                  connectTextOpacity.setValue(1);
                  connectOverlayOpacity.setValue(0);
                }
                connectPressOutTimer.current = null;
              }, 80);
            }}
            onPress={() => {
              if (connectPressOutTimer.current) {
                clearTimeout(connectPressOutTimer.current);
                connectPressOutTimer.current = null;
              }
            }}
            disabled={connecting}
          >
            <Animated.View
              style={[
                {
                  transform: [
                    { scale: Animated.multiply(connectButtonPulse, connectButtonScale) },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.connectButtonGradient,
                  connecting && styles.connectButtonDisabled,
                ]}
              >
                <Animated.View
                  style={[
                    styles.connectButtonShimmer,
                    {
                      transform: [
                        { translateX: connectButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
                        { rotate: connectButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-20deg'] }) },
                      ],
                    },
                  ]}
                />
                <View style={styles.connectButtonContent}>
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: connectSpinnerOpacity, justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
                    <ActivityIndicator color="#fff" />
                  </Animated.View>
                  <Animated.View style={{ opacity: connectTextOpacity }} pointerEvents="none">
                    <Text style={styles.connectButtonText} numberOfLines={1}>Connect & Match 🎟️</Text>
                  </Animated.View>
                </View>
              </LinearGradient>
            </Animated.View>
          </GestureTouchable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginTop: 20,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  loadingSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  notification: {
    position: 'absolute',
    top: 20,
    left: '5%',
    right: '5%',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#667eea',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    margin: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  noProfileContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  noProfileEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  noProfileText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  noMoreWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
  },
  noMoreCard: {
    width: '100%',
    maxWidth: 340,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderRadius: 28,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
  },
  noMoreEmojiRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  noMoreEmoji: {
    fontSize: 44,
  },
  noMoreTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  noMoreText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  noMoreHint: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderRadius: 12,
  },
  noMoreHintText: {
    fontSize: 13,
    color: '#5a5a7a',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Landing page styles (when browsing is locked)
  landingPageWrapper: {
    flex: 1,
    minHeight: Dimensions.get('window').height - 140,
    alignSelf: 'stretch',
    paddingLeft: 22,
    paddingRight: 22,
    paddingTop: 74,
    paddingBottom: 36,
    position: 'relative',
    justifyContent: 'flex-start',
  },
  landingTokenContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  landingContainer: {
    position: 'relative',
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 28,
    borderRadius: 26,
    overflow: 'visible',
  },
  /** Column shell for Connect landing (tokens strip + hero card); mirrors web `.connect-landing`. */
  landingColumn: {
    position: 'relative',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 434,
    marginTop: 4,
    marginBottom: 28,
    overflow: 'visible',
  },
  browseConnectLandingToken: {
    width: '100%',
    marginBottom: 14,
    alignSelf: 'stretch',
  },
  connectShellHintWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
    zIndex: 2,
  },
  connectShellHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '92%',
  },
  connectShellHintPillMidnight: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
    }),
  },
  connectShellHintPillSunny: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#ea580c',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
    }),
  },
  connectShellHintPillSoft: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(148, 163, 184, 0.4)',
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  connectShellHintEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  connectShellHintLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  connectShellHintLabelMidnight: {
    color: '#e2e8f0',
  },
  connectShellHintLabelLightShell: {
    color: '#334155',
  },
  // landingGradient removed - now using animated LinearGradient component
  landingTokenInCard: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: 10,
    zIndex: 2,
  },
  /** Max width matches web `.connect-landing { max-width: 434px }`. */
  landingCardMidnightShell: {
    width: '100%',
    maxWidth: 434,
    alignSelf: 'center',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.55,
    shadowRadius: 48,
    elevation: 28,
  },
  landingCardMidnightInner: {
    width: '100%',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 21,
    alignItems: 'center',
    zIndex: 1,
  },
  landingContentTop: {
    width: '100%',
    alignItems: 'center',
    flexShrink: 0,
  },
  landingLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 28,
    flexWrap: 'wrap',
  },
  midnightBrand: {
    fontSize: 30,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  midnightHeroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#f1f5f9',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 4,
    lineHeight: 32,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
    paddingHorizontal: 8,
  },
  midnightSubtitle: {
    fontSize: 16,
    lineHeight: 25,
    color: '#a8a29e',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 10,
    letterSpacing: 0.5,
  },
  midnightConnectGradient: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    minHeight: 68,
    shadowColor: '#1e1b4b',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 18,
  },
  midnightConnectLabel: {
    letterSpacing: 3,
    textTransform: 'uppercase',
    fontSize: 17,
    fontWeight: '900',
  },
  sunnyConnectLabel: {
    letterSpacing: 0.45,
    fontSize: 20,
    fontWeight: '900',
  },
  landingCardSunnyShell: {
    width: '100%',
    maxWidth: 434,
    alignSelf: 'center',
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    backgroundColor: 'rgba(255, 251, 235, 0.96)',
    shadowColor: '#fb923c',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 44,
    elevation: 22,
  },
  landingCardSunnyInner: {
    width: '100%',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 21,
    alignItems: 'center',
    zIndex: 1,
  },
  sunnyLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 22,
    flexWrap: 'wrap',
  },
  sunnyBrand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#431407',
    letterSpacing: 0.5,
  },
  sunnyHeroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#7c2d12',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.6,
    lineHeight: 32,
    paddingHorizontal: 8,
    textShadowColor: 'rgba(251, 146, 60, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  sunnySubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#57534e',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  sunnyFeaturesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 26,
    width: '100%',
    paddingHorizontal: 2,
  },
  sunnyFeature: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 251, 235, 0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251, 191, 36, 0.28)',
    ...Platform.select({
      ios: {
        shadowColor: '#ea580c',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      default: {
        elevation: 0,
      },
    }),
  },
  sunnyFeatureEmoji: {
    fontSize: 26,
    lineHeight: 30,
    marginBottom: 7,
  },
  sunnyFeatureText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#44403c',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  sunnyHint: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.35,
    color: '#78716c',
    textAlign: 'center',
    lineHeight: 19,
  },
  softConnectLabel: {
    letterSpacing: 0.45,
    fontSize: 20,
    fontWeight: '900',
  },
  landingCardSoftShell: {
    width: '100%',
    maxWidth: 434,
    alignSelf: 'center',
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 22,
  },
  landingCardSoftInner: {
    width: '100%',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 21,
    alignItems: 'center',
    zIndex: 1,
  },
  softLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 22,
    flexWrap: 'wrap',
  },
  softBrand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f0f0f',
    letterSpacing: 0.5,
  },
  softHeroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f0f0f',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.6,
    lineHeight: 32,
    paddingHorizontal: 8,
    textShadowColor: 'rgba(102, 126, 234, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  softSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#555',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  softFeaturesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 26,
    width: '100%',
    paddingHorizontal: 2,
  },
  softFeature: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226, 232, 240, 0.85)',
    ...Platform.select({
      ios: {
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      default: {
        elevation: 0,
      },
    }),
  },
  softFeatureEmoji: {
    fontSize: 26,
    lineHeight: 30,
    marginBottom: 7,
  },
  softFeatureText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#444',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  softHint: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.35,
    color: '#666',
    textAlign: 'center',
    lineHeight: 19,
  },
  midnightHint: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: 'rgba(251, 113, 133, 0.92)',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  landingTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(102, 126, 234, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 20,
  },
  landingSubtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 26,
    paddingHorizontal: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  landingButtonContainer: {
    width: '100%',
    marginTop: 14,
    marginBottom: 2,
  },
  landingButtonTouchable: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  landingButton: {
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 22,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 58,
  },
  buttonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  landingButtonDisabled: {
    opacity: 0.6,
  },
  landingButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 0,
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  landingButtonSubtext: {
    color: '#fff',
    fontSize: 15,
    opacity: 0.95,
    fontWeight: '500',
  },
  landingHintWrap: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 0,
  },
  landingHint: {
    fontSize: 13,
    color: 'rgba(60, 50, 85, 0.88)',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.4,
    lineHeight: 19,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Keep old styles for backward compatibility
  lockedContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  lockedEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  lockedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  unlockButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  unlockButtonDisabled: {
    opacity: 0.6,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 32,
    overflow: 'visible',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 15 },
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 3,
    borderColor: '#fff',
    width: SCREEN_WIDTH - 40,
    alignSelf: 'center',
    position: 'relative',
  },
  profileCardGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 52,
    backgroundColor: '#667eea',
    zIndex: -1,
  },
  profileCardContent: {
    backgroundColor: '#fff',
    borderRadius: 32,
    overflow: 'hidden',
  },
  photoGallery: {
    position: 'relative',
  },
  photoScrollView: {
    height: SCREEN_WIDTH * 1.2,
  },
  profilePhoto: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  photoIndicatorActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  photoPlaceholder: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 80,
    color: '#fff',
    fontWeight: 'bold',
  },
  profileInfo: {
    padding: 24,
    backgroundColor: '#fff',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  name: {
    fontSize: 34,
    fontWeight: '900',
    color: '#1a1a1a',
    marginRight: 8,
    letterSpacing: -0.6,
    textShadowColor: 'rgba(102, 126, 234, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  age: {
    fontSize: 28,
    color: '#666',
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationEmoji: {
    fontSize: 17,
    marginRight: 6,
  },
  locationTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  locationCity: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  locationComma: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  locationState: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  location: {
    fontSize: 17,
    color: '#555',
    marginBottom: 6,
    fontWeight: '500',
  },
  distance: {
    fontSize: 15,
    color: '#888',
    marginBottom: 16,
    fontWeight: '500',
  },
  bio: {
    fontSize: 17,
    color: '#1a1a1a',
    lineHeight: 26,
    marginBottom: 20,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  lookingForContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  lookingForLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  lookingForValue: {
    fontSize: 14,
    color: '#333',
  },
  interestsContainer: {
    marginBottom: 20,
  },
  interestsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  interestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    backgroundColor: '#f8f9ff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e7ff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  interestText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  connectButton: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 28,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  connectButtonFixed: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 94 : 88,
    alignItems: 'center',
    zIndex: 100,
  },
  connectButtonContent: {
    minHeight: 24,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButtonGradient: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minHeight: 60,
    overflow: 'hidden',
    position: 'relative',
  },
  connectButtonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-20deg' }],
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
    textAlign: 'center',
    includeFontPadding: false,
    flexWrap: 'nowrap',
  },
  // Match limit reached modal
  matchLimitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  matchLimitCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    maxWidth: '100%',
    width: 340,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
    alignItems: 'center',
  },
  matchLimitEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  matchLimitTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  matchLimitBody: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  matchLimitBullets: {
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  matchLimitBullet: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 4,
  },
  matchLimitExpand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 24,
    textAlign: 'center',
  },
  matchLimitButtons: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  matchLimitCancelButton: {
    marginRight: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    minWidth: 100,
    alignItems: 'center',
  },
  matchLimitCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  matchLimitTokensButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 120,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  matchLimitTokensGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchLimitTokensText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  // No profiles available modal
  noProfilesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noProfilesModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  noProfilesModalCardInner: {
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  noProfilesModalEmojiRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(102, 126, 234, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  noProfilesModalEmoji: {
    fontSize: 40,
  },
  noProfilesModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  noProfilesModalBody: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  noProfilesModalButton: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 120,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  noProfilesModalButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProfilesModalButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  noProfilesModalUpdateDistanceButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  noProfilesModalUpdateDistanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  noProfilesDistanceOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  noProfilesDistanceOptionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
  },
  noProfilesDistanceOptionButtonActive: {
    backgroundColor: '#667eea',
  },
  noProfilesDistanceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  noProfilesDistanceOptionTextActive: {
    color: '#fff',
  },
  noProfilesModalDistanceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noProfilesModalBackButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    minWidth: 90,
    alignItems: 'center',
  },
  noProfilesModalBackButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  noProfilesModalSaveDistanceButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 100,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tokenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop: Platform.OS === 'ios' ? 62 : 54,
    paddingLeft: 16,
    paddingRight: 32,
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
    // Ensure token stays fixed when ScrollView scrolls - overlay is outside scroll
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  tokenOverlayInner: {
    alignItems: 'flex-end',
  },
  tokenContainer: {
    alignItems: 'flex-end',
  },
  claimTokenBanner: {
    backgroundColor: '#f5576c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  claimTokenText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  claimTokenBannerLanding: {
    backgroundColor: '#f5576c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  claimTokenTextLanding: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
