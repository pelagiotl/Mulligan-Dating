import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getPhotoUrl } from '../utils/photoUrl';
import OptimizedImage from './OptimizedImage';
import { profilePreviewSheetStyles as styles } from './MyProfilePreviewModal';
import {
  DEALBREAKER_EMOJI,
  canonicalDealbreakerLabel,
  getInterestEmoji,
  isCanonicalLookingFor,
  isCanonicalPartnerQuality,
  LOOKING_FOR_META,
  PARTNER_QUALITY_EMOJI,
} from '../constants/profileMySections';
import { formatPreferredGendersLabel } from './MyProfilePreviewModal';

export type MatchPartnerPhoto = {
  id: string;
  url: string;
  displayOrder?: number;
  isPrimary?: boolean;
};

export type MatchPartnerUser = {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location: string | null;
  bio: string | null;
  lookingFor?: string | null;
  photoUrl: string | null;
  photos?: MatchPartnerPhoto[];
  interests: string[];
  values: string[];
  partnerQualities: Array<{ quality: string; importance: number }>;
  dealbreakers?: string[];
  preferredGenders?: string[] | null;
  lastActiveLabel?: string | null;
};

export type MatchPartnerProfileMatch = {
  id: string;
  stage: 'stage1' | 'stage2';
  otherUser: MatchPartnerUser;
};

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
};

/** Tighter hero on Android chat quick view (name, meta chips, avatar). */
const androidCompactHero = Platform.select({
  android: {
    headerGradient: { paddingBottom: 14 },
    headerTopRow: { paddingTop: 12 },
    heroCenter: { paddingTop: 4 },
    avatarRing: { marginBottom: 8, padding: 3 },
    avatar: { width: 80, height: 80, borderRadius: 40 },
    avatarPlaceholderText: { fontSize: 30 },
    name: { fontSize: 20, marginBottom: 0 },
    metaChips: { marginTop: 8, gap: 6 },
    metaChip: { paddingHorizontal: 10, paddingVertical: 4 },
    metaChipText: { fontSize: 11 },
    closeBtn: { width: 36, height: 36, borderRadius: 18 },
    closeBtnText: { fontSize: 16 },
    tagline: { marginTop: 8, fontSize: 12, lineHeight: 16 },
    previewBadge: { paddingVertical: 5, paddingHorizontal: 10 },
    previewBadgeText: { fontSize: 10 },
  },
  default: {},
}) as Record<string, object>;

function preferredMatchesEmoji(label: string): string {
  if (label === 'Everyone') return '🌍';
  if (label === 'Men') return '👨';
  if (label === 'Women') return '👩';
  if (label.includes('Men') && label.includes('Women')) return '💕';
  return '💕';
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const accent = SECTION_ACCENTS[title] ?? SECTION_ACCENTS.About;
  return (
    <View style={styles.detailBlock}>
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
        {children}
      </View>
    </View>
  );
}

type Props = {
  match: MatchPartnerProfileMatch;
  visible: boolean;
  onClose: () => void;
  onPhotoPress?: (url: string, allUrls?: string[], index?: number) => void;
  onReport?: () => void;
  onBlock?: () => void;
  noModal?: boolean;
};

export default function MatchPartnerProfileModal({
  match,
  visible,
  onClose,
  onPhotoPress,
  onReport,
  onBlock,
  noModal = false,
}: Props) {
  const { otherUser } = match;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [currentUserInterests, setCurrentUserInterests] = useState<string[]>([]);

  const allPhotos = useMemo((): MatchPartnerPhoto[] => {
    if (match.stage === 'stage1') {
      if (otherUser.photoUrl) {
        return [{ id: 'primary', url: otherUser.photoUrl, isPrimary: true, displayOrder: 0 }];
      }
      return [];
    }
    return otherUser.photos ?? [];
  }, [match.stage, otherUser.photoUrl, otherUser.photos]);

  const sortedPhotos = useMemo(
    () =>
      [...allPhotos].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      }),
    [allPhotos]
  );

  const primaryPhoto = sortedPhotos.find((p) => p.isPrimary) || sortedPhotos[0];
  const primaryPhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : null;

  useEffect(() => {
    if (!visible || !user) {
      setCurrentUserInterests([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{ interests?: Array<{ name: string } | string> }>('/profile');
        if (cancelled) return;
        const raw = data.interests;
        if (!Array.isArray(raw)) {
          setCurrentUserInterests([]);
          return;
        }
        setCurrentUserInterests(
          raw.map((i) => (typeof i === 'string' ? i : i.name)).filter(Boolean)
        );
      } catch {
        if (!cancelled) setCurrentUserInterests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, user, match.id]);

  const matchInterests = otherUser.interests || [];
  const commonInterests = currentUserInterests.filter((mine) =>
    matchInterests.some((t) => t.toLowerCase() === mine.toLowerCase())
  );

  const lookingForDisplay = useMemo(() => {
    if (!otherUser.lookingFor) return null;
    if (isCanonicalLookingFor(otherUser.lookingFor)) {
      const meta = LOOKING_FOR_META[otherUser.lookingFor];
      return `${meta.emoji} ${otherUser.lookingFor}`;
    }
    return otherUser.lookingFor;
  }, [otherUser.lookingFor]);

  const preferredLabel =
    otherUser.preferredGenders !== undefined
      ? formatPreferredGendersLabel(
          otherUser.preferredGenders ? JSON.stringify(otherUser.preferredGenders) : null
        )
      : null;

  const hasDetailsBeyondBio = !!(
    otherUser.lookingFor ||
    (otherUser.partnerQualities?.length ?? 0) > 0 ||
    matchInterests.length > 0 ||
    (otherUser.values?.length ?? 0) > 0 ||
    (otherUser.dealbreakers?.length ?? 0) > 0 ||
    otherUser.preferredGenders !== undefined
  );

  const sheetTop = Platform.OS === 'android' ? Math.max(insets.top, 8) + 8 : Math.max(insets.top, 14) + 12;

  const emptyPhotosMessage =
    match.stage === 'stage2'
      ? 'No gallery photos listed yet.'
      : 'Additional photos unlock as you each send enough messages in chat.';

  const openPhoto = (index: number) => {
    if (!onPhotoPress || sortedPhotos.length === 0) return;
    const urls = sortedPhotos.map((p) => getPhotoUrl(p.url));
    onPhotoPress(urls[index], urls, index);
  };

  const content = (
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
          style={[styles.headerGradient, androidCompactHero.headerGradient]}
        >
          <View style={styles.headerGlowOrb} pointerEvents="none" />
          <View style={styles.headerGlowOrbSecondary} pointerEvents="none" />

          <View style={[styles.headerTopRow, androidCompactHero.headerTopRow]}>
            <View style={[styles.previewBadge, androidCompactHero.previewBadge]}>
              <Text style={[styles.previewBadgeText, androidCompactHero.previewBadgeText]}>💬 Quick view</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, androidCompactHero.closeBtn]}
              onPress={onClose}
              accessibilityLabel="Close profile"
            >
              <Text style={[styles.closeBtnText, androidCompactHero.closeBtnText]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.heroCenter, androidCompactHero.heroCenter]}>
            <TouchableOpacity
              activeOpacity={primaryPhotoUrl ? 0.88 : 1}
              disabled={!primaryPhotoUrl}
              onPress={() => {
                if (primaryPhotoUrl) openPhoto(0);
              }}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.9)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatarRing, androidCompactHero.avatarRing]}
              >
                {primaryPhotoUrl ? (
                  <OptimizedImage
                    source={primaryPhoto?.url ?? primaryPhotoUrl}
                    style={[styles.avatar, androidCompactHero.avatar]}
                    resizeMode="cover"
                    showLoadingIndicator={false}
                  />
                ) : (
                  <View style={[styles.avatar, androidCompactHero.avatar, styles.avatarPlaceholder]}>
                    <Text style={[styles.avatarPlaceholderText, androidCompactHero.avatarPlaceholderText]}>
                      {otherUser.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={[styles.name, androidCompactHero.name]}>
              {otherUser.displayName}
              {otherUser.age ? `, ${otherUser.age}` : ''}
            </Text>

            <View style={[styles.metaChips, androidCompactHero.metaChips]}>
              {otherUser.gender ? (
                <View style={[styles.metaChip, androidCompactHero.metaChip]}>
                  <Text style={[styles.metaChipText, androidCompactHero.metaChipText]}>⚧️ {otherUser.gender}</Text>
                </View>
              ) : null}
              {otherUser.location ? (
                <View style={[styles.metaChip, androidCompactHero.metaChip]}>
                  <Text style={[styles.metaChipText, androidCompactHero.metaChipText]}>📍 {otherUser.location}</Text>
                </View>
              ) : null}
              {otherUser.lastActiveLabel ? (
                <View style={[styles.metaChip, androidCompactHero.metaChip]}>
                  <Text style={[styles.metaChipText, androidCompactHero.metaChipText]}>
                    🟢 {otherUser.lastActiveLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {otherUser.bio ? (
              <View style={heroAboutStyles.outer}>
                <LinearGradient
                  colors={[
                    'rgba(255, 255, 255, 0.72)',
                    'rgba(255, 255, 255, 0.28)',
                    'rgba(236, 72, 153, 0.45)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={heroAboutStyles.rim}
                >
                  <View style={heroAboutStyles.inner}>
                    <View style={heroAboutStyles.head}>
                      <LinearGradient
                        colors={['#667eea', '#764ba2', '#ec4899']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={heroAboutStyles.iconWrap}
                      >
                        <Text style={heroAboutStyles.icon} allowFontScaling={false}>
                          💬
                        </Text>
                      </LinearGradient>
                      <Text style={heroAboutStyles.title}>About</Text>
                    </View>
                    <Text style={heroAboutStyles.text}>{otherUser.bio}</Text>
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            <Text
              style={[
                styles.tagline,
                androidCompactHero.tagline,
                otherUser.bio ? heroAboutStyles.taglineAfterAbout : null,
              ]}
            >
              Tap their photo or gallery to view full size
            </Text>
          </View>
        </LinearGradient>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {commonInterests.length > 0 ? (
            <View style={styles.galleryCard}>
              <LinearGradient
                colors={['rgba(102, 126, 234, 0.08)', 'rgba(168, 85, 247, 0.04)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <Text style={styles.sectionEyebrow}>In common</Text>
              <Text style={styles.sectionTitle}>You both like</Text>
              <Text style={[styles.galleryHint, { marginTop: 4, marginBottom: 10 }]}>
                {commonInterests.length} {commonInterests.length === 1 ? 'interest' : 'interests'} overlap
              </Text>
              <View style={styles.tags}>
                {commonInterests.slice(0, 8).map((interest) => (
                  <LinearGradient
                    key={interest}
                    colors={['rgba(254, 205, 211, 0.95)', 'rgba(251, 207, 232, 0.9)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tag}
                  >
                    <Text style={[styles.tagText, { color: '#9d174d' }]}>
                      {getInterestEmoji(interest)} {interest}
                    </Text>
                  </LinearGradient>
                ))}
              </View>
            </View>
          ) : null}

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
                    onPress={() => openPhoto(i)}
                    style={styles.thumbWrap}
                  >
                    <OptimizedImage
                      source={ph.url}
                      style={styles.thumb}
                      resizeMode="cover"
                      showLoadingIndicator={false}
                    />
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
              <Text style={styles.emptyHint}>{emptyPhotosMessage}</Text>
            </View>
          )}

          {hasDetailsBeyondBio ? (
            <View style={styles.detailsCard}>
              <View style={styles.detailsCardHeader}>
                <Text style={styles.sectionEyebrow}>Their profile</Text>
                <Text style={styles.sectionTitle}>Details</Text>
              </View>

              {otherUser.lookingFor && lookingForDisplay ? (
                <DetailSection title="Looking for">
                  <Text style={styles.blockBody}>{lookingForDisplay}</Text>
                </DetailSection>
              ) : null}

              {preferredLabel ? (
                <DetailSection title="Preferred matches">
                  <View style={styles.highlightPill}>
                    <Text style={styles.highlightPillText}>
                      {preferredMatchesEmoji(preferredLabel)} {preferredLabel}
                    </Text>
                  </View>
                </DetailSection>
              ) : null}

              {(otherUser.partnerQualities?.length ?? 0) > 0 ? (
                <DetailSection title="What you're looking for">
                  <View style={styles.qualityList}>
                    {otherUser.partnerQualities.map((q, idx) => {
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
                </DetailSection>
              ) : null}

              {matchInterests.length > 0 ? (
                <DetailSection title="Interests">
                  <View style={styles.tags}>
                    {matchInterests.map((name) => (
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
                </DetailSection>
              ) : null}

              {(otherUser.values?.length ?? 0) > 0 ? (
                <DetailSection title="Values">
                  <View style={styles.tags}>
                    {otherUser.values.map((v) => (
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
                </DetailSection>
              ) : null}

              {(otherUser.dealbreakers?.length ?? 0) > 0 ? (
                <DetailSection title="Dealbreakers">
                  <View style={styles.tags}>
                    {otherUser.dealbreakers!.map((d, i) => {
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
                </DetailSection>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyDetailsCard}>
              <Text style={styles.emptyPhotosEmoji} allowFontScaling={false}>✨</Text>
              <Text style={styles.emptyHint}>They haven&apos;t added written profile sections yet.</Text>
            </View>
          )}

          {(onReport || onBlock) && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4 }}>
              {onBlock ? (
                <TouchableOpacity
                  onPress={onBlock}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 22,
                    borderRadius: 14,
                    backgroundColor: '#f1f5f9',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#334155' }}>🚫 Block</Text>
                </TouchableOpacity>
              ) : null}
              {onReport ? (
                <TouchableOpacity
                  onPress={onReport}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 22,
                    borderRadius: 14,
                    backgroundColor: '#fef2f2',
                    borderWidth: 1,
                    borderColor: '#fecaca',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#b91c1c' }}>🚩 Report</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );

  if (!visible) return null;

  if (noModal) {
    return <View style={{ flex: 1 }}>{content}</View>;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const heroAboutStyles = StyleSheet.create({
  outer: {
    width: '100%',
    marginTop: Platform.OS === 'android' ? 10 : 14,
    alignSelf: 'stretch',
  },
  rim: {
    borderRadius: 18,
    padding: 1.5,
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#4c1d95',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
    }),
  },
  inner: {
    borderRadius: 16.5,
    paddingVertical: Platform.OS === 'android' ? 10 : 14,
    paddingHorizontal: Platform.OS === 'android' ? 12 : 14,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Platform.OS === 'android' ? 6 : 10,
  },
  iconWrap: {
    width: Platform.OS === 'android' ? 32 : 38,
    height: Platform.OS === 'android' ? 32 : 38,
    borderRadius: Platform.OS === 'android' ? 16 : 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1e1b4b',
    letterSpacing: -0.2,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: '#334155',
  },
  taglineAfterAbout: {
    marginTop: Platform.OS === 'android' ? 10 : 14,
  },
});
