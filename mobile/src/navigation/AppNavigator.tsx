/**
 * Main Navigation Setup
 * Using React Navigation (not Expo Router for now - simpler setup)
 */

import React from 'react';
import {
  NavigationContainer,
  useNavigation,
  useRoute,
  type NavigationState,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text, View, StyleSheet, Alert, Vibration, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import screens - React Navigation will lazy load them when lazy={true} is set
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import AgeGateScreen from '../screens/AgeGateScreen';
import CreateProfileScreen from '../screens/CreateProfileScreen';
import BrowseScreen from '../screens/BrowseScreen';
import MatchesScreen from '../screens/MatchesScreen';
import MyProfileScreen from '../screens/MyProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminScreen from '../screens/AdminScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import PushNotificationSettingsScreen from '../screens/PushNotificationSettingsScreen';
import BlockedUsersScreen from '../screens/BlockedUsersScreen';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
// Import navigation ref from separate file to avoid circular dependencies
import { navigationRef, RootStackParamList } from './navigationRef';
import TokenDisplay from '../components/TokenDisplay';

// Types
export type { RootStackParamList };
export type MainTabParamList = {
  Browse: { resetToLanding?: boolean } | undefined;
  Matches: { matchId?: string } | undefined;
  MyProfile: { scrollToPhotos?: boolean } | undefined;
  Settings: undefined;
  Admin: undefined;
};

/** Leaf route names when the stack is showing MainTabs (getCurrentRoute() is nested, not "MainTabs"). */
const MAIN_TAB_SCREEN_NAMES = new Set<string>(['Browse', 'Matches', 'MyProfile', 'Settings', 'Admin']);

/**
 * Floating 🎟️+count (web navbar parity) on Matches / Profile / Settings / Admin.
 * Browse uses its own top-right token overlay; hide here to avoid duplicate controls.
 * Only when the stack is showing MainTabs (not CreateProfile / modals on top).
 */
function readMainTabsTokenOverlayVisible(): boolean {
  const state = navigationRef.current?.getRootState() as NavigationState | undefined;
  if (!state || typeof state.index !== 'number') return false;
  const stackRoute = state.routes[state.index];
  if (!stackRoute || stackRoute.name !== 'MainTabs') return false;
  const tabState = stackRoute.state as NavigationState | undefined;
  if (!tabState || typeof tabState.index !== 'number') return false;
  const tabRoute = tabState.routes[tabState.index];
  return tabRoute?.name !== 'Browse';
}

function isInsideMainTabsFlow(routeName: string | undefined): boolean {
  if (!routeName) return false;
  if (routeName === 'MainTabs') return true;
  return MAIN_TAB_SCREEN_NAMES.has(routeName);
}

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Static tab icon - no animations for instant tab switching; sleeker focused glow
const TabIcon = React.memo(function TabIcon({
  children,
  focused,
  shellMidnight,
}: {
  children: React.ReactNode;
  focused: boolean;
  shellMidnight?: boolean;
}) {
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center' }}>
      {children}
      {focused && (
        <View
          style={{
            position: 'absolute',
            width: Platform.OS === 'android' ? 30 : 44,
            height: Platform.OS === 'android' ? 30 : 44,
            borderRadius: Platform.OS === 'android' ? 15 : 22,
            backgroundColor: shellMidnight ? 'rgba(244, 114, 182, 0.14)' : 'rgba(139, 21, 56, 0.08)',
            shadowColor: shellMidnight ? '#f472b6' : '#8B1538',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: shellMidnight ? 0.18 : 0.12,
            shadowRadius: 4,
            elevation: 2,
          }}
        />
      )}
    </View>
  );
});

// Refs so button always sees latest profile/loading without changing callback (keeps options stable)
type ProfileLoadingRefs = { profileRef: React.MutableRefObject<unknown>; loadingRef: React.MutableRefObject<boolean | undefined> };

// Tab bar button: navigate() only — no extra work so tab content updates as fast as possible
const FastTabBarButton = React.memo(function FastTabBarButton(
  props: {
    requiresProfile?: boolean;
    refs?: ProfileLoadingRefs;
    onPress?: () => void;
    accessibilityState?: { selected?: boolean };
    children: React.ReactNode;
    style?: unknown;
    [key: string]: unknown;
  }
) {
  const { requiresProfile, refs, accessibilityState, children, style, ...rest } = props;
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = accessibilityState?.selected === true;

  const handlePress = React.useCallback(() => {
    const profile = refs?.profileRef?.current;
    const loading = refs?.loadingRef?.current;
    if (requiresProfile && !profile && !loading) {
      Alert.alert(
        'Profile Required',
        'We could not load your profile. Open Settings to finish setup, or try logging in again.',
        [
          {
            text: 'Open Settings',
            onPress: () => {
              try {
                (navigation as any).navigate('Settings');
              } catch (err) {
                console.error('Navigation error:', err);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }
    if (!isFocused) {
      (navigation as any).navigate(route.name);
    }
    setTimeout(() => {
      try {
        if (Platform.OS === 'ios') Vibration.vibrate([0, 30]);
        else Vibration.vibrate(30);
      } catch (_) {}
    }, 0);
  }, [requiresProfile, refs, isFocused, navigation, route.name]);

  return (
    <Pressable {...rest} onPress={handlePress} style={style as any} accessibilityState={accessibilityState}>
      {children}
    </Pressable>
  );
});

// Main Tab Navigator (shown after login)
function MainTabs() {
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    console.error('❌ Error accessing auth context in MainTabs:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, textAlign: 'center', color: '#d32f2f' }}>
          Authentication error. Please restart the app.
        </Text>
      </View>
    );
  }

  const { user, profile, loading } = authContext;
  const isOwnerPhone = user?.phoneNumber && /^(1)?5413163939$/.test(user.phoneNumber.replace(/\D/g, ''));
  const isAdmin = user?.isAdmin || !!isOwnerPhone;

  // Refs so tab bar options never change when profile/loading update — avoids tab bar re-renders and delay
  const profileRef = React.useRef(profile);
  const loadingRef = React.useRef(loading);
  profileRef.current = profile;
  loadingRef.current = loading;
  const refs = React.useMemo<ProfileLoadingRefs>(() => ({ profileRef, loadingRef }), []);
  const insets = useSafeAreaInsets();
  const { mode: connectShellMode } = useConnectShellTheme();
  const androidShellMidnight = Platform.OS === 'android' && connectShellMode === 'midnight';

  // Stable tab bar button factory — same reference always so options are stable
  const createTabBarButton = React.useCallback((requiresProfile: boolean) => (buttonProps: any) => (
    <FastTabBarButton {...buttonProps} requiresProfile={requiresProfile} refs={refs} />
  ), [refs]);

  // Tab options with stable tabBarButton — never recreated so tab bar stays fast
  const browseTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused} shellMidnight={androidShellMidnight}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>😍</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Connect',
      tabBarButton: createTabBarButton(true),
    }),
    [createTabBarButton, androidShellMidnight]
  );

  const matchesTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused} shellMidnight={androidShellMidnight}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>❤️</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Matches',
      tabBarButton: createTabBarButton(true),
    }),
    [createTabBarButton, androidShellMidnight]
  );

  const profileTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused} shellMidnight={androidShellMidnight}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>👤</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Profile',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton, androidShellMidnight]
  );

  const settingsTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused} shellMidnight={androidShellMidnight}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>⚙️</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Settings',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton, androidShellMidnight]
  );

  const adminTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused} shellMidnight={androidShellMidnight}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>👑</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Admin',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton, androidShellMidnight]
  );

  // Memoize screen options — all screens stay mounted, freeze inactive to avoid 5 re-renders on switch
  const [tokenOverlayVisible, setTokenOverlayVisible] = React.useState(readMainTabsTokenOverlayVisible);
  React.useEffect(() => {
    const nav = navigationRef.current;
    if (!nav) return;
    const sync = () => setTokenOverlayVisible(readMainTabsTokenOverlayVisible());
    sync();
    return nav.addListener('state', sync);
  }, []);

  const screenOptions = React.useMemo(() => ({
    headerShown: false,
    lazy: false,
    detachInactiveScreens: false,
    freezeOnBlur: false, // was true: froze screen when keyboard opened (tab blur), blocking typing in bio and chat
    sceneContainerStyle: { flex: 1, backgroundColor: androidShellMidnight ? '#12101c' : '#f8f9ff' },
    tabBarActiveTintColor: androidShellMidnight ? '#f472b6' : '#8B1538',
    tabBarInactiveTintColor: androidShellMidnight ? '#8b93a8' : '#94A3B8',
    tabBarStyle: {
      backgroundColor: androidShellMidnight ? '#12101c' : '#FAFAFA',
      borderTopWidth: 0,
      // Include bottom safe inset so labels/icons sit above gesture / 3-button nav,
      // but do not add extra fixed bottom gap on Android (looks "floating").
      // Android: shorter bar + relative layout keeps tabs docked flush on Pixel / Galaxy.
      height:
        Platform.OS === 'ios'
          ? 56 + Math.round(insets.bottom * 0.5)
          : 42 + insets.bottom,
      paddingBottom:
        Platform.OS === 'ios'
          ? 8 + Math.round(insets.bottom * 0.5)
          : Math.max(insets.bottom, 0),
      paddingTop: Platform.OS === 'ios' ? 8 : 3,
      paddingHorizontal: Platform.OS === 'android' ? 2 : 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: androidShellMidnight ? 0.35 : 0.06,
      shadowRadius: Platform.OS === 'android' ? 10 : 12,
      // Keep iOS rounded aesthetic; Android should look docked to the bottom edge.
      borderTopLeftRadius: Platform.OS === 'ios' ? 24 : 0,
      borderTopRightRadius: Platform.OS === 'ios' ? 24 : 0,
      // On Android, keep the tab bar in normal layout flow so it docks flush to the bottom.
      // iOS keeps absolute positioning for the glassy floating style.
      position: Platform.OS === 'ios' ? ('absolute' as const) : ('relative' as const),
      left: Platform.OS === 'ios' ? 0 : undefined,
      right: Platform.OS === 'ios' ? 0 : undefined,
      bottom: Platform.OS === 'ios' ? 0 : undefined,
      marginBottom: 0,
      zIndex: 1000,
      elevation: androidShellMidnight ? 14 : 16,
    },
    tabBarItemStyle: {
      paddingHorizontal: 0,
      minWidth: 0,
      flex: 1,
    },
    tabBarLabelStyle: {
      fontSize: Platform.OS === 'android' ? 8.5 : 10,
      fontWeight: '600' as const,
      marginTop: Platform.OS === 'android' ? 1 : 4,
      letterSpacing: 0,
      marginBottom: 0,
      paddingHorizontal: 0,
      textAlign: 'center' as const,
    },
    tabBarIconStyle: {
      marginTop: 0,
      width: Platform.OS === 'android' ? 20 : 24,
      height: Platform.OS === 'android' ? 20 : 24,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    tabBarShowLabel: true,
    tabBarHideOnKeyboard: true,
  }), [insets.bottom, androidShellMidnight]);

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator screenOptions={screenOptions}>
        <Tab.Screen 
          name="Browse" 
          component={BrowseScreen}
          options={browseTabOptions}
        />
        <Tab.Screen 
          name="Matches" 
          component={MatchesScreen}
          options={matchesTabOptions}
        />
        <Tab.Screen 
          name="MyProfile" 
          component={MyProfileScreen}
          options={profileTabOptions}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={settingsTabOptions}
        />
        {isAdmin && (
          <Tab.Screen 
            name="Admin" 
            component={AdminScreen}
            options={adminTabOptions}
          />
        )}
      </Tab.Navigator>
      {tokenOverlayVisible && user ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: Math.max(insets.top, 8) + 4,
              right: 16,
              zIndex: 120,
              elevation: 14,
            }}
          >
            <TokenDisplay compact connectShell={connectShellMode} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Root Stack Navigator
export default function AppNavigator() {
  let authContext;
  try {
    authContext = useAuth();
  } catch (error) {
    console.error('❌ Error accessing auth context:', error);
    // Return a fallback UI if auth context fails
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, textAlign: 'center', color: '#d32f2f' }}>
          App initialization error. Please restart the app.
        </Text>
      </View>
    );
  }

  const { user, profile, loading } = authContext;
  const [isNavigationReady, setIsNavigationReady] = React.useState(false);
  const [gateStatusLoaded, setGateStatusLoaded] = React.useState(false);
  const [ageGatePassed, setAgeGatePassed] = React.useState<boolean | null>(null);

  // Load age-gate acceptance from storage (for store compliance: 18+ confirmation)
  const loadAgeGateStatus = React.useCallback(() => {
    AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => {
      setAgeGatePassed(v === 'true');
      setGateStatusLoaded(true);
    });
  }, []);

  React.useEffect(() => {
    loadAgeGateStatus();
  }, [loadAgeGateStatus]);

  // When user logs out, re-read gate so next login shows age gate if we cleared it on logout
  React.useEffect(() => {
    if (!user) {
      AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => setAgeGatePassed(v === 'true'));
    }
  }, [user]);

  // If in-memory gate state is stale, reconcile from storage before navigation redirects.
  React.useEffect(() => {
    if (!user || !gateStatusLoaded || ageGatePassed !== false) return;
    AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => {
      if (v === 'true') setAgeGatePassed(true);
    });
  }, [user, gateStatusLoaded, ageGatePassed]);

  // Track when navigation container is ready (must be called unconditionally — Rules of Hooks)
  const handleNavigationReady = React.useCallback(() => {
    setIsNavigationReady(true);
  }, []);

  // Open straight to Connect; when auth completes, redirect to PhoneLogin, AgeGate, or MainTabs (CreateProfile remains available from Profile for deep edits)
  React.useEffect(() => {
    if (!loading && isNavigationReady && navigationRef.current && (!user || gateStatusLoaded)) {
      const currentRoute = navigationRef.current.getCurrentRoute();
      if (!user) {
        if (currentRoute?.name !== 'PhoneLogin') {
          try {
            navigationRef.current.reset({ index: 0, routes: [{ name: 'PhoneLogin' }] });
          } catch (err) {
            console.error('Navigation error in AppNavigator:', err);
          }
        }
      } else if (user && currentRoute?.name === 'PhoneLogin') {
        // Post-login route decision:
        // - if age gate already accepted, continue directly
        // - otherwise show age gate once
        try {
          if (ageGatePassed === true) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          } else {
            AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => {
              if (v === 'true') {
                setAgeGatePassed(true);
                navigationRef.current?.reset({
                  index: 0,
                  routes: [{ name: 'MainTabs' }],
                });
                return;
              }
              navigationRef.current?.reset({
                index: 0,
                routes: [{ name: 'AgeGate', params: { nextRoute: 'MainTabs' } }],
              });
            });
          }
        } catch (err) {
          console.error('Navigation error in AppNavigator:', err);
        }
      } else if (
        user &&
        gateStatusLoaded &&
        ageGatePassed === false &&
        currentRoute?.name !== 'AgeGate' &&
        currentRoute?.name !== 'CreateProfile' &&
        currentRoute?.name !== 'MainTabs'
      ) {
        // Do not interrupt an active session with age-gate redirects.
        // Age gate is enforced on fresh login entry (PhoneLogin path).
        AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => {
          if (v === 'true') setAgeGatePassed(true);
        });
      } else if (
        user &&
        gateStatusLoaded &&
        ageGatePassed === false &&
        (currentRoute?.name === 'CreateProfile' || isInsideMainTabsFlow(currentRoute?.name))
      ) {
        // User already on CreateProfile or a main tab (leaf name e.g. Browse, not "MainTabs").
        // Re-sync storage and avoid redirecting them back to age gate mid-flow.
        AsyncStorage.getItem('AGE_GATE_ACCEPTED').then((v) => {
          if (v === 'true') setAgeGatePassed(true);
        });
      } else if (
        user &&
        gateStatusLoaded &&
        ageGatePassed === true &&
        !isInsideMainTabsFlow(currentRoute?.name) &&
        currentRoute?.name !== 'CreateProfile'
      ) {
        try {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        } catch (err) {
          console.error('Navigation error in AppNavigator:', err);
        }
      }
    }
  }, [loading, user?.id, isNavigationReady, gateStatusLoaded, ageGatePassed]);

  // Brief seamless splash while checking auth and (if logged in) age gate status
  if (loading || (user && !gateStatusLoaded)) {
    return (
      <View style={styles.loadingScreen}>
        <View style={{ opacity: 0.5 }}>
          <ActivityIndicator size="small" color="#8B1538" />
        </View>
      </View>
    );
  }

  try {
    return (
      <NavigationContainer
        ref={navigationRef}
        onReady={handleNavigationReady}
        theme={{
          dark: false,
          colors: {
            primary: '#8B1538',
            background: '#f8f9ff',
            card: '#ffffff',
            text: '#1a1a2e',
            border: '#e2e8f0',
            notification: '#8B1538',
          },
        }}
      >
        <Stack.Navigator
          initialRouteName="MainTabs"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#f8f9ff' },
          }}
        >
          <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
          <Stack.Screen name="AgeGate" component={AgeGateScreen} />
          <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Terms" component={TermsScreen} />
          <Stack.Screen name="Privacy" component={PrivacyScreen} />
          <Stack.Screen name="PushNotificationSettings" component={PushNotificationSettingsScreen} />
          <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  } catch (error) {
    console.error('❌ Navigation setup error:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, textAlign: 'center', color: '#d32f2f' }}>
          Navigation error. Please restart the app.
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9ff',
  },
  tabIcon: {
    fontSize: 20,
    textAlign: 'center',
  },
  sleekIcon: {
    fontSize: 22,
    fontWeight: '300',
  },
  iconContainer: {
    width: Platform.OS === 'android' ? 32 : 44,
    height: Platform.OS === 'android' ? 32 : 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Platform.OS === 'android' ? 16 : 22,
    position: 'relative',
    marginBottom: 0,
    zIndex: 1,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(139, 21, 56, 0.05)',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 2,
  },
  emojiContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiIcon: {
    fontSize: Platform.OS === 'android' ? 18 : 24,
    lineHeight: Platform.OS === 'android' ? 22 : 28,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

