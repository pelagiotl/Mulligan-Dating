import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function PhotoUnlockExplainerModal({
  visible,
  onClose,
  otherDisplayName,
  midnight,
}: {
  visible: boolean;
  onClose: () => void;
  otherDisplayName: string;
  midnight: boolean;
}) {
  const name = otherDisplayName.trim() || 'your match';
  const bodyCopy = `You each see one photo at first. After you and ${name} have each sent at least 3 messages in this chat, you'll both see each other's full galleries.`;
  const rimColors = midnight
    ? (['rgba(251, 113, 133, 0.85)', 'rgba(251, 191, 36, 0.65)', 'rgba(244, 63, 94, 0.75)'] as const)
    : (['#f472b6', '#fb923c', '#fbbf24'] as const);
  const innerBg = midnight ? '#14121e' : '#fffefb';
  const titleColor = midnight ? '#fde68a' : '#9f1239';
  const bodyColor = midnight ? '#e2e8f0' : '#44403c';
  const chipBorder = midnight ? 'rgba(251, 191, 36, 0.38)' : 'rgba(251, 191, 36, 0.45)';
  const chipBg = midnight ? 'rgba(251, 113, 133, 0.12)' : 'rgba(253, 242, 248, 0.95)';
  const chipText = midnight ? '#fde68a' : '#9f1239';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetWrap}>
              <LinearGradient colors={[...rimColors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
                <View style={[styles.inner, { backgroundColor: innerBg }]}>
                  <View style={styles.content}>
                    <Text style={styles.emoji}>📸 ✨</Text>
                    <Text style={[styles.title, { color: titleColor }]}>Unlock all photos</Text>
                    <Text style={[styles.lead, { color: bodyColor }]}>{bodyCopy}</Text>
                    <View style={styles.chips}>
                      <View style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                        <Text style={[styles.chipText, { color: chipText }]}>📷 1 preview each</Text>
                      </View>
                      <View style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                        <Text style={[styles.chipText, { color: chipText }]}>💬 3 msgs each</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.cta, midnight ? styles.ctaMidnight : styles.ctaDay]}
                    onPress={onClose}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.ctaText, midnight ? styles.ctaTextMidnight : styles.ctaTextDay]}>Got it</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  sheetWrap: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  rim: {
    borderRadius: 22,
    padding: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.35,
        shadowRadius: 28,
      },
      android: { elevation: 18 },
    }),
  },
  inner: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  emoji: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  lead: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    letterSpacing: 0.15,
    marginBottom: 14,
    flexShrink: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cta: {
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaDay: {
    backgroundColor: 'rgba(244, 63, 94, 0.92)',
  },
  ctaMidnight: {
    backgroundColor: 'rgba(251, 191, 36, 0.92)',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  ctaTextDay: {
    color: '#fff',
  },
  ctaTextMidnight: {
    color: '#422006',
  },
});
