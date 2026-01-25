import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import { useAuth } from '../context/AuthContext';
import TokenDisplay from '../components/TokenDisplay';
import MatchCelebration from '../components/MatchCelebration';
import LegalFooter from '../components/LegalFooter';
import NoTokensModal from '../components/NoTokensModal';
import OptimizedImage from '../components/OptimizedImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper function to render location with proper formatting
function renderLocation(location: string | null | undefined) {
  if (!location) return null;
  
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || '';
  const state = locationParts.slice(1).join(', ') || '';
  
  if (!state) {
    return <Text style={styles.location}>📍 {location}</Text>;
  }
  
  return (
    <View style={styles.locationContainer}>
      <Text style={styles.locationEmoji}>📍</Text>
      <View style={styles.locationTextContainer}>
        <Text style={styles.locationCity}>{city}</Text>
        <Text style={styles.locationComma}>, </Text>
        <Text style={styles.locationState}>{state}</Text>
      </View>
    </View>
  );
}

// Animated Heart Logo Component (matching login page exactly)
// Memoized to prevent parent re-renders when this component updates
const AnimatedLogo = memo(function AnimatedLogo() {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;
  const borderGlowAnim = useRef(new Animated.Value(0.6)).current;
  const arrowTopScale = useRef(new Animated.Value(1)).current;
  const arrowTopOpacity = useRef(new Animated.Value(0.9)).current;
  const arrowTopGlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const arrowBottomScale = useRef(new Animated.Value(1)).current;
  const arrowBottomOpacity = useRef(new Animated.Value(0.9)).current;
  const arrowBottomGlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle1GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle2GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle3GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle4GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
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
  const [arrowTopGlowOpacity, setArrowTopGlowOpacity] = useState(0.8);
  const [arrowBottomGlowOpacity, setArrowBottomGlowOpacity] = useState(0.8);
  const [sparkle1GlowOpacity, setSparkle1GlowOpacity] = useState(0.8);
  const [sparkle2GlowOpacity, setSparkle2GlowOpacity] = useState(0.8);
  const [sparkle3GlowOpacity, setSparkle3GlowOpacity] = useState(0.8);
  const [sparkle4GlowOpacity, setSparkle4GlowOpacity] = useState(0.8);
  const [shineTranslateXValue, setShineTranslateXValue] = useState(-100);
  const [shineOpacityValue, setShineOpacityValue] = useState(0);

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

    // Glow pulse animation - smooth and premium
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim, {
            toValue: 0.75,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1.08,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(borderGlowAnim, {
            toValue: 0.9,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim, {
            toValue: 0.5,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(borderGlowAnim, {
            toValue: 0.6,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();

    // Shine/shimmer effect - premium touch
    const shineTranslateXListenerId = shineAnim.addListener(({ value }) => {
      const translateX = (value - 0.5) * 200; // -100 to 100
      throttledSetState(setShineTranslateXValue, translateX, 'shineTranslateX');
    });
    
    const shineOpacityListenerId = shineAnim.addListener(({ value }) => {
      let opacity = 0;
      if (value >= 0.3 && value <= 0.7) {
        opacity = 0.4;
      } else if (value < 0.3) {
        opacity = (value / 0.3) * 0.4;
      } else if (value > 0.7) {
        opacity = ((1 - value) / 0.3) * 0.4;
      }
      throttledSetState(setShineOpacityValue, opacity, 'shineOpacity');
    });
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(shineAnim, {
          toValue: 0,
          duration: 0,
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
    
    // Arrow glow pulse animations
    const arrowGlowPulse = (opacity: Animated.Value, setter: (val: number) => void, key: string) => {
      const listenerId = opacity.addListener(({ value }) => {
        throttledSetState(setter, value, key);
      });
      
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      return listenerId;
    };
    
    const arrowTopGlowListenerId = arrowGlowPulse(arrowTopGlowOpacityAnim, setArrowTopGlowOpacity, 'arrowTopGlow');
    const arrowBottomGlowListenerId = arrowGlowPulse(arrowBottomGlowOpacityAnim, setArrowBottomGlowOpacity, 'arrowBottomGlow');
    
    // Sparkle glow pulse animations
    const sparkleGlowPulse = (opacity: Animated.Value, setter: (val: number) => void, key: string, delay: number) => {
      const listenerId = opacity.addListener(({ value }) => {
        throttledSetState(setter, value, key);
      });
      
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      return listenerId;
    };
    
    const sparkle1GlowListenerId = sparkleGlowPulse(sparkle1GlowOpacityAnim, setSparkle1GlowOpacity, 'sparkle1Glow', 0);
    const sparkle2GlowListenerId = sparkleGlowPulse(sparkle2GlowOpacityAnim, setSparkle2GlowOpacity, 'sparkle2Glow', 250);
    const sparkle3GlowListenerId = sparkleGlowPulse(sparkle3GlowOpacityAnim, setSparkle3GlowOpacity, 'sparkle3Glow', 500);
    const sparkle4GlowListenerId = sparkleGlowPulse(sparkle4GlowOpacityAnim, setSparkle4GlowOpacity, 'sparkle4Glow', 750);
    
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
      arrowTopGlowOpacityAnim.removeListener(arrowTopGlowListenerId);
      arrowBottomGlowOpacityAnim.removeListener(arrowBottomGlowListenerId);
      sparkle1GlowOpacityAnim.removeListener(sparkle1GlowListenerId);
      sparkle2GlowOpacityAnim.removeListener(sparkle2GlowListenerId);
      sparkle3GlowOpacityAnim.removeListener(sparkle3GlowListenerId);
      sparkle4GlowOpacityAnim.removeListener(sparkle4GlowListenerId);
      shineAnim.removeListener(shineTranslateXListenerId);
      shineAnim.removeListener(shineOpacityListenerId);
    };
  }, [throttledSetState]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0.5, 0.75],
    outputRange: [0.35, 0.55],
  });

  const borderGlowOpacity = borderGlowAnim.interpolate({
    inputRange: [0.6, 0.9],
    outputRange: [0.5, 0.7],
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
              {/* Premium gradient with smooth color stops */}
              <SvgLinearGradient id="heartGradientBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffc0d9" stopOpacity="1" />
                <Stop offset="20%" stopColor="#ffb3d1" stopOpacity="1" />
                <Stop offset="40%" stopColor="#ff9ec4" stopOpacity="1" />
                <Stop offset="60%" stopColor="#ff6b9d" stopOpacity="1" />
                <Stop offset="80%" stopColor="#ff85b3" stopOpacity="1" />
                <Stop offset="100%" stopColor="#ff6b9d" stopOpacity="1" />
              </SvgLinearGradient>
              {/* Enhanced glow gradient for depth */}
              <SvgLinearGradient id="heartGlowBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.3" />
                <Stop offset="50%" stopColor="#ff9ec4" stopOpacity="0.25" />
                <Stop offset="100%" stopColor="#ffb3d1" stopOpacity="0.3" />
              </SvgLinearGradient>
              {/* Shine gradient for premium effect */}
              <SvgLinearGradient id="heartShineBrowse" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
                <Stop offset="50%" stopColor="rgba(255, 255, 255, 0.6)" stopOpacity="0.6" />
                <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
              </SvgLinearGradient>
              {/* Glow gradient for arrows and sparkles */}
              <SvgLinearGradient id="arrowGlowBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ff6b9d" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="#ffb3d1" stopOpacity="0.8" />
              </SvgLinearGradient>
              <SvgLinearGradient id="sparkleGlowBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="50%" stopColor="#ffb3d1" stopOpacity="1" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </SvgLinearGradient>
            </Defs>
            <G>
              {/* Subtle glow layer for depth */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="url(#heartGlowBrowse)"
                opacity="0.2"
                transform="scale(1.08) translate(-1.92, -1.92)"
              />
              {/* White outer border layer - thin and elegant */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeLinejoin="round"
                opacity="0.95"
                transform="scale(1.04) translate(-0.96, -0.96)"
              />
              {/* Main heart with premium gradient */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="url(#heartGradientBrowse)"
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth="0.4"
              />
              {/* Inner white highlight for depth */}
              <Path
                d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                fill="none"
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="0.3"
                opacity="0.8"
                transform="scale(0.96) translate(0.96, 0.96)"
              />
              {/* Premium shine effect */}
              <G
                opacity={shineOpacityValue}
                transform={`translate(${shineTranslateXValue}, 0)`}
              >
                <Path
                  d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
                  fill="url(#heartShineBrowse)"
                  clipPath="url(#heartClipBrowse)"
                />
              </G>
              {/* Top arrow - with glow effects */}
              <G>
                {/* Arrow line with glow */}
                <Path 
                  d="M30 10L36 10" 
                  stroke="url(#arrowGlowBrowse)" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  opacity={arrowTopOpacityValue * 0.5}
                />
                <Path 
                  d="M30 10L36 10" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowTopOpacityValue}
                />
                {/* Arrow head with glow */}
                <Path 
                  d="M33 7L36 10L33 13" 
                  stroke="url(#arrowGlowBrowse)" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowTopOpacityValue * 0.5}
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
                {/* Glow behind arrow circle - positioned away from arrow */}
                <Circle cx="40" cy="10" r="4.5" fill="url(#arrowGlowBrowse)" opacity={arrowTopGlowOpacity} />
                <Circle cx="40" cy="10" r="3.5" fill="url(#arrowGlowBrowse)" opacity={arrowTopGlowOpacity * 0.7} />
                {/* Arrow circle - positioned away from arrow endpoint */}
                <Circle cx="40" cy="10" r="2.8" fill="url(#arrowGlowGradient)" opacity={arrowTopGlowOpacity} />
                <Circle cx="40" cy="10" r="2.5" fill="#ffffff" opacity={arrowTopOpacityValue} />
              </G>
              {/* Bottom arrow - with glow effects */}
              <G>
                {/* Arrow line with glow */}
                <Path 
                  d="M18 38L12 38" 
                  stroke="url(#arrowGlowBrowse)" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  opacity={arrowBottomOpacityValue * 0.5}
                />
                <Path 
                  d="M18 38L12 38" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowBottomOpacityValue}
                />
                {/* Arrow head with glow */}
                <Path 
                  d="M15 35L12 38L15 41" 
                  stroke="url(#arrowGlowBrowse)" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowBottomOpacityValue * 0.5}
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
                {/* Glow behind arrow circle - positioned away from arrow */}
                <Circle cx="8" cy="38" r="4.5" fill="url(#arrowGlowBrowse)" opacity={arrowBottomGlowOpacity} />
                <Circle cx="8" cy="38" r="3.5" fill="url(#arrowGlowBrowse)" opacity={arrowBottomGlowOpacity * 0.7} />
                {/* Arrow circle - positioned away from arrow endpoint */}
                <Circle cx="8" cy="38" r="2.8" fill="url(#arrowGlowGradient)" opacity={arrowBottomGlowOpacity} />
                <Circle cx="8" cy="38" r="2.5" fill="#ffffff" opacity={arrowBottomOpacityValue} />
              </G>
              {/* Sparkles with dynamic animations and glow effects */}
              <G transform={`translate(${sparkle1TranslateXValue}, ${sparkle1TranslateYValue}) scale(${sparkle1ScaleValue})`}>
                {/* Glow layers with pulse */}
                <Circle cx="24" cy="8" r="3.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle1GlowOpacity * 0.4} />
                <Circle cx="24" cy="8" r="2.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle1GlowOpacity * 0.6} />
                {/* Main sparkle */}
                <Circle cx="24" cy="8" r="2" fill="#ffffff" opacity={sparkle1OpacityValue} />
              </G>
              <G transform={`translate(${sparkle2TranslateXValue}, ${sparkle2TranslateYValue}) scale(${sparkle2ScaleValue})`}>
                {/* Glow layers with pulse */}
                <Circle cx="40" cy="24" r="3.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle2GlowOpacity * 0.4} />
                <Circle cx="40" cy="24" r="2.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle2GlowOpacity * 0.6} />
                {/* Main sparkle */}
                <Circle cx="40" cy="24" r="2" fill="#ffffff" opacity={sparkle2OpacityValue} />
              </G>
              <G transform={`translate(${sparkle3TranslateXValue}, ${sparkle3TranslateYValue}) scale(${sparkle3ScaleValue})`}>
                {/* Glow layers with pulse */}
                <Circle cx="24" cy="40" r="3.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle3GlowOpacity * 0.4} />
                <Circle cx="24" cy="40" r="2.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle3GlowOpacity * 0.6} />
                {/* Main sparkle */}
                <Circle cx="24" cy="40" r="2" fill="#ffffff" opacity={sparkle3OpacityValue} />
              </G>
              <G transform={`translate(${sparkle4TranslateXValue}, ${sparkle4TranslateYValue}) scale(${sparkle4ScaleValue})`}>
                {/* Glow layers with pulse */}
                <Circle cx="8" cy="24" r="3.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle4GlowOpacity * 0.4} />
                <Circle cx="8" cy="24" r="2.5" fill="url(#sparkleGlowBrowse)" opacity={sparkle4GlowOpacity * 0.6} />
                {/* Main sparkle */}
                <Circle cx="8" cy="24" r="2" fill="#ffffff" opacity={sparkle4OpacityValue} />
              </G>
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

// Animated Emoji Component for feature icons
function AnimatedEmoji({ emoji, delay = 0 }: { emoji: string; delay?: number }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle pulse animation (subtle and alive)
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation animation
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <Animated.View
      style={{
        transform: [
          { scale: scaleAnim },
          { rotate },
        ],
      }}
    >
      <Text style={styles.featureIcon}>{emoji}</Text>
    </Animated.View>
  );
}

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location?: string;
  bio?: string;
  photoUrl?: string;
  photos?: Photo[];
  interests: string[];
  lookingFor?: string;
  distance?: number | null;
}

export default function BrowseScreen() {
  const navigation = useNavigation();
  const { profile: userProfile, user, isAuthenticated } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  
  // Profile card animations
  const profileCardScale = useRef(new Animated.Value(0.9)).current;
  const profileCardOpacity = useRef(new Animated.Value(0)).current;
  const profileCardTranslateY = useRef(new Animated.Value(30)).current;
  const profileCardGlow = useRef(new Animated.Value(1)).current;
  const profileCardRotate = useRef(new Animated.Value(0)).current;
  const profileCardTiltX = useRef(new Animated.Value(0)).current;
  const profileCardTiltY = useRef(new Animated.Value(0)).current;
  const profileCardShadow = useRef(new Animated.Value(0)).current;
  
  // Connect button animations
  const connectButtonPulse = useRef(new Animated.Value(1)).current;
  const connectButtonGlow = useRef(new Animated.Value(0.5)).current;
  const connectButtonShimmer = useRef(new Animated.Value(0)).current;
  const connectButtonScale = useRef(new Animated.Value(1)).current;
  
  // Header gradient animation
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  
  // Interest tags animations
  const interestTagScales = useRef<{ [key: number]: Animated.Value }>({}).current;
  const interestTagOpacities = useRef<{ [key: number]: Animated.Value }>({}).current;
  
  // Floating particles for background
  const particleAnimations = useRef<Array<{
    translateY: Animated.Value;
    translateX: Animated.Value;
    opacity: Animated.Value;
    scale: Animated.Value;
  }>>([]).current;
  
  // Photo gallery animations
  const photoScale = useRef(new Animated.Value(1)).current;
  const photoOpacity = useRef(new Animated.Value(1)).current;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [showNoTokensModal, setShowNoTokensModal] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<{
    reasons: string[];
    sharedInterests: string[];
    sharedValues: number;
  } | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [browseUnlocked, setBrowseUnlocked] = useState<boolean>(false); // Start as locked (false)
  const [unlocking, setUnlocking] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false); // Track when auto-matching to prevent UI flash
  const [canClaimTokens, setCanClaimTokens] = useState<boolean>(false); // Track if user can claim tokens
  const socketRef = useRef<Socket | null>(null);
  
  // Button animations
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const shimmerTranslate = useRef(new Animated.Value(-200)).current;
  
  // Animated gradient colors (matching web version)
  const gradientPosition = useRef(new Animated.Value(0)).current;
  
  // Animated "Discover People" text
  const titleScale = useRef(new Animated.Value(0.9)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;

  const checkCanClaimTokens = async () => {
    try {
      const tokenData = await api.get<{ availableTokens: number; canClaimWeeklyToken: boolean }>('/tokens');
      setCanClaimTokens(tokenData.canClaimWeeklyToken || false);
    } catch (err) {
      // Silently fail - non-critical
      setCanClaimTokens(false);
    }
  };

  const checkBrowseUnlocked = async () => {
    try {
      // Try to fetch a profile - if we get 403, browsing is locked
      console.log('🔍 Checking browse status...');
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`);
      
      console.log('📊 Browse API response:', { 
        hasProfile: !!data.profile, 
        profile: data.profile ? 'exists' : 'null',
        hasMore: data.hasMore,
        total: data.total
      });
      
      // Only unlock if we actually got a profile (not just empty data)
      // If profile is null, browsing is still locked
      if (data.profile !== null && data.profile !== undefined) {
        console.log('✅ Browsing is unlocked - profile found:', data.profile.displayName);
        setBrowseUnlocked(true);
        return true;
      } else {
        // No profile returned - browsing is locked
        console.log('🔒 No profile returned - browsing is locked');
        setBrowseUnlocked(false);
        return false;
      }
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const errorMessage = err?.message || err?.error || '';
      
      // 403 status means browsing is locked
      if (status === 403) {
        console.log('🔒 Browsing is locked - need to unlock with token');
        setBrowseUnlocked(false);
        return false;
      }
      
      // Check error message for lock-related text
      if (errorMessage.toLowerCase().includes('browsing is locked') || 
          errorMessage.toLowerCase().includes('locked') ||
          errorMessage.toLowerCase().includes('use a token to unlock')) {
        console.log('🔒 Browsing is locked (from error message)');
        setBrowseUnlocked(false);
        return false;
      }
      
      // For other errors (network, etc), don't assume unlocked - show error
      console.error('❌ Browse check error:', err);
      setBrowseUnlocked(false); // Default to locked to be safe
      setError('Failed to check browse status. Please try again.');
      return false;
    }
  };

  const handleUnlockBrowse = useCallback(async () => {
    if (unlocking) return;
    
    // Check if user is authenticated
    if (!isAuthenticated || !user) {
      setError('Please log in first');
      setTimeout(() => setError(''), 5000);
      return;
    }
    
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      setError('Session expired. Please log in again.');
      setTimeout(() => setError(''), 5000);
      return;
    }
    
    setUnlocking(true);
    setError('');
    setIsAutoMatching(true); // Mark that we're auto-matching to prevent UI flash

    try {
      await api.post('/users/unlock-browse', {});
      // DON'T set browseUnlocked yet - wait until after match is created
      
      // Fetch the first profile after unlocking
      setLoading(true);
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`);

          if (data.profile) {
            // Fetch photos for this profile
            try {
              const photosData = await api.get<{ photos: Photo[] }>(
                `/photos/profile/${data.profile.id}`
              );
              data.profile.photos = photosData.photos;
            } catch (photoErr) {
              data.profile.photos = [];
            }
            
            // Automatically match with the first profile and show celebration
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            
            // Ensure we're still authenticated before connecting
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true); // Unlock so user can see the error
              return;
            }
            
            // Connect and create match - this will show the celebration
            await handleConnect(data.profile);
            
            // After match is created, wait a moment for celebration to appear, then unlock browsing
            setTimeout(() => {
              setBrowseUnlocked(true);
              setIsAutoMatching(false);
            }, 200);
          } else {
            // No profiles available - show notification and stay on landing page
            console.log('⚠️ No profiles available to match with');
            // Reset all states first - do this synchronously
            setCurrentProfile(null);
            setHasMore(data.hasMore);
            setIsAutoMatching(false);
            setUnlocking(false);
            setLoading(false);
            // Explicitly set browseUnlocked to false to show landing page
            setBrowseUnlocked(false);
            console.log('🔄 Set browseUnlocked to false, should show landing page');
            // Show notification - use setTimeout to ensure state updates first
            setTimeout(() => {
              Alert.alert(
                'No Profiles Available',
                'There are no other profiles to match with at the moment. Check back later for new people!',
                [{ 
                  text: 'OK',
                  onPress: () => {
                    // Ensure we stay on landing page after alert is dismissed
                    console.log('🔄 Alert dismissed, ensuring landing page stays visible');
                    setBrowseUnlocked(false);
                    setIsAutoMatching(false);
                  }
                }]
              );
            }, 100);
            return; // Exit early to prevent any further state changes
          }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to unlock browsing. Please try again.';
      const errorLower = errorMessage.toLowerCase();
      
      // If already unlocked, this is expected - just continue to fetch and match
      if (errorLower.includes('already unlocked') || errorLower.includes('browsing is already unlocked')) {
        console.log('✅ Browsing already unlocked, fetching and matching with first profile...');
        setIsAutoMatching(true); // Mark that we're auto-matching
        // DON'T set browseUnlocked yet - wait until after match is created
        setLoading(true);
        try {
          const data = await api.get<{
            profile: Profile | null;
            hasMore: boolean;
            offset: number;
            total: number;
          }>(`/users/browse?offset=0`);

          console.log('📊 Browse API response:', { 
            hasProfile: !!data.profile, 
            profile: data.profile ? data.profile.displayName : 'null',
            hasMore: data.hasMore,
            total: data.total
          });

          if (data.profile) {
            // Fetch photos for this profile
            try {
              const photosData = await api.get<{ photos: Photo[] }>(
                `/photos/profile/${data.profile.id}`
              );
              data.profile.photos = photosData.photos;
            } catch (photoErr) {
              data.profile.photos = [];
            }
            
            // Automatically match with the first profile and show celebration
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            
            // Ensure we're still authenticated before connecting
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true); // Unlock so user can see the error
              return;
            }
            
            // Connect and create match - this will show the celebration
            await handleConnect(data.profile);
            
            // After match is created, wait a moment for celebration to appear, then unlock browsing
            setTimeout(() => {
              setBrowseUnlocked(true);
              setIsAutoMatching(false);
            }, 200);
          } else {
            // No profiles available - show notification and stay on landing page
            console.log('⚠️ No profiles available to match with');
            // Reset all states first
            setCurrentProfile(null);
            setHasMore(data.hasMore);
            setIsAutoMatching(false);
            setUnlocking(false);
            setLoading(false);
            // Explicitly set browseUnlocked to false to show landing page
            setBrowseUnlocked(false);
            console.log('🔄 Set browseUnlocked to false, should show landing page');
            // Show notification - use setTimeout to ensure state updates first
            setTimeout(() => {
              Alert.alert(
                'No Profiles Available',
                'There are no other profiles to match with at the moment. Check back later for new people!',
                [{ 
                  text: 'OK',
                  onPress: () => {
                    // Ensure we stay on landing page after alert is dismissed
                    console.log('🔄 Alert dismissed, ensuring landing page stays visible');
                    setBrowseUnlocked(false);
                    setIsAutoMatching(false);
                  }
                }]
              );
            }, 100);
            return; // Exit early to prevent any further state changes
          }
        } catch (fetchErr: any) {
          console.error('❌ Fetch profile error:', fetchErr);
          setError(fetchErr?.message || 'Failed to load profiles');
          setTimeout(() => setError(''), 8000);
          setIsAutoMatching(false);
          setBrowseUnlocked(true); // Unlock so error can be shown
        }
      } else {
        // Only log and show error for unexpected errors
        console.error('❌ Unlock browse error:', err);
        
        // Check if it's an authentication error
        if (errorLower.includes('authentication required') || errorLower.includes('authentication')) {
          setError('Session expired. Please log in again.');
          // Clear invalid token
          await AsyncStorage.removeItem('token');
          setTimeout(() => setError(''), 5000);
          return;
        }
        
        setError(errorMessage);
        setTimeout(() => setError(''), 8000);
        setIsAutoMatching(false);
        // If error occurred, unlock browsing so user can see the error
        setBrowseUnlocked(true);
      }
    } finally {
      setUnlocking(false);
      // If we're not auto-matching anymore and no error occurred, ensure browsing is unlocked
      if (!isAutoMatching && !error) {
        setBrowseUnlocked(true);
      }
    }
  }, [unlocking, isAuthenticated, user, handleConnect]);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=${offset}`);

      console.log('📊 Browse API response:', { 
        hasProfile: !!data.profile, 
        profile: data.profile ? data.profile.displayName : 'null',
        hasMore: data.hasMore,
        total: data.total,
        offset
      });

      // If we get here, browsing is unlocked
      setBrowseUnlocked(true);

      if (data.profile) {
        // Fetch photos for this profile
        try {
          const photosData = await api.get<{ photos: Photo[] }>(
            `/photos/profile/${data.profile.id}`
          );
          data.profile.photos = photosData.photos;
        } catch (photoErr) {
          data.profile.photos = [];
        }
        setCurrentPhotoIndex(0);
      }

      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
      
      // Animate profile card entrance when new profile loads
      if (data.profile) {
        // Reset animation values
        profileCardScale.setValue(0.9);
        profileCardOpacity.setValue(0);
        profileCardTranslateY.setValue(30);
        profileCardGlow.setValue(1);
        
        // Initialize interest tag scales and opacities with staggered entrance
        data.profile.interests.slice(0, 6).forEach((_, idx) => {
          if (!interestTagScales[idx]) {
            interestTagScales[idx] = new Animated.Value(0.8);
          }
          if (!interestTagOpacities[idx]) {
            interestTagOpacities[idx] = new Animated.Value(0);
          }
          // Staggered entrance animation for interest tags
          Animated.sequence([
            Animated.delay(idx * 100),
            Animated.parallel([
              Animated.spring(interestTagScales[idx], {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
              }),
              Animated.timing(interestTagOpacities[idx], {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
            ]),
          ]).start();
        });
        
        // Animate profile card entrance
        Animated.parallel([
          Animated.spring(profileCardScale, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(profileCardOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(profileCardTranslateY, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Continuous glow pulse
        Animated.loop(
          Animated.sequence([
            Animated.timing(profileCardGlow, {
              toValue: 1.15,
              duration: 2000,
              useNativeDriver: false,
            }),
            Animated.timing(profileCardGlow, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: false,
            }),
          ])
        ).start();
        
        // Subtle rotation animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(profileCardRotate, {
              toValue: 0.5,
              duration: 4000,
              useNativeDriver: true,
            }),
            Animated.timing(profileCardRotate, {
              toValue: 0,
              duration: 4000,
              useNativeDriver: true,
            }),
          ])
        ).start();
        
        // Connect button continuous pulse
        Animated.loop(
          Animated.sequence([
            Animated.timing(connectButtonPulse, {
              toValue: 1.05,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(connectButtonPulse, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
          ])
        ).start();
        
        // Connect button glow
        Animated.loop(
          Animated.sequence([
            Animated.timing(connectButtonGlow, {
              toValue: 0.8,
              duration: 2000,
              useNativeDriver: false,
            }),
            Animated.timing(connectButtonGlow, {
              toValue: 0.5,
              duration: 2000,
              useNativeDriver: false,
            }),
          ])
        ).start();
        
        // Connect button shimmer
        Animated.loop(
          Animated.sequence([
            Animated.timing(connectButtonShimmer, {
              toValue: 1,
              duration: 3000,
              useNativeDriver: true,
            }),
            Animated.timing(connectButtonShimmer, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ])
        ).start();
        
        // Removed rotation effect - keeping pulse, shimmer, and glow effects instead
        
        // Photo entrance animation
        photoScale.setValue(0.95);
        photoOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(photoScale, {
            toValue: 1,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(photoOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]).start();
        
        // Header gradient animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(headerGradientPos, {
              toValue: 1,
              duration: 8000,
              useNativeDriver: false,
            }),
            Animated.timing(headerGradientPos, {
              toValue: 0,
              duration: 8000,
              useNativeDriver: false,
            }),
          ])
        ).start();
      }
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.error ||
        err?.message ||
        'Failed to load profiles';

      const errorLower = errorMessage.toLowerCase();
      const status = err?.status || err?.response?.status;

      // Check if browsing is locked (403 status)
      if (status === 403) {
        console.log('🔒 Browse endpoint returned 403 - browsing is locked');
        setBrowseUnlocked(false);
        setCurrentProfile(null);
        setError('');
        setLoading(false);
        return;
      }

      if (
        status === 400 ||
        errorLower.includes('complete your profile') ||
        errorLower.includes('please complete your profile') ||
        (errorLower.includes('profile') &&
          (errorLower.includes('not found') || errorLower.includes('complete')))
      ) {
        setCurrentProfile(null);
        setError('');
      } else {
        setError(errorMessage);
        setCurrentProfile(null);
      }
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [offset]);

  useEffect(() => {
    // Always start with landing page - don't check unlock status on mount
    // User must explicitly unlock browsing to see profiles
    if (!hasFetched) {
      console.log('🔍 Initial load - showing landing page (browsing locked by default)');
      setBrowseUnlocked(false);
      setHasFetched(true);
      setLoading(false);
    }
  }, []);

  // Reset to landing page when tab is focused
  useFocusEffect(
    useCallback(() => {
      // When the Connect tab is focused, always reset to show the landing page
      // This allows users to click "Connect" again to match with a new profile
      console.log('🔄 Connect tab focused - resetting to landing page');
      setBrowseUnlocked(false);
      setCurrentProfile(null);
      setOffset(0);
      setError('');
      setLoading(false);
      // Check if user can claim tokens when screen focuses (non-blocking)
      // Use setTimeout to avoid blocking navigation
      setTimeout(() => {
        checkCanClaimTokens();
      }, 0);
    }, [])
  );

  useEffect(() => {
    if (hasFetched && offset > 0) {
      fetchProfile();
    }
  }, [offset]);

  // Initialize socket connection
  useEffect(() => {
    let socket: Socket | null = null;

    const initSocket = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !userProfile) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Browse: Connected to WebSocket server');
      });

      socket.on('disconnect', () => {
        console.log('❌ Browse: Disconnected from WebSocket server');
      });

      socket.on('new_match', (data: {
        matchId: string;
        otherUserId: string;
        otherUserName: string;
        message: string;
        stage: string;
      }) => {
        setMatchNotification(data.message);
        setTimeout(() => setMatchNotification(null), 5000);
      });
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [userProfile]);

  // Show landing page when browsing is locked OR when auto-matching (to prevent UI flash)
  const showLandingPage = (browseUnlocked === false || isAutoMatching) && !needsProfile && !showMatchCelebration;
  
  console.log('🎨 Landing page state:', { 
    browseUnlocked, 
    needsProfile, 
    showLandingPage,
    loading,
    hasFetched
  });

  // Button pulse animation (only when landing page is shown)
  // MUST be before any early returns
  useEffect(() => {
    if (showLandingPage && !unlocking) {
      // Animate "Discover People" title
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start();


      // Continuous pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(buttonPulse, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Shimmer effect
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerTranslate, {
            toValue: 400,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerTranslate, {
            toValue: -200,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Animated gradient shift (matching web version) - animate colors
      Animated.loop(
        Animated.sequence([
          Animated.timing(gradientPosition, {
            toValue: 1,
            duration: 8000,
            useNativeDriver: false, // Colors can't use native driver
          }),
          Animated.timing(gradientPosition, {
            toValue: 0,
            duration: 8000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      // Stop animations when not on landing page or when unlocking
      buttonPulse.setValue(1);
      shimmerTranslate.setValue(-200);
      gradientPosition.setValue(0);
      titleScale.setValue(0.9);
      titleOpacity.setValue(0);
      titleTranslateY.setValue(20);
    }
  }, [showLandingPage, unlocking]);

  const handleConnect = useCallback(async (profile: Profile) => {
    // Haptic feedback - vibrate IMMEDIATELY when user clicks connect (before any checks)
    // This ensures vibration works even if the function returns early
    try {
      if (Platform.OS === 'ios') {
        Vibration.vibrate([0, 100]); // iOS pattern: [delay, duration] for more reliable vibration
      } else {
        Vibration.vibrate(100); // Android: Duration in milliseconds
      }
    } catch (error) {
      // Silently fail - vibration is non-critical
      console.warn('Vibration error (non-critical):', error);
    }

    if (connecting) return;

    setConnecting(true);
    setError('');

    try {
      // Ensure we have a valid token before making the request
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      console.log('🔗 Connecting with profile:', profile.displayName, 'userId:', profile.userId);
      const result = await api.post<{
        message: string;
        isMutual: boolean;
        matchId: string;
        stage: string;
        explanation?: {
          reasons: string[];
          sharedInterests: string[];
          sharedValues: number;
        } | null;
      }>('/matches/connect', { targetUserId: profile.userId });

      // Success! Automatically show match celebration
      console.log('✅ Match created successfully:', result);
      console.log('🎉 Setting match celebration with profile:', profile);
      
      // Clear the current profile immediately so it doesn't show behind the celebration
      setCurrentProfile(null);
      
      // Validate required data before setting state
      if (!profile || !result.matchId) {
        console.error('❌ Invalid match data:', { profile, matchId: result.matchId });
        throw new Error('Invalid match response from server');
      }
      
      // Set matched profile, match ID, and explanation first, then show celebration
      // This ensures both states are set before React re-renders
      try {
        setMatchedProfile(profile);
        setMatchId(result.matchId);
        setMatchExplanation(result.explanation || null);
        
        // Show celebration immediately - no delay needed
        // React will batch the state updates efficiently
        try {
          setShowMatchCelebration(true);
          console.log('🎉 Celebration state set - showMatchCelebration: true, matchedProfile:', profile?.displayName, 'matchId:', result.matchId);
        } catch (celebrationError) {
          console.error('❌ Error setting celebration state:', celebrationError);
          // Fallback: show error but don't crash
          Alert.alert('Match Created!', 'You matched with ' + (profile?.displayName || 'someone') + '! Check your matches to start chatting.');
          setConnecting(false);
        }
      } catch (stateError) {
        console.error('❌ Error setting match state:', stateError);
        // Fallback: show success message even if state setting fails
        Alert.alert('Match Created!', 'You matched with ' + (profile?.displayName || 'someone') + '! Check your matches to start chatting.');
        setConnecting(false);
        return;
      }
      
      setConnecting(false);
    } catch (err: any) {
      console.error('❌ Connect error:', err);
      let errorMessage = 'Failed to connect. Please try again.';
      let isTokenError = false;

      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
        if ('status' in err) {
          const apiErr = err as Error & { status: number };
          if (apiErr.status === 400) {
            // Check if this is a token error
            const errorLower = errorMessage.toLowerCase();
            if (errorLower.includes('no tokens') || 
                errorLower.includes('claim your weekly token') ||
                (err as any).code === 'NO_TOKENS') {
              isTokenError = true;
              setShowNoTokensModal(true);
              setConnecting(false);
              
              // If we were auto-matching and got an error, unlock browsing
              if (isAutoMatching) {
                setIsAutoMatching(false);
                setBrowseUnlocked(true);
              }
              return; // Don't show regular error message for token errors
            }
            errorMessage =
              err.message ||
              'Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.';
          } else if (apiErr.status === 401 || apiErr.status === 403) {
            errorMessage = 'Session expired. Please log in again.';
            // Clear invalid token
            await AsyncStorage.removeItem('token');
          } else if (apiErr.status === 404) {
            errorMessage = 'Profile not found. Please refresh and try again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
      }

      // Check for authentication-related error messages
      const errorLower = errorMessage.toLowerCase();
      if (errorLower.includes('authentication required') || 
          errorLower.includes('invalid or expired token') ||
          errorLower.includes('authentication')) {
        errorMessage = 'Session expired. Please log in again.';
        await AsyncStorage.removeItem('token');
      }

      setError(errorMessage);
      setTimeout(() => setError(''), 8000);
      setConnecting(false);
      
      // If we were auto-matching and got an error, unlock browsing so user can see the error
      if (isAutoMatching) {
        setIsAutoMatching(false);
        setBrowseUnlocked(true);
      }
    }
  }, [isAutoMatching]);

  const handleCelebrationClose = useCallback(() => {
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setMatchId(null);
    setMatchExplanation(null);
    // Ensure browsing is unlocked after celebration closes
    setBrowseUnlocked(true);
    setIsAutoMatching(false);
    // Move to next profile after celebration
    setOffset((prev) => prev + 1);
    fetchProfile();
  }, [fetchProfile]);

  const needsProfile = !userProfile && !loading;

  const photos = currentProfile?.photos || [];
  const primaryPhoto = photos.find((p) => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : currentProfile?.photoUrl
    ? getPhotoUrl(currentProfile.photoUrl)
    : null;

  // Only show initial loading screen if we're not auto-matching (auto-matching should show landing page)
  if (loading && !hasFetched && !isAutoMatching) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Finding Amazing People</Text>
        <Text style={styles.loadingSubtitle}>Searching for your perfect match</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, showLandingPage && { backgroundColor: 'transparent' }]}>
      {/* Beautiful gradient background (matching web version) - full screen behind everything */}
      {showLandingPage && (
        <LinearGradient
          colors={[
            '#667eea', // Vibrant Purple
            '#764ba2', // Purple-pink
            '#f093fb', // Bright Pink
            '#f5576c', // Coral
            '#4facfe', // Blue
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        />
      )}
      
      <ScrollView 
        style={[styles.scrollView, showLandingPage && { backgroundColor: 'transparent' }]} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Match Notification */}
        {matchNotification && (
          <TouchableOpacity
            style={styles.notification}
            onPress={() => {
              setMatchNotification(null);
              navigation.navigate('Matches' as never);
            }}
          >
            <Text style={styles.notificationText}>{matchNotification}</Text>
          </TouchableOpacity>
        )}

        {/* Browse Locked State - Beautiful Landing Page */}
        {showLandingPage ? (
          <View style={styles.landingPageWrapper}>
          {/* Token display on landing page */}
          <View style={styles.landingTokenContainer}>
            {canClaimTokens && (
              <View style={styles.claimTokenBannerLanding}>
                <Text style={styles.claimTokenTextLanding}>✨ Claim your 7 tokens!</Text>
              </View>
            )}
            <TokenDisplay compact={true} premium={true} />
          </View>
          
          <View style={styles.landingContainer}>
            {/* Main content */}
            <View style={styles.landingContent}>
              <View style={styles.landingLogoContainer}>
                <AnimatedLogo />
                <Text style={styles.landingLogoText}>Mulligan</Text>
              </View>
              
              <Animated.Text
                style={[
                  styles.landingTitle,
                  {
                    opacity: titleOpacity,
                    transform: [
                      { scale: titleScale },
                      { translateY: titleTranslateY },
                    ],
                  },
                ]}
              >
                Discover People
              </Animated.Text>
              <Text style={styles.landingSubtitle}>
                Find someone who shares your interests and values
              </Text>
              
              <View style={styles.landingFeatures}>
                <View style={styles.featureItem}>
                  <AnimatedEmoji emoji="✨" delay={0} />
                  <Text style={styles.featureText} numberOfLines={2}>
                    Quality{'\n'}Matches
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <AnimatedEmoji emoji="🎯" delay={500} />
                  <Text style={styles.featureText} numberOfLines={2}>
                    Shared{'\n'}Interests
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <AnimatedEmoji emoji="💝" delay={1000} />
                  <Text style={styles.featureText} numberOfLines={2} adjustsFontSizeToFit={true} minimumFontScale={0.85}>
                    Meaningful{'\n'}Connections
                  </Text>
                </View>
              </View>
              
              <Animated.View
                style={[
                  styles.landingButtonContainer,
                  {
                    transform: [{ scale: buttonPulse }],
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={handleUnlockBrowse}
                  onPressIn={() => {
                    Animated.spring(buttonScale, {
                      toValue: 0.95,
                      useNativeDriver: true,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(buttonScale, {
                      toValue: 1,
                      useNativeDriver: true,
                    }).start();
                  }}
                  disabled={unlocking}
                  activeOpacity={0.9}
                  style={styles.landingButtonTouchable}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.landingButton,
                      unlocking && styles.landingButtonDisabled,
                    ]}
                  >
                    {/* Shimmer effect overlay */}
                    {!unlocking && (
                      <Animated.View
                        style={[
                          styles.buttonShimmer,
                          {
                            transform: [{ translateX: shimmerTranslate }],
                          },
                        ]}
                      />
                    )}
                    
                    <Animated.View
                      style={{
                        transform: [{ scale: buttonScale }],
                      }}
                    >
                      {unlocking ? (
                        <ActivityIndicator color="#fff" size="large" />
                      ) : (
                        <Text style={styles.landingButtonText} numberOfLines={1}>
                        Connect
                      </Text>
                      )}
                    </Animated.View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
              
              <Text style={styles.landingHint}>
                Use a token to see your match ❤️
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Header - only show when not on landing page */}
          <Animated.View style={styles.header}>
            <Animated.View 
              style={[
                styles.headerGradientOverlay,
                {
                  opacity: headerGradientPos.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.15, 0.25],
                  }),
                },
              ]}
            />
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }} />
              <View style={styles.tokenContainer}>
                {canClaimTokens && (
                  <View style={styles.claimTokenBanner}>
                    <Text style={styles.claimTokenText}>✨ Claim your 7 tokens!</Text>
                  </View>
                )}
                <TokenDisplay compact={true} premium={true} />
              </View>
            </View>
            <Animated.Text
              style={[
                styles.title,
                {
                  opacity: titleOpacity,
                  transform: [
                    { scale: titleScale },
                    { translateY: titleTranslateY },
                  ],
                },
              ]}
            >
              Discover People
            </Animated.Text>
            <Text style={styles.subtitle}>Find someone who shares your interests and values</Text>
          </Animated.View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Other states - only show when not on landing page */}
      {!showLandingPage && (
        <>
          {needsProfile ? (
        <View style={styles.noProfileContainer}>
          <Text style={styles.noProfileEmoji}>🚀</Text>
          <Text style={styles.noProfileText}>
            Create your profile to start discovering people!
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateProfile' as never)}
          >
            <Text style={styles.createButtonText}>Create Profile</Text>
          </TouchableOpacity>
        </View>
      ) : !currentProfile && !loading ? (
        <View style={styles.noMoreContainer}>
          <Text style={styles.noMoreEmoji}>🔍</Text>
          <Text style={styles.noMoreTitle}>No more profiles</Text>
          <Text style={styles.noMoreText}>
            You've seen everyone! Check back later for new people.
          </Text>
        </View>
      ) : currentProfile ? (
        <Animated.View 
          style={[
            styles.profileCard,
            {
              opacity: profileCardOpacity,
              transform: [
                { scale: profileCardScale },
                { translateY: profileCardTranslateY },
                {
                  rotate: profileCardRotate.interpolate({
                    inputRange: [0, 0.5],
                    outputRange: ['0deg', '1deg'],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Pulsating glow effect around profile card */}
          <Animated.View
            style={[
              styles.profileCardGlow,
              {
                opacity: profileCardGlow.interpolate({
                  inputRange: [1, 1.15],
                  outputRange: [0.3, 0.6],
                }),
                transform: [
                  {
                    scale: profileCardGlow,
                  },
                ],
              },
            ]}
          />
          <View style={styles.profileCardContent}>
          {/* Photo Gallery */}
          {photos.length > 0 ? (
            <View style={styles.photoGallery}>
              <Animated.View
                style={{
                  transform: [{ scale: photoScale }],
                  opacity: photoOpacity,
                }}
              >
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(event) => {
                    const index = Math.round(
                      event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                    );
                    setCurrentPhotoIndex(index);
                    // Animate photo change
                    photoScale.setValue(0.98);
                    photoOpacity.setValue(0.9);
                    Animated.parallel([
                      Animated.spring(photoScale, {
                        toValue: 1,
                        tension: 50,
                        friction: 8,
                        useNativeDriver: true,
                      }),
                      Animated.timing(photoOpacity, {
                        toValue: 1,
                        duration: 300,
                        useNativeDriver: true,
                      }),
                    ]).start();
                  }}
                  style={styles.photoScrollView}
                >
                  {photos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: getPhotoUrl(photo.url) }}
                      style={[styles.profilePhoto, { width: SCREEN_WIDTH - 40 }]}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              </Animated.View>
              {photos.length > 1 && (
                <View style={styles.photoIndicators}>
                  {photos.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.photoIndicator,
                        index === currentPhotoIndex && styles.photoIndicatorActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : profilePhotoUrl ? (
            <OptimizedImage
              source={currentProfile.photoUrl}
              style={styles.profilePhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {currentProfile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{currentProfile.displayName}</Text>
              <Text style={styles.age}>{currentProfile.age}</Text>
            </View>

            {renderLocation(currentProfile.location)}

            {currentProfile.distance !== null && currentProfile.distance !== undefined && (
              <Text style={styles.distance}>
                {Math.round(currentProfile.distance)} miles away
              </Text>
            )}

            {currentProfile.bio && (
              <Text style={styles.bio}>{currentProfile.bio}</Text>
            )}

            {currentProfile.lookingFor && (
              <View style={styles.lookingForContainer}>
                <Text style={styles.lookingForLabel}>Looking for:</Text>
                <Text style={styles.lookingForValue}>{currentProfile.lookingFor}</Text>
              </View>
            )}

            {currentProfile.interests.length > 0 && (
              <View style={styles.interestsContainer}>
                <Text style={styles.interestsLabel}>Interests:</Text>
                <View style={styles.interestsList}>
                  {currentProfile.interests.slice(0, 6).map((interest, idx) => {
                    const scaleAnim = interestTagScales[idx] || new Animated.Value(0.8);
                    const opacityAnim = interestTagOpacities[idx] || new Animated.Value(0);
                    if (!interestTagScales[idx]) {
                      interestTagScales[idx] = scaleAnim;
                    }
                    if (!interestTagOpacities[idx]) {
                      interestTagOpacities[idx] = opacityAnim;
                    }
                    return (
                      <Animated.View
                        key={idx}
                        style={[
                          styles.interestTag,
                          {
                            transform: [{ scale: scaleAnim }],
                            opacity: opacityAnim,
                          },
                        ]}
                      >
                        <Text style={styles.interestText}>{interest}</Text>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Connect Button - Automatically creates match */}
          <TouchableOpacity
            style={styles.connectButton}
            onPress={() => handleConnect(currentProfile)}
            disabled={connecting}
            activeOpacity={0.9}
          >
            <Animated.View
              style={[
                {
                  transform: [
                    { scale: Animated.multiply(connectButtonPulse, connectButtonScale) },
                  ],
                },
              ]}
            >
              <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.connectButtonGradient,
                    connecting && styles.connectButtonDisabled,
                    {
                      shadowOpacity: connectButtonGlow.interpolate({
                        inputRange: [0.5, 0.8],
                        outputRange: [0.45, 0.7],
                      }),
                      shadowRadius: connectButtonGlow.interpolate({
                        inputRange: [0.5, 0.8],
                        outputRange: [20, 30],
                      }),
                    },
                  ]}
                >
                {/* Enhanced shimmer effect */}
                <Animated.View
                  style={[
                    styles.connectButtonShimmer,
                    {
                      transform: [
                        {
                          translateX: connectButtonShimmer.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-200, 400],
                          }),
                        },
                        {
                          rotate: connectButtonShimmer.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-20deg', '-20deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                {connecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.connectButtonText} numberOfLines={1}>
                    Connect & Match 🎟️
                  </Text>
                )}
              </LinearGradient>
            </Animated.View>
        </TouchableOpacity>
          </View>
        </Animated.View>
      ) : null}
        </>
      )}

      {/* Match Celebration Modal */}
      {showMatchCelebration && matchedProfile && matchId && (
        <MatchCelebration
          profileName={matchedProfile.displayName || 'Someone'}
          photoUrl={
            matchedProfile.photos?.find((p) => p.isPrimary)?.url ||
            matchedProfile.photos?.[0]?.url ||
            matchedProfile.photoUrl ||
            undefined
          }
          onClose={handleCelebrationClose}
          explanation={matchExplanation}
          matchId={matchId}
        />
      )}

      {/* No Tokens Modal */}
      <NoTokensModal
        visible={showNoTokensModal}
        onClose={() => {
          setShowNoTokensModal(false);
          // Reset to landing page when modal closes
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
          setCurrentProfile(null);
        }}
        onTokenClaimed={() => {
          // Refresh token display if needed
          setShowNoTokensModal(false);
          // Reset to landing page after claiming tokens
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
          setCurrentProfile(null);
        }}
      />

      {/* Legal Footer */}
      <LegalFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginTop: 20,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  loadingSubtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  notification: {
    position: 'absolute',
    top: 20,
    left: '5%',
    right: '5%',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 0,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  headerGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#667eea',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    margin: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  noProfileContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  noProfileEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  noProfileText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  noMoreContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  noMoreEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  noMoreText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Landing page styles (when browsing is locked)
  landingPageWrapper: {
    flex: 1,
    minHeight: Dimensions.get('window').height - 100,
    paddingTop: 40,
    paddingBottom: 40,
    position: 'relative',
    justifyContent: 'center',
  },
  landingTokenContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  landingContainer: {
    position: 'relative',
    marginHorizontal: 20,
    borderRadius: 32,
    overflow: 'hidden',
    minHeight: 600,
  },
  // landingGradient removed - now using animated LinearGradient component
  landingContent: {
    padding: 52,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Glassmorphism effect
    borderRadius: 36,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
    backdropFilter: 'blur(20px)', // Note: React Native doesn't support backdrop-filter, but keeping for web compatibility
  },
  landingLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 16,
  },
  logoWrapper: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  logoRotateGroup: {
    width: 90,
    height: 90,
  },
  landingLogoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#000000',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    letterSpacing: 0.5,
  },
  landingTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(102, 126, 234, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 20,
  },
  landingSubtitle: {
    fontSize: 18,
    color: '#555',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 28,
    paddingHorizontal: 20,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  landingFeatures: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
    marginBottom: 48,
    paddingHorizontal: 12,
    gap: 10, // Consistent gap between all cards
  },
  featureItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1, // Equal flex distribution
    maxWidth: 110, // Maximum width to prevent cards from getting too wide
    minWidth: 90, // Minimum width for readability
    paddingHorizontal: 6,
    paddingVertical: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  featureText: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 15,
    width: '100%',
    marginTop: 4,
    letterSpacing: 0.05,
    includeFontPadding: false,
    flexWrap: 'wrap',
    paddingHorizontal: 1,
  },
  landingButtonContainer: {
    width: '100%',
    marginBottom: 16,
  },
  landingButtonTouchable: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  landingButton: {
    paddingHorizontal: 48,
    paddingVertical: 24,
    borderRadius: 28,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 70,
  },
  buttonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  landingButtonDisabled: {
    opacity: 0.6,
  },
  landingButtonText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
    textAlign: 'center',
    includeFontPadding: false,
  },
  landingButtonSubtext: {
    color: '#fff',
    fontSize: 15,
    opacity: 0.95,
    fontWeight: '500',
  },
  landingHint: {
    fontSize: 14,
    color: '#000',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '400',
    lineHeight: 20,
  },
  // Keep old styles for backward compatibility
  lockedContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  lockedEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  lockedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  unlockButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  unlockButtonDisabled: {
    opacity: 0.6,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 32,
    overflow: 'visible',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 15 },
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 3,
    borderColor: '#fff',
    width: SCREEN_WIDTH - 40,
    alignSelf: 'center',
    position: 'relative',
  },
  profileCardGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 52,
    backgroundColor: '#667eea',
    zIndex: -1,
  },
  profileCardContent: {
    backgroundColor: '#fff',
    borderRadius: 32,
    overflow: 'hidden',
  },
  photoGallery: {
    position: 'relative',
  },
  photoScrollView: {
    height: SCREEN_WIDTH * 1.2,
  },
  profilePhoto: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  photoIndicatorActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  photoPlaceholder: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 80,
    color: '#fff',
    fontWeight: 'bold',
  },
  profileInfo: {
    padding: 24,
    backgroundColor: '#fff',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  name: {
    fontSize: 34,
    fontWeight: '900',
    color: '#1a1a1a',
    marginRight: 8,
    letterSpacing: -0.6,
    textShadowColor: 'rgba(102, 126, 234, 0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  age: {
    fontSize: 28,
    color: '#666',
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationEmoji: {
    fontSize: 17,
    marginRight: 6,
  },
  locationTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  locationCity: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  locationComma: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  locationState: {
    fontSize: 17,
    color: '#555',
    fontWeight: '500',
  },
  location: {
    fontSize: 17,
    color: '#555',
    marginBottom: 6,
    fontWeight: '500',
  },
  distance: {
    fontSize: 15,
    color: '#888',
    marginBottom: 16,
    fontWeight: '500',
  },
  bio: {
    fontSize: 17,
    color: '#1a1a1a',
    lineHeight: 26,
    marginBottom: 20,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  lookingForContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  lookingForLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  lookingForValue: {
    fontSize: 14,
    color: '#333',
  },
  interestsContainer: {
    marginBottom: 20,
  },
  interestsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  interestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    backgroundColor: '#f8f9ff',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e7ff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  interestText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  connectButton: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 28,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  connectButtonGradient: {
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minHeight: 60,
    overflow: 'hidden',
    position: 'relative',
  },
  connectButtonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-20deg' }],
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
    textAlign: 'center',
    includeFontPadding: false,
    flexWrap: 'nowrap',
  },
  tokenContainer: {
    alignItems: 'flex-end',
  },
  claimTokenBanner: {
    backgroundColor: '#f5576c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  claimTokenText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  claimTokenBannerLanding: {
    backgroundColor: '#f5576c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  claimTokenTextLanding: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
