/**
 * Age gate for store compliance (App Store / Google Play).
 * Shown once after login; user must confirm they are 18+ to continue.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
        <Text style={styles.title}>Age requirement</Text>
        <Text style={styles.body}>
          Mulligan is for people 18 and older. By continuing, you confirm that you are at least 18 years of age.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleConfirm} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>I am 18 or older</Text>
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
    borderRadius: 16,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4a5568',
    marginBottom: 28,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#8B1538',
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
