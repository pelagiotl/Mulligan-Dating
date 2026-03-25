import React, { useEffect, useState, useRef } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Audio } from 'expo-av';

type Props = { uri: string };

export function AdminModerationAudio({ uri }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      const s = soundRef.current;
      soundRef.current = null;
      if (s) {
        s.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const toggle = async () => {
    try {
      if (soundRef.current) {
        const st = await soundRef.current.getStatusAsync();
        if (st.isLoaded) {
          if (st.isPlaying) {
            await soundRef.current.pauseAsync();
            setPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setPlaying(true);
          }
        }
        return;
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (!status.isPlaying && status.didJustFinish) setPlaying(false);
        }
      );
      soundRef.current = sound;
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={toggle} style={styles.btn} activeOpacity={0.8}>
        <Text style={styles.btnText}>{playing ? 'Pause voice' : '▶ Play voice'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  btn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
