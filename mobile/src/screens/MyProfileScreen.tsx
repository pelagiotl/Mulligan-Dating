import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Vibration,
  Modal,
  Dimensions,
  FlatList,
  InteractionManager,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect, useIsFocused, CommonActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';
import {
  MediaLibraryPermissionDenied,
  ImagePickerBusyError,
  pickImagesFromLibrary,
  prefetchMediaLibraryPermission,
  resetLibraryPickerMutex,
} from '../utils/pickImagesFromLibrary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, PanGestureHandler, TapGestureHandler, State } from 'react-native-gesture-handler';
import { api } from '../utils/api';
import { uploadPhotoUris } from '../utils/batchPhotoUpload';
import { compactCityState, handleLocationChange, hasCityAndState } from '../utils/locationUtils';
import { checkLocationInServiceArea } from '../utils/validateServiceAreaLocation';
import { displayProfileGender } from '../utils/createProfileProgress';
import { detectUserLocation } from '../utils/detectUserLocation';
import { getPhotoUrl } from '../utils/photoUrl';
import OptimizedImage from '../components/OptimizedImage';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import LegalFooter from '../components/LegalFooter';
import ProfileEditableCardBorder from '../components/ProfileEditableCardBorder';
import ProfileCardAnimatedEmoji from '../components/ProfileCardAnimatedEmoji';
import ConnectionQualityScore from '../components/ConnectionQualityScore';
import {
  clampMaxDistanceMiles,
  formatMaxDistanceLabel,
  MAX_DISTANCE_SELECT_OPTIONS,
} from '../constants/matchingDistance';
import MyProfilePreviewModal, {
  formatPreferredGendersLabel,
  parseProfileValues,
  type MyProfilePreviewData,
} from '../components/MyProfilePreviewModal';
import IntroVideoPreview from '../components/IntroVideoPreview';
import IntroVideoRecordModal from '../components/IntroVideoRecordModal';
import { resolveIntroVideoUrl } from '../utils/introVideo';
import { hasIntroVideo } from '../utils/connectSetup';
import BetterMatchesCompleteCelebration from '../components/BetterMatchesCompleteCelebration';
import { markProfileEnhancementCelebrationShown } from '../utils/profileEnhancementChecklist';
import { maybeShowProfileEnhancementCelebration } from '../utils/maybeShowProfileEnhancementCelebration';
import { androidShellBackdropColors } from '../utils/androidConnectShellChrome';
import { profilePageColors } from '../lib/connectShellTheme';
import {
  LOOKING_FOR_OPTIONS,
  LOOKING_FOR_META,
  isCanonicalLookingFor,
  DEALBREAKER_EMOJI,
  DEALBREAKER_SUGGESTIONS,
  DEALBREAKER_CANONICAL_SET,
  canonicalDealbreakerLabel,
  PARTNER_QUALITY_EMOJI,
  PARTNER_QUALITY_OPTIONS,
  getInterestEmoji,
  isCanonicalPartnerQuality,
  LIFESTYLE_FIELD_LABEL,
  LIFESTYLE_FIELD_EMOJI,
  LIFESTYLE_FIELD_OPTIONS,
  lifestyleFormFromApi,
  lifestyleOptionParts,
  lifestylePickerItemLabel,
  type LifestyleFieldKey,
  type LifestyleForm,
} from '../constants/profileMySections';

// Animated Emoji Component for section icons
function AnimatedEmoji({ emoji, delay = 0 }: { emoji: string; delay?: number }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle pulse animation (subtle and alive)
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation animation
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <Animated.Text
      style={{
        fontSize: 24,
        transform: [{ scale: scaleAnim }, { rotate }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

interface ProfileData {
  profile: {
    id: string;
    display_name: string;
    age: number;
    gender: string;
    location: string | null;
    bio: string | null;
    photo_url: string | null;
    intro_video_url?: string | null;
    looking_for: string | null;
  };
  interests: Array<{ name: string; category: string | null }>;
  preferences: {
    min_age: number;
    max_age: number | null;
    preferred_genders: string | null;
    max_distance: number | null;
    relationship_type: string | null;
    values?: string | null;
  } | null;
  dealbreakers: Array<{ description: string; category: string | null }>;
  partnerQualities: Array<{ quality: string; importance: number }>;
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
}

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

// Values sent to API (matching uses profile.gender: "Man" | "Woman" | "Non-binary" etc.)
const PREFERRED_GENDERS_VALUES = ['Man', 'Woman', 'Everyone'];
const PREFERRED_GENDERS_LABELS: Record<string, string> = { Man: 'Men', Woman: 'Women', Everyone: 'Everyone' };
const PREFERRED_GENDERS_EMOJI: Record<string, string> = { Man: '👨', Woman: '👩', Everyone: '🌍' };
function preferredGenderLabel(value: string) { return PREFERRED_GENDERS_LABELS[value] ?? value; }

const MAX_DISTANCE_META: Record<string, { tag: string }> = {
  '10': { tag: 'Around town' },
  '25': { tag: 'City & nearby' },
  '50': { tag: 'Metro area' },
  '100': { tag: 'Regional max' },
};

const LIFESTYLE_FIELD_GRADIENTS: Record<LifestyleFieldKey, readonly [string, string, string]> = {
  smoking: ['#6ee7b7', '#34d399', '#10b981'],
  drinking: ['#93c5fd', '#60a5fa', '#3b82f6'],
  children: ['#fcd34d', '#fbbf24', '#f59e0b'],
  pets: ['#c4b5fd', '#a78bfa', '#8b5cf6'],
  religion: ['#f9a8d4', '#f472b6', '#ec4899'],
  political: ['#a5b4fc', '#818cf8', '#6366f1'],
  workLifeBalance: ['#67e8f9', '#22d3ee', '#06b6d4'],
  worksOut: ['#86efac', '#4ade80', '#22c55e'],
};

const GENDER_OPTIONS = ['Man', 'Woman', 'Other'] as const;
const GENDER_OPTION_META: Record<(typeof GENDER_OPTIONS)[number], { emoji: string; sub: string }> = {
  Man: { emoji: '👨', sub: 'I am a man' },
  Woman: { emoji: '👩', sub: 'I am a woman' },
  Other: { emoji: '✨', sub: 'Another identity' },
};
const AGE_QUICK_PICKS = [18, 21, 24, 25, 28, 30, 32, 35, 38, 40, 45, 50, 55, 60];

export default function MyProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { refreshProfile, user, loading: authLoading, connectSetupComplete } = useAuth();
  const [showEnhancementCelebration, setShowEnhancementCelebration] = useState(false);
  const { mode: connectShellMode } = useConnectShellTheme();
  const shellBackdropColors = useMemo(
    () => androidShellBackdropColors(connectShellMode),
    [connectShellMode]
  );
  const profileColors = useMemo(
    () => profilePageColors(connectShellMode),
    [connectShellMode]
  );
  const profileUi = useMemo(
    () => ({
      headerGradient: { shadowColor: profileColors.headerShadowColor },
      headerGradientInner: { borderColor: profileColors.headerBorder },
      name: {
        color: profileColors.nameColor,
        textShadowColor: profileColors.nameTextShadow,
      },
      section: { backgroundColor: profileColors.sectionBg },
      sectionTitle: {
        color: profileColors.sectionTitleColor,
        textShadowColor: profileColors.sectionTitleTextShadow,
      },
      sectionEditLink: { color: profileColors.sectionEditLink },
      sectionEmptyHint: { color: profileColors.sectionEmptyHint },
      bioGradient: { borderColor: profileColors.bioBorder },
      bioTitle: { color: profileColors.bioTitle },
      bioAccentLine: { backgroundColor: profileColors.bioAccent },
      bio: { color: profileColors.bioText },
      bioPlaceholder: { color: profileColors.bioPlaceholder },
      avatar: {
        borderColor: profileColors.avatarBorder,
        shadowColor: profileColors.avatarShadow,
      },
      avatarPlaceholder: {
        borderColor: profileColors.avatarBorder,
        shadowColor: profileColors.avatarShadow,
      },
      avatarOrb: {
        backgroundColor: profileColors.avatarOrb,
        shadowColor: profileColors.avatarShadow,
      },
      shimmerOverlay: { backgroundColor: profileColors.shimmerOverlay },
      basicsSectionLabel: { color: profileColors.sectionEmptyHint },
      basicsSectionLine: { backgroundColor: profileColors.bioBorder },
    }),
    [profileColors]
  );
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingSlotIndices, setUploadingSlotIndices] = useState<number[]>([]);
  const [openingPhotoPicker, setOpeningPhotoPicker] = useState(false);
  const [photoPickerTargetSlot, setPhotoPickerTargetSlot] = useState<number | null>(null);
  const pickingPhotosRef = useRef(false);
  const uploadingPhotos = uploadingSlotIndices.length > 0 || openingPhotoPicker;
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [showIntroVideoModal, setShowIntroVideoModal] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photoGalleryScrollRef = useRef<FlatList<Photo>>(null);
  const photoGalleryProgrammaticScrollRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const photosSectionYRef = useRef<number>(0);
  const lookingForSectionYRef = useRef<number>(0);
  const profileSectionYRef = useRef<
    Partial<Record<'interests' | 'lifestyle' | 'dealbreakers', number>>
  >({});
  const profileCheckDoneRef = useRef(false);
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const dragAnimatedValue = useRef(new Animated.ValueXY()).current;
  // Location / Max distance / Bio edit modals and state
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [showPreferredGendersModal, setShowPreferredGendersModal] = useState(false);
  const [editAge, setEditAge] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMaxDistance, setEditMaxDistance] = useState(50);
  const [editPreferredGenders, setEditPreferredGenders] = useState<string[]>([]);
  const [showBioModal, setShowBioModal] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [showLookingForModal, setShowLookingForModal] = useState(false);
  const [editLookingFor, setEditLookingFor] = useState('');
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [showDealbreakersModal, setShowDealbreakersModal] = useState(false);
  const [editDealbreakers, setEditDealbreakers] = useState<string[]>([]);
  const [showQualitiesModal, setShowQualitiesModal] = useState(false);
  const [editQualities, setEditQualities] = useState<string[]>([]);
  const [showLifestyleModal, setShowLifestyleModal] = useState(false);
  const [editLifestyle, setEditLifestyle] = useState<LifestyleForm>(() => lifestyleFormFromApi(null));
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [updatingField, setUpdatingField] = useState(false);
  const [reordering, setReordering] = useState(false);
  // Bump when photos change so the header avatar reloads (avoids stale image cache after upload/reorder/delete)
  const [avatarVersion, setAvatarVersion] = useState(0);
  // Cached primary photo URL so avatar can show immediately when opening Profile tab (before fetchPhotos returns)
  const [cachedPrimaryPhotoUrl, setCachedPrimaryPhotoUrl] = useState<string | null>(null);
  const CACHED_PRIMARY_PHOTO_KEY = 'profile_primary_photo_url';

  /** Navigate to CreateProfile on the root stack. Defer so we don't throw during touch (avoids Error Boundary). */
  const navigateToCreateProfile = useCallback((params?: { startFromBeginning?: boolean; initialStep?: number }) => {
    const run = () => {
      try {
        if (!navigationRef.current?.isReady()) {
          Alert.alert('Error', 'Could not open edit profile. Please try again.');
          return;
        }
        navigationRef.current.dispatch(
          CommonActions.navigate({
            name: 'CreateProfile',
            params: params ?? undefined,
          })
        );
      } catch (e) {
        console.error('Navigate to CreateProfile failed:', e);
        Alert.alert('Error', 'Could not open edit profile. Please try again.');
      }
    };
    setTimeout(run, 0);
  }, []);

  // Animation for header elements
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.95)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  
  // Animations for stat cards
  // Animations for sections (scroll-based)
  const sectionAnims = useRef<Animated.Value[]>([]).current;
  const sectionFallbackAnim = useRef(new Animated.Value(1)).current; // Single stable fallback to avoid creating new Animated values in render
  
  // Animations for avatar ring - make it alive and immersive
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.2)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  
  // Additional effects for extra coolness
  const shimmerPosition = useRef(new Animated.Value(0)).current;
  const avatarBreath = useRef(new Animated.Value(1)).current;
  const sparkle1Anim = useRef(new Animated.Value(0)).current;
  const sparkle2Anim = useRef(new Animated.Value(0)).current;
  const sparkle3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (data && isFocused) {
      // Show header and avatar at full size immediately (no spring delay)
      headerFade.setValue(1);
      headerScale.setValue(1);
      avatarScale.setValue(1);
      
      // Start ring animations only while Profile tab is focused (avoids background load on other tabs)
      const ring1Pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ring1Scale, {
              toValue: 1.15,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(ring1Opacity, {
              toValue: 0.8,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ring1Scale, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(ring1Opacity, {
              toValue: 0.6,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      
      const ring2Pulse = Animated.loop(
        Animated.sequence([
          Animated.delay(400),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 1.2,
              duration: 2200,
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0.6,
              duration: 2200,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ring2Scale, {
              toValue: 1,
              duration: 2200,
              useNativeDriver: true,
            }),
            Animated.timing(ring2Opacity, {
              toValue: 0.4,
              duration: 2200,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      
      const ring3Pulse = Animated.loop(
        Animated.sequence([
          Animated.delay(800),
          Animated.parallel([
            Animated.timing(ring3Scale, {
              toValue: 1.25,
              duration: 2400,
              useNativeDriver: true,
            }),
            Animated.timing(ring3Opacity, {
              toValue: 0.4,
              duration: 2400,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ring3Scale, {
              toValue: 1,
              duration: 2400,
              useNativeDriver: true,
            }),
            Animated.timing(ring3Opacity, {
              toValue: 0.2,
              duration: 2400,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      
      // Continuous rotation animation
      const rotation = Animated.loop(
        Animated.timing(ringRotation, {
          toValue: 1,
          duration: 20000, // Slow 20-second rotation
          useNativeDriver: true,
        })
      );
      
      // Shimmer effect - sweeps across rings
      const shimmer = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerPosition, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerPosition, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      
      // Subtle breathing effect on avatar
      const breathing = Animated.loop(
        Animated.sequence([
          Animated.timing(avatarBreath, {
            toValue: 1.02,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(avatarBreath, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
        ])
      );
      
      // Floating sparkles animation
      const sparkle1Float = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(sparkle1Anim, {
              toValue: 1,
              duration: 3000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(sparkle1Anim, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      );
      
      const sparkle2Float = Animated.loop(
        Animated.sequence([
          Animated.delay(1000),
          Animated.parallel([
            Animated.timing(sparkle2Anim, {
              toValue: 1,
              duration: 3500,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(sparkle2Anim, {
            toValue: 0,
            duration: 3500,
            useNativeDriver: true,
          }),
        ])
      );
      
      const sparkle3Float = Animated.loop(
        Animated.sequence([
          Animated.delay(2000),
          Animated.parallel([
            Animated.timing(sparkle3Anim, {
              toValue: 1,
              duration: 4000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(sparkle3Anim, {
            toValue: 0,
            duration: 4000,
            useNativeDriver: true,
          }),
        ])
      );
      
      ring1Pulse.start();
      ring2Pulse.start();
      ring3Pulse.start();
      rotation.start();
      shimmer.start();
      breathing.start();
      sparkle1Float.start();
      sparkle2Float.start();
      sparkle3Float.start();
      
      return () => {
        ring1Pulse.stop();
        ring2Pulse.stop();
        ring3Pulse.stop();
        rotation.stop();
        shimmer.stop();
        breathing.stop();
        sparkle1Float.stop();
        sparkle2Float.stop();
        sparkle3Float.stop();
      };
    } else if (data && !isFocused) {
      headerFade.setValue(1);
      headerScale.setValue(1);
      avatarScale.setValue(1);
      ring1Scale.setValue(1);
      ring1Opacity.setValue(0.6);
      ring2Scale.setValue(1);
      ring2Opacity.setValue(0.4);
      ring3Scale.setValue(1);
      ring3Opacity.setValue(0.2);
      ringRotation.setValue(0);
      shimmerPosition.setValue(0);
      avatarBreath.setValue(1);
      sparkle1Anim.setValue(0);
      sparkle2Anim.setValue(0);
      sparkle3Anim.setValue(0);
    } else if ((cachedPrimaryPhotoUrl || photos.length > 0) && isFocused) {
      // Show header/avatar immediately from cache or photos while profile loads
      headerFade.setValue(1);
      headerScale.setValue(1);
      avatarScale.setValue(1);
    } else {
      // Reset animations when data is cleared and no cached photo
      headerFade.setValue(0);
      headerScale.setValue(0.95);
      avatarScale.setValue(0);
      ring1Scale.setValue(1);
      ring1Opacity.setValue(0.6);
      ring2Scale.setValue(1);
      ring2Opacity.setValue(0.4);
      ring3Scale.setValue(1);
      ring3Opacity.setValue(0.2);
      ringRotation.setValue(0);
      shimmerPosition.setValue(0);
      avatarBreath.setValue(1);
      sparkle1Anim.setValue(0);
      sparkle2Anim.setValue(0);
      sparkle3Anim.setValue(0);
    }
  }, [data, cachedPrimaryPhotoUrl, photos.length, isFocused]);

  useEffect(() => {
    if (user) {
      profileCheckDoneRef.current = false;
      fetchProfile();
      fetchPhotos();
    } else {
      profileCheckDoneRef.current = false;
      if (!authLoading) setLoading(false);
    }
  }, [user, authLoading]);

  // Refetch when Profile tab is focused — defer so tab switch paints immediately, then refetch in background
  useFocusEffect(
    React.useCallback(() => {
      prefetchMediaLibraryPermission();
      const task = InteractionManager.runAfterInteractions(() => {
        if (user) {
          fetchProfile();
          fetchPhotos();
        }
      });
      return () => task.cancel();
    }, [user])
  );

  // Scroll to profile section when opened from Connect enhancement checklist
  useEffect(() => {
    const params = (route.params ?? {}) as {
      scrollToPhotos?: boolean;
      profileSection?: 'photos' | 'interests' | 'looking-for' | 'lifestyle' | 'dealbreakers';
    };
    const section =
      params.profileSection ?? (params.scrollToPhotos ? ('photos' as const) : undefined);
    if (!section || loading) return;

    const scrollToProfileSection = (attempt = 0) => {
      const y =
        section === 'photos'
          ? photosSectionYRef.current
          : section === 'looking-for'
            ? lookingForSectionYRef.current
            : profileSectionYRef.current[section];
      if (y != null && y > 0 && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
        if (section === 'looking-for' && data?.profile) {
          const cur = data.profile.looking_for?.trim() ?? '';
          setEditLookingFor(cur && isCanonicalLookingFor(cur) ? cur : '');
          setTimeout(() => setShowLookingForModal(true), 320);
        }
        (navigation as any).setParams({ scrollToPhotos: undefined, profileSection: undefined });
      } else if (attempt < 10) {
        setTimeout(() => scrollToProfileSection(attempt + 1), 150);
      }
    };
    const t = setTimeout(() => scrollToProfileSection(0), 200);
    return () => clearTimeout(t);
  }, [route.params, navigation, loading, data?.profile?.looking_for]);
  
  // Initialize and animate sections
  useEffect(() => {
    if (!data) return;
    
    const sectionCount = 6;
    for (let i = 0; i < sectionCount; i++) {
      if (!sectionAnims[i]) {
        sectionAnims[i] = new Animated.Value(0);
      }
    }

    // Staggered animation for all sections
    Animated.stagger(
      120,
      sectionAnims.slice(0, sectionCount).map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [data]);
  
  // Load cached primary photo URL on mount so avatar can show immediately when opening Profile tab
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CACHED_PRIMARY_PHOTO_KEY).then((url) => {
      if (!cancelled && url) setCachedPrimaryPhotoUrl(url);
    });
    return () => { cancelled = true; };
  }, []);

  const fetchPhotos = async () => {
    if (!user) return;
    try {
      // Skip cache so photos uploaded in Create Profile appear immediately when opening Profile tab
      const data = await api.get<{ photos: Photo[] }>('/photos/me', false);
      const nextPhotos = data.photos || [];
      setPhotos(nextPhotos);
      // Force header avatar to reload when photo list changes (e.g. after upload)
      setAvatarVersion((v) => v + 1);
      // Persist primary photo URL so next time we open Profile tab the avatar can show immediately
      const primary = nextPhotos.find((p) => p.isPrimary) || nextPhotos[0];
      const primaryUrl = primary ? getPhotoUrl(primary.url) : null;
      if (primaryUrl) {
        AsyncStorage.setItem(CACHED_PRIMARY_PHOTO_KEY, primaryUrl);
        setCachedPrimaryPhotoUrl(primaryUrl);
      } else {
        AsyncStorage.removeItem(CACHED_PRIMARY_PHOTO_KEY);
        setCachedPrimaryPhotoUrl(null);
      }
    } catch (err) {
      // Only log error if it's not an auth error or rate limit (429)
      const isAuth = err && typeof err === 'object' && 'message' in err && err.message === 'Authentication required';
      const is429 = err && typeof err === 'object' && 'status' in err && (err as any).status === 429;
      if (err && typeof err === 'object' && 'message' in err && !isAuth && !is429) {
        console.error('Failed to fetch photos:', err);
      }
      setPhotos([]);
    }
  };

  const fetchProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // Only show full-screen loading on initial load (no data yet)
      // Keeps current profile visible when refetching on tab focus
      setLoading((prev) => (data == null ? true : prev));
      const profileData = await api.get<ProfileData>('/profile', false);
      setData(profileData);
      setError('');
    } catch (err: any) {
      if (err?.status === 404) {
        setError('');
        setData(null);
      } else if (err?.message === 'Authentication required') {
        // User not authenticated, don't show error
        setError('');
        setData(null);
      } else {
        const errorMessage = err?.message || 'Failed to load profile';
        setError(errorMessage);
      }
    } finally {
      profileCheckDoneRef.current = true;
      setLoading(false);
    }
  };
  
  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const detected = await detectUserLocation();
      const compact = compactCityState(detected);
      const check = await checkLocationInServiceArea(compact);
      if (!check.valid) {
        Alert.alert('Outside service area', check.message ?? 'Your location must be within 100 miles of Southern Oregon.');
        return;
      }
      setEditLocation(compact);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not detect location.';
      Alert.alert('Location Error', message);
    } finally {
      setDetectingLocation(false);
    }
  };

  const saveDisplayName = async () => {
    if (!data?.profile) return;
    const name = editDisplayName.trim();
    if (name.length < 2) {
      Alert.alert('Name too short', 'Please enter at least 2 characters.');
      return;
    }
    if (name.length > 50) {
      Alert.alert('Name too long', 'Please keep your name under 50 characters.');
      return;
    }
    setUpdatingField(true);
    try {
      await api.put('/profile/basics', { displayName: name });
      setData((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, display_name: name } } : null
      );
      setShowNameModal(false);
      api.clearCache('/profile');
      api.clearCache('/auth/me');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update name.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveAge = async () => {
    if (!data?.profile) return;
    const ageNum = parseInt(editAge.trim(), 10);
    if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
      Alert.alert('Invalid age', 'Enter an age between 18 and 120.');
      return;
    }
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: ageNum,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: data.profile.bio ?? null,
        lookingFor: data.profile.looking_for ?? null,
      });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, age: ageNum } } : null));
      setShowAgeModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update age.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveGender = async () => {
    if (!data?.profile) return;
    const gender = editGender.trim();
    if (!GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
      Alert.alert('Choose gender', 'Please select Man, Woman, or Other.');
      return;
    }
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender,
        location: data.profile.location ?? null,
        bio: data.profile.bio ?? null,
        lookingFor: data.profile.looking_for ?? null,
      });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, gender } } : null));
      setShowGenderModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update gender.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLocation = async () => {
    if (!data?.profile) return;
    const loc = editLocation.trim() ? compactCityState(editLocation.trim()) : null;
    if (loc && !hasCityAndState(loc)) {
      Alert.alert('Location required', 'Please enter both city and state (e.g. Medford, Oregon).');
      return;
    }
    if (loc) {
      const check = await checkLocationInServiceArea(loc);
      if (!check.valid) {
        Alert.alert('Outside service area', check.message ?? 'Location must be within 100 miles of Southern Oregon.');
        return;
      }
    }
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: loc,
        bio: data.profile.bio ?? null,
        lookingFor: data.profile.looking_for ?? null,
      });
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, location: loc } } : null);
      setShowLocationModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update location.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveMaxDistance = async () => {
    if (!data?.profile) return;
    setUpdatingField(true);
    try {
      const prefs = data.preferences;
      let preferredGenders: string[] | null = null;
      if (prefs?.preferred_genders) {
        try {
          preferredGenders = JSON.parse(prefs.preferred_genders) as string[];
        } catch {
          preferredGenders = null;
        }
      }
      const savedDistance = clampMaxDistanceMiles(editMaxDistance);
      await api.put('/profile/preferences', {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: preferredGenders ?? null,
        maxDistance: savedDistance,
      });
      setData((prev) => prev && prev.preferences
        ? { ...prev, preferences: { ...prev.preferences, max_distance: savedDistance } }
        : prev);
      setShowDistanceModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update max distance.');
    } finally {
      setUpdatingField(false);
    }
  };

  const savePreferredGenders = async () => {
    if (!data?.profile) return;
    setUpdatingField(true);
    try {
      const prefs = data.preferences;
      const cleaned = editPreferredGenders.filter((g) => g === 'Man' || g === 'Woman');
      const payload =
        editPreferredGenders.includes('Everyone') || editPreferredGenders.length === 0 || cleaned.length === 0
          ? null
          : cleaned;
      await api.put('/profile/preferences', {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: payload,
        maxDistance: prefs?.max_distance ?? null,
      });
      setData((prev) => prev && prev.preferences
        ? { ...prev, preferences: { ...prev.preferences, preferred_genders: payload ? JSON.stringify(payload) : null } }
        : prev);
      setShowPreferredGendersModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update preferred matches.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveBio = async () => {
    if (!data?.profile) return;
    const val = editBio.trim() || null;
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: val,
        lookingFor: data.profile.looking_for ?? null,
      });
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, bio: val } } : null);
      setShowBioModal(false);
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update About Me.');
    } finally {
      setUpdatingField(false);
    }
  };

  const checkEnhancementCelebration = useCallback(async () => {
    if (!connectSetupComplete) return;
    await maybeShowProfileEnhancementCelebration(
      photos.length,
      () => setShowEnhancementCelebration(true),
      () => setShowEnhancementCelebration(false)
    );
  }, [connectSetupComplete, photos.length]);

  const refreshProfileData = async () => {
    const next = await api.get<ProfileData>('/profile', false);
    setData(next);
    await checkEnhancementCelebration();
  };

  const handleEnhancementCelebrationClose = useCallback(() => {
    void markProfileEnhancementCelebrationShown();
    setShowEnhancementCelebration(false);
    if (navigationRef.current?.isReady()) {
      navigationRef.current.dispatch(
        CommonActions.navigate({
          name: 'MainTabs',
          params: { screen: 'Browse', params: { resetToLanding: true } },
        })
      );
    } else {
      navigation.navigate('MainTabs' as never, {
        screen: 'Browse',
        params: { resetToLanding: true },
      } as never);
    }
  }, [navigation]);

  const saveLookingFor = async () => {
    if (!data?.profile) return;
    const raw = editLookingFor.trim();
    const lookingFor = raw === '' ? null : raw;
    if (lookingFor !== null && !isCanonicalLookingFor(lookingFor)) {
      Alert.alert('Invalid choice', 'Please pick one of the listed options.');
      return;
    }
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: data.profile.bio ?? null,
        lookingFor,
      });
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, looking_for: lookingFor } } : null));
      setShowLookingForModal(false);
      api.clearCache('/profile');
      await refreshProfile?.();
      await checkEnhancementCelebration();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update.');
    } finally {
      setUpdatingField(false);
    }
  };

  const toggleInterestEdit = (name: string) => {
    setEditInterests((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  };

  const toggleDealbreakerEdit = (text: string) => {
    if (!DEALBREAKER_CANONICAL_SET.has(text)) return;
    setEditDealbreakers((prev) =>
      prev.includes(text) ? prev.filter((x) => x !== text) : [...prev, text]
    );
  };

  const toggleQualityEdit = (q: string) => {
    setEditQualities((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  };

  const saveInterests = async () => {
    if (editInterests.length < 3) {
      Alert.alert('Pick more interests', 'Please select at least 3 interests.');
      return;
    }
    setUpdatingField(true);
    try {
      await api.put('/profile/interests', {
        interests: editInterests.map((name) => ({ name })),
      });
      await refreshProfileData();
      setShowInterestsModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update interests.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveDealbreakers = async () => {
    setUpdatingField(true);
    try {
      await api.put('/profile/dealbreakers', {
        dealbreakers: editDealbreakers.filter((d) => DEALBREAKER_CANONICAL_SET.has(d)),
      });
      await refreshProfileData();
      setShowDealbreakersModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update dealbreakers.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveQualities = async () => {
    setUpdatingField(true);
    try {
      await api.put('/profile/partner-qualities', {
        qualities: editQualities.map((quality) => ({ quality, importance: 5 })),
      });
      await refreshProfileData();
      setShowQualitiesModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update what you\'re looking for.');
    } finally {
      setUpdatingField(false);
    }
  };

  const saveLifestyle = async () => {
    setUpdatingField(true);
    try {
      await api.put('/profile/lifestyle', {
        smoking: editLifestyle.smoking || null,
        drinking: editLifestyle.drinking || null,
        children: editLifestyle.children || null,
        pets: editLifestyle.pets || null,
        religion: editLifestyle.religion || null,
        political: editLifestyle.political || null,
        workLifeBalance: editLifestyle.workLifeBalance || null,
        worksOut: editLifestyle.worksOut || null,
      });
      await refreshProfileData();
      setShowLifestyleModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update lifestyle.');
    } finally {
      setUpdatingField(false);
    }
  };

  const handlePickImage = async (slotIndex?: number) => {
    if (pickingPhotosRef.current || openingPhotoPicker || uploadingSlotIndices.length > 0) {
      return;
    }
    if (photos.length >= 6) {
      Alert.alert('Limit reached', 'You can only upload up to 6 photos');
      return;
    }

    let pickerSlot = 0;
    if (
      slotIndex !== undefined &&
      slotIndex >= 0 &&
      slotIndex < 6 &&
      !photos[slotIndex]
    ) {
      pickerSlot = slotIndex;
    } else {
      for (let i = 0; i < 6; i++) {
        if (!photos[i]) {
          pickerSlot = i;
          break;
        }
      }
    }

    pickingPhotosRef.current = true;
    setPhotoPickerTargetSlot(pickerSlot);
    setOpeningPhotoPicker(true);
    try {
      const remaining = 6 - photos.length;
      const result = await pickImagesFromLibrary({
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) {
            const sizeMB = (asset.fileSize / (1024 * 1024)).toFixed(2);
            Alert.alert(
              'Image Too Large',
              `One selected image is ${sizeMB} MB. Maximum size is 50 MB per photo.`,
              [{ text: 'OK' }],
            );
            return;
          }
        }
        const uris = result.assets.map((a) => a.uri).filter(Boolean) as string[];
        await uploadPhotos(uris, pickerSlot);
      }
    } catch (err: unknown) {
      if (err instanceof ImagePickerBusyError) {
        resetLibraryPickerMutex();
        Alert.alert(
          'Photo library busy',
          'Please wait a moment and try again.',
          [{ text: 'OK' }],
        );
        return;
      }
      if (err instanceof MediaLibraryPermissionDenied) {
        Alert.alert(
          'Permission needed',
          'Please grant photo library access to upload photos. You can enable this in Settings > Privacy & Security > Photos.',
        );
        return;
      }
      console.error('Error picking image:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to pick image';
      Alert.alert(
        'Error',
        `${errorMessage}\n\nIf the gallery did not open, try again in a moment.`,
      );
    } finally {
      pickingPhotosRef.current = false;
      setOpeningPhotoPicker(false);
      setPhotoPickerTargetSlot(null);
    }
  };

  const uploadPhotos = async (uris: string[], tappedIndex?: number) => {
    if (uris.length === 0) return;
    const targetSlots: number[] = [];
    if (tappedIndex !== undefined && tappedIndex >= 0 && tappedIndex < 6 && !photos[tappedIndex]) {
      targetSlots.push(tappedIndex);
    }
    for (let i = 0; i < 6 && targetSlots.length < uris.length; i++) {
      if (photos[i]) continue;
      if (!targetSlots.includes(i)) targetSlots.push(i);
    }
    try {
      setUploadingSlotIndices(targetSlots.slice(0, uris.length));

      await uploadPhotoUris(uris);

      api.clearCache('/photos/me');
      await Promise.all([fetchPhotos(), fetchProfile(), refreshProfile?.() ?? Promise.resolve()]);
      await checkEnhancementCelebration();
    } catch (err: any) {
      console.error('Upload error:', err);
      Alert.alert('Error', err?.message || 'Failed to upload photos');
    } finally {
      setUploadingSlotIndices([]);
    }
  };

  // Scroll to the correct photo when gallery opens
  useEffect(() => {
    if (showPhotoGallery && photos.length > 0 && photoGalleryScrollRef.current) {
      const scrollToIndex = () => {
        try {
          const index = Math.min(currentPhotoIndex, photos.length - 1);
          photoGalleryScrollRef.current?.scrollToIndex({ 
            index, 
            animated: false 
          });
        } catch (error) {
          // Fallback to scrollToOffset if scrollToIndex fails
          const index = Math.min(currentPhotoIndex, photos.length - 1);
          photoGalleryScrollRef.current?.scrollToOffset({ 
            offset: Dimensions.get('window').width * index, 
            animated: false 
          });
        }
      };
      setTimeout(scrollToIndex, 100);
    }
  }, [showPhotoGallery, currentPhotoIndex, photos.length]);

  const handleReorderPhotos = async (newOrder: string[]) => {
    try {
      setReordering(true);
      await api.put('/photos/reorder', { photoIds: newOrder });
      await Promise.all([fetchPhotos(), fetchProfile()]);
      // Haptic feedback
      if (Platform.OS === 'ios') {
        Vibration.vibrate([0, 50]);
      } else {
        Vibration.vibrate(50);
      }
    } catch (err: any) {
      console.error('Failed to reorder photos:', err);
      Alert.alert('Error', err?.message || 'Failed to reorder photos');
    } finally {
      setReordering(false);
    }
  };

  const onLongPress = (photoId: string, index: number) => {
    setDraggingPhotoId(photoId);
    setDraggingIndex(index);
    // Haptic feedback
    if (Platform.OS === 'ios') {
      Vibration.vibrate([0, 100]);
    } else {
      Vibration.vibrate(100);
    }
  };

  const onDragEnd = (event: any) => {
    if (draggingPhotoId === null || draggingIndex === null) {
      setDraggingPhotoId(null);
      setDraggingIndex(null);
      dragAnimatedValue.setValue({ x: 0, y: 0 });
      return;
    }

    const { translationX, translationY } = event.nativeEvent;
    
    // Calculate drop position based on translation
    const gridWidth = Dimensions.get('window').width - 40; // Account for margins
    const photosPerRow = 3;
    const photoWidth = (gridWidth - 16) / photosPerRow; // Account for gaps
    const photoHeight = photoWidth;
    
    // Calculate which grid position based on translation
    const colOffset = Math.round(translationX / photoWidth);
    const rowOffset = Math.round(translationY / photoHeight);
    const currentCol = draggingIndex % photosPerRow;
    const currentRow = Math.floor(draggingIndex / photosPerRow);
    const newCol = Math.max(0, Math.min(photosPerRow - 1, currentCol + colOffset));
    const newRow = Math.max(0, Math.min(Math.ceil(photos.length / photosPerRow) - 1, currentRow + rowOffset));
    const newIndex = Math.min(Math.max(0, newRow * photosPerRow + newCol), photos.length - 1);

    if (newIndex !== draggingIndex && newIndex >= 0 && newIndex < photos.length) {
      // Reorder photos
      const newOrder = [...photos];
      const [draggedPhoto] = newOrder.splice(draggingIndex, 1);
      newOrder.splice(newIndex, 0, draggedPhoto);
      // Optimistic update: first slot is primary so badge and header avatar update immediately
      setPhotos(newOrder.map((p, i) => ({ ...p, isPrimary: i === 0 })));
      setAvatarVersion((v) => v + 1);
      const photoIds = newOrder.map(p => p.id);
      handleReorderPhotos(photoIds);
    }

    // Reset drag state
    setDraggingPhotoId(null);
    setDraggingIndex(null);
    dragAnimatedValue.setValue({ x: 0, y: 0 });
  };

  const handleDeletePhoto = async (photoId: string) => {
    const deletedPhoto = photos.find((p) => p.id === photoId);
    const wasInGallery = showPhotoGallery;
    const wasCurrentIndex = currentPhotoIndex;
    const previousLength = photos.length;

    // Optimistic update: remove photo from UI immediately so header avatar updates
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setAvatarVersion((v) => v + 1);
    if (wasInGallery) {
      if (previousLength <= 1) {
        setShowPhotoGallery(false);
      } else {
        const newIndex = Math.min(wasCurrentIndex, previousLength - 2);
        setCurrentPhotoIndex(newIndex >= 0 ? newIndex : 0);
      }
    } else {
      setShowPhotoGallery(false);
    }

    try {
      await api.delete(`/photos/${photoId}`);
      // Refetch photos so list stays in sync (cache for /photos/me is invalidated by delete)
      await fetchPhotos();
      await fetchProfile();
      await refreshProfile();
    } catch (err: any) {
      // Rollback on failure
      if (deletedPhoto) {
        setPhotos((prev) => [...prev, deletedPhoto].sort((a, b) => a.displayOrder - b.displayOrder));
      }
      Alert.alert('Error', err?.message || 'Failed to delete photo');
    }
  };

  const profilePreviewData = useMemo((): MyProfilePreviewData | null => {
    if (!data?.profile) return null;
    const { profile, interests, dealbreakers, partnerQualities, lifestyle } = data;
    const prefs = data.preferences;
    return {
      displayName: profile.display_name,
      age: profile.age,
      gender: profile.gender,
      location: profile.location,
      bio: profile.bio,
      lookingFor: profile.looking_for,
      interests: interests.map((i) => i.name),
      dealbreakers: dealbreakers.map((d) => d.description),
      partnerQualities: partnerQualities.map((q) => ({
        quality: q.quality,
        importance: q.importance,
      })),
      preferredGendersLabel: formatPreferredGendersLabel(prefs?.preferred_genders),
      maxDistanceLabel: formatMaxDistanceLabel(prefs?.max_distance),
      values: parseProfileValues(prefs?.values),
      lifestyle,
      introVideoUrl: profile.intro_video_url ?? null,
    };
  }, [data]);

  // When tab is not focused, render minimal view so leaving Profile tab is instant
  if (!isFocused) {
    return <View style={{ flex: 1 }} />;
  }

  const waitingForProfile = user && data == null && !profileCheckDoneRef.current;
  const showFullScreenLoading = (loading || (authLoading && !data) || waitingForProfile) && !cachedPrimaryPhotoUrl && photos.length === 0;
  if (showFullScreenLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[...shellBackdropColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  // Show profile shell with avatar from cache/photos while profile data loads (avatar appears instantly)
  const shellPhotoUrl = cachedPrimaryPhotoUrl || (photos.length > 0 ? getPhotoUrl(photos[0].url) : null);
  if (user && shellPhotoUrl && !data) {
    return (
      <GestureHandlerRootView style={styles.wrapper}>
        <LinearGradient
          colors={[...shellBackdropColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.headerGradient,
              profileUi.headerGradient,
              { opacity: headerFade, transform: [{ scale: headerScale }] },
            ]}
          >
            <LinearGradient
              colors={[...profileColors.headerGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.headerGradientInner, profileUi.headerGradientInner]}
            >
              <View style={styles.header}>
                <Animated.View style={[styles.avatarWrapper, { transform: [{ scale: avatarScale }] }]}>
                  <Animated.Image
                    source={{ uri: shellPhotoUrl }}
                    style={[styles.avatar, profileUi.avatar, { transform: [{ scale: avatarBreath }] }]}
                    resizeMode="cover"
                  />
                </Animated.View>
                <View style={styles.info}>
                  <Text style={[styles.name, profileUi.name]}>...</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
          <View style={{ padding: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={profileColors.loadingSpinner} />
            <Text style={[styles.loadingText, { color: profileColors.loadingText, marginTop: 12 }]}>
              Loading your profile...
            </Text>
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    );
  }

  if (!data && !error) {
    return (
      <View style={styles.noProfileContainer}>
        <AnimatedEmoji emoji="😕" delay={0} />
        <Text style={styles.noProfileText}>You haven't created your profile yet</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigateToCreateProfile()}
        >
          <Text style={styles.createButtonText}>Create Your Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={fetchProfile}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { profile, interests, dealbreakers, partnerQualities, lifestyle } = data!;

  // Get primary photo or first photo - only use photos from the photos array
  // Don't fall back to profile.photo_url since that may be stale after deletion
  const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : null;
  // Use cached URL so avatar shows immediately when opening Profile tab (before fetchPhotos returns)
  const displayPhotoUrl = profilePhotoUrl || cachedPrimaryPhotoUrl;

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      {/* Beautiful gradient background */}
      <LinearGradient
        colors={[...shellBackdropColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView 
        ref={scrollViewRef}
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
      >
      {/* Header with photo and basic info */}
      <Animated.View
        style={[
          styles.headerGradient,
          profileUi.headerGradient,
          {
            opacity: headerFade,
            transform: [{ scale: headerScale }],
          },
        ]}
      >
        <LinearGradient
          colors={[...profileColors.headerGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradientInner, profileUi.headerGradientInner]}
        >
          <View style={styles.header}>
            {displayPhotoUrl ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  if (photos.length > 0) {
                    const primaryIndex = photos.findIndex(p => p.isPrimary);
                    setCurrentPhotoIndex(primaryIndex >= 0 ? primaryIndex : 0);
                    setShowPhotoGallery(true);
                    // Haptic feedback
                    if (Platform.OS === 'ios') {
                      Vibration.vibrate([0, 50]);
                    } else {
                      Vibration.vibrate(50);
                    }
                  }
                }}
              >
              <Animated.View
                style={[
                  styles.avatarWrapper,
                  {
                    transform: [{ scale: avatarScale }],
                  },
                ]}
              >
                {/* Animated rings - multiple layers with gradients for depth */}
                {/* Outer ring - largest, slowest */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing3,
                    {
                      transform: [
                        { scale: ring3Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                      opacity: ring3Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringOuter]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Middle ring - medium, counter-rotating */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing2,
                    {
                      transform: [
                        { scale: ring2Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-360deg'],
                          }),
                        },
                      ],
                      opacity: ring2Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringMiddle]}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Inner ring - closest, fastest pulse */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing1,
                    {
                      transform: [
                        { scale: ring1Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                      opacity: ring1Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringInner]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Glowing orb effect behind rings */}
                <Animated.View
                  style={[
                    styles.avatarOrb,
                    profileUi.avatarOrb,
                    {
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.1, 0.3],
                      }),
                    },
                  ]}
                />
                
                {/* Shimmer effect overlay */}
                <Animated.View
                  style={[
                    styles.shimmerOverlay,
                    profileUi.shimmerOverlay,
                    {
                      opacity: shimmerPosition.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 0.6, 0],
                      }),
                      transform: [
                        {
                          translateX: shimmerPosition.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-300, 300],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                
                <Animated.Image
                  key={`${displayPhotoUrl ?? 'no-photo'}-v${avatarVersion}`}
                  source={{ uri: profilePhotoUrl ? `${profilePhotoUrl}${profilePhotoUrl.includes('?') ? '&' : '?'}v=${avatarVersion}` : (cachedPrimaryPhotoUrl || undefined) }}
                  style={[
                    styles.avatar,
                    profileUi.avatar,
                    {
                      transform: [{ scale: avatarBreath }],
                    },
                  ]}
                  resizeMode="cover"
                />
                
                {/* Enhanced glow effect */}
                <Animated.View
                  style={[
                    styles.avatarGlow,
                    {
                      opacity: ring1Opacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.5],
                      }),
                      transform: [{ scale: ring1Scale }],
                    },
                  ]}
                />
                
                {/* Animated floating sparkles */}
                <Animated.Text
                  style={[
                    styles.avatarSparkle1,
                    {
                      transform: [
                        {
                          translateY: sparkle1Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -15],
                          }),
                        },
                        {
                          scale: sparkle1Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.3, 1],
                          }),
                        },
                      ],
                      opacity: sparkle1Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.avatarSparkle2,
                    {
                      transform: [
                        {
                          translateY: sparkle2Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 12],
                          }),
                        },
                        {
                          scale: sparkle2Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.4, 1],
                          }),
                        },
                      ],
                      opacity: sparkle2Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.5, 1, 0.5],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.avatarSparkle3,
                    {
                      transform: [
                        {
                          translateX: sparkle3Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -10],
                          }),
                        },
                        {
                          scale: sparkle3Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.2, 1],
                          }),
                        },
                      ],
                      opacity: sparkle3Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.4, 0.9, 0.4],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
              </Animated.View>
              </TouchableOpacity>
            ) : (
              <Animated.View
                style={[
                  styles.avatarWrapper,
                  {
                    transform: [{ scale: avatarScale }],
                  },
                ]}
              >
                {/* Animated rings - multiple layers with gradients for depth */}
                {/* Outer ring - largest, slowest */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing3,
                    {
                      transform: [
                        { scale: ring3Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                      opacity: ring3Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringOuter]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Middle ring - medium, counter-rotating */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing2,
                    {
                      transform: [
                        { scale: ring2Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-360deg'],
                          }),
                        },
                      ],
                      opacity: ring2Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringMiddle]}
                    start={{ x: 1, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Inner ring - closest, fastest pulse */}
                <Animated.View
                  style={[
                    styles.avatarRing,
                    styles.avatarRing1,
                    {
                      transform: [
                        { scale: ring1Scale },
                        {
                          rotate: ringRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                      opacity: ring1Opacity,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[...profileColors.ringInner]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Glowing orb effect behind rings */}
                <Animated.View
                  style={[
                    styles.avatarOrb,
                    profileUi.avatarOrb,
                    {
                      transform: [{ scale: ring1Scale }],
                      opacity: ring1Opacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.1, 0.3],
                      }),
                    },
                  ]}
                />
                
                {/* Shimmer effect overlay */}
                <Animated.View
                  style={[
                    styles.shimmerOverlay,
                    profileUi.shimmerOverlay,
                    {
                      opacity: shimmerPosition.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, 0.6, 0],
                      }),
                      transform: [
                        {
                          translateX: shimmerPosition.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-300, 300],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                
                <Animated.View
                  style={{
                    transform: [{ scale: avatarBreath }],
                  }}
                >
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.avatarPlaceholder, profileUi.avatarPlaceholder]}
                  >
                    <Text style={styles.avatarPlaceholderText}>
                      {profile.display_name.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                </Animated.View>
                
                {/* Enhanced glow effect */}
                <Animated.View
                  style={[
                    styles.avatarGlow,
                    {
                      opacity: ring1Opacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.5],
                      }),
                      transform: [{ scale: ring1Scale }],
                    },
                  ]}
                />
                
                {/* Animated floating sparkles */}
                <Animated.Text
                  style={[
                    styles.avatarSparkle1,
                    {
                      transform: [
                        {
                          translateY: sparkle1Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -15],
                          }),
                        },
                        {
                          scale: sparkle1Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.3, 1],
                          }),
                        },
                      ],
                      opacity: sparkle1Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.avatarSparkle2,
                    {
                      transform: [
                        {
                          translateY: sparkle2Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 12],
                          }),
                        },
                        {
                          scale: sparkle2Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.4, 1],
                          }),
                        },
                      ],
                      opacity: sparkle2Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.5, 1, 0.5],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.avatarSparkle3,
                    {
                      transform: [
                        {
                          translateX: sparkle3Anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -10],
                          }),
                        },
                        {
                          scale: sparkle3Anim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [1, 1.2, 1],
                          }),
                        },
                      ],
                      opacity: sparkle3Anim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.4, 0.9, 0.4],
                      }),
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
              </Animated.View>
            )}
            <View style={styles.info}>
              <Text style={[styles.name, profileUi.name]}>{profile.display_name}</Text>

              <TouchableOpacity
                style={styles.viewProfilePreviewButton}
                onPress={() => setShowProfilePreview(true)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="View how your profile appears to others"
              >
                <LinearGradient
                  colors={[...profileColors.gradPreview]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.viewProfilePreviewGradient}
                >
                  <View style={styles.viewProfilePreviewIconWrap}>
                    <ProfileCardAnimatedEmoji
                      emoji="👁"
                      variant="peek"
                      fontSize={20}
                      delay={120}
                    />
                  </View>
                  <View style={styles.viewProfilePreviewCopy}>
                    <Text style={styles.viewProfilePreviewText}>View my profile</Text>
                    <Text style={styles.viewProfilePreviewSubtext}>Preview as matches see you</Text>
                  </View>
                  <Text style={styles.viewProfilePreviewChevron}>›</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <ProfileEditableCardBorder
                delay={180}
                traceColors={[...profileColors.traceDisplay]}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.infoCardFullTouchable}
                  onPress={() => {
                    setEditDisplayName(profile.display_name || '');
                    setShowNameModal(true);
                    Vibration.vibrate(50);
                  }}
                >
                  <LinearGradient
                    colors={[...profileColors.gradDisplay]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoCardFull}
                  >
                    <ProfileCardAnimatedEmoji
                      emoji="✨"
                      variant="shimmer"
                      fontSize={36}
                      delay={0}
                      containerStyle={styles.infoCardEmojiWrap}
                    />
                    <Text style={styles.infoCardLabel}>Display name</Text>
                    <Text
                      style={[
                        styles.infoCardValueFull,
                        profile.display_name.length > 24 && styles.infoCardValueFullLong,
                      ]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {profile.display_name}
                    </Text>
                    <Text style={styles.infoCardTapHint}>Tap to update</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ProfileEditableCardBorder>

              {/* Modern Info Cards Grid */}
              <View style={styles.infoGrid}>
                <ProfileEditableCardBorder
                  delay={360}
                  borderRadius={28}
                  traceColors={[...profileColors.traceAge]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setEditAge(String(profile.age));
                      setShowAgeModal(true);
                      Vibration.vibrate(50);
                    }}
                  >
                    <LinearGradient
                      colors={[...profileColors.gradAge]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.infoCardInBorder}
                    >
                      <ProfileCardAnimatedEmoji
                        emoji="🎂"
                        variant="bounce"
                        fontSize={36}
                        delay={80}
                        containerStyle={styles.infoCardEmojiWrap}
                      />
                      <Text style={styles.infoCardLabel}>Age</Text>
                      <Text style={styles.infoCardValue}>{profile.age}</Text>
                      <Text style={styles.infoCardTapHint}>Tap to update</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </ProfileEditableCardBorder>

                <ProfileEditableCardBorder
                  delay={520}
                  borderRadius={28}
                  traceColors={[...profileColors.traceGender]}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setEditGender(profile.gender || '');
                      setShowGenderModal(true);
                      Vibration.vibrate(50);
                    }}
                  >
                    <LinearGradient
                      colors={[...profileColors.gradGender]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.infoCardInBorder}
                    >
                      <ProfileCardAnimatedEmoji
                        emoji="⚧️"
                        variant="glow"
                        fontSize={36}
                        delay={160}
                        containerStyle={styles.infoCardEmojiWrap}
                      />
                      <Text style={styles.infoCardLabel}>Gender</Text>
                      <Text
                        style={styles.infoCardValueGender}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {displayProfileGender(profile.gender)}
                      </Text>
                      <Text style={styles.infoCardTapHint}>Tap to update</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </ProfileEditableCardBorder>
              </View>

              <View style={styles.profileBasicsSectionHeader}>
                <View style={[styles.profileBasicsSectionLine, profileUi.basicsSectionLine]} />
                <Text style={[styles.profileBasicsSectionLabel, profileUi.basicsSectionLabel]}>
                  Location & matching
                </Text>
                <View style={[styles.profileBasicsSectionLine, profileUi.basicsSectionLine]} />
              </View>

              {/* Location - tappable to update */}
              <ProfileEditableCardBorder
                delay={0}
                traceColors={[...profileColors.traceLocation]}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.infoCardFullTouchable}
                  onPress={() => {
                    setEditLocation(profile.location || '');
                    setShowLocationModal(true);
                    Vibration.vibrate(50);
                  }}
                >
                  <LinearGradient
                    colors={[...profileColors.gradLocation]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoCardFull}
                  >
                    <ProfileCardAnimatedEmoji
                      emoji="📍"
                      variant="bob"
                      fontSize={36}
                      delay={240}
                      containerStyle={styles.infoCardEmojiWrap}
                    />
                    <Text style={styles.infoCardLabel}>Location</Text>
                    <Text
                    style={[
                      styles.infoCardValueFull,
                      (profile.location?.length ?? 0) > 28 && styles.infoCardValueFullLong,
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {profile.location ? compactCityState(profile.location) : 'Tap to add'}
                  </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ProfileEditableCardBorder>

              {/* Max distance - tappable to update (used by matching) */}
              <ProfileEditableCardBorder
                delay={200}
                traceColors={[...profileColors.traceDistance]}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.infoCardFullTouchable}
                  onPress={() => {
                    setEditMaxDistance(clampMaxDistanceMiles(data?.preferences?.max_distance ?? 50));
                    setShowDistanceModal(true);
                    Vibration.vibrate(50);
                  }}
                >
                  <LinearGradient
                    colors={[...profileColors.gradDistance]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoCardFull}
                  >
                    <ProfileCardAnimatedEmoji
                      emoji="📏"
                      variant="sway"
                      fontSize={36}
                      delay={320}
                      containerStyle={styles.infoCardEmojiWrap}
                    />
                    <Text style={styles.infoCardLabel}>Max distance</Text>
                    <Text style={styles.infoCardValueFull}>
                      {formatMaxDistanceLabel(data?.preferences?.max_distance)}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ProfileEditableCardBorder>

              {/* Preferred matches - tappable to update */}
              <ProfileEditableCardBorder
                delay={400}
                traceColors={[...profileColors.tracePreferred]}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.infoCardFullTouchable}
                  onPress={() => {
                    let initial: string[] = [];
                    if (data?.preferences?.preferred_genders) {
                      try {
                        const raw = JSON.parse(data.preferences.preferred_genders) as string[];
                        initial = raw.filter((g) => g === 'Man' || g === 'Woman' || g === 'Everyone');
                        const hadLegacyOther = raw.includes('Other');
                        const hadLegacyAllThree =
                          raw.length === 3 &&
                          ['Man', 'Woman', 'Other'].every((g) => raw.includes(g));
                        if (hadLegacyAllThree || (hadLegacyOther && initial.length === 0)) {
                          initial = ['Everyone'];
                        }
                      } catch { initial = []; }
                    }
                    if (initial.length === 0) initial = ['Everyone'];
                    setEditPreferredGenders(initial);
                    setShowPreferredGendersModal(true);
                    Vibration.vibrate(50);
                  }}
                >
                  <LinearGradient
                    colors={[...profileColors.gradPreferred]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoCardFull}
                  >
                    <ProfileCardAnimatedEmoji
                      emoji="💕"
                      variant="heartbeat"
                      fontSize={36}
                      delay={400}
                      containerStyle={styles.infoCardEmojiWrap}
                    />
                    <Text style={styles.infoCardLabel}>Preferred matches</Text>
                    <Text style={styles.infoCardValueFull}>
                      {(() => {
                        const pg = data?.preferences?.preferred_genders;
                        if (!pg) return 'Everyone';
                        try {
                          const arr = (JSON.parse(pg) as string[]).filter(
                            (g) => g === 'Man' || g === 'Woman' || g === 'Everyone'
                          );
                          if (!arr.length || arr.includes('Everyone')) return 'Everyone';
                          return arr.map(preferredGenderLabel).join(', ');
                        } catch { return 'Everyone'; }
                      })()}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ProfileEditableCardBorder>

              {/* Relationship goal — same options as web "Looking for" (Better matches checklist) */}
              <ProfileEditableCardBorder
                delay={600}
                traceColors={[...profileColors.traceLooking]}
                onLayout={(e) => {
                  lookingForSectionYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.infoCardFullTouchable}
                  onPress={() => {
                    setEditLookingFor(profile.looking_for?.trim() ?? '');
                    setShowLookingForModal(true);
                    Vibration.vibrate(50);
                  }}
                >
                  <LinearGradient
                    colors={[...profileColors.gradLooking]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.infoCardFull}
                  >
                    <ProfileCardAnimatedEmoji
                      emoji="💞"
                      variant="shimmer"
                      fontSize={36}
                      delay={480}
                      containerStyle={styles.infoCardEmojiWrap}
                    />
                    <Text style={styles.infoCardLabel}>Looking for</Text>
                    <Text
                      style={styles.infoCardValueFull}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {profile.looking_for?.trim()
                        ? profile.looking_for
                        : 'Tap to choose'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </ProfileEditableCardBorder>

              {/* About Me - tappable to open edit modal (keyboard won't cover Save/Cancel) */}
              <ProfileEditableCardBorder
                delay={800}
                borderRadius={24}
                traceColors={[...profileColors.traceBio]}
                style={styles.bioBorderWrap}
              >
                <LinearGradient
                  colors={[...profileColors.bioGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.bioGradient, profileUi.bioGradient]}
                >
                  <View style={styles.bioHeader}>
                    <View style={styles.bioTitleRow}>
                      <Text style={styles.bioIcon}>💬</Text>
                      <Text style={[styles.bioTitle, profileUi.bioTitle]}>About Me</Text>
                    </View>
                    <View style={[styles.bioAccentLine, profileUi.bioAccentLine]} />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setEditBio(profile.bio || '');
                      setShowBioModal(true);
                      Vibration.vibrate(50);
                    }}
                  >
                    <Text
                      style={[
                        styles.bio,
                        profileUi.bio,
                        !profile.bio && styles.bioPlaceholder,
                        !profile.bio && profileUi.bioPlaceholder,
                      ]}
                    >
                      {profile.bio || 'Tap to add'}
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              </ProfileEditableCardBorder>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Display name edit modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowNameModal(false)}
            />
            <View style={styles.editModalCardWide}>
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.editModalGradient}
              >
                <Text style={styles.editModalEmoji}>✨</Text>
                <Text style={styles.editModalTitleLight}>Your display name</Text>
                <Text style={styles.editModalSubtitleLight}>
                  Shown to people you connect with — first name or nickname works great
                </Text>
                <View style={styles.nameModalInner}>
                  <LinearGradient
                    colors={['rgba(102, 126, 234, 0.35)', 'rgba(240, 147, 251, 0.35)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.nameModalInputRing}
                  >
                    <TextInput
                      style={styles.nameModalInput}
                      value={editDisplayName}
                      onChangeText={setEditDisplayName}
                      placeholder="Your name"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="words"
                      autoCorrect={false}
                      maxLength={50}
                      editable={!updatingField}
                      autoFocus
                    />
                  </LinearGradient>
                  <Text style={styles.nameModalCharCount}>
                    {editDisplayName.trim().length}/50
                  </Text>
                  {editDisplayName.trim().length >= 2 ? (
                    <View style={styles.nameModalPreview}>
                      <Text style={styles.nameModalPreviewLabel}>Matches will see</Text>
                      <Text style={styles.nameModalPreviewValue}>
                        👋 {editDisplayName.trim()}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.nameModalHint}>At least 2 characters</Text>
                  )}
                </View>
                <View style={styles.editModalActions}>
                  <TouchableOpacity
                    style={styles.editModalCancelPill}
                    onPress={() => {
                      setShowNameModal(false);
                      setEditDisplayName(profile.display_name || '');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.editModalCancelPillText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editModalSavePill}
                    onPress={saveDisplayName}
                    disabled={updatingField || editDisplayName.trim().length < 2}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.editModalSavePillText}>
                      {updatingField ? 'Saving...' : 'Save name'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Age edit modal */}
      <Modal visible={showAgeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowAgeModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>🎂</Text>
              <Text style={styles.editModalTitleLight}>Update age</Text>
              <Text style={styles.editModalSubtitleLight}>Must be 18 or older</Text>
              <View style={styles.editModalInner}>
                <View style={styles.ageEditRow}>
                  <TouchableOpacity
                    style={styles.ageStepBtn}
                    onPress={() => {
                      const n = parseInt(editAge, 10);
                      setEditAge(String(Number.isNaN(n) ? 18 : Math.max(18, n - 1)));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.ageStepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.ageEditInput}
                    value={editAge}
                    onChangeText={setEditAge}
                    keyboardType="number-pad"
                    maxLength={3}
                    placeholder="18"
                    placeholderTextColor="rgba(30, 27, 75, 0.4)"
                  />
                  <TouchableOpacity
                    style={styles.ageStepBtn}
                    onPress={() => {
                      const n = parseInt(editAge, 10);
                      setEditAge(String(Number.isNaN(n) ? 18 : Math.min(120, n + 1)));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.ageStepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.ageQuickLabel}>Quick pick</Text>
                <View style={styles.ageQuickGrid}>
                  {AGE_QUICK_PICKS.map((age) => (
                    <TouchableOpacity
                      key={age}
                      style={[styles.ageQuickChip, editAge === String(age) && styles.ageQuickChipActive]}
                      onPress={() => setEditAge(String(age))}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.ageQuickChipText, editAge === String(age) && styles.ageQuickChipTextActive]}>
                        {age}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowAgeModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveAge} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Gender edit modal */}
      <Modal visible={showGenderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowGenderModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>⚧️</Text>
              <Text style={styles.editModalTitleLight}>Update gender</Text>
              <Text style={styles.editModalSubtitleLight}>Shown on your profile when you connect</Text>
              <ScrollView style={styles.profilePickerModalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.editModalInner}>
                  {GENDER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.preferredGenderOption,
                        editGender === opt && styles.preferredGenderOptionActive,
                      ]}
                      onPress={() => setEditGender(opt)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.preferredGenderOptionText,
                          editGender === opt && styles.preferredGenderOptionTextActive,
                        ]}
                      >
                        {GENDER_OPTION_META[opt].emoji} {opt}
                      </Text>
                      <Text style={styles.lookingForSub}>{GENDER_OPTION_META[opt].sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowGenderModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveGender} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Location edit modal - gradient card */}
      <Modal visible={showLocationModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowLocationModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#4facfe', '#00f2fe']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>📍</Text>
              <Text style={styles.editModalTitleLight}>Update Location</Text>
              <Text style={styles.editModalSubtitleLight}>City and state required</Text>
              <View style={styles.editModalInner}>
                <TextInput
                  style={styles.editModalInput}
                  value={editLocation}
                  onChangeText={(t) => handleLocationChange(t, setEditLocation)}
                  placeholder="e.g. Medford, Oregon"
                  placeholderTextColor="#94a3b8"
                  editable={!detectingLocation}
                />
                <TouchableOpacity
                  style={[styles.editModalSecondaryButton, detectingLocation && styles.editModalButtonDisabled]}
                  onPress={detectLocation}
                  disabled={detectingLocation}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editModalSecondaryButtonText}>
                    {detectingLocation ? 'Detecting...' : '📍 Use My Location'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowLocationModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveLocation} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Preferred genders edit modal */}
      <Modal visible={showPreferredGendersModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowPreferredGendersModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#a78bfa', '#c084fc', '#e879f9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>💕</Text>
              <Text style={styles.editModalTitleLight}>Preferred matches</Text>
              <Text style={styles.editModalSubtitleLight}>Who you want to see when browsing for matches</Text>
              <ScrollView style={styles.preferredGendersScroll} contentContainerStyle={styles.preferredGendersScrollContent} showsVerticalScrollIndicator={true}>
                <View style={styles.editModalInner}>
                  {PREFERRED_GENDERS_VALUES.map((opt) => {
                    const selected =
                      editPreferredGenders.includes(opt) ||
                      (opt === 'Everyone' &&
                        (editPreferredGenders.length === 0 || editPreferredGenders.includes('Everyone')));
                    return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.preferredGenderOption,
                        selected && styles.preferredGenderOptionActive,
                      ]}
                      onPress={() => {
                        if (opt === 'Everyone') {
                          setEditPreferredGenders(['Everyone']);
                        } else {
                          setEditPreferredGenders((prev) => {
                            const withoutEveryone = prev.filter((g) => g !== 'Everyone');
                            if (withoutEveryone.includes(opt)) {
                              const next = withoutEveryone.filter((g) => g !== opt);
                              return next.length === 0 ? ['Everyone'] : next;
                            }
                            return [...withoutEveryone, opt];
                          });
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.preferredMatchOptionRow}>
                        <Text style={styles.preferredMatchEmoji} allowFontScaling={false}>
                          {PREFERRED_GENDERS_EMOJI[opt]}
                        </Text>
                        <Text style={[
                          styles.preferredGenderOptionText,
                          selected && styles.preferredGenderOptionTextActive,
                        ]}>
                          {preferredGenderLabel(opt)}
                        </Text>
                        {selected ? (
                          <Text style={styles.preferredMatchCheck} allowFontScaling={false}>✓</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowPreferredGendersModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={savePreferredGenders} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* About Me edit modal - KeyboardAvoidingView keeps Save/Cancel visible above keyboard */}
      <Modal visible={showBioModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowBioModal(false)}
            />
            <View style={styles.editModalCard}>
              <LinearGradient
              colors={['rgba(102, 126, 234, 0.95)', 'rgba(240, 147, 251, 0.9)', 'rgba(102, 126, 234, 0.9)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>💬</Text>
              <Text style={styles.editModalTitleLight}>About Me</Text>
              <Text style={styles.editModalSubtitleLight}>Tell others about yourself (visible when matching)</Text>
              <View style={styles.editModalInner}>
                <TextInput
                  style={[styles.editModalInput, styles.bioModalInput]}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell others about yourself..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={5}
                  maxLength={500}
                  editable={!updatingField}
                  textAlignVertical="top"
                />
              </View>
              <View style={styles.editModalActions}>
                <TouchableOpacity
                  style={styles.editModalCancelPill}
                  onPress={() => { setShowBioModal(false); setEditBio(profile.bio || ''); }}
                  disabled={updatingField}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editModalSavePill}
                  onPress={saveBio}
                  disabled={updatingField}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Looking for (relationship goal) */}
      <Modal visible={showLookingForModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowLookingForModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#fda4af', '#fb7185', '#f472b6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>💕</Text>
              <Text style={styles.editModalTitleLight}>Looking for</Text>
              <Text style={styles.editModalSubtitleLight}>What you want from connections</Text>
              <ScrollView style={styles.profilePickerModalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.editModalInner}>
                  {LOOKING_FOR_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.preferredGenderOption,
                        editLookingFor === opt && styles.preferredGenderOptionActive,
                      ]}
                      onPress={() => setEditLookingFor(opt)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.preferredGenderOptionText,
                          editLookingFor === opt && styles.preferredGenderOptionTextActive,
                        ]}
                      >
                        {LOOKING_FOR_META[opt].emoji} {opt}
                      </Text>
                      <Text style={styles.lookingForSub}>{LOOKING_FOR_META[opt].sub}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.preferredGenderOption}
                    onPress={() => setEditLookingFor('')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.preferredGenderOptionText}>Clear selection</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowLookingForModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveLookingFor} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal visible={showDistanceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowDistanceModal(false)} />
          <View style={styles.editModalCardWide}>
            <LinearGradient
              colors={['#43e97b', '#38f9d7', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>📏</Text>
              <Text style={styles.editModalTitleLight}>Max distance</Text>
              <Text style={styles.editModalSubtitleLight}>
                People outside this radius won't show when you browse. Maximum is 100 miles in Southern Oregon.
              </Text>
              <ScrollView style={styles.distanceModalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.distanceGrid}>
                  {MAX_DISTANCE_SELECT_OPTIONS.map((value) => {
                    const key = String(value);
                    const meta = MAX_DISTANCE_META[key];
                    const selected = clampMaxDistanceMiles(editMaxDistance) === value;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.distanceOptionCard, selected && styles.distanceOptionCardSelected]}
                        onPress={() => setEditMaxDistance(value)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.distanceOptionRing, selected && styles.distanceOptionRingSelected]} />
                        <View style={styles.distanceOptionPrimary}>
                          <>
                            <Text style={styles.distanceOptionNum}>{value}</Text>
                            <Text style={styles.distanceOptionMi}>mi</Text>
                          </>
                        </View>
                        <Text style={styles.distanceOptionTag}>{meta?.tag ?? ''}</Text>
                        {selected ? (
                          <View style={styles.distanceOptionCheckWrap}>
                            <Text style={styles.distanceOptionCheck}>✓</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowDistanceModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveMaxDistance} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal visible={showInterestsModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowInterestsModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>🎯</Text>
              <Text style={styles.editModalTitleLight}>My interests</Text>
              <Text style={styles.editModalSubtitleLight}>Select at least 3 ({editInterests.length} selected)</Text>
              <ScrollView style={styles.profilePickerModalScrollTall} keyboardShouldPersistTaps="handled">
                <View style={styles.editModalInner}>
                  <View style={styles.dealbreakerModalGrid}>
                    {PARTNER_QUALITY_OPTIONS.map((interest) => {
                      const selected = editInterests.includes(interest);
                      const emoji = PARTNER_QUALITY_EMOJI[interest] || '✨';
                      return (
                        <TouchableOpacity
                          key={interest}
                          style={[styles.dealbreakerChip, selected && styles.dealbreakerChipSelected]}
                          onPress={() => toggleInterestEdit(interest)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dealbreakerChipText, selected && styles.dealbreakerChipTextSelected]}>
                            {emoji} {interest}{selected ? ' ✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowInterestsModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveInterests} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal visible={showDealbreakersModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowDealbreakersModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#ef4444', '#f5576c', '#a78bfa']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>🚫</Text>
              <Text style={styles.editModalTitleLight}>Dealbreakers</Text>
              <Text style={styles.editModalSubtitleLight}>Hard passes — tap to toggle ({editDealbreakers.length} on)</Text>
              <ScrollView style={styles.profilePickerModalScrollTall} keyboardShouldPersistTaps="handled">
                <View style={styles.editModalInner}>
                  <View style={styles.dealbreakerModalGrid}>
                    {DEALBREAKER_SUGGESTIONS.map((label) => {
                      const selected = editDealbreakers.includes(label);
                      const emoji = DEALBREAKER_EMOJI[label];
                      return (
                        <TouchableOpacity
                          key={label}
                          style={[styles.dealbreakerChip, selected && styles.dealbreakerChipSelected]}
                          onPress={() => toggleDealbreakerEdit(label)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dealbreakerChipText, selected && styles.dealbreakerChipTextSelected]}>
                            {emoji} {label}{selected ? ' ✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowDealbreakersModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveDealbreakers} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal visible={showQualitiesModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowQualitiesModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#f093fb', '#e879f9', '#667eea']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>💕</Text>
              <Text style={styles.editModalTitleLight}>What I'm looking for</Text>
              <Text style={styles.editModalSubtitleLight}>Qualities that matter in a match ({editQualities.length} selected)</Text>
              <ScrollView style={styles.profilePickerModalScrollTall} keyboardShouldPersistTaps="handled">
                <View style={styles.editModalInner}>
                  <View style={styles.dealbreakerModalGrid}>
                    {PARTNER_QUALITY_OPTIONS.map((quality) => {
                      const selected = editQualities.includes(quality);
                      const emoji = PARTNER_QUALITY_EMOJI[quality] || '✨';
                      return (
                        <TouchableOpacity
                          key={quality}
                          style={[styles.dealbreakerChip, selected && styles.dealbreakerChipSelected]}
                          onPress={() => toggleQualityEdit(quality)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dealbreakerChipText, selected && styles.dealbreakerChipTextSelected]}>
                            {emoji} {quality}{selected ? ' ✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowQualitiesModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveQualities} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal visible={showLifestyleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowLifestyleModal(false)} />
          <View style={styles.editModalCardWide}>
            <LinearGradient
              colors={['#43e97b', '#38f9d7', '#667eea']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>🌱</Text>
              <Text style={styles.editModalTitleLight}>Lifestyle</Text>
              <Text style={styles.editModalSubtitleLight}>Tap a card for each topic — all optional</Text>
              <ScrollView style={styles.lifestyleEditModalScroll} keyboardShouldPersistTaps="handled">
                <View style={styles.lifestyleEditModalBody}>
                  {(Object.keys(LIFESTYLE_FIELD_OPTIONS) as LifestyleFieldKey[]).map((key) => {
                    const opts = LIFESTYLE_FIELD_OPTIONS[key];
                    const val = editLifestyle[key];
                    const hasValue = Boolean(val?.trim());
                    const gradient = LIFESTYLE_FIELD_GRADIENTS[key];
                    return (
                      <View key={key} style={styles.lifestyleEditFieldCard}>
                        <LinearGradient
                          colors={[gradient[0], gradient[1], gradient[2]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.lifestyleEditFieldAccent}
                        />
                        <View style={styles.lifestyleEditFieldBody}>
                          <View style={styles.lifestyleEditFieldHeader}>
                            <LinearGradient
                              colors={[gradient[0], gradient[2]]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.lifestyleEditFieldEmojiWrap}
                            >
                              <Text style={styles.lifestyleEditFieldEmoji}>{LIFESTYLE_FIELD_EMOJI[key]}</Text>
                            </LinearGradient>
                            <View style={styles.lifestyleEditFieldHeaderText}>
                              <Text style={styles.lifestyleEditFieldTitle}>{LIFESTYLE_FIELD_LABEL[key]}</Text>
                              <Text style={styles.lifestyleEditFieldHint}>
                                {hasValue ? 'Selected — tap another to change' : 'Optional'}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.lifestyleEditOptionsGrid}>
                            {opts.map((opt) => {
                              const selected = val === opt;
                              const { emoji, text, isSkip } = lifestyleOptionParts(key, opt);
                              return (
                                <TouchableOpacity
                                  key={String(opt || '__skip__')}
                                  style={styles.lifestyleEditOptionChip}
                                  onPress={() =>
                                    setEditLifestyle((prev) => ({ ...prev, [key]: opt }))
                                  }
                                  activeOpacity={0.85}
                                >
                                  {selected ? (
                                    <LinearGradient
                                      colors={[gradient[0], gradient[1], gradient[2]]}
                                      start={{ x: 0, y: 0 }}
                                      end={{ x: 1, y: 1 }}
                                      style={[
                                        styles.lifestyleEditOptionInner,
                                        styles.lifestyleEditOptionInnerSelected,
                                      ]}
                                    >
                                      <Text style={styles.lifestyleEditOptionEmoji}>{emoji}</Text>
                                      <Text style={styles.lifestyleEditOptionTextSelected} numberOfLines={3}>
                                        {text}
                                      </Text>
                                      <View style={styles.lifestyleEditOptionCheck}>
                                        <Text style={styles.lifestyleEditOptionCheckMark}>✓</Text>
                                      </View>
                                    </LinearGradient>
                                  ) : (
                                    <View
                                      style={[
                                        styles.lifestyleEditOptionInner,
                                        isSkip
                                          ? styles.lifestyleEditOptionInnerSkip
                                          : styles.lifestyleEditOptionInnerIdle,
                                      ]}
                                    >
                                      <Text style={styles.lifestyleEditOptionEmojiIdle}>{emoji}</Text>
                                      <Text style={styles.lifestyleEditOptionTextIdle} numberOfLines={3}>
                                        {text}
                                      </Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.editModalActions}>
                <TouchableOpacity style={styles.editModalCancelPill} onPress={() => setShowLifestyleModal(false)} activeOpacity={0.8}>
                  <Text style={styles.editModalCancelPillText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editModalSavePill} onPress={saveLifestyle} disabled={updatingField} activeOpacity={0.8}>
                  <Text style={styles.editModalSavePillText}>{updatingField ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Intro Video */}
      <Animated.View
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[0] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnims[0] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
              {
                scale: (sectionAnims[0] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={550}
          borderRadius={30}
          traceColors={[...profileColors.traceSection]}
          style={{ marginBottom: 0 }}
        >
          <View style={[styles.section, profileUi.section]}>
            <View style={styles.sectionTitleContainer}>
              <AnimatedEmoji emoji="📹" delay={0} />
              <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> My Intro Video</Text>
              <TouchableOpacity
                style={styles.sectionEditTouchable}
                onPress={() => setShowIntroVideoModal(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.sectionEditLink, profileUi.sectionEditLink]}>
                  {hasIntroVideo(profile) ? 'Re-record' : 'Record'}
                </Text>
              </TouchableOpacity>
            </View>
            {hasIntroVideo(profile) ? (
              <IntroVideoPreview
                source={{ uri: resolveIntroVideoUrl(profile.intro_video_url) }}
                maxHeight={220}
              />
            ) : (
              <TouchableOpacity
                style={styles.introVideoEmptyButton}
                onPress={() => setShowIntroVideoModal(true)}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#ff6b8a', '#f093fb', '#7c6cf0']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.introVideoEmptyGradient}
                >
                  <Text style={styles.introVideoEmptyEmoji}>📹</Text>
                  <Text style={styles.introVideoEmptyTitle}>Record your intro video</Text>
                  <Text style={styles.introVideoEmptySubtext}>
                    A short clip helps matches hear your voice before you connect.
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            <Text style={styles.photoHint}>
              {hasIntroVideo(profile)
                ? 'Matches see this on your profile when you connect.'
                : 'Required before you can connect with others.'}
            </Text>
          </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* Photos Section */}
      <Animated.View 
        onLayout={(e) => { photosSectionYRef.current = e.nativeEvent.layout.y; }}
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[1] ?? sectionFallbackAnim,
            transform: [
              { 
                translateY: (sectionAnims[1] ?? sectionFallbackAnim).interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [40, 0] 
                }) 
              },
              { 
                scale: (sectionAnims[1] ?? sectionFallbackAnim).interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [0.92, 1] 
                }) 
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={700}
          borderRadius={30}
          traceColors={[...profileColors.traceSection]}
          style={{ marginBottom: 0 }}
        >
        <View style={[styles.section, profileUi.section]}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="📸" delay={0} />
          <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> My Photos</Text>
        </View>
        
        {/* View Photos Button */}
        {photos.length > 0 && (
          <TouchableOpacity
            style={styles.viewPhotosButton}
            onPress={() => {
              const primaryIndex = photos.findIndex(p => p.isPrimary);
              const index = primaryIndex >= 0 ? primaryIndex : 0;
              setCurrentPhotoIndex(index);
              setShowPhotoGallery(true);
              // Haptic feedback
              if (Platform.OS === 'ios') {
                Vibration.vibrate([0, 50]);
              } else {
                Vibration.vibrate(50);
              }
            }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.viewPhotosButtonGradient}
            >
              <Text style={styles.viewPhotosButtonIcon}>📷</Text>
              <Text style={styles.viewPhotosButtonText}>
                View All Photos ({photos.length})
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        
        <View style={styles.photosGrid}>
          {Array.from({ length: 6 }, (_, index) => {
            const photo = photos[index];
            if (photo) {
              const isDragging = draggingPhotoId === photo.id;
              const dragStyle = isDragging ? {
                opacity: 0.5,
                zIndex: 1000,
                transform: [
                  { translateX: dragAnimatedValue.x },
                  { translateY: dragAnimatedValue.y },
                  { scale: 1.1 },
                ],
              } : {};
              return (
                <PanGestureHandler
                  key={photo.id}
                  activateAfterLongPress={280}
                  onGestureEvent={Animated.event(
                    [{ nativeEvent: { translationX: dragAnimatedValue.x, translationY: dragAnimatedValue.y } }],
                    { useNativeDriver: false }
                  )}
                  onHandlerStateChange={(event) => {
                    const { state } = event.nativeEvent;
                    if (state === State.ACTIVE && !isDragging) {
                      onLongPress(photo.id, index);
                    } else if (state === State.ACTIVE && isDragging && draggingPhotoId === photo.id) {
                      const { translationX, translationY } = event.nativeEvent;
                      dragAnimatedValue.setValue({ x: translationX, y: translationY });
                    } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
                      if (isDragging && draggingPhotoId === photo.id) {
                        onDragEnd(event);
                      } else {
                        setDraggingPhotoId(null);
                        setDraggingIndex(null);
                        dragAnimatedValue.setValue({ x: 0, y: 0 });
                      }
                    }
                  }}
                  minPointers={1}
                  maxPointers={1}
                  enabled={!isDragging || draggingPhotoId === photo.id}
                >
                  <Animated.View
                    style={[
                      styles.photoContainer,
                      dragStyle,
                      isDragging && styles.photoContainerDragging,
                    ]}
                  >
                    <TapGestureHandler
                      onActivated={() => {
                        setCurrentPhotoIndex(index);
                        setShowPhotoGallery(true);
                        if (Platform.OS === 'ios') {
                          Vibration.vibrate(30);
                        }
                      }}
                    >
                      <Animated.View style={styles.photoTapTarget}>
                        <OptimizedImage
                          source={photo.url}
                          style={styles.photo}
                          resizeMode="cover"
                          showLoadingIndicator={false}
                        />
                      </Animated.View>
                    </TapGestureHandler>
                    {index === 0 && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>Primary</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePhoto(photo.id)}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                    {isDragging && (
                      <View style={styles.dragIndicator}>
                        <Text style={styles.dragIndicatorText}>📱</Text>
                      </View>
                    )}
                  </Animated.View>
                </PanGestureHandler>
              );
            }
            return (
              <TouchableOpacity
                key={`empty-${index}`}
                style={styles.addPhotoButton}
                onPress={() => handlePickImage(index)}
                disabled={uploadingPhotos}
              >
                {uploadingSlotIndices.includes(index) ||
                (openingPhotoPicker && photoPickerTargetSlot === index) ? (
                  <ActivityIndicator color="#667eea" />
                ) : (
                  <Text style={styles.addPhotoText}>+</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.photoHint}>
          {photos.length}/6 photos
          {photos.length < 6 && ' · tap + to add (select multiple)'}
          {photos.length > 1 && ' · long-press a photo to drag and reorder'}
        </Text>
        </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* Interests */}
      <Animated.View
        onLayout={(e) => {
          profileSectionYRef.current.interests = e.nativeEvent.layout.y;
        }}
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[2] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnims[2] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
              {
                scale: (sectionAnims[2] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={900}
          borderRadius={30}
          traceColors={[...profileColors.traceSectionInterests]}
          style={{ marginBottom: 0 }}
        >
        <View style={[styles.section, profileUi.section]}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="🎯" delay={200} />
          <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> My Interests</Text>
          <TouchableOpacity
            style={styles.sectionEditTouchable}
            onPress={() => {
              setEditInterests(interests.map((i) => i.name));
              setShowInterestsModal(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.sectionEditLink, profileUi.sectionEditLink]}>Edit</Text>
          </TouchableOpacity>
        </View>
        {interests.length > 0 ? (
          <View style={styles.tagsContainer}>
            {interests.map((interest, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>
                  {getInterestEmoji(interest.name)} {interest.name}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.sectionEmptyHint, profileUi.sectionEmptyHint]}>
            No interests yet — tap Edit to add (pick at least 3).
          </Text>
        )}
        </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* My Dealbreakers */}
      <Animated.View
        onLayout={(e) => {
          profileSectionYRef.current.dealbreakers = e.nativeEvent.layout.y;
        }}
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[3] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnims[3] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
              {
                scale: (sectionAnims[3] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={1100}
          borderRadius={30}
          traceColors={[...profileColors.traceSectionDealbreakers]}
          style={{ marginBottom: 0 }}
        >
        <View style={[styles.section, profileUi.section]}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="🚫" delay={280} />
          <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> My Dealbreakers</Text>
          <TouchableOpacity
            style={styles.sectionEditTouchable}
            onPress={() => {
              const next = Array.from(
                new Set(
                  dealbreakers
                    .map((d) => canonicalDealbreakerLabel(d.description))
                    .filter((x): x is NonNullable<typeof x> => x != null)
                )
              );
              setEditDealbreakers(next);
              setShowDealbreakersModal(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.sectionEditLink, profileUi.sectionEditLink]}>Edit</Text>
          </TouchableOpacity>
        </View>
        {dealbreakers.length > 0 ? (
          <View style={styles.tagsContainer}>
            {dealbreakers.map((db, idx) => {
              const canon = canonicalDealbreakerLabel(db.description);
              const em = canon ? DEALBREAKER_EMOJI[canon] : '🚫';
              const label = canon ?? db.description;
              return (
                <View key={idx} style={styles.tag}>
                  <Text style={styles.tagText}>
                    {em} {label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.sectionEmptyHint, profileUi.sectionEmptyHint]}>
            No dealbreakers yet — tap Edit to add.
          </Text>
        )}
        </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* What I'm looking for (partner qualities) */}
      <Animated.View
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[4] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnims[4] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
              {
                scale: (sectionAnims[4] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={1300}
          borderRadius={30}
          traceColors={[...profileColors.traceSectionLooking]}
          style={{ marginBottom: 0 }}
        >
        <View style={[styles.section, profileUi.section]}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="💕" delay={360} />
          <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> Qualities in a partner</Text>
          <TouchableOpacity
            style={styles.sectionEditTouchable}
            onPress={() => {
              setEditQualities(partnerQualities.map((q) => q.quality));
              setShowQualitiesModal(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.sectionEditLink, profileUi.sectionEditLink]}>Edit</Text>
          </TouchableOpacity>
        </View>
        {partnerQualities.length > 0 ? (
          <View style={styles.tagsContainer}>
            {partnerQualities.map((q, idx) => {
              const em = isCanonicalPartnerQuality(q.quality) ? PARTNER_QUALITY_EMOJI[q.quality] : '✨';
              return (
                <View key={idx} style={styles.tag}>
                  <Text style={styles.tagText}>
                    {em} {q.quality}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.sectionEmptyHint, profileUi.sectionEmptyHint]}>
            No qualities listed yet — tap Edit to choose what matters to you.
          </Text>
        )}
        </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* Lifestyle */}
      <Animated.View
        onLayout={(e) => {
          profileSectionYRef.current.lifestyle = e.nativeEvent.layout.y;
        }}
        style={[
          styles.sectionShell,
          {
            opacity: sectionAnims[5] ?? sectionFallbackAnim,
            transform: [
              {
                translateY: (sectionAnims[5] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
              {
                scale: (sectionAnims[5] ?? sectionFallbackAnim).interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <ProfileEditableCardBorder
          delay={1500}
          borderRadius={30}
          traceColors={[...profileColors.traceSectionLifestyle]}
          style={{ marginBottom: 0 }}
        >
        <View style={[styles.section, profileUi.section]}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="🌱" delay={440} />
          <Text style={[styles.sectionTitle, profileUi.sectionTitle]}> Lifestyle</Text>
          <TouchableOpacity
            style={styles.sectionEditTouchable}
            onPress={() => {
              setEditLifestyle(lifestyleFormFromApi(lifestyle));
              setShowLifestyleModal(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.sectionEditLink, profileUi.sectionEditLink]}>Edit</Text>
          </TouchableOpacity>
        </View>
        {lifestyle &&
        (lifestyle.smoking ||
          lifestyle.drinking ||
          lifestyle.children ||
          lifestyle.pets ||
          lifestyle.religion ||
          lifestyle.political ||
          lifestyle.work_life_balance ||
          lifestyle.works_out) ? (
          <View style={styles.lifestyleContainer}>
            {lifestyle.smoking ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.smoking}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('smoking', lifestyle.smoking)}</Text>
              </View>
            ) : null}
            {lifestyle.drinking ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.drinking}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('drinking', lifestyle.drinking)}</Text>
              </View>
            ) : null}
            {lifestyle.children ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.children}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('children', lifestyle.children)}</Text>
              </View>
            ) : null}
            {lifestyle.pets ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.pets}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('pets', lifestyle.pets)}</Text>
              </View>
            ) : null}
            {lifestyle.religion ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.religion}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('religion', lifestyle.religion)}</Text>
              </View>
            ) : null}
            {lifestyle.political ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.political}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('political', lifestyle.political)}</Text>
              </View>
            ) : null}
            {lifestyle.work_life_balance ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.workLifeBalance}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('workLifeBalance', lifestyle.work_life_balance)}</Text>
              </View>
            ) : null}
            {lifestyle.works_out ? (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>{LIFESTYLE_FIELD_LABEL.worksOut}</Text>
                <Text style={styles.lifestyleValue}>{lifestylePickerItemLabel('worksOut', lifestyle.works_out)}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.sectionEmptyHint, profileUi.sectionEmptyHint]}>
            Lifestyle not set — tap Edit to add preferences.
          </Text>
        )}
        </View>
        </ProfileEditableCardBorder>
      </Animated.View>

      {/* Legal Footer */}
      <View style={{ marginTop: 'auto', paddingTop: 20 }}>
        <LegalFooter />
      </View>
      </ScrollView>

      {profilePreviewData ? (
        <MyProfilePreviewModal
          visible={showProfilePreview}
          onClose={() => setShowProfilePreview(false)}
          data={profilePreviewData}
          photos={photos}
        />
      ) : null}

      <IntroVideoRecordModal
        visible={showIntroVideoModal}
        onClose={() => setShowIntroVideoModal(false)}
        existingVideoUrl={profile.intro_video_url ?? null}
        onSaved={(url) => {
          setShowIntroVideoModal(false);
          setData((prev) =>
            prev ? { ...prev, profile: { ...prev.profile, intro_video_url: url } } : null,
          );
          void fetchProfile();
        }}
      />

      <BetterMatchesCompleteCelebration
        visible={showEnhancementCelebration}
        onClose={handleEnhancementCelebrationClose}
      />

      {/* Photo Gallery Modal */}
      <Modal
        visible={showPhotoGallery}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoGallery(false)}
      >
        <View style={styles.photoGalleryModal}>
          <View style={styles.photoGalleryTopBar}>
            <TouchableOpacity
              style={styles.photoGalleryCloseButton}
              onPress={() => setShowPhotoGallery(false)}
              activeOpacity={0.8}
              accessibilityLabel="Close photo viewer"
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Text style={styles.photoGalleryCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          {photos.length > 0 && (
            <View style={styles.photoGalleryContent}>
              <FlatList
                ref={photoGalleryScrollRef}
                data={photos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                removeClippedSubviews={true}
                maxToRenderPerBatch={3}
                updateCellsBatchingPeriod={50}
                initialNumToRender={2}
                windowSize={3}
                getItemLayout={(_, index) => ({
                  length: Dimensions.get('window').width,
                  offset: Dimensions.get('window').width * index,
                  index,
                })}
                onMomentumScrollEnd={(event) => {
                  if (photoGalleryProgrammaticScrollRef.current) {
                    photoGalleryProgrammaticScrollRef.current = false;
                    return;
                  }
                  const index = Math.round(
                    event.nativeEvent.contentOffset.x / Dimensions.get('window').width
                  );
                  if (index >= 0 && index < photos.length) {
                    setCurrentPhotoIndex(index);
                  }
                }}
                renderItem={({ item }) => (
                  <View style={styles.photoGalleryItem}>
                    <OptimizedImage
                      source={item.url}
                      style={styles.photoGalleryImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              />
              {/* Tap left = previous, tap right = next */}
              {photos.length > 1 && (
                <View style={styles.photoGalleryTapOverlay} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.photoGalleryTapLeft}
                    activeOpacity={1}
                    onPress={() => {
                      if (currentPhotoIndex > 0) {
                        const prev = currentPhotoIndex - 1;
                        photoGalleryProgrammaticScrollRef.current = true;
                        setCurrentPhotoIndex(prev);
                        photoGalleryScrollRef.current?.scrollToIndex({ index: prev, animated: true });
                        if (Platform.OS === 'ios') Vibration.vibrate(30);
                        else Vibration.vibrate(30);
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.photoGalleryTapRight}
                    activeOpacity={1}
                    onPress={() => {
                      if (currentPhotoIndex < photos.length - 1) {
                        const next = currentPhotoIndex + 1;
                        photoGalleryProgrammaticScrollRef.current = true;
                        setCurrentPhotoIndex(next);
                        photoGalleryScrollRef.current?.scrollToIndex({ index: next, animated: true });
                        if (Platform.OS === 'ios') Vibration.vibrate(30);
                        else Vibration.vibrate(30);
                      }
                    }}
                  />
                </View>
              )}
            </View>
          )}
          
          {photos.length > 1 && (
            <View style={styles.photoGalleryIndicators}>
              <Text style={styles.photoGalleryCounter}>
                {currentPhotoIndex + 1} / {photos.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  noProfileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'transparent',
  },
  noProfileEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  noProfileText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: 'transparent',
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerGradient: {
    marginBottom: 28,
    marginHorizontal: 16,
    borderRadius: 36,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 18,
  },
  headerGradientInner: {
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  header: {
    padding: 44,
    paddingTop: 52,
    borderBottomWidth: 0,
  },
  infoCardFullTouchable: {
    width: '100%',
    alignSelf: 'stretch',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  editModalCardWide: {
    width: '100%',
    maxWidth: Math.min(420, Dimensions.get('window').width - 24),
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
  editModalGradient: {
    padding: 28,
    paddingTop: 32,
    paddingBottom: 28,
  },
  editModalEmoji: {
    fontSize: 44,
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  editModalTitleLight: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  editModalSubtitleLight: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginBottom: 20,
  },
  editModalInner: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  editModalInput: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
  },
  bioModalInput: {
    minHeight: 120,
    paddingTop: 14,
  },
  editModalSecondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  editModalButtonDisabled: {
    opacity: 0.6,
  },
  editModalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  editModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  editModalCancelPill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  editModalCancelPillText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  editModalSavePill: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  editModalSavePillText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  pickerWrapper: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  picker: {
    height: Platform.OS === 'ios' ? 160 : 50,
    width: '100%',
  },
  pickerItem: {
    fontSize: 16,
    color: '#1e293b',
  },
  preferredGendersScroll: {
    maxHeight: 280,
  },
  preferredGendersScrollContent: {
    paddingBottom: 8,
  },
  preferredGenderOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 10,
  },
  preferredGenderOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#7c3aed',
  },
  preferredMatchOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preferredMatchEmoji: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  preferredMatchCheck: {
    marginLeft: 'auto',
    fontSize: 18,
    fontWeight: '800',
    color: '#5b21b6',
  },
  preferredGenderOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  preferredGenderOptionTextActive: {
    color: '#5b21b6',
  },
  distanceModalScroll: {
    maxHeight: Math.min(420, Dimensions.get('window').height * 0.5),
    width: '100%',
  },
  distanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  distanceOptionCard: {
    width: '48%',
    minHeight: 96,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  distanceOptionCardSelected: {
    borderColor: 'rgba(13, 148, 136, 0.85)',
    backgroundColor: 'rgba(240, 253, 250, 0.98)',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  distanceOptionRing: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    borderStyle: 'dashed',
    opacity: 0.65,
  },
  distanceOptionRingSelected: {
    borderColor: 'rgba(13, 148, 136, 0.55)',
    borderStyle: 'solid',
    opacity: 1,
    backgroundColor: 'rgba(45, 212, 191, 0.12)',
  },
  distanceOptionPrimary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 4,
  },
  distanceOptionNum: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0f766e',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  distanceOptionMi: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(15, 23, 42, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  distanceOptionTag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 8,
    lineHeight: 16,
    paddingRight: 24,
  },
  distanceOptionCheckWrap: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceOptionCheck: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  avatarRing: {
    position: 'absolute',
    borderRadius: 100,
    top: -20,
    left: -20,
    zIndex: 0,
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  ringGradientOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 12,
  },
  ringInner: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    backgroundColor: 'transparent',
  },
  shimmerOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 2,
  },
  avatarRing1: {
    width: 200,
    height: 200,
  },
  avatarRing2: {
    width: 220,
    height: 220,
    top: -25,
    left: -25,
  },
  avatarRing3: {
    width: 240,
    height: 240,
    top: -30,
    left: -30,
  },
  avatarOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -50,
    left: -50,
    zIndex: -1,
    backgroundColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 15,
  },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 7,
    borderColor: '#fff',
    zIndex: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 7,
    borderColor: '#fff',
    zIndex: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#667eea',
    top: -20,
    left: -20,
    zIndex: 1,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  avatarSparkle1: {
    position: 'absolute',
    top: -5,
    right: 20,
    zIndex: 4,
    fontSize: 20,
    opacity: 0.8,
  },
  avatarSparkle2: {
    position: 'absolute',
    bottom: 10,
    left: -5,
    zIndex: 4,
    fontSize: 18,
    opacity: 0.7,
  },
  avatarSparkle3: {
    position: 'absolute',
    top: 30,
    left: -10,
    zIndex: 4,
    fontSize: 16,
    opacity: 0.6,
  },
  avatarPlaceholderText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  info: {
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
  },
  name: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 24,
    letterSpacing: -1.5,
    textAlign: 'center',
    textShadowColor: 'rgba(102, 126, 234, 0.25)',
    textShadowOffset: { width: 0, height: 6 },
    textShadowRadius: 20,
  },
  infoCardEmojiWrap: {
    marginBottom: 10,
    alignItems: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    width: '100%',
    marginBottom: 8,
    gap: 12,
  },
  profileBasicsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  profileBasicsSectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    opacity: 0.85,
  },
  profileBasicsSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  infoCardGradient: {
    flex: 1,
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 130,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  infoCardInBorder: {
    flex: 1,
    paddingVertical: 24,
    paddingHorizontal: 18,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 130,
    borderWidth: 0,
    ...(Platform.OS === 'android'
      ? { elevation: 0, shadowOpacity: 0 }
      : { shadowOpacity: 0, elevation: 0 }),
  },
  infoCardFull: {
    width: '100%',
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    minHeight: 110,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    ...(Platform.OS === 'android'
      ? { elevation: 0, shadowOpacity: 0 }
      : {
          shadowColor: '#667eea',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 4,
        }),
  },
  bioBorderWrap: {
    marginTop: 24,
  },
  infoCardEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  infoCardLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  infoCardValue: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  infoCardValueGender: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  infoCardTapHint: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.4,
  },
  ageEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  ageStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageStepBtnText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e1b4b',
    lineHeight: 28,
  },
  ageEditInput: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 36,
    fontWeight: '900',
    color: '#1e1b4b',
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(102, 126, 234, 0.45)',
  },
  ageQuickLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#4338ca',
    textAlign: 'center',
    marginBottom: 10,
  },
  ageQuickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  ageQuickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 1)',
  },
  ageQuickChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
    shadowColor: '#312e81',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  ageQuickChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e1b4b',
  },
  ageQuickChipTextActive: {
    color: '#4338ca',
  },
  infoCardValueCompact: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0,
    paddingHorizontal: 4,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  infoCardValueFull: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 22,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 10,
    width: '100%',
  },
  infoCardValueFullLong: {
    fontSize: 15,
    lineHeight: 19,
    paddingHorizontal: 6,
  },
  bioGradient: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingTop: 22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 0, shadowOpacity: 0 } : {}),
  },
  bioHeader: {
    marginBottom: 18,
  },
  bioTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  bioIcon: {
    fontSize: 22,
    marginRight: 10,
    opacity: 0.95,
  },
  bioTitle: {
    fontSize: 15,
    color: '#4f46e5',
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  bioAccentLine: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(102, 126, 234, 0.45)',
  },
  bio: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 26,
    textAlign: 'left',
    fontWeight: '500',
    letterSpacing: 0.15,
    paddingLeft: 2,
  },
  bioPlaceholder: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  bioEditContainer: {
    width: '100%',
  },
  bioInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#334155',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  bioEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 14,
  },
  bioEditCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  bioEditCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  bioEditSaveButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#667eea',
  },
  bioEditSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  sectionShell: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 32,
    marginTop: 0,
    marginHorizontal: 0,
    borderRadius: 28,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderWidth: 0,
    ...(Platform.OS === 'android'
      ? { elevation: 0, shadowOpacity: 0 }
      : { shadowOpacity: 0, elevation: 0 }),
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionEditTouchable: {
    marginLeft: 12,
    flexShrink: 0,
  },
  sectionEditLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1a1a1a',
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(102, 126, 234, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoContainer: {
    width: '30%',
    aspectRatio: 1,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#fff',
  },
  photoTapTarget: {
    width: '100%',
    height: '100%',
  },
  photoContainerDragging: {
    elevation: 20,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    borderColor: '#667eea',
    borderWidth: 4,
  },
  dragIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(102, 126, 234, 0.9)',
    borderRadius: 12,
    padding: 4,
    zIndex: 10,
  },
  dragIndicatorText: {
    fontSize: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 20,
  },
  addPhotoButton: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#667eea',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9ff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  addPhotoText: {
    fontSize: 40,
    color: '#667eea',
    fontWeight: '400',
  },
  introVideoEmptyButton: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 4,
  },
  introVideoEmptyGradient: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  introVideoEmptyEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  introVideoEmptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  introVideoEmptySubtext: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  photoHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 22,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  tagText: {
    fontSize: 15,
    color: '#667eea',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionEmptyHint: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  lookingForSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  profilePickerModalScroll: {
    maxHeight: 320,
    width: '100%',
  },
  profilePickerModalScrollTall: {
    maxHeight: 440,
    width: '100%',
  },
  lifestyleEditModalScroll: {
    maxHeight: Math.min(520, Dimensions.get('window').height * 0.58),
    width: '100%',
  },
  lifestyleEditModalBody: {
    gap: 14,
    paddingBottom: 4,
  },
  lifestyleEditFieldCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  lifestyleEditFieldAccent: {
    height: 4,
    width: '100%',
  },
  lifestyleEditFieldBody: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  lifestyleEditFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  lifestyleEditFieldEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  lifestyleEditFieldEmoji: {
    fontSize: 22,
    textAlign: 'center',
  },
  lifestyleEditFieldHeaderText: {
    flex: 1,
  },
  lifestyleEditFieldTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.2,
  },
  lifestyleEditFieldHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  lifestyleEditOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  lifestyleEditOptionChip: {
    width: '48%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lifestyleEditOptionInner: {
    minHeight: 72,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lifestyleEditOptionInnerSelected: {
    borderRadius: 14,
  },
  lifestyleEditOptionInnerIdle: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(102, 126, 234, 0.14)',
    borderRadius: 14,
  },
  lifestyleEditOptionInnerSkip: {
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  lifestyleEditOptionEmoji: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: 'center',
  },
  lifestyleEditOptionEmojiIdle: {
    fontSize: 18,
    marginBottom: 4,
    textAlign: 'center',
    opacity: 0.85,
  },
  lifestyleEditOptionTextSelected: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: 0.15,
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  lifestyleEditOptionTextIdle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 14,
  },
  lifestyleEditOptionCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifestyleEditOptionCheckMark: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  dealbreakerModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  dealbreakerChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    marginBottom: 4,
    maxWidth: '100%',
  },
  dealbreakerChipSelected: {
    borderColor: '#7c3aed',
    backgroundColor: '#ede9fe',
  },
  dealbreakerChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  dealbreakerChipTextSelected: {
    color: '#5b21b6',
  },
  lifestyleContainer: {
    gap: 12,
  },
  lifestyleItem: {
    flexDirection: 'column',
    marginBottom: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#f8f9ff',
    borderWidth: 1.5,
    borderColor: '#e0e7ff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lifestyleLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  lifestyleValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
    letterSpacing: 0.1,
    flexShrink: 0,
  },
  nameModalInner: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  nameModalInputRing: {
    borderRadius: 16,
    padding: 2,
  },
  nameModalInput: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#1e1b4b',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  nameModalCharCount: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'right',
  },
  nameModalPreview: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(237, 233, 254, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    alignItems: 'center',
  },
  nameModalPreviewLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7c3aed',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  nameModalPreviewValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e1b4b',
  },
  nameModalHint: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  photoGalleryModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoGalleryTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  photoGalleryCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  photoGalleryCloseText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  photoGalleryContent: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  photoGalleryTapOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 10,
  },
  photoGalleryTapLeft: {
    flex: 1,
  },
  photoGalleryTapRight: {
    flex: 1,
  },
  photoGalleryItem: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoGalleryImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  photoGalleryIndicators: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  photoGalleryCounter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  viewProfilePreviewButton: {
    marginTop: 4,
    marginBottom: 22,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#5b21b6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  viewProfilePreviewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  viewProfilePreviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfilePreviewIcon: {
    fontSize: 20,
  },
  viewProfilePreviewCopy: {
    flex: 1,
  },
  viewProfilePreviewText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  viewProfilePreviewSubtext: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 12,
    fontWeight: '500',
  },
  viewProfilePreviewChevron: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 26,
    fontWeight: '300',
    marginTop: -2,
  },
  viewPhotosButton: {
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  viewPhotosButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  viewPhotosButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  viewPhotosButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
