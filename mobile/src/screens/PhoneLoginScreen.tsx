/**
 * Phone Login Screen
 * Converted from web version to React Native
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Animated Heart Logo Component (matching frontend exactly)
function AnimatedLogo() {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const arrowTopScale = useRef(new Animated.Value(1)).current;
  const arrowTopOpacity = useRef(new Animated.Value(0.9)).current;
  const arrowBottomScale = useRef(new Animated.Value(1)).current;
  const arrowBottomOpacity = useRef(new Animated.Value(0.9)).current;
  const sparkle1Opacity = useRef(new Animated.Value(0.6)).current;
  const sparkle1Scale = useRef(new Animated.Value(1)).current;
  const sparkle1TranslateY = useRef(new Animated.Value(0)).current;
  const sparkle1TranslateX = useRef(new Animated.Value(0)).current;
  const sparkle2Opacity = useRef(new Animated.Value(0.6)).current;
  const sparkle2Scale = useRef(new Animated.Value(1)).current;
  const sparkle2TranslateY = useRef(new Animated.Value(0)).current;
  const sparkle2TranslateX = useRef(new Animated.Value(0)).current;
  const sparkle3Opacity = useRef(new Animated.Value(0.6)).current;
  const sparkle3Scale = useRef(new Animated.Value(1)).current;
  const sparkle3TranslateY = useRef(new Animated.Value(0)).current;
  const sparkle3TranslateX = useRef(new Animated.Value(0)).current;
  const sparkle4Opacity = useRef(new Animated.Value(0.6)).current;
  const sparkle4Scale = useRef(new Animated.Value(1)).current;
  const sparkle4TranslateY = useRef(new Animated.Value(0)).current;
  const sparkle4TranslateX = useRef(new Animated.Value(0)).current;
  
  // State for SVG values (react-native-svg doesn't support Animated.Value directly)
  const [sparkle1OpacityValue, setSparkle1OpacityValue] = useState(0.6);
  const [sparkle1ScaleValue, setSparkle1ScaleValue] = useState(1);
  const [sparkle1TranslateYValue, setSparkle1TranslateYValue] = useState(0);
  const [sparkle1TranslateXValue, setSparkle1TranslateXValue] = useState(0);
  const [sparkle2OpacityValue, setSparkle2OpacityValue] = useState(0.6);
  const [sparkle2ScaleValue, setSparkle2ScaleValue] = useState(1);
  const [sparkle2TranslateYValue, setSparkle2TranslateYValue] = useState(0);
  const [sparkle2TranslateXValue, setSparkle2TranslateXValue] = useState(0);
  const [sparkle3OpacityValue, setSparkle3OpacityValue] = useState(0.6);
  const [sparkle3ScaleValue, setSparkle3ScaleValue] = useState(1);
  const [sparkle3TranslateYValue, setSparkle3TranslateYValue] = useState(0);
  const [sparkle3TranslateXValue, setSparkle3TranslateXValue] = useState(0);
  const [sparkle4OpacityValue, setSparkle4OpacityValue] = useState(0.6);
  const [sparkle4ScaleValue, setSparkle4ScaleValue] = useState(1);
  const [sparkle4TranslateYValue, setSparkle4TranslateYValue] = useState(0);
  const [sparkle4TranslateXValue, setSparkle4TranslateXValue] = useState(0);
  const [arrowTopOpacityValue, setArrowTopOpacityValue] = useState(0.9);
  const [arrowBottomOpacityValue, setArrowBottomOpacityValue] = useState(0.9);

  useEffect(() => {
    // Continuous rotation (4s linear infinite - matching frontend)
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();

    // Heart beat (2s ease-in-out infinite - matching frontend keyframes)
    // 0%, 100%: scale(1), 10%, 30%: scale(1.1)
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartScale, {
          toValue: 1.1,
          duration: 200, // 10% of 2000ms
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.1,
          duration: 400, // 20% of 2000ms (10% to 30%)
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1,
          duration: 1400, // 70% of 2000ms (30% to 100%)
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Arrow pulse animations (2s ease-in-out infinite)
    const arrowPulse = (scale: Animated.Value, opacity: Animated.Value) => {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.9,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    arrowPulse(arrowTopScale, arrowTopOpacity);
    arrowPulse(arrowBottomScale, arrowBottomOpacity);

    // Sparkle animations (2s ease-in-out infinite with delays) - more dynamic like frontend
    const sparkleAnim = (
      opacity: Animated.Value,
      scale: Animated.Value,
      translateY: Animated.Value,
      translateX: Animated.Value,
      setOpacity: (val: number) => void,
      setScale: (val: number) => void,
      setTranslateY: (val: number) => void,
      setTranslateX: (val: number) => void,
      delay: number,
      xOffset: number,
      yOffset: number
    ) => {
      const opacityListenerId = opacity.addListener(({ value }) => {
        setOpacity(value);
      });
      const scaleListenerId = scale.addListener(({ value }) => {
        setScale(value);
      });
      const translateYListenerId = translateY.addListener(({ value }) => {
        setTranslateY(value);
      });
      const translateXListenerId = translateX.addListener(({ value }) => {
        setTranslateX(value);
      });
      
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1.5, // Scale up like frontend
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: yOffset, // Move in direction
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: xOffset, // Move in direction
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1, // Scale back down
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 0, // Move back
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: 0, // Move back
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
      
      return { 
        opacity: opacityListenerId, 
        scale: scaleListenerId,
        translateY: translateYListenerId,
        translateX: translateXListenerId
      };
    };

    // Each sparkle moves in a different direction for more dynamic effect
    const listener1 = sparkleAnim(
      sparkle1Opacity, sparkle1Scale, sparkle1TranslateY, sparkle1TranslateX,
      setSparkle1OpacityValue, setSparkle1ScaleValue, setSparkle1TranslateYValue, setSparkle1TranslateXValue,
      0, 2, -4 // Top sparkle: moves right and up
    );
    const listener2 = sparkleAnim(
      sparkle2Opacity, sparkle2Scale, sparkle2TranslateY, sparkle2TranslateX,
      setSparkle2OpacityValue, setSparkle2ScaleValue, setSparkle2TranslateYValue, setSparkle2TranslateXValue,
      500, -2, 0 // Right sparkle: moves left
    );
    const listener3 = sparkleAnim(
      sparkle3Opacity, sparkle3Scale, sparkle3TranslateY, sparkle3TranslateX,
      setSparkle3OpacityValue, setSparkle3ScaleValue, setSparkle3TranslateYValue, setSparkle3TranslateXValue,
      1000, 0, 4 // Bottom sparkle: moves down
    );
    const listener4 = sparkleAnim(
      sparkle4Opacity, sparkle4Scale, sparkle4TranslateY, sparkle4TranslateX,
      setSparkle4OpacityValue, setSparkle4ScaleValue, setSparkle4TranslateYValue, setSparkle4TranslateXValue,
      1500, -2, -2 // Left sparkle: moves left and up
    );
    
    // Arrow opacity listeners
    const arrowTopListenerId = arrowTopOpacity.addListener(({ value }) => {
      setArrowTopOpacityValue(value);
    });
    const arrowBottomListenerId = arrowBottomOpacity.addListener(({ value }) => {
      setArrowBottomOpacityValue(value);
    });
    
    return () => {
      sparkle1Opacity.removeListener(listener1.opacity);
      sparkle1Scale.removeListener(listener1.scale);
      sparkle1TranslateY.removeListener(listener1.translateY);
      sparkle1TranslateX.removeListener(listener1.translateX);
      sparkle2Opacity.removeListener(listener2.opacity);
      sparkle2Scale.removeListener(listener2.scale);
      sparkle2TranslateY.removeListener(listener2.translateY);
      sparkle2TranslateX.removeListener(listener2.translateX);
      sparkle3Opacity.removeListener(listener3.opacity);
      sparkle3Scale.removeListener(listener3.scale);
      sparkle3TranslateY.removeListener(listener3.translateY);
      sparkle3TranslateX.removeListener(listener3.translateX);
      sparkle4Opacity.removeListener(listener4.opacity);
      sparkle4Scale.removeListener(listener4.scale);
      sparkle4TranslateY.removeListener(listener4.translateY);
      sparkle4TranslateX.removeListener(listener4.translateX);
      arrowTopOpacity.removeListener(arrowTopListenerId);
      arrowBottomOpacity.removeListener(arrowBottomListenerId);
    };
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.logoWrapper}>
      <Animated.View
        style={[
          styles.logoRotateGroup,
          {
            transform: [{ rotate }],
          },
        ]}
      >
        <Animated.View
          style={{
            transform: [{ scale: heartScale }],
          }}
        >
          <Svg width={90} height={90} viewBox="0 0 48 48">
            <Defs>
              <SvgLinearGradient id="heartGradientLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="50%" stopColor="#ffe4e6" stopOpacity="1" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </SvgLinearGradient>
            </Defs>
            <G>
              {/* Heart */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="url(#heartGradientLogin)"
              />
              {/* Top arrow - smaller */}
              <G>
                <Circle cx="36" cy="10" r="2.5" fill="#ffffff" opacity={arrowTopOpacityValue} />
                <Path 
                  d="M30 10L36 10" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowTopOpacityValue}
                />
                <Path 
                  d="M33 7L36 10L33 13" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowTopOpacityValue}
                />
              </G>
              {/* Bottom arrow - smaller */}
              <G>
                <Circle cx="12" cy="38" r="2.5" fill="#ffffff" opacity={arrowBottomOpacityValue} />
                <Path 
                  d="M18 38L12 38" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowBottomOpacityValue}
                />
                <Path 
                  d="M15 35L12 38L15 41" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowBottomOpacityValue}
                />
              </G>
              {/* Sparkles with staggered animations and up/down movement */}
              <G transform={`translate(0, ${sparkle1TranslateYValue})`}>
                <Circle cx="24" cy="8" r="1.5" fill="#ffffff" opacity={sparkle1OpacityValue} />
              </G>
              <G transform={`translate(0, ${sparkle2TranslateYValue})`}>
                <Circle cx="40" cy="24" r="1.5" fill="#ffffff" opacity={sparkle2OpacityValue} />
              </G>
              <G transform={`translate(0, ${sparkle3TranslateYValue})`}>
                <Circle cx="24" cy="40" r="1.5" fill="#ffffff" opacity={sparkle3OpacityValue} />
              </G>
              <G transform={`translate(0, ${sparkle4TranslateYValue})`}>
                <Circle cx="8" cy="24" r="1.5" fill="#ffffff" opacity={sparkle4OpacityValue} />
              </G>
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

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
      <View style={styles.container}>
        {/* Beautiful gradient background */}
        <LinearGradient
          colors={[
            '#667eea', // Purple
            '#764ba2', // Purple-pink
            '#f093fb', // Pink
            '#f5576c', // Coral
            '#4facfe', // Blue
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <AnimatedLogo />
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
      </View>
    );
  }

  // Verification step
  return (
    <View style={styles.container}>
      {/* Beautiful gradient background */}
      <LinearGradient
        colors={[
          '#667eea', // Purple
          '#764ba2', // Purple-pink
          '#f093fb', // Pink
          '#f5576c', // Coral
          '#4facfe', // Blue
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <AnimatedLogo />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
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
  logoWrapper: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  logoRotateGroup: {
    width: 90,
    height: 90,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', // Serif font similar to Crimson Pro
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    letterSpacing: -0.5,
    flexWrap: 'nowrap',
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

