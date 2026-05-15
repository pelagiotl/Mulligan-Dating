/**
 * Phone Login Screen
 * Converted from web version to React Native
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, useMemo } from 'react';
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
import Svg, { G, Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, ClipPath } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Animated Heart Logo Component (matching frontend exactly)
// Memoized to prevent parent re-renders when this component updates
// This allows smooth animations without affecting input performance
const AnimatedLogo = memo(function AnimatedLogo() {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heartRotateWobble = useRef(new Animated.Value(0)).current; // Subtle rotation variation
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
  // Shimmer effect for subtle shine
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  // Sparkle pulse animations for brightness variation
  const sparkle1Pulse = useRef(new Animated.Value(1)).current;
  const sparkle2Pulse = useRef(new Animated.Value(1)).current;
  const sparkle3Pulse = useRef(new Animated.Value(1)).current;
  const sparkle4Pulse = useRef(new Animated.Value(1)).current;
  
  // State for SVG values (react-native-svg doesn't support Animated.Value directly)
  // Use light throttling (16ms = ~60fps) to keep animations smooth while preventing input lag
  const lastUpdateRef = useRef<{ [key: string]: number }>({});
  const THROTTLE_MS = 16; // ~60fps - smooth enough to look continuous
  
  const throttledSetState = useCallback((setter: (val: number) => void, value: number, key: string) => {
    const now = performance.now();
    const lastUpdate = lastUpdateRef.current[key] || 0;
    
    if (now - lastUpdate >= THROTTLE_MS) {
      setter(value);
      lastUpdateRef.current[key] = now;
    }
  }, []);
  
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
  const [shimmerTranslateXValue, setShimmerTranslateXValue] = useState(-100);
  const [shimmerOpacityValue, setShimmerOpacityValue] = useState(0);
  const [sparkle1PulseValue, setSparkle1PulseValue] = useState(1);
  const [sparkle2PulseValue, setSparkle2PulseValue] = useState(1);
  const [sparkle3PulseValue, setSparkle3PulseValue] = useState(1);
  const [sparkle4PulseValue, setSparkle4PulseValue] = useState(1);

  useEffect(() => {
    // Continuous rotation (4s linear infinite - matching frontend)
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();

    // Subtle rotation wobble for organic feel (±2 degrees)
    Animated.loop(
      Animated.sequence([
        Animated.timing(heartRotateWobble, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(heartRotateWobble, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Sparkle pulse animations for subtle brightness variation
    const sparklePulse = (pulseAnim: Animated.Value, setter: (val: number) => void, key: string, delay: number) => {
      const listenerId = pulseAnim.addListener(({ value }) => {
        throttledSetState(setter, value, key);
      });
      
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(pulseAnim, {
            toValue: 1.3, // Slight brightness increase
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      return listenerId;
    };
    
    const pulse1Id = sparklePulse(sparkle1Pulse, setSparkle1PulseValue, 'sparkle1Pulse', 0);
    const pulse2Id = sparklePulse(sparkle2Pulse, setSparkle2PulseValue, 'sparkle2Pulse', 400);
    const pulse3Id = sparklePulse(sparkle3Pulse, setSparkle3PulseValue, 'sparkle3Pulse', 800);
    const pulse4Id = sparklePulse(sparkle4Pulse, setSparkle4PulseValue, 'sparkle4Pulse', 1200);

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
      yOffset: number,
      keyPrefix: string
    ) => {
      const opacityListenerId = opacity.addListener(({ value }) => {
        throttledSetState(setOpacity, value, `${keyPrefix}_opacity`);
      });
      const scaleListenerId = scale.addListener(({ value }) => {
        throttledSetState(setScale, value, `${keyPrefix}_scale`);
      });
      const translateYListenerId = translateY.addListener(({ value }) => {
        throttledSetState(setTranslateY, value, `${keyPrefix}_translateY`);
      });
      const translateXListenerId = translateX.addListener(({ value }) => {
        throttledSetState(setTranslateX, value, `${keyPrefix}_translateX`);
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
      0, 2, -4, 'sparkle1' // Top sparkle: moves right and up
    );
    const listener2 = sparkleAnim(
      sparkle2Opacity, sparkle2Scale, sparkle2TranslateY, sparkle2TranslateX,
      setSparkle2OpacityValue, setSparkle2ScaleValue, setSparkle2TranslateYValue, setSparkle2TranslateXValue,
      500, -2, 0, 'sparkle2' // Right sparkle: moves left
    );
    const listener3 = sparkleAnim(
      sparkle3Opacity, sparkle3Scale, sparkle3TranslateY, sparkle3TranslateX,
      setSparkle3OpacityValue, setSparkle3ScaleValue, setSparkle3TranslateYValue, setSparkle3TranslateXValue,
      1000, 0, 4, 'sparkle3' // Bottom sparkle: moves down
    );
    const listener4 = sparkleAnim(
      sparkle4Opacity, sparkle4Scale, sparkle4TranslateY, sparkle4TranslateX,
      setSparkle4OpacityValue, setSparkle4ScaleValue, setSparkle4TranslateYValue, setSparkle4TranslateXValue,
      1500, -2, -2, 'sparkle4' // Left sparkle: moves left and up
    );
    
    // Arrow opacity listeners
    const arrowTopListenerId = arrowTopOpacity.addListener(({ value }) => {
      throttledSetState(setArrowTopOpacityValue, value, 'arrowTop');
    });
    const arrowBottomListenerId = arrowBottomOpacity.addListener(({ value }) => {
      throttledSetState(setArrowBottomOpacityValue, value, 'arrowBottom');
    });
    
    // Subtle shimmer effect - gentle sweep across the heart
    const shimmerListenerId = shimmerAnim.addListener(({ value }) => {
      const translateX = value * 200 - 100; // -100 to 100
      const opacity = Math.sin(value * Math.PI) * 0.4; // 0 to 0.4, peaks in middle
      throttledSetState(setShimmerTranslateXValue, translateX, 'shimmerX');
      throttledSetState(setShimmerOpacityValue, opacity, 'shimmerOpacity');
    });
    
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000, // Slow, gentle sweep
        useNativeDriver: true,
      })
    ).start();
    
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
      shimmerAnim.removeListener(shimmerListenerId);
      sparkle1Pulse.removeListener(pulse1Id);
      sparkle2Pulse.removeListener(pulse2Id);
      sparkle3Pulse.removeListener(pulse3Id);
      sparkle4Pulse.removeListener(pulse4Id);
    };
  }, [throttledSetState]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  // Wobble rotation interpolation
  const wobbleRotate = heartRotateWobble.interpolate({
    inputRange: [0, 1],
    outputRange: ['-2deg', '2deg'],
  });

  return (
    <View style={styles.logoWrapper}>
      <Animated.View
        style={[
          styles.logoRotateGroup,
          {
            transform: [
              { rotate },
              { rotate: wobbleRotate },
            ],
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
              {/* Enhanced gradient with smoother transitions - all white */}
              <SvgLinearGradient id="heartGradientLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="25%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="75%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </SvgLinearGradient>
              {/* Shimmer gradient for subtle shine effect */}
              <SvgLinearGradient id="heartShimmerLogin" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
                <Stop offset="50%" stopColor="rgba(255, 255, 255, 0.5)" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
              </SvgLinearGradient>
              {/* Sparkle glow gradient */}
              <SvgLinearGradient id="sparkleGlowLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="rgba(255, 255, 255, 0.4)" stopOpacity="0.4" />
              </SvgLinearGradient>
              {/* Clip path for shimmer effect */}
              <ClipPath id="heartClipLogin">
                <Path
                  d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                  fill="#000000"
                />
              </ClipPath>
            </Defs>
            <G>
              {/* Heart with subtle white border for definition */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="url(#heartGradientLogin)"
                stroke="rgba(255, 255, 255, 0.9)"
                strokeWidth="0.8"
              />
              {/* Subtle inner highlight for depth */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="none"
                stroke="rgba(255, 255, 255, 0.25)"
                strokeWidth="0.3"
                opacity="0.6"
                transform="scale(0.96) translate(0.96, 0.96)"
              />
              {/* Subtle shimmer effect */}
              <G
                opacity={shimmerOpacityValue}
                transform={`translate(${shimmerTranslateXValue}, 0)`}
              >
                <Path
                  d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                  fill="url(#heartShimmerLogin)"
                  clipPath="url(#heartClipLogin)"
                />
              </G>
              {/* Top arrow - smaller, moved up to be outside heart */}
              <G>
                {/* Arrow line - moved up by 4 units */}
                <Path 
                  d="M30 6L36 6" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowTopOpacityValue}
                />
                {/* Arrow head - moved up by 4 units */}
                <Path 
                  d="M33 3L36 6L33 9" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowTopOpacityValue}
                />
                {/* Circle positioned away from arrow - moved up by 4 units */}
                <Circle cx="40" cy="6" r="2.5" fill="#ffffff" opacity={arrowTopOpacityValue} />
              </G>
              {/* Bottom arrow - smaller */}
              <G>
                {/* Arrow line */}
                <Path 
                  d="M18 38L12 38" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowBottomOpacityValue}
                />
                {/* Arrow head */}
                <Path 
                  d="M15 35L12 38L15 41" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowBottomOpacityValue}
                />
                {/* Circle positioned away from arrow */}
                <Circle cx="8" cy="38" r="2.5" fill="#ffffff" opacity={arrowBottomOpacityValue} />
              </G>
              {/* Sparkles with dynamic animations - scale, opacity, multi-directional movement, and pulse */}
              <G transform={`translate(${sparkle1TranslateXValue}, ${sparkle1TranslateYValue}) scale(${sparkle1ScaleValue * sparkle1PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="24" cy="8" r="2.2" fill="url(#sparkleGlowLogin)" opacity={sparkle1OpacityValue * 0.3 * sparkle1PulseValue} />
                <Circle cx="24" cy="8" r="1.5" fill="#ffffff" opacity={sparkle1OpacityValue * sparkle1PulseValue} />
              </G>
              <G transform={`translate(${sparkle2TranslateXValue}, ${sparkle2TranslateYValue}) scale(${sparkle2ScaleValue * sparkle2PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="40" cy="24" r="2.2" fill="url(#sparkleGlowLogin)" opacity={sparkle2OpacityValue * 0.3 * sparkle2PulseValue} />
                <Circle cx="40" cy="24" r="1.5" fill="#ffffff" opacity={sparkle2OpacityValue * sparkle2PulseValue} />
              </G>
              <G transform={`translate(${sparkle3TranslateXValue}, ${sparkle3TranslateYValue}) scale(${sparkle3ScaleValue * sparkle3PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="24" cy="40" r="2.2" fill="url(#sparkleGlowLogin)" opacity={sparkle3OpacityValue * 0.3 * sparkle3PulseValue} />
                <Circle cx="24" cy="40" r="1.5" fill="#ffffff" opacity={sparkle3OpacityValue * sparkle3PulseValue} />
              </G>
              <G transform={`translate(${sparkle4TranslateXValue}, ${sparkle4TranslateYValue}) scale(${sparkle4ScaleValue * sparkle4PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="8" cy="24" r="2.2" fill="url(#sparkleGlowLogin)" opacity={sparkle4OpacityValue * 0.3 * sparkle4PulseValue} />
                <Circle cx="8" cy="24" r="1.5" fill="#ffffff" opacity={sparkle4OpacityValue * sparkle4PulseValue} />
              </G>
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

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

// Lightweight form - local state only, so keystrokes don't trigger parent (AnimatedLogo) re-renders.
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
          <Text style={styles.inputIcon}>📱</Text>
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
      // Do not navigate here. AppNavigator will redirect based on auth state and age gate:
      // if age gate not passed → AgeGate, then MainTabs; otherwise → MainTabs (profile stub is created on the server).
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
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
          >
          <View style={styles.header}>
            <AnimatedLogo />
            <Text style={styles.title}>Welcome to Mulligan</Text>
            <Text style={styles.subtitle}>Enter your phone number to get started</Text>
          </View>

          <PhoneForm loading={loading} error={error} onSubmit={handlePhoneSubmit} />
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
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
        <View style={styles.header}>
          <AnimatedLogo />
          <Text style={styles.title}>Verify Your Phone</Text>
          <Text style={styles.subtitle}>We sent a 6-digit code to {formatPhoneFast(submittedPhone)}</Text>
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
                <ActivityIndicator color="#8B1538" size="small" />
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
    marginBottom: 10,
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
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
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
    borderColor: '#8B1538',
  },
  resendButtonText: {
    color: '#8B1538',
    fontWeight: '600',
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
    lineHeight: 18,
  },
  footerLink: {
    fontSize: 12,
    color: '#8B1538',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

