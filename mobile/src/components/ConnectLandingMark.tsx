import React, { memo, useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

/**
 * Spinning gradient heart — mirrors web `ConnectLandingMark` + `.logo-rotate-group` / `.logo-heart`.
 * Web `.connect-landing__logo-icon` uses 72×72 in the native shell.
 */
const ConnectLandingMark = memo(function ConnectLandingMark({
  size = 56,
  style,
}: {
  /** Outer box size (web landing uses 72). */
  size?: number;
  style?: ViewStyle;
}) {
  const gradIdRef = useRef(`connectHeartGrad-${Math.random().toString(36).slice(2, 9)}`);
  const gradId = gradIdRef.current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    rotateLoop.start();
    pulseLoop.start();
    return () => {
      rotateLoop.stop();
      pulseLoop.stop();
    };
  }, [rotateAnim, pulseAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const dim = Math.round(size);

  return (
    <View
      style={[styles.wrap, { width: dim, height: dim }, style]}
      accessibilityRole="image"
      accessibilityLabel="Mulligan"
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Svg width={dim} height={dim} viewBox="0 0 48 48">
            <Defs>
              <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#667eea" />
                <Stop offset="25%" stopColor="#764ba2" />
                <Stop offset="50%" stopColor="#f093fb" />
                <Stop offset="75%" stopColor="#f5576c" />
                <Stop offset="100%" stopColor="#4facfe" />
              </LinearGradient>
            </Defs>
            <Path
              d="M24 14C20.5 10.5 15.5 10.5 12 14C8.5 17.5 8.5 22.5 12 26C15.5 29.5 24 36 24 36C24 36 32.5 29.5 36 26C39.5 22.5 39.5 17.5 36 14C32.5 10.5 27.5 10.5 24 14Z"
              fill={`url(#${gradId})`}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
});

export default ConnectLandingMark;
