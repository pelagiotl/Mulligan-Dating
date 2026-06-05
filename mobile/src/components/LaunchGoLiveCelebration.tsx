import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { playMatchSound } from '../utils/sounds';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isAndroidMidnight = Platform.OS === 'android';
const midnightPanel = connectionLimitsPanelColors('midnight');

const THEME = isAndroidMidnight
  ? {
      overlay: AUTH_PAGE_GRADIENT_FALLBACK,
      cardGradient: ['#211d33', '#16122a', '#121018'],
      cardBorder: midnightPanel.shellBorder,
      cardShadow: '#a78bfa',
      buttonGradient: [...midnightPanel.accentGradient],
      buttonBorder: 'rgba(196, 181, 253, 0.5)',
      buttonShadow: '#8b5cf6',
      titleColor: '#f8fafc',
      subtitleColor: '#c4b5fd',
    }
  : {
      overlay: 'rgba(8, 6, 14, 0.92)',
      cardGradient: ['#211d33', '#2a1f42', '#16122a'],
      cardBorder: 'rgba(196, 181, 253, 0.35)',
      cardShadow: '#8b5cf6',
      buttonGradient: ['#8b5cf6', '#a855f7', '#ec4899'],
      buttonBorder: 'rgba(196, 181, 253, 0.5)',
      buttonShadow: '#ec4899',
      titleColor: '#f8fafc',
      subtitleColor: '#c4b5fd',
    };

const BURST_COLORS = ['#f472b6', '#a78bfa', '#c4b5fd', '#fbbf24', '#fb7185', '#e879f9'];
const FLOATER_EMOJIS = ['🎆', '🎇', '💥', '🧨', '✨', '🚀'];

type BurstSpec = { leftPct: number; topPct: number; delayMs: number; particleCount: number };
type RocketSpec = { leftPct: number; delayMs: number; risePct: number };

const BURSTS: BurstSpec[] = [
  { leftPct: 10, topPct: 16, delayMs: 0, particleCount: 14 },
  { leftPct: 75, topPct: 12, delayMs: 350, particleCount: 16 },
  { leftPct: 45, topPct: 10, delayMs: 700, particleCount: 18 },
  { leftPct: 22, topPct: 30, delayMs: 1050, particleCount: 14 },
  { leftPct: 82, topPct: 34, delayMs: 1400, particleCount: 16 },
  { leftPct: 58, topPct: 24, delayMs: 1750, particleCount: 18 },
  { leftPct: 14, topPct: 50, delayMs: 2100, particleCount: 12 },
  { leftPct: 68, topPct: 46, delayMs: 2450, particleCount: 16 },
];

const ROCKETS: RocketSpec[] = [
  { leftPct: 8, delayMs: 200, risePct: 0.38 },
  { leftPct: 28, delayMs: 650, risePct: 0.34 },
  { leftPct: 50, delayMs: 1100, risePct: 0.42 },
  { leftPct: 72, delayMs: 1550, risePct: 0.36 },
  { leftPct: 90, delayMs: 2000, risePct: 0.4 },
];

function FireworkParticle({
  color,
  angle,
  dist,
  delayMs,
  active,
}: {
  color: string;
  angle: number;
  dist: number;
  delayMs: number;
  active: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const tx = Math.cos(angle) * dist;
  const ty = Math.sin(angle) * dist;

  useEffect(() => {
    if (!active) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1000,
      delay: delayMs,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, delayMs, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, tx] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, ty] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  const scale = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1, 0.2] });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: color,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

function FireworkBurst({ spec, active }: { spec: BurstSpec; active: boolean }) {
  const boom = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => {
    return Array.from({ length: spec.particleCount }, (_, i) => ({
      angle: (i / spec.particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3,
      dist: 48 + Math.random() * 72,
      color: BURST_COLORS[i % BURST_COLORS.length],
      delayMs: spec.delayMs + Math.random() * 60,
    }));
  }, [spec]);

  useEffect(() => {
    if (!active) return;
    boom.setValue(0);
    Animated.sequence([
      Animated.delay(spec.delayMs),
      Animated.spring(boom, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(boom, { toValue: 0, duration: 400, delay: 300, useNativeDriver: true }),
    ]).start();
  }, [active, boom, spec.delayMs]);

  const boomScale = boom.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] });
  const boomOpacity = boom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] });

  return (
    <View
      style={[
        styles.burstAnchor,
        { left: `${spec.leftPct}%`, top: `${spec.topPct}%` },
      ]}
      pointerEvents="none"
    >
      {particles.map((p, i) => (
        <FireworkParticle key={i} {...p} active={active} />
      ))}
      <Animated.Text
        style={[
          styles.burstEmoji,
          { opacity: boomOpacity, transform: [{ scale: boomScale }] },
        ]}
      >
        🎆
      </Animated.Text>
    </View>
  );
}

function LaunchRocket({ spec, active }: { spec: RocketSpec; active: boolean }) {
  const rise = useRef(new Animated.Value(0)).current;
  const boom = useRef(new Animated.Value(0)).current;
  const risePx = SCREEN_HEIGHT * spec.risePct;

  useEffect(() => {
    if (!active) return;
    rise.setValue(0);
    boom.setValue(0);
    Animated.sequence([
      Animated.delay(spec.delayMs),
      Animated.timing(rise, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(boom, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 1.05, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(boom, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [active, boom, rise, spec.delayMs]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -risePx] });
  const rocketOpacity = rise.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const boomScale = boom.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.5] });
  const boomOpacity = boom.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });

  return (
    <View style={[styles.rocketAnchor, { left: `${spec.leftPct}%` }]} pointerEvents="none">
      <Animated.Text
        style={[
          styles.rocketEmoji,
          { opacity: rocketOpacity, transform: [{ translateY }, { rotate: '-42deg' }] },
        ]}
      >
        🚀
      </Animated.Text>
      <Animated.Text
        style={[
          styles.rocketBoom,
          {
            bottom: risePx,
            opacity: boomOpacity,
            transform: [{ scale: boomScale }],
          },
        ]}
      >
        💥
      </Animated.Text>
    </View>
  );
}

function FloatingEmoji({ index, active }: { index: number; active: boolean }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const leftPct = useRef(8 + (index * 13) % 84).current;
  const emoji = useRef(FLOATER_EMOJIS[index % FLOATER_EMOJIS.length]).current;
  const duration = useRef(3600 + (index % 5) * 400).current;
  const delay = useRef(index * 280).current;
  const running = useRef(true);

  useEffect(() => {
    if (!active) {
      running.current = false;
      return;
    }
    running.current = true;
    const loop = () => {
      if (!running.current) return;
      translateY.setValue(0);
      Animated.timing(translateY, {
        toValue: -SCREEN_HEIGHT - 50,
        duration,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && running.current) loop();
      });
    };
    const t = setTimeout(loop, delay);
    return () => {
      running.current = false;
      clearTimeout(t);
    };
  }, [active, delay, duration, translateY]);

  if (!active) return null;

  return (
    <Animated.Text
      style={[
        styles.floater,
        { left: `${leftPct}%`, transform: [{ translateY }] },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function LaunchGoLiveCelebration({ visible, onClose }: Props) {
  const [showFx, setShowFx] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const buttonPulse = useRef(new Animated.Value(1)).current;

  const startButtonPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, { toValue: 1.05, duration: 1400, useNativeDriver: true }),
        Animated.timing(buttonPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, [buttonPulse]);

  useEffect(() => {
    if (!visible) {
      setShowFx(false);
      setShowButton(false);
      return;
    }

    void playMatchSound().catch(() => {});

    scale.setValue(0);
    opacity.setValue(0);
    heroScale.setValue(0);
    titleOpacity.setValue(0);
    subtitleOpacity.setValue(0);
    buttonPulse.setValue(1);

    const t0 = setTimeout(() => {
      setShowFx(true);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      setTimeout(() => {
        Animated.spring(heroScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }).start();
      }, 150);
      setTimeout(() => {
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, 350);
      setTimeout(() => {
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }, 520);
      setTimeout(() => {
        setShowButton(true);
        startButtonPulse();
      }, 900);
    }, 80);

    return () => clearTimeout(t0);
  }, [visible, heroScale, opacity, scale, startButtonPulse, subtitleOpacity, titleOpacity, buttonPulse]);

  const handleClose = () => {
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Vibration.vibrate(50);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={!isAndroidMidnight}
      animationType="none"
      statusBarTranslucent={isAndroidMidnight}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: THEME.overlay }]} />

        {showFx ? (
          <View style={styles.fxLayer} pointerEvents="none">
            {ROCKETS.map((r, i) => (
              <LaunchRocket key={`r-${i}`} spec={r} active={visible} />
            ))}
            {BURSTS.map((b, i) => (
              <FireworkBurst key={`b-${i}`} spec={b} active={visible} />
            ))}
            {Array.from({ length: 10 }, (_, i) => (
              <FloatingEmoji key={`f-${i}`} index={i} active={visible} />
            ))}
          </View>
        ) : null}

        <Animated.View
          style={[
            styles.cardWrap,
            { transform: [{ scale }], opacity },
          ]}
        >
          <LinearGradient
            colors={THEME.cardGradient}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={[
              styles.card,
              {
                borderColor: THEME.cardBorder,
                shadowColor: THEME.cardShadow,
              },
            ]}
          >
            <Animated.View style={[styles.heroRow, { transform: [{ scale: heroScale }] }]}>
              <Text style={styles.heroEmoji}>🚀</Text>
              <Text style={styles.heroEmoji}>💥</Text>
              <Text style={styles.heroEmoji}>🎆</Text>
            </Animated.View>

            <Animated.Text style={[styles.title, { opacity: titleOpacity, color: THEME.titleColor }]}>
              We&apos;re Live!
            </Animated.Text>
            <Animated.Text
              style={[styles.subtitle, { opacity: subtitleOpacity, color: THEME.subtitleColor }]}
            >
              Mulligan just launched — your next match is waiting.
            </Animated.Text>

            {showButton ? (
              <TouchableOpacity onPress={handleClose} activeOpacity={0.9}>
                <Animated.View style={{ transform: [{ scale: buttonPulse }] }}>
                  <LinearGradient
                    colors={THEME.buttonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.button,
                      {
                        borderColor: THEME.buttonBorder,
                        shadowColor: THEME.buttonShadow,
                      },
                    ]}
                  >
                    <Text style={styles.buttonText}>Let&apos;s go!</Text>
                  </LinearGradient>
                </Animated.View>
              </TouchableOpacity>
            ) : null}
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fxLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 1,
  },
  burstAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: -3,
    marginTop: -3,
  },
  burstEmoji: {
    position: 'absolute',
    fontSize: 28,
    marginLeft: -14,
    marginTop: -14,
  },
  rocketAnchor: {
    position: 'absolute',
    bottom: 0,
    width: 0,
    height: 0,
  },
  rocketEmoji: {
    position: 'absolute',
    fontSize: 32,
    bottom: 0,
    marginLeft: -16,
  },
  rocketBoom: {
    position: 'absolute',
    fontSize: 36,
    marginLeft: -18,
  },
  floater: {
    position: 'absolute',
    bottom: -40,
    fontSize: 26,
  },
  cardWrap: {
    width: SCREEN_WIDTH * 0.88,
    maxWidth: 400,
    zIndex: 2,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
