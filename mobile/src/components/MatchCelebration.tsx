import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { setPendingOpenMatchId } from '../utils/pendingMatchOpen';
import { navigationRef } from '../navigation/navigationRef';
import { getPhotoUrl } from '../utils/photoUrl';
import { playMatchSound } from '../utils/sounds';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MatchExplanation {
  reasons: string[];
  sharedInterests: string[];
  sharedValues: number;
}

interface MatchCelebrationProps {
  profileName: string;
  photoUrl?: string;
  onClose: () => void;
  explanation?: MatchExplanation | null;
  matchId?: string | null;
}

interface ConfettiParticle {
  id: number;
  left: number;
  delay: number;
  color: string;
}

// Separate component for animated confetti particle
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

// Loading state shown before match reveal: "Finding your curated match..." with animation
function FindingMatchLoading() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const bounce = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ])
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 160);
    const a3 = bounce(dot3, 320);
    a1.start();
    a2.start();
    a3.start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.92, duration: 800, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
      pulseLoop.stop();
    };
  }, []);

  const translateY1 = dot1.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const translateY2 = dot2.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const translateY3 = dot3.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

  return (
    <View style={styles.loadingCard}>
      <Animated.View style={[styles.loadingHeartWrap, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.loadingHeart}>💕</Text>
      </Animated.View>
      <Text style={styles.loadingTitle}>Finding your curated match</Text>
      <View style={styles.loadingDotsRow}>
        <Animated.View style={[styles.loadingDot, { transform: [{ translateY: translateY1 }] }]} />
        <Animated.View style={[styles.loadingDot, { transform: [{ translateY: translateY2 }] }]} />
        <Animated.View style={[styles.loadingDot, { transform: [{ translateY: translateY3 }] }]} />
      </View>
      <Text style={styles.loadingSubtext}>Good things take a moment...</Text>
    </View>
  );
}

const REVEAL_DELAY_MS = 7000; // "Finding your curated match..." shows for 7 seconds before reveal

export default function MatchCelebration({
  profileName,
  photoUrl,
  onClose,
  explanation,
  matchId,
}: MatchCelebrationProps) {
  const navigation = useNavigation();
  const [revealed, setRevealed] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [confettiParticles] = useState<ConfettiParticle[]>(() => {
    const colors = ['#f43f5e', '#fb7185', '#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#ff6b9d', '#c084fc', '#a855f7', '#ec4899', '#f472b6'];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  });

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(SCREEN_HEIGHT * 0.25)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const word1Anim = useRef(new Animated.Value(0)).current;
  const word2Anim = useRef(new Animated.Value(0)).current;
  const word3Anim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  const photoScaleAnim = useRef(new Animated.Value(0)).current;
  const photoPulseAnim = useRef(new Animated.Value(1)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;
  const buttonScaleAnim = useRef(new Animated.Value(0)).current;
  const buttonPulseAnim = useRef(new Animated.Value(1)).current;

  // Show loading state for a few seconds, then reveal the match
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // When revealed, run celebration (haptic, sound, animations)
  useEffect(() => {
    if (!revealed) return;

    // Strong haptic on reveal - satisfying "thunk" when match card appears
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Haptics not available (simulator, etc.)
    }

    // Play match notification sound after a short delay so the modal is visible and the audio session is ready (helps on iOS)
    const soundDelay = setTimeout(() => {
      playMatchSound().catch((error) => {
        console.warn('🎵 [MatchCelebration] Sound playback failed:', error?.message || error);
      });
    }, 280);

    const timer1 = setTimeout(() => setShowContent(true), 100);
    const timer2 = setTimeout(() => setShowConfetti(true), 300);
    const timer3 = setTimeout(() => setShowButton(true), 2000);

    const photoPulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(photoPulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(photoPulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    photoPulseLoop.start();

    const heartBeatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartBeatAnim, {
          toValue: 1.2,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(heartBeatAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );
    heartBeatLoop.start();

    const buttonPulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulseAnim, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(buttonPulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    const timer4 = setTimeout(() => {
      Animated.spring(buttonScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 50,
        useNativeDriver: true,
      }).start();
      buttonPulseLoop.start();
    }, 2000);

    // One-shot animations (no need to stop - they complete)
    Animated.spring(slideUpAnim, {
      toValue: 0,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
    Animated.spring(photoScaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
    Animated.parallel([
      Animated.timing(ring1Anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(ring2Anim, { toValue: 1, duration: 2000, delay: 200, useNativeDriver: true }),
      Animated.timing(ring3Anim, { toValue: 1, duration: 2000, delay: 400, useNativeDriver: true }),
    ]).start();
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    Animated.sequence([
      Animated.spring(word1Anim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      Animated.delay(180),
      Animated.spring(word2Anim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      Animated.delay(180),
      Animated.spring(word3Anim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
    ]).start();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(soundDelay);
      photoPulseLoop.stop();
      heartBeatLoop.stop();
      buttonPulseLoop.stop();
    };
  }, [revealed]);

  const handleContinue = () => {
    const idToOpen = matchId ?? null;
    try {
      onClose();
      if (idToOpen) {
        setPendingOpenMatchId(idToOpen);
        if (navigationRef.current?.isReady()) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'MainTabs',
              params: {
                screen: 'Matches',
                params: { matchId: idToOpen, showMatchCelebration: false },
              },
            })
          );
        } else {
          navigation.navigate('Matches' as never, { matchId: idToOpen, showMatchCelebration: false } as never);
        }
      } else {
        if (navigationRef.current?.isReady()) {
          navigationRef.current.dispatch(
            CommonActions.navigate({ name: 'MainTabs', params: { screen: 'Matches', params: { showMatchCelebration: false } } })
          );
        } else {
          navigation.navigate('Matches' as never);
        }
      }
    } catch (error) {
      console.error('❌ Error in handleContinue:', error);
      onClose();
    }
  };

  /** Navigate to Connect (Browse) tab and close the celebration — used by "Keep Browsing" */
  const handleKeepBrowsing = () => {
    try {
      onClose();
      if (navigationRef.current?.isReady()) {
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'MainTabs',
            params: { screen: 'Browse' },
          })
        );
      } else {
        navigation.navigate('MainTabs' as never, { screen: 'Browse' } as never);
      }
    } catch (error) {
      console.error('❌ Error in handleKeepBrowsing:', error);
      onClose();
    }
  };

  const ring1Scale = ring1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.5],
  });

  const ring1Opacity = ring1Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.8, 0.4, 0],
  });

  const ring2Scale = ring2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });

  const ring2Opacity = ring2Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0],
  });

  const ring3Scale = ring3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.9],
  });

  const ring3Opacity = ring3Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 0.2, 0],
  });

  const word1TranslateY = word1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word1Opacity = word1Anim;

  const word2TranslateY = word2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word2Opacity = word2Anim;

  const word3TranslateY = word3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  const word3Opacity = word3Anim;

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Beautiful gradient background */}
        <LinearGradient
          colors={['#667eea', '#764ba2', '#ff0080', '#f5576c', '#4facfe']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        
        {/* Loading state: "Finding your curated match..." */}
        {!revealed && (
          <FindingMatchLoading />
        )}

        {/* Confetti particles */}
        {revealed && showConfetti && (
          <View style={styles.confettiContainer} pointerEvents="none">
            {confettiParticles.map((particle) => (
              <ConfettiParticleComponent key={particle.id} particle={particle} />
            ))}
          </View>
        )}

        {/* Main celebration content (after reveal) */}
        {revealed && (
        <Animated.View
          style={[
            styles.container,
            {
              transform: [
                { translateY: slideUpAnim },
                { scale: scaleAnim },
              ],
              opacity: opacityAnim,
              shadowOpacity: 0.5,
              shadowRadius: 25,
            },
          ]}
        >
          {/* Photo with animated rings */}
          <View style={styles.photoContainer}>
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring1,
                {
                  transform: [{ scale: ring1Scale }],
                  opacity: ring1Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring2,
                {
                  transform: [{ scale: ring2Scale }],
                  opacity: ring2Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring3,
                {
                  transform: [{ scale: ring3Scale }],
                  opacity: ring3Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.photoWrapper,
                {
                  transform: [
                    { scale: Animated.multiply(photoScaleAnim, photoPulseAnim) },
                  ],
                },
              ]}
            >
              {photoUrl ? (
                <Image
                  source={{ uri: getPhotoUrl(photoUrl) }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>
                    {profileName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Animated.View>
          </View>

          {/* Text content with staggered animations */}
          <View style={styles.textContainer}>
            <View style={styles.titleContainer}>
              <Animated.Text
                style={[
                  styles.titleWord,
                  {
                    transform: [{ translateY: word1TranslateY }],
                    opacity: word1Opacity,
                  },
                ]}
              >
                It's
              </Animated.Text>
              <Animated.Text
                style={[
                  styles.titleWord,
                  {
                    transform: [{ translateY: word2TranslateY }],
                    opacity: word2Opacity,
                  },
                ]}
              >
                {' '}a{' '}
              </Animated.Text>
              <Animated.View
                style={{
                  transform: [{ scale: heartBeatAnim }],
                }}
              >
                <Animated.Text
                  style={[
                    styles.titleWord,
                    styles.titleWordMatch,
                    {
                      transform: [{ translateY: word3TranslateY }],
                      opacity: word3Opacity,
                    },
                  ]}
                >
                  Match! 💖
                </Animated.Text>
              </Animated.View>
            </View>

            <View style={styles.subtitleContainer}>
              <Text style={styles.subtitle}>
                You and <Text style={styles.bold}>{profileName}</Text> liked each other
              </Text>
            </View>
            
            {/* Match Explanation */}
            {explanation && explanation.reasons.length > 0 && (
              <View style={styles.explanationContainer}>
                <Text style={styles.explanationTitle}>Why you matched:</Text>
                {explanation.reasons.map((reason, index) => (
                  <View key={index} style={styles.reasonItem}>
                    <Text style={styles.reasonBullet}>✨</Text>
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}
            
            <View style={styles.messageContainer}>
              <Text style={styles.message}>Start chatting now! 💬</Text>
            </View>

            {showButton && (
              <Animated.View
                style={{
                  transform: [{ scale: buttonScaleAnim }],
                }}
              >
                <Animated.View
                  style={{
                    transform: [{ scale: buttonPulseAnim }],
                  }}
                >
                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={['#ff0080', '#ff3399', '#cc0066', '#ff66b2']}
                      locations={[0, 0.3, 0.7, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Send a Message 💌</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
                
                {/* Keep Browsing button — go to Connect tab */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleKeepBrowsing}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Keep Browsing 💫</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          {/* Sparkles */}
          <SparklesComponent />
          
          {/* Floating Hearts */}
          <FloatingHeartsComponent />
        </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// Individual floating heart with its own looping animation
function FloatingHeart({ index }: { index: number }) {
  const startX = useRef(Math.random() * SCREEN_WIDTH).current;
  const startY = SCREEN_HEIGHT + 20;
  const endY = -50;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const horizontalMovement = useRef((Math.random() - 0.5) * 100).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    const delay = index * 400;
    const duration = 3500 + Math.random() * 1500;

    const runAnimation = () => {
      if (!mounted) return;

      translateX.setValue(0);
      translateY.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.5);
      rotate.setValue(0);

      const seq = Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            tension: 40,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: endY - startY,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: horizontalMovement,
            duration: duration,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 1,
            duration: duration,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]);
      animationRef.current = seq;
      seq.start(({ finished }) => {
        animationRef.current = null;
        if (finished && mounted) runAnimation();
      });
    };

    timeoutRef.current = setTimeout(runAnimation, delay);

    return () => {
      mounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, []);

  const rotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.floatingHeart,
        {
          left: startX,
          top: startY,
          transform: [
            { translateX },
            { translateY },
            { scale },
            { rotate: rotation },
          ],
          opacity,
        },
      ]}
    >
      <Text style={styles.heartEmoji}>💖</Text>
    </Animated.View>
  );
}

// Separate component for floating hearts - renders individual hearts that loop continuously
function FloatingHeartsComponent() {
  return (
    <View style={styles.floatingHeartsContainer} pointerEvents="none">
      {Array.from({ length: 10 }).map((_, i) => (
        <FloatingHeart key={i} index={i} />
      ))}
    </View>
  );
}

// Separate component for animated sparkles
function SparklesComponent() {
  const sparkles = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i * 360) / 16;
    const radius = 120;
    const x = Math.cos((angle * Math.PI) / 180) * radius;
    const y = Math.sin((angle * Math.PI) / 180) * radius;
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0)).current;
    const rotate = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      // Single animation sequence - sparkles animate once and fade out
      // This avoids native driver conflicts from looping
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 400,
            delay: i * 80,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1,
            friction: 3,
            tension: 50,
            delay: i * 80,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 1,
            duration: 2000,
            delay: i * 80,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 600,
            delay: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.8,
            duration: 600,
            delay: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.spring(scale, {
            toValue: 1.2,
            friction: 3,
            tension: 50,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, []);

    const rotation = rotate.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });

    return { x, y, opacity, scale, rotation, key: i };
  });

  return (
    <View style={styles.sparklesContainer} pointerEvents="none">
      {sparkles.map((sparkle) => (
        <Animated.View
          key={sparkle.key}
          style={[
            styles.sparkle,
            {
              transform: [
                { translateX: sparkle.x },
                { translateY: sparkle.y },
                { scale: sparkle.scale },
                { rotate: sparkle.rotation },
              ],
              opacity: sparkle.opacity,
            },
          ]}
        >
          <Text style={styles.sparkleText}>✨</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Slightly more transparent to show gradient
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 28,
    paddingVertical: 44,
    paddingHorizontal: 36,
    alignItems: 'center',
    maxWidth: '88%',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  loadingHeartWrap: {
    marginBottom: 20,
  },
  loadingHeart: {
    fontSize: 52,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f5576c',
  },
  loadingSubtext: {
    fontSize: 15,
    color: '#718096',
    fontStyle: 'italic',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  confettiParticle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    top: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 36,
    padding: 40,
    alignItems: 'center',
    maxWidth: '90%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },
  photoContainer: {
    position: 'relative',
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRing: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 4,
    borderColor: '#ff8fab',
    shadowColor: '#ff8fab',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  ring1: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  ring2: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  ring3: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  photoWrapper: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    borderWidth: 5,
    borderColor: '#fff',
    zIndex: 10,
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ff0080',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  textContainer: {
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  titleWord: {
    fontSize: 40,
    fontWeight: '800',
    color: '#333',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleWordMatch: {
    color: '#ff0080',
    fontSize: 48,
    textShadowColor: 'rgba(255, 0, 128, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  subtitleContainer: {
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 20,
    color: '#555',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bold: {
    fontWeight: '800',
    color: '#ff0080',
    fontSize: 22,
  },
  messageContainer: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  message: {
    fontSize: 18,
    color: '#ff0080',
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  explanationContainer: {
    backgroundColor: 'rgba(255, 0, 128, 0.06)',
    borderRadius: 16,
    padding: 18,
    marginVertical: 16,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 128, 0.2)',
    maxWidth: '90%',
  },
  explanationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ff0080',
    marginBottom: 12,
    textAlign: 'center',
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reasonBullet: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  button: {
    borderRadius: 24,
    marginTop: 8,
    overflow: 'hidden',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 14,
  },
  buttonGradient: {
    paddingHorizontal: 44,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 2,
    borderColor: '#ff0080',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff0080',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButtonText: {
    color: '#ff0080',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sparklesContainer: {
    position: 'absolute',
    width: 240,
    height: 240,
    top: 10,
    left: '50%',
    marginLeft: -120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
  },
  sparkleText: {
    fontSize: 28,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  floatingHeartsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  floatingHeart: {
    position: 'absolute',
  },
  heartEmoji: {
    fontSize: 32,
    textShadowColor: 'rgba(245, 87, 108, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
