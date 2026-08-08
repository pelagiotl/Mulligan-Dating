import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  INTRO_VIDEO_PROMPT,
  INTRO_VIDEO_TIPS,
  INTRO_VIDEO_MAX_DURATION_MS,
  INTRO_VIDEO_MAX_DURATION_SEC,
  introVideoDurationError,
} from '../constants/introVideoCopy';
import IntroVideoUploadCallout from './IntroVideoUploadCallout';
import IntroVideoPreview from './IntroVideoPreview';
import { resolveIntroVideoUrl, uploadProfileIntroVideo, prefetchIntroVideoUpload, prefetchIntroVideoUploadParams, clearIntroVideoUploadPrefetch, type IntroVideoUploadStage } from '../utils/introVideo';

const UPLOAD_STAGE_LABEL: Record<IntroVideoUploadStage, string> = {
  preparing: 'Preparing video…',
  uploading: 'Uploading video…',
  finishing: 'Almost done…',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (introVideoUrl: string, localPreviewUri?: string) => void;
  existingVideoUrl?: string | null;
};

function acceptPickedVideo(asset: { uri: string; duration?: number | null }): string | null {
  if (asset.duration != null && asset.duration > INTRO_VIDEO_MAX_DURATION_MS + 500) {
    Alert.alert('Video too long', introVideoDurationError(asset.duration));
    return null;
  }
  return asset.uri;
}

export default function IntroVideoRecordModal({
  visible,
  onClose,
  onSaved,
  existingVideoUrl,
}: Props) {
  const insets = useSafeAreaInsets();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [localDurationMs, setLocalDurationMs] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<IntroVideoUploadStage | null>(null);

  useEffect(() => {
    if (!visible) {
      setLocalUri(null);
      setLocalDurationMs(null);
      setUploading(false);
      setUploadStage(null);
      clearIntroVideoUploadPrefetch();
      return;
    }
    prefetchIntroVideoUploadParams();
  }, [visible]);

  useEffect(() => {
    if (localUri) {
      prefetchIntroVideoUpload(localUri);
    }
  }, [localUri]);

  const setPickedVideo = useCallback((asset: { uri: string; duration?: number | null }) => {
    const uri = acceptPickedVideo(asset);
    if (!uri) return;
    setLocalUri(uri);
    setLocalDurationMs(asset.duration ?? null);
  }, []);

  const recordVideo = useCallback(async () => {
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      const mic = await Audio.requestPermissionsAsync();
      if (cam.status !== 'granted' || mic.status !== 'granted') {
        Alert.alert(
          'Permissions needed',
          'Camera and microphone access are required to record your intro video.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: INTRO_VIDEO_MAX_DURATION_SEC,
        quality: 0.5,
        cameraType: ImagePicker.CameraType.front,
        ...(Platform.OS === 'ios'
          ? { videoExportPreset: ImagePicker.VideoExportPreset.H264_640x480 }
          : {}),
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setPickedVideo(result.assets[0]);
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not open camera');
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: INTRO_VIDEO_MAX_DURATION_SEC,
        quality: 0.5,
        ...(Platform.OS === 'ios'
          ? { videoExportPreset: ImagePicker.VideoExportPreset.H264_640x480 }
          : {}),
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setPickedVideo(result.assets[0]);
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not pick video');
    }
  }, []);

  const saveVideo = useCallback(async () => {
    if (!localUri) return;
    setUploading(true);
    setUploadStage('preparing');
    try {
      const introVideoUrl = await uploadProfileIntroVideo(localUri, {
        knownDurationMs: localDurationMs,
        onStage: setUploadStage,
      });
      onSaved(introVideoUrl, localUri);
      onClose();
    } catch (err: unknown) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
      setUploadStage(null);
    }
  }, [localUri, localDurationMs, onClose, onSaved]);

  const previewSource = localUri
    ? { uri: localUri }
    : existingVideoUrl
      ? { uri: resolveIntroVideoUrl(existingVideoUrl) }
      : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} accessibilityLabel="Close">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your intro video</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>{INTRO_VIDEO_PROMPT}</Text>

          <IntroVideoUploadCallout />

          <View style={styles.playerWrap}>
            {previewSource ? (
              <IntroVideoPreview
                source={previewSource}
                shouldPlay={false}
                isLooping
                style={styles.playerPreview}
              />
            ) : (
              <LinearGradient colors={['#1e1b2e', '#2d1b4e']} style={styles.playerPlaceholder}>
                <Text style={styles.placeholderEmoji}>📹</Text>
                <Text style={styles.placeholderText}>Your preview will appear here</Text>
              </LinearGradient>
            )}
          </View>

          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>Tips</Text>
            {INTRO_VIDEO_TIPS.map((tip) => (
              <Text key={tip} style={styles.tip}>
                • {tip}
              </Text>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={recordVideo} disabled={uploading}>
            <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} style={styles.primaryGrad}>
              <Text style={styles.primaryText}>
                {existingVideoUrl || localUri ? '● Re-record intro' : '● Record intro'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={pickFromLibrary} disabled={uploading}>
            <Text style={styles.secondaryText}>Upload from camera roll</Text>
          </TouchableOpacity>

          {localUri ? (
            <TouchableOpacity
              style={[styles.saveBtn, uploading && styles.saveBtnDisabled]}
              onPress={saveVideo}
              disabled={uploading}
            >
              {uploading ? (
                <View style={styles.saveUploading}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.saveUploadingText}>
                    {uploadStage ? UPLOAD_STAGE_LABEL[uploadStage] : 'Saving video…'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.saveText}>Use this video</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0618' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { minWidth: 72 },
  backText: { color: '#e9d5ff', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  lead: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  playerWrap: {
    marginBottom: 16,
    alignSelf: 'center',
    width: '100%',
  },
  playerPreview: {
    width: '100%',
  },
  playerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  placeholderEmoji: { fontSize: 48, marginBottom: 8 },
  placeholderText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  tipsBox: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  tipsTitle: { color: '#e9d5ff', fontWeight: '700', marginBottom: 8, fontSize: 14 },
  tip: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 20 },
  primaryBtn: { borderRadius: 999, overflow: 'hidden', marginBottom: 10, marginTop: 4 },
  primaryGrad: { paddingVertical: Platform.OS === 'ios' ? 16 : 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  secondaryText: { color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveUploading: { alignItems: 'center', gap: 8 },
  saveUploadingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
