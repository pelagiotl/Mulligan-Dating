/**
 * Main Navigation Setup
 * Using React Navigation (not Expo Router for now - simpler setup)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform, Text, View, StyleSheet } from 'react-native';

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

// Types
export type RootStackParamList = {
  PhoneLogin: undefined;
  CreateProfile: undefined;
  MainTabs: undefined;
  Terms: undefined;
  Privacy: undefined;
};

export type MainTabParamList = {
  Browse: undefined;
  Matches: undefined;
  MyProfile: undefined;
  Settings: undefined;
  Admin: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Main Tab Navigator (shown after login)
function MainTabs() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin || false;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B1538',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginTop: 4,
          width: 30,
          height: 30,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen 
        name="Browse" 
        component={BrowseScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View style={styles.emojiContainer}>
              <Text style={[styles.emojiIcon, { opacity: focused ? 1 : 0.6 }]}>😍</Text>
            </View>
          ),
          tabBarLabel: 'Connect',
        }}
      />
      <Tab.Screen 
        name="Matches" 
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Text style={[styles.tabIcon, styles.sleekIcon, { opacity: focused ? 1 : 0.6, color: focused ? '#8B1538' : '#999' }]}>❤️</Text>
          ),
          tabBarLabel: 'Matches',
        }}
      />
      <Tab.Screen 
        name="MyProfile" 
        component={MyProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Text style={[styles.tabIcon, styles.sleekIcon, { opacity: focused ? 1 : 0.6, color: focused ? '#8B1538' : '#999' }]}>👤</Text>
          ),
          tabBarLabel: 'Profile',
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <Text style={[styles.tabIcon, styles.sleekIcon, { opacity: focused ? 1 : 0.6, color: focused ? '#8B1538' : '#999' }]}>⚙️</Text>
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
              <Text style={[styles.tabIcon, styles.sleekIcon, { opacity: focused ? 1 : 0.6, color: focused ? '#8B1538' : '#999' }]}>👑</Text>
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
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="PhoneLogin"
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
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 24,
    textAlign: 'center',
  },
  sleekIcon: {
    fontSize: 26,
    fontWeight: '300',
    transform: [{ scale: 1.05 }],
  },
  emojiContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiIcon: {
    fontSize: 28,
    lineHeight: 32,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

