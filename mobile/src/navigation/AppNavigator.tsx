/**
 * Main Navigation Setup
 * Using React Navigation (not Expo Router for now - simpler setup)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text, View, StyleSheet, Alert, Vibration, ActivityIndicator, Pressable } from 'react-native';
import { useNavigation, useRoute, NavigationContainerRef } from '@react-navigation/native';

// Import screens - React Navigation will lazy load them when lazy={true} is set
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import CreateProfileScreen from '../screens/CreateProfileScreen';
import BrowseScreen from '../screens/BrowseScreen';
import MatchesScreen from '../screens/MatchesScreen';
import MyProfileScreen from '../screens/MyProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminScreen from '../screens/AdminScreen';
import TermsScreen from '../screens/TermsScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import { useAuth } from '../context/AuthContext';
// Import navigation ref from separate file to avoid circular dependencies
import { navigationRef, RootStackParamList } from './navigationRef';

// Types
export type { RootStackParamList };
export type MainTabParamList = {
  Browse: undefined;
  Matches: { matchId?: string } | undefined;
  MyProfile: undefined;
  Settings: undefined;
  Admin: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Static tab icon - no animations for instant tab switching; sleeker focused glow
const TabIcon = React.memo(function TabIcon({
  children,
  focused,
}: {
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center' }}>
      {children}
      {focused && (
        <View
          style={{
            position: 'absolute',
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#8B1538',
            opacity: 0.18,
            shadowColor: '#8B1538',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 10,
            elevation: 4,
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
        'Please create your profile first to access this feature.',
        [
          {
            text: 'Create Profile',
            onPress: () => {
              try {
                const root = (navigation as any).getParent?.();
                if (root?.navigate) root.navigate('CreateProfile');
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
  const isAdmin = user?.isAdmin || false;

  // Refs so tab bar options never change when profile/loading update — avoids tab bar re-renders and delay
  const profileRef = React.useRef(profile);
  const loadingRef = React.useRef(loading);
  profileRef.current = profile;
  loadingRef.current = loading;
  const refs = React.useMemo<ProfileLoadingRefs>(() => ({ profileRef, loadingRef }), []);

  // Stable tab bar button factory — same reference always so options are stable
  const createTabBarButton = React.useCallback((requiresProfile: boolean) => (buttonProps: any) => (
    <FastTabBarButton {...buttonProps} requiresProfile={requiresProfile} refs={refs} />
  ), [refs]);

  // Tab options with stable tabBarButton — never recreated so tab bar stays fast
  const browseTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>😍</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Connect',
      tabBarButton: createTabBarButton(true),
    }),
    [createTabBarButton]
  );

  const matchesTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>❤️</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Matches',
      tabBarButton: createTabBarButton(true),
    }),
    [createTabBarButton]
  );

  const profileTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>👤</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Profile',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton]
  );

  const settingsTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>⚙️</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Settings',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton]
  );

  const adminTabOptions = React.useMemo(
    () => ({
      tabBarIcon: ({ focused }: { focused: boolean }) => (
        <TabIcon focused={focused}>
          <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
            <Text style={styles.emojiIcon}>👑</Text>
          </View>
        </TabIcon>
      ),
      tabBarLabel: 'Admin',
      tabBarButton: createTabBarButton(false),
    }),
    [createTabBarButton]
  );

  // Memoize screen options — all screens stay mounted, freeze inactive to avoid 5 re-renders on switch
  const screenOptions = React.useMemo(() => ({
    headerShown: false,
    lazy: false,
    detachInactiveScreens: false,
    freezeOnBlur: false, // was true: froze screen when keyboard opened (tab blur), blocking typing in bio and chat
    sceneContainerStyle: { flex: 1 },
    tabBarActiveTintColor: '#8B1538',
    tabBarInactiveTintColor: '#94A3B8',
    tabBarStyle: {
      backgroundColor: '#fff',
      borderTopWidth: 1,
      borderTopColor: 'rgba(0,0,0,0.06)',
      height: Platform.OS === 'ios' ? 52 : 50,
      paddingBottom: 4,
      paddingTop: 4,
      paddingHorizontal: 8,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      position: 'absolute' as const,
    },
    tabBarItemStyle: {
      paddingHorizontal: 0,
      minWidth: 40,
    },
    tabBarLabelStyle: {
      fontSize: 10,
      fontWeight: '600' as const,
      marginTop: 2,
      letterSpacing: 0.2,
      marginBottom: 0,
      paddingHorizontal: 2,
      textAlign: 'center' as const,
    },
    tabBarIconStyle: {
      marginTop: 0,
      width: 24,
      height: 24,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    tabBarShowLabel: true,
    tabBarHideOnKeyboard: true,
  }), []);

  return (
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

  // Track when navigation container is ready
  const handleNavigationReady = React.useCallback(() => {
    setIsNavigationReady(true);
  }, []);

  // Check profile status on mount and when auth state changes
  React.useEffect(() => {
    if (!loading && isNavigationReady && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute();
      // Never redirect when on PhoneLogin: post-verify navigation is handled there using
      // verify-code API hasProfile. Otherwise we race and can send existing users to CreateProfile.
      if (currentRoute?.name === 'PhoneLogin') return;

      if (user && !profile) {
        try {
          if (currentRoute?.name !== 'CreateProfile') {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'CreateProfile' }],
            });
          }
        } catch (err) {
          console.error('Navigation error in AppNavigator:', err);
        }
      }
    }
  }, [loading, user, profile, isNavigationReady]);

  // Determine initial route based on auth state
  // When user is already logged in, skip PhoneLogin so they never see "enter your phone number"
  const getInitialRouteName = (): keyof RootStackParamList => {
    if (loading) {
      return 'PhoneLogin'; // Will be replaced once we show loading gate below
    }
    if (user && profile) {
      return 'MainTabs';
    }
    if (user && !profile) {
      return 'CreateProfile';
    }
    return 'PhoneLogin';
  };

  // Don't show phone login screen when user is already logged in: wait for auth before showing stack
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#8B1538" />
        <Text style={{ marginTop: 12, fontSize: 16, color: '#666' }}>Loading...</Text>
      </View>
    );
  }

  try {
    return (
      <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
        <Stack.Navigator
          initialRouteName={getInitialRouteName()}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} />
          <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Terms" component={TermsScreen} />
          <Stack.Screen name="Privacy" component={PrivacyScreen} />
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
  tabIcon: {
    fontSize: 20,
    textAlign: 'center',
  },
  sleekIcon: {
    fontSize: 22,
    fontWeight: '300',
  },
  iconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    position: 'relative',
    marginBottom: 2,
    zIndex: 1,
  },
  iconContainerActive: {
    backgroundColor: 'rgba(139, 21, 56, 0.12)',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emojiContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiIcon: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

