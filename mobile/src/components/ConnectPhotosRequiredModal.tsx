import React, { memo, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { MIN_PHOTOS_TO_CONNECT } from '../utils/connectSetup';

export interface ConnectPhotosRequiredModalProps {
  visible: boolean;
  onClose: () => void;
  onAddPhotos: () => void;
  photoCount: number;
  connectShell: ConnectShellMode;
}

function rimGradient(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  if (mode === 'midnight') return ['#ec4899', '#f97316', '#eab308', '#a855f7'];
  if (mode === 'sunny') return ['#fbbf24', '#fb923c', '#f472b6', '#38bdf8'];
  return ['#ec4899', '#f97316', '#eab308', '#a855f7'];
}

function ctaGradient(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  if (mode === 'midnight') return ['#db2777', '#ea580c', '#f59e0b'];
  if (mode === 'sunny') return ['#ea580c', '#f59e0b', '#f472b6'];
  return ['#db2777', '#ea580c', '#f59e0b'];
}

const ConnectPhotosRequiredModal = memo(function ConnectPhotosRequiredModal({
  visible,
  onClose,
  onAddPhotos,
  photoCount,
  connectShell,
}: ConnectPhotosRequiredModalProps) {
  const rim = useMemo(() => rimGradient(connectShell), [connectShell]);
  const cta = useMemo(() => ctaGradient(connectShell), [connectShell]);
  const hasPhoto = photoCount >= MIN_PHOTOS_TO_CONNECT;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View style={styles.handleBar} accessibilityElementsHidden />

          <LinearGradient colors={rim} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
            <View style={styles.inner}>
              <LinearGradient
                colors={['#be185d', '#ea580c', '#d97706']}
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
                <Text style={styles.lead}>
                  You&apos;re set up with name and location — add{' '}
                  <Text style={styles.leadStrong}>one clear photo</Text> on your Profile so you&apos;re ready
                  to match others when we launch.
                </Text>

                <View style={styles.slotRow} accessibilityLabel={`${photoCount} of ${MIN_PHOTOS_TO_CONNECT} photos`}>
                  <View style={[styles.slot, hasPhoto ? styles.slotFilled : styles.slotEmpty]}>
                    {hasPhoto ? (
                      <>
                        <Text style={styles.slotEmoji}>📷</Text>
                        <View style={styles.slotCheck}>
                          <Text style={styles.slotCheckText}>✓</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.slotPlus}>+</Text>
                    )}
                  </View>
                </View>

                <Text style={styles.progress}>
                  {hasPhoto ? (
                    'Photo added — you&apos;re ready for launch day'
                  ) : (
                    <>
                      <Text style={styles.progressStrong}>Add your photo</Text> to unlock Connect on launch day
                    </>
                  )}
                </Text>

                <View style={styles.chips}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>😊 Face visible</Text>
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>☀️ Recent pic</Text>
                  </View>
                </View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={onAddPhotos}
                  activeOpacity={0.88}
                  style={styles.primaryTouchable}
                  accessibilityRole="button"
                  accessibilityLabel="Add my photo"
                >
                  <LinearGradient colors={cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryGradient}>
                    <Text style={styles.primaryText}>Add my photo →</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={styles.secondaryBtn} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Not now</Text>
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
    backgroundColor: 'rgba(45, 17, 24, 0.62)',
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
    backgroundColor: 'rgba(255,255,255,0.4)',
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
    backgroundColor: '#fffefb',
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
    color: '#475569',
    textAlign: 'center',
  },
  leadStrong: {
    fontWeight: '700',
    color: '#be185d',
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
    borderColor: 'rgba(244, 63, 94, 0.45)',
    backgroundColor: 'rgba(255, 241, 245, 0.95)',
  },
  slotFilled: {
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.55)',
    backgroundColor: '#ecfdf5',
  },
  slotPlus: {
    fontSize: 32,
    fontWeight: '300',
    color: '#f472b6',
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
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  progressStrong: {
    fontWeight: '700',
    color: '#be185d',
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
    backgroundColor: 'rgba(253, 242, 248, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#581c87',
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
    color: '#94a3b8',
  },
});
