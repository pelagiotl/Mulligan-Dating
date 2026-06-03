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
  DEALBREAKER_EMOJI,
  canonicalDealbreakerLabel,
  getInterestEmoji,
  isCanonicalLookingFor,
  isCanonicalPartnerQuality,
  LIFESTYLE_FIELD_EMOJI,
  LIFESTYLE_FIELD_LABEL,
  lifestylePickerItemLabel,
  LOOKING_FOR_META,
  PARTNER_QUALITY_EMOJI,
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

type SectionAccent = {
  emoji: string;
  colors: readonly [string, string, string];
};

const SECTION_ACCENTS: Record<string, SectionAccent> = {
  'Looking for': { emoji: '💞', colors: ['#fda4af', '#fb7185', '#f472b6'] },
  'Preferred matches': { emoji: '💕', colors: ['#a78bfa', '#c084fc', '#e879f9'] },
  About: { emoji: '💬', colors: ['#667eea', '#764ba2', '#a855f7'] },
  "What you're looking for": { emoji: '✨', colors: ['#f093fb', '#e879f9', '#667eea'] },
  Interests: { emoji: '🎯', colors: ['#f5576c', '#f093fb', '#667eea'] },
  Values: { emoji: '💎', colors: ['#f472b6', '#ec4899', '#db2777'] },
  Dealbreakers: { emoji: '🚫', colors: ['#ef4444', '#f5576c', '#a78bfa'] },
  Lifestyle: { emoji: '🌱', colors: ['#43e97b', '#38f9d7', '#667eea'] },
};

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

export { formatMaxDistanceLabel } from '../constants/matchingDistance';

function preferredMatchesEmoji(label: string): string {
  if (label === 'Everyone') return '🌍';
  if (label === 'Men') return '👨';
  if (label === 'Women') return '👩';
  if (label.includes('Men') && label.includes('Women')) return '💕';
  return '💕';
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

  const lookingForDisplay = useMemo(() => {
    if (!data.lookingFor) return null;
    if (isCanonicalLookingFor(data.lookingFor)) {
      const meta = LOOKING_FOR_META[data.lookingFor];
      return `${meta.emoji} ${data.lookingFor}`;
    }
    return data.lookingFor;
  }, [data.lookingFor]);

  const renderDetailSection = (title: string, body: React.ReactNode) => {
    const accent = SECTION_ACCENTS[title] ?? SECTION_ACCENTS.About;
    return (
      <View style={styles.detailBlock} key={title}>
        <LinearGradient
          colors={[accent.colors[0], accent.colors[1], accent.colors[2]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.detailBlockAccent}
        />
        <View style={styles.detailBlockInner}>
          <View style={styles.detailBlockHeader}>
            <LinearGradient
              colors={[accent.colors[0], accent.colors[2]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.detailBlockEmojiWrap}
            >
              <Text style={styles.detailBlockEmoji} allowFontScaling={false}>
                {accent.emoji}
              </Text>
            </LinearGradient>
            <Text style={styles.detailBlockTitle}>{title}</Text>
          </View>
          {body}
        </View>
      </View>
    );
  };

  const hasDetails =
    data.lookingFor ||
    data.bio ||
    data.partnerQualities.length > 0 ||
    data.interests.length > 0 ||
    data.values.length > 0 ||
    data.dealbreakers.length > 0 ||
    hasLifestyle(data.lifestyle);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { marginTop: sheetTop, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHandleWrap}>
            <View style={styles.sheetHandle} />
          </View>

          <LinearGradient
            colors={['#667eea', '#764ba2', '#a855f7', '#ec4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerGlowOrb} pointerEvents="none" />
            <View style={styles.headerGlowOrbSecondary} pointerEvents="none" />

            <View style={styles.headerTopRow}>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>👁 Preview</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.heroCenter}>
              <LinearGradient
                colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                {primaryPhotoUrl ? (
                  <Image source={{ uri: primaryPhotoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarPlaceholderText}>👤</Text>
                  </View>
                )}
              </LinearGradient>

              <Text style={styles.name}>
                {data.displayName}
                {data.age ? `, ${data.age}` : ''}
              </Text>

              <View style={styles.metaChips}>
                {data.gender ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>⚧️ {data.gender}</Text>
                  </View>
                ) : null}
                {data.location ? (
                  <View style={styles.metaChip}>
                    <Text style={styles.metaChipText}>📍 {data.location}</Text>
                  </View>
                ) : null}
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>📏 {data.maxDistanceLabel}</Text>
                </View>
              </View>

              <Text style={styles.tagline}>
                This is how your profile looks to others on Mulligan
              </Text>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedPhotos.length > 0 ? (
              <View style={styles.galleryCard}>
                <LinearGradient
                  colors={['rgba(102, 126, 234, 0.08)', 'rgba(168, 85, 247, 0.04)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.galleryHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>Gallery</Text>
                    <Text style={styles.sectionTitle}>Photos</Text>
                  </View>
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountBadgeText}>{sortedPhotos.length}</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRail}>
                  {sortedPhotos.map((ph, i) => (
                    <TouchableOpacity
                      key={ph.id}
                      activeOpacity={0.88}
                      onPress={() => setFullscreenIndex(i)}
                      style={styles.thumbWrap}
                    >
                      <Image source={{ uri: getPhotoUrl(ph.url) }} style={styles.thumb} />
                      <LinearGradient
                        colors={['transparent', 'rgba(15, 23, 42, 0.72)']}
                        style={styles.thumbOverlay}
                      >
                        <Text style={styles.thumbOverlayIcon} allowFontScaling={false}>🔍</Text>
                        <Text style={styles.thumbOverlayLabel}>View</Text>
                      </LinearGradient>
                      {ph.isPrimary ? (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>★ Main</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.galleryHint}>Tap a photo to browse full screen</Text>
              </View>
            ) : (
              <View style={styles.emptyPhotosCard}>
                <Text style={styles.emptyPhotosEmoji} allowFontScaling={false}>📸</Text>
                <Text style={styles.emptyHint}>No photos yet — add some from your profile.</Text>
              </View>
            )}

            {hasDetails ? (
              <View style={styles.detailsCard}>
                <View style={styles.detailsCardHeader}>
                  <Text style={styles.sectionEyebrow}>Your profile</Text>
                  <Text style={styles.sectionTitle}>Details</Text>
                </View>

                {data.lookingFor
                  ? renderDetailSection(
                      'Looking for',
                      <Text style={styles.blockBody}>{lookingForDisplay}</Text>
                    )
                  : null}

                {renderDetailSection(
                  'Preferred matches',
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillText}>
                      {preferredMatchesEmoji(data.preferredGendersLabel)} {data.preferredGendersLabel}
                    </Text>
                  </View>
                )}

                {data.bio
                  ? renderDetailSection('About', <Text style={styles.blockBody}>{data.bio}</Text>)
                  : null}

                {data.partnerQualities.length > 0
                  ? renderDetailSection(
                      "What you're looking for",
                      <View style={styles.qualityList}>
                        {data.partnerQualities.map((q, idx) => {
                          const em = isCanonicalPartnerQuality(q.quality)
                            ? PARTNER_QUALITY_EMOJI[q.quality]
                            : '✨';
                          return (
                            <View key={idx} style={styles.qualityPill}>
                              <Text style={styles.qualityPillText}>
                                {em} {q.quality}
                              </Text>
                              <Text style={styles.qualityStars}>
                                {'⭐'.repeat(Math.min(q.importance, 5))}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )
                  : null}

                {data.interests.length > 0
                  ? renderDetailSection(
                      'Interests',
                      <View style={styles.tags}>
                        {data.interests.map((name) => (
                          <LinearGradient
                            key={name}
                            colors={['rgba(237, 233, 254, 0.98)', 'rgba(224, 231, 255, 0.95)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.tag}
                          >
                            <Text style={styles.tagText}>
                              {getInterestEmoji(name)} {name}
                            </Text>
                          </LinearGradient>
                        ))}
                      </View>
                    )
                  : null}

                {data.values.length > 0
                  ? renderDetailSection(
                      'Values',
                      <View style={styles.tags}>
                        {data.values.map((v) => (
                          <LinearGradient
                            key={v}
                            colors={['rgba(252, 231, 243, 0.95)', 'rgba(251, 207, 232, 0.9)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.tag, styles.valueTag]}
                          >
                            <Text style={[styles.tagText, styles.valueTagText]}>💎 {v}</Text>
                          </LinearGradient>
                        ))}
                      </View>
                    )
                  : null}

                {data.dealbreakers.length > 0
                  ? renderDetailSection(
                      'Dealbreakers',
                      <View style={styles.tags}>
                        {data.dealbreakers.map((d, i) => {
                          const canon = canonicalDealbreakerLabel(d);
                          const em = canon ? DEALBREAKER_EMOJI[canon] : '🚫';
                          const label = canon ?? d;
                          return (
                            <View key={i} style={styles.dealbreakerTag}>
                              <Text style={styles.dealbreakerTagText}>
                                {em} {label}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )
                  : null}

                {hasLifestyle(data.lifestyle) && data.lifestyle
                  ? renderDetailSection(
                      'Lifestyle',
                      <View style={styles.lifestyleGrid}>
                        {LIFESTYLE_KEYS.map(({ key, field }) => {
                          const raw = data.lifestyle![field];
                          if (!raw || typeof raw !== 'string') return null;
                          return (
                            <View key={key} style={styles.lifestyleCard}>
                              <Text style={styles.lifestyleLabel}>
                                {LIFESTYLE_FIELD_EMOJI[key]} {LIFESTYLE_FIELD_LABEL[key]}
                              </Text>
                              <Text style={styles.lifestyleValue}>
                                {lifestylePickerItemLabel(key, raw)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )
                  : null}
              </View>
            ) : (
              <View style={styles.emptyDetailsCard}>
                <Text style={styles.emptyPhotosEmoji} allowFontScaling={false}>✨</Text>
                <Text style={styles.emptyHint}>
                  Add bio, interests, and more from your profile to fill this preview out.
                </Text>
              </View>
            )}

            <Text style={styles.footerNote}>Only you can see this preview</Text>
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
const thumbSize = Math.min(128, SCREEN_WIDTH * 0.34);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 10, 60, 0.78)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    marginHorizontal: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#f5f3ff',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetHandleWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  headerGradient: {
    paddingBottom: 22,
    overflow: 'hidden',
  },
  headerGlowOrb: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  headerGlowOrbSecondary: {
    position: 'absolute',
    bottom: -20,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#fff',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#5b21b6',
    fontWeight: '700',
  },
  heroCenter: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 36,
  },
  name: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  metaChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.32)',
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  tagline: {
    marginTop: 12,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f5f3ff',
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 28,
    gap: 12,
  },
  galleryCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.14)',
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  photoCountBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  photoCountBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5b21b6',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#7c3aed',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1e1b4b',
    marginTop: 2,
  },
  photoRail: {
    flexDirection: 'row',
  },
  thumbWrap: {
    marginRight: 12,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    width: thumbSize,
    height: thumbSize * 1.28,
    borderRadius: 18,
    backgroundColor: '#ede9fe',
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  thumbOverlayIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  thumbOverlayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },
  primaryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5b21b6',
  },
  galleryHint: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  emptyPhotosCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    alignItems: 'center',
  },
  emptyPhotosEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyHint: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  detailsCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
    gap: 12,
  },
  detailsCardHeader: {
    marginBottom: 4,
  },
  detailBlock: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.1)',
  },
  detailBlockAccent: {
    width: 4,
  },
  detailBlockInner: {
    flex: 1,
    padding: 12,
    paddingLeft: 10,
  },
  detailBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  detailBlockEmojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBlockEmoji: {
    fontSize: 18,
  },
  detailBlockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e1b4b',
    letterSpacing: 0.2,
  },
  blockBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
    fontWeight: '500',
  },
  highlightPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(237, 233, 254, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  highlightPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5b21b6',
  },
  qualityList: {
    gap: 8,
  },
  qualityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
  },
  qualityPillText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  qualityStars: {
    fontSize: 11,
    marginLeft: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
  },
  valueTag: {
    borderColor: 'rgba(236, 72, 153, 0.25)',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5b21b6',
  },
  valueTagText: {
    color: '#be185d',
  },
  dealbreakerTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(254, 226, 226, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  dealbreakerTagText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  lifestyleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lifestyleCard: {
    width: '48%',
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
  },
  lifestyleLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.3,
  },
  lifestyleValue: {
    fontSize: 12,
    color: '#334155',
    marginTop: 4,
    fontWeight: '600',
    lineHeight: 16,
  },
  emptyDetailsCard: {
    padding: 28,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    alignItems: 'center',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4,
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

export const profilePreviewSheetStyles = styles;
