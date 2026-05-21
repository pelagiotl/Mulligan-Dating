/**
 * Age gate for store compliance (App Store / Google Play).
 * Shown once after login; user must confirm they are 18+ to continue.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/navigationRef';
import { useAuth } from '../context/AuthContext';

const AGE_GATE_STORAGE_KEY = 'AGE_GATE_ACCEPTED';

type AgeGateRouteProp = RouteProp<RootStackParamList, 'AgeGate'>;
type AgeGateNavProp = StackNavigationProp<RootStackParamList, 'AgeGate'>;

export default function AgeGateScreen() {
  const navigation = useNavigation<AgeGateNavProp>();
  const route = useRoute<AgeGateRouteProp>();
  const { connectSetupComplete, logout } = useAuth();
  const nextRoute =
    route.params?.nextRoute ?? (connectSetupComplete ? 'MainTabs' : 'CreateProfile');

  const handleConfirm = async () => {
    try {
      await AsyncStorage.setItem(AGE_GATE_STORAGE_KEY, 'true');
      const goToCreateProfile = !connectSetupComplete || nextRoute === 'CreateProfile';
      navigation.reset({
        index: 0,
        routes: goToCreateProfile
          ? [{ name: 'CreateProfile', params: { startFromBeginning: true } }]
          : [{ name: 'MainTabs' }],
      });
    } catch (e) {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
  };

  const handleUnderAge = async () => {
    try {
      await AsyncStorage.removeItem(AGE_GATE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'PhoneLogin' }],
    });
  };

  return (
    <LinearGradient
      colors={['#f8f9ff', '#eef0fa', '#f8f9ff']}
      style={styles.container}
    >
      <View style={styles.card}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.accentBar}
        />
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBadge}
        >
          <Text style={styles.iconBadgeText}>18+</Text>
        </LinearGradient>
        <Text style={styles.title}>Age requirement</Text>
        <Text style={styles.lead}>Mulligan is for adults only.</Text>
        <Text style={styles.body}>
          By continuing, you confirm that you are at least 18 years of age.
        </Text>
        <TouchableOpacity onPress={handleConfirm} activeOpacity={0.85}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>I am 18 or older</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleUnderAge} activeOpacity={0.8}>
          <Text style={styles.secondaryButtonText}>I'm not 18 yet</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 28,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 380,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#764ba2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 6,
  },
  accentBar: {
    height: 4,
    marginHorizontal: -28,
    marginBottom: 20,
  },
  iconBadge: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 6,
    textAlign: 'center',
  },
  lead: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5b6478',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#718096',
    fontSize: 15,
  },
});
