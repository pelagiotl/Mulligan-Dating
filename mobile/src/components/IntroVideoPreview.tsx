import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Pressable,
  TouchableOpacity,
  Platform,
  Modal,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  source: { uri: string } | number;
  maxHeight?: number;
  maxWidth?: number;
  /** Native AV controls are unreliable for inline clips (mute UI often wrong on iOS). */
  useNativeControls?: boolean;
  shouldPlay?: boolean;
  isLooping?: boolean;
  style?: ViewStyle;
};

type PlaybackSeed = {
  positionMillis: number;
  isPlaying: boolean;
  isMuted: boolean;
};

const CONTROL_BAR_HEIGHT = Platform.OS === 'ios' ? 44 : 40;

function ExpandIcon() {
  const cornerStyle = styles.expandCorner;
  return (
    <View style={styles.expandIcon}>
      <View style={[cornerStyle, styles.expandCornerTL]} />
      <View style={[cornerStyle, styles.expandCornerTR]} />
      <View style={[cornerStyle, styles.expandCornerBL]} />
      <View style={[cornerStyle, styles.expandCornerBR]} />
    </View>
  );
}

function CollapseIcon() {
  const cornerStyle = styles.collapseCorner;
  return (
    <View style={styles.expandIcon}>
      <View style={[cornerStyle, styles.collapseCornerTL]} />
      <View style={[cornerStyle, styles.collapseCornerTR]} />
      <View style={[cornerStyle, styles.collapseCornerBL]} />
      <View style={[cornerStyle, styles.collapseCornerBR]} />
    </View>
  );
}

type VideoControlsProps = {
  isPlaying: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onLeadingPress: () => void;
  leadingIcon: 'expand' | 'collapse';
  bottomInset?: number;
};

function VideoControls({
  isPlaying,
  isMuted,
  onToggleMute,
  onLeadingPress,
  leadingIcon,
  bottomInset = 0,
}: VideoControlsProps) {
  return (
    <>
      <LinearGradient
        colors={['transparent', `rgba(15, 6, 24, ${isPlaying ? 0.5 : 0.72})`]}
        style={[styles.controlsGradient, { height: CONTROL_BAR_HEIGHT + bottomInset }]}
        pointerEvents="none"
      />
      <View
        style={[styles.controlsBar, { height: CONTROL_BAR_HEIGHT + bottomInset, paddingBottom: bottomInset }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.sideControl}
          onPress={onLeadingPress}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={leadingIcon === 'expand' ? 'Open intro video fullscreen' : 'Exit fullscreen'}
        >
          {leadingIcon === 'expand' ? <ExpandIcon /> : <CollapseIcon />}
        </TouchableOpacity>

        {!isPlaying ? (
          <View style={styles.centerControl} pointerEvents="none">
            <Text style={styles.playIcon}>▶</Text>
          </View>
        ) : (
          <View style={styles.centerControl} />
        )}

        <TouchableOpacity
          style={styles.sideControl}
          onPress={onToggleMute}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={isMuted ? 'Unmute intro video' : 'Mute intro video'}
        >
          <Text style={[styles.controlIcon, isMuted && styles.controlIconMuted]}>
            {isMuted ? '🔇' : '🔊'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

/** Inline intro video preview — custom play + mute controls by default. */
export default function IntroVideoPreview({
  source,
  maxHeight = 360,
  maxWidth = 340,
  useNativeControls = false,
  shouldPlay = false,
  isLooping = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);
  const fullscreenVideoRef = useRef<Video>(null);
  const syncSeedRef = useRef<PlaybackSeed | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sourceKey = typeof source === 'number' ? 'bundled' : source.uri;

  useEffect(() => {
    setAspectRatio(null);
    setIsPlaying(false);
    setIsMuted(false);
    setIsFullscreen(false);
    syncSeedRef.current = null;
  }, [sourceKey]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    if (typeof status.isMuted === 'boolean') {
      setIsMuted(status.isMuted);
    }
    const width = status.naturalSize?.width;
    const height = status.naturalSize?.height;
    if (width && height && height > 0) {
      const next = width / height;
      setAspectRatio((prev) => (prev !== next ? next : prev));
    }
    if (status.didJustFinish && !isLooping) {
      void videoRef.current?.setPositionAsync(0);
      void videoRef.current?.pauseAsync();
      void fullscreenVideoRef.current?.setPositionAsync(0);
      void fullscreenVideoRef.current?.pauseAsync();
    }
  }, [isLooping]);

  const getActiveVideo = useCallback(() => {
    return (isFullscreen ? fullscreenVideoRef : videoRef).current;
  }, [isFullscreen]);

  const togglePlayback = useCallback(async () => {
    const video = getActiveVideo();
    if (!video) return;
    try {
      if (isPlaying) {
        await video.pauseAsync();
      } else {
        await video.playAsync();
      }
    } catch {
      // ignore
    }
  }, [getActiveVideo, isPlaying]);

  const toggleMute = useCallback(async () => {
    const video = getActiveVideo();
    if (!video) return;
    const next = !isMuted;
    try {
      await video.setIsMutedAsync(next);
      setIsMuted(next);
      const other = isFullscreen ? videoRef.current : fullscreenVideoRef.current;
      await other?.setIsMutedAsync(next);
    } catch {
      // ignore
    }
  }, [getActiveVideo, isFullscreen, isMuted]);

  const applySeedToVideo = useCallback(async (video: Video, seed: PlaybackSeed, autoPlayIfPaused: boolean) => {
    await video.setPositionAsync(seed.positionMillis);
    await video.setIsMutedAsync(seed.isMuted);
    setIsMuted(seed.isMuted);
    if (seed.isPlaying || autoPlayIfPaused) {
      await video.playAsync();
    } else {
      await video.pauseAsync();
    }
  }, []);

  const readPlaybackSeed = useCallback(async (video: Video): Promise<PlaybackSeed | null> => {
    const status = await video.getStatusAsync();
    if (!status.isLoaded) return null;
    return {
      positionMillis: status.positionMillis,
      isPlaying: status.isPlaying,
      isMuted: status.isMuted,
    };
  }, []);

  const openFullscreen = useCallback(async () => {
    const video = videoRef.current;
    try {
      let seed: PlaybackSeed = { positionMillis: 0, isPlaying: false, isMuted };
      if (video) {
        const loaded = await readPlaybackSeed(video);
        if (loaded) seed = loaded;
        await video.pauseAsync();
      }
      syncSeedRef.current = seed;
      setIsPlaying(seed.isPlaying);
      setIsMuted(seed.isMuted);
      setIsFullscreen(true);
    } catch {
      syncSeedRef.current = { positionMillis: 0, isPlaying: false, isMuted: false };
      setIsFullscreen(true);
    }
  }, [readPlaybackSeed, isMuted]);

  const closeFullscreen = useCallback(async () => {
    const fullscreenVideo = fullscreenVideoRef.current;
    try {
      if (fullscreenVideo) {
        const seed = await readPlaybackSeed(fullscreenVideo);
        if (seed) {
          syncSeedRef.current = seed;
          setIsPlaying(seed.isPlaying);
          setIsMuted(seed.isMuted);
          const inline = videoRef.current;
          if (inline) {
            await inline.setPositionAsync(seed.positionMillis);
            await inline.setIsMutedAsync(seed.isMuted);
            if (seed.isPlaying) {
              await inline.playAsync();
            } else {
              await inline.pauseAsync();
            }
          }
        }
        await fullscreenVideo.pauseAsync();
      }
    } catch {
      // ignore
    }
    setIsFullscreen(false);
  }, [readPlaybackSeed]);

  useEffect(() => {
    if (!isFullscreen) return;
    const seed = syncSeedRef.current ?? {
      positionMillis: 0,
      isPlaying: false,
      isMuted: false,
    };

    let cancelled = false;
    const boot = async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (cancelled) return;
      const video = fullscreenVideoRef.current;
      if (!video) return;
      try {
        const videoSource = typeof source === 'number' ? source : { uri: source.uri };
        await video.loadAsync(videoSource, {
          positionMillis: seed.positionMillis,
          shouldPlay: seed.isPlaying,
          isMuted: seed.isMuted,
        });
        if (seed.isPlaying) {
          await video.playAsync();
        } else {
          await video.pauseAsync();
        }
        setIsMuted(seed.isMuted);
      } catch {
        try {
          await applySeedToVideo(video, seed, false);
        } catch {
          // ignore
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [isFullscreen, applySeedToVideo, source, sourceKey]);

  return (
    <>
      <View
        style={[
          styles.shell,
          { maxHeight, maxWidth },
          aspectRatio != null ? { aspectRatio } : styles.shellFallback,
          style,
        ]}
      >
        <Video
          ref={videoRef}
          source={source}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls={useNativeControls}
          shouldPlay={shouldPlay}
          isLooping={isLooping}
          isMuted={isMuted}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />

        {!useNativeControls ? (
          <>
            <Pressable
              style={styles.tapTarget}
              onPress={togglePlayback}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause intro video' : 'Play intro video'}
            />
            <VideoControls
              isPlaying={isPlaying}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onLeadingPress={openFullscreen}
              leadingIcon="expand"
            />
          </>
        ) : null}
      </View>

      <Modal
        visible={isFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          void closeFullscreen();
        }}
      >
        <View style={styles.fullscreenRoot}>
          <StatusBar barStyle="light-content" />
          <Video
            ref={fullscreenVideoRef}
            source={source}
            style={styles.fullscreenVideo}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={false}
            isLooping={isLooping}
            isMuted={isMuted}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />
          <Pressable
            style={styles.fullscreenTapTarget}
            onPress={togglePlayback}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause intro video' : 'Play intro video'}
          />
          <TouchableOpacity
            style={[styles.fullscreenClose, { top: Math.max(insets.top, 12) + 4 }]}
            onPress={() => {
              void closeFullscreen();
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen video"
          >
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>
          <VideoControls
            isPlaying={isPlaying}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            onLeadingPress={() => {
              void closeFullscreen();
            }}
            leadingIcon="collapse"
            bottomInset={Math.max(insets.bottom, 8)}
          />
        </View>
      </Modal>
    </>
  );
}

const controlShadow = Platform.select({
  ios: {
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  android: {
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1028',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  shellFallback: {
    aspectRatio: 9 / 16,
    minHeight: 180,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  tapTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  controlsGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  controlsBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    zIndex: 3,
  },
  sideControl: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerControl: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: 'rgba(255, 255, 255, 0.96)',
    fontSize: 22,
    marginLeft: 3,
    fontWeight: '700',
    opacity: 0.95,
    ...controlShadow,
  },
  controlIcon: {
    fontSize: 20,
    opacity: 0.95,
    ...controlShadow,
  },
  controlIconMuted: {
    opacity: 0.72,
  },
  expandIcon: {
    width: 18,
    height: 18,
    opacity: 0.95,
  },
  expandCorner: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderColor: 'rgba(255, 255, 255, 0.96)',
  },
  expandCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  expandCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  expandCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  expandCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  collapseCorner: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderColor: 'rgba(255, 255, 255, 0.96)',
  },
  collapseCornerTL: {
    top: 0,
    left: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  collapseCornerTR: {
    top: 0,
    right: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  collapseCornerBL: {
    bottom: 0,
    left: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  collapseCornerBR: {
    bottom: 0,
    right: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenVideo: {
    flex: 1,
    width: '100%',
  },
  fullscreenTapTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  fullscreenClose: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  fullscreenCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
});
