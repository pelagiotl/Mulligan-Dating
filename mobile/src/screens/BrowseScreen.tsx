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
  Modal,
} from 'react-native';
import { TouchableOpacity as GestureTouchable } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, ClipPath } from 'react-native-svg';
import { useNavigation, useRoute, useFocusEffect, useIsFocused, CommonActions } from '@react-navigation/native';
import { setPendingOpenMatchId, clearPendingOpenMatchId } from '../utils/pendingMatchOpen';
import { initiatorMatchIdRef, connectInitiatorAtRef } from '../utils/currentMatchView';
import { navigationRef } from '../navigation/navigationRef';
import { playMatchSound } from '../utils/sounds';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, prefetchToken, ensureTokenPrefetched, clearTokenCache } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import { useAuth } from '../context/AuthContext';
import TokenDisplay from '../components/TokenDisplay';
import MatchCelebration from '../components/MatchCelebration';
import LegalFooter from '../components/LegalFooter';
import NoTokensModal from '../components/NoTokensModal';
import OptimizedImage from '../components/OptimizedImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MIN_PHOTOS_TO_CONNECT = 5;

const MAX_DISTANCE_OPTIONS: (number | null)[] = [10, 25, 50, 100, 250, 500, null]; // null = Any distance

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
  // Sparkle pulse animations for brightness variation (matching login page)
  const sparkle1Pulse = useRef(new Animated.Value(1)).current;
  const sparkle2Pulse = useRef(new Animated.Value(1)).current;
  const sparkle3Pulse = useRef(new Animated.Value(1)).current;
  const sparkle4Pulse = useRef(new Animated.Value(1)).current;
  // Sparkle glow opacity animations (for listener-driven state updates)
  const sparkle1GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle2GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle3GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;
  const sparkle4GlowOpacityAnim = useRef(new Animated.Value(0.8)).current;

  // State for SVG values (react-native-svg doesn't support Animated.Value directly)
  // Throttle updates to reduce re-renders and tab lag (was 16ms = 60/sec; 120ms = ~8/sec)
  const lastUpdateRef = useRef<{ [key: string]: number }>({});
  const THROTTLE_MS = 120;
  
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
  const [arrowTopGlowOpacityValue, setArrowTopGlowOpacity] = useState(0.8);
  const [arrowBottomGlowOpacityValue, setArrowBottomGlowOpacity] = useState(0.8);
  const [shimmerTranslateXValue, setShimmerTranslateXValue] = useState(-100);
  const [shimmerOpacityValue, setShimmerOpacityValue] = useState(0);
  const [sparkle1PulseValue, setSparkle1PulseValue] = useState(1);
  const [sparkle2PulseValue, setSparkle2PulseValue] = useState(1);
  const [sparkle3PulseValue, setSparkle3PulseValue] = useState(1);
  const [sparkle4PulseValue, setSparkle4PulseValue] = useState(1);
  const [sparkle1GlowOpacityValue, setSparkle1GlowOpacity] = useState(0.8);
  const [sparkle2GlowOpacityValue, setSparkle2GlowOpacity] = useState(0.8);
  const [sparkle3GlowOpacityValue, setSparkle3GlowOpacity] = useState(0.8);
  const [sparkle4GlowOpacityValue, setSparkle4GlowOpacity] = useState(0.8);

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];

    // Continuous rotation (4s linear infinite - matching frontend)
    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    );
    loops.push(rotateLoop);
    rotateLoop.start();

    // Heart beat (2s ease-in-out infinite - matching frontend keyframes)
    const heartLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartScale, {
          toValue: 1.1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1.1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(heartScale, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    loops.push(heartLoop);
    heartLoop.start();

    // Glow pulse animation - smooth and premium
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowAnim, { toValue: 0.75, duration: 2500, useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1.08, duration: 2500, useNativeDriver: true }),
          Animated.timing(borderGlowAnim, { toValue: 0.9, duration: 2500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowAnim, { toValue: 0.5, duration: 2500, useNativeDriver: true }),
          Animated.timing(glowScale, { toValue: 1, duration: 2500, useNativeDriver: true }),
          Animated.timing(borderGlowAnim, { toValue: 0.6, duration: 2500, useNativeDriver: true }),
        ]),
      ])
    );
    loops.push(glowLoop);
    glowLoop.start();

    // Sparkle pulse animations for subtle brightness variation (matching login page)
    const sparklePulse = (pulseAnim: Animated.Value, setter: (val: number) => void, key: string, delay: number) => {
      const listenerId = pulseAnim.addListener(({ value }) => {
        throttledSetState(setter, value, key);
      });
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      loops.push(loop);
      loop.start();
      return listenerId;
    };

    const pulse1Id = sparklePulse(sparkle1Pulse, setSparkle1PulseValue, 'sparkle1Pulse', 0);
    const pulse2Id = sparklePulse(sparkle2Pulse, setSparkle2PulseValue, 'sparkle2Pulse', 400);
    const pulse3Id = sparklePulse(sparkle3Pulse, setSparkle3PulseValue, 'sparkle3Pulse', 800);
    const pulse4Id = sparklePulse(sparkle4Pulse, setSparkle4PulseValue, 'sparkle4Pulse', 1200);

    // Subtle shimmer effect (matching login page)
    const shimmerTranslateXListenerId = shineAnim.addListener(({ value }) => {
      const translateX = (value - 0.5) * 200; // -100 to 100
      throttledSetState(setShimmerTranslateXValue, translateX, 'shimmerTranslateX');
    });
    
    const shimmerOpacityListenerId = shineAnim.addListener(({ value }) => {
      let opacity = 0;
      if (value >= 0.3 && value <= 0.7) {
        opacity = 0.4;
      } else if (value < 0.3) {
        opacity = (value / 0.3) * 0.4;
      } else if (value > 0.7) {
        opacity = ((1 - value) / 0.3) * 0.4;
      }
      throttledSetState(setShimmerOpacityValue, opacity, 'shimmerOpacity');
    });
    
    const shineLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.delay(1000),
        Animated.timing(shineAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loops.push(shineLoop);
    shineLoop.start();

    // Arrow pulse animations (2s ease-in-out infinite)
    const arrowPulse = (scale: Animated.Value, opacity: Animated.Value) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.1, duration: 1000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 1000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.9, duration: 1000, useNativeDriver: true }),
          ]),
        ])
      );
      loops.push(loop);
      loop.start();
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
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: yOffset, duration: 1000, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: xOffset, duration: 1000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 1000, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 1000, useNativeDriver: true }),
            Animated.timing(translateX, { toValue: 0, duration: 1000, useNativeDriver: true }),
          ]),
        ])
      );
      loops.push(loop);
      loop.start();
      return { opacity: opacityListenerId, scale: scaleListenerId, translateY: translateYListenerId, translateX: translateXListenerId };
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
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
        ])
      );
      loops.push(loop);
      loop.start();
      return listenerId;
    };

    const arrowTopGlowListenerId = arrowGlowPulse(arrowTopGlowOpacityAnim, setArrowTopGlowOpacity, 'arrowTopGlow');
    const arrowBottomGlowListenerId = arrowGlowPulse(arrowBottomGlowOpacityAnim, setArrowBottomGlowOpacity, 'arrowBottomGlow');

    // Sparkle glow pulse animations
    const sparkleGlowPulse = (opacity: Animated.Value, setter: (val: number) => void, key: string, delay: number) => {
      const listenerId = opacity.addListener(({ value }) => {
        throttledSetState(setter, value, key);
      });
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
        ])
      );
      loops.push(loop);
      loop.start();
      return listenerId;
    };
    
    const sparkle1GlowListenerId = sparkleGlowPulse(sparkle1GlowOpacityAnim, setSparkle1GlowOpacity, 'sparkle1Glow', 0);
    const sparkle2GlowListenerId = sparkleGlowPulse(sparkle2GlowOpacityAnim, setSparkle2GlowOpacity, 'sparkle2Glow', 250);
    const sparkle3GlowListenerId = sparkleGlowPulse(sparkle3GlowOpacityAnim, setSparkle3GlowOpacity, 'sparkle3Glow', 500);
    const sparkle4GlowListenerId = sparkleGlowPulse(sparkle4GlowOpacityAnim, setSparkle4GlowOpacity, 'sparkle4Glow', 750);
    
    return () => {
      loops.forEach((l) => l.stop());
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
      shineAnim.removeListener(shimmerTranslateXListenerId);
      shineAnim.removeListener(shimmerOpacityListenerId);
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
              {/* Enhanced gradient with smoother transitions - all white (identical to login) */}
              <SvgLinearGradient id="heartGradientBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="25%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="75%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
              </SvgLinearGradient>
              {/* Shimmer gradient for subtle shine effect */}
              <SvgLinearGradient id="heartShimmerBrowse" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
                <Stop offset="50%" stopColor="rgba(255, 255, 255, 0.5)" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="rgba(255, 255, 255, 0)" stopOpacity="0" />
              </SvgLinearGradient>
              {/* Sparkle glow gradient */}
              <SvgLinearGradient id="sparkleGlowBrowse" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="rgba(255, 255, 255, 0.8)" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="rgba(255, 255, 255, 0.4)" stopOpacity="0.4" />
              </SvgLinearGradient>
              {/* Clip path for shimmer effect */}
              <ClipPath id="heartClipBrowse">
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
                fill="url(#heartGradientBrowse)"
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
                  fill="url(#heartShimmerBrowse)"
                  clipPath="url(#heartClipBrowse)"
                />
              </G>
              {/* Top arrow - identical to login page (M30 6, M33 3, circle at 40,6) */}
              <G>
                <Path 
                  d="M30 6L36 6" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  opacity={arrowTopOpacityValue}
                />
                <Path 
                  d="M33 3L36 6L33 9" 
                  stroke="#ffffff" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  fill="none" 
                  opacity={arrowTopOpacityValue}
                />
                <Circle cx="40" cy="6" r="2.5" fill="#ffffff" opacity={arrowTopOpacityValue} />
              </G>
              {/* Bottom arrow - identical to login page */}
              <G>
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
                <Circle cx="8" cy="38" r="2.5" fill="#ffffff" opacity={arrowBottomOpacityValue} />
              </G>
              {/* Sparkles with dynamic animations - scale, opacity, multi-directional movement, and pulse (identical to login) */}
              <G transform={`translate(${sparkle1TranslateXValue}, ${sparkle1TranslateYValue}) scale(${sparkle1ScaleValue * sparkle1PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="24" cy="8" r="2.2" fill="url(#sparkleGlowBrowse)" opacity={sparkle1OpacityValue * 0.3 * sparkle1PulseValue} />
                <Circle cx="24" cy="8" r="1.5" fill="#ffffff" opacity={sparkle1OpacityValue * sparkle1PulseValue} />
              </G>
              <G transform={`translate(${sparkle2TranslateXValue}, ${sparkle2TranslateYValue}) scale(${sparkle2ScaleValue * sparkle2PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="40" cy="24" r="2.2" fill="url(#sparkleGlowBrowse)" opacity={sparkle2OpacityValue * 0.3 * sparkle2PulseValue} />
                <Circle cx="40" cy="24" r="1.5" fill="#ffffff" opacity={sparkle2OpacityValue * sparkle2PulseValue} />
              </G>
              <G transform={`translate(${sparkle3TranslateXValue}, ${sparkle3TranslateYValue}) scale(${sparkle3ScaleValue * sparkle3PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="24" cy="40" r="2.2" fill="url(#sparkleGlowBrowse)" opacity={sparkle3OpacityValue * 0.3 * sparkle3PulseValue} />
                <Circle cx="24" cy="40" r="1.5" fill="#ffffff" opacity={sparkle3OpacityValue * sparkle3PulseValue} />
              </G>
              <G transform={`translate(${sparkle4TranslateXValue}, ${sparkle4TranslateYValue}) scale(${sparkle4ScaleValue * sparkle4PulseValue})`}>
                {/* Subtle glow behind sparkle - pulse affects brightness */}
                <Circle cx="8" cy="24" r="2.2" fill="url(#sparkleGlowBrowse)" opacity={sparkle4OpacityValue * 0.3 * sparkle4PulseValue} />
                <Circle cx="8" cy="24" r="1.5" fill="#ffffff" opacity={sparkle4OpacityValue * sparkle4PulseValue} />
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
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scaleAnim, { toValue: 1.15, duration: 1500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    scaleLoop.start();
    const rotateLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(rotateAnim, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    );
    rotateLoop.start();
    return () => {
      scaleLoop.stop();
      rotateLoop.stop();
    };
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
  const route = useRoute();
  const isFocused = useIsFocused();
  const { profile: userProfile, user, isAuthenticated } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  
  // Profile card animations
  const profileCardScale = useRef(new Animated.Value(0.9)).current;
  const profileCardOpacity = useRef(new Animated.Value(0)).current;
  const profileCardTranslateY = useRef(new Animated.Value(30)).current;
  const profileCardGlow = useRef(new Animated.Value(1)).current;
  const profileCardGlowLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const profileCardRotate = useRef(new Animated.Value(0)).current;
  const profileCardTiltX = useRef(new Animated.Value(0)).current;
  const profileCardTiltY = useRef(new Animated.Value(0)).current;
  const profileCardShadow = useRef(new Animated.Value(0)).current;
  
  // Connect button animations
  const connectButtonPulse = useRef(new Animated.Value(1)).current;
  const connectButtonShimmer = useRef(new Animated.Value(0)).current;
  const connectButtonScale = useRef(new Animated.Value(1)).current;
  const connectButtonLoopsRef = useRef<{ pulseLoop: Animated.CompositeAnimation; shimmerLoop: Animated.CompositeAnimation } | null>(null);
  const shouldShowConnectButtonRef = useRef(false);
  const connectSpinnerOpacity = useRef(new Animated.Value(0)).current;
  const connectTextOpacity = useRef(new Animated.Value(1)).current;
  const connectOverlayOpacity = useRef(new Animated.Value(0)).current;
  
  // Header gradient animation
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  
  // Interest tags animations
  const interestTagScales = useRef<{ [key: number]: Animated.Value }>({}).current;
  const interestTagOpacities = useRef<{ [key: number]: Animated.Value }>({}).current;
  const interestTagScaleFallback = useRef(new Animated.Value(0.9)).current;
  const interestTagOpacityFallback = useRef(new Animated.Value(0.9)).current;
  
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
  const [loading, setLoading] = useState(false); // Start false so Connect tab is interactive immediately
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const connectPressOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRequestedRef = useRef(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [showNoTokensModal, setShowNoTokensModal] = useState(false);
  const [showMatchLimitModal, setShowMatchLimitModal] = useState(false);
  const [matchLimitCanExpand, setMatchLimitCanExpand] = useState(false);
  const [matchLimitProfile, setMatchLimitProfile] = useState<Profile | null>(null);
  const [showNoProfilesModal, setShowNoProfilesModal] = useState(false);
  const [noProfilesDistanceMode, setNoProfilesDistanceMode] = useState(false);
  const [noProfilesSelectedDistance, setNoProfilesSelectedDistance] = useState<number | null>(50);
  const [noProfilesCurrentPrefs, setNoProfilesCurrentPrefs] = useState<{ min_age: number; max_age: number | null; preferred_genders: string | string[] | null } | null>(null);
  const [noProfilesUpdating, setNoProfilesUpdating] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<{
    reasons: string[];
    sharedInterests: string[];
    sharedValues: number;
  } | null>(null);
  const [hasFetched, setHasFetched] = useState(true); // Start true so we show landing page immediately, no loading screen
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [browseUnlocked, setBrowseUnlocked] = useState<boolean>(false); // Start as locked (false)
  const [unlocking, setUnlocking] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false); // Track when auto-matching to prevent UI flash
  const [canClaimTokens, setCanClaimTokens] = useState<boolean>(false); // Track if user can claim tokens
  const [photoCount, setPhotoCount] = useState<number | null>(null); // User's photo count (for 5-photo minimum)
  const [photoCountLoading, setPhotoCountLoading] = useState(false); // True while fetching count so we don't briefly show wrong state
  const socketRef = useRef<Socket | null>(null);
  const matchIdFromConnectRef = useRef<string | null>(null);
  const openTokenModalRef = useRef<(() => void) | null>(null);
  const performClaimRef = useRef<((opts?: { onSuccess?: () => void; successMessage?: string }) => Promise<void>) | null>(null);
  
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

  // "Use a Mulligan" hint fade-in when landing page is shown
  const landingHintOpacity = useRef(new Animated.Value(0)).current;

  // Claim banner animations (pulse + shimmer feel)
  const claimBannerPulse = useRef(new Animated.Value(1)).current;
  const claimBannerScale = useRef(new Animated.Value(1)).current;

  // Claim banner pulse animation (subtle breath effect)
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(claimBannerPulse, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
        Animated.timing(claimBannerPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [claimBannerPulse]);

  useEffect(() => {
    if (!connecting) {
      connectRequestedRef.current = false;
      connectSpinnerOpacity.setValue(0);
      connectTextOpacity.setValue(1);
      connectOverlayOpacity.setValue(0);
    }
  }, [connecting]);

  useEffect(() => {
    if (isAuthenticated) prefetchToken();
  }, [isAuthenticated]);

  // Prefetch token as soon as a profile is shown (before user taps Connect) — eliminates AsyncStorage read delay
  useEffect(() => {
    if (currentProfile && isAuthenticated) ensureTokenPrefetched();
  }, [currentProfile, isAuthenticated]);

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

    // Require at least 5 photos to Connect
    let count = photoCount;
    if (count === null) {
      try {
        const data = await api.get<{ photos: unknown[] }>('/photos/me', false);
        count = Array.isArray(data?.photos) ? data.photos.length : 0;
        setPhotoCount(count);
      } catch {
        count = 0;
      }
    }
    if (count < MIN_PHOTOS_TO_CONNECT) {
      Alert.alert(
        'Add More Photos',
        `Add at least ${MIN_PHOTOS_TO_CONNECT} photos to your profile in the Profile tab to start matching with others.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    setUnlocking(true);
    setError('');
    setIsAutoMatching(true); // Mark that we're auto-matching to prevent UI flash

    try {
      await api.post('/users/unlock-browse', {});
      // DON'T set browseUnlocked yet - wait until after match is created
      
      // Fetch the first profile after unlocking (skip cache so we get a NEW profile, not the one just matched)
      setLoading(true);
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`, false);

          if (data.profile) {
            // Connect immediately — skip photos fetch to speed up match; celebration shows placeholder if no photo
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
              return;
            }
            await handleConnect(data.profile);
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
            // Show custom "no profiles available" modal
            setTimeout(() => setShowNoProfilesModal(true), 100);
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
          }>(`/users/browse?offset=0`, false);

          console.log('📊 Browse API response:', { 
            hasProfile: !!data.profile, 
            profile: data.profile ? data.profile.displayName : 'null',
            hasMore: data.hasMore,
            total: data.total
          });

          if (data.profile) {
            // Connect immediately — skip photos fetch to speed up match
            console.log('🎉 Auto-matching with first profile:', data.profile.displayName);
            const token = await AsyncStorage.getItem('token');
            if (!token) {
              setError('Session expired. Please log in again.');
              setTimeout(() => setError(''), 5000);
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
              return;
            }
            await handleConnect(data.profile);
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
            // Show custom "no profiles available" modal
            setTimeout(() => setShowNoProfilesModal(true), 100);
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
          clearTokenCache();
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
  }, [unlocking, isAuthenticated, user, photoCount, handleConnect]);

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
        
        // Continuous glow pulse — use native driver so it doesn't block touch
        profileCardGlowLoopRef.current?.stop();
        const glowLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(profileCardGlow, { toValue: 1.15, duration: 2000, useNativeDriver: true }),
            Animated.timing(profileCardGlow, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ])
        );
        profileCardGlowLoopRef.current = glowLoop;
        glowLoop.start();

        // Card rotation removed — reduces animation load for snappier tab
        profileCardRotate.setValue(0);
        
        // Connect button pulse/shimmer started in useEffect when tab is focused (so they restart when returning to tab)
        
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
        
        // Header gradient: static — one less loop for snappier tab
        headerGradientPos.setValue(0.2);
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

  // On focus: only refresh token/claim state so returning to tab keeps current profile and Connect button animations
  useFocusEffect(
    useCallback(() => {
      checkCanClaimTokens();
      prefetchToken();
    }, [])
  );

  // When navigated with resetToLanding (e.g. "Keep Browsing" from match celebration), show Connect landing page
  useFocusEffect(
    useCallback(() => {
      const params = route.params as { resetToLanding?: boolean } | undefined;
      if (!params?.resetToLanding) return;
      setShowMatchCelebration(false);
      setMatchedProfile(null);
      setMatchId(null);
      matchIdFromConnectRef.current = null;
      initiatorMatchIdRef.current = null;
      connectInitiatorAtRef.current = null;
      setMatchExplanation(null);
      setIsAutoMatching(false);
      setUnlocking(false); // Ensure Connect button is clickable
      clearPendingOpenMatchId();
      setBrowseUnlocked(false);
      setCurrentProfile(null);
      navigation.setParams({ resetToLanding: undefined });
    }, [route.params, navigation])
  );

  // When already on Browse and params get resetToLanding (Keep Browsing), clear celebration so Modal unmounts and doesn't block touches
  useEffect(() => {
    const params = route.params as { resetToLanding?: boolean } | undefined;
    if (!params?.resetToLanding) return;
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setMatchId(null);
    matchIdFromConnectRef.current = null;
    initiatorMatchIdRef.current = null;
    connectInitiatorAtRef.current = null;
    setMatchExplanation(null);
    setIsAutoMatching(false);
    setUnlocking(false); // Ensure Connect button is clickable
    clearPendingOpenMatchId();
    setBrowseUnlocked(false);
    setCurrentProfile(null);
    navigation.setParams({ resetToLanding: undefined });
  }, [route.params, navigation]);

  // Fetch user's photo count when on landing page (for 5-photo minimum to Connect)
  // Refetch when tab is focused so count updates after user adds photos on Profile tab
  useEffect(() => {
    if (!showLandingPage || !isAuthenticated || !isFocused) return;
    let cancelled = false;
    setPhotoCountLoading(true);
    (async () => {
      try {
        const data = await api.get<{ photos: { id: string }[] }>('/photos/me', false);
        if (!cancelled && Array.isArray(data?.photos)) {
          setPhotoCount(data.photos.length);
        }
      } catch {
        if (!cancelled) setPhotoCount(0);
      } finally {
        if (!cancelled) setPhotoCountLoading(false);
      }
    })();
    return () => { cancelled = true; setPhotoCountLoading(false); };
  }, [showLandingPage, isAuthenticated, isFocused]);

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
      if (!token || !user?.id) return;

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

      // When User B gets a new match (socket), go straight to big MatchCelebration. Skip if we're the connect initiator (we already show it).
      socket.on('new_match', (data: {
        matchId: string;
        otherUserId: string;
        otherUserName: string;
        message: string;
        stage: string;
      }) => {
        if (matchIdFromConnectRef.current === data.matchId) return;
        if (data.matchId && navigationRef.current?.isReady()) {
          navigationRef.current.navigate('MainTabs' as never, {
            screen: 'Matches',
            params: { matchId: data.matchId, showMatchCelebration: true, matchName: data.otherUserName || 'Someone' },
          } as never);
        }
      });

      // In-app message notification (Alert + sound) is handled by AuthContext's dedicated socket
      // so it works from any tab. No handler needed here.
    };

    initSocket();

    return () => {
      const s = socketRef.current;
      if (s) s.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  // Show landing page when browsing is locked OR when auto-matching (to prevent UI flash)
  const showLandingPage = (browseUnlocked === false || isAutoMatching) && !needsProfile && !showMatchCelebration;

  // Button pulse animation (only when landing page is shown)
  // MUST be before any early returns
  useEffect(() => {
    let buttonLoop: Animated.CompositeAnimation | null = null;
    let shimmerLoop: Animated.CompositeAnimation | null = null;
    if (showLandingPage && !unlocking) {
      // Animate "Discover People" title
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.spring(titleScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();

      // "Use a Mulligan" hint: gentle fade-in after a short delay
      landingHintOpacity.setValue(0);
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(landingHintOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]).start();

      buttonLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
          Animated.timing(buttonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      buttonLoop.start();

      shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerTranslate, { toValue: 400, duration: 2000, useNativeDriver: true }),
          Animated.timing(shimmerTranslate, { toValue: -200, duration: 0, useNativeDriver: true }),
        ])
      );
      shimmerLoop.start();
    } else {
      buttonPulse.setValue(1);
      shimmerTranslate.setValue(-200);
      gradientPosition.setValue(0);
      titleScale.setValue(0.9);
      titleOpacity.setValue(0);
      titleTranslateY.setValue(20);
      landingHintOpacity.setValue(0);
    }
    return () => {
      buttonLoop?.stop();
      shimmerLoop?.stop();
    };
  }, [showLandingPage, unlocking, landingHintOpacity]);

  // Connect button pulse/shimmer: start on layout (view ready), stop when Connect button not shown
  const startConnectButtonAnimations = useCallback(() => {
    if (connectButtonLoopsRef.current) return; // already running
    connectButtonPulse.setValue(1);
    connectButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(connectButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(connectButtonShimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(connectButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    connectButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, []);

  const stopConnectButtonAnimations = useCallback(() => {
    const loops = connectButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      connectButtonLoopsRef.current = null;
    }
    connectButtonPulse.setValue(1);
    connectButtonShimmer.setValue(0);
  }, []);

  // When Connect button mounts/layouts: stop any stale loops then start after a short delay so native view is attached and animations run
  const handleConnectButtonLayout = useCallback(() => {
    stopConnectButtonAnimations();
    setTimeout(() => startConnectButtonAnimations(), 200);
  }, [stopConnectButtonAnimations, startConnectButtonAnimations]);

  const openNoProfilesDistancePicker = useCallback(async () => {
    setNoProfilesUpdating(true);
    try {
      const data = await api.get<{ preferences: { min_age: number; max_age: number | null; preferred_genders: string | string[] | null; max_distance: number | null } | null }>('/profile');
      const prefs = data?.preferences;
      if (prefs) {
        setNoProfilesCurrentPrefs({ min_age: prefs.min_age, max_age: prefs.max_age, preferred_genders: prefs.preferred_genders });
        setNoProfilesSelectedDistance(prefs.max_distance ?? 50);
      } else {
        setNoProfilesSelectedDistance(50);
      }
      setNoProfilesDistanceMode(true);
    } catch {
      Alert.alert('Error', 'Could not load preferences. Try again.');
    } finally {
      setNoProfilesUpdating(false);
    }
  }, []);

  const saveNoProfilesDistance = useCallback(async () => {
    setNoProfilesUpdating(true);
    try {
      const prefs = noProfilesCurrentPrefs;
      const preferredGenders = prefs?.preferred_genders == null
        ? null
        : Array.isArray(prefs.preferred_genders)
          ? prefs.preferred_genders
          : (typeof prefs.preferred_genders === 'string' ? (() => {
              try { return JSON.parse(prefs.preferred_genders as string) as string[]; } catch { return null; }
            })() : null);
      await api.put('/profile/preferences', {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: preferredGenders ?? null,
        maxDistance: noProfilesSelectedDistance,
      });
      setShowNoProfilesModal(false);
      setNoProfilesDistanceMode(false);
      setBrowseUnlocked(false);
      setIsAutoMatching(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update distance.');
    } finally {
      setNoProfilesUpdating(false);
    }
  }, [noProfilesCurrentPrefs, noProfilesSelectedDistance]);

  useEffect(() => {
    const shouldShowConnectButton = currentProfile && !showLandingPage && !needsProfile && !loading;
    if (!shouldShowConnectButton) stopConnectButtonAnimations();
    return () => stopConnectButtonAnimations();
  }, [currentProfile, showLandingPage, needsProfile, loading, stopConnectButtonAnimations]);

  // Restart Connect button animations when returning to Connect tab. Use ref so delayed callback sees current visibility (avoids re-renders from checkCanClaimTokens etc. cancelling the start).
  const shouldShowConnectButton = currentProfile && !showLandingPage && !needsProfile && !loading;
  shouldShowConnectButtonRef.current = shouldShowConnectButton;

  // When tab gains focus and Connect button is visible, ensure animations are running (content stays mounted when unfocused so they keep running)
  useFocusEffect(
    useCallback(() => {
      const timeoutId = setTimeout(() => {
        if (shouldShowConnectButtonRef.current) {
          stopConnectButtonAnimations();
          startConnectButtonAnimations();
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }, [startConnectButtonAnimations, stopConnectButtonAnimations])
  );

  useEffect(() => {
    if (!isFocused) return;
    if (!shouldShowConnectButton) {
      stopConnectButtonAnimations();
      return;
    }
    const timeoutId = setTimeout(() => {
      stopConnectButtonAnimations();
      startConnectButtonAnimations();
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [isFocused, shouldShowConnectButton, startConnectButtonAnimations, stopConnectButtonAnimations]);

  const handleConnect = useCallback((profile: Profile, expandSlot?: boolean) => {
    setError('');
    setConnecting(true);
    connectRequestedRef.current = true;
    connectInitiatorAtRef.current = Date.now(); // Suppress "matched with you" push for initiator (celebration only)
    connectOverlayOpacity.setValue(1);
    connectSpinnerOpacity.setValue(1);
    connectTextOpacity.setValue(0);

    type ConnectResult = {
      message?: string;
      isMutual?: boolean;
      matchId: string;
      stage?: string;
      existingMatch?: boolean;
      explanation?: { reasons: string[]; sharedInterests: string[]; sharedValues: number } | null;
    };

    api
      .post<ConnectResult>('/matches/connect', { targetUserId: profile.userId, expandSlot: expandSlot || false })
      .then((result) => {
        connectRequestedRef.current = false;
        connectSpinnerOpacity.setValue(0);
        connectTextOpacity.setValue(1);
        connectOverlayOpacity.setValue(0);
        setConnecting(false);
        if (!result?.matchId) return;
        if (result.existingMatch) {
          // Already matched: open existing conversation (no celebration)
          setCurrentProfile(null);
          setPendingOpenMatchId(result.matchId);
          if (navigationRef.current?.isReady()) {
            navigationRef.current.dispatch(
              CommonActions.navigate({
                name: 'MainTabs',
                params: { screen: 'Matches', params: { matchId: result.matchId } },
              })
            );
          } else {
            navigation.navigate('Matches' as never, { matchId: result.matchId } as never);
          }
          return;
        }
        setCurrentProfile(null);
        setMatchedProfile(profile);
        setMatchId(result.matchId);
        matchIdFromConnectRef.current = result.matchId;
        initiatorMatchIdRef.current = result.matchId; // So AuthContext skips in-app match notification (celebration only for User A)
        setMatchExplanation(result.explanation ?? null);
        setShowMatchCelebration(true);
      })
      .catch((err: any) => {
        // Rollback optimistic state so user can retry
        setShowMatchCelebration(false);
        setMatchedProfile(null);
        setMatchId(null);
        matchIdFromConnectRef.current = null;
        initiatorMatchIdRef.current = null;
        connectInitiatorAtRef.current = null;
        setMatchExplanation(null);
        setCurrentProfile(profile);
        setConnecting(false);
        connectRequestedRef.current = false;
        connectSpinnerOpacity.setValue(0);
        connectTextOpacity.setValue(1);
        connectOverlayOpacity.setValue(0);

        let errorMessage = 'Failed to connect. Please try again.';

        if (err instanceof Error && 'status' in err) {
          const apiErr = err as Error & { status: number; code?: string; canExpand?: boolean; currentLimit?: number; newLimit?: number };
          if (apiErr.status === 400 && apiErr.code === 'AT_MATCH_LIMIT') {
            setMatchLimitCanExpand(!!apiErr.canExpand);
            setMatchLimitProfile(profile);
            setShowMatchLimitModal(true);
            return;
          }
          if (
            apiErr.status === 400 &&
            (String(err.message || '').toLowerCase().includes('no tokens') ||
              String(err.message || '').toLowerCase().includes('claim your weekly token') ||
              (err as any).code === 'NO_TOKENS')
          ) {
            setShowNoTokensModal(true);
            if (isAutoMatching) {
              setIsAutoMatching(false);
              setBrowseUnlocked(true);
            }
            return;
          }
          errorMessage =
            err.message ||
            'Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.';
          if (apiErr.status === 401 || apiErr.status === 403) {
            errorMessage = 'Session expired. Please log in again.';
            AsyncStorage.removeItem('token');
          } else if (apiErr.status === 404) {
            errorMessage = 'Profile not found. Please refresh and try again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
        const lower = String(errorMessage).toLowerCase();
        if (
          lower.includes('authentication required') ||
          lower.includes('invalid or expired token') ||
          lower.includes('authentication')
        ) {
          errorMessage = 'Session expired. Please log in again.';
          clearTokenCache();
          AsyncStorage.removeItem('token');
        }
        setError(errorMessage);
        setTimeout(() => setError(''), 8000);
        if (isAutoMatching) {
          setIsAutoMatching(false);
          setBrowseUnlocked(true);
        }
      });
  }, [isAutoMatching]);

  const handleCelebrationClose = useCallback(() => {
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    setMatchId(null);
    matchIdFromConnectRef.current = null;
    initiatorMatchIdRef.current = null;
    connectInitiatorAtRef.current = null;
    setMatchExplanation(null);
    setIsAutoMatching(false);
    setUnlocking(false); // So Connect button is clickable after "Keep Browsing"
    clearPendingOpenMatchId(); // Ensure no stale pending match when user chooses Keep Browsing
    // After a successful match, reset to the landing page so user starts fresh when returning to Connect tab
    setBrowseUnlocked(false);
    setCurrentProfile(null);
  }, []);

  const needsProfile = !userProfile && !loading;

  const photos = currentProfile?.photos || [];
  const primaryPhoto = photos.find((p) => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : currentProfile?.photoUrl
    ? getPhotoUrl(currentProfile.photoUrl)
    : null;

  // Stop profile card glow loop when tab loses focus to avoid leaked native animation callbacks
  useEffect(() => {
    if (!isFocused) {
      profileCardGlowLoopRef.current?.stop();
      profileCardGlowLoopRef.current = null;
    }
  }, [isFocused]);

  // When tab not focused: keep full content mounted but hidden so Connect button animations keep running; when we return they're still active.
  const showConnectButton = currentProfile && !showLandingPage && !needsProfile && !loading;

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
    <View
      style={[
        styles.container,
        showLandingPage && { backgroundColor: 'transparent' },
        !isFocused && { opacity: 0, pointerEvents: 'none' as const },
      ]}
    >
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
      
      {/* Token display fixed outside ScrollView so taps are instant (no scroll gesture delay) */}
      <View style={styles.tokenOverlay} pointerEvents="box-none">
        <View style={styles.tokenOverlayInner}>
          {canClaimTokens && (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {
                if (Platform.OS === 'ios') Vibration.vibrate([0, 30]);
                else Vibration.vibrate(30);
                performClaimRef.current?.({
                  onSuccess: () => {
                    checkCanClaimTokens();
                    // Reset to landing page so user can tap Connect and get a new profile
                    setBrowseUnlocked(false);
                    setCurrentProfile(null);
                    setHasMore(true);
                  },
                  successMessage: "Congrats! You've been officially reupped and are ready to start matching! 🎉",
                });
              }}
              onPressIn={() => {
                Animated.spring(claimBannerScale, { toValue: 0.95, useNativeDriver: true }).start();
              }}
              onPressOut={() => {
                Animated.spring(claimBannerScale, { toValue: 1, useNativeDriver: true }).start();
              }}
            >
              <Animated.View
                style={[
                  styles.claimTokenBanner,
                  {
                    transform: [
                      { scale: Animated.multiply(claimBannerPulse, claimBannerScale) },
                    ],
                  },
                ]}
              >
                <Text style={styles.claimTokenText}>✨ Claim your 7 tokens!</Text>
              </Animated.View>
            </TouchableOpacity>
          )}
          <TokenDisplay compact={true} premium={true} openModalRef={openTokenModalRef} performClaimRef={performClaimRef} />
        </View>
      </View>

      <ScrollView 
        style={[styles.scrollView, showLandingPage && { backgroundColor: 'transparent' }]} 
        contentContainerStyle={[styles.contentContainer, !showLandingPage && !needsProfile && currentProfile && !loading && { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
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
                  onPress={() => {
                    if (photoCount !== null && photoCount < MIN_PHOTOS_TO_CONNECT) {
                      (navigation as any).navigate('MyProfile', { scrollToPhotos: true });
                    } else {
                      handleUnlockBrowse();
                    }
                  }}
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
                    {!unlocking && photoCount !== null && photoCount >= MIN_PHOTOS_TO_CONNECT && (
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
                      ) : (photoCount === null || photoCount >= MIN_PHOTOS_TO_CONNECT) ? (
                        <Text style={styles.landingButtonText} numberOfLines={1}>
                          Connect
                        </Text>
                      ) : photoCount < MIN_PHOTOS_TO_CONNECT ? (
                        <Text style={styles.landingButtonText} numberOfLines={2}>
                          Add 5+ Photos
                        </Text>
                      ) : (
                        <Text style={styles.landingButtonText} numberOfLines={1}>
                          Connect
                        </Text>
                      )}
                    </Animated.View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
              
              <Animated.View style={[styles.landingHintWrap, { opacity: landingHintOpacity }]}>
                <Text style={styles.landingHint}>
                  {photoCount !== null && photoCount < MIN_PHOTOS_TO_CONNECT
                    ? `Add at least ${MIN_PHOTOS_TO_CONNECT} photos in Profile to Connect`
                    : '⛳ Use a Mulligan'}
                </Text>
              </Animated.View>
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
              {/* Token is in fixed overlay above ScrollView for instant taps */}
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
        <View style={styles.noMoreWrapper}>
          <LinearGradient
            colors={['#f8f7ff', '#ffffff', '#fff5f8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.noMoreCard}
          >
            <View style={styles.noMoreEmojiRing}>
              <Text style={styles.noMoreEmoji}>✨</Text>
            </View>
            <Text style={styles.noMoreTitle}>You're all caught up</Text>
            <Text style={styles.noMoreText}>
              You've seen everyone for now. New people join every day — check back soon!
            </Text>
            <View style={styles.noMoreHint}>
              <Text style={styles.noMoreHintText}>🔍 We'll show new profiles here</Text>
            </View>
          </LinearGradient>
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
                    const scaleAnim = interestTagScales[idx] ?? interestTagScaleFallback;
                    const opacityAnim = interestTagOpacities[idx] ?? interestTagOpacityFallback;
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

          <View style={{ height: 16 }} />
          </View>
        </Animated.View>
      ) : null}
        </>
      )}

      {/* Match Celebration Modal - hide when resetToLanding so modal never blocks tab bar / Connect button after "Keep Browsing" */}
      {showMatchCelebration && matchedProfile && !(route.params as { resetToLanding?: boolean } | undefined)?.resetToLanding && (
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

      {/* Match Limit Reached Modal */}
      <Modal
        visible={showMatchLimitModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowMatchLimitModal(false);
          setBrowseUnlocked(false);
          setCurrentProfile(null);
          setIsAutoMatching(false);
          setMatchLimitProfile(null);
        }}
      >
        <View style={styles.matchLimitOverlay}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.matchLimitCard}>
            <Text style={styles.matchLimitEmoji}>🎯</Text>
            <Text style={styles.matchLimitTitle}>Match limit reached</Text>
            <Text style={styles.matchLimitBody}>
              You've reached your limit of 20 matches. To connect with more people:
            </Text>
            <View style={styles.matchLimitBullets}>
              <Text style={styles.matchLimitBullet}>• Unmatch with someone to free a slot</Text>
              <Text style={styles.matchLimitBullet}>• Wait for a match to expire (7-day limit)</Text>
            </View>
            {matchLimitCanExpand && matchLimitProfile && (
              <Text style={styles.matchLimitExpand}>
                Spend 2 tokens to connect with {matchLimitProfile.displayName || 'them'}?
              </Text>
            )}
            <View style={styles.matchLimitButtons}>
              <TouchableOpacity
                style={styles.matchLimitCancelButton}
                onPress={() => {
                  setShowMatchLimitModal(false);
                  setBrowseUnlocked(false);
                  setCurrentProfile(null);
                  setIsAutoMatching(false);
                  setMatchLimitProfile(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.matchLimitCancelText}>{matchLimitCanExpand ? 'Cancel' : 'OK'}</Text>
              </TouchableOpacity>
              {matchLimitCanExpand && matchLimitProfile && (
                <TouchableOpacity
                  style={styles.matchLimitTokensButton}
                  onPress={() => {
                    const profileToConnect = matchLimitProfile;
                    setShowMatchLimitModal(false);
                    setMatchLimitProfile(null);
                    connectRequestedRef.current = true;
                    connectOverlayOpacity.setValue(1);
                    connectSpinnerOpacity.setValue(1);
                    connectTextOpacity.setValue(0);
                    setConnecting(true);
                    handleConnect(profileToConnect, true);
                  }}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.matchLimitTokensGradient}
                  >
                    <Text style={styles.matchLimitTokensText}>Use 2 Tokens</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* No Profiles Available Modal */}
      <Modal
        visible={showNoProfilesModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowNoProfilesModal(false);
          setNoProfilesDistanceMode(false);
          setBrowseUnlocked(false);
          setIsAutoMatching(false);
        }}
      >
        <View style={styles.noProfilesModalOverlay}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.noProfilesModalCard}>
            <LinearGradient
              colors={['#f8f7ff', '#ffffff', '#fff5f8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.noProfilesModalCardInner}
            >
              {!noProfilesDistanceMode ? (
                <>
                  <View style={styles.noProfilesModalEmojiRing}>
                    <Text style={styles.noProfilesModalEmoji}>👋</Text>
                  </View>
                  <Text style={styles.noProfilesModalTitle}>No profiles available</Text>
                  <Text style={styles.noProfilesModalBody}>
                    There are no other profiles to match with right now. New people join every day — check back soon!
                  </Text>
                  <TouchableOpacity
                    style={styles.noProfilesModalButton}
                    onPress={() => {
                      setShowNoProfilesModal(false);
                      setBrowseUnlocked(false);
                      setIsAutoMatching(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2', '#f093fb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.noProfilesModalButtonGradient}
                    >
                      <Text style={styles.noProfilesModalButtonText}>OK</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.noProfilesModalUpdateDistanceButton}
                    onPress={openNoProfilesDistancePicker}
                    disabled={noProfilesUpdating}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.noProfilesModalUpdateDistanceText}>
                      {noProfilesUpdating ? 'Loading…' : 'Update distance'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.noProfilesModalEmojiRing}>
                    <Text style={styles.noProfilesModalEmoji}>📏</Text>
                  </View>
                  <Text style={styles.noProfilesModalTitle}>Max distance</Text>
                  <Text style={styles.noProfilesModalBody}>
                    Show me people within this distance. Try increasing it to see more profiles.
                  </Text>
                  <View style={styles.noProfilesDistanceOptionsRow}>
                    {MAX_DISTANCE_OPTIONS.map((value) => (
                      <TouchableOpacity
                        key={value ?? 'any'}
                        style={[
                          styles.noProfilesDistanceOptionButton,
                          noProfilesSelectedDistance === value && styles.noProfilesDistanceOptionButtonActive,
                        ]}
                        onPress={() => setNoProfilesSelectedDistance(value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.noProfilesDistanceOptionText,
                          noProfilesSelectedDistance === value && styles.noProfilesDistanceOptionTextActive,
                        ]}>
                          {value == null ? 'Any' : `${value} mi`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.noProfilesModalDistanceActions}>
                    <TouchableOpacity
                      style={styles.noProfilesModalBackButton}
                      onPress={() => setNoProfilesDistanceMode(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.noProfilesModalBackButtonText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noProfilesModalSaveDistanceButton}
                      onPress={saveNoProfilesDistance}
                      disabled={noProfilesUpdating}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={['#667eea', '#764ba2', '#f093fb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.noProfilesModalButtonGradient}
                      >
                        <Text style={styles.noProfilesModalButtonText}>{noProfilesUpdating ? 'Saving…' : 'Save'}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Legal Footer */}
      <LegalFooter />
      </ScrollView>

      {/* Full-screen loading overlay - shows IMMEDIATELY on tap (Animated, no React re-render) */}
      {!showLandingPage && currentProfile && (
        <Animated.View
          pointerEvents={connecting ? 'auto' : 'none'}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: connectOverlayOpacity,
              backgroundColor: 'rgba(0,0,0,0.3)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
            },
          ]}
        >
          <ActivityIndicator size="large" color="#fff" />
        </Animated.View>
      )}

      {/* Connect Button - OUTSIDE ScrollView. Mounts fresh when returning to tab (minimal view when blurred); onLayout stops any stale ref then starts animations. */}
      {!showLandingPage && !needsProfile && currentProfile && !loading && (
        <View
          style={styles.connectButtonFixed}
          pointerEvents="box-none"
          onLayout={handleConnectButtonLayout}
        >
          <GestureTouchable
            style={styles.connectButton}
            delayPressIn={0}
            delayPressOut={0}
            activeOpacity={0.9}
            onPressIn={() => {
              if (connecting || connectRequestedRef.current) return;
              const profile = currentProfile;
              if (!profile) return;
              connectRequestedRef.current = true;
              try { Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30); } catch (_) {}
              Animated.timing(connectButtonScale, {
                toValue: 0.92,
                duration: 30,
                useNativeDriver: true,
              }).start();
              // Optimistic: show celebration immediately; API confirms in background
              handleConnect(profile);
            }}
            onPressOut={() => {
              Animated.spring(connectButtonScale, {
                toValue: 1,
                friction: 6,
                tension: 300,
                useNativeDriver: true,
              }).start();
              connectPressOutTimer.current = setTimeout(() => {
                if (!connectRequestedRef.current) {
                  setConnecting(false);
                  connectSpinnerOpacity.setValue(0);
                  connectTextOpacity.setValue(1);
                  connectOverlayOpacity.setValue(0);
                }
                connectPressOutTimer.current = null;
              }, 80);
            }}
            onPress={() => {
              if (connectPressOutTimer.current) {
                clearTimeout(connectPressOutTimer.current);
                connectPressOutTimer.current = null;
              }
            }}
            disabled={connecting}
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
                ]}
              >
                <Animated.View
                  style={[
                    styles.connectButtonShimmer,
                    {
                      transform: [
                        { translateX: connectButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
                        { rotate: connectButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-20deg'] }) },
                      ],
                    },
                  ]}
                />
                <View style={styles.connectButtonContent}>
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: connectSpinnerOpacity, justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
                    <ActivityIndicator color="#fff" />
                  </Animated.View>
                  <Animated.View style={{ opacity: connectTextOpacity }} pointerEvents="none">
                    <Text style={styles.connectButtonText} numberOfLines={1}>Connect & Match 🎟️</Text>
                  </Animated.View>
                </View>
              </LinearGradient>
            </Animated.View>
          </GestureTouchable>
        </View>
      )}
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
  noMoreWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
  },
  noMoreCard: {
    width: '100%',
    maxWidth: 340,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderRadius: 28,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
  },
  noMoreEmojiRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  noMoreEmoji: {
    fontSize: 44,
  },
  noMoreTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  noMoreText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  noMoreHint: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderRadius: 12,
  },
  noMoreHintText: {
    fontSize: 13,
    color: '#5a5a7a',
    textAlign: 'center',
    fontWeight: '500',
  },
  // Landing page styles (when browsing is locked)
  landingPageWrapper: {
    flex: 1,
    minHeight: Dimensions.get('window').height - 100,
    paddingTop: 56,
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
    flex: 1,
    maxWidth: 110,
    minWidth: 90,
    paddingHorizontal: 6,
    paddingVertical: 12,
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
  landingHintWrap: {
    alignSelf: 'center',
    marginTop: 14,
  },
  landingHint: {
    fontSize: 14,
    color: 'rgba(60, 50, 85, 0.95)',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.6,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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
  connectButtonFixed: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 94 : 88,
    alignItems: 'center',
    zIndex: 100,
  },
  connectButtonContent: {
    minHeight: 24,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'center',
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
  // Match limit reached modal
  matchLimitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  matchLimitCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    maxWidth: '100%',
    width: 340,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
    alignItems: 'center',
  },
  matchLimitEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  matchLimitTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  matchLimitBody: {
    fontSize: 16,
    color: '#444',
    lineHeight: 24,
    marginBottom: 16,
    textAlign: 'center',
  },
  matchLimitBullets: {
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  matchLimitBullet: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 8,
    paddingLeft: 4,
  },
  matchLimitExpand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 24,
    textAlign: 'center',
  },
  matchLimitButtons: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  matchLimitCancelButton: {
    marginRight: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    minWidth: 100,
    alignItems: 'center',
  },
  matchLimitCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  matchLimitTokensButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 120,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  matchLimitTokensGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchLimitTokensText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  // No profiles available modal
  noProfilesModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noProfilesModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  noProfilesModalCardInner: {
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  noProfilesModalEmojiRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(102, 126, 234, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  noProfilesModalEmoji: {
    fontSize: 40,
  },
  noProfilesModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a2e',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  noProfilesModalBody: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  noProfilesModalButton: {
    borderRadius: 16,
    overflow: 'hidden',
    minWidth: 120,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  noProfilesModalButtonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noProfilesModalButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  noProfilesModalUpdateDistanceButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  noProfilesModalUpdateDistanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  noProfilesDistanceOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  noProfilesDistanceOptionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
  },
  noProfilesDistanceOptionButtonActive: {
    backgroundColor: '#667eea',
  },
  noProfilesDistanceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  noProfilesDistanceOptionTextActive: {
    color: '#fff',
  },
  noProfilesModalDistanceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  noProfilesModalBackButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    minWidth: 90,
    alignItems: 'center',
  },
  noProfilesModalBackButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#555',
  },
  noProfilesModalSaveDistanceButton: {
    borderRadius: 14,
    overflow: 'hidden',
    minWidth: 100,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  tokenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop: Platform.OS === 'ios' ? 62 : 54,
    paddingLeft: 16,
    paddingRight: 32,
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
    // Ensure token stays fixed when ScrollView scrolls - overlay is outside scroll
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  tokenOverlayInner: {
    alignItems: 'flex-end',
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
