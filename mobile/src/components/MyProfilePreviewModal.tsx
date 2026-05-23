import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPhotoUrl } from '../utils/photoUrl';
import {
  LIFESTYLE_FIELD_LABEL,
  lifestylePickerItemLabel,
  type LifestyleFieldKey,
} from '../constants/profileMySections';

export type MyProfilePreviewPhoto = {
  id: string;
  url: string;
  isPrimary?: boolean;
};

export type MyProfilePreviewData = {
  displayName: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  lookingFor: string | null;
  interests: string[];
  dealbreakers: string[];
  partnerQualities: Array<{ quality: string; importance: number }>;
  preferredGendersLabel: string;
  maxDistanceLabel: string;
  values: string[];
  lifestyle: {
    smoking: string | null;
    drinking: string | null;
    children: string | null;
    pets: string | null;
    religion: string | null;
    political?: string | null;
    work_life_balance: string | null;
    works_out: string | null;
  } | null;
};

function hasLifestyle(lifestyle: MyProfilePreviewData['lifestyle']): boolean {
  if (!lifestyle) return false;
  return !!(
    lifestyle.smoking ||
    lifestyle.drinking ||
    lifestyle.children ||
    lifestyle.pets ||
    lifestyle.religion ||
    lifestyle.political ||
    lifestyle.work_life_balance ||
    lifestyle.works_out
  );
}

const LIFESTYLE_KEYS: Array<{ key: LifestyleFieldKey; field: keyof NonNullable<MyProfilePreviewData['lifestyle']> }> = [
  { key: 'smoking', field: 'smoking' },
  { key: 'drinking', field: 'drinking' },
  { key: 'children', field: 'children' },
  { key: 'pets', field: 'pets' },
  { key: 'religion', field: 'religion' },
  { key: 'political', field: 'political' },
  { key: 'work_life_balance', field: 'work_life_balance' },
  { key: 'works_out', field: 'works_out' },
];

export function parseProfileValues(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function formatPreferredGendersLabel(raw: string | null | undefined): string {
  if (!raw) return 'Everyone';
  try {
    const arr = JSON.parse(raw) as string[];
    const filtered = arr.filter((g) => g === 'Man' || g === 'Woman' || g === 'Everyone');
    if (!filtered.length || filtered.includes('Everyone')) return 'Everyone';
    const labels: Record<string, string> = { Man: 'Men', Woman: 'Women', Everyone: 'Everyone' };
    return filtered.map((g) => labels[g] ?? g).join(', ');
  } catch {
    return 'Everyone';
  }
}

export function formatMaxDistanceLabel(maxDistance: number | null | undefined): string {
  return maxDistance == null ? 'Any distance' : `Within ${maxDistance} mi`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  data: MyProfilePreviewData;
  photos: MyProfilePreviewPhoto[];
};

export default function MyProfilePreviewModal({ visible, onClose, data, photos }: Props) {
  const insets = useSafeAreaInsets();
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      }),
    [photos]
  );

  const primaryPhotoUrl = useMemo(() => {
    const primary = sortedPhotos.find((p) => p.isPrimary) || sortedPhotos[0];
    return primary ? getPhotoUrl(primary.url) : null;
  }, [sortedPhotos]);

  const sheetTop = Platform.OS === 'android' ? Math.max(insets.top, 8) + 8 : Math.max(insets.top, 14) + 12;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { marginTop: sheetTop, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <View style={styles.headerMain}>
              {primaryPhotoUrl ? (
                <Image source={{ uri: primaryPhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarPlaceholderText}>👤</Text>
                </View>
              )}
              <View style={styles.headerText}>
                <Text style={styles.name}>
                  {data.displayName}
                  {data.age ? `, ${data.age}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {[data.gender, data.location, data.maxDistanceLabel].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.tagline}>
                  How your profile looks to others on Mulligan
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedPhotos.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>Gallery</Text>
                <Text style={styles.sectionTitle}>Photos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRail}>
                  {sortedPhotos.map((ph, i) => (
                    <TouchableOpacity
                      key={ph.id}
                      activeOpacity={0.85}
                      onPress={() => setFullscreenIndex(i)}
                    >
                      <Image source={{ uri: getPhotoUrl(ph.url) }} style={styles.thumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <Text style={styles.emptyHint}>No photos yet — add some from your profile.</Text>
            )}

            {data.lookingFor ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Looking for</Text>
                <Text style={styles.blockBody}>{data.lookingFor}</Text>
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Wants to connect with</Text>
              <Text style={styles.blockBody}>{data.preferredGendersLabel}</Text>
            </View>

            {data.bio ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>About</Text>
                <Text style={styles.blockBody}>{data.bio}</Text>
              </View>
            ) : null}

            {data.partnerQualities.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>What you&apos;re looking for</Text>
                {data.partnerQualities.map((q, idx) => (
                  <View key={idx} style={styles.qualityRow}>
                    <Text style={styles.qualityName}>{q.quality}</Text>
                    <Text style={styles.qualityStars}>{'⭐'.repeat(Math.min(q.importance, 5))}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {data.interests.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Interests</Text>
                <View style={styles.tags}>
                  {data.interests.map((name) => (
                    <View key={name} style={styles.tag}>
                      <Text style={styles.tagText}>{name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {data.values.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Values</Text>
                <View style={styles.tags}>
                  {data.values.map((v) => (
                    <View key={v} style={[styles.tag, styles.valueTag]}>
                      <Text style={styles.tagText}>{v}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {data.dealbreakers.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Dealbreakers</Text>
                {data.dealbreakers.map((d, i) => (
                  <Text key={i} style={styles.listItem}>
                    • {d}
                  </Text>
                ))}
              </View>
            ) : null}

            {hasLifestyle(data.lifestyle) && data.lifestyle ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Lifestyle</Text>
                {LIFESTYLE_KEYS.map(({ key, field }) => {
                  const raw = data.lifestyle![field];
                  if (!raw || typeof raw !== 'string') return null;
                  return (
                    <View key={key} style={styles.lifestyleRow}>
                      <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL[key]}</Text>
                      <Text style={styles.lifestyleValue}>
                        {lifestylePickerItemLabel(key, raw)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <Modal
        visible={fullscreenIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenIndex(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenIndex(null)}
          >
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>
          {fullscreenIndex !== null && sortedPhotos[fullscreenIndex] ? (
            <Image
              source={{ uri: getPhotoUrl(sortedPhotos[fullscreenIndex].url) }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </Modal>
  );
}

const thumbSize = Math.min(120, Dimensions.get('window').width * 0.32);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(76, 29, 46, 0.88)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    marginHorizontal: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#fffafb',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(225, 29, 72, 0.12)',
    backgroundColor: 'rgba(255, 253, 253, 0.98)',
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    backgroundColor: '#fce7f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 28,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1523',
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  tagline: {
    marginTop: 6,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.16)',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#57534e',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#be185d',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1523',
    marginBottom: 12,
  },
  photoRail: {
    flexDirection: 'row',
  },
  thumb: {
    width: thumbSize,
    height: thumbSize * 1.25,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: '#f1f5f9',
  },
  emptyHint: {
    color: '#64748b',
    marginBottom: 16,
    fontSize: 14,
  },
  block: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.1)',
  },
  blockTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#881337',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  blockBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  qualityName: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
  },
  qualityStars: {
    fontSize: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(254, 205, 211, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(190, 24, 93, 0.2)',
  },
  valueTag: {
    backgroundColor: 'rgba(254, 243, 199, 0.6)',
    borderColor: 'rgba(217, 119, 6, 0.25)',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#881337',
  },
  listItem: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 4,
    lineHeight: 20,
  },
  lifestyleRow: {
    marginBottom: 8,
  },
  lifestyleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  lifestyleValue: {
    fontSize: 15,
    color: '#334155',
    marginTop: 2,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenCloseText: {
    fontSize: 20,
    color: '#334155',
  },
});
