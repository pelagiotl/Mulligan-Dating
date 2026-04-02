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
import { playMatchSound } from '../utils/sounds';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProfileCompleteCelebrationProps {
  visible: boolean;
  onClose: () => void;
}

/** Mix of flames, sparks, bursts, and fireworks — 🔥 weighted heavier */
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

// Single emoji that falls continuously in a loop (resets to top when it reaches bottom)
function FallingFire({ index, visible }: { index: number; visible: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const leftPercent = useRef(5 + Math.random() * 90).current;
  const duration = useRef(3500 + Math.random() * 2500).current;
  const fireEmoji = useRef(
    FIRE_RELATED_EMOJIS[Math.floor(Math.random() * FIRE_RELATED_EMOJIS.length)]
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
      transparent
      animationType="none"
      onRequestClose={handleContinue}
    >
      <View style={styles.overlay}>
        {/* Falling fire emojis - loop until user taps "Start Connecting" */}
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
              colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
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
                <Text style={styles.emoji}>🤑</Text>
              </Animated.View>

              {/* Title */}
              <Animated.View style={{ opacity: titleOpacity }}>
                <Text style={styles.title}>Nice work.</Text>
              </Animated.View>

              {/* Subtitle */}
              <Animated.View style={{ opacity: subtitleOpacity }}>
                <Text style={styles.subtitle}>
                  Have fun & be cool.
                </Text>
              </Animated.View>

              {/* Continue button - pulse + shimmer like Connect button */}
              {showButton && (
                <TouchableOpacity
                  style={styles.button}
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
                      colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.buttonGradient}
                    >
                      <Animated.View
                        style={[
                          styles.buttonShimmer,
                          {
                            transform: [
                              { translateX: buttonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
                              { rotate: buttonShimmer.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-20deg'] }) },
                            ],
                          },
                        ]}
                        pointerEvents="none"
                      />
                      <Text style={styles.buttonText}>Start Connecting →</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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

