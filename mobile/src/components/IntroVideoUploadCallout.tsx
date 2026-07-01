import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  INTRO_VIDEO_UPLOAD_ANY,
  INTRO_VIDEO_UPLOAD_ANY_HEADLINE,
  INTRO_VIDEO_UPLOAD_ANY_SHORT,
} from '../constants/introVideoCopy';

const CLIP_EMOJIS = ['🎬', '🏂', '🎧', '⛳', '💃', '📱'] as const;

type Props = {
  compact?: boolean;
  veryCompact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function IntroVideoUploadCallout({ compact = false, veryCompact = false, style }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    shimmerLoop.start();
    return () => {
      pulseLoop.stop();
      shimmerLoop.stop();
    };
  }, [pulse, shimmer]);

  const cardScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });

  const emojiCount = veryCompact ? 0 : compact ? 4 : 6;
  const headline = veryCompact ? INTRO_VIDEO_UPLOAD_ANY_SHORT : INTRO_VIDEO_UPLOAD_ANY_HEADLINE;

  return (
    <Animated.View
      style={[styles.outer, veryCompact && styles.outerVeryCompact, style, { transform: [{ scale: cardScale }] }]}
    >
      <Animated.View pointerEvents="none" style={[styles.glowRing, { opacity: glowOpacity }]} />
      <LinearGradient
        colors={['rgba(255,255,255,0.34)', 'rgba(196,181,253,0.42)', 'rgba(244,114,182,0.32)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, veryCompact && styles.cardVeryCompact, compact && styles.cardCompact]}
      >
        <View pointerEvents="none" style={styles.shimmerClip}>
          <Animated.View
            style={[
              styles.shimmerBeam,
              {
                transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }],
              },
            ]}
          />
        </View>

        {emojiCount > 0 ? (
          <View style={styles.emojiRow}>
            {CLIP_EMOJIS.slice(0, emojiCount).map((emoji, index) => (
              <Animated.Text
                key={emoji}
                style={[
                  styles.emoji,
                  compact && styles.emojiCompact,
                  {
                    transform: [
                      {
                        translateY: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, index % 2 === 0 ? -2 : 2],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {emoji}
              </Animated.Text>
            ))}
          </View>
        ) : null}

        <Text
          style={[
            styles.headline,
            compact && styles.headlineCompact,
            veryCompact && styles.headlineVeryCompact,
          ]}
          numberOfLines={veryCompact ? 3 : 2}
        >
          {headline}
        </Text>

        {!veryCompact && !compact ? (
          <Text style={styles.body} numberOfLines={3}>
            {INTRO_VIDEO_UPLOAD_ANY}
          </Text>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: 6,
    position: 'relative',
  },
  outerVeryCompact: {
    marginBottom: 4,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#f472b6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 4,
  },
  card: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    overflow: 'hidden',
  },
  cardCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  cardVeryCompact: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 12,
  },
  shimmerClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 14,
  },
  shimmerBeam: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    width: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  emoji: {
    fontSize: 16,
  },
  emojiCompact: {
    fontSize: 14,
  },
  headline: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(88, 28, 135, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headlineCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  headlineVeryCompact: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: 700,
  },
  body: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 4,
  },
});
