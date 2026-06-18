import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { INTRO_VIDEO_EXAMPLE_ASPECT, INTRO_VIDEO_EXAMPLE_SOURCE } from '../utils/introVideo';
import { INTRO_VIDEO_LUKE_SCRIPT } from '../constants/introVideoCopy';

type Props = {
  compact?: boolean;
  showCaption?: boolean;
  hideBadge?: boolean;
  /** Center the "Example from Luke" label above the player (onboarding card). */
  centerBadge?: boolean;
  /** When set (onboarding card), caps example player height to fit the viewport stack. */
  maxPlayerHeight?: number;
};

function buildPlayerSize(maxPlayerHeight?: number) {
  if (maxPlayerHeight == null) return null;
  return {
    width: Math.round(maxPlayerHeight * INTRO_VIDEO_EXAMPLE_ASPECT),
    height: maxPlayerHeight,
    maxHeight: maxPlayerHeight,
    alignSelf: 'center' as const,
  };
}

function playControlMetrics(maxPlayerHeight?: number, compact?: boolean) {
  if (maxPlayerHeight != null) {
    const buttonSize = Math.round(Math.max(36, Math.min(44, maxPlayerHeight * 0.42)));
    return {
      barHeight: Math.max(50, buttonSize + 16),
      buttonSize,
      iconSize: Math.max(14, Math.round(buttonSize * 0.36)),
      hintSize: Math.max(12, Math.round(buttonSize * 0.32)),
      gap: 10,
    };
  }
  return compact
    ? { barHeight: 50, buttonSize: 36, iconSize: 14, hintSize: 12, gap: 10 }
    : { barHeight: 54, buttonSize: 40, iconSize: 15, hintSize: 13, gap: 10 };
}

/** Bundled Luke example clip shown during onboarding. */
export default function IntroVideoExamplePlayer({
  compact = false,
  showCaption = true,
  hideBadge = false,
  centerBadge = false,
  maxPlayerHeight,
}: Props) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const sizedPlayer = buildPlayerSize(maxPlayerHeight);
  const playControl = playControlMetrics(maxPlayerHeight, compact);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    if (status.didJustFinish) {
      void videoRef.current?.setPositionAsync(0);
      void videoRef.current?.pauseAsync();
    }
  }, []);

  const onWatch = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.presentFullscreenPlayer();
      await video.playAsync();
    } catch {
      try {
        if (isPlaying) {
          await video.pauseAsync();
        } else {
          await video.playAsync();
        }
      } catch {
        // ignore playback errors
      }
    }
  }, [isPlaying]);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, centerBadge && styles.wrapCentered]}>
      {!hideBadge ? (
        <View style={[styles.badgePill, centerBadge && styles.badgePillCentered, compact && styles.badgePillCompact]}>
          <Text style={[styles.badge, compact && styles.badgeCompact]}>Example from Luke</Text>
        </View>
      ) : null}
      <Pressable
        onPress={onWatch}
        accessibilityRole="button"
        accessibilityLabel="Play Luke's example intro video"
        style={({ pressed }) => [
          styles.playerShell,
          compact && !maxPlayerHeight ? styles.playerShellCompact : null,
          sizedPlayer,
          pressed && styles.playerShellPressed,
        ]}
      >
        <Video
          ref={videoRef}
          source={INTRO_VIDEO_EXAMPLE_SOURCE}
          style={styles.player}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls={false}
          shouldPlay={false}
          isLooping={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
        {!isPlaying ? (
          <>
            <LinearGradient
              colors={['transparent', 'rgba(15, 6, 24, 0.88)']}
              style={[styles.playBarGradient, { height: playControl.barHeight }]}
              pointerEvents="none"
            />
            <View style={[styles.playBar, { height: playControl.barHeight }]} pointerEvents="none">
              <View style={[styles.playBarRow, { gap: playControl.gap }]}>
                <View
                  style={[
                    styles.playButton,
                    {
                      width: playControl.buttonSize,
                      height: playControl.buttonSize,
                      borderRadius: playControl.buttonSize / 2,
                    },
                  ]}
                >
                  <Text style={[styles.playIcon, { fontSize: playControl.iconSize }]}>▶</Text>
                </View>
                <Text style={[styles.playHint, { fontSize: playControl.hintSize }]}>Watch example</Text>
              </View>
            </View>
          </>
        ) : null}
      </Pressable>
      {showCaption ? (
        <Text style={[styles.caption, compact && styles.captionCompact]} numberOfLines={compact ? 3 : 5}>
          "{INTRO_VIDEO_LUKE_SCRIPT}"
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  wrapCompact: {
    marginBottom: 2,
  },
  wrapCentered: {
    alignItems: 'center',
  },
  badgePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  badgePillCentered: {
    alignSelf: 'center',
  },
  badgePillCompact: {
    marginBottom: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badge: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  badgeCompact: {
    fontSize: 9,
  },
  playerShell: {
    width: '100%',
    maxWidth: 280,
    aspectRatio: INTRO_VIDEO_EXAMPLE_ASPECT,
    maxHeight: 180,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    backgroundColor: '#1a1028',
    alignSelf: 'center',
  },
  playerShellCompact: {
    maxWidth: 220,
    maxHeight: 140,
    borderRadius: 12,
  },
  playerShellPressed: {
    opacity: 0.92,
  },
  player: {
    width: '100%',
    height: '100%',
  },
  playBarGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  playBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  playBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#2d1b4e',
    marginLeft: 2,
    fontWeight: '700',
  },
  playHint: {
    color: 'rgba(255, 255, 255, 0.96)',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  caption: {
    marginTop: 8,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  captionCompact: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
});
