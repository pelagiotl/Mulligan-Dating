import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { INTRO_VIDEO_EXAMPLE_SOURCE } from '../utils/introVideo';
import { INTRO_VIDEO_LUKE_SCRIPT } from '../constants/introVideoCopy';

type Props = {
  compact?: boolean;
  showCaption?: boolean;
};

/** Bundled Luke example clip — swap `intro-example.mp4` when founder recording is ready. */
export default function IntroVideoExamplePlayer({ compact = false, showCaption = true }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.badge, compact && styles.badgeCompact]}>Example from Luke</Text>
      <View style={[styles.playerShell, compact && styles.playerShellCompact]}>
        <Video
          source={INTRO_VIDEO_EXAMPLE_SOURCE}
          style={styles.player}
          resizeMode={ResizeMode.COVER}
          useNativeControls
          shouldPlay={false}
          isLooping={false}
        />
        <LinearGradient
          colors={['transparent', 'rgba(15, 6, 24, 0.85)']}
          style={styles.playerFade}
          pointerEvents="none"
        />
      </View>
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
    marginBottom: 6,
  },
  badge: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  badgeCompact: {
    fontSize: 10,
    marginBottom: 4,
  },
  playerShell: {
    width: '100%',
    maxWidth: 200,
    aspectRatio: 9 / 16,
    maxHeight: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: '#1a1028',
    alignSelf: 'center',
  },
  playerShellCompact: {
    maxWidth: 140,
    maxHeight: 160,
    borderRadius: 12,
  },
  player: {
    width: '100%',
    height: '100%',
  },
  playerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Platform.OS === 'ios' ? 48 : 40,
  },
  caption: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.82)',
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
