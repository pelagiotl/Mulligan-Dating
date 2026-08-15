/**
 * Cold-start brand moment: golf ball misses the cup, flag reads "Mulligan".
 * Short (~2.5s) — reinforces golf-first / do-over brand on launch.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { playMulliganBootSound } from '../utils/sounds';

const { width: SCREEN_W } = Dimensions.get('window');

/** Whoosh crest of boot SFX (~220ms on v8) lands on the lip-out / “Just missed…”. Rising bells follow. */
const MISS_SOUND_AT_MS = 280 + 900 - 220;

type Props = {
  onFinished: () => void;
};

export default function MulliganBootSplash({ onFinished }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const ballX = useRef(new Animated.Value(SCREEN_W * 0.18)).current;
  const ballY = useRef(new Animated.Value(0)).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const flagOpacity = useRef(new Animated.Value(0)).current;
  const flagScale = useRef(new Animated.Value(0.85)).current;
  const flagWave = useRef(new Animated.Value(0)).current;
  const missLabelOpacity = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinished();
    };

    const soundTimer = setTimeout(() => {
      void playMulliganBootSound().catch((err) => {
        if (__DEV__) {
          console.warn('🎵 Boot splash sound failed:', err);
        }
      });
    }, MISS_SOUND_AT_MS);

    const sequence = Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(ballX, {
          toValue: SCREEN_W * 0.42,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(ballY, {
            toValue: -42,
            duration: 450,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ballY, {
            toValue: 8,
            duration: 450,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(ballX, {
          toValue: SCREEN_W * 0.62,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ballY, {
          toValue: -6,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(ballScale, {
          toValue: 0.92,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(missLabelOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(flagOpacity, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.spring(flagScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(flagWave, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(700),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    sequence.start(({ finished }) => {
      if (finished) finish();
    });

    const safety = setTimeout(finish, 4000);
    return () => {
      sequence.stop();
      clearTimeout(safety);
      clearTimeout(soundTimer);
    };
  }, [ballX, ballY, ballScale, flagOpacity, flagScale, flagWave, missLabelOpacity, opacity, onFinished]);

  const flagRotate = flagWave.interpolate({
    inputRange: [0, 1],
    outputRange: ['-6deg', '4deg'],
  });

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="auto">
      <LinearGradient colors={['#0b3d2e', '#0f5c45', '#134e4a']} style={StyleSheet.absoluteFill} />

      <View style={styles.skyline} pointerEvents="none">
        <View style={styles.brandBlock}>
          <Text style={styles.brandTitle}>Mulligan</Text>
          <Text style={styles.brandTagline}>Golf-first dating</Text>
        </View>
      </View>

      <View style={styles.green}>
        <View style={styles.cupWrap}>
          <View style={styles.cupRim} />
          <View style={styles.cupHole} />
        </View>

        <Animated.View
          style={[
            styles.flagWrap,
            {
              opacity: flagOpacity,
              transform: [{ scale: flagScale }, { rotate: flagRotate }],
            },
          ]}
        >
          <View style={styles.flagPole} />
          <View style={styles.flag}>
            <Text style={styles.flagText}>Mulligan</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.ball,
            {
              transform: [
                { translateX: ballX },
                { translateY: ballY },
                { scale: ballScale },
              ],
            },
          ]}
        >
          <View style={styles.ballHighlight} />
        </Animated.View>

        <Animated.Text style={[styles.missLabel, { opacity: missLabelOpacity }]}>
          Just missed…
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skyline: {
    position: 'absolute',
    top: '18%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  brandBlock: { alignItems: 'center' },
  brandTitle: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandTagline: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  green: {
    width: '100%',
    height: 220,
    justifyContent: 'center',
  },
  cupWrap: {
    position: 'absolute',
    left: SCREEN_W * 0.48 - 18,
    top: 118,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cupRim: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cupHole: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0a1628',
  },
  flagWrap: {
    position: 'absolute',
    left: SCREEN_W * 0.48 - 2,
    top: 28,
    width: 120,
    height: 100,
  },
  flagPole: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 3,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 2,
  },
  flag: {
    position: 'absolute',
    left: 3,
    top: 4,
    backgroundColor: '#8B1538',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    minWidth: 96,
  },
  flagText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  ball: {
    position: 'absolute',
    top: 122,
    left: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f8fafc',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  ballHighlight: {
    position: 'absolute',
    top: 4,
    left: 5,
    width: 7,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  missLabel: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 8,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
});
