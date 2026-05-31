import React, { useEffect, useRef, memo } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';

const APP_ICON = require('../../assets/icon.png');
const ICON_SIZE = 48;
const ICON_RADIUS = Math.max(6, Math.round(ICON_SIZE * 0.22));

/** App icon + “Mulligan” row — matches web `auth-logo-enhanced` float + icon pulse. */
const AuthLoginBrandRow = memo(function AuthLoginBrandRow() {
  const floatY = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -10, duration: 1500, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(iconScale, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(iconScale, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    floatLoop.start();
    pulseLoop.start();
    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [floatY, iconScale]);

  return (
    <Animated.View
      style={[styles.row, { transform: [{ translateY: floatY }] }]}
      accessibilityRole="header"
      accessibilityLabel="Mulligan"
    >
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
        <Image source={APP_ICON} style={styles.icon} accessibilityIgnoresInvertColors />
      </Animated.View>
      <Text style={styles.brandText}>Mulligan</Text>
    </Animated.View>
  );
});

export default AuthLoginBrandRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  iconWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
  },
  brandText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
});
