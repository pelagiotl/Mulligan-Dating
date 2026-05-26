import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  { key: 'workLifeBalance', field: 'work_life_balance' },
  { key: 'worksOut', field: 'works_out' },
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
  const fullscreenListRef = useRef<FlatList<MyProfilePreviewPhoto>>(null);
  const fullscreenProgrammaticScrollRef = useRef(false);
  const fullscreenWasOpenRef = useRef(false);

  const sortedPhotos = useMemo(
    () =>
      [...photos].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      }),
    [photos]
  );

  useEffect(() => {
    if (!visible) {
      setFullscreenIndex(null);
    }
  }, [visible]);

  useEffect(() => {
    if (fullscreenIndex === null || sortedPhotos.length === 0) {
      fullscreenWasOpenRef.current = false;
      return;
    }
    if (fullscreenWasOpenRef.current) return;
    fullscreenWasOpenRef.current = true;

    const index = Math.min(fullscreenIndex, sortedPhotos.length - 1);
    const scrollToIndex = () => {
      try {
        fullscreenListRef.current?.scrollToIndex({ index, animated: false });
      } catch {
        fullscreenListRef.current?.scrollToOffset({
          offset: SCREEN_WIDTH * index,
          animated: false,
        });
      }
    };
    const t = setTimeout(scrollToIndex, 50);
    return () => clearTimeout(t);
  }, [fullscreenIndex, sortedPhotos.length]);

  const primaryPhotoUrl = useMemo(() => {
    const primary = sortedPhotos.find((p) => p.isPrimary) || sortedPhotos[0];
    return primary ? getPhotoUrl(primary.url) : null;
  }, [sortedPhotos]);

  const sheetTop = Platform.OS === 'android' ? Math.max(insets.top, 8) + 8 : Math.max(insets.top, 14) + 12;

  const renderSection = (title: string, body: React.ReactNode) => (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      {body}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { marginTop: sheetTop, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <LinearGradient
            colors={['#667eea', '#764ba2', '#a855f7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>Preview mode</Text>
              </View>
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
                  <View style={styles.metaChips}>
                    {data.gender ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{data.gender}</Text>
                      </View>
                    ) : null}
                    {data.location ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>📍 {data.location}</Text>
                      </View>
                    ) : null}
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{data.maxDistanceLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.tagline}>How your profile looks to others on Mulligan</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedPhotos.length > 0 ? (
              <View style={styles.surface}>
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

            {data.lookingFor
              ? renderSection('Looking for', <Text style={styles.blockBody}>{data.lookingFor}</Text>)
              : null}

            {renderSection(
              'Wants to connect with',
              <Text style={styles.blockBody}>{data.preferredGendersLabel}</Text>
            )}

            {data.bio
              ? renderSection('About', <Text style={styles.blockBody}>{data.bio}</Text>)
              : null}

            {data.partnerQualities.length > 0
              ? renderSection(
                  "What you're looking for",
                  <>
                    {data.partnerQualities.map((q, idx) => (
                      <View key={idx} style={styles.qualityRow}>
                        <Text style={styles.qualityName}>{q.quality}</Text>
                        <Text style={styles.qualityStars}>{'⭐'.repeat(Math.min(q.importance, 5))}</Text>
                      </View>
                    ))}
                  </>
                )
              : null}

            {data.interests.length > 0
              ? renderSection(
                  'Interests',
                  <View style={styles.tags}>
                    {data.interests.map((name) => (
                      <View key={name} style={styles.tag}>
                        <Text style={styles.tagText}>{name}</Text>
                      </View>
                    ))}
                  </View>
                )
              : null}

            {data.values.length > 0
              ? renderSection(
                  'Values',
                  <View style={styles.tags}>
                    {data.values.map((v) => (
                      <View key={v} style={[styles.tag, styles.valueTag]}>
                        <Text style={styles.tagText}>{v}</Text>
                      </View>
                    ))}
                  </View>
                )
              : null}

            {data.dealbreakers.length > 0
              ? renderSection(
                  'Dealbreakers',
                  <>
                    {data.dealbreakers.map((d, i) => (
                      <Text key={i} style={styles.listItem}>
                        • {d}
                      </Text>
                    ))}
                  </>
                )
              : null}

            {hasLifestyle(data.lifestyle) && data.lifestyle
              ? renderSection(
                  'Lifestyle',
                  <View style={styles.lifestyleGrid}>
                    {LIFESTYLE_KEYS.map(({ key, field }) => {
                      const raw = data.lifestyle![field];
                      if (!raw || typeof raw !== 'string') return null;
                      return (
                        <View key={key} style={styles.lifestyleCard}>
                          <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL[key]}</Text>
                          <Text style={styles.lifestyleValue}>
                            {lifestylePickerItemLabel(key, raw)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )
              : null}
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
            style={[styles.fullscreenClose, { top: Math.max(insets.top, 12) + 8 }]}
            onPress={() => setFullscreenIndex(null)}
            accessibilityLabel="Close photo viewer"
          >
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </TouchableOpacity>

          {fullscreenIndex !== null && sortedPhotos.length > 0 ? (
            <View style={styles.fullscreenContent}>
              <FlatList
                ref={fullscreenListRef}
                data={sortedPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                initialScrollIndex={Math.min(fullscreenIndex, sortedPhotos.length - 1)}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    fullscreenListRef.current?.scrollToOffset({
                      offset: info.averageItemLength * info.index,
                      animated: false,
                    });
                  }, 100);
                }}
                onMomentumScrollEnd={(event) => {
                  if (fullscreenProgrammaticScrollRef.current) {
                    fullscreenProgrammaticScrollRef.current = false;
                    return;
                  }
                  const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  if (index >= 0 && index < sortedPhotos.length) {
                    setFullscreenIndex(index);
                  }
                }}
                renderItem={({ item }) => (
                  <View style={styles.fullscreenSlide}>
                    <Image
                      source={{ uri: getPhotoUrl(item.url) }}
                      style={styles.fullscreenImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              />

              {sortedPhotos.length > 1 ? (
                <>
                  <View style={styles.fullscreenTapOverlay} pointerEvents="box-none">
                    <TouchableOpacity
                      style={styles.fullscreenTapLeft}
                      activeOpacity={1}
                      onPress={() => {
                        if (fullscreenIndex > 0) {
                          const prev = fullscreenIndex - 1;
                          fullscreenProgrammaticScrollRef.current = true;
                          setFullscreenIndex(prev);
                          fullscreenListRef.current?.scrollToIndex({ index: prev, animated: true });
                        }
                      }}
                    />
                    <TouchableOpacity
                      style={styles.fullscreenTapRight}
                      activeOpacity={1}
                      onPress={() => {
                        if (fullscreenIndex < sortedPhotos.length - 1) {
                          const next = fullscreenIndex + 1;
                          fullscreenProgrammaticScrollRef.current = true;
                          setFullscreenIndex(next);
                          fullscreenListRef.current?.scrollToIndex({ index: next, animated: true });
                        }
                      }}
                    />
                  </View>
                  <View
                    style={[
                      styles.fullscreenCounterWrap,
                      { bottom: Math.max(insets.bottom, 16) + 12 },
                    ]}
                  >
                    <Text style={styles.fullscreenCounter}>
                      {fullscreenIndex + 1} / {sortedPhotos.length}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </Modal>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const thumbSize = Math.min(120, SCREEN_WIDTH * 0.32);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46, 16, 101, 0.72)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    marginHorizontal: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#faf8ff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  headerGradient: {
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: 14,
  },
  previewBadge: {
    position: 'absolute',
    top: 12,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#fff',
  },
  headerMain: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    fontSize: 21,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  metaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  tagline: {
    marginTop: 8,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.88)',
    lineHeight: 16,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#5b21b6',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#faf8ff',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 32,
    gap: 10,
  },
  surface: {
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.14)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#7c3aed',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e1b4b',
    marginBottom: 12,
    marginTop: 2,
  },
  photoRail: {
    flexDirection: 'row',
  },
  thumb: {
    width: thumbSize,
    height: thumbSize * 1.25,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.15)',
  },
  emptyHint: {
    color: '#64748b',
    marginBottom: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  block: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  blockTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6d28d9',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(102, 126, 234, 0.12)',
  },
  qualityName: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
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
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(237, 233, 254, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.22)',
  },
  valueTag: {
    backgroundColor: 'rgba(252, 231, 243, 0.9)',
    borderColor: 'rgba(236, 72, 153, 0.22)',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b21b6',
  },
  listItem: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
    lineHeight: 20,
  },
  lifestyleGrid: {
    gap: 8,
  },
  lifestyleCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(237, 242, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.1)',
  },
  lifestyleLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lifestyleValue: {
    fontSize: 14,
    color: '#334155',
    marginTop: 4,
    fontWeight: '500',
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  fullscreenContent: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  fullscreenSlide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullscreenTapOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 10,
  },
  fullscreenTapLeft: {
    flex: 1,
  },
  fullscreenTapRight: {
    flex: 1,
  },
  fullscreenCounterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  fullscreenCounter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fullscreenClose: {
    position: 'absolute',
    right: 20,
    zIndex: 20,
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
