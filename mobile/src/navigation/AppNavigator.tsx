/**
 * Main Navigation Setup
 * Using React Navigation (not Expo Router for now - simpler setup)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text, View, StyleSheet, Alert, Vibration, Animated, Easing } from 'react-native';
import { useNavigation, useFocusEffect, NavigationContainerRef } from '@react-navigation/native';

// Screens (we'll create these)
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

// Animated Icon Component for better visual feedback
function AnimatedTabIcon({ 
  children, 
  focused, 
  emoji = false,
  triggerRotation = 0
}: { 
  children: React.ReactNode; 
  focused: boolean; 
  emoji?: boolean;
  triggerRotation?: number;
}) {
  const scaleAnim = React.useRef(new Animated.Value(focused ? 1.1 : 1)).current;
  const opacityAnim = React.useRef(new Animated.Value(focused ? 1 : 0.5)).current;
  const glowOpacityAnim = React.useRef(new Animated.Value(focused ? 0.3 : 0)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;
  const prevFocusedRef = React.useRef(focused);

  React.useEffect(() => {
    // Use requestAnimationFrame to ensure animations don't block navigation
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: focused ? 1.1 : 1,
          useNativeDriver: true,
          tension: 300, // Higher tension = faster animation
          friction: 8, // Higher friction = less bouncy
        }),
        Animated.timing(opacityAnim, {
          toValue: focused ? 1 : 0.5,
          duration: 150, // Faster transition
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacityAnim, {
          toValue: focused ? 0.4 : 0,
          duration: 150, // Faster transition
          useNativeDriver: true,
        }),
      ]).start();

      // Trigger rotation when tab becomes focused (simplified, non-blocking)
      if (focused && !prevFocusedRef.current) {
        prevFocusedRef.current = focused;
        // Simplified rotation - single animation instead of sequence
        rotateAnim.setValue(0);
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 200, // Faster
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          // Reset after animation completes
          rotateAnim.setValue(0);
        });
      } else if (!focused) {
        prevFocusedRef.current = focused;
        rotateAnim.setValue(0);
      }
    });
  }, [focused]);

  // Also trigger on explicit press (simplified, non-blocking)
  React.useEffect(() => {
    if (triggerRotation > 0) {
      requestAnimationFrame(() => {
        rotateAnim.setValue(0);
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 200, // Faster
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          rotateAnim.setValue(0);
        });
      });
    }
  }, [triggerRotation]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg'],
  });

  return (
    <Animated.View
      style={{
        transform: [
          { rotate: rotate },
          { scale: scaleAnim },
        ],
        opacity: opacityAnim,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {children}
      {/* Glow effect around active icon */}
      {focused && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#8B1538',
              opacity: glowOpacityAnim,
              shadowColor: '#8B1538',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 15,
              elevation: 8,
            },
          ]}
        />
      )}
    </Animated.View>
  );
}

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
  const navigation = useNavigation();
  const isAdmin = user?.isAdmin || false;
  const [tabPressTrigger, setTabPressTrigger] = React.useState<{ [key: string]: number }>({});

  // Check if user has profile when trying to access tabs that require it
  useFocusEffect(
    React.useCallback(() => {
      // Only check if not loading and user is authenticated
      if (!loading && user && !profile) {
        // User is logged in but has no profile - redirect to create profile
        try {
          // Wait a tick to ensure navigation is ready
          setTimeout(() => {
            try {
              const rootNavigation = (navigation as any).getParent?.() || navigation;
              if (rootNavigation && rootNavigation.navigate && typeof rootNavigation.navigate === 'function') {
                rootNavigation.navigate('CreateProfile');
              }
            } catch (err) {
              console.error('Navigation error in MainTabs setTimeout:', err);
            }
          }, 100);
        } catch (err) {
          console.error('Navigation error in MainTabs:', err);
        }
      }
    }, [loading, user, profile, navigation])
  );

  // Prevent navigation to tabs that require a profile
  const handleTabPress = (e: any, route: any) => {
    // Safety check - route might be undefined
    if (!route || !route.name) {
      return;
    }
    
    // Tabs that require a profile - check first before any animations
    const requiresProfile = ['Browse', 'Matches'];
    
    if (requiresProfile.includes(route.name) && !profile && !loading) {
      e.preventDefault();
      Alert.alert(
        'Profile Required',
        'Please create your profile first to access this feature.',
        [
          {
            text: 'Create Profile',
            onPress: () => {
              try {
                const rootNavigation = (navigation as any).getParent?.() || navigation;
                if (rootNavigation && rootNavigation.navigate && typeof rootNavigation.navigate === 'function') {
                  rootNavigation.navigate('CreateProfile');
                }
              } catch (err) {
                console.error('Navigation error:', err);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return; // Don't proceed with animations if navigation is blocked
    }
    
    // Trigger rotation animation for this tab (non-blocking)
    requestAnimationFrame(() => {
      setTabPressTrigger(prev => ({
        ...prev,
        [route.name]: (prev[route.name] || 0) + 1,
      }));
    });
    
    // Haptic feedback - vibrate asynchronously (non-blocking)
    // This ensures vibration doesn't delay navigation
    setTimeout(() => {
      try {
        if (Platform.OS === 'ios') {
          // iOS: Use pattern [delay, duration] for more reliable vibration
          Vibration.vibrate([0, 50]); // Shorter vibration
        } else {
          // Android: Duration in milliseconds
          Vibration.vibrate(50); // Shorter vibration
        }
      } catch (error) {
        // Silently fail - vibration is non-critical
        console.warn('Vibration error (non-critical):', error);
      }
    }, 0);
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B1538',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 70 : 68,
          paddingBottom: Platform.OS === 'ios' ? 12 : 10,
          paddingTop: 8,
          paddingHorizontal: 4,
          elevation: 16,
          shadowColor: '#8B1538',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: 'absolute',
        },
        tabBarItemStyle: {
          paddingHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 4,
          letterSpacing: 0.4,
          marginBottom: 4,
          paddingHorizontal: 2,
          textAlign: 'center',
        },
        tabBarIconStyle: {
          marginTop: 0,
          width: 28,
          height: 28,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tab.Screen 
        name="Browse" 
        component={BrowseScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon 
              focused={focused} 
              emoji={true}
              triggerRotation={tabPressTrigger['Browse'] || 0}
            >
              <View style={[
                styles.iconContainer,
                focused && styles.iconContainerActive,
              ]}>
                <Text style={styles.emojiIcon}>😍</Text>
              </View>
            </AnimatedTabIcon>
          ),
          tabBarLabel: 'Connect',
        }}
      />
      <Tab.Screen 
        name="Matches" 
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon 
              focused={focused} 
              emoji={true}
              triggerRotation={tabPressTrigger['Matches'] || 0}
            >
              <View style={[
                styles.iconContainer,
                focused && styles.iconContainerActive,
              ]}>
                <Text style={styles.emojiIcon}>❤️</Text>
              </View>
            </AnimatedTabIcon>
          ),
          tabBarLabel: 'Matches',
        }}
      />
      <Tab.Screen 
        name="MyProfile" 
        component={MyProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon 
              focused={focused} 
              emoji={true}
              triggerRotation={tabPressTrigger['MyProfile'] || 0}
            >
              <View style={[
                styles.iconContainer,
                focused && styles.iconContainerActive,
              ]}>
                <Text style={styles.emojiIcon}>👤</Text>
              </View>
            </AnimatedTabIcon>
          ),
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon 
              focused={focused} 
              emoji={true}
              triggerRotation={tabPressTrigger['Settings'] || 0}
            >
              <View style={[
                styles.iconContainer,
                focused && styles.iconContainerActive,
              ]}>
                <Text style={styles.emojiIcon}>⚙️</Text>
              </View>
            </AnimatedTabIcon>
          ),
          tabBarLabel: 'Settings',
        }}
      />
      {isAdmin && (
        <Tab.Screen 
          name="Admin" 
          component={AdminScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <AnimatedTabIcon 
                focused={focused} 
                emoji={true}
                triggerRotation={tabPressTrigger['Admin'] || 0}
              >
                <View style={[
                  styles.iconContainer,
                  focused && styles.iconContainerActive,
                ]}>
                  <Text style={styles.emojiIcon}>👑</Text>
                </View>
              </AnimatedTabIcon>
            ),
            tabBarLabel: 'Admin',
          }}
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
    // Wait for navigation container to be ready
    if (!loading && isNavigationReady && navigationRef.current) {
      if (user && !profile) {
        // User is logged in but has no profile - navigate to create profile
        try {
          const currentRoute = navigationRef.current.getCurrentRoute();
          // Only navigate if we're NOT already on CreateProfile or PhoneLogin
          // This handles the case where user just logged in from PhoneLogin screen
          if (currentRoute?.name !== 'CreateProfile' && currentRoute?.name !== 'PhoneLogin') {
            // Use reset to ensure clean navigation stack
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'CreateProfile' }],
            });
          } else if (currentRoute?.name === 'PhoneLogin') {
            // If still on PhoneLogin after login, navigate to CreateProfile
            // Small delay to ensure navigation is ready
            setTimeout(() => {
              try {
                if (navigationRef.current && navigationRef.current.isReady?.()) {
                  navigationRef.current.navigate('CreateProfile');
                }
              } catch (err) {
                console.error('Navigation error in AppNavigator setTimeout:', err);
              }
            }, 200);
          }
        } catch (err) {
          console.error('Navigation error in AppNavigator:', err);
        }
      } else if (user && profile && isNavigationReady && navigationRef.current) {
        // User has profile - make sure we're on MainTabs if we're on PhoneLogin
        const currentRoute = navigationRef.current.getCurrentRoute();
        if (currentRoute?.name === 'PhoneLogin') {
          setTimeout(() => {
            try {
              if (navigationRef.current && navigationRef.current.isReady?.()) {
                navigationRef.current.reset({
                  index: 0,
                  routes: [{ name: 'MainTabs' }],
                });
              }
            } catch (err) {
              console.error('Navigation error navigating to MainTabs:', err);
            }
          }, 200);
        }
      }
    }
  }, [loading, user, profile, isNavigationReady]);

  // Determine initial route based on auth state
  // If user is already logged in, skip PhoneLogin screen (standard auto-login behavior)
  const getInitialRouteName = (): keyof RootStackParamList => {
    if (loading) {
      // Still loading auth state - show PhoneLogin for now
      return 'PhoneLogin';
    }
    if (user && profile) {
      // User is logged in and has profile - go to main app
      return 'MainTabs';
    }
    if (user && !profile) {
      // User is logged in but needs to create profile
      return 'CreateProfile';
    }
    // Not logged in - show login screen
    return 'PhoneLogin';
  };

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

