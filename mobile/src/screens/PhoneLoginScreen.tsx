/**
 * Phone Login Screen
 * Converted from web version to React Native
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function PhoneLoginScreen() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const navigation = useNavigation();
  const { phoneLogin } = useAuth();

  const formatPhoneInput = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await api.post<{ message: string; phoneNumber: string; code?: string; smsSent: boolean }>('/sms/send-code', {
        phoneNumber
      });

      // Show code if returned (for debugging)
      if (response.code) {
        console.log('🔐 Verification code:', response.code);
        Alert.alert('Verification Code', `Your verification code is: ${response.code}\n\n(Enter this code to continue)`);
      }

      if (response.smsSent === false) {
        console.warn('⚠️ SMS was not sent, but code is available');
        setError('SMS delivery may have failed. Check the alert above for your verification code.');
      }

      setStep('verify');
      setLoading(false);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to send verification code';
      setError(errorMsg);
      setLoading(false);
      console.error('Send code error:', err);
    }
  };

  const handleVerifySubmit = async () => {
    // Use current code state
    const cleanCode = code.replace(/\D/g, '');
    return handleVerifySubmitWithCode(cleanCode);
  };

  const handleVerifySubmitWithCode = async (codeToUse: string) => {
    // Validate code length before submitting
    if (codeToUse.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { hasProfile } = await phoneLogin(phoneNumber, codeToUse, referralCode || undefined);
      
      // Navigate based on profile status
      if (hasProfile) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' as never }],
        });
      } else {
        navigation.navigate('CreateProfile' as never);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid verification code');
      setLoading(false);
    }
  };

  if (step === 'phone') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.logo}>💘</Text>
            <Text style={styles.title}>Welcome to Mulligan</Text>
            <Text style={styles.subtitle}>Enter your phone number to get started</Text>
          </View>

          <View style={styles.card}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            
            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputIcon}>📱</Text>
                <TextInput
                  style={styles.input}
                  placeholder="(555) 123-4567"
                  placeholderTextColor="#999"
                  value={phoneNumber}
                  onChangeText={(text) => {
                    const formatted = formatPhoneInput(text);
                    setPhoneNumber(formatted);
                  }}
                  keyboardType="phone-pad"
                  maxLength={14}
                  editable={!loading}
                  returnKeyType="send"
                  onSubmitEditing={handlePhoneSubmit}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            {referralCode ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Referral Code (Optional)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🎁</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="REF123"
                    placeholderTextColor="#999"
                    value={referralCode}
                    onChangeText={(text) => setReferralCode(text.toUpperCase())}
                    editable={!loading}
                  />
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, (loading || phoneNumber.replace(/\D/g, '').length < 10) && styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={loading || phoneNumber.replace(/\D/g, '').length < 10}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send Verification Code</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.footer}>
              By continuing, you agree to our Terms of Service and Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Verification step
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>💘</Text>
          <Text style={styles.title}>Verify Your Phone</Text>
          <Text style={styles.subtitle}>We sent a 6-digit code to {phoneNumber}</Text>
        </View>

        <View style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>Verification Code</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor="#999"
                value={code}
                onChangeText={(text) => {
                  const digits = text.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  // Auto-submit when 6 digits are entered
                  // Use the digits value directly, not the state (which updates asynchronously)
                  if (digits.length === 6 && !loading) {
                    // Small delay to ensure UI updates
                    setTimeout(() => {
                      // Pass the digits directly to avoid state timing issues
                      handleVerifySubmitWithCode(digits);
                    }, 150);
                  }
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                editable={!loading}
                returnKeyType="done"
                onSubmitEditing={handleVerifySubmit}
                blurOnSubmit={false}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, (loading || code.length !== 6) && styles.buttonDisabled]}
            onPress={handleVerifySubmit}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => {
              setStep('phone');
              setCode('');
              setError('');
            }}
            disabled={loading}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Change Phone Number</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    fontSize: 64,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B1538',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  inputIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    color: '#333',
  },
  codeInput: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#8B1538',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B1538',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#8B1538',
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
});

