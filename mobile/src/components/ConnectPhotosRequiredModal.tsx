import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { launchCountdownTheme } from '../lib/launchCountdownTheme';
import { MIN_PHOTOS_TO_CONNECT } from '../utils/connectSetup';
import { pickImagesFromLibrary, MediaLibraryPermissionDenied } from '../utils/pickImagesFromLibrary';
import { uploadPhotoUris, type UploadedPhotoResult } from '../utils/batchPhotoUpload';
import { api } from '../utils/api';

export interface ConnectPhotosRequiredModalProps {
  visible: boolean;
  onClose: () => void;
  onAddPhotos: () => void;
  onPhotoUploaded?: (uploaded: UploadedPhotoResult[]) => void;
  photoCount: number;
  connectShell: ConnectShellMode;
}

type PhotosModalChrome = {
  overlay: string;
  handleBar: string;
  rim: readonly [string, string, ...string[]];
  innerBg: string;
  header: readonly [string, string, ...string[]];
  lead: string;
  leadStrong: string;
  progress: string;
  progressStrong: string;
  secondaryText: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  slotEmptyBorder: string;
  slotEmptyBg: string;
  slotPlus: string;
  slotFilledBorder: string;
  slotFilledBg: string;
  uploadError: string;
  cta: readonly [string, string, ...string[]];
};

function photosModalChrome(mode: ConnectShellMode): PhotosModalChrome {
  const t = launchCountdownTheme(mode);
  if (mode === 'midnight') {
    return {
      overlay: 'rgba(6, 8, 18, 0.78)',
      handleBar: 'rgba(167, 139, 250, 0.55)',
      rim: ['rgba(167, 139, 250, 0.65)', 'rgba(99, 102, 241, 0.45)', 'rgba(236, 72, 153, 0.5)'],
      innerBg: '#1e1b2e',
      header: ['#7c3aed', '#6366f1', '#db2777'],
      lead: t.sub,
      leadStrong: '#f9a8d4',
      progress: '#94a3b8',
      progressStrong: '#fda4af',
      secondaryText: '#94a3b8',
      chipBg: 'rgba(167, 139, 250, 0.18)',
      chipBorder: 'rgba(167, 139, 250, 0.45)',
      chipText: '#e9d5ff',
      slotEmptyBorder: 'rgba(167, 139, 250, 0.5)',
      slotEmptyBg: 'rgba(38, 32, 58, 0.95)',
      slotPlus: '#f472b6',
      slotFilledBorder: 'rgba(52, 211, 153, 0.55)',
      slotFilledBg: 'rgba(6, 78, 59, 0.35)',
      uploadError: '#fca5a5',
      cta: ['#a855f7', '#6366f1', '#ec4899'],
    };
  }
  if (mode === 'sunny') {
    return {
      overlay: 'rgba(45, 17, 24, 0.55)',
      handleBar: 'rgba(255,255,255,0.4)',
      rim: ['#fbbf24', '#fb923c', '#f472b6', '#38bdf8'],
      innerBg: '#fffefb',
      header: ['#ea580c', '#f59e0b', '#d97706'],
      lead: '#57534e',
      leadStrong: '#c2410c',
      progress: '#78716c',
      progressStrong: '#c2410c',
      secondaryText: '#a8a29e',
      chipBg: 'rgba(254, 243, 199, 0.98)',
      chipBorder: 'rgba(251, 191, 36, 0.45)',
      chipText: '#9a3412',
      slotEmptyBorder: 'rgba(234, 88, 12, 0.45)',
      slotEmptyBg: 'rgba(255, 251, 235, 0.95)',
      slotPlus: '#fb923c',
      slotFilledBorder: 'rgba(16, 185, 129, 0.55)',
      slotFilledBg: '#ecfdf5',
      uploadError: '#b91c1c',
      cta: ['#ea580c', '#f59e0b', '#f472b6'],
    };
  }
  return {
    overlay: 'rgba(45, 17, 24, 0.62)',
    handleBar: 'rgba(255,255,255,0.4)',
    rim: ['#ec4899', '#f97316', '#eab308', '#a855f7'],
    innerBg: '#fffefb',
    header: ['#be185d', '#ea580c', '#d97706'],
    lead: '#475569',
    leadStrong: '#be185d',
    progress: '#64748b',
    progressStrong: '#be185d',
    secondaryText: '#94a3b8',
    chipBg: 'rgba(253, 242, 248, 0.98)',
    chipBorder: 'rgba(251, 191, 36, 0.4)',
    chipText: '#581c87',
    slotEmptyBorder: 'rgba(244, 63, 94, 0.45)',
    slotEmptyBg: 'rgba(255, 241, 245, 0.95)',
    slotPlus: '#f472b6',
    slotFilledBorder: 'rgba(16, 185, 129, 0.55)',
    slotFilledBg: '#ecfdf5',
    uploadError: '#b91c1c',
    cta: ['#db2777', '#ea580c', '#f59e0b'],
  };
}

const ConnectPhotosRequiredModal = memo(function ConnectPhotosRequiredModal({
  visible,
  onClose,
  onAddPhotos,
  onPhotoUploaded,
  photoCount,
  connectShell,
}: ConnectPhotosRequiredModalProps) {
  const chrome = useMemo(() => photosModalChrome(connectShell), [connectShell]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [optimisticCount, setOptimisticCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setUploadError('');
    setOptimisticCount(0);
  }, [visible]);

  const displayCount = Math.max(photoCount, optimisticCount);
  const displayHasPhoto = displayCount >= MIN_PHOTOS_TO_CONNECT;

  const handleSlotPress = async () => {
    if (displayHasPhoto || uploading) return;
    setUploadError('');
    setUploading(true);
    try {
      const result = await pickImagesFromLibrary({
        allowsMultipleSelection: false,
        selectionLimit: 1,
        quality: 0.85,
      });
      if (result.canceled || !result.assets.length) {
        setUploading(false);
        return;
      }
      const uris = result.assets.map((a) => a.uri).filter(Boolean) as string[];
      if (!uris.length) {
        setUploading(false);
        return;
      }
      const uploaded = await uploadPhotoUris(uris);
      api.clearCache('/photos/me');
      const newCount = photoCount + uploaded.length;
      setOptimisticCount(newCount);
      onPhotoUploaded?.(uploaded);
    } catch (err) {
      if (err instanceof MediaLibraryPermissionDenied) {
        setUploadError('Photo access is required to upload. Enable it in Settings.');
      } else {
        const message = err instanceof Error ? err.message : 'Upload failed. Try again.';
        if (!message.toLowerCase().includes('cancel')) {
          setUploadError(message);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!uploading) onClose();
      }}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: chrome.overlay }]}
        activeOpacity={1}
        onPress={() => {
          if (!uploading) onClose();
        }}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            style={[styles.handleBar, { backgroundColor: chrome.handleBar }]}
            accessibilityElementsHidden
          />

          <LinearGradient
            colors={chrome.rim}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.rim,
              connectShell === 'midnight' && Platform.OS === 'ios'
                ? { shadowColor: '#7c3aed' }
                : null,
            ]}
          >
            <View style={[styles.inner, { backgroundColor: chrome.innerBg }]}>
              <LinearGradient
                colors={chrome.header}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
              >
                <Text style={styles.headerSpark} accessibilityElementsHidden>
                  ✨
                </Text>
                <Text style={styles.kicker}>One quick step</Text>
                <Text style={styles.title}>Add a photo to Connect</Text>
              </LinearGradient>

              <View style={styles.body}>
                <Text style={[styles.lead, { color: chrome.lead }]}>
                  You&apos;re set up with name and location — add{' '}
                  <Text style={[styles.leadStrong, { color: chrome.leadStrong }]}>one clear photo</Text> on
                  your Profile so you&apos;re ready to match others when we launch.
                </Text>

                <View style={styles.slotRow} accessibilityLabel={`${displayCount} of ${MIN_PHOTOS_TO_CONNECT} photos`}>
                  {displayHasPhoto ? (
                    <View
                      style={[
                        styles.slot,
                        styles.slotFilled,
                        {
                          borderColor: chrome.slotFilledBorder,
                          backgroundColor: chrome.slotFilledBg,
                        },
                      ]}
                    >
                      <Text style={styles.slotEmoji}>📷</Text>
                      <View style={styles.slotCheck}>
                        <Text style={styles.slotCheckText}>✓</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.slot,
                        styles.slotEmpty,
                        uploading && styles.slotUploading,
                        {
                          borderColor: chrome.slotEmptyBorder,
                          backgroundColor: chrome.slotEmptyBg,
                        },
                      ]}
                      onPress={() => void handleSlotPress()}
                      disabled={uploading}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={uploading ? 'Uploading photo' : 'Upload a photo'}
                    >
                      {uploading ? (
                        <ActivityIndicator color={chrome.slotPlus} size="small" />
                      ) : (
                        <Text style={[styles.slotPlus, { color: chrome.slotPlus }]}>+</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={[styles.progress, { color: chrome.progress }]}>
                  {uploading ? (
                    'Uploading your photo…'
                  ) : displayHasPhoto ? (
                    "Photo added — you're ready for launch day"
                  ) : (
                    <>
                      <Text style={[styles.progressStrong, { color: chrome.progressStrong }]}>
                        Tap + to upload
                      </Text>
                      , or use the button below
                    </>
                  )}
                </Text>

                {uploadError ? (
                  <Text
                    style={[styles.uploadError, { color: chrome.uploadError }]}
                    accessibilityRole="alert"
                  >
                    {uploadError}
                  </Text>
                ) : null}

                <View style={styles.chips}>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: chrome.chipBg, borderColor: chrome.chipBorder },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: chrome.chipText }]}>😊 Face visible</Text>
                  </View>
                  <View
                    style={[
                      styles.chip,
                      { backgroundColor: chrome.chipBg, borderColor: chrome.chipBorder },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: chrome.chipText }]}>☀️ Recent pic</Text>
                  </View>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={onAddPhotos}
                  activeOpacity={0.88}
                  style={styles.primaryTouchable}
                  disabled={uploading}
                  accessibilityRole="button"
                  accessibilityLabel={displayHasPhoto ? 'View on Profile' : 'Add my photo'}
                >
                  <LinearGradient
                    colors={chrome.cta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGradient}
                  >
                    <Text style={styles.primaryText}>{displayHasPhoto ? 'View on Profile →' : 'Add my photo →'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.secondaryBtn}
                  disabled={uploading}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryText, { color: chrome.secondaryText }]}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
});

export default ConnectPhotosRequiredModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
  },
  handleBar: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  rim: {
    borderRadius: 22,
    padding: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  inner: {
    borderRadius: 19,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    position: 'relative',
  },
  headerSpark: {
    position: 'absolute',
    top: 14,
    right: 18,
    fontSize: 22,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    paddingRight: 28,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 8,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  leadStrong: {
    fontWeight: '700',
  },
  slotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 12,
  },
  slot: {
    width: 72,
    height: 88,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  slotUploading: {
    borderStyle: 'solid',
    opacity: 0.9,
  },
  slotFilled: {
    borderWidth: 2,
  },
  slotPlus: {
    fontSize: 32,
    fontWeight: '300',
  },
  slotEmoji: {
    fontSize: 28,
  },
  slotCheck: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCheckText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  progress: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  progressStrong: {
    fontWeight: '700',
  },
  uploadError: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    marginHorizontal: 4,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
  },
  primaryTouchable: {
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#f43f5e',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  primaryGradient: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    paddingVertical: 10,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
