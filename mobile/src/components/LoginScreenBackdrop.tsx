import React, { useEffect, useMemo, useRef, memo } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  AUTH_GLOW_BANDS,
  AUTH_GLOW_WASHES,
  AUTH_PAGE_GRADIENT,
  AUTH_PAGE_GRADIENT_FALLBACK,
  AUTH_STAR_COUNT,
  AUTH_VIGNETTE,
} from '../constants/authLoginTheme';

type StarSpec = {
  id: number;
  size: number;
  leftPct: number;
  topPct: number;
  durationMs: number;
  delayMs: number;
};

function buildStars(): StarSpec[] {
  const stars: StarSpec[] = [];
  for (let i = 0; i < AUTH_STAR_COUNT; i++) {
    stars.push({
      id: i,
      size: Math.random() * 2.5 + 1.5,
      leftPct: Math.random() * 100,
      topPct: Math.random() * 100,
      durationMs: (Math.random() * 18 + 12) * 1000,
      delayMs: Math.random() * 4000,
    });
  }
  return stars;
}

const GalaxyStar = memo(function GalaxyStar({
  spec,
  width,
  height,
}: {
  spec: StarSpec;
  width: number;
  height: number;
}) {
  const twinkle = useRef(new Animated.Value(0.25)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const twinkleLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delayMs),
        Animated.timing(twinkle, { toValue: 0.45, duration: spec.durationMs / 2, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0.15, duration: spec.durationMs / 2, useNativeDriver: true }),
      ])
    );
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: spec.durationMs, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    twinkleLoop.start();
    driftLoop.start();
    return () => {
      twinkleLoop.stop();
      driftLoop.stop();
    };
  }, [drift, spec, twinkle]);

  const translateY = drift.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -12, 0],
  });
  const translateX = drift.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 6, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.star,
        {
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          left: (spec.leftPct / 100) * width,
          top: (spec.topPct / 100) * height,
          opacity: twinkle,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    />
  );
});

/** Midnight login backdrop — visible web plum gradient + soft glow + stars. */
const LoginScreenBackdrop = memo(function LoginScreenBackdrop() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('screen').height;
  const canvasHeight =
    Platform.OS === 'android'
      ? Math.max(screenHeight, height + insets.bottom)
      : height + insets.bottom;

  const gradientShift = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const stars = useMemo(() => buildStars(), []);

  useEffect(() => {
    const shiftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(gradientShift, { toValue: 1, duration: 15000, useNativeDriver: true }),
        Animated.timing(gradientShift, { toValue: 0, duration: 15000, useNativeDriver: true }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0, duration: 4000, useNativeDriver: true }),
      ])
    );
    shiftLoop.start();
    pulseLoop.start();
    return () => {
      shiftLoop.stop();
      pulseLoop.stop();
    };
  }, [gradientShift, glowPulse]);

  const shiftX = gradientShift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -width * 0.12],
  });
  const shiftY = gradientShift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -canvasHeight * 0.08],
  });

  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 0.9],
  });
  const glowScale = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.root]} pointerEvents="none">
      <Animated.View
        style={[
          styles.gradientLayer,
          {
            width: width * 1.4,
            height: canvasHeight * 1.4,
            transform: [{ translateX: shiftX }, { translateY: shiftY }],
          },
        ]}
      >
        <LinearGradient
          colors={[...AUTH_PAGE_GRADIENT.colors]}
          locations={[...AUTH_PAGE_GRADIENT.locations]}
          start={AUTH_PAGE_GRADIENT.start}
          end={AUTH_PAGE_GRADIENT.end}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
        pointerEvents="none"
      >
        {AUTH_GLOW_BANDS.map((band, index) => (
          <LinearGradient
            key={`glow-band-${index}`}
            colors={[...band.colors]}
            locations={[...band.locations]}
            start={band.start}
            end={band.end}
            style={StyleSheet.absoluteFillObject}
          />
        ))}
        <Svg width={width} height={canvasHeight} style={styles.glowSvg}>
          <Defs>
            {AUTH_GLOW_WASHES.map((wash) => (
              <RadialGradient
                key={wash.id}
                id={wash.id}
                gradientUnits="userSpaceOnUse"
                cx={width * wash.cxRatio}
                cy={canvasHeight * wash.cyRatio}
                rx={width * wash.rxRatio}
                ry={canvasHeight * wash.ryRatio}
              >
                <Stop offset="0%" stopColor={wash.inner} />
                <Stop offset={wash.fadeStop} stopColor={wash.outer} />
              </RadialGradient>
            ))}
          </Defs>
          {AUTH_GLOW_WASHES.map((wash) => (
            <Rect key={`rect-${wash.id}`} width={width} height={canvasHeight} fill={`url(#${wash.id})`} />
          ))}
        </Svg>
      </Animated.View>

      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {stars.map((star) => (
          <GalaxyStar key={star.id} spec={star} width={width} height={canvasHeight} />
        ))}
      </View>

      <LinearGradient
        colors={[...AUTH_VIGNETTE.colors]}
        locations={[...AUTH_VIGNETTE.locations]}
        start={AUTH_VIGNETTE.start}
        end={AUTH_VIGNETTE.end}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
    </View>
  );
});

export default LoginScreenBackdrop;

export { AUTH_PAGE_GRADIENT_FALLBACK };

const styles = StyleSheet.create({
  root: {
    backgroundColor: AUTH_PAGE_GRADIENT_FALLBACK,
    overflow: 'hidden',
  },
  gradientLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  glowSvg: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    backgroundColor: 'rgba(220, 218, 228, 0.55)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
