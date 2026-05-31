import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Vibration,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AUTH_PAGE_GRADIENT_FALLBACK } from '../constants/authLoginTheme';
import { connectionLimitsPanelColors } from '../lib/connectShellTheme';
import ProfileCardAnimatedEmoji from './ProfileCardAnimatedEmoji';
import { playMatchSound } from '../utils/sounds';

const isAndroidMidnightCelebration = Platform.OS === 'android';
const midnightPanel = connectionLimitsPanelColors('midnight');

const CELEBRATION_THEME = isAndroidMidnightCelebration
  ? {
      overlaySolid: AUTH_PAGE_GRADIENT_FALLBACK,
      overlayGradient: null as string[] | null,
      overlayGradientLocations: null as number[] | null,
      overlayGradientStart: null,
      overlayGradientEnd: null,
      overlayTint: null as string | null,
      cardGradient: ['#211d33', '#16122a', '#121018'],
      cardBorder: midnightPanel.shellBorder,
      cardShadow: '#a78bfa',
      buttonGradient: [...midnightPanel.accentGradient],
      buttonBorder: 'rgba(196, 181, 253, 0.5)',
      buttonShadow: '#8b5cf6',
      buttonShimmer: 'rgba(196, 181, 253, 0.45)',
      titleColor: '#f8fafc',
      subtitleColor: '#c4b5fd',
    }
  : {
      overlaySolid: null as string | null,
      overlayGradient: null as string[] | null,
      overlayGradientLocations: null as number[] | null,
      overlayGradientStart: null,
      overlayGradientEnd: null,
      overlayTint: 'rgba(0, 0, 0, 0.7)',
      cardGradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c'],
      cardBorder: 'rgba(255, 255, 255, 0.25)',
      cardShadow: '#000',
      buttonGradient: ['#667eea', '#764ba2', '#f093fb', '#f5576c'],
      buttonBorder: 'rgba(255, 255, 255, 0.3)',
      buttonShadow: '#667eea',
      buttonShimmer: 'rgba(255, 255, 255, 0.4)',
      titleColor: '#fff',
      subtitleColor: 'rgba(255, 255, 255, 0.95)',
    };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProfileCompleteCelebrationProps {
  visible: boolean;
  onClose: () => void;
}

/** iOS: mixed celebration particles. Android: 💰 only — matches the 🤑 hero on the card. */
const FIRE_RELATED_EMOJIS = [
  '🔥',
  '🔥',
  '🔥',
  '🔥',
  '🔥',
  '💥',
  '🎆',
  '🎇',
  '🧨',
  '🌋',
  '🕯️',
  '✨',
  '⭐',
];

const FALLING_EMOJI_POOL = isAndroidMidnightCelebration ? ['💰'] : FIRE_RELATED_EMOJIS;

// Single emoji that falls continuously in a loop (resets to top when it reaches bottom)
function FallingFire({ index, visible }: { index: number; visible: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const leftPercent = useRef(5 + Math.random() * 90).current;
  const duration = useRef(3500 + Math.random() * 2500).current;
  const fireEmoji = useRef(
    FALLING_EMOJI_POOL[Math.floor(Math.random() * FALLING_EMOJI_POOL.length)]
  ).current;
  const delay = useRef(Math.random() * 2000).current;
  const fontSize = useRef(22 + (index % 7) * 4).current; // 22–46px variety
  const running = useRef(true);

  useEffect(() => {
    if (!visible) {
      running.current = false;
      return;
    }
    running.current = true;

    const runFall = () => {
      if (!running.current) return;
      translateY.setValue(0);
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT + 60,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && running.current) runFall();
      });
    };

    const startTimer = setTimeout(runFall, delay);
    return () => {
      running.current = false;
      clearTimeout(startTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.fallingFire,
        {
          left: `${leftPercent}%`,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.fallingFireEmoji, { fontSize }]}>{fireEmoji}</Text>
    </Animated.View>
  );
}

export default function ProfileCompleteCelebration({
  visible,
  onClose,
}: ProfileCompleteCelebrationProps) {
  const [showContent, setShowContent] = useState(false);
  const [showFloatingFires, setShowFloatingFires] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const FIRE_COUNT = 22;

  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const emojiScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  // Start Connecting button animations (pulse + shimmer, same as Connect button)
  const buttonPulse = useRef(new Animated.Value(1)).current;
  const buttonShimmer = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonLoopsRef = useRef<{ pulseLoop: Animated.CompositeAnimation; shimmerLoop: Animated.CompositeAnimation } | null>(null);

  const startButtonAnimations = useCallback(() => {
    if (buttonLoopsRef.current) return;
    buttonPulse.setValue(1);
    buttonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(buttonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonShimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(buttonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    buttonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, []);

  const stopButtonAnimations = useCallback(() => {
    const loops = buttonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      buttonLoopsRef.current = null;
    }
    buttonPulse.setValue(1);
    buttonShimmer.setValue(0);
  }, []);

  useEffect(() => {
    if (visible) {
      // Play celebration sound
      playMatchSound().catch((error) => {
        // Non-critical - app works without sound, but log for debugging
        console.log('🎵 Profile completion sound error (non-critical):', error);
      });

      // Reset animations
      scale.setValue(0);
      opacity.setValue(0);
      emojiScale.setValue(0);
      titleOpacity.setValue(0);
      subtitleOpacity.setValue(0);
      setShowContent(false);
      setShowFloatingFires(false);
      setShowButton(false);

      // Start animations
      setTimeout(() => {
        setShowFloatingFires(true);
        setShowContent(true);

        // Main card animation
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();

        // Emoji animation
        setTimeout(() => {
          Animated.spring(emojiScale, {
            toValue: 1,
            tension: 30,
            friction: 5,
            useNativeDriver: true,
          }).start();
        }, 200);

        // Title animation
        setTimeout(() => {
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }, 400);

        // Subtitle animation
        setTimeout(() => {
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }, 600);

        // Show button
        setTimeout(() => {
          setShowButton(true);
        }, 1000);
      }, 100);
    } else {
      stopButtonAnimations();
    }
  }, [visible, stopButtonAnimations]);

  // Start button pulse/shimmer when button appears
  useEffect(() => {
    if (showButton && visible) {
      const t = setTimeout(startButtonAnimations, 150);
      return () => {
        clearTimeout(t);
        stopButtonAnimations();
      };
    }
  }, [showButton, visible, startButtonAnimations, stopButtonAnimations]);

  const handleContinue = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={!isAndroidMidnightCelebration}
      animationType="none"
      statusBarTranslucent={isAndroidMidnightCelebration}
      onRequestClose={handleContinue}
    >
      <View style={styles.overlay}>
        {CELEBRATION_THEME.overlaySolid ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: CELEBRATION_THEME.overlaySolid }]}
          />
        ) : CELEBRATION_THEME.overlayGradient ? (
          <LinearGradient
            colors={CELEBRATION_THEME.overlayGradient}
            locations={CELEBRATION_THEME.overlayGradientLocations ?? undefined}
            start={CELEBRATION_THEME.overlayGradientStart ?? { x: 0, y: 0 }}
            end={CELEBRATION_THEME.overlayGradientEnd ?? { x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {CELEBRATION_THEME.overlayTint ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: CELEBRATION_THEME.overlayTint },
            ]}
            pointerEvents="none"
          />
        ) : null}
        {/* Falling celebration emojis — loop until user taps continue */}
        {showFloatingFires && (
          <View style={styles.firesContainer} pointerEvents="none">
            {Array.from({ length: FIRE_COUNT }, (_, i) => (
              <FallingFire key={i} index={i} visible={visible} />
            ))}
          </View>
        )}

        {/* Main celebration card */}
        {showContent && (
          <Animated.View
            style={[
              styles.cardContainer,
              {
                transform: [{ scale }],
                opacity,
              },
            ]}
          >
            <LinearGradient
              colors={CELEBRATION_THEME.cardGradient}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[
                styles.card,
                {
                  borderWidth: 2,
                  borderColor: CELEBRATION_THEME.cardBorder,
                  shadowColor: CELEBRATION_THEME.cardShadow,
                },
              ]}
            >
              {/* Emoji */}
              <Animated.View
                style={[
                  styles.emojiContainer,
                  {
                    transform: [{ scale: emojiScale }],
                  },
                ]}
              >
                {isAndroidMidnightCelebration ? (
                  <ProfileCardAnimatedEmoji
                    emoji="🤑"
                    variant="celebrate"
                    fontSize={80}
                    containerStyle={styles.emojiAnimatedWrap}
                    style={styles.emoji}
                  />
                ) : (
                  <Text style={styles.emoji}>🤑</Text>
                )}
              </Animated.View>

              {/* Title */}
              <Animated.View style={{ opacity: titleOpacity }}>
                <Text style={[styles.title, { color: CELEBRATION_THEME.titleColor }]}>Nice work.</Text>
              </Animated.View>

              {/* Subtitle */}
              <Animated.View style={{ opacity: subtitleOpacity }}>
                <Text style={[styles.subtitle, { color: CELEBRATION_THEME.subtitleColor }]}>
                  Have fun & be cool.
                </Text>
              </Animated.View>

              {/* Continue button - pulse + shimmer like Connect button */}
              {showButton && (
                <TouchableOpacity
                  style={[
                    styles.button,
                    { shadowColor: CELEBRATION_THEME.buttonShadow },
                  ]}
                  onPress={handleContinue}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    Animated.timing(buttonScale, { toValue: 0.95, duration: 50, useNativeDriver: true }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(buttonScale, { toValue: 1, friction: 6, tension: 300, useNativeDriver: true }).start();
                  }}
                >
                  <Animated.View style={{ transform: [{ scale: Animated.multiply(buttonPulse, buttonScale) }] }}>
                    <LinearGradient
                      colors={CELEBRATION_THEME.buttonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.buttonGradient,
                        { borderColor: CELEBRATION_THEME.buttonBorder },
                      ]}
                    >
                      <Animated.View
                        style={[
                          styles.buttonShimmer,
                          {
                            backgroundColor: CELEBRATION_THEME.buttonShimmer,
                            transform: [
                              { translateX: buttonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
                              { rotate: buttonShimmer.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-20deg'] }) },
                            ],
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <Text style={styles.buttonText}>
                        {isAndroidMidnightCelebration ? "Let's get it" : 'Start Connecting →'}
                      </Text>
                    </LinearGradient>
                  </Animated.View>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: isAndroidMidnightCelebration ? '#0c0a12' : 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  firesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    overflow: 'hidden',
  },
  fallingFire: {
    position: 'absolute',
    top: -40,
  },
  fallingFireEmoji: {
    fontSize: 28,
  },
  cardContainer: {
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 400,
    zIndex: 2,
  },
  card: {
    borderRadius: 32,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  emojiContainer: {
    marginBottom: 20,
  },
  emojiAnimatedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 80,
    textAlign: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
  },
  button: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-20deg' }],
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

