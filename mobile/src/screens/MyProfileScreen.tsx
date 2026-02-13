import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { api, getToken } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import OptimizedImage from '../components/OptimizedImage';
import { useAuth } from '../context/AuthContext';
import LegalFooter from '../components/LegalFooter';
import ConnectionQualityScore from '../components/ConnectionQualityScore';

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
    looking_for: string | null;
  };
  interests: Array<{ name: string; category: string | null }>;
  preferences: {
    min_age: number;
    max_age: number | null;
    preferred_genders: string | null;
    max_distance: number | null;
    relationship_type: string | null;
  } | null;
  dealbreakers: Array<{ description: string; category: string | null }>;
  partnerQualities: Array<{ quality: string; importance: number }>;
  lifestyle: {
    smoking: string | null;
    drinking: string | null;
    children: string | null;
    pets: string | null;
    religion: string | null;
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

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
}

const LOOKING_FOR_OPTIONS = ['Relationship', 'Something casual', 'Friendship', 'Not sure yet'];

// Values sent to API (matching uses profile.gender: "Man" | "Woman" | "Non-binary" etc.)
const PREFERRED_GENDERS_VALUES = ['Man', 'Woman', 'Other', 'Everyone'];
const PREFERRED_GENDERS_LABELS: Record<string, string> = { Man: 'Men', Woman: 'Women', Other: 'Other', Everyone: 'Everyone' };
function preferredGenderLabel(value: string) { return PREFERRED_GENDERS_LABELS[value] ?? value; }

const MAX_DISTANCE_OPTIONS: (number | null)[] = [10, 25, 50, 100, 250, 500, null]; // null = Any

export default function MyProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { refreshProfile, user } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingSlotIndex, setUploadingSlotIndex] = useState<number | null>(null);
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photoGalleryScrollRef = useRef<FlatList<Photo>>(null);
  const photoGalleryProgrammaticScrollRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const photosSectionYRef = useRef<number>(0);
  const [draggingPhotoId, setDraggingPhotoId] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const dragAnimatedValue = useRef(new Animated.ValueXY()).current;
  // Location / Max distance / Looking for / Bio edit modals and state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [showLookingForModal, setShowLookingForModal] = useState(false);
  const [showPreferredGendersModal, setShowPreferredGendersModal] = useState(false);
  const [editLocation, setEditLocation] = useState('');
  const [editMaxDistance, setEditMaxDistance] = useState<number | null>(50);
  const [editLookingFor, setEditLookingFor] = useState('');
  const [editPreferredGenders, setEditPreferredGenders] = useState<string[]>([]);
  const [showBioModal, setShowBioModal] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [updatingField, setUpdatingField] = useState(false);
  const [updatingActiveStatus, setUpdatingActiveStatus] = useState(false);
  const [reordering, setReordering] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Bump when photos change so the header avatar reloads (avoids stale image cache after upload/reorder/delete)
  const [avatarVersion, setAvatarVersion] = useState(0);
  
  // Animation for header elements
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.95)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;
  
  // Animations for stat cards
  const statCard1Anim = useRef(new Animated.Value(0)).current;
  const statCard2Anim = useRef(new Animated.Value(0)).current;
  
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

  // Edit Profile button animations (pulse + shimmer, similar to Connect button)
  const editButtonPulse = useRef(new Animated.Value(1)).current;
  const editButtonShimmer = useRef(new Animated.Value(0)).current;
  const editButtonScale = useRef(new Animated.Value(1)).current;
  const editButtonLoopsRef = useRef<{ pulseLoop: Animated.CompositeAnimation; shimmerLoop: Animated.CompositeAnimation } | null>(null);

  const startEditButtonAnimations = useCallback(() => {
    if (editButtonLoopsRef.current) return;
    editButtonPulse.setValue(1);
    editButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(editButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(editButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(editButtonShimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(editButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    editButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, []);

  const stopEditButtonAnimations = useCallback(() => {
    const loops = editButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      editButtonLoopsRef.current = null;
    }
    editButtonPulse.setValue(1);
    editButtonShimmer.setValue(0);
  }, []);

  const handleEditButtonLayout = useCallback(() => {
    stopEditButtonAnimations();
    setTimeout(() => startEditButtonAnimations(), 200);
  }, [stopEditButtonAnimations, startEditButtonAnimations]);

  useEffect(() => {
    if (!isFocused) stopEditButtonAnimations();
    return () => stopEditButtonAnimations();
  }, [isFocused, stopEditButtonAnimations]);
  
  useEffect(() => {
    if (data) {
      // Show header immediately so picture, name, and basic info are visible at top
      headerFade.setValue(1);
      headerScale.setValue(1);
      avatarScale.setValue(1);
      // Optional: subtle entrance (fast, non-blocking)
      Animated.parallel([
        Animated.spring(avatarScale, {
          toValue: 1,
          tension: 40,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Start ring animations - continuous pulsing and rotation
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
    } else {
      // Reset animations when data is cleared
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
  }, [data, isFocused]);

  useEffect(() => {
    // Only fetch data if user is authenticated
    if (user) {
      fetchProfile();
      fetchPhotos();
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Refetch when Profile tab is focused — defer so tab switch paints immediately, then refetch in background
  useFocusEffect(
    React.useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        if (user) {
          fetchProfile();
          fetchPhotos();
          fetchSettings();
        }
      });
      return () => task.cancel();
    }, [user])
  );

  // Scroll to photos section when navigated from "Add 5+ Photos" button
  useEffect(() => {
    const params = (route.params ?? {}) as { scrollToPhotos?: boolean };
    if (!params.scrollToPhotos || loading) return;
    const scrollToPhotosSection = (attempt = 0) => {
      const y = photosSectionYRef.current;
      if (y > 0 && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
        (navigation as any).setParams({ scrollToPhotos: undefined });
      } else if (attempt < 8) {
        setTimeout(() => scrollToPhotosSection(attempt + 1), 150);
      }
    };
    const t = setTimeout(() => scrollToPhotosSection(0), 200);
    return () => clearTimeout(t);
  }, [route.params, navigation, loading]);
  
  // Initialize and animate sections
  useEffect(() => {
    if (!data) return;
    
    // Create animations for each section (photos, interests, dealbreakers, partner qualities, lifestyle)
    const sectionCount = 5;
    for (let i = 0; i < sectionCount; i++) {
      if (!sectionAnims[i]) {
        sectionAnims[i] = new Animated.Value(0);
      }
    }
    
    // Staggered animation for all sections
    Animated.stagger(
      120,
      sectionAnims.map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          tension: 60,
          friction: 10,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [data]);
  
  // Animate stat cards on mount
  useEffect(() => {
    if (settings) {
      Animated.parallel([
        Animated.spring(statCard1Anim, {
          toValue: 1,
          tension: 80,
          friction: 12,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.spring(statCard2Anim, {
          toValue: 1,
          tension: 80,
          friction: 12,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [settings]);

  const fetchPhotos = async () => {
    if (!user) return;
    try {
      // Skip cache so photos uploaded in Create Profile appear immediately when opening Profile tab
      const data = await api.get<{ photos: Photo[] }>('/photos/me', false);
      const nextPhotos = data.photos || [];
      setPhotos(nextPhotos);
      // Force header avatar to reload when photo list changes (e.g. after upload)
      setAvatarVersion((v) => v + 1);
    } catch (err) {
      // Only log error if it's not an auth error
      if (err && typeof err === 'object' && 'message' in err && err.message !== 'Authentication required') {
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
      const profileData = await api.get<ProfileData>('/profile');
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
      setLoading(false);
    }
  };
  
  const fetchSettings = async () => {
    if (!user) return;
    try {
      const settingsData = await api.get<SettingsData>('/settings');
      setSettings(settingsData);
    } catch (err: any) {
      // Silently fail - settings are optional
      console.log('Could not fetch settings:', err?.message);
    }
  };

  const toggleActiveStatus = async () => {
    if (!settings || updatingActiveStatus) return;
    const next = !(settings.showActiveStatus !== false);
    setUpdatingActiveStatus(true);
    try {
      const prefs = data?.preferences;
      if (prefs) {
        let preferredGenders: string[] | null = null;
        if (prefs.preferred_genders) {
          try {
            preferredGenders = JSON.parse(prefs.preferred_genders) as string[];
          } catch {
            preferredGenders = null;
          }
        }
        await api.put('/profile/preferences', {
          minAge: prefs.min_age ?? null,
          maxAge: prefs.max_age ?? null,
          preferredGenders: preferredGenders ?? null,
          maxDistance: prefs.max_distance ?? null,
          showActiveStatus: next,
        });
      } else {
        await api.put('/profile/preferences', { showActiveStatus: next });
      }
      setSettings((prev) => prev ? { ...prev, showActiveStatus: next } : null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update active status.');
    } finally {
      setUpdatingActiveStatus(false);
    }
  };

  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect your location.');
        setDetectingLocation(false);
        return;
      }
      const locationData = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = locationData.coords;
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        { headers: { 'User-Agent': 'Mulligan-Dating-App/1.0' } }
      );
      if (!response.ok) throw new Error('Failed to reverse geocode');
      const geo = await response.json();
      const address = geo.address || {};
      const city = address.city || address.town || address.village || address.municipality || address.county || '';
      const state = address.state || address.region || address.province || address['ISO3166-2']?.split('-')[1] || '';
      if (city && state) setEditLocation(`${city}, ${state}`);
      else if (city) setEditLocation(city);
      else setEditLocation(geo.display_name || '');
    } catch (e: any) {
      Alert.alert('Location Error', e?.message || 'Could not detect location.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const saveLocation = async () => {
    if (!data?.profile) return;
    const loc = editLocation.trim() || null;
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

  const saveLookingFor = async () => {
    if (!data?.profile) return;
    const val = editLookingFor.trim() || null;
    setUpdatingField(true);
    try {
      await api.post('/profile', {
        displayName: data.profile.display_name,
        age: data.profile.age,
        gender: data.profile.gender,
        location: data.profile.location ?? null,
        bio: data.profile.bio ?? null,
        lookingFor: val,
      });
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, looking_for: val } } : null);
      setShowLookingForModal(false);
      api.clearCache('/profile');
      refreshProfile?.();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to update looking for.');
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
      await api.put('/profile/preferences', {
        minAge: prefs?.min_age ?? null,
        maxAge: prefs?.max_age ?? null,
        preferredGenders: preferredGenders ?? null,
        maxDistance: editMaxDistance,
      });
      setData((prev) => prev && prev.preferences
        ? { ...prev, preferences: { ...prev.preferences, max_distance: editMaxDistance } }
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
      const payload = (editPreferredGenders.includes('Everyone') || editPreferredGenders.length === 0)
        ? null
        : editPreferredGenders;
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
      Alert.alert('Error', e?.message || 'Failed to update preferred genders.');
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

  const handlePickImage = async (slotIndex?: number) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Please grant photo library access to upload photos. You can enable this in Settings > Privacy & Security > Photos.'
        );
        return;
      }

      if (photos.length >= 6) {
        Alert.alert('Limit reached', 'You can only upload up to 6 photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.6,
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri, slotIndex ?? -1);
      } else if (result.canceled) {
        return;
      }
    } catch (err: any) {
      console.error('Error picking image:', err);
      const errorMessage = err?.message || 'Failed to pick image';
      Alert.alert(
        'Error', 
        errorMessage + '\n\nNote: If testing on a simulator, you need to add photos to the simulator\'s photo library first by dragging images into the simulator window.'
      );
    }
  };

  const uploadPhoto = async (uri: string, slotIndex: number = -1) => {
    try {
      setUploadingSlotIndex(slotIndex);

      // Extract filename and determine MIME type
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename.toLowerCase());
      let mimeType = 'image/jpeg'; // default
      
      if (match) {
        const ext = match[1].toLowerCase();
        const mimeTypes: { [key: string]: string } = {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'gif': 'image/gif',
          'webp': 'image/webp',
        };
        mimeType = mimeTypes[ext] || 'image/jpeg';
      }

      const token = await getToken();
      if (!token || !token.trim()) {
        throw new Error('No authentication token found. Please log in again.');
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      
      console.log('📤 Uploading photo:', { uri, filename, mimeType, apiUrl: `${API_URL}/api/photos` });

      // Create FormData for React Native
      // React Native FormData requires a specific format
      const formData = new FormData();
      
      // For React Native, we need to append the file with the correct structure
      // The key must match what multer expects: 'photos' (plural, array)
      // React Native handles file:// URIs correctly, so we keep it as-is
      formData.append('photos', {
        uri: uri,
        type: mimeType,
        name: filename,
      } as any);

      console.log('📦 FormData created, sending request...');
      
      const response = await fetch(`${API_URL}/api/photos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - let fetch set it with boundary for multipart/form-data
        },
        body: formData,
      }).catch((fetchError) => {
        console.error('❌ Fetch error:', fetchError);
        throw new Error(`Network error: ${fetchError.message || 'Failed to connect to server'}`);
      });

      console.log('📥 Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('❌ Upload error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `Upload failed with status ${response.status}` };
        }
        throw new Error(errorData.error || errorData.message || `Upload failed with status ${response.status}`);
      }

      const result = await response.json().catch((parseError) => {
        console.error('❌ JSON parse error:', parseError);
        throw new Error('Invalid response from server');
      });
      
      console.log('✅ Upload successful:', result);

      // Clear cache so fetchPhotos gets fresh list; then refresh photos and profile
      api.clearCache('/photos/me');
      await Promise.all([
        fetchPhotos(),
        fetchProfile(),
        refreshProfile(),
      ]);

      Alert.alert('Success', 'Photo uploaded successfully!');
    } catch (err: any) {
      console.error('Upload error:', err);
      const errorMessage = err?.message || 'Failed to upload photo';
      console.error('Error details:', {
        message: errorMessage,
        name: err?.name,
        stack: err?.stack,
        error: err,
      });
      Alert.alert('Error', errorMessage);
    } finally {
      setUploadingSlotIndex(null);
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

  // When tab is not focused, render minimal view so leaving Profile tab is instant
  if (!isFocused) {
    return <View style={{ flex: 1 }} />;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  if (!data && !error) {
    return (
      <View style={styles.noProfileContainer}>
        <AnimatedEmoji emoji="😕" delay={0} />
        <Text style={styles.noProfileText}>You haven't created your profile yet</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigationRef.current?.navigate('CreateProfile', undefined)}
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

  return (
    <GestureHandlerRootView style={styles.wrapper}>
      {/* Beautiful gradient background */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
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
          {
            opacity: headerFade,
            transform: [{ scale: headerScale }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 245, 248, 0.95)', 'rgba(255, 255, 255, 0.98)', 'rgba(250, 250, 255, 0.95)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradientInner}
        >
          <View style={styles.header}>
            {profilePhotoUrl ? (
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
                    colors={['#f093fb', '#f5576c', '#667eea', '#764ba2', '#f093fb']}
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
                    colors={['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#4facfe']}
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
                    colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#667eea']}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Glowing orb effect behind rings */}
                <Animated.View
                  style={[
                    styles.avatarOrb,
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
                  key={`${profilePhotoUrl ?? 'no-photo'}-v${avatarVersion}`}
                  source={{ uri: profilePhotoUrl ? `${profilePhotoUrl}${profilePhotoUrl.includes('?') ? '&' : '?'}v=${avatarVersion}` : undefined }}
                  style={[
                    styles.avatar,
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
                    colors={['#f093fb', '#f5576c', '#667eea', '#764ba2', '#f093fb']}
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
                    colors={['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#4facfe']}
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
                    colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#667eea']}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ringGradient}
                  />
                </Animated.View>
                
                {/* Glowing orb effect behind rings */}
                <Animated.View
                  style={[
                    styles.avatarOrb,
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
                    style={styles.avatarPlaceholder}
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
              <Text style={styles.name}>{profile.display_name}</Text>
              
              {/* Animated Profile Stats Cards */}
              {settings && (
                <View style={styles.statsRow}>
                  <Animated.View
                    style={[
                      styles.statCardWrapper,
                      {
                        opacity: statCard1Anim,
                        transform: [{ scale: statCard1Anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.statCard}
                    >
                      <Text style={styles.statEmojiSmall}>🎉</Text>
                      <Text style={styles.statLabel}>Member Since</Text>
                      <Text style={styles.statValue} numberOfLines={1}>
                        {settings.createdAt
                          ? new Date(settings.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'N/A'}
                      </Text>
                    </LinearGradient>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.statCardWrapper,
                      {
                        opacity: statCard2Anim,
                        transform: [{ scale: statCard2Anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
                      },
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={toggleActiveStatus}
                      disabled={updatingActiveStatus}
                      style={styles.statCardTouchable}
                    >
                      <LinearGradient
                        colors={['#f093fb', '#f5576c']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.statCard, styles.statCardLastActive]}
                      >
                        <Text style={styles.statEmojiSmall}>🟢</Text>
                        <Text style={styles.statLabel}>Last Active</Text>
                        <Text style={styles.statValue} numberOfLines={1}>
                          {settings.lastActiveAt
                            ? new Date(settings.lastActiveAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Just now'}
                        </Text>
                        <Text style={styles.statSubtext} numberOfLines={1}>
                          {settings.showActiveStatus !== false ? 'Visible: On' : 'Visible: Off'}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              )}
              
              {/* Modern Info Cards Grid */}
              <View style={styles.infoGrid}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardGradient}
                >
                  <Text style={styles.infoCardEmoji}>🎂</Text>
                  <Text style={styles.infoCardLabel}>Age</Text>
                  <Text style={styles.infoCardValue}>{profile.age}</Text>
                </LinearGradient>
                
                <LinearGradient
                  colors={['#f093fb', '#f5576c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardGradient}
                >
                  <Text style={styles.infoCardEmoji}>⚧️</Text>
                  <Text style={styles.infoCardLabel}>Gender</Text>
                  <Text style={styles.infoCardValue}>{profile.gender}</Text>
                </LinearGradient>
              </View>

              {/* Location - tappable to update */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setEditLocation(profile.location || '');
                  setShowLocationModal(true);
                  if (Platform.OS === 'ios') Vibration.vibrate(50);
                  else Vibration.vibrate(50);
                }}
                style={styles.infoCardFullTouchable}
              >
                <LinearGradient
                  colors={['#4facfe', '#00f2fe']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>📍</Text>
                  <Text style={styles.infoCardLabel}>Location</Text>
                  <Text style={styles.infoCardValueFull}>{profile.location || 'Tap to add'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Max distance - tappable to update (used by matching) */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setEditMaxDistance(data?.preferences?.max_distance ?? 50);
                  setShowDistanceModal(true);
                  if (Platform.OS === 'ios') Vibration.vibrate(50);
                  else Vibration.vibrate(50);
                }}
                style={styles.infoCardFullTouchable}
              >
                <LinearGradient
                  colors={['#43e97b', '#38f9d7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>📏</Text>
                  <Text style={styles.infoCardLabel}>Max distance</Text>
                  <Text style={styles.infoCardValueFull}>
                    {data?.preferences?.max_distance == null
                      ? 'Any distance'
                      : `${data.preferences.max_distance} mi`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Preferred genders - tappable to update */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  let initial: string[] = [];
                  if (data?.preferences?.preferred_genders) {
                    try {
                      initial = JSON.parse(data.preferences.preferred_genders) as string[];
                    } catch { initial = []; }
                  }
                  if (initial.length === 0) initial = ['Everyone'];
                  setEditPreferredGenders(initial);
                  setShowPreferredGendersModal(true);
                  if (Platform.OS === 'ios') Vibration.vibrate(50);
                  else Vibration.vibrate(50);
                }}
                style={styles.infoCardFullTouchable}
              >
                <LinearGradient
                  colors={['#a78bfa', '#c084fc', '#e879f9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>👫</Text>
                  <Text style={styles.infoCardLabel}>Preferred genders</Text>
                  <Text style={styles.infoCardValueFull}>
                    {(() => {
                      const pg = data?.preferences?.preferred_genders;
                      if (!pg) return 'Everyone';
                      try {
                        const arr = JSON.parse(pg) as string[];
                        if (!arr.length || arr.includes('Everyone')) return 'Everyone';
                        return arr.map(preferredGenderLabel).join(', ');
                      } catch { return 'Everyone'; }
                    })()}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Looking For - tappable to update */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setEditLookingFor(profile.looking_for || '');
                  setShowLookingForModal(true);
                  if (Platform.OS === 'ios') Vibration.vibrate(50);
                  else Vibration.vibrate(50);
                }}
                style={styles.infoCardFullTouchable}
              >
                <LinearGradient
                  colors={['#f5576c', '#f093fb', '#667eea']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>💕</Text>
                  <Text style={styles.infoCardLabel}>Looking For</Text>
                  <Text style={styles.infoCardValueFull}>{profile.looking_for || 'Tap to add'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* About Me - tappable to open edit modal (keyboard won't cover Save/Cancel) */}
              <View style={styles.bioContainer}>
                <LinearGradient
                  colors={['rgba(102, 126, 234, 0.08)', 'rgba(240, 147, 251, 0.06)', 'rgba(102, 126, 234, 0.06)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.bioGradient}
                >
                  <View style={styles.bioHeader}>
                    <View style={styles.bioTitleRow}>
                      <Text style={styles.bioIcon}>💬</Text>
                      <Text style={styles.bioTitle}>About Me</Text>
                    </View>
                    <View style={styles.bioAccentLine} />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setEditBio(profile.bio || '');
                      setShowBioModal(true);
                      if (Platform.OS === 'ios') Vibration.vibrate(50);
                      else Vibration.vibrate(50);
                    }}
                  >
                    <Text style={[styles.bio, !profile.bio && styles.bioPlaceholder]}>
                      {profile.bio || 'Tap to add'}
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

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
              <Text style={styles.editModalSubtitleLight}>City, state, or area</Text>
              <View style={styles.editModalInner}>
                <TextInput
                  style={styles.editModalInput}
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="e.g. San Francisco, CA"
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

      {/* Looking for edit modal - gradient card */}
      <Modal visible={showLookingForModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowLookingForModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#f5576c', '#f093fb', '#667eea']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>💕</Text>
              <Text style={styles.editModalTitleLight}>What are you looking for?</Text>
              <Text style={styles.editModalSubtitleLight}>Help us show you better matches</Text>
              <View style={styles.editModalInner}>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={editLookingFor}
                    onValueChange={(v) => setEditLookingFor(v || '')}
                    style={styles.picker}
                    itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                  >
                    <Picker.Item label="Select an option" value="" />
                    {LOOKING_FOR_OPTIONS.map((opt) => (
                      <Picker.Item key={opt} label={opt} value={opt} />
                    ))}
                  </Picker>
                </View>
              </View>
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
              <Text style={styles.editModalEmoji}>👫</Text>
              <Text style={styles.editModalTitleLight}>Preferred genders</Text>
              <Text style={styles.editModalSubtitleLight}>Who you want to see in Connect</Text>
              <View style={styles.editModalInner}>
                {PREFERRED_GENDERS_VALUES.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.preferredGenderOption,
                      (editPreferredGenders.includes(opt) || (opt === 'Everyone' && (editPreferredGenders.length === 0 || editPreferredGenders.includes('Everyone')))) && styles.preferredGenderOptionActive,
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
                    <Text style={[
                      styles.preferredGenderOptionText,
                      (editPreferredGenders.includes(opt) || (opt === 'Everyone' && (editPreferredGenders.length === 0 || editPreferredGenders.includes('Everyone')))) && styles.preferredGenderOptionTextActive,
                    ]}>
                      {preferredGenderLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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

      {/* Max distance edit modal - gradient card */}
      <Modal visible={showDistanceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouchable} activeOpacity={1} onPress={() => setShowDistanceModal(false)} />
          <View style={styles.editModalCard}>
            <LinearGradient
              colors={['#43e97b', '#38f9d7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.editModalGradient}
            >
              <Text style={styles.editModalEmoji}>📏</Text>
              <Text style={styles.editModalTitleLight}>Max distance</Text>
              <Text style={styles.editModalSubtitleLight}>Matches within this distance (used by matching)</Text>
              <View style={styles.editModalInner}>
                <View style={styles.distanceOptionsRow}>
                  {MAX_DISTANCE_OPTIONS.map((value) => (
                    <TouchableOpacity
                      key={value ?? 'any'}
                      style={[
                        styles.distanceOptionButton,
                        editMaxDistance === value && styles.distanceOptionButtonActive,
                      ]}
                      onPress={() => setEditMaxDistance(value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[
                        styles.distanceOptionText,
                        editMaxDistance === value && styles.distanceOptionTextActive,
                      ]}>
                        {value == null ? 'Any' : `${value} mi`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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

      {/* Photos Section */}
      <Animated.View 
        onLayout={(e) => { photosSectionYRef.current = e.nativeEvent.layout.y; }}
        style={[
          styles.section,
          {
            opacity: sectionAnims[0] ?? sectionFallbackAnim,
            transform: [
              { 
                translateY: (sectionAnims[0] ?? sectionFallbackAnim).interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [40, 0] 
                }) 
              },
              { 
                scale: (sectionAnims[0] ?? sectionFallbackAnim).interpolate({ 
                  inputRange: [0, 1], 
                  outputRange: [0.92, 1] 
                }) 
              },
            ],
          },
        ]}
      >
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="📸" delay={0} />
          <Text style={styles.sectionTitle}> My Photos</Text>
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
                  onGestureEvent={Animated.event(
                    [{ nativeEvent: { translationX: dragAnimatedValue.x, translationY: dragAnimatedValue.y } }],
                    { useNativeDriver: false }
                  )}
                  onHandlerStateChange={(event) => {
                    const { state } = event.nativeEvent;
                    if (state === State.BEGAN && !isDragging) {
                      longPressTimerRef.current = setTimeout(() => {
                        onLongPress(photo.id, index);
                      }, 300);
                    } else if (state === State.ACTIVE && isDragging && draggingPhotoId === photo.id) {
                      const { translationX, translationY } = event.nativeEvent;
                      dragAnimatedValue.setValue({ x: translationX, y: translationY });
                    } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                      if (isDragging && draggingPhotoId === photo.id) {
                        onDragEnd(event);
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
                    <OptimizedImage
                      source={photo.url}
                      style={styles.photo}
                      resizeMode="cover"
                      showLoadingIndicator={false}
                    />
                    {index === 0 && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>Primary</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePhoto(photo.id)}
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
                disabled={uploadingSlotIndex !== null}
              >
                {uploadingSlotIndex === index ? (
                  <ActivityIndicator color="#667eea" />
                ) : (
                  <Text style={styles.addPhotoText}>+</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.photoHint}>
          {photos.length}/6 photos {photos.length < 6 && '(tap + to add)'}
        </Text>
      </Animated.View>

      {/* Interests */}
      {interests.length > 0 && (
        <Animated.View 
          style={[
            styles.section,
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
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🎯" delay={200} />
            <Text style={styles.sectionTitle}> My Interests</Text>
            <TouchableOpacity style={styles.sectionEditTouchable} onPress={() => navigationRef.current?.navigate('CreateProfile', { initialStep: 7 })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.sectionEditLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            {interests.map((interest, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{interest.name}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Dealbreakers */}
      {dealbreakers.length > 0 && (
        <Animated.View 
          style={[
            styles.section,
            {
              opacity: sectionAnims[2] ?? sectionFallbackAnim,
              transform: [
                { 
                  translateY: (sectionAnims[2] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [40, 0] 
                  }) 
                },
                { 
                  scale: (sectionAnims[2] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [0.92, 1] 
                  }) 
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🚫" delay={400} />
            <Text style={styles.sectionTitle}> My Dealbreakers</Text>
            <TouchableOpacity style={styles.sectionEditTouchable} onPress={() => navigationRef.current?.navigate('CreateProfile', { initialStep: 8 })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.sectionEditLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            {dealbreakers.map((db, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{db.description}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Partner Qualities */}
      {partnerQualities.length > 0 && (
        <Animated.View 
          style={[
            styles.section,
            {
              opacity: sectionAnims[3] ?? sectionFallbackAnim,
              transform: [
                { 
                  translateY: (sectionAnims[3] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [40, 0] 
                  }) 
                },
                { 
                  scale: (sectionAnims[3] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [0.92, 1] 
                  }) 
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="💕" delay={600} />
            <Text style={styles.sectionTitle}> What I'm Looking For</Text>
            <TouchableOpacity style={styles.sectionEditTouchable} onPress={() => navigationRef.current?.navigate('CreateProfile', { initialStep: 9 })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.sectionEditLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            {partnerQualities.map((q, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{q.quality}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Lifestyle */}
      {lifestyle && (
        <Animated.View 
          style={[
            styles.section,
            {
              opacity: sectionAnims[4] ?? sectionFallbackAnim,
              transform: [
                { 
                  translateY: (sectionAnims[4] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [40, 0] 
                  }) 
                },
                { 
                  scale: (sectionAnims[4] ?? sectionFallbackAnim).interpolate({ 
                    inputRange: [0, 1], 
                    outputRange: [0.92, 1] 
                  }) 
                },
              ],
            },
          ]}
        >
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🌱" delay={800} />
            <Text style={styles.sectionTitle}> Lifestyle</Text>
            <TouchableOpacity style={styles.sectionEditTouchable} onPress={() => navigationRef.current?.navigate('CreateProfile', { initialStep: 14 })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.sectionEditLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.lifestyleContainer}>
            {lifestyle.smoking && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Smoking:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.smoking}</Text>
              </View>
            )}
            {lifestyle.drinking && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Drinking:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.drinking}</Text>
              </View>
            )}
            {lifestyle.children && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Children:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.children}</Text>
              </View>
            )}
            {lifestyle.pets && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Pets:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.pets}</Text>
              </View>
            )}
            {lifestyle.religion && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Religion:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.religion}</Text>
              </View>
            )}
            {lifestyle.work_life_balance && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Work-Life Balance:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.work_life_balance}</Text>
              </View>
            )}
            {lifestyle.works_out && (
              <View style={styles.lifestyleItem}>
                <Text style={styles.lifestyleLabel}>Works out:</Text>
                <Text style={styles.lifestyleValue}>{lifestyle.works_out}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Edit Profile Button */}
      <View style={styles.editButton} onLayout={handleEditButtonLayout}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={() => {
            Animated.timing(editButtonScale, {
              toValue: 0.92,
              duration: 30,
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.spring(editButtonScale, {
              toValue: 1,
              friction: 6,
              tension: 300,
              useNativeDriver: true,
            }).start();
          }}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Vibration.vibrate(50);
            } else {
              Vibration.vibrate(50);
            }
            navigationRef.current?.navigate('CreateProfile', { startFromBeginning: true });
          }}
        >
          <Animated.View
            style={{
              transform: [{ scale: Animated.multiply(editButtonPulse, editButtonScale) }],
            }}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.editButtonGradient]}
            >
              <Animated.View
                style={[
                  styles.editButtonShimmer,
                  {
                    transform: [
                      { translateX: editButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, 400] }) },
                      { rotate: editButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-20deg'] }) },
                    ],
                  },
                ]}
              />
              <Text style={styles.editButtonText}>✨ Edit Profile</Text>
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Legal Footer */}
      <View style={{ marginTop: 'auto', paddingTop: 20 }}>
        <LegalFooter />
      </View>
      </ScrollView>

      {/* Photo Gallery Modal */}
      <Modal
        visible={showPhotoGallery}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPhotoGallery(false)}
      >
        <View style={styles.photoGalleryModal}>
          {/* Top Bar with Close, Delete, and Add buttons */}
          <View style={styles.photoGalleryTopBar}>
            <TouchableOpacity
              style={styles.photoGalleryCloseButton}
              onPress={() => setShowPhotoGallery(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.photoGalleryCloseText}>✕</Text>
            </TouchableOpacity>
            
            <View style={styles.photoGalleryActions}>
              {/* Delete Button */}
              {photos.length > 0 && photos[currentPhotoIndex] && (
                <TouchableOpacity
                  style={styles.photoGalleryDeleteButton}
                  onPress={async () => {
                    const photoToDelete = photos[currentPhotoIndex];
                    if (photoToDelete) {
                      Alert.alert(
                        'Delete Photo',
                        'Are you sure you want to delete this photo?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await handleDeletePhoto(photoToDelete.id);
                                // If we deleted the last photo, close gallery
                                if (photos.length === 1) {
                                  setShowPhotoGallery(false);
                                } else {
                                  // Adjust index if needed
                                  const newIndex = Math.min(currentPhotoIndex, photos.length - 2);
                                  setCurrentPhotoIndex(newIndex >= 0 ? newIndex : 0);
                                }
                                // Haptic feedback
                                if (Platform.OS === 'ios') {
                                  Vibration.vibrate([0, 50]);
                                } else {
                                  Vibration.vibrate(50);
                                }
                              } catch (error) {
                                console.error('Failed to delete photo:', error);
                              }
                            },
                          },
                        ]
                      );
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.photoGalleryDeleteText}>🗑️</Text>
                </TouchableOpacity>
              )}
              
              {/* Add Photo Button */}
              {photos.length < 6 && (
                <TouchableOpacity
                  style={styles.photoGalleryAddButton}
                  onPress={async () => {
                    try {
                      await handlePickImage(photos.length); // next empty slot shows spinner
                      if (Platform.OS === 'ios') {
                        Vibration.vibrate([0, 50]);
                      } else {
                        Vibration.vibrate(50);
                      }
                    } catch (error) {
                      console.error('Failed to upload photo:', error);
                    }
                  }}
                  disabled={uploadingSlotIndex !== null}
                  activeOpacity={0.8}
                >
                  {uploadingSlotIndex !== null ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.photoGalleryAddText}>➕</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
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
    marginBottom: 10,
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
  preferredGenderOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  preferredGenderOptionTextActive: {
    color: '#5b21b6',
  },
  distanceOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  distanceOptionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  distanceOptionButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#0d9488',
  },
  distanceOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f766e',
  },
  distanceOptionTextActive: {
    color: '#0d9488',
    fontWeight: '800',
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
    width: '100%',
  },
  statCardWrapper: {
    flex: 1,
  },
  statCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  statCardLastActive: {
    minHeight: 110,
  },
  statEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  statEmojiSmall: {
    fontSize: 26,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.95)',
    marginBottom: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  statValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statCardTouchable: {
    flex: 1,
  },
  statSubtext: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
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
  infoCardFull: {
    width: '100%',
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    minHeight: 110,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
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
  infoCardValueFull: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 8,
  },
  bioContainer: {
    marginTop: 24,
    width: '100%',
  },
  bioGradient: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingTop: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.18)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    overflow: 'hidden',
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
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 32,
    marginTop: 24,
    marginHorizontal: 16,
    borderRadius: 32,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionEditTouchable: {
    marginLeft: 'auto',
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
  lifestyleContainer: {
    gap: 12,
  },
  lifestyleItem: {
    flexDirection: 'row',
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
    marginRight: 16,
    minWidth: 160,
    letterSpacing: 0.3,
  },
  lifestyleValue: {
    fontSize: 16,
    color: '#1a1a1a',
    flex: 1,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  editButton: {
    marginHorizontal: 20,
    marginTop: 32,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 16,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  editButtonGradient: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  editButtonShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-20deg' }],
  },
  editButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
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
    justifyContent: 'space-between',
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
  photoGalleryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  photoGalleryDeleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  photoGalleryDeleteText: {
    fontSize: 20,
  },
  photoGalleryAddButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  photoGalleryAddText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '600',
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
