import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

type Props = {
  source: { uri: string } | number;
  maxHeight?: number;
  maxWidth?: number;
  useNativeControls?: boolean;
  shouldPlay?: boolean;
  isLooping?: boolean;
  style?: ViewStyle;
};

/** Inline intro video preview — fits the video's native aspect ratio without cropping. */
export default function IntroVideoPreview({
  source,
  maxHeight = 360,
  maxWidth = 340,
  useNativeControls = true,
  shouldPlay = false,
  isLooping = false,
  style,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const sourceKey = typeof source === 'number' ? 'bundled' : source.uri;

  useEffect(() => {
    setAspectRatio(null);
  }, [sourceKey]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const width = status.naturalSize?.width;
    const height = status.naturalSize?.height;
    if (width && height && height > 0) {
      const next = width / height;
      setAspectRatio((prev) => (prev !== next ? next : prev));
    }
  }, []);

  return (
    <View
      style={[
        styles.shell,
        { maxHeight, maxWidth },
        aspectRatio != null ? { aspectRatio } : styles.shellFallback,
        style,
      ]}
    >
      <Video
        source={source}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls={useNativeControls}
        shouldPlay={shouldPlay}
        isLooping={isLooping}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1028',
  },
  shellFallback: {
    aspectRatio: 9 / 16,
    minHeight: 180,
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
