/**
 * Phone Login Screen
 * Converted from web version to React Native
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import AuthLoginBrandRow from '../components/AuthLoginBrandRow';
import LoginScreenBackdrop from '../components/LoginScreenBackdrop';
import LoginSupportNote from '../components/LoginSupportNote';
import { useAuth } from '../context/AuthContext';
import { AUTH_PAGE_GRADIENT_FALLBACK } from '../constants/authLoginTheme';

const LOGIN_GRADIENT_FALLBACK = AUTH_PAGE_GRADIENT_FALLBACK;


// Extract digits from string - minimal logic for fast validation
function extractDigitsFast(value: string): string {
  let digits = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 48 && c <= 57) digits += value[i];
  }
  return digits;
}

function formatPhoneFast(value: string): string {
  const digits = extractDigitsFast(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/** Gentle pulse inside the phone field — matches web login phone icon animation. */
const AnimatedPhoneInputIcon = memo(function AnimatedPhoneInputIcon() {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.1, duration: 720, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -2, duration: 720, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 720, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 720, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, translateY]);

  return (
    <Animated.Text
      style={[styles.inputIcon, { transform: [{ scale }, { translateY }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      📱
    </Animated.Text>
  );
});

// Lightweight form - local state only, so keystrokes don't trigger parent header re-renders.
// This makes the "Send Verification Code" button enable immediately when the 10th digit is typed.
const PhoneForm = memo(function PhoneForm({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (phoneNumber: string) => void;
}) {
  const navigation = useNavigation();
  const [phoneValue, setPhoneValue] = useState('');

  const digits = extractDigitsFast(phoneValue);
  const isValid = digits.length >= 10;

  const handleChange = useCallback((text: string) => {
    setPhoneValue(formatPhoneFast(text));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isValid || loading) return;
    onSubmit(digits);
  }, [isValid, loading, digits, onSubmit]);

  return (
    <View style={styles.card}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.inputWrapper}>
          <AnimatedPhoneInputIcon />
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            placeholderTextColor="#999"
            value={phoneValue}
            onChangeText={handleChange}
            keyboardType="phone-pad"
            maxLength={14}
            editable={!loading}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            blurOnSubmit={false}
          />
        </View>
      </View>
      <TouchableOpacity
        style={[styles.button, styles.primaryButton, (loading || !isValid) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading || !isValid}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send Verification Code</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.footer}>
        By continuing, you agree to our{' '}
        <Text
          style={styles.footerLink}
          onPress={() => navigation.navigate('Terms' as never)}
        >
          Terms of Service
        </Text>
        {' '}and{' '}
        <Text
          style={styles.footerLink}
          onPress={() => navigation.navigate('Privacy' as never)}
        >
          Privacy Policy
        </Text>
      </Text>
      <LoginSupportNote phoneNumber={phoneValue} step="phone" variant="onCard" />
    </View>
  );
});

export default function PhoneLoginScreen() {
  const [submittedPhone, setSubmittedPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const codeInputRef = useRef<TextInput>(null);
  const navigation = useNavigation();
  const { phoneLogin } = useAuth();

  const handlePhoneSubmit = useCallback(async (cleanPhoneNumber: string) => {
    console.log('📱 handlePhoneSubmit called with phoneNumber:', cleanPhoneNumber);
    setError('');
    setLoading(true);

    try {
      console.log('📱 Calling /sms/send-code with cleanPhoneNumber:', cleanPhoneNumber);
      const response = await api.post<{ message: string; phoneNumber: string; code?: string; smsSent: boolean }>('/sms/send-code', {
        phoneNumber: cleanPhoneNumber
      });
      console.log('✅ /sms/send-code response:', response);

      // Show code if returned (for debugging)
      if (response.code) {
        console.log('🔐 Verification code:', response.code);
        Alert.alert('Verification Code', `Your verification code is: ${response.code}\n\n(Enter this code to continue)`);
      }

      if (response.smsSent === false) {
        console.warn('⚠️ SMS was not sent, but code is available');
        setError('SMS delivery may have failed. Check the alert above for your verification code.');
      }

      setSubmittedPhone(cleanPhoneNumber);
      setStep('verify');
      setLoading(false);
    } catch (err: any) {
      const is429 = err?.status === 429;
      const rawMsg = err?.response?.data?.error || err?.message || 'Failed to send verification code';
      const errorMsg = is429
        ? 'Too many attempts. Please wait a minute and try again.'
        : rawMsg;
      if (!is429) {
        console.error('❌ Send code error caught in handlePhoneSubmit:', {
          error: err,
          message: rawMsg,
          errorName: err?.name,
          errorStack: err?.stack
        });
      }
      setError(errorMsg);
      setLoading(false);
    }
  }, []);

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
      await phoneLogin(submittedPhone, codeToUse);
      setLoading(false);
      // AppNavigator routes to CreateProfile (incomplete setup), AgeGate, or MainTabs — never Connect first for new users.
    } catch (err: any) {
      const errorMessage = err?.message || 'Invalid verification code';
      setError(errorMessage);
      setLoading(false);
      
      // If code is invalid, suggest resending
      if (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('expired')) {
        // Error message will show, user can click "Resend Code"
      }
    }
  };

  const handleResendCode = useCallback(async () => {
    setError('');
    setResendLoading(true);
    try {
      await api.post('/sms/send-code', { phoneNumber: submittedPhone });
      setError('');
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to resend verification code';
      setError(errorMsg);
    } finally {
      setResendLoading(false);
    }
  }, [submittedPhone]);

  // Auto-focus code input when step changes to verify
  useEffect(() => {
    if (step === 'verify') {
      // Small delay to ensure the input is rendered
      const timer = setTimeout(() => {
        codeInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Memoize verification code handler
  const handleCodeChange = useCallback((text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // Auto-submit when 6 digits are entered
    if (digits.length === 6 && !loading) {
      // Small delay to ensure UI updates
      setTimeout(() => {
        handleVerifySubmitWithCode(digits);
      }, 150);
    }
  }, [loading, handleVerifySubmitWithCode]);

  if (step === 'phone') {
    return (
      <View style={styles.container}>
        <LoginScreenBackdrop />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            overScrollMode="never"
            bounces={false}
          >
          <View style={styles.contentColumn}>
            <View style={styles.header}>
              <AuthLoginBrandRow />
              <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              Welcome to Mulligan
            </Text>
              <Text style={styles.subtitle}>Enter your phone number to get started</Text>
            </View>

            <PhoneForm loading={loading} error={error} onSubmit={handlePhoneSubmit} />
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Verification step
  return (
    <View style={styles.container}>
      <LoginScreenBackdrop />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          overScrollMode="never"
          bounces={false}
        >
        <View style={styles.contentColumn}>
          <View style={styles.header}>
            <AuthLoginBrandRow />
            <Text style={styles.title}>Verify Your Phone</Text>
            <Text style={styles.subtitleVerify}>We sent a 6-digit code to {formatPhoneFast(submittedPhone)}</Text>
          </View>

          <View style={styles.card}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>Verification Code</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                ref={codeInputRef}
                style={[styles.input, styles.codeInput]}
                placeholder="123456"
                placeholderTextColor="#999"
                value={code}
                onChangeText={handleCodeChange}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus={true}
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

          <View style={styles.verifyActions}>
            <TouchableOpacity
              style={[styles.button, styles.resendButton]}
              onPress={handleResendCode}
              disabled={loading || resendLoading}
            >
              {resendLoading ? (
                <ActivityIndicator color="#f43f5e" size="small" />
              ) : (
                <Text style={[styles.buttonText, styles.resendButtonText]}>Resend Code</Text>
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
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Change Phone</Text>
            </TouchableOpacity>
          </View>

          <LoginSupportNote phoneNumber={submittedPhone} step="verify" variant="onCard" />
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LOGIN_GRADIENT_FALLBACK,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  contentColumn: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    letterSpacing: -0.5,
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  subtitleVerify: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    padding: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
    overflow: 'hidden',
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2d1118',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#f43f5e',
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#fda4af',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#e11d48',
    fontWeight: '600',
  },
  verifyActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  resendButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#fda4af',
  },
  resendButtonText: {
    color: '#e11d48',
    fontWeight: '600',
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  footer: {
    fontSize: 14,
    color: 'rgba(45, 17, 24, 0.85)',
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 20,
  },
  footerLink: {
    fontSize: 14,
    color: '#e11d48',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

