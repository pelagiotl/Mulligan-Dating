/**
 * Main Navigation Setup
 * Using React Navigation (not Expo Router for now - simpler setup)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text, View, StyleSheet, Alert, Vibration, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import PushNotificationSettingsScreen from '../screens/PushNotificationSettingsScreen';
import { useAuth } from '../context/AuthContext';
// Import navigation ref from separate file to avoid circular dependencies
import { navigationRef, RootStackParamList } from './navigationRef';

// Types
export type { RootStackParamList };
export type MainTabParamList = {
  Browse: { resetToLanding?: boolean } | undefined;
  Matches: { matchId?: string } | undefined;
  MyProfile: { scrollToPhotos?: boolean } | undefined;
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
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#8B1538',
            opacity: 0.14,
            shadowColor: '#8B1538',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 6,
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
  const isOwnerPhone = user?.phoneNumber && /^(1)?5413163939$/.test(user.phoneNumber.replace(/\D/g, ''));
  const isAdmin = user?.isAdmin || !!isOwnerPhone;

  // Refs so tab bar options never change when profile/loading update — avoids tab bar re-renders and delay
  const profileRef = React.useRef(profile);
  const loadingRef = React.useRef(loading);
  profileRef.current = profile;
  loadingRef.current = loading;
  const refs = React.useMemo<ProfileLoadingRefs>(() => ({ profileRef, loadingRef }), []);
  const insets = useSafeAreaInsets();

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
      backgroundColor: '#FAFAFA',
      borderTopWidth: 0,
      height: Platform.OS === 'ios' ? 56 + Math.round(insets.bottom * 0.5) : 56,
      paddingBottom: Platform.OS === 'ios' ? 8 + Math.round(insets.bottom * 0.5) : 8,
      paddingTop: 8,
      paddingHorizontal: 8,
      elevation: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      position: 'absolute' as const,
      // Android: lift tab bar above system nav/gesture area so tabs stay tappable
      ...(Platform.OS === 'android' ? { marginBottom: 52, paddingBottom: 16 } : {}),
    },
    tabBarItemStyle: {
      paddingHorizontal: 2,
      minWidth: 44,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600' as const,
      marginTop: 4,
      letterSpacing: 0.15,
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
  }), [insets.bottom]);

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

  // Track when navigation container is ready (must be called unconditionally — Rules of Hooks)
  const handleNavigationReady = React.useCallback(() => {
    setIsNavigationReady(true);
  }, []);

  // Open straight to Connect; when auth completes, redirect to PhoneLogin or CreateProfile if needed
  React.useEffect(() => {
    if (!loading && isNavigationReady && navigationRef.current) {
      const currentRoute = navigationRef.current.getCurrentRoute();
      if (!user) {
        if (currentRoute?.name !== 'PhoneLogin') {
          try {
            navigationRef.current.reset({ index: 0, routes: [{ name: 'PhoneLogin' }] });
          } catch (err) {
            console.error('Navigation error in AppNavigator:', err);
          }
        }
      } else if (
        user &&
        !profile &&
        currentRoute?.name !== 'CreateProfile' &&
        currentRoute?.name !== 'MainTabs'
      ) {
        try {
          navigationRef.current.reset({ index: 0, routes: [{ name: 'CreateProfile' }] });
        } catch (err) {
          console.error('Navigation error in AppNavigator:', err);
        }
      }
    }
  }, [loading, user, profile, isNavigationReady]);

  // Brief seamless splash while checking auth — same background as app, no "Loading" label
  if (loading) {
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
          <Stack.Screen name="CreateProfile" component={CreateProfileScreen} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="Terms" component={TermsScreen} />
          <Stack.Screen name="Privacy" component={PrivacyScreen} />
          <Stack.Screen name="PushNotificationSettings" component={PushNotificationSettingsScreen} />
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
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    position: 'relative',
    marginBottom: 0,
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

