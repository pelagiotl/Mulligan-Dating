import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useNavigation, CommonActions } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { setPendingOpenMatchId, isDemoCelebrationMatchId } from '../utils/pendingMatchOpen';
import { navigationRef } from '../navigation/navigationRef';
import OptimizedImage from './OptimizedImage';
import { getPhotoUrl } from '../utils/photoUrl';
import { resolveIntroVideoUrl } from '../utils/introVideo';
import { playMatchSound } from '../utils/sounds';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { matchCelebrationTheme, type MatchCelebrationTheme } from '../lib/matchCelebrationTheme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/** NBSP keeps "Match!" on one line (avoids orphan "!" on narrow widths, e.g. iPhone SE). */
const TITLE_MATCH_TAIL = 'Match!\u00a0❤️‍🔥';

interface MatchExplanation {
  reasons: string[];
  sharedInterests: string[];
  sharedValues: number;
}

interface MatchCelebrationProps {
  profileName: string;
  photoUrl?: string;
  introVideoUrl?: string | null;
  onClose: () => void;
  explanation?: MatchExplanation | null;
  matchId?: string | null;
  onSeeDateIdeas?: () => void;
  /** When true (recipient / User B), skip loading card and show celebration immediately. When false (initiator / User A), show loading then reveal. */
  skipLoadingReveal?: boolean;
  /** When true (Connect flow), show loading until matchId is set, then reveal after a short delay. When false, use fixed REVEAL_DELAY_MS. */
  revealWhenMatchIdReady?: boolean;
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

// Loading state before celebration reveal (Connect flow)
function FindingMatchLoading({ theme }: { theme: MatchCelebrationTheme }) {
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
    <LinearGradient
      colors={theme.loadingCardGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.loadingCard, { borderColor: theme.loadingBorder }]}
    >
      <Animated.View style={[styles.loadingHeartWrap, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.loadingHeart}>❤️‍🔥</Text>
      </Animated.View>
      <Text style={[styles.loadingTitle, { color: theme.loadingTitle }]}>Finding your curated match</Text>
      <View style={styles.loadingDotsRow}>
        <Animated.View
          style={[styles.loadingDot, { backgroundColor: theme.loadingDot, transform: [{ translateY: translateY1 }] }]}
        />
        <Animated.View
          style={[styles.loadingDot, { backgroundColor: theme.loadingDot, transform: [{ translateY: translateY2 }] }]}
        />
        <Animated.View
          style={[styles.loadingDot, { backgroundColor: theme.loadingDot, transform: [{ translateY: translateY3 }] }]}
        />
      </View>
      <Text style={[styles.loadingSubtext, { color: theme.loadingSub }]}>Good things take a moment...</Text>
    </LinearGradient>
  );
}

const REVEAL_DELAY_MS = 7000; // Minimum loading time before reveal (Connect flow)

export default function MatchCelebration({
  profileName,
  photoUrl,
  introVideoUrl,
  onClose,
  explanation,
  matchId,
  onSeeDateIdeas,
  skipLoadingReveal = false,
  revealWhenMatchIdReady = false,
}: MatchCelebrationProps) {
  const { width: windowWidth } = useWindowDimensions();
  const navigation = useNavigation();
  const { mode: connectShellMode } = useConnectShellTheme();
  const theme = useMemo(() => matchCelebrationTheme(connectShellMode), [connectShellMode]);
  // Init from prop so User B (skipLoadingReveal=true) shows celebration immediately; User A (false) always sees loading first
  const [revealed, setRevealed] = useState(() => skipLoadingReveal);
  const [showContent, setShowContent] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [modalVisible, setModalVisible] = useState(true);
  /** When true, overlay uses pointerEvents="none" so touches pass through during Back to Connect transition (avoids freeze) */
  const [isClosingToBrowse, setIsClosingToBrowse] = useState(false);
  const confettiParticles = useMemo<ConfettiParticle[]>(() => {
    const colors = [...theme.confettiColors];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, [theme]);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(SCREEN_HEIGHT * 0.25)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const word1Anim = useRef(new Animated.Value(0)).current;
  const word2Anim = useRef(new Animated.Value(0)).current;
  const word3Anim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const photoScaleAnim = useRef(new Animated.Value(0)).current;
  const photoPulseAnim = useRef(new Animated.Value(1)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;
  const buttonScaleAnim = useRef(new Animated.Value(0)).current;
  const buttonPulseAnim = useRef(new Animated.Value(1)).current;
  /** Ensure we only play the match sound once (effect can run twice in Strict Mode or on re-run) */
  const soundPlayedRef = useRef(false);
  /** When the loading card opened (Connect flow); used to enforce 7s minimum */
  const openedAtRef = useRef<number>(Date.now());

  // Connect flow: show loading for at least REVEAL_DELAY_MS (7s), then reveal when matchId is set
  useEffect(() => {
    if (!revealWhenMatchIdReady || skipLoadingReveal || !matchId?.trim()) return;
    const elapsed = Date.now() - openedAtRef.current;
    const remaining = Math.max(0, REVEAL_DELAY_MS - elapsed);
    const t = setTimeout(() => setRevealed(true), remaining);
    return () => clearTimeout(t);
  }, [revealWhenMatchIdReady, skipLoadingReveal, matchId]);

  // Fixed delay: show loading for REVEAL_DELAY_MS then reveal (when not using revealWhenMatchIdReady)
  useEffect(() => {
    if (skipLoadingReveal || revealWhenMatchIdReady) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [skipLoadingReveal, revealWhenMatchIdReady]);

  // When revealed, run celebration (haptic, sound, animations) — sound plays once when the match card opens
  useEffect(() => {
    if (!revealed) return;

    // Strong haptic on reveal - satisfying "thunk" when match card appears
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Haptics not available (simulator, etc.)
    }

    // Sound is played in a separate effect when showContent becomes true (so it only plays when celebration card is visible, not when loading card is open)
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
      photoPulseLoop.stop();
      heartBeatLoop.stop();
      buttonPulseLoop.stop();
    };
  }, [revealed]);

  // Play match sound only when the celebration card is actually visible (showContent), not during loading
  useEffect(() => {
    if (!showContent) return;
    if (soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    const t = setTimeout(() => {
      playMatchSound().catch((error) => {
        console.warn('🎵 [MatchCelebration] Sound playback failed:', error?.message || error);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [showContent]);

  const handleContinue = () => {
    const idToOpen = matchId ?? null;
    try {
      onClose();
      if (idToOpen && !isDemoCelebrationMatchId(idToOpen)) {
        setPendingOpenMatchId(idToOpen);
        if (navigationRef.current?.isReady()) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'MainTabs',
              params: { screen: 'Matches', params: {} },
            })
          );
        } else {
          navigation.navigate('Matches' as never);
        }
      } else if (navigationRef.current?.isReady()) {
        navigationRef.current.dispatch(
          CommonActions.navigate({ name: 'MainTabs', params: { screen: 'Matches', params: {} } })
        );
      } else {
        navigation.navigate('Matches' as never);
      }
    } catch (error) {
      console.error('❌ Error in handleContinue:', error);
      onClose();
    }
  };

  /** Navigate to Connect (Browse) tab landing page and close the celebration — used by "Back to Connect" */
  const handleKeepBrowsing = () => {
    try {
      import('../utils/debugLogger').then(({ addBreadcrumb, debugLog }) => {
        addBreadcrumb('MatchCelebration', 'Back to Connect tapped', { matchId });
        debugLog('MatchCelebration', 'Back to Connect flow', { step: 'unblock then navigate then onClose' });
      });
      // Let touches pass through immediately so tab bar and Connect button stay usable (avoids freeze)
      setIsClosingToBrowse(true);
      // Next tick: navigate first so Browse receives resetToLanding and hides modal by param, then clear state
      setTimeout(() => {
        import('../utils/debugLogger').then(({ addBreadcrumb }) => {
          addBreadcrumb('MatchCelebration', 'Navigate to Browse', { ready: navigationRef.current?.isReady() });
        });
        if (navigationRef.current?.isReady()) {
          navigationRef.current.dispatch(
            CommonActions.navigate({
              name: 'MainTabs',
              params: { screen: 'Browse', params: { resetToLanding: true } },
            })
          );
        } else {
          navigation.navigate('MainTabs' as never, { screen: 'Browse', params: { resetToLanding: true } } as never);
        }
        onClose();
      }, 0);
    } catch (error) {
      console.error('❌ Error in handleKeepBrowsing:', error);
      setIsClosingToBrowse(true);
      onClose();
    }
  };

  const ring1Scale = ring1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.55],
  });

  const ring1Opacity = ring1Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.45, 0.2, 0],
  });

  const ring2Scale = ring2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.75],
  });

  const ring2Opacity = ring2Anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.12, 0],
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
      visible={modalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay} pointerEvents={isClosingToBrowse ? 'none' : 'auto'}>
        <LinearGradient
          colors={theme.backdrop}
          locations={theme.backdropLocations}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} />

        {/* Loading state before reveal */}
        {!revealed && <FindingMatchLoading theme={theme} />}

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
              transform: [{ translateY: slideUpAnim }, { scale: scaleAnim }],
              opacity: opacityAnim,
              shadowColor: theme.cardShadow,
              shadowOpacity: 0.45,
              shadowRadius: 28,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <LinearGradient
            colors={theme.cardGradient}
            locations={theme.cardGradientLocations}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGradient}
          >
          {/* Photo with animated rings */}
          <View style={styles.photoContainer}>
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring1,
                { borderColor: theme.photoRing, transform: [{ scale: ring1Scale }], opacity: ring1Opacity },
              ]}
            />
            <Animated.View
              style={[
                styles.photoRing,
                styles.ring2,
                { borderColor: theme.photoRing, transform: [{ scale: ring2Scale }], opacity: ring2Opacity },
              ]}
            />
            <Animated.View
              style={[
                styles.photoWrapper,
                {
                  borderColor: theme.photoBorder,
                  transform: [{ scale: Animated.multiply(photoScaleAnim, photoPulseAnim) }],
                },
              ]}
            >
              {photoUrl ? (
                <OptimizedImage
                  source={getPhotoUrl(photoUrl)}
                  style={styles.photo}
                  resizeMode="cover"
                  showLoadingIndicator={false}
                />
              ) : (
                <LinearGradient colors={theme.placeholderGradient} style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>
                    {profileName.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </Animated.View>
          </View>

          {introVideoUrl ? (
            <View style={styles.introVideoSection}>
              <Text style={[styles.introVideoLabel, { color: theme.subtitle }]}>
                {profileName.split(' ')[0]}'s intro
              </Text>
              <View style={[styles.introVideoWrap, { borderColor: theme.photoBorder }]}>
                <Video
                  source={{ uri: resolveIntroVideoUrl(introVideoUrl) }}
                  style={styles.introVideo}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  shouldPlay={false}
                  isLooping={false}
                />
              </View>
            </View>
          ) : null}

          {/* Text content with staggered animations */}
          <View style={styles.textContainer}>
            <View
              style={[
                styles.titleContainer,
                { maxWidth: windowWidth - 24 },
              ]}
            >
              <Animated.Text
                style={[
                  styles.titleWord,
                  windowWidth <= 375 && styles.titleWordCompact,
                  { color: theme.title, transform: [{ translateY: word1TranslateY }], opacity: word1Opacity },
                ]}
              >
                It's
              </Animated.Text>
              <Animated.Text
                style={[
                  styles.titleWord,
                  windowWidth <= 375 && styles.titleWordCompact,
                  { color: theme.title, transform: [{ translateY: word2TranslateY }], opacity: word2Opacity },
                ]}
              >
                {' '}a{' '}
              </Animated.Text>
              <Animated.View
                style={{
                  transform: [{ scale: heartBeatAnim }],
                  maxWidth: windowWidth - 24,
                }}
              >
                <Animated.Text
                  style={[
                    styles.titleWord,
                    styles.titleWordMatch,
                    windowWidth <= 375 && styles.titleWordMatchCompact,
                    {
                      color: theme.titleAccent,
                      transform: [{ translateY: word3TranslateY }],
                      opacity: word3Opacity,
                    },
                  ]}
                >
                  {TITLE_MATCH_TAIL}
                </Animated.Text>
              </Animated.View>
            </View>

            <View style={styles.subtitleContainer}>
              <Text style={[styles.subtitle, { color: theme.subtitle }]}>
                You matched — time to say hi ❤️‍🔥
              </Text>
            </View>

            {/* Match Explanation */}
            {explanation && explanation.reasons.length > 0 && (
              <View
                style={[
                  styles.explanationContainer,
                  { backgroundColor: theme.explanationBg, borderColor: theme.explanationBorder },
                ]}
              >
                <Text style={[styles.explanationTitle, { color: theme.explanationTitle }]}>
                  What you have in common:
                </Text>
                {explanation.reasons.map((reason, index) => (
                  <View key={index} style={styles.reasonItem}>
                    <Text style={[styles.reasonBullet, { color: theme.explanationBullet }]}>{'\u2022'}</Text>
                    <Text style={[styles.reasonText, { color: theme.explanationText }]}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {showButton && (
              <Animated.View
                style={{
                  transform: [{ scale: buttonScaleAnim }],
                }}
              >
                {onSeeDateIdeas && matchId ? (
                  <TouchableOpacity
                    style={[styles.dateIdeasButton, { borderColor: theme.secondaryBorder }]}
                    onPress={onSeeDateIdeas}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#7c3aed', '#a855f7', '#c084fc']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.dateIdeasGradient}
                    >
                      <Text style={styles.dateIdeasText}>See Date Ideas for You Two 📅</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : null}
                <Animated.View
                  style={{
                    transform: [{ scale: buttonPulseAnim }],
                  }}
                >
                  <TouchableOpacity
                    style={[styles.button, { shadowColor: theme.cardShadow }]}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={theme.primaryCta}
                      locations={[0, 0.45, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.buttonGradient}
                    >
                      <View style={styles.buttonContent}>
                        <Text style={styles.buttonText}>Send a Message 💌</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
                
                {/* Back to Connect — Browse tab landing */}
                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    {
                      backgroundColor: theme.secondaryBg,
                      borderColor: theme.secondaryBorder,
                    },
                  ]}
                  onPress={handleKeepBrowsing}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.secondaryText }]}>
                    Back to Connect ❤️‍🔥
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          <FloatingHeartsComponent emojis={theme.floatingEmojis} />
          </LinearGradient>
        </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// Individual floating emoji with its own looping animation
function FloatingHeart({ index, emojis }: { index: number; emojis: readonly string[] }) {
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

  const emoji = emojis[index % emojis.length];

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
      <Text style={styles.heartEmoji}>{emoji}</Text>
    </Animated.View>
  );
}

function FloatingHeartsComponent({ emojis }: { emojis: readonly string[] }) {
  return (
    <View style={styles.floatingHeartsContainer} pointerEvents="none">
      {Array.from({ length: 10 }).map((_, i) => (
        <FloatingHeart key={i} index={i} emojis={emojis} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    borderRadius: 28,
    paddingVertical: 44,
    paddingHorizontal: 36,
    alignItems: 'center',
    maxWidth: '88%',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
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
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.2,
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
  },
  loadingSubtext: {
    fontSize: 15,
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
    borderRadius: 36,
    maxWidth: '90%',
    borderWidth: 2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 18 },
    elevation: 24,
  },
  cardGradient: {
    padding: 40,
    alignItems: 'center',
    borderRadius: 34,
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
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  ring1: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  ring2: {
    width: 168,
    height: 168,
    borderRadius: 84,
  },
  photoWrapper: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: 'hidden',
    borderWidth: 5,
    zIndex: 10,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 14,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  introVideoSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    width: '100%',
  },
  introVideoLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.9,
  },
  introVideoWrap: {
    width: 120,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 3,
    backgroundColor: '#1a1028',
  },
  introVideo: {
    width: '100%',
    height: '100%',
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
    alignSelf: 'center',
  },
  titleWord: {
    fontSize: 40,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleWordCompact: {
    fontSize: 34,
  },
  titleWordMatch: {
    fontSize: 48,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
    textAlign: 'center',
  },
  titleWordMatchCompact: {
    fontSize: 40,
  },
  subtitleContainer: {
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 20,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bold: {
    fontWeight: '800',
    fontSize: 22,
  },
  explanationContainer: {
    borderRadius: 16,
    padding: 18,
    marginVertical: 16,
    marginHorizontal: 8,
    borderWidth: 1,
    maxWidth: '90%',
  },
  explanationTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    borderRadius: 24,
    marginTop: 8,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 14,
  },
  buttonGradient: {
    paddingHorizontal: 44,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
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
  dateIdeasButton: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
  },
  dateIdeasGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  dateIdeasText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    textShadowColor: 'rgba(196, 38, 211, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
