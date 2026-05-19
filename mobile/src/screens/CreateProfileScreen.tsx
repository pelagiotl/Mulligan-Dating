/**
 * Create Profile Screen
 * Multi-step profile creation form
 * Converted from web version to React Native
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
  FlatList,
  Dimensions,
  useWindowDimensions,
  Keyboard,
  Vibration,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { api, getToken, ensureTokenPrefetched } from '../utils/api';
import { handleLocationChange, hasCityAndState } from '../utils/locationUtils';
import ProfileCompleteCelebration from '../components/ProfileCompleteCelebration';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OptimizedImage from '../components/OptimizedImage';
import {
  DEALBREAKER_SUGGESTIONS,
  DEALBREAKER_EMOJI,
  DEALBREAKER_CANONICAL_SET,
  canonicalDealbreakerLabel,
  PARTNER_QUALITY_OPTIONS,
  PARTNER_QUALITY_EMOJI,
  LIFESTYLE_FIELD_OPTIONS,
  LIFESTYLE_FIELD_LABEL,
  LIFESTYLE_FIELD_EMOJI,
  lifestyleFormFromApi,
  lifestyleOptionParts,
  type LifestyleFieldKey,
  type LifestyleForm,
} from '../constants/profileMySections';

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

const GENDER_OPTIONS = ['Man', 'Woman', 'Other'];
// API values: Man, Woman. "Everyone" = match all. Display labels: Men, Women, Everyone.
const PREFERRED_GENDER_OPTIONS = ['Man', 'Woman', 'Everyone'] as const;
const PREFERRED_GENDER_LABELS: Record<string, string> = { Man: 'Men', Woman: 'Women', Everyone: 'Everyone' };
function preferredGenderDisplayLabel(value: string) { return PREFERRED_GENDER_LABELS[value] ?? value; }

/** API: null = everyone; otherwise only Man/Woman (no legacy Other). */
function preferredGendersPayload(g: string[]): string[] | null {
  if (g.includes('Everyone') || g.length === 0) return null;
  const only = g.filter((x) => x === 'Man' || x === 'Woman');
  return only.length > 0 ? only : null;
}
const INTEREST_OPTIONS = [
  'Travel', 'Music', 'Sports', 'Cooking', 'Reading', 'Movies', 'Fitness', 'Art',
  'Photography', 'Dancing', 'Gaming', 'Fortnite', 'Hiking', 'Yoga', 'Writing', 'Technology',
  'Fashion', 'Animals', 'Volunteering', 'Coffee', 'Nightlife', 'Comedy',
  'Beach', 'Camping', 'Board Games', 'Tattoos', 'Meditation', 'History', 'Science',
  'Business', 'Education'
]

// Emoji mapping for interests
const INTEREST_EMOJIS: { [key: string]: string } = {
  'Travel': '✈️',
  'Music': '🎵',
  'Sports': '⚽',
  'Cooking': '👨‍🍳',
  'Reading': '📚',
  'Movies': '🎬',
  'Fitness': '💪',
  'Art': '🎨',
  'Photography': '📸',
  'Dancing': '💃',
  'Gaming': '🎮',
  'Fortnite': '⛏️',
  'Hiking': '🥾',
  'Yoga': '🧘',
  'Writing': '✍️',
  'Technology': '💻',
  'Fashion': '👗',
  'Animals': '🐾',
  'Volunteering': '🤝',
  'Coffee': '☕',
  'Nightlife': '🌃',
  'Comedy': '😂',
  'Beach': '🏖️',
  'Camping': '⛺',
  'Board Games': '🎲',
  'Tattoos': '🖋️',
  'Meditation': '🧘‍♀️',
  'History': '📜',
  'Science': '🔬',
  'Business': '💼',
  'Education': '🎓',
};

const TOTAL_STEPS = 14; // 1-6 basics; 7 interests; 8 dealbreakers; 9 partner qualities; 10 lifestyle; 11-13 age/distance; 14 photos
const MIN_PHOTOS_REQUIRED = 3;

export default function CreateProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as { startFromBeginning?: boolean; initialStep?: number } | undefined;
  const startFromBeginning = routeParams?.startFromBeginning === true;
  const initialStep = routeParams?.initialStep;
  const { refreshProfile, profile: existingProfile, connectSetupComplete, logout } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [savingInCreateProfile, setSavingInCreateProfile] = useState(false);
  const [error, setError] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const step1ScrollViewRef = useRef<ScrollView>(null);
  const step5ScrollViewRef = useRef<ScrollView>(null);
  
  // Refs for step 1 cards (for vertical scrolling)
  const displayNameCardRef = useRef<View>(null);
  const ageCardRef = useRef<View>(null);
  const genderCardRef = useRef<View>(null);
  const locationCardRef = useRef<View>(null);
  const bioCardRef = useRef<View>(null);
  
  // Y positions for step 1 cards
  const [displayNameCardY, setDisplayNameCardY] = useState<number | null>(null);
  const [ageCardY, setAgeCardY] = useState<number | null>(null);
  const [genderCardY, setGenderCardY] = useState<number | null>(null);
  const [locationCardY, setLocationCardY] = useState<number | null>(null);
  const [bioCardY, setBioCardY] = useState<number | null>(null);
  const displayNameInputRef = useRef<TextInput>(null);
  const ageInputRef = useRef<TextInput>(null);
  const locationInputRef = useRef<TextInput>(null);
  const genderFieldRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const displayNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const maxAgeCardRef = useRef<View>(null);
  const preferredGendersRef = useRef<View>(null);
  const maxDistanceInputRef = useRef<TextInput>(null);
  
  // Helper function to scroll to a card in step 1
  const scrollToStep1Card = (cardY: number | null, offset: number = 0) => {
    if (cardY !== null && step1ScrollViewRef.current) {
      step1ScrollViewRef.current.scrollTo({
        y: cardY + offset,
        animated: true,
      });
    }
  };
  
  // Animation values for match preferences (steps 8–10: age / distance)
  const minAgeScale = useRef(new Animated.Value(0.95)).current;
  const minAgeOpacity = useRef(new Animated.Value(0)).current;
  const minAgeGlow = useRef(new Animated.Value(0)).current;
  const maxAgeScale = useRef(new Animated.Value(0.95)).current;
  const maxAgeOpacity = useRef(new Animated.Value(0)).current;
  const maxAgeGlow = useRef(new Animated.Value(0)).current;
  const preferredGendersScale = useRef(new Animated.Value(0.95)).current;
  const preferredGendersOpacity = useRef(new Animated.Value(0)).current;
  const preferredGendersGlow = useRef(new Animated.Value(0)).current;
  const maxDistanceScale = useRef(new Animated.Value(0.95)).current;
  const maxDistanceOpacity = useRef(new Animated.Value(0)).current;
  const maxDistanceGlow = useRef(new Animated.Value(0)).current;
  const firstNameScale = useRef(new Animated.Value(0.95)).current;
  const firstNameOpacity = useRef(new Animated.Value(0)).current;
  const firstNameGlow = useRef(new Animated.Value(0)).current;
  const ageScale = useRef(new Animated.Value(0.95)).current;
  const ageOpacity = useRef(new Animated.Value(0)).current;
  const ageGlow = useRef(new Animated.Value(0)).current;
  const genderScale = useRef(new Animated.Value(0.95)).current;
  const genderOpacity = useRef(new Animated.Value(0)).current;
  const genderGlow = useRef(new Animated.Value(0)).current;
  const locationScale = useRef(new Animated.Value(0.95)).current;
  const locationOpacity = useRef(new Animated.Value(0)).current;
  const locationGlow = useRef(new Animated.Value(0)).current;
  const bioScale = useRef(new Animated.Value(0.95)).current;
  const bioOpacity = useRef(new Animated.Value(0)).current;
  const bioGlow = useRef(new Animated.Value(0)).current;

  // Step 1: Basic Info
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);

  const [interests, setInterests] = useState<string[]>([]);
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);
  const [partnerQualities, setPartnerQualities] = useState<string[]>([]);
  const [lifestyleForm, setLifestyleForm] = useState<LifestyleForm>(() => lifestyleFormFromApi(null));

  // Match preferences (age range, genders, distance)
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [preferredGenders, setPreferredGenders] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number | null>(50);
  const [maxAgeCardY, setMaxAgeCardY] = useState<number | null>(null);
  const [preferredGendersCardY, setPreferredGendersCardY] = useState<number | null>(null);

  // Photos (final step)
  const [photos, setPhotos] = useState<Array<{ id?: string; url: string; uri?: string }>>([]);
  const [uploadingSlotIndex, setUploadingSlotIndex] = useState<number | null>(null);

  // Track keyboard visibility
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      // Cleanup timeout on unmount
      if (displayNameTimeoutRef.current) {
        clearTimeout(displayNameTimeoutRef.current);
      }
    };
  }, []);

  // Responsive scaling based on device size (375pt = iPhone 8/SE baseline, 430pt = Pro Max)
  const rs = React.useMemo(() => {
    const w = screenWidth;
    const h = screenHeight;
    const scaleW = Math.min(Math.max(w / 375, 0.9), 1.15);
    const scaleH = Math.min(Math.max(h / 812, 0.85), 1.1);
    return {
      sectionMinHeight: h * 0.62,
      sectionPaddingH: Math.round(20 * scaleW),
      sectionPaddingV: Math.round(36 * scaleH),
      cardPadding: Math.round(36 * scaleW),
      cardPaddingFirst: Math.round(44 * scaleW),
      cardPaddingKeyboard: Math.round(22 * scaleW),
      emojiSize: Math.round(72 * scaleW),
      emojiSizeSmall: Math.round(42 * scaleW),
      titleSize: Math.round(32 * scaleW),
      titleSizeSmall: Math.round(22 * scaleW),
      titleSizeCompact: Math.round(28 * scaleW),
      titleMargin: Math.round(12 * scaleH),
      subtitleSize: Math.round(18 * scaleW),
      subtitleSizeSmall: Math.round(13 * scaleW),
      subtitleSizeTiny: Math.max(9, Math.round(10 * scaleW)),
      subtitleSizeCompact: Math.round(16 * scaleW),
      subtitleMargin: Math.round(32 * scaleH),
      subtitleMarginSmall: Math.round(14 * scaleH),
      lifestyleCardPadding: Math.round(24 * scaleW),
      lifestyleEmojiSize: Math.round(44 * scaleW),
      lifestyleTitleSize: Math.round(22 * scaleW),
      lifestyleSubtitleSize: Math.round(13 * scaleW),
    };
  }, [screenWidth, screenHeight]);

  // Animate and focus the active basic-info field when on steps 1-6 (basics + preferred + location + bio)
  useEffect(() => {
    const anim = (s: Animated.Value, o: Animated.Value, g: Animated.Value) => {
      Animated.parallel([
        Animated.spring(s, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.loop(Animated.sequence([
          Animated.timing(g, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(g, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])),
      ]).start();
    };
    if (step === 1) {
      anim(firstNameScale, firstNameOpacity, firstNameGlow);
    } else if (step === 2) {
      anim(ageScale, ageOpacity, ageGlow);
    } else if (step === 3) {
      anim(genderScale, genderOpacity, genderGlow);
    } else if (step === 4) {
      anim(preferredGendersScale, preferredGendersOpacity, preferredGendersGlow);
    } else if (step === 5) {
      anim(locationScale, locationOpacity, locationGlow);
    } else if (step === 6) {
      anim(bioScale, bioOpacity, bioGlow);
    } else {
      [firstNameScale, ageScale, genderScale, preferredGendersScale, locationScale, bioScale].forEach(s => s.setValue(0.95));
      [firstNameOpacity, ageOpacity, genderOpacity, preferredGendersOpacity, locationOpacity, bioOpacity].forEach(o => o.setValue(0));
      [firstNameGlow, ageGlow, genderGlow, preferredGendersGlow, locationGlow, bioGlow].forEach(g => g.setValue(0));
    }
  }, [step]);

  // Helper function to animate a field
  const animateField = (
    scale: Animated.Value,
    opacity: Animated.Value,
    glow: Animated.Value
  ) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  };

  // Discover preferences (steps 11–13): min age, max age, max distance
  useEffect(() => {
    if (step === 11) {
      animateField(minAgeScale, minAgeOpacity, minAgeGlow);
    }
  }, [step]);

  useEffect(() => {
    if (step === 12) animateField(maxAgeScale, maxAgeOpacity, maxAgeGlow);
  }, [step]);
  useEffect(() => {
    if (step === 13) {
      animateField(maxDistanceScale, maxDistanceOpacity, maxDistanceGlow);
    }
  }, [step]);

  // Load existing profile into form (used when editing; skip when startFromBeginning = new account/delete)
  const loadProfileForForm = useCallback(async (stepToJumpTo?: number) => {
    try {
      // Bypass cache when editing so we always get current server data
      const data = await api.get('/profile', false);
      if (data?.profile) {
        setDisplayName(data.profile.display_name ?? '');
        setAge((data.profile.age ?? '').toString());
        setGender(data.profile.gender ?? '');
        setLocation(data.profile.location ?? '');
        setBio(data.profile.bio ?? '');
        if (data.interests?.length) {
          setInterests(data.interests.map((i: any) => i.name));
        }
        if (data.dealbreakers?.length) {
          const fromApi = (data.dealbreakers as { description?: string }[])
            .map((d) => canonicalDealbreakerLabel(d.description ?? ''))
            .filter((x): x is NonNullable<typeof x> => x != null && DEALBREAKER_CANONICAL_SET.has(x));
          setDealbreakers(Array.from(new Set(fromApi)));
        } else {
          setDealbreakers([]);
        }
        if (data.partnerQualities?.length) {
          setPartnerQualities((data.partnerQualities as { quality: string }[]).map((q) => q.quality));
        } else {
          setPartnerQualities([]);
        }
        setLifestyleForm(lifestyleFormFromApi(data.lifestyle ?? null));
        if (data.preferences) {
          setMinAge(data.preferences.min_age ?? 18);
          setMaxAge((data.preferences as any).max_age ?? 100);
          setMaxDistance(data.preferences.max_distance ?? 50);
          if (data.preferences.preferred_genders) {
            try {
              const genders = JSON.parse(data.preferences.preferred_genders) as string[];
              const withoutOther = genders.filter((g) => g !== 'Other');
              const legacyAllThree =
                genders.length === 3 && ['Man', 'Woman', 'Other'].every((g) => genders.includes(g));
              const isEveryone =
                genders.includes('Everyone') ||
                genders.length === 0 ||
                legacyAllThree ||
                (withoutOther.length === 0 && genders.length > 0);
              setPreferredGenders(isEveryone ? ['Everyone'] : withoutOther);
            } catch {
              setPreferredGenders(['Everyone']);
            }
          } else {
            setPreferredGenders(['Everyone']);
          }
        }
        const targetStep = stepToJumpTo ?? initialStep;
        if (targetStep != null && targetStep >= 1 && targetStep <= TOTAL_STEPS) {
          setStep(targetStep);
        }
      }
    } catch (err) {
      if (__DEV__) console.log('CreateProfile loadProfileForForm:', err);
    }
  }, [initialStep]);

  // Load profile on mount and when edit params change (not when startFromBeginning = new account/delete)
  useEffect(() => {
    if (startFromBeginning) return;
    loadProfileForForm(initialStep ?? undefined);
  }, [startFromBeginning, initialStep, loadProfileForForm]);

  // Prefetch auth token on mount (handles AsyncStorage timing / cache sync after login)
  useEffect(() => {
    ensureTokenPrefetched();
  }, []);

  // Save profile data and load existing photos when entering final (photos) step
  const profileSavedRef = useRef(false);
  
  useEffect(() => {
    const saveProfileAndLoadPhotos = async () => {
      if (step === 14 && !profileSavedRef.current) {
        // Mark as saving to prevent duplicate calls
        profileSavedRef.current = true;
        
        // Run all saves sequentially to ensure profile exists before other operations
        setTimeout(async () => {
          try {
            console.log('💾 Saving profile data before photo upload...');
            
            // Ensure auth token is loaded (handles cache timing / AsyncStorage race)
            await ensureTokenPrefetched();
            let token = await getToken();
            if (!token || typeof token !== 'string' || !token.trim()) {
              await new Promise((r) => setTimeout(r, 200));
              token = await getToken();
            }
            if (!token || typeof token !== 'string' || !token.trim()) {
              profileSavedRef.current = false;
              setError('Session expired. Please log in again.');
              return;
            }
            
            // First, save basic profile (required for photos endpoint and other operations)
            try {
              await api.post('/profile', {
                displayName,
                age: parseInt(age),
                gender,
                location,
                bio,
                lookingFor: null,
              });
              console.log('✅ Basic profile saved');
              
              // Small delay to ensure profile is fully committed to database
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err: any) {
              console.error('❌ Failed to save basic profile:', err?.message || err);
              const isAuthError = err?.status === 401 || (typeof err?.message === 'string' && err.message.toLowerCase().includes('authentication'));
              if (isAuthError) {
                // Avoid forcing logout from this background save path: transient auth/network
                // hiccups during onboarding can otherwise bounce users back to login + age gate.
                setError('Session issue while saving. Please tap Complete Profile again.');
              } else {
                setError(`Failed to save profile: ${err?.message || 'Please try again'}`);
              }
              profileSavedRef.current = false; // Allow retry
              return;
            }

            // Now save other data sequentially (profile must exist first)
            try {
              // Add interests
              if (interests.length > 0) {
                await api.put('/profile/interests', {
                  interests: interests.map(name => ({ name }))
                });
                console.log('✅ Interests saved');
              }
            } catch (err: any) {
              console.error('⚠️ Failed to save interests:', err?.message || err);
              // Continue - non-critical
            }

            try {
              await api.put('/profile/dealbreakers', {
                dealbreakers: dealbreakers.filter((d) => DEALBREAKER_CANONICAL_SET.has(d)),
              });
              console.log('✅ Dealbreakers saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save dealbreakers:', err?.message || err);
            }

            try {
              await api.put('/profile/partner-qualities', {
                qualities: partnerQualities.map((quality) => ({ quality, importance: 5 })),
              });
              console.log('✅ Partner qualities saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save partner qualities:', err?.message || err);
            }

            try {
              await api.put('/profile/lifestyle', {
                smoking: lifestyleForm.smoking || null,
                drinking: lifestyleForm.drinking || null,
                children: lifestyleForm.children || null,
                pets: lifestyleForm.pets || null,
                religion: lifestyleForm.religion || null,
                political: lifestyleForm.political || null,
                workLifeBalance: lifestyleForm.workLifeBalance || null,
                worksOut: lifestyleForm.worksOut || null,
              });
              console.log('✅ Lifestyle saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save lifestyle:', err?.message || err);
            }

            try {
              // Save preferences
              await api.put('/profile/preferences', {
                minAge,
                maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
                preferredGenders: preferredGendersPayload(preferredGenders),
                maxDistance,
                relationshipType: null
              });
              console.log('✅ Preferences saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save preferences:', err?.message || err);
              // Continue - non-critical
            }

            console.log('✅ All profile data saved successfully');

            // Load existing photos in parallel (non-blocking)
            if (photos.length === 0) {
              api.get('/photos/me').then((data) => {
                if (data.photos && Array.isArray(data.photos)) {
                  setPhotos(data.photos.map((photo: any) => ({
                    id: photo.id,
                    url: photo.url,
                  })));
                }
              }).catch((err) => {
                console.log('No existing photos found');
              });
            }
          } catch (err: any) {
            console.error('❌ Error saving profile data:', err);
            // Reset flag so user can try again
            profileSavedRef.current = false;
            setError(`Failed to save profile: ${err?.message || 'Please try again'}`);
          }
        }, 0); // Run asynchronously
      }
    };
    saveProfileAndLoadPhotos();
  }, [step]);

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

      // Reverse geocode using Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Mulligan-Dating-App/1.0'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reverse geocode');
      }

      const data = await response.json();
      const address = data.address || {};
      
      // Log the full address object for debugging
      console.log('📍 Full address data:', JSON.stringify(address, null, 2));
      console.log('📍 Display name:', data.display_name);
      console.log('📍 All address keys:', Object.keys(address));
      
      // Try multiple fields for city
      const city = address.city || 
                   address.town || 
                   address.village || 
                   address.municipality || 
                   address.county || 
                   address.city_district || 
                   address.suburb ||
                   '';
      
      // For state, check ALL possible fields that might contain it
      // Nominatim can return state in various fields depending on the location
      let state = '';
      
      // Direct state fields (most common)
      state = address.state || 
              address.region || 
              address.province ||
              address.administrative ||
              address.administrative_area ||
              '';
      
      // If still not found, check for state code
      if (!state && address.state_code) {
        state = address.state_code;
      }
      
      // Check ISO3166-2 which contains state code (e.g., "US-CA" or "US-CA-075")
      if (!state && address['ISO3166-2']) {
        const isoParts = address['ISO3166-2'].split('-');
        if (isoParts.length >= 2) {
          state = isoParts[1]; // Get the state code part (e.g., "CA")
          console.log('📍 Found state code from ISO3166-2:', state);
        }
      }
      
      // Check state_district (sometimes used for US states)
      if (!state && address.state_district) {
        state = address.state_district;
      }
      
      // Last resort: check all keys in address object for any state-related field
      if (!state) {
        const addressKeys = Object.keys(address);
        for (const key of addressKeys) {
          const value = address[key];
          const keyLower = key.toLowerCase();
          
          // Check if key name suggests it might be a state
          if ((keyLower.includes('state') || 
               keyLower.includes('region') || 
               keyLower.includes('province') ||
               keyLower.includes('administrative')) && 
              typeof value === 'string' && 
              value.length > 0 && 
              value.length < 50 && // Reasonable state name length
              value !== city) { // Make sure it's not the city
            state = value;
            console.log(`📍 Found state in field "${key}":`, state);
            break;
          }
        }
      }
      
      const country = address.country || address.country_code || '';
      
      console.log('📍 Extracted (first pass):', { city, state, country });

      // If we still don't have state but have city and country is US/Canada, parse display_name
      if ((country === 'United States' || country === 'Canada') && city && !state) {
        const displayName = data.display_name || '';
        console.log('📍 Parsing display_name for state:', displayName);
        
        // Nominatim display_name format is usually: "City, State, Country" or "City, County, State, Country"
        // Try multiple patterns
        const patterns = [
          // Pattern: "City, State, Country"
          new RegExp(`${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*([^,]+),\\s*(?:United States|Canada|USA)`, 'i'),
          // Pattern: "City, County, State, Country" 
          new RegExp(`${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*[^,]+,\\s*([^,]+),\\s*(?:United States|Canada|USA)`, 'i'),
          // Pattern: any comma-separated value before "United States" or "Canada"
          /([^,]+),\s*(?:United States|Canada|USA)$/i,
          // Pattern: second-to-last item before country
          /([^,]+),\s*[^,]+,\s*(?:United States|Canada|USA)$/i,
        ];
        
        for (const pattern of patterns) {
          const match = displayName.match(pattern);
          if (match && match[1]) {
            const potentialState = match[1].trim();
            // Make sure it's not the city itself and not a number (like zip code)
            if (potentialState !== city && !/^\d+$/.test(potentialState)) {
              state = potentialState;
              console.log('📍 Extracted state from display_name:', state);
              break;
            }
          }
        }
      }
      
      console.log('📍 Final extracted:', { city, state, country });
      console.log('📍 Full response data:', JSON.stringify(data, null, 2));

      // If we still don't have state, try parsing display_name more aggressively
      if ((country === 'United States' || country === 'Canada') && city && !state) {
        const displayName = data.display_name || '';
        console.log('📍 Attempting aggressive parsing of display_name:', displayName);
        
        // Split by comma and analyze parts
        const parts = displayName.split(',').map(p => p.trim());
        console.log('📍 Display name parts:', parts);
        
        // For US/Canada, the state is usually the second-to-last or third-to-last part
        // Format is often: "City, County, State, Country" or "City, State, Country"
        if (parts.length >= 3) {
          // Try to find the state - it's usually before "United States" or "Canada"
          const countryIndex = parts.findIndex(p => 
            p.toLowerCase().includes('united states') || 
            p.toLowerCase().includes('usa') || 
            p.toLowerCase() === 'canada'
          );
          
          if (countryIndex > 1) {
            // State should be at countryIndex - 1
            const potentialState = parts[countryIndex - 1];
            // Make sure it's not the city and not a zip code
            if (potentialState && potentialState !== city && !/^\d{5}(-\d{4})?$/.test(potentialState)) {
              state = potentialState;
              console.log('📍 Found state via aggressive parsing:', state);
            }
          } else if (parts.length >= 2) {
            // Try the second part if it's not a number
            const secondPart = parts[1];
            if (secondPart && secondPart !== city && !/^\d+$/.test(secondPart)) {
              state = secondPart;
              console.log('📍 Using second part as state:', state);
            }
          }
        }
        
        // Last resort: try to extract from display_name using regex
        if (!state && displayName) {
          // Pattern: "City, State" or "City, County, State" before country
          const stateMatch = displayName.match(/,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*,\s*(?:United States|USA|Canada)/);
          if (stateMatch && stateMatch[1] && stateMatch[1] !== city) {
            state = stateMatch[1];
            console.log('📍 Extracted state via regex:', state);
          }
        }
      }
      
      console.log('📍 Final result after all parsing:', { city, state, country });

      // Set the location - always try to include state for US/Canada
      if (country === 'United States' || country === 'Canada' || country === 'USA' || country === 'US') {
        if (city && state) {
          const locationString = `${city}, ${state}`;
          console.log('✅ Setting location with state:', locationString);
          setLocation(locationString);
        } else if (city) {
          // If we have city but no state, parse from display_name as last resort
          const displayName = data.display_name || '';
          console.warn('⚠️ City found but no state in address object. Parsing display_name:', displayName);
          
          // Try to extract state from display_name: "San Francisco, California, United States"
          const parts = displayName.split(',').map(p => p.trim());
          const countryIndex = parts.findIndex(p => 
            p.toLowerCase().includes('united states') || 
            p.toLowerCase().includes('usa') || 
            p.toLowerCase() === 'canada'
          );
          
          if (countryIndex > 0 && parts[countryIndex - 1] && parts[countryIndex - 1] !== city) {
            const extractedState = parts[countryIndex - 1];
            const locationString = `${city}, ${extractedState}`;
            console.log('✅ Extracted state from display_name, setting location:', locationString);
            setLocation(locationString);
            locationInputRef.current?.blur();
          } else {
            // Show debug alert if we still can't find state
            console.error('❌ Could not extract state. Showing debug info.');
            Alert.alert(
              'Location Debug',
              `City: ${city}\nState: ${state || 'NOT FOUND'}\nCountry: ${country}\n\nDisplay Name: ${data.display_name || 'N/A'}\n\nAddress keys: ${Object.keys(address).join(', ')}\n\nAddress values: ${JSON.stringify(address)}`,
              [{ text: 'OK' }]
            );
            setLocation(city);
            locationInputRef.current?.blur();
          }
        } else {
          setLocation('');
        }
      } else if (city && country) {
        setLocation(`${city}, ${country}`);
      } else if (city) {
        setLocation(city);
      } else {
        setLocation('');
      }
    } catch (error: any) {
      console.log('Could not detect location:', error.message);
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      if (!displayName?.trim() || displayName.trim().length < 2) {
        setError('Please enter at least 2 characters for your name');
        return;
      }
    }
    if (step === 2) {
      const ageNum = parseInt(age);
      if (!age?.trim() || isNaN(ageNum) || ageNum < 18 || ageNum > 120) {
        setError('Please enter a valid age (18-120)');
        return;
      }
    }
    if (step === 3) {
      if (!gender?.trim()) {
        setError('Please select your gender');
        return;
      }
    }
    if (step === 4) {
      if (preferredGenders.length < 1) {
        setError('Please choose who you’d like to match with (select Everyone if you’re open to anyone)');
        return;
      }
    }
    if (step === 5) {
      if (!location?.trim()) {
        setError('Please enter your location');
        return;
      }
      if (!hasCityAndState(location)) {
        setError('Please enter both city and state (e.g. Medford, Oregon)');
        return;
      }
    }
    // Step 6 (bio) - optional
    if (step === 7) {
      if (interests.length < 3) {
        setError('Please select at least 3 interests');
        return;
      }
    }
    if (step === 11) {
      if (minAge === null || minAge < 18) {
        setError('Minimum age must be 18 or older');
        return;
      }
    }
    if (step === 12) {
      if (maxAge === null || maxAge < (minAge ?? 18)) {
        setError('Maximum age must be at least ' + (minAge ?? 18));
        return;
      }
    }
    if (step === 13) {
      if (maxDistance === null || maxDistance < 1) {
        setError('Please enter a maximum distance (at least 1 mile)');
        return;
      }
    }
    
    Keyboard.dismiss();
    if (Platform.OS === 'ios') Vibration.vibrate(50);
    else Vibration.vibrate(50);
    setError('');
    
    const nextStep = step + 1;
    if (nextStep > TOTAL_STEPS) {
      setError('Invalid step number');
      return;
    }
    
    // If moving to final step (photos), validation happens on submit
    
    try {
      setStep(nextStep);
    } catch (error: any) {
      console.error('Error advancing to next step:', error);
      console.error('Current step:', step, 'Next step:', nextStep);
      setError('An error occurred. Please try again.');
    }
  };

  const handleBack = () => {
    Keyboard.dismiss();
    if (step > 1) setStep(step - 1);
  };

  const uploadPhoto = async (uri: string, slotIndex: number) => {
    try {
      setUploadingSlotIndex(slotIndex);
      setError(''); // Clear any previous errors

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

      // Ensure auth token is loaded (handles cache timing / AsyncStorage race)
      await ensureTokenPrefetched();
      let token = await getToken();
      if (!token || typeof token !== 'string' || !token.trim()) {
        await new Promise((r) => setTimeout(r, 200));
        token = await getToken();
      }
      if (!token || typeof token !== 'string' || !token.trim()) {
        setError('Session expired. Please log in again.');
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      
      // Create FormData for React Native
      const formData = new FormData();
      formData.append('photos', {
        uri: uri,
        type: mimeType,
        name: filename,
      } as any);

      console.log('📤 Uploading photo:', { uri, filename, mimeType, apiUrl: `${API_URL}/api/photos` });
      
      // Retry logic for network failures
      const maxRetries = 3;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Create AbortController for timeout (5 minutes for large files)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes for large files
          
          console.log(`📤 Upload attempt ${attempt}/${maxRetries}...`);
          
          const response = await fetch(`${API_URL}/api/photos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              // Don't set Content-Type - let fetch set it with boundary for multipart/form-data
            },
            body: formData,
            signal: controller.signal, // Add abort signal for timeout
          });
          
          clearTimeout(timeoutId); // Clear timeout if request succeeds
          
          // If we get here, the request succeeded
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
            
            // Auth error - session expired, redirect to login
            if (response.status === 401 || (typeof errorData?.error === 'string' && errorData.error.toLowerCase().includes('authentication'))) {
              setError('Session issue while uploading. Please try again.');
              return;
            }
            
            // Log detailed error information
            console.error('❌ Upload error details:', {
              status: response.status,
              error: errorData.error,
              details: errorData.details,
              http_code: errorData.http_code,
              suggestion: errorData.suggestion,
              fullErrorData: errorData
            });
            
            // Create a more detailed error message
            let errorMessage = errorData.error || `Upload failed with status ${response.status}`;
            if (errorData.details) {
              errorMessage += `\n\nDetails: ${errorData.details}`;
            }
            if (errorData.http_code) {
              errorMessage += `\nHTTP Code: ${errorData.http_code}`;
            }
            if (errorData.suggestion) {
              errorMessage += `\n\n${errorData.suggestion}`;
            }
            
            // Create error with all details
            const detailedError = new Error(errorMessage);
            (detailedError as any).http_code = errorData.http_code;
            (detailedError as any).details = errorData.details;
            throw detailedError;
          }

          const result = await response.json().catch((parseError) => {
            console.error('❌ JSON parse error:', parseError);
            throw new Error('Invalid response from server');
          });
          
          console.log('✅ Upload successful:', result);
          
          // Add the uploaded photo to the photos array
          if (result.photos && result.photos.length > 0) {
            const newPhoto = result.photos[0];
            setPhotos(prev => [...prev, { id: newPhoto.id, url: newPhoto.url, uri: uri }]);
          }

          // Invalidate photos cache so Profile tab shows new photos when user navigates there
          api.clearCache('/photos/me');

          // Success! Exit retry loop
          return;
          
        } catch (fetchError: any) {
          lastError = fetchError;
          console.error(`❌ Upload attempt ${attempt} failed:`, fetchError);
          
          // Check if it's a timeout/abort
          if (fetchError.name === 'AbortError') {
            if (attempt < maxRetries) {
              console.log(`⏳ Upload timed out, retrying... (${attempt}/${maxRetries})`);
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw new Error('Upload timed out after multiple attempts. The file may be too large. Please try a smaller image.');
          }
          
          // Check for network errors
          if (fetchError.message?.includes('Network request failed') || fetchError.message?.includes('Failed to fetch')) {
            if (attempt < maxRetries) {
              console.log(`🔄 Network error, retrying... (${attempt}/${maxRetries})`);
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw new Error('Network error: Unable to connect to server after multiple attempts. Please check your internet connection and try again.');
          }
          
          // For other errors, don't retry
          throw fetchError;
        }
      }
      
      // If we get here, all retries failed
      throw lastError || new Error('Upload failed after multiple attempts');
    } catch (err: any) {
      console.error('Upload error:', err);
      console.error('Upload error details:', {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        error: err
      });
      const errorMessage = err?.message || 'Failed to upload photo';
      const isAuthError = err?.status === 401 || (typeof err?.message === 'string' && err.message.toLowerCase().includes('authentication'));
      if (isAuthError) {
        setError('Session issue while uploading. Please try again.');
      } else {
        Alert.alert('Upload Failed', errorMessage, [{ text: 'OK' }]);
      }
    } finally {
      setUploadingSlotIndex(null);
    }
  };

  const handlePickPhoto = async (slotIndex: number) => {
    try {
      // Check if we can upload more photos
      if (photos.length >= 6) {
        Alert.alert('Limit reached', 'You can only upload up to 6 photos');
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Please grant photo library access to upload photos. You can enable this in Settings > Privacy & Security > Photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Log file size for debugging
        if (asset.fileSize) {
          const sizeMB = (asset.fileSize / (1024 * 1024)).toFixed(2);
          console.log(`📸 Selected image size: ${sizeMB} MB`);
          if (asset.fileSize > 50 * 1024 * 1024) { // 50MB
            Alert.alert(
              'Image Too Large',
              `This image is ${sizeMB} MB. Maximum size is 50 MB. Please select a smaller image.`,
              [{ text: 'OK' }]
            );
            return;
          }
        }
        // Upload immediately - use the slot that was tapped so only that slot shows spinner
        await uploadPhoto(asset.uri, slotIndex);
      }
    } catch (error: any) {
      console.error('Error picking photo:', error);
      Alert.alert('Error', 'Failed to pick photo. Please try again.');
    }
  };

  const handleRemovePhoto = async (index: number) => {
    const photo = photos[index];
    if (!photo) return;

    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const maxAttempts = 3;
            let lastError: any;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                if (photo.id) {
                  await api.delete(`/photos/${photo.id}`);
                }
                setPhotos(prev => prev.filter((_, i) => i !== index));
                api.clearCache('/photos/me');
                return;
              } catch (error: any) {
                lastError = error;
                const isNetworkError = (error?.message || '').toLowerCase().includes('network') || (error?.message || '').toLowerCase().includes('failed');
                if (isNetworkError && attempt < maxAttempts) {
                  await new Promise((r) => setTimeout(r, 2000 * attempt));
                  continue;
                }
                break;
              }
            }
            console.error('Error removing photo:', lastError);
            const msg = (lastError?.message || '').toLowerCase().includes('network')
              ? 'Connection failed. The server may be waking up—please try again in a moment.'
              : 'Failed to remove photo. Please try again.';
            Alert.alert('Error', msg);
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    if (photos.length < MIN_PHOTOS_REQUIRED) {
      setError(`Please upload at least ${MIN_PHOTOS_REQUIRED} photos to complete your profile`);
      setLoading(false);
      return;
    }
    
    // Haptic feedback - vibrate when validation passes
    if (Platform.OS === 'ios') {
      Vibration.vibrate(50); // Increased from 10ms to 50ms for better feel on iOS
    } else {
      Vibration.vibrate(50); // Same for Android
    }

    try {
      // Create profile
      await api.post('/profile', {
        displayName,
        age: parseInt(age),
        gender,
        location,
        bio,
        lookingFor: null,
      });

      // Add interests
      if (interests.length > 0) {
        await api.put('/profile/interests', {
          interests: interests.map(name => ({ name }))
        });
      }

      await api.put('/profile/dealbreakers', {
        dealbreakers: dealbreakers.filter((d) => DEALBREAKER_CANONICAL_SET.has(d)),
      });
      await api.put('/profile/partner-qualities', {
        qualities: partnerQualities.map((quality) => ({ quality, importance: 5 })),
      });
      await api.put('/profile/lifestyle', {
        smoking: lifestyleForm.smoking || null,
        drinking: lifestyleForm.drinking || null,
        children: lifestyleForm.children || null,
        pets: lifestyleForm.pets || null,
        religion: lifestyleForm.religion || null,
        political: lifestyleForm.political || null,
        workLifeBalance: lifestyleForm.workLifeBalance || null,
        worksOut: lifestyleForm.worksOut || null,
      });

      // Save preferences
      await api.put('/profile/preferences', {
        minAge,
        maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
        preferredGenders: preferredGendersPayload(preferredGenders),
        maxDistance,
        relationshipType: null
      });

      // Photos are already uploaded on the photos step; refresh profile
      await refreshProfile();
      
      // Show celebration before navigating
      setShowCelebration(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  /** Save current form data and refresh profile — used by header "Save" when editing from Profile tab */
  const handleSaveInCreateProfile = useCallback(async () => {
    setSavingInCreateProfile(true);
    setError('');
    try {
      await api.post('/profile', {
        displayName,
        age: parseInt(age),
        gender,
        location,
        bio,
        lookingFor: null,
      });
      if (interests.length > 0) {
        await api.put('/profile/interests', {
          interests: interests.map((name: string) => ({ name }))
        });
      }
      await api.put('/profile/dealbreakers', {
        dealbreakers: dealbreakers.filter((d) => DEALBREAKER_CANONICAL_SET.has(d)),
      });
      await api.put('/profile/partner-qualities', {
        qualities: partnerQualities.map((quality) => ({ quality, importance: 5 })),
      });
      await api.put('/profile/lifestyle', {
        smoking: lifestyleForm.smoking || null,
        drinking: lifestyleForm.drinking || null,
        children: lifestyleForm.children || null,
        pets: lifestyleForm.pets || null,
        religion: lifestyleForm.religion || null,
        political: lifestyleForm.political || null,
        workLifeBalance: lifestyleForm.workLifeBalance || null,
        worksOut: lifestyleForm.worksOut || null,
      });
      await api.put('/profile/preferences', {
        minAge,
        maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
        preferredGenders: preferredGendersPayload(preferredGenders),
        maxDistance,
        relationshipType: null
      });
      await refreshProfile();
    } catch (err: any) {
      setError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setSavingInCreateProfile(false);
    }
  }, [
    displayName, age, gender, location, bio,
    interests,
    dealbreakers,
    partnerQualities,
    lifestyleForm,
    minAge, maxAge, preferredGenders, maxDistance,
    refreshProfile
  ]);

  const toggleInterest = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter(i => i !== interest));
    } else {
      setInterests([...interests, interest]);
    }
  };

  const toggleDealbreaker = (label: string) => {
    if (!DEALBREAKER_CANONICAL_SET.has(label)) return;
    setDealbreakers((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  };

  const togglePartnerQuality = (q: string) => {
    if (!(PARTNER_QUALITY_OPTIONS as readonly string[]).includes(q)) return;
    setPartnerQualities((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));
  };

  const togglePreferredGender = (gender: string) => {
    if (gender === 'Everyone') {
      setPreferredGenders(preferredGenders.includes('Everyone') ? [] : ['Everyone']);
      return;
    }
    if (preferredGenders.includes('Everyone')) {
      setPreferredGenders([gender]);
      return;
    }
    if (preferredGenders.includes(gender)) {
      setPreferredGenders(preferredGenders.filter(g => g !== gender));
    } else {
      setPreferredGenders([...preferredGenders, gender]);
    }
  };

  const renderStepIndicator = () => {
    const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
    return (
      <View style={styles.stepIndicator}>
        {steps.map((s) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              step >= s && styles.stepDotActive,
              step > s && styles.stepDotCompleted,
            ]}
          />
        ))}
      </View>
    );
  };

  // Steps 1-6: One card per page (display name, age, gender, preferred matches, location, bio)
  const basicInfoStepWrapper = (content: React.ReactNode) => (
    <ScrollView style={styles.stepContent} contentContainerStyle={[styles.lifestyleScrollContent, { flexGrow: 1 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  );
  const renderStep1DisplayName = () => basicInfoStepWrapper(
    <View style={[styles.focusedFirstNameSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: firstNameScale }], opacity: firstNameOpacity }]}>
        <LinearGradient colors={['#667eea', '#764ba2', '#f093fb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFirstNameCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPaddingFirst }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>👋</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleCompact, { fontSize: keyboardVisible ? rs.titleSizeCompact : rs.titleSize, marginBottom: keyboardVisible ? 8 : rs.titleMargin }]}>Welcome to Mulligan!</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleCompact, { fontSize: keyboardVisible ? rs.subtitleSizeCompact : 10, marginBottom: keyboardVisible ? 20 : rs.subtitleMargin, maxWidth: '100%' }]} numberOfLines={2}>{"Let's start with your first name"}</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: firstNameGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: firstNameGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput ref={displayNameInputRef} style={[styles.focusedFirstNameInput, keyboardVisible && styles.focusedFirstNameInputKeyboard]} value={displayName} onChangeText={setDisplayName} placeholder="Your first name" placeholderTextColor="#4a5568" autoCapitalize="words" returnKeyType="next" />
          </Animated.View>
          {displayName.trim().length >= 2 && <Animated.View style={[styles.successIndicator, { opacity: firstNameOpacity }]}><Text style={styles.successText}>✓ Great! Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep2Age = () => basicInfoStepWrapper(
    <View style={[styles.focusedAgeSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: ageScale }], opacity: ageOpacity }]}>
        <LinearGradient colors={['#f093fb', '#f5576c', '#4facfe']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedAgeCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>🎂</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleSmall, { fontSize: rs.titleSizeSmall, marginBottom: keyboardVisible ? 6 : rs.titleMargin }]}>How old are you?</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>We need to know your age</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: ageGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: ageGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput ref={ageInputRef} style={styles.focusedAgeInput} value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))} placeholder="Your age" placeholderTextColor="#4a5568" keyboardType="number-pad" returnKeyType="done" />
          </Animated.View>
          {age.trim().length > 0 && parseInt(age) >= 18 && <Animated.View style={[styles.successIndicator, { opacity: ageOpacity }]}><Text style={styles.successText}>✓ Perfect! Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep3Gender = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: genderScale }], opacity: genderOpacity }]}>
        <LinearGradient colors={['#764ba2', '#f093fb', '#f5576c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, { padding: rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 20 }]}>⚧️</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>What's your gender?</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>This is how you show up on your profile</Text>
          <View style={styles.focusedPickerWrapper}>
            <Picker selectedValue={gender || ''} onValueChange={(v) => v && setGender(v)} style={styles.focusedPicker} itemStyle={Platform.OS === 'ios' ? styles.focusedPickerItem : undefined} mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}>
              <Picker.Item label="Select gender" value="" />
              {GENDER_OPTIONS.map(g => <Picker.Item key={g} label={g} value={g} />)}
            </Picker>
          </View>
          {gender ? <Animated.View style={[styles.successIndicator, { opacity: genderOpacity }]}><Text style={styles.successText}>✓ Selected: {gender}</Text></Animated.View> : null}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep4Location = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: locationScale }], opacity: locationOpacity }]}>
        <LinearGradient colors={['#f5576c', '#4facfe', '#00f2fe']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>📍</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleSmall, { fontSize: rs.titleSizeSmall, marginBottom: keyboardVisible ? 6 : rs.titleMargin }]}>Where are you located?</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>We use this to show you people nearby</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: locationGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: locationGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput ref={locationInputRef} style={styles.focusedLocationInput} value={location} onChangeText={(t) => handleLocationChange(t, setLocation)} placeholder="City, State" placeholderTextColor="rgba(255, 255, 255, 0.6)" editable={!detectingLocation} returnKeyType="next" />
          </Animated.View>
          <TouchableOpacity style={styles.focusedLocationButton} onPress={detectLocation} disabled={detectingLocation}>
            {detectingLocation ? <ActivityIndicator color="#fff" /> : <Text style={styles.focusedLocationButtonText}>📍 Use My Location</Text>}
          </TouchableOpacity>
          {hasCityAndState(location) && <Animated.View style={[styles.successIndicator, { opacity: locationOpacity }]}><Text style={styles.successText}>✓ Location set! Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep6Bio = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: bioScale }], opacity: bioOpacity }]}>
        <LinearGradient colors={['#667eea', '#f093fb', '#f5576c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>✨</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleSmall, { fontSize: rs.titleSizeSmall, marginBottom: keyboardVisible ? 6 : rs.titleMargin }]}>Tell us about yourself</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>Share what makes you unique</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: bioGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: bioGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput style={styles.focusedBioInput} value={bio} onChangeText={setBio} placeholder="Write a bit about yourself..." placeholderTextColor="rgba(255, 255, 255, 0.6)" multiline numberOfLines={6} maxLength={500} textAlignVertical="top" returnKeyType="default" blurOnSubmit={false} />
          </Animated.View>
          <View style={styles.focusedCharCountContainer}><Text style={[styles.focusedCharCount, bio.length > 450 && styles.charCountWarning]}>{bio.length}/500 characters</Text></View>
          {bio.trim().length >= 20 && <Animated.View style={[styles.successIndicator, { opacity: bioOpacity }]}><Text style={styles.successText}>✓ Great bio!</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      {/* Modern Header - Minimal (more room for interests grid) */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.modernHeaderMinimal}
      >
        <Text style={styles.modernHeaderEmojiMinimal}>🎯</Text>
        <Text style={styles.modernHeaderTitleMinimal}>Your Interests</Text>
        <Text style={styles.modernHeaderSubtitleMinimal}>
          Select at least 3 interests that define you
        </Text>
        <View style={styles.selectionCounterMinimal}>
          <Text style={styles.selectionCounterTextMinimal}>
            {interests.length} selected {interests.length >= 3 && '✓'}
          </Text>
          {interests.length < 3 && (
            <Text style={styles.modernHeaderSubtitleMinimal}>
              ({3 - interests.length} more needed)
            </Text>
          )}
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.stepContent}
        contentContainerStyle={styles.modernScrollContentCondensed}
        showsVerticalScrollIndicator={true}
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={styles.modernCheckboxGridCondensed}>
          {INTEREST_OPTIONS.map((interest, index) => {
            const isSelected = interests.includes(interest);
            const emoji = INTEREST_EMOJIS[interest] || '✨';
            return (
              <TouchableOpacity
                key={interest}
                style={styles.modernInterestCardCondensed}
                onPress={() => toggleInterest(interest)}
                activeOpacity={0.8}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modernInterestCardGradientCondensed}
                  >
                    <Text style={styles.modernInterestEmojiCondensed}>{emoji}</Text>
                    <Text 
                      style={styles.modernInterestTextSelectedCondensed}
                      numberOfLines={2}
                      adjustsFontSizeToFit={false}
                    >
                      {interest}
                    </Text>
                    {interests.includes(interest) && (
                      <View style={styles.modernCheckmarkContainerCondensed}>
                        <Text style={styles.modernCheckmarkCondensed}>✓</Text>
                      </View>
                    )}
                  </LinearGradient>
                ) : (
                  <View style={styles.modernInterestCardUnselectedCondensed}>
                    <Text style={styles.modernInterestEmojiUnselectedCondensed}>{emoji}</Text>
                    <Text 
                      style={styles.modernInterestTextCondensed}
                      numberOfLines={2}
                      adjustsFontSizeToFit={false}
                    >
                      {interest}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        
        {/* Scroll indicator hint - condensed */}
        <View style={styles.scrollHintCondensed}>
          <Text style={styles.scrollHintTextCondensed}>
            👆 Scroll to see all {INTEREST_OPTIONS.length} interests
          </Text>
        </View>
      </ScrollView>
      
      {/* Fade gradient at bottom to indicate more content */}
      <LinearGradient
        colors={['transparent', 'rgba(248, 249, 250, 0.8)', '#f8f9fa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );

  const renderStepDealbreakers = () => (
    <View style={styles.stepContainer}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.modernHeaderMinimal}
      >
        <Text style={styles.modernHeaderEmojiMinimal}>🚫</Text>
        <Text style={styles.modernHeaderTitleMinimal}>Dealbreakers</Text>
        <Text style={styles.modernHeaderSubtitleMinimal}>Hard passes — optional; tap any that apply</Text>
        <View style={styles.selectionCounterMinimal}>
          <Text style={styles.selectionCounterTextMinimal}>{dealbreakers.length} selected</Text>
        </View>
      </LinearGradient>
      <ScrollView
        style={styles.stepContent}
        contentContainerStyle={styles.modernScrollContentCondensed}
        showsVerticalScrollIndicator
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={styles.modernCheckboxGridCondensed}>
          {DEALBREAKER_SUGGESTIONS.map((label) => {
            const isSelected = dealbreakers.includes(label);
            const emoji = DEALBREAKER_EMOJI[label] ?? '🚫';
            return (
              <TouchableOpacity
                key={label}
                style={styles.modernInterestCardCondensed}
                onPress={() => toggleDealbreaker(label)}
                activeOpacity={0.8}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.modernInterestCardGradientCondensed, styles.profileExtraCardTall]}
                  >
                    <Text style={styles.modernInterestEmojiCondensed}>{emoji}</Text>
                    <Text style={styles.modernInterestTextSelectedCondensed} numberOfLines={3}>
                      {label}
                    </Text>
                    <View style={styles.modernCheckmarkContainerCondensed}>
                      <Text style={styles.modernCheckmarkCondensed}>✓</Text>
                    </View>
                  </LinearGradient>
                ) : (
                  <View style={[styles.modernInterestCardUnselectedCondensed, styles.profileExtraCardTall]}>
                    <Text style={styles.modernInterestEmojiUnselectedCondensed}>{emoji}</Text>
                    <Text style={styles.modernInterestTextCondensedSmall} numberOfLines={3}>
                      {label}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <LinearGradient
        colors={['transparent', 'rgba(248, 249, 250, 0.8)', '#f8f9fa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );

  const renderStepPartnerQualities = () => (
    <View style={styles.stepContainer}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.modernHeaderMinimal}
      >
        <Text style={styles.modernHeaderEmojiMinimal}>💕</Text>
        <Text style={styles.modernHeaderTitleMinimal}>What you’re looking for</Text>
        <Text style={styles.modernHeaderSubtitleMinimal}>Same list as your interests — qualities that matter in a match</Text>
        <View style={styles.selectionCounterMinimal}>
          <Text style={styles.selectionCounterTextMinimal}>{partnerQualities.length} selected</Text>
        </View>
      </LinearGradient>
      <ScrollView
        style={styles.stepContent}
        contentContainerStyle={styles.modernScrollContentCondensed}
        showsVerticalScrollIndicator
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={styles.modernCheckboxGridCondensed}>
          {PARTNER_QUALITY_OPTIONS.map((q) => {
            const isSelected = partnerQualities.includes(q);
            const emoji = PARTNER_QUALITY_EMOJI[q] || '✨';
            return (
              <TouchableOpacity
                key={q}
                style={styles.modernInterestCardCondensed}
                onPress={() => togglePartnerQuality(q)}
                activeOpacity={0.8}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modernInterestCardGradientCondensed}
                  >
                    <Text style={styles.modernInterestEmojiCondensed}>{emoji}</Text>
                    <Text style={styles.modernInterestTextSelectedCondensed} numberOfLines={2}>
                      {q}
                    </Text>
                    {partnerQualities.includes(q) && (
                      <View style={styles.modernCheckmarkContainerCondensed}>
                        <Text style={styles.modernCheckmarkCondensed}>✓</Text>
                      </View>
                    )}
                  </LinearGradient>
                ) : (
                  <View style={styles.modernInterestCardUnselectedCondensed}>
                    <Text style={styles.modernInterestEmojiUnselectedCondensed}>{emoji}</Text>
                    <Text style={styles.modernInterestTextCondensed} numberOfLines={2}>
                      {q}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.scrollHintCondensed}>
          <Text style={styles.scrollHintTextCondensed}>
            👆 Scroll to see all {PARTNER_QUALITY_OPTIONS.length} options
          </Text>
        </View>
      </ScrollView>
      <LinearGradient
        colors={['transparent', 'rgba(248, 249, 250, 0.8)', '#f8f9fa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );

  const renderStepLifestyle = () => {
    const lifestyleFilledCount = (Object.keys(LIFESTYLE_FIELD_OPTIONS) as LifestyleFieldKey[]).filter(
      (key) => Boolean(lifestyleForm[key]?.trim())
    ).length;

    return (
      <View style={styles.stepContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#10b981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modernHeaderMinimal}
        >
          <Text style={styles.modernHeaderEmojiMinimal}>🌱</Text>
          <Text style={styles.modernHeaderTitleMinimal}>Lifestyle</Text>
          <Text style={styles.modernHeaderSubtitleMinimal}>
            Help matches understand your day-to-day — all optional
          </Text>
          <View style={styles.selectionCounterMinimal}>
            <Text style={styles.selectionCounterTextMinimal}>
              {lifestyleFilledCount} of {Object.keys(LIFESTYLE_FIELD_OPTIONS).length} answered
            </Text>
          </View>
        </LinearGradient>
        <ScrollView
          style={styles.stepContent}
          contentContainerStyle={styles.lifestyleStepScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          scrollIndicatorInsets={{ right: 1 }}
        >
          <View style={styles.lifestyleStepIntro}>
            <Text style={styles.lifestyleStepIntroEmoji}>✨</Text>
            <Text style={styles.lifestyleStepIntroText}>
              Tap a card below for each topic — or pick Skip for now.
            </Text>
          </View>
          {(Object.keys(LIFESTYLE_FIELD_OPTIONS) as LifestyleFieldKey[]).map((key) => {
            const opts = LIFESTYLE_FIELD_OPTIONS[key];
            const val = lifestyleForm[key];
            const hasValue = Boolean(val?.trim());
            const gradient = LIFESTYLE_FIELD_GRADIENTS[key];
            return (
              <View key={key} style={styles.lifestyleFieldCard}>
                <LinearGradient
                  colors={[gradient[0], gradient[1], gradient[2]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.lifestyleFieldCardAccent}
                />
                <View style={styles.lifestyleFieldCardBody}>
                  <View style={styles.lifestyleFieldHeader}>
                    <LinearGradient
                      colors={[gradient[0], gradient[2]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.lifestyleFieldEmojiWrap}
                    >
                      <Text style={[styles.lifestyleFieldEmoji, { fontSize: rs.lifestyleEmojiSize }]}>
                        {LIFESTYLE_FIELD_EMOJI[key]}
                      </Text>
                    </LinearGradient>
                    <View style={styles.lifestyleFieldHeaderText}>
                      <Text style={styles.lifestyleFieldTitle}>{LIFESTYLE_FIELD_LABEL[key]}</Text>
                      <Text style={styles.lifestyleFieldHint}>
                        {hasValue ? 'Selected — tap another to change' : 'Optional'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.lifestyleOptionsGrid}>
                    {opts.map((o) => {
                      const selected = val === o;
                      const { emoji, text, isSkip } = lifestyleOptionParts(key, o);
                      return (
                        <TouchableOpacity
                          key={String(o || '__skip__')}
                          style={styles.lifestyleOptionChip}
                          onPress={() =>
                            setLifestyleForm((prev) => ({
                              ...prev,
                              [key]: o,
                            }))
                          }
                          activeOpacity={0.85}
                        >
                          {selected ? (
                            <LinearGradient
                              colors={[gradient[0], gradient[1], gradient[2]]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={[
                                styles.lifestyleOptionInner,
                                styles.lifestyleOptionInnerSelected,
                              ]}
                            >
                              <Text style={styles.lifestyleOptionEmoji}>{emoji}</Text>
                              <Text style={styles.lifestyleOptionTextSelected} numberOfLines={3}>
                                {text}
                              </Text>
                              <View style={styles.lifestyleOptionCheck}>
                                <Text style={styles.lifestyleOptionCheckMark}>✓</Text>
                              </View>
                            </LinearGradient>
                          ) : (
                            <View
                              style={[
                                styles.lifestyleOptionInner,
                                isSkip ? styles.lifestyleOptionInnerSkip : styles.lifestyleOptionInnerIdle,
                              ]}
                            >
                              <Text style={styles.lifestyleOptionEmojiIdle}>{emoji}</Text>
                              <Text style={styles.lifestyleOptionTextIdle} numberOfLines={3}>
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
          <View style={styles.scrollHintCondensed}>
            <Text style={styles.scrollHintTextCondensed}>
              👆 All fields are optional — skip any you prefer not to share
            </Text>
          </View>
        </ScrollView>
        <LinearGradient
          colors={['transparent', 'rgba(248, 249, 250, 0.85)', '#f8f9fa']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bottomFade}
          pointerEvents="none"
        />
      </View>
    );
  };

  // Steps 11–13: One card per page (min age, max age, max distance)
  const renderStep10MinAge = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: minAgeScale }], opacity: minAgeOpacity }]}>
        <LinearGradient colors={['#667eea', '#764ba2', '#f093fb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, { padding: rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 20 }]}>🎂</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>Minimum Age</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>Must be 18 or older</Text>
          <View style={styles.focusedPickerWrapper}>
            <Picker selectedValue={minAge} onValueChange={(v) => { const n = typeof v === 'number' ? v : (parseInt(String(v), 10) || 18); setMinAge(n); if (maxAge < n) setMaxAge(n); }} style={styles.focusedPicker} itemStyle={Platform.OS === 'ios' ? styles.focusedPickerItem : undefined} mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}>
              {Array.from({ length: 103 }, (_, i) => 18 + i).map((age) => <Picker.Item key={age} label={`${age} years old`} value={age} />)}
            </Picker>
          </View>
          {minAge !== null && minAge >= 18 && <Animated.View style={[styles.successIndicator, { opacity: minAgeOpacity }]}><Text style={styles.successText}>✓ Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep11MaxAge = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: maxAgeScale }], opacity: maxAgeOpacity }]}>
        <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, { padding: rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 20 }]}>🎂</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>Maximum Age</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>Must be {minAge ?? 18} or older</Text>
          <View style={styles.focusedPickerWrapper}>
            <Picker selectedValue={maxAge} onValueChange={(v) => { const n = typeof v === 'number' ? v : (parseInt(String(v), 10) || minAge); setMaxAge(n); }} style={styles.focusedPicker} itemStyle={Platform.OS === 'ios' ? styles.focusedPickerItem : undefined} mode={Platform.OS === 'android' ? 'dropdown' : 'dialog'}>
              {Array.from({ length: 121 - (minAge ?? 18) }, (_, i) => (minAge ?? 18) + i).map((age) => <Picker.Item key={age} label={`${age} years old`} value={age} />)}
            </Picker>
          </View>
          {maxAge !== null && maxAge >= (minAge ?? 18) && <Animated.View style={[styles.successIndicator, { opacity: maxAgeOpacity }]}><Text style={styles.successText}>✓ Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep12PreferredGenders = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: preferredGendersScale }], opacity: preferredGendersOpacity }]}>
        <LinearGradient colors={['#4facfe', '#00f2fe', '#667eea']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, { padding: rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 16 }]}>🎯</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>Preferred matches</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSizeSmall, lineHeight: Math.round(20 * (screenWidth / 375)), marginBottom: rs.subtitleMarginSmall }]}>
            You{"'"}re here to actually meet people—not collect profiles. Coffee, trails, game nights, events, good convo: pick who you want in your matches.
          </Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSizeSmall, marginBottom: 12, fontWeight: '700' }]}>Who would you like to match with?</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSizeTiny, marginBottom: 10, opacity: 0.95 }]}>Who to show</Text>
          <View style={styles.preferencesGenderGrid}>
            {PREFERRED_GENDER_OPTIONS.map((pref) => {
              const isSelected = preferredGenders.includes(pref);
              return (
                <TouchableOpacity key={pref} style={styles.preferencesGenderCard} onPress={() => togglePreferredGender(pref)} activeOpacity={0.7}>
                  {isSelected ? (
                    <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preferencesGenderCardSelected}>
                      <Text style={styles.preferencesGenderTextSelected}>{preferredGenderDisplayLabel(pref)}</Text>
                      <View style={styles.preferencesCheckmark}><Text style={styles.preferencesCheckmarkText}>✓</Text></View>
                    </LinearGradient>
                  ) : (
                    <View style={styles.preferencesGenderCardUnselected}>
                      <Text style={styles.preferencesGenderText}>{preferredGenderDisplayLabel(pref)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSizeTiny, marginTop: 8, marginBottom: 4, opacity: 0.9 }]}>
            Men, women, or everyone—your Discover feed follows this
          </Text>
          {preferredGenders.length > 0 && <Animated.View style={[styles.successIndicator, { opacity: preferredGendersOpacity }]}><Text style={styles.successText}>✓ {preferredGenders.includes('Everyone') ? 'Everyone' : `${preferredGenders.length} selected`}</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep13MaxDistance = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: maxDistanceScale }], opacity: maxDistanceOpacity }]}>
        <LinearGradient colors={['#4facfe', '#00f2fe', '#667eea']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>📍</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleSmall, { fontSize: rs.titleSizeSmall, marginBottom: keyboardVisible ? 6 : rs.titleMargin }]}>Maximum Distance</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>How far to search for matches</Text>
          <View style={styles.preferenceInputWrapper}>
            <View style={styles.preferenceInputContainer}>
              <TextInput ref={maxDistanceInputRef} style={styles.preferenceNumberInputLarge} value={maxDistance === null ? '' : maxDistance.toString()} onChangeText={(t) => { if (t === '' || t === '0') setMaxDistance(1); else { const v = parseInt(t); if (!isNaN(v) && v >= 1) setMaxDistance(v); } }} keyboardType="number-pad" returnKeyType="done" placeholder="50" placeholderTextColor="rgba(255, 255, 255, 0.7)" />
              <Text style={styles.preferenceInputLabelLarge}>miles</Text>
            </View>
          </View>
          {maxDistance !== null && maxDistance > 0 && <Animated.View style={[styles.successIndicator, { opacity: maxDistanceOpacity }]}><Text style={styles.successText}>✓ {maxDistance} miles</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep7 = () => {
    const photoSlots = Array.from({ length: 6 }, (_, i) => i);
    const canAddMore = photos.length < 6;

    return (
      <View style={styles.stepContainer}>
        {/* Modern Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modernHeaderCondensed}
        >
          <Text style={styles.modernHeaderEmojiCondensed}>📸</Text>
          <Text style={styles.modernHeaderTitleCondensed}>Add Your Photos</Text>
          <Text style={styles.modernHeaderSubtitleCondensed}>
            Upload at least {MIN_PHOTOS_REQUIRED} photos (up to 6 total)
          </Text>
          <Text style={[styles.modernHeaderSubtitleCondensed, { marginTop: 8, fontSize: 14, opacity: 0.9 }]}>
            {photos.length} / {MIN_PHOTOS_REQUIRED} minimum ({photos.length >= MIN_PHOTOS_REQUIRED ? '✓ Ready' : 'Need more'})
          </Text>
        </LinearGradient>

        <ScrollView 
          style={styles.stepContent}
          contentContainerStyle={styles.photosScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.photosGrid}>
            {photoSlots.map((slotIndex) => {
              const photo = photos[slotIndex];
              const isEmpty = !photo;
              const isRequired = slotIndex < MIN_PHOTOS_REQUIRED;

              return (
                <View key={slotIndex} style={styles.photoSlot}>
                  {photo ? (
                    <View style={styles.photoContainer}>
                      <OptimizedImage
                        source={photo.url || photo.uri}
                        style={styles.photoImage}
                        resizeMode="cover"
                        showLoadingIndicator={false}
                      />
                      <TouchableOpacity
                        style={styles.removePhotoButton}
                        onPress={() => handleRemovePhoto(slotIndex)}
                      >
                        <Text style={styles.removePhotoText}>×</Text>
                      </TouchableOpacity>
                      {slotIndex === 0 && (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>Primary</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.addPhotoButton,
                        isRequired && photos.length < MIN_PHOTOS_REQUIRED && styles.addPhotoButtonRequired
                      ]}
                      onPress={canAddMore ? () => handlePickPhoto(slotIndex) : undefined}
                      disabled={!canAddMore || uploadingSlotIndex !== null}
                    >
                      <LinearGradient
                        colors={
                          isRequired && photos.length < MIN_PHOTOS_REQUIRED
                            ? ['#f5576c', '#f093fb']
                            : ['rgba(102, 126, 234, 0.3)', 'rgba(118, 75, 162, 0.3)']
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.addPhotoButtonGradient}
                      >
                        {uploadingSlotIndex === slotIndex ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Text style={styles.addPhotoIcon}>📷</Text>
                            <Text style={styles.addPhotoText}>
                              {isRequired ? 'Required' : 'Optional'}
                            </Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.photosInfoCard}>
            <Text style={styles.photosInfoTitle}>💡 Photo Tips</Text>
            <Text style={styles.photosInfoText}>
              • Use clear, recent photos{'\n'}
              • Include a mix of close-ups and full-body shots{'\n'}
              • Show your personality and interests{'\n'}
              • Make sure your face is clearly visible in at least one photo
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      enabled={true}
    >
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { position: 'relative' }]}
      >
        {connectSetupComplete && existingProfile && !startFromBeginning ? (
          <View style={styles.exitSaveRow}>
            <TouchableOpacity
              style={[styles.exitButton, styles.saveButton]}
              onPress={handleSaveInCreateProfile}
              disabled={savingInCreateProfile}
              activeOpacity={0.8}
            >
              <Text style={styles.exitButtonText}>{savingInCreateProfile ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exitButton}
              onPress={() => {
                (navigation as any).navigate('MainTabs', { screen: 'Browse' });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.exitSaveRow}>
            <View style={styles.exitButton} />
            <TouchableOpacity
              style={styles.exitButton}
              onPress={async () => {
                await logout();
                navigationRef.current?.reset({ index: 0, routes: [{ name: 'PhoneLogin' }] });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.logOutLinkText}>Log out</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.title}>Set up your profile</Text>
        <Text style={styles.subtitle}>Step {step} of {TOTAL_STEPS}</Text>
      </LinearGradient>

      {renderStepIndicator()}

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>{error}</Text>
          {(error.toLowerCase().includes('session expired') || error.toLowerCase().includes('authentication') || error.toLowerCase().includes('log in again')) ? (
            <TouchableOpacity
              style={styles.reLoginButton}
              onPress={async () => {
                setError('');
                await logout();
                navigationRef.current?.reset({ index: 0, routes: [{ name: 'PhoneLogin' }] });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.reLoginButtonText}>Log in again</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {step === 1 && renderStep1DisplayName()}
      {step === 2 && renderStep2Age()}
      {step === 3 && renderStep3Gender()}
      {step === 4 && renderStep12PreferredGenders()}
      {step === 5 && renderStep4Location()}
      {step === 6 && renderStep6Bio()}
      {step === 7 && renderStep2()}
      {step === 8 && renderStepDealbreakers()}
      {step === 9 && renderStepPartnerQualities()}
      {step === 10 && renderStepLifestyle()}
      {step === 11 && renderStep10MinAge()}
      {step === 12 && renderStep11MaxAge()}
      {step === 13 && renderStep13MaxDistance()}
      {step === 14 && renderStep7()}

      <View style={styles.actions}>
          {step > 1 ? (
            <TouchableOpacity 
              style={styles.modernBackButton} 
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modernBackButtonGradient}
              >
                <Text style={styles.modernBackButtonText}>← Back</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.modernBackButton} />
          )}
          
          {step < TOTAL_STEPS ? (
            <TouchableOpacity
              style={styles.modernNextButton}
              onPress={handleNext}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2', '#f093fb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modernNextButtonGradient}
              >
                <Text style={styles.modernNextButtonText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.modernNextButton}
              onPress={handleSubmit}
              disabled={loading || photos.length < MIN_PHOTOS_REQUIRED}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={loading || photos.length < MIN_PHOTOS_REQUIRED 
                  ? ['#ccc', '#bbb'] 
                  : ['#667eea', '#764ba2', '#f093fb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modernNextButtonGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modernNextButtonText}>Complete Profile →</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      
      {/* Profile Complete Celebration */}
      <ProfileCompleteCelebration
        visible={showCelebration}
        onClose={async () => {
          setShowCelebration(false);
          // Ensure auth context has the new profile before navigating (fixes "Profile required" on Matches tab)
          await refreshProfile();
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' as never }],
          });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  exitSaveRow: {
    position: 'absolute',
    top: 100,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  exitButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  logOutLinkText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  welcomeSection: {
    marginBottom: 24,
  },
  welcomeCard: {
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  labelIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ddd',
  },
  stepDotActive: {
    backgroundColor: '#8B1538',
  },
  stepDotCompleted: {
    backgroundColor: '#4CAF50',
  },
  stepContent: {
    flex: 1,
    width: '100%',
  },
  stepContentWithKeyboard: {
    flex: 1,
    maxHeight: '75%', // Reduce height when keyboard is visible
  },
  scrollContent: {
    padding: 0, // Remove padding so cards can take full screen
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  marginTop: {
    marginTop: 32,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2d3748',
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#2d3748',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  focusedFirstNameSection: {
    width: '100%',
    minHeight: Dimensions.get('window').height * 0.7, // Minimum height for vertical scrolling
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    marginBottom: 20,
  },
  focusedSectionWithKeyboard: {
    paddingVertical: 10,
    paddingBottom: 5,
    justifyContent: 'flex-start',
    paddingTop: 20,
    maxHeight: '70%', // Limit height when keyboard is visible
  },
  focusedAgeSection: {
    width: '100%',
    minHeight: Dimensions.get('window').height * 0.7, // Minimum height for vertical scrolling
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    marginBottom: 20,
  },
  focusedFieldSection: {
    width: '100%',
    minHeight: Dimensions.get('window').height * 0.7, // Minimum height for vertical scrolling
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    marginBottom: 20,
  },
  focusedFieldCard: {
    padding: 40,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  focusedFirstNameContainer: {
    width: '100%',
  },
  focusedFirstNameCard: {
    padding: 48,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  focusedCardWithKeyboard: {
    padding: 24,
    paddingBottom: 16,
    paddingTop: 20,
    maxHeight: '100%', // Ensure card fits within section
  },
  focusedEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  focusedEmojiSmall: {
    fontSize: 45,
    marginBottom: 8,
  },
  focusedTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  focusedTitleSmall: {
    fontSize: 24,
    marginBottom: 6,
  },
  focusedTitleCompact: {
    fontSize: 30,
    marginBottom: 8,
  },
  focusedSubtitle: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 26,
  },
  focusedSubtitleSmall: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 18,
  },
  focusedSubtitleCompact: {
    fontSize: 18,
    marginBottom: 20,
    lineHeight: 22,
  },
  focusedInputWrapper: {
    width: '100%',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  focusedFirstNameInput: {
    width: '100%',
    borderWidth: 0,
    borderRadius: 20,
    padding: 28,
    fontSize: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#2d3748',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  focusedFirstNameInputKeyboard: {
    padding: 20,
    fontSize: 18,
  },
  focusedAgeCard: {
    padding: 40,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#f093fb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  focusedAgeInput: {
    width: '100%',
    borderWidth: 0,
    borderRadius: 20,
    padding: 24,
    fontSize: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#2d3748',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },
  focusedPickerWrapper: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 16,
  },
  focusedPicker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 200 : 60,
  },
  focusedPickerItem: {
    fontSize: 18,
    height: 200,
    fontWeight: '600',
  },
  focusedLocationInput: {
    width: '100%',
    borderWidth: 0,
    borderRadius: 20,
    padding: 24,
    fontSize: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#2d3748',
    fontWeight: '600',
    textAlign: 'center',
  },
  focusedLocationButton: {
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  focusedLocationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  focusedContinueButton: {
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    width: '100%',
  },
  focusedContinueButtonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  focusedContinueButtonText: {
    color: '#667eea',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  focusedBioInput: {
    width: '100%',
    borderWidth: 0,
    borderRadius: 20,
    padding: 20,
    fontSize: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#2d3748',
    fontWeight: '500',
    minHeight: 150,
    textAlign: 'left',
  },
  focusedCharCountContainer: {
    marginTop: 12,
    width: '100%',
    alignItems: 'flex-end',
  },
  focusedCharCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  successIndicator: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  successText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  otherFieldsContainer: {
    marginTop: 24,
  },
  sectionDivider: {
    fontSize: 20,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  charCountContainer: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  charCountWarning: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    minHeight: Platform.OS === 'ios' ? 200 : 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  picker: {
    height: Platform.OS === 'ios' ? 200 : 50,
    width: '100%',
  },
  pickerItem: {
    fontSize: 16,
    height: 200,
  },
  selectedValueContainer: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f4ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#667eea',
  },
  selectedValueText: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  locationInput: {
    flex: 1,
  },
  locationButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  checkboxItemSelected: {
    backgroundColor: '#8B1538',
    borderColor: '#8B1538',
  },
  checkboxText: {
    fontSize: 14,
    color: '#333',
  },
  checkboxTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  checkmark: {
    marginLeft: 8,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Modern Interests Page Styles
  stepContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modernHeader: {
    padding: 32,
    paddingTop: 60,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  modernHeaderEmoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 12,
  },
  modernHeaderTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modernHeaderSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  selectionCounter: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  selectionCounterText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  selectionCounterHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 4,
  },
  modernScrollContent: {
    padding: 20,
    paddingBottom: 150,
  },
  modernCheckboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingBottom: 20,
  },
  modernInterestCard: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    flex: 1,
    minWidth: '30%', // Minimum 30% but can grow
    maxWidth: '48%', // Maximum 48% to fit 2 per row if needed
    marginBottom: 4,
  },
  modernInterestCardGradient: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  modernInterestCardUnselected: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  scrollHint: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    borderStyle: 'dashed',
  },
  scrollHintText: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    pointerEvents: 'none',
  },
  modernSectionHeader: {
    padding: 24,
    borderRadius: 20,
    marginTop: 24,
    marginBottom: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  modernSectionEmoji: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 8,
  },
  modernSectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modernSectionSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  // Modern Form Card Styles
  modernFormCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  modernFormCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  modernFormCardEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  modernFormCardTitleContainer: {
    flex: 1,
  },
  modernFormCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  modernFormCardSubtitle: {
    fontSize: 13,
    color: '#718096',
    fontWeight: '500',
  },
  modernFocusedCardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modernFocusedCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
  },
  modernInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7fafc',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  modernNumberInput: {
    fontSize: 28,
    fontWeight: '700',
    color: '#667eea',
    minWidth: 60,
    textAlign: 'center',
  },
  modernInputLabel: {
    fontSize: 16,
    color: '#718096',
    fontWeight: '600',
    marginLeft: 12,
  },
  modernSelectionHint: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  // Gender-specific card styles for longer text
  modernGenderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  modernGenderCard: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    flex: 1,
    minWidth: '45%', // Wider for gender options to fit "non-binary"
    maxWidth: '48%',
    marginBottom: 4,
  },
  modernGenderCardGradient: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    position: 'relative',
  },
  modernGenderCardUnselected: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  modernGenderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2d3748',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 18,
  },
  modernGenderTextSelected: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 18,
  },
  focusedInputLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginLeft: 12,
  },
  modernInterestText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2d3748',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 16,
  },
  modernInterestTextSelected: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 16,
  },
  modernCheckmarkContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernCheckmark: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Minimal header - for Interests & Partner Qualities (max room for selection grid)
  modernHeaderMinimal: {
    padding: 10,
    paddingTop: 38,
    paddingBottom: 6,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modernHeaderEmojiMinimal: { fontSize: 24, textAlign: 'center' as const, marginBottom: 2 },
  modernHeaderTitleMinimal: { fontSize: 18, fontWeight: '700' as const, color: '#fff', textAlign: 'center' as const, letterSpacing: 0.3 },
  modernHeaderSubtitleMinimal: { fontSize: 11, color: 'rgba(255, 255, 255, 0.9)', textAlign: 'center' as const, marginTop: 2 },
  selectionCounterMinimal: { alignSelf: 'center' as const, marginTop: 4 },
  selectionCounterTextMinimal: { fontSize: 12, fontWeight: '600' as const, color: '#fff' },
  // Condensed styles for Step 2 (Interests) and Step 3 (Dealbreakers)
  modernHeaderCondensed: {
    padding: 16,
    paddingTop: 45,
    paddingBottom: 10, // Reduced for dealbreakers
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  modernHeaderEmojiCondensed: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 5, // Reduced
  },
  modernHeaderTitleCondensed: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 3, // Reduced
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modernHeaderSubtitleCondensed: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    marginBottom: 8, // Reduced
    lineHeight: 16,
  },
  selectionCounterCondensed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    paddingVertical: 5, // Reduced
    paddingHorizontal: 14,
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  selectionCounterTextCondensed: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  selectionCounterHintCondensed: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 2,
  },
  modernScrollContentCondensed: {
    padding: 12,
    paddingBottom: 50, // Reduced padding to show more qualities
  },
  modernCheckboxGridCondensed: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingBottom: 12,
  },
  modernInterestCardCondensed: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    width: '31%', // Fixed width for 3 columns
    marginBottom: 10,
  },
  modernInterestCardGradientCondensed: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modernInterestCardUnselectedCondensed: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modernInterestEmojiCondensed: {
    fontSize: 24,
    marginBottom: 4,
  },
  modernInterestEmojiUnselectedCondensed: {
    fontSize: 22,
    marginBottom: 4,
    opacity: 0.7,
  },
  modernInterestTextCondensed: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2d3748',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 16,
  },
  modernInterestTextCondensedSmall: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2d3748',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 14,
  },
  profileExtraCardTall: {
    minHeight: 88,
    justifyContent: 'center',
  },
  lifestyleStepScroll: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 56,
    backgroundColor: '#f8f9fa',
  },
  lifestyleStepIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.18)',
  },
  lifestyleStepIntroEmoji: {
    fontSize: 22,
  },
  lifestyleStepIntroText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 18,
  },
  lifestyleFieldCard: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.12)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  lifestyleFieldCardAccent: {
    height: 4,
    width: '100%',
  },
  lifestyleFieldCardBody: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  lifestyleFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  lifestyleFieldEmojiWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  lifestyleFieldEmoji: {
    textAlign: 'center',
  },
  lifestyleFieldHeaderText: {
    flex: 1,
  },
  lifestyleFieldTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.2,
  },
  lifestyleFieldHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 2,
  },
  lifestyleOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  lifestyleOptionChip: {
    width: '48%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  lifestyleOptionInner: {
    minHeight: 76,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lifestyleOptionInnerSelected: {
    minHeight: 76,
    borderRadius: 16,
  },
  lifestyleOptionInnerIdle: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: 'rgba(102, 126, 234, 0.14)',
    borderRadius: 16,
  },
  lifestyleOptionInnerSkip: {
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  lifestyleOptionEmoji: {
    fontSize: 22,
    marginBottom: 6,
    textAlign: 'center',
  },
  lifestyleOptionEmojiIdle: {
    fontSize: 20,
    marginBottom: 6,
    textAlign: 'center',
    opacity: 0.85,
  },
  lifestyleOptionTextSelected: {
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
  lifestyleOptionTextIdle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 14,
  },
  lifestyleOptionCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifestyleOptionCheckMark: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  modernInterestTextSelectedCondensed: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modernCheckmarkContainerCondensed: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  modernCheckmarkCondensed: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  scrollHintCondensed: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    borderStyle: 'dashed',
  },
  scrollHintTextCondensed: {
    fontSize: 11,
    color: '#667eea',
    fontWeight: '600',
    textAlign: 'center',
  },
  // Dealbreakers-specific styles
  dealbreakersScrollContent: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 100, // Increased padding to ensure last item is visible
  },
  dealbreakersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  dealbreakerCard: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#f5576c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    width: '47%', // 2 columns with gap
    marginBottom: 10,
  },
  dealbreakerCardGradient: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  dealbreakerCardUnselected: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dealbreakerEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  dealbreakerEmojiUnselected: {
    fontSize: 26,
    marginBottom: 6,
    opacity: 0.6,
  },
  dealbreakerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2d3748',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 18,
  },
  dealbreakerTextSelected: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dealbreakerCheckmarkContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  dealbreakerCheckmark: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Dating Preferences styles
  preferencesScrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  preferenceCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  preferenceCardGradient: {
    padding: 24,
    alignItems: 'center',
  },
  preferenceEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  preferenceTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  preferenceSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 20,
  },
  preferenceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: '100%',
    maxWidth: 200,
  },
  preferenceNumberInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#667eea',
    textAlign: 'center',
    minWidth: 60,
  },
  preferenceInputLabel: {
    fontSize: 15,
    color: '#718096',
    fontWeight: '600',
    marginLeft: 8,
  },
  preferenceInputWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  preferenceNumberInputLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: '#667eea',
    textAlign: 'center',
    minWidth: 80,
    paddingVertical: 4,
  },
  preferenceInputLabelLarge: {
    fontSize: 16,
    color: '#718096',
    fontWeight: '600',
    marginLeft: 10,
  },
  preferencesGenderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  preferencesGenderCard: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '30%',
    minWidth: 100,
    marginBottom: 4,
  },
  preferencesGenderCardSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    position: 'relative',
    minHeight: 50,
  },
  preferencesGenderCardUnselected: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    minHeight: 50,
  },
  preferencesGenderText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 18,
  },
  preferencesGenderTextSelected: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 18,
  },
  preferencesCheckmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferencesCheckmarkText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
  },
  // Lifestyle styles
  lifestyleScrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  lifestyleCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  lifestyleCardGradient: {
    padding: 28,
    alignItems: 'center',
  },
  lifestyleEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  lifestyleTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  lifestyleSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  lifestylePickerWrapper: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  lifestylePicker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 180 : 60,
  },
  lifestylePickerItem: {
    fontSize: 16,
    height: 180,
    fontWeight: '600',
  },
  lifestyleSelectedIndicator: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lifestyleSelectedText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  error: {
    color: '#d32f2f',
    fontSize: 14,
    textAlign: 'center',
    padding: 12,
    backgroundColor: '#ffebee',
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 8,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 8,
  },
  reLoginButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#8B1538',
    borderRadius: 12,
    alignSelf: 'center',
  },
  reLoginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#d32f2f',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 12 : 4, // Minimal padding at bottom
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modern button styles - ultra compact version
  modernBackButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modernBackButtonGradient: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    borderRadius: 10,
  },
  modernBackButtonText: {
    color: '#667eea',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modernNextButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  modernNextButtonGradient: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  modernNextButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Photo upload styles
  photosScrollContent: {
    padding: 16,
    paddingBottom: 50,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  photoSlot: {
    width: '48%',
    aspectRatio: 0.75,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  primaryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  addPhotoButton: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  addPhotoButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(102, 126, 234, 0.5)',
    borderRadius: 16,
  },
  addPhotoButtonRequired: {
    borderColor: 'rgba(245, 87, 108, 0.7)',
    borderWidth: 2,
  },
  addPhotoIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  addPhotoText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  photosInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  photosInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2d3748',
    marginBottom: 12,
  },
  photosInfoText: {
    fontSize: 14,
    color: '#718096',
    lineHeight: 22,
  },
});
