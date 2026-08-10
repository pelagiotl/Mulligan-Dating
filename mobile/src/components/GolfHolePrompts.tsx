/**
 * Golf Dates hole prompts — immersive fairway card with per-hole reveal animations.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Easing,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { api } from '../utils/api';

type HolePromptState = {
  matchId: string;
  currentHole: number;
  totalHoles: number;
  prompt: string;
  completed: boolean;
};

type Props = {
  matchId: string;
  headerMode?: boolean;
  onPromptShared?: () => void;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_MAX_W = Math.min(408, SCREEN_W - 28);
const RING_SIZE = 88;
const RING_STROKE = 5;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Strip "Hole N — " prefix when the API returns the full deck string. */
function promptBody(raw: string, hole: number): string {
  const stripped = raw.replace(new RegExp(`^Hole\\s*${hole}\\s*[—–-]\\s*`, 'i'), '').trim();
  return stripped || raw;
}

function AmbientOrb({
  size,
  left,
  top,
  color,
  delay,
  visible,
}: {
  size: number;
  left: number;
  top: number;
  color: string;
  delay: number;
  visible: boolean;
}) {
  const drift = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 700,
      delay,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 5200 + delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 5200 + delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, delay, drift, opacity]);

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left,
          top,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    />
  );
}

function Sparkle({
  left,
  top,
  delay,
  visible,
}: {
  left: string;
  top: string;
  delay: number;
  visible: boolean;
}) {
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(twinkle, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: 1100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, delay, twinkle]);

  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          left,
          top,
          opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.55] }),
          transform: [
            {
              scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }),
            },
          ],
        },
      ]}
    >
      ✦
    </Animated.Text>
  );
}

export default function GolfHolePrompts({ matchId, headerMode, onPromptShared }: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<HolePromptState | null>(null);
  const [displayPrompt, setDisplayPrompt] = useState('');
  const [displayHole, setDisplayHole] = useState(1);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(28)).current;
  const ringProgress = useRef(new Animated.Value(0)).current;
  const holeNumScale = useRef(new Animated.Value(1)).current;
  const holeNumOpacity = useRef(new Animated.Value(1)).current;
  const promptSlide = useRef(new Animated.Value(0)).current;
  const promptOpacity = useRef(new Animated.Value(1)).current;
  const promptScale = useRef(new Animated.Value(1)).current;
  const flagFloat = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const shareFlash = useRef(new Animated.Value(0)).current;
  const animatingPrompt = useRef(false);

  const applyPromptContent = useCallback((next: HolePromptState) => {
    const hole = Number(next.currentHole) || 1;
    const prompt =
      next.prompt ||
      (next as HolePromptState & { Prompt?: string }).Prompt ||
      '';
    setState({ ...next, currentHole: hole, prompt });
    setDisplayHole(hole);
    setDisplayPrompt(promptBody(prompt, hole));
  }, []);

  const animatePromptIn = useCallback(
    (pct: number, withRing: boolean) => {
      holeNumScale.setValue(0.82);
      holeNumOpacity.setValue(0);
      promptSlide.setValue(18);
      promptOpacity.setValue(0);
      promptScale.setValue(0.97);

      const animations: Animated.CompositeAnimation[] = [
        Animated.spring(holeNumScale, {
          toValue: 1,
          tension: 90,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(holeNumOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(promptOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(promptSlide, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(promptScale, {
          toValue: 1,
          tension: 74,
          friction: 9,
          useNativeDriver: true,
        }),
      ];

      if (withRing) {
        animations.push(
          Animated.timing(ringProgress, {
            toValue: pct,
            duration: 480,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        );
      } else {
        ringProgress.setValue(pct);
      }

      Animated.parallel(animations).start(() => {
        animatingPrompt.current = false;
        // Hard-guarantee visible text if a native animation was interrupted
        promptOpacity.setValue(1);
        holeNumOpacity.setValue(1);
        promptSlide.setValue(0);
        promptScale.setValue(1);
        holeNumScale.setValue(1);
      });
    },
    [
      holeNumOpacity,
      holeNumScale,
      promptOpacity,
      promptScale,
      promptSlide,
      ringProgress,
    ],
  );

  const runPromptReveal = useCallback(
    (next: HolePromptState, direction: 'enter' | 'advance' = 'enter') => {
      const pct = next.totalHoles > 0 ? next.currentHole / next.totalHoles : 0;

      if (direction === 'enter') {
        applyPromptContent(next);
        animatePromptIn(pct, false);
        return;
      }

      if (animatingPrompt.current) {
        applyPromptContent(next);
        ringProgress.setValue(pct);
        promptOpacity.setValue(1);
        holeNumOpacity.setValue(1);
        promptSlide.setValue(0);
        promptScale.setValue(1);
        holeNumScale.setValue(1);
        return;
      }

      animatingPrompt.current = true;
      Animated.parallel([
        Animated.timing(promptOpacity, {
          toValue: 0,
          duration: 130,
          useNativeDriver: true,
        }),
        Animated.timing(promptSlide, {
          toValue: -12,
          duration: 130,
          useNativeDriver: true,
        }),
        Animated.timing(holeNumOpacity, {
          toValue: 0,
          duration: 110,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        applyPromptContent(next);
        // Wait one frame so text commits before fading in (avoids blank stuck state)
        requestAnimationFrame(() => {
          if (!finished) {
            // Interrupted — still show the new hole
            ringProgress.setValue(pct);
            promptOpacity.setValue(1);
            holeNumOpacity.setValue(1);
            promptSlide.setValue(0);
            promptScale.setValue(1);
            holeNumScale.setValue(1);
            animatingPrompt.current = false;
            return;
          }
          animatePromptIn(pct, true);
        });
      });
    },
    [animatePromptIn, applyPromptContent, holeNumOpacity, holeNumScale, promptOpacity, promptScale, promptSlide, ringProgress],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<HolePromptState>(`/matches/${matchId}/hole-prompts`, false);
      runPromptReveal(data, 'enter');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load hole prompts';
      Alert.alert('Golf Dates', msg);
    } finally {
      setLoading(false);
    }
  }, [matchId, runPromptReveal]);

  useEffect(() => {
    if (!visible) return;
    void load();
    overlayOpacity.setValue(0);
    cardScale.setValue(0.9);
    cardOpacity.setValue(0);
    cardTranslateY.setValue(28);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 64,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flagFloat, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flagFloat, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    floatLoop.start();

    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    shimmerLoop.start();

    return () => {
      floatLoop.stop();
      shimmerLoop.stop();
    };
  }, [
    visible,
    load,
    overlayOpacity,
    cardScale,
    cardOpacity,
    cardTranslateY,
    flagFloat,
    shimmer,
  ]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(cardScale, {
        toValue: 0.94,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 12,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [overlayOpacity, cardOpacity, cardScale, cardTranslateY]);

  const open = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setVisible(true);
  };

  const shareCurrent = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const next = await api.post<HolePromptState>(`/matches/${matchId}/hole-prompts/share`, {});
      setState(next);
      onPromptShared?.();
      shareFlash.setValue(0);
      Animated.sequence([
        Animated.timing(shareFlash, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(shareFlash, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
      ]).start();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Golf Dates', e instanceof Error ? e.message : 'Failed to share');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!state || state.completed || busy) return;
    setBusy(true);
    try {
      const raw = await api.post<HolePromptState & { current_hole?: number }>(
        `/matches/${matchId}/hole-prompts/advance`,
        { shareToChat: false },
      );
      const next: HolePromptState = {
        matchId: raw.matchId ?? matchId,
        currentHole: Number(raw.currentHole ?? raw.current_hole) || (state.currentHole + 1),
        totalHoles: Number(raw.totalHoles) || state.totalHoles || 18,
        prompt: raw.prompt || '',
        completed: !!raw.completed,
      };
      if (!next.prompt) {
        // Keep UI moving even if response shape is unexpected
        next.prompt = `Hole ${next.currentHole}`;
      }
      runPromptReveal(next, 'advance');
      onPromptShared?.();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e: unknown) {
      // Restore visible prompt if advance failed mid-fade
      promptOpacity.setValue(1);
      holeNumOpacity.setValue(1);
      promptSlide.setValue(0);
      animatingPrompt.current = false;
      Alert.alert('Golf Dates', e instanceof Error ? e.message : 'Failed to advance');
    } finally {
      setBusy(false);
    }
  };

  const strokeDashoffset = useMemo(
    () =>
      ringProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [RING_C, 0],
      }),
    [ringProgress],
  );

  const flagY = flagFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const flagRotate = flagFloat.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });
  const shimmerX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, CARD_MAX_W],
  });

  const total = state?.totalHoles ?? 18;

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.85}
        style={headerMode ? styles.headerBtn : styles.btn}
        accessibilityLabel="Golf hole prompts"
      >
        <Text style={headerMode ? styles.headerBtnText : styles.btnText}>⛳</Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="none" transparent onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.overlayFill, { opacity: overlayOpacity }]}>
            <LinearGradient
              colors={['#061510', '#0a241e', '#071816', '#040c0a']}
              locations={[0, 0.35, 0.7, 1]}
              style={StyleSheet.absoluteFill}
            />
            <AmbientOrb
              visible={visible}
              size={180}
              left={-40}
              top={SCREEN_H * 0.12}
              color="rgba(45, 212, 191, 0.14)"
              delay={0}
            />
            <AmbientOrb
              visible={visible}
              size={140}
              left={SCREEN_W - 100}
              top={SCREEN_H * 0.28}
              color="rgba(52, 211, 153, 0.12)"
              delay={200}
            />
            <AmbientOrb
              visible={visible}
              size={220}
              left={SCREEN_W * 0.2}
              top={SCREEN_H * 0.62}
              color="rgba(20, 184, 166, 0.1)"
              delay={400}
            />
            <Sparkle visible={visible} left="18%" top="16%" delay={0} />
            <Sparkle visible={visible} left="78%" top="22%" delay={400} />
            <Sparkle visible={visible} left="12%" top="72%" delay={800} />
            <Sparkle visible={visible} left="85%" top="68%" delay={1100} />
          </Animated.View>

          <Pressable style={styles.dismissHit} onPress={close} accessibilityLabel="Dismiss" />

          <Animated.View
            style={[
              styles.cardWrap,
              {
                opacity: cardOpacity,
                transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
                marginBottom: Math.max(insets.bottom, 12),
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.card}>
              <LinearGradient
                colors={['#1a4a42', '#123530', '#0c2420', '#0a1c19']}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.95, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardBorder}>
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.shimmerBar,
                      {
                        transform: [{ translateX: shimmerX }, { skewX: '-18deg' }],
                      },
                    ]}
                  />

                  <View style={styles.topRow}>
                    <View style={styles.brandChip}>
                      <Text style={styles.brandChipText}>GOLF DATE</Text>
                    </View>
                    <TouchableOpacity
                      onPress={close}
                      hitSlop={12}
                      accessibilityLabel="Close"
                      style={styles.closeBtn}
                    >
                      <Text style={styles.closeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.ringBlock}>
                    <View style={styles.ringWrap}>
                      <Svg width={RING_SIZE} height={RING_SIZE}>
                        <Defs>
                          <SvgGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <Stop offset="0%" stopColor="#5eead4" />
                            <Stop offset="100%" stopColor="#34d399" />
                          </SvgGradient>
                        </Defs>
                        <Circle
                          cx={RING_SIZE / 2}
                          cy={RING_SIZE / 2}
                          r={RING_R}
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth={RING_STROKE}
                          fill="transparent"
                        />
                        <AnimatedCircle
                          cx={RING_SIZE / 2}
                          cy={RING_SIZE / 2}
                          r={RING_R}
                          stroke="url(#ringGrad)"
                          strokeWidth={RING_STROKE}
                          fill="transparent"
                          strokeDasharray={`${RING_C} ${RING_C}`}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          rotation="-90"
                          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                        />
                      </Svg>
                      <Animated.View
                        style={[
                          styles.ringCenter,
                          {
                            opacity: holeNumOpacity,
                            transform: [{ scale: holeNumScale }],
                          },
                        ]}
                      >
                        <Text style={styles.ringHoleNum}>{displayHole}</Text>
                        <Text style={styles.ringHoleOf}>/{total}</Text>
                      </Animated.View>
                    </View>

                    <Animated.View
                      style={{
                        transform: [{ translateY: flagY }, { rotate: flagRotate }],
                      }}
                    >
                      <Text style={styles.flagEmoji}>⛳</Text>
                    </Animated.View>
                    <Text style={styles.heroLabel}>Hole prompts</Text>
                    <Text style={styles.heroSub}>
                      A shared question for this hole — talk it through together.
                    </Text>
                  </View>

                  <View style={styles.promptCard}>
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.shareFlash,
                        {
                          opacity: shareFlash.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 0.22],
                          }),
                        },
                      ]}
                    />
                    {loading && !state ? (
                      <ActivityIndicator color="#5eead4" style={{ marginVertical: 32 }} />
                    ) : (
                      <Animated.View
                        style={{
                          opacity: promptOpacity,
                          transform: [{ translateY: promptSlide }, { scale: promptScale }],
                        }}
                      >
                        <View style={styles.promptMetaRow}>
                          <View style={styles.liveDot} />
                          <Text style={styles.promptEyebrow}>
                            {state?.completed ? 'Closing hole' : `Hole ${displayHole} · live`}
                          </Text>
                        </View>
                        <Text style={styles.promptText}>{displayPrompt}</Text>
                        {state?.completed ? (
                          <Text style={styles.doneNote}>
                            Round complete — use post-date reflection when you’re ready.
                          </Text>
                        ) : null}
                      </Animated.View>
                    )}
                  </View>

                  <View style={styles.actions}>
                    {!state?.completed ? (
                      <>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          disabled={busy || loading || !state}
                          onPress={() => void shareCurrent()}
                          style={[styles.primaryWrap, (busy || loading || !state) && styles.disabled]}
                        >
                          <LinearGradient
                            colors={['#5eead4', '#2dd4bf', '#14b8a6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryGrad}
                          >
                            {busy ? (
                              <ActivityIndicator color="#042f2e" />
                            ) : (
                              <Text style={styles.primaryText}>Share to chat</Text>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          disabled={busy || loading || !state}
                          onPress={() => void advance()}
                          style={[styles.nextBtn, (busy || loading || !state) && styles.disabled]}
                        >
                          <Text style={styles.nextText}>Next hole →</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity activeOpacity={0.9} onPress={close} style={styles.primaryWrap}>
                        <LinearGradient
                          colors={['#5eead4', '#2dd4bf', '#14b8a6']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.primaryGrad}
                        >
                          <Text style={styles.primaryText}>Done</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 118, 110, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 18 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0f766e',
  },
  btnText: { color: '#fff', fontWeight: '700' },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayFill: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
  },
  sparkle: {
    position: 'absolute',
    color: '#99f6e4',
    fontSize: 14,
  },
  dismissHit: {
    ...StyleSheet.absoluteFillObject,
  },
  cardWrap: {
    width: CARD_MAX_W,
    zIndex: 2,
  },
  card: {
    borderRadius: 30,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#14b8a6',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.35,
        shadowRadius: 36,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  cardGradient: {
    borderRadius: 30,
  },
  cardBorder: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.28)',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  shimmerBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 56,
    backgroundColor: 'rgba(255,255,255,0.07)',
    zIndex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    zIndex: 2,
  },
  brandChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(45, 212, 191, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
  },
  brandChipText: {
    color: '#99f6e4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '600',
  },
  ringBlock: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
    zIndex: 2,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  ringHoleNum: {
    color: '#f0fdfa',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  ringHoleOf: {
    color: 'rgba(153, 246, 228, 0.55)',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginLeft: 1,
  },
  flagEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  heroLabel: {
    color: '#f0fdfa',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroSub: {
    marginTop: 6,
    color: 'rgba(204, 251, 241, 0.72)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  promptCard: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 18,
    minHeight: 132,
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 2,
  },
  shareFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#5eead4',
  },
  promptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 7,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  promptEyebrow: {
    color: '#5eead4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  promptText: {
    color: '#f8fafc',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  doneNote: {
    marginTop: 12,
    color: 'rgba(204, 251, 241, 0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: 16,
    gap: 10,
    zIndex: 2,
  },
  primaryWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryGrad: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#042f2e',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  nextBtn: {
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.38)',
    backgroundColor: 'rgba(45, 212, 191, 0.08)',
  },
  nextText: {
    color: '#99f6e4',
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: { opacity: 0.65 },
});
