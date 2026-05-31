/**
 * Age gate for store compliance (App Store / Google Play).
 * Shown once after login; user must confirm they are 18+ to continue.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/navigationRef';
import { useAuth } from '../context/AuthContext';
import {
  CONNECT_SHELL_MIDNIGHT_GRADIENT,
  connectionLimitsPanelColors,
} from '../lib/connectShellTheme';

const AGE_GATE_STORAGE_KEY = 'AGE_GATE_ACCEPTED';

const isAndroidMidnight = Platform.OS === 'android';
const midnightPanel = connectionLimitsPanelColors('midnight');

const THEME = isAndroidMidnight
  ? {
      screenGradient: [...CONNECT_SHELL_MIDNIGHT_GRADIENT] as string[],
      cardGradient: [...midnightPanel.shellGradient] as string[],
      cardBorder: midnightPanel.shellBorder,
      cardShadow: '#a78bfa',
      accentGradient: [...midnightPanel.accentGradient] as string[],
      title: '#f8fafc',
      lead: '#c4b5fd',
      body: '#94a3b8',
      secondaryText: '#94a3b8',
      secondaryBorder: 'rgba(167, 139, 250, 0.35)',
      secondaryBg: 'rgba(38, 32, 52, 0.65)',
    }
  : {
      screenGradient: ['#f8f9ff', '#eef0fa', '#f8f9ff'],
      cardGradient: null as string[] | null,
      cardBorder: 'rgba(255, 255, 255, 0.9)',
      cardShadow: '#764ba2',
      accentGradient: ['#667eea', '#764ba2', '#f093fb'],
      title: '#1a1a2e',
      lead: '#5b6478',
      body: '#64748b',
      secondaryText: '#718096',
      secondaryBorder: 'transparent',
      secondaryBg: 'transparent',
    };

type AgeGateRouteProp = RouteProp<RootStackParamList, 'AgeGate'>;
type AgeGateNavProp = StackNavigationProp<RootStackParamList, 'AgeGate'>;

export default function AgeGateScreen() {
  const navigation = useNavigation<AgeGateNavProp>();
  const route = useRoute<AgeGateRouteProp>();
  const { connectSetupComplete, profile, logout } = useAuth();
  const nextRoute =
    route.params?.nextRoute ?? (connectSetupComplete ? 'MainTabs' : 'CreateProfile');

  const buttonPulse = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!isAndroidMidnight) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!cancelled) setReduceMotion(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const startButtonPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    buttonPulse.setValue(1);
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, { toValue: 1.04, duration: 1500, useNativeDriver: true }),
        Animated.timing(buttonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();
  }, [buttonPulse, reduceMotion]);

  useEffect(() => {
    if (!isAndroidMidnight) return;
    startButtonPulse();
    return () => {
      pulseLoopRef.current?.stop();
      pulseLoopRef.current = null;
    };
  }, [startButtonPulse]);

  const handlePrimaryPressIn = useCallback(() => {
    Animated.timing(buttonScale, { toValue: 0.97, duration: 50, useNativeDriver: true }).start();
  }, [buttonScale]);

  const handlePrimaryPressOut = useCallback(() => {
    Animated.spring(buttonScale, { toValue: 1, friction: 6, tension: 300, useNativeDriver: true }).start();
  }, [buttonScale]);

  const handleConfirm = async () => {
    try {
      await AsyncStorage.setItem(AGE_GATE_STORAGE_KEY, 'true');
      const goToCreateProfile = !connectSetupComplete || nextRoute === 'CreateProfile';
      navigation.reset({
        index: 0,
        routes: goToCreateProfile
          ? [
              {
                name: 'CreateProfile',
                params: { startFromBeginning: !profile?.id, fromPostAuthLogin: true },
              },
            ]
          : [{ name: 'MainTabs' }],
      });
    } catch (e) {
      Alert.alert('Error', 'Could not save. Please try again.');
    }
  };

  const handleUnderAge = async () => {
    try {
      await AsyncStorage.removeItem(AGE_GATE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'PhoneLogin' }],
    });
  };

  const cardContent = (
    <>
      <LinearGradient
        colors={THEME.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.accentBar}
      />
      <LinearGradient
        colors={THEME.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.iconBadge}
      >
        <Text style={styles.iconBadgeText}>18+</Text>
      </LinearGradient>
      <Text style={[styles.title, { color: THEME.title }]}>Age requirement</Text>
      <Text style={[styles.lead, { color: THEME.lead }]}>Mulligan is for adults only.</Text>
      <Text style={[styles.body, { color: THEME.body }]}>
        By continuing, you confirm that you are at least 18 years of age.
      </Text>
      <TouchableOpacity
        onPress={handleConfirm}
        activeOpacity={0.9}
        onPressIn={isAndroidMidnight ? handlePrimaryPressIn : undefined}
        onPressOut={isAndroidMidnight ? handlePrimaryPressOut : undefined}
        style={isAndroidMidnight ? styles.primaryButtonWrap : undefined}
      >
        <Animated.View
          style={
            isAndroidMidnight
              ? { transform: [{ scale: Animated.multiply(buttonPulse, buttonScale) }] }
              : undefined
          }
        >
          {isAndroidMidnight ? (
            <View style={[styles.primaryButtonGlow, { shadowColor: THEME.cardShadow }]} />
          ) : null}
          <LinearGradient
            colors={THEME.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primaryButton}
          >
            {isAndroidMidnight ? (
              <LinearGradient
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.06)', 'transparent']}
                locations={[0, 0.4, 1]}
                style={styles.primaryButtonGloss}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                pointerEvents="none"
              />
            ) : null}
            <Text style={styles.primaryButtonText}>I am 18 or older 🔒</Text>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.secondaryButton,
          isAndroidMidnight && {
            borderWidth: 1,
            borderColor: THEME.secondaryBorder,
            backgroundColor: THEME.secondaryBg,
            borderRadius: 12,
          },
        ]}
        onPress={handleUnderAge}
        activeOpacity={0.8}
      >
        <Text style={[styles.secondaryButtonText, { color: THEME.secondaryText }]}>
          I&apos;m not 18 yet 😬
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <LinearGradient colors={THEME.screenGradient} style={styles.container}>
      {THEME.cardGradient ? (
        <LinearGradient
          colors={THEME.cardGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.card,
            {
              borderColor: THEME.cardBorder,
              shadowColor: THEME.cardShadow,
              backgroundColor: 'transparent',
            },
          ]}
        >
          {cardContent}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.card,
            {
              borderColor: THEME.cardBorder,
              shadowColor: THEME.cardShadow,
            },
          ]}
        >
          {cardContent}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 28,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 380,
    overflow: 'hidden',
    borderWidth: isAndroidMidnight ? 2 : 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: isAndroidMidnight ? 0.35 : 0.14,
    shadowRadius: isAndroidMidnight ? 24 : 20,
    elevation: isAndroidMidnight ? 10 : 6,
  },
  accentBar: {
    height: 4,
    marginHorizontal: -28,
    marginBottom: 20,
  },
  iconBadge: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  lead: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  primaryButtonWrap: {
    marginBottom: 12,
    position: 'relative',
  },
  primaryButtonGlow: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 4,
    bottom: -2,
    borderRadius: 14,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: isAndroidMidnight ? 0 : 12,
  },
  primaryButtonGloss: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
