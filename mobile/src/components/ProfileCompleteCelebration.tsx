import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { playMatchSound } from '../utils/sounds';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProfileCompleteCelebrationProps {
  visible: boolean;
  onClose: () => void;
}

interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  color: string;
}

// Animated confetti particle
function ConfettiParticleComponent({ particle }: { particle: ConfettiParticle }) {
  const translateY = useRef(new Animated.Value(-10)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT + 20,
        duration: 3000 + Math.random() * 2000,
        delay: particle.delay * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(rotate, {
        toValue: 1,
        duration: 3000 + Math.random() * 2000,
        delay: particle.delay * 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        delay: 2500 + Math.random() * 1000,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.confettiParticle,
        {
          left: `${particle.left}%`,
          backgroundColor: particle.color,
          transform: [{ translateY }, { rotate: rotation }],
          opacity,
        },
      ]}
    />
  );
}

export default function ProfileCompleteCelebration({
  visible,
  onClose,
}: ProfileCompleteCelebrationProps) {
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [confettiParticles] = useState<ConfettiParticle[]>(() => {
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#ffd700', '#ff6b6b'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  });

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
      setShowConfetti(false);
      setShowButton(false);

      // Start animations
      setTimeout(() => {
        setShowConfetti(true);
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
        {/* Confetti */}
        {showConfetti && (
          <View style={styles.confettiContainer} pointerEvents="none">
            {confettiParticles.map((particle) => (
              <ConfettiParticleComponent key={particle.id} particle={particle} />
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
                <Text style={styles.emoji}>🎉</Text>
              </Animated.View>

              {/* Title */}
              <Animated.View style={{ opacity: titleOpacity }}>
                <Text style={styles.title}>Nice Job!</Text>
              </Animated.View>

              {/* Subtitle */}
              <Animated.View style={{ opacity: subtitleOpacity }}>
                <Text style={styles.subtitle}>
                  Your profile is complete!{'\n'}
                  You're all set to start connecting.
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
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  confettiParticle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 2,
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

