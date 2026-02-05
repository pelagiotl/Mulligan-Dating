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
import ProfileCompleteCelebration from '../components/ProfileCompleteCelebration';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OptimizedImage from '../components/OptimizedImage';

const GENDER_OPTIONS = ['Man', 'Woman', 'Other', 'Prefer not to say'];
const PREFERRED_GENDER_OPTIONS = ['Man', 'Woman']; // For step 5 preferences
const LOOKING_FOR_OPTIONS = ['Relationship', 'Something casual', 'Friendship', 'Not sure yet'];

const INTEREST_OPTIONS = [
  'Travel', 'Music', 'Sports', 'Cooking', 'Reading', 'Movies', 'Fitness', 'Art',
  'Photography', 'Dancing', 'Gaming', 'Hiking', 'Yoga', 'Writing', 'Technology',
  'Fashion', 'Animals', 'Volunteering', 'Coffee', 'Nightlife', 'Comedy',
  'Beach', 'Camping', 'Board Games', 'Tattoos', 'Meditation', 'History', 'Science',
  'Business', 'Education'
]

// Emoji mapping for interests and qualities
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

const DEALBREAKER_OPTIONS = [
  'Smokes cigarettes', 'Marijuana', 'Frequent drinking', 'Drug use',
  'Doesn\'t want children', 'Wants children',
  'Doesn\'t like pets'
];

const TOTAL_STEPS = 15; // 1-6: basic info; 7: interests; 8: dealbreakers; 9: qualities; 10-13: min age, max age, preferred genders, max distance; 14: lifestyle; 15: photos

export default function CreateProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const startFromBeginning = (route.params as { startFromBeginning?: boolean } | undefined)?.startFromBeginning === true;
  const { refreshProfile, profile: existingProfile, logout } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const step1ScrollViewRef = useRef<ScrollView>(null);
  const step5ScrollViewRef = useRef<ScrollView>(null);
  
  // Refs for step 1 cards (for vertical scrolling)
  const displayNameCardRef = useRef<View>(null);
  const ageCardRef = useRef<View>(null);
  const genderCardRef = useRef<View>(null);
  const locationCardRef = useRef<View>(null);
  const lookingForCardRef = useRef<View>(null);
  const bioCardRef = useRef<View>(null);
  
  // Y positions for step 1 cards
  const [displayNameCardY, setDisplayNameCardY] = useState<number | null>(null);
  const [ageCardY, setAgeCardY] = useState<number | null>(null);
  const [genderCardY, setGenderCardY] = useState<number | null>(null);
  const [locationCardY, setLocationCardY] = useState<number | null>(null);
  const [lookingForCardY, setLookingForCardY] = useState<number | null>(null);
  const [bioCardY, setBioCardY] = useState<number | null>(null);
  const displayNameInputRef = useRef<TextInput>(null);
  const ageInputRef = useRef<TextInput>(null);
  const locationInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const genderFieldRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const displayNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingScrollToRef = useRef<'lookingFor' | 'bio' | null>(null);
  const skipAutoScrollRef = useRef(false); // when true (edit profile from start), don't auto-scroll to bio
  const step5AllowScrollRef = useRef(false); // when false (just entered step 5), don't auto-scroll in preferences
  const step6AllowScrollRef = useRef(false); // when false (just entered step 6), don't auto-scroll in lifestyle
  const lifestyleCardYsRef = useRef<Record<string, number>>({});
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
  
  // Separate viewability handler for step 5
  
  // Refs for lifestyle cards (for scrolling)
  const smokingCardRef = useRef<View>(null);
  const drinkingCardRef = useRef<View>(null);
  const childrenCardRef = useRef<View>(null);
  const petsCardRef = useRef<View>(null);
  const religionCardRef = useRef<View>(null);
  const workLifeBalanceCardRef = useRef<View>(null);
  const worksOutCardRef = useRef<View>(null);
  
  // Animation values for step 4 (dating preferences)
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
  const lookingForScale = useRef(new Animated.Value(0.95)).current;
  const lookingForOpacity = useRef(new Animated.Value(0)).current;
  const lookingForGlow = useRef(new Animated.Value(0)).current;
  const bioScale = useRef(new Animated.Value(0.95)).current;
  const bioOpacity = useRef(new Animated.Value(0)).current;
  const bioGlow = useRef(new Animated.Value(0)).current;

  // Lifestyle field animation refs
  const smokingScale = useRef(new Animated.Value(0.95)).current;
  const smokingOpacity = useRef(new Animated.Value(0)).current;
  const smokingGlow = useRef(new Animated.Value(0)).current;
  const drinkingScale = useRef(new Animated.Value(0.95)).current;
  const drinkingOpacity = useRef(new Animated.Value(0)).current;
  const drinkingGlow = useRef(new Animated.Value(0)).current;
  const childrenScale = useRef(new Animated.Value(0.95)).current;
  const childrenOpacity = useRef(new Animated.Value(0)).current;
  const childrenGlow = useRef(new Animated.Value(0)).current;
  const petsScale = useRef(new Animated.Value(0.95)).current;
  const petsOpacity = useRef(new Animated.Value(0)).current;
  const petsGlow = useRef(new Animated.Value(0)).current;
  const religionScale = useRef(new Animated.Value(0.95)).current;
  const religionOpacity = useRef(new Animated.Value(0)).current;
  const religionGlow = useRef(new Animated.Value(0)).current;
  const workLifeBalanceScale = useRef(new Animated.Value(0.95)).current;
  const workLifeBalanceOpacity = useRef(new Animated.Value(0)).current;
  const workLifeBalanceGlow = useRef(new Animated.Value(0)).current;
  const worksOutScale = useRef(new Animated.Value(0.95)).current;
  const worksOutOpacity = useRef(new Animated.Value(0)).current;
  const worksOutGlow = useRef(new Animated.Value(0)).current;

  // Step 1: Basic Info
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Step 2: Interests
  const [interests, setInterests] = useState<string[]>([]);

  // Step 3: Dealbreakers & Partner Qualities
  const [dealbreakers, setDealbreakers] = useState<string[]>([]);
  const [qualities, setQualities] = useState<string[]>([]);

  // Step 4: Dating Preferences
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(100);
  const [preferredGenders, setPreferredGenders] = useState<string[]>([]);
  const [maxDistance, setMaxDistance] = useState<number | null>(50);
  const [maxAgeCardY, setMaxAgeCardY] = useState<number | null>(null);
  const [preferredGendersCardY, setPreferredGendersCardY] = useState<number | null>(null);

  // Step 5: Lifestyle
  const [smoking, setSmoking] = useState('');
  const [drinking, setDrinking] = useState('');
  const [children, setChildren] = useState('');
  const [pets, setPets] = useState('');
  const [religion, setReligion] = useState('');
  const [workLifeBalance, setWorkLifeBalance] = useState('');
  const [worksOut, setWorksOut] = useState('');

  // Step 7: Photos
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
      subtitleSizeCompact: Math.round(16 * scaleW),
      subtitleMargin: Math.round(32 * scaleH),
      subtitleMarginSmall: Math.round(14 * scaleH),
      lifestyleCardPadding: Math.round(24 * scaleW),
      lifestyleEmojiSize: Math.round(44 * scaleW),
      lifestyleTitleSize: Math.round(22 * scaleW),
      lifestyleSubtitleSize: Math.round(13 * scaleW),
    };
  }, [screenWidth, screenHeight]);

  // Animate and focus the active basic-info field when on steps 1-6
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
    } else if (step === 3) anim(genderScale, genderOpacity, genderGlow);
    else if (step === 4) {
      anim(locationScale, locationOpacity, locationGlow);
    } else if (step === 5) anim(lookingForScale, lookingForOpacity, lookingForGlow);
    else if (step === 6) anim(bioScale, bioOpacity, bioGlow);
    else {
      [firstNameScale, ageScale, genderScale, locationScale, lookingForScale, bioScale].forEach(s => s.setValue(0.95));
      [firstNameOpacity, ageOpacity, genderOpacity, locationOpacity, lookingForOpacity, bioOpacity].forEach(o => o.setValue(0));
      [firstNameGlow, ageGlow, genderGlow, locationGlow, lookingForGlow, bioGlow].forEach(g => g.setValue(0));
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

  // Function to manually trigger next field animation and navigate to next card
  const triggerNextField = (fieldName: 'gender' | 'location' | 'lookingFor' | 'bio') => {
    console.log('🎯 Triggering next field:', fieldName);
    const fieldToCardY: Record<string, number | null> = {
      'gender': genderCardY,
      'location': locationCardY,
      'lookingFor': lookingForCardY,
      'bio': bioCardY,
    };
    const nextCardY = fieldToCardY[fieldName];
    
    if (nextCardY !== null) {
      // Animate the field
      if (fieldName === 'gender') {
        animateField(genderScale, genderOpacity, genderGlow);
      } else if (fieldName === 'location') {
        animateField(locationScale, locationOpacity, locationGlow);
      } else if (fieldName === 'lookingFor') {
        animateField(lookingForScale, lookingForOpacity, lookingForGlow);
      } else if (fieldName === 'bio') {
        animateField(bioScale, bioOpacity, bioGlow);
      }
      
      // Navigate to next card with vertical scroll
      setTimeout(() => {
        scrollToStep1Card(nextCardY, -20);
      }, 300);
    }
  };

  // Step 10 (dating preferences) - Progressive disclosure with vertical scrolling
  useEffect(() => {
    if (step === 10) {
      animateField(minAgeScale, minAgeOpacity, minAgeGlow);
    }
  }, [step]);

  useEffect(() => {
    if (step === 11) animateField(maxAgeScale, maxAgeOpacity, maxAgeGlow);
  }, [step]);
  useEffect(() => {
    if (step === 12) animateField(preferredGendersScale, preferredGendersOpacity, preferredGendersGlow);
  }, [step]);
  useEffect(() => {
    if (step === 13) {
      animateField(maxDistanceScale, maxDistanceOpacity, maxDistanceGlow);
    }
  }, [step]);

  // Step 14 (lifestyle) - Progressive disclosure with auto-navigation
  useEffect(() => {
    if (step === 14) {
      step6AllowScrollRef.current = false; // Disable auto-scroll from useEffects/onLayout on initial entry
      animateField(smokingScale, smokingOpacity, smokingGlow);
      // Scroll to top so user starts at smoking card
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 100);
    }
  }, [step]);

  // Animate next cards as previous ones are completed (scroll happens only from Picker onValueChange)
  useEffect(() => {
    if (step === 14 && smoking) {
      setTimeout(() => animateField(drinkingScale, drinkingOpacity, drinkingGlow), 300);
    }
  }, [smoking, step]);

  useEffect(() => {
    if (step === 14 && drinking) {
      setTimeout(() => animateField(childrenScale, childrenOpacity, childrenGlow), 300);
    }
  }, [drinking, step]);

  useEffect(() => {
    if (step === 14 && children) {
      setTimeout(() => animateField(petsScale, petsOpacity, petsGlow), 300);
    }
  }, [children, step]);

  useEffect(() => {
    if (step === 14 && pets) {
      setTimeout(() => animateField(religionScale, religionOpacity, religionGlow), 300);
    }
  }, [pets, step]);

  useEffect(() => {
    if (step === 14 && religion) {
      setTimeout(() => animateField(workLifeBalanceScale, workLifeBalanceOpacity, workLifeBalanceGlow), 300);
    }
  }, [religion, step]);

  useEffect(() => {
    if (step === 14 && workLifeBalance) {
      setTimeout(() => animateField(worksOutScale, worksOutOpacity, worksOutGlow), 300);
    }
  }, [workLifeBalance, step]);

  // Load existing profile data
  useEffect(() => {
    if (startFromBeginning) skipAutoScrollRef.current = true;
    const loadProfile = async () => {
      try {
        const data = await api.get('/profile');
        if (data.profile) {
          setDisplayName(data.profile.display_name);
          setAge(data.profile.age.toString());
          setGender(data.profile.gender);
          setLocation(data.profile.location || '');
          setBio(data.profile.bio || '');
          setLookingFor(data.profile.looking_for || '');
          if (data.interests) {
            setInterests(data.interests.map((i: any) => i.name));
          }
          if (data.dealbreakers) {
            setDealbreakers(data.dealbreakers.map((d: any) => d.description));
          }
          if (data.partnerQualities) {
            setQualities(data.partnerQualities.map((q: any) => q.quality));
          }
          if (data.preferences) {
            setMinAge(data.preferences.min_age ?? 18);
            setMaxAge((data.preferences as any).max_age ?? 100);
            setMaxDistance(data.preferences.max_distance ?? 50);
            if (data.preferences.preferred_genders) {
              try {
                const genders = JSON.parse(data.preferences.preferred_genders);
                setPreferredGenders(genders);
              } catch {
                setPreferredGenders([]);
              }
            }
          }
          if (data.lifestyle) {
            setSmoking(data.lifestyle.smoking || '');
            setDrinking(data.lifestyle.drinking || '');
            setChildren(data.lifestyle.children || '');
            setPets(data.lifestyle.pets || '');
            setReligion(data.lifestyle.religion || '');
            setWorkLifeBalance(data.lifestyle.work_life_balance || '');
            setWorksOut(data.lifestyle.works_out || '');
          }
          // startFromBeginning: no scroll needed - each step is now its own page
        }
      } catch (err) {
        console.log('No existing profile found');
      }
    };
    loadProfile();
  }, [startFromBeginning]);

  // Prefetch auth token on mount (handles AsyncStorage timing / cache sync after login)
  useEffect(() => {
    ensureTokenPrefetched();
  }, []);

  // Save profile data and load existing photos when entering step 7
  const profileSavedRef = useRef(false);
  
  useEffect(() => {
    const saveProfileAndLoadPhotos = async () => {
      if (step === 15 && !profileSavedRef.current) {
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
                lookingFor
              });
              console.log('✅ Basic profile saved');
              
              // Small delay to ensure profile is fully committed to database
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (err: any) {
              console.error('❌ Failed to save basic profile:', err?.message || err);
              const isAuthError = err?.status === 401 || (typeof err?.message === 'string' && err.message.toLowerCase().includes('authentication'));
              if (isAuthError) {
                await logout();
                setError('Session expired. Please log in again.');
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
              // Add dealbreakers
              if (dealbreakers.length > 0) {
                await api.put('/profile/dealbreakers', {
                  dealbreakers: dealbreakers.map(description => ({ description }))
                });
                console.log('✅ Dealbreakers saved');
              }
            } catch (err: any) {
              console.error('⚠️ Failed to save dealbreakers:', err?.message || err);
              // Continue - non-critical
            }

            try {
              // Add partner qualities
              if (qualities.length > 0) {
                await api.put('/profile/partner-qualities', {
                  qualities: qualities.map(quality => ({ quality }))
                });
                console.log('✅ Partner qualities saved');
              }
            } catch (err: any) {
              console.error('⚠️ Failed to save partner qualities:', err?.message || err);
              // Continue - non-critical
            }

            try {
              // Save preferences
              await api.put('/profile/preferences', {
                minAge,
                maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
                preferredGenders: preferredGenders.length > 0 ? preferredGenders : null,
                maxDistance,
                relationshipType: lookingFor || null
              });
              console.log('✅ Preferences saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save preferences:', err?.message || err);
              // Continue - non-critical
            }

            try {
              // Save lifestyle
              await api.put('/profile/lifestyle', {
                smoking,
                drinking,
                children,
                pets,
                religion,
                workLifeBalance,
                worksOut
              });
              console.log('✅ Lifestyle saved');
            } catch (err: any) {
              console.error('⚠️ Failed to save lifestyle:', err?.message || err);
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
      if (!location?.trim()) {
        setError('Please enter your location');
        return;
      }
    }
    if (step === 5) {
      if (!lookingFor?.trim()) {
        setError('Please select what you\'re looking for');
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
    if (step === 9) {
      if (qualities.length < 3) {
        setError('Please select at least 3 qualities you want in a partner');
        return;
      }
    }
    if (step === 10) {
      if (minAge === null || minAge < 18) {
        setError('Minimum age must be 18 or older');
        return;
      }
    }
    if (step === 11) {
      if (maxAge === null || maxAge < (minAge ?? 18)) {
        setError('Maximum age must be at least ' + (minAge ?? 18));
        return;
      }
    }
    if (step === 12) {
      if (preferredGenders.length < 1) {
        setError('Please select at least one preferred gender');
        return;
      }
    }
    if (step === 13) {
      if (maxDistance === null || maxDistance < 1) {
        setError('Please enter a maximum distance (at least 1 mile)');
        return;
      }
    }
    if (step === 14) {
      if (!smoking || !drinking || !children || !pets || !religion || !workLifeBalance || !worksOut) {
        setError('Please fill in all lifestyle fields');
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
    
    // If moving to step 7, ensure user has at least 5 photos before allowing navigation
    // (Note: They can still navigate to step 7 to upload photos, but validation happens on submit)
    // Actually, let's allow navigation to step 7 so they can upload photos there
    
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
              await logout();
              setError('Session expired. Please log in again.');
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
        await logout();
        setError('Session expired. Please log in again.');
      } else {
        Alert.alert('Upload Failed', errorMessage, [{ text: 'OK' }]);
      }
    } finally {
      setUploadingSlotIndex(null);
    }
  };

  const handlePickPhoto = async () => {
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
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        maxWidth: 1200,
        maxHeight: 1200,
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
        // Upload immediately without confirmation - seamless experience
        await uploadPhoto(asset.uri, photos.length);
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
            try {
              // If photo has an ID, delete it from the backend
              if (photo.id) {
                await api.delete(`/photos/${photo.id}`);
              }
              // Remove from local state
              setPhotos(prev => prev.filter((_, i) => i !== index));
            } catch (error: any) {
              console.error('Error removing photo:', error);
              Alert.alert('Error', 'Failed to remove photo. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    if (photos.length < 5) {
      setError('Please upload at least 5 photos to complete your profile');
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
        lookingFor
      });

      // Add interests
      if (interests.length > 0) {
        await api.put('/profile/interests', {
          interests: interests.map(name => ({ name }))
        });
      }

      // Add dealbreakers
      if (dealbreakers.length > 0) {
        await api.put('/profile/dealbreakers', {
          dealbreakers: dealbreakers.map(description => ({ description }))
        });
      }

      // Add partner qualities
      if (qualities.length > 0) {
        await api.put('/profile/partner-qualities', {
          qualities: qualities.map(quality => ({ quality }))
        });
      }

      // Save preferences
      await api.put('/profile/preferences', {
        minAge,
        maxAge: maxAge >= minAge && maxAge <= 120 ? maxAge : null,
        preferredGenders: preferredGenders.length > 0 ? preferredGenders : null,
        maxDistance,
        relationshipType: lookingFor || null
      });

      // Save lifestyle (always save, whether on step 6 or 7)
      await api.put('/profile/lifestyle', {
        smoking,
        drinking,
        children,
        pets,
        religion,
        workLifeBalance,
        worksOut
      });

      // Photos are already uploaded during step 7, just refresh profile
      await refreshProfile();
      
      // Show celebration before navigating
      setShowCelebration(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest: string) => {
    if (interests.includes(interest)) {
      setInterests(interests.filter(i => i !== interest));
    } else {
      setInterests([...interests, interest]);
    }
  };

  const toggleDealbreaker = (dealbreaker: string) => {
    if (dealbreakers.includes(dealbreaker)) {
      setDealbreakers(dealbreakers.filter(d => d !== dealbreaker));
    } else {
      setDealbreakers([...dealbreakers, dealbreaker]);
    }
  };

  const toggleQuality = (quality: string) => {
    if (qualities.includes(quality)) {
      setQualities(qualities.filter(q => q !== quality));
    } else {
      setQualities([...qualities, quality]);
    }
  };

  const togglePreferredGender = (gender: string) => {
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

  // Steps 1-6: One card per page (display name, age, gender, location, looking for, bio)
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
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleCompact, { fontSize: keyboardVisible ? rs.subtitleSizeCompact : rs.subtitleSize, marginBottom: keyboardVisible ? 20 : rs.subtitleMargin }]}>Let's start with your first name</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: firstNameGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: firstNameGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput ref={displayNameInputRef} style={[styles.focusedFirstNameInput, keyboardVisible && styles.focusedFirstNameInputKeyboard]} value={displayName} onChangeText={setDisplayName} placeholder="Your first name" placeholderTextColor="rgba(255, 255, 255, 0.6)" autoCapitalize="words" returnKeyType="next" />
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
            <TextInput ref={ageInputRef} style={styles.focusedAgeInput} value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))} placeholder="Your age" placeholderTextColor="rgba(255, 255, 255, 0.6)" keyboardType="number-pad" returnKeyType="done" />
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
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>Help us match you with the right people</Text>
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
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>We'll help you find matches nearby</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: locationGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: locationGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput ref={locationInputRef} style={styles.focusedLocationInput} value={location} onChangeText={setLocation} placeholder="City, State" placeholderTextColor="rgba(255, 255, 255, 0.6)" editable={!detectingLocation} returnKeyType="next" />
          </Animated.View>
          <TouchableOpacity style={styles.focusedLocationButton} onPress={detectLocation} disabled={detectingLocation}>
            {detectingLocation ? <ActivityIndicator color="#fff" /> : <Text style={styles.focusedLocationButtonText}>📍 Use My Location</Text>}
          </TouchableOpacity>
          {location.trim().length > 0 && <Animated.View style={[styles.successIndicator, { opacity: locationOpacity }]}><Text style={styles.successText}>✓ Location set! Tap Continue</Text></Animated.View>}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep5LookingFor = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: lookingForScale }], opacity: lookingForOpacity }]}>
        <LinearGradient colors={['#4facfe', '#667eea', '#764ba2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, { padding: rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 20 }]}>💕</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>What are you looking for?</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>Help us understand what you want</Text>
          <View style={styles.focusedPickerWrapper}>
            <Picker selectedValue={lookingFor} onValueChange={(v) => v && setLookingFor(v)} style={styles.focusedPicker} itemStyle={styles.focusedPickerItem}>
              <Picker.Item label="Select an option" value="" enabled={false} />
              {LOOKING_FOR_OPTIONS.map(opt => <Picker.Item key={opt} label={opt} value={opt} />)}
            </Picker>
          </View>
          {lookingFor ? <Animated.View style={[styles.successIndicator, { opacity: lookingForOpacity }]}><Text style={styles.successText}>✓ Selected: {lookingFor}</Text></Animated.View> : null}
        </LinearGradient>
      </Animated.View>
    </View>
  );

  const renderStep6Bio = () => basicInfoStepWrapper(
    <View style={[styles.focusedFieldSection, keyboardVisible && styles.focusedSectionWithKeyboard, { minHeight: rs.sectionMinHeight, paddingHorizontal: rs.sectionPaddingH, paddingVertical: rs.sectionPaddingV }]}>
      <Animated.View style={[{ transform: [{ scale: bioScale }], opacity: bioOpacity }]}>
        <LinearGradient colors={['#667eea', '#f093fb', '#f5576c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.focusedFieldCard, keyboardVisible && styles.focusedCardWithKeyboard, { padding: keyboardVisible ? rs.cardPaddingKeyboard : rs.cardPadding }]}>
          <Text style={[styles.focusedEmoji, keyboardVisible && styles.focusedEmojiSmall, { fontSize: keyboardVisible ? rs.emojiSizeSmall : rs.emojiSize, marginBottom: keyboardVisible ? 8 : 20 }]}>📝</Text>
          <Text style={[styles.focusedTitle, keyboardVisible && styles.focusedTitleSmall, { fontSize: rs.titleSizeSmall, marginBottom: keyboardVisible ? 6 : rs.titleMargin }]}>Tell us about yourself</Text>
          <Text style={[styles.focusedSubtitle, keyboardVisible && styles.focusedSubtitleSmall, { fontSize: rs.subtitleSizeSmall, marginBottom: keyboardVisible ? 16 : rs.subtitleMargin }]}>Share what makes you unique</Text>
          <Animated.View style={[styles.focusedInputWrapper, { shadowOpacity: bioGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] }), shadowRadius: bioGlow.interpolate({ inputRange: [0, 1], outputRange: [8, 20] }) }]}>
            <TextInput style={styles.focusedBioInput} value={bio} onChangeText={setBio} placeholder="Write a bit about yourself..." placeholderTextColor="rgba(255, 255, 255, 0.6)" multiline numberOfLines={6} maxLength={500} textAlignVertical="top" returnKeyType="done" blurOnSubmit={true} />
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

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      {/* Dealbreakers Section - Compact */}
      <LinearGradient
        colors={['#f5576c', '#f093fb', '#667eea']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.modernHeaderCondensed}
      >
        <Text style={styles.modernHeaderEmojiCondensed}>🚫</Text>
        <Text style={styles.modernHeaderTitleCondensed}>Your Dealbreakers</Text>
        <Text style={styles.modernHeaderSubtitleCondensed}>
          What can't you compromise on? (Optional)
        </Text>
        <View style={styles.selectionCounterCondensed}>
          <Text style={styles.selectionCounterTextCondensed}>
            {dealbreakers.length} selected
          </Text>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.stepContent}
        contentContainerStyle={styles.dealbreakersScrollContent}
        showsVerticalScrollIndicator={true}
        scrollIndicatorInsets={{ right: 1 }}
      >
        <View style={styles.dealbreakersGrid}>
          {DEALBREAKER_OPTIONS.map((dealbreaker, index) => {
            const isSelected = dealbreakers.includes(dealbreaker);
            // Emoji mapping for dealbreakers
            const dealbreakerEmojis: { [key: string]: string } = {
              'Smokes cigarettes': '🚭',
              'Marijuana': '🌿',
              'Frequent drinking': '🍺',
              'Drug use': '💊',
              'Doesn\'t want children': '👶',
              'Wants children': '👨‍👩‍👧',
              'Poor communication': '💬',
              'No ambition': '📈',
              'Doesn\'t like pets': '🐕',
            };
            const emoji = dealbreakerEmojis[dealbreaker] || '⚠️';
            return (
              <TouchableOpacity
                key={dealbreaker}
                style={styles.dealbreakerCard}
                onPress={() => toggleDealbreaker(dealbreaker)}
                activeOpacity={0.8}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={['#f5576c', '#f093fb', '#667eea']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.dealbreakerCardGradient}
                  >
                    <Text style={styles.dealbreakerEmoji}>{emoji}</Text>
                    <Text 
                      style={styles.dealbreakerTextSelected}
                      numberOfLines={2}
                      adjustsFontSizeToFit={false}
                    >
                      {dealbreaker}
                    </Text>
                    {isSelected && (
                      <View style={styles.dealbreakerCheckmarkContainer}>
                        <Text style={styles.dealbreakerCheckmark}>✓</Text>
                      </View>
                    )}
                  </LinearGradient>
                ) : (
                  <View style={styles.dealbreakerCardUnselected}>
                    <Text style={styles.dealbreakerEmojiUnselected}>{emoji}</Text>
                    <Text 
                      style={styles.dealbreakerText}
                      numberOfLines={2}
                      adjustsFontSizeToFit={false}
                    >
                      {dealbreaker}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      {/* Partner Qualities Section - Minimal (more room for qualities grid) */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.modernHeaderMinimal}
      >
        <Text style={styles.modernHeaderEmojiMinimal}>💕</Text>
        <Text style={styles.modernHeaderTitleMinimal}>What You Want in a Partner</Text>
        <Text style={styles.modernHeaderSubtitleMinimal}>
          Select at least 3 qualities you value
        </Text>
        <View style={styles.selectionCounterMinimal}>
          <Text style={styles.selectionCounterTextMinimal}>
            {qualities.length} selected {qualities.length >= 3 && '✓'}
          </Text>
          {qualities.length < 3 && (
            <Text style={styles.modernHeaderSubtitleMinimal}>
              ({3 - qualities.length} more needed)
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
            const isSelected = qualities.includes(interest);
            const emoji = INTEREST_EMOJIS[interest] || '✨';
            return (
              <TouchableOpacity
                key={interest}
                style={styles.modernInterestCardCondensed}
                onPress={() => toggleQuality(interest)}
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
                    {isSelected && (
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
        
        {/* Scroll indicator hint */}
        <View style={styles.scrollHintCondensed}>
          <Text style={styles.scrollHintTextCondensed}>
            👆 Scroll to see all {INTEREST_OPTIONS.length} qualities
          </Text>
        </View>
      </ScrollView>
      
      {/* Fade gradient at bottom */}
      <LinearGradient
        colors={['transparent', 'rgba(248, 249, 250, 0.8)', '#f8f9fa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );

  // Steps 10-13: One card per page (min age, max age, preferred genders, max distance)
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
          <Text style={[styles.focusedEmoji, { fontSize: rs.emojiSize, marginBottom: 20 }]}>⚧️</Text>
          <Text style={[styles.focusedTitle, { fontSize: rs.titleSize, marginBottom: rs.titleMargin }]}>Preferred Genders</Text>
          <Text style={[styles.focusedSubtitle, { fontSize: rs.subtitleSize, marginBottom: rs.subtitleMargin }]}>Select all that apply</Text>
          <View style={styles.preferencesGenderGrid}>
            {PREFERRED_GENDER_OPTIONS.map(gender => {
              const isSelected = preferredGenders.includes(gender);
              return (
                <TouchableOpacity key={gender} style={styles.preferencesGenderCard} onPress={() => togglePreferredGender(gender)} activeOpacity={0.7}>
                  {isSelected ? (
                    <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preferencesGenderCardSelected}>
                      <Text style={styles.preferencesGenderTextSelected}>{gender}</Text>
                      <View style={styles.preferencesCheckmark}><Text style={styles.preferencesCheckmarkText}>✓</Text></View>
                    </LinearGradient>
                  ) : (
                    <View style={styles.preferencesGenderCardUnselected}>
                      <Text style={styles.preferencesGenderText}>{gender}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          {preferredGenders.length > 0 && <Animated.View style={[styles.successIndicator, { opacity: preferredGendersOpacity }]}><Text style={styles.successText}>✓ {preferredGenders.length} selected</Text></Animated.View>}
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

  const renderStep6 = () => {
    const lifestyleFields = [
      { key: 'smoking', label: 'Smoking', emoji: '🚭', options: ['Non-smoker', 'Smokes Cigarettes', 'Uses Marijuana', 'Both'], value: smoking, setValue: setSmoking, scale: smokingScale, opacity: smokingOpacity, glow: smokingGlow, ref: smokingCardRef, gradient: ['#f5576c', '#f093fb', '#667eea'] },
      { key: 'drinking', label: 'Drinking', emoji: '🥂', options: ['Non-drinker', 'Occasionally', 'Social drinker'], value: drinking, setValue: setDrinking, scale: drinkingScale, opacity: drinkingOpacity, glow: drinkingGlow, ref: drinkingCardRef, gradient: ['#667eea', '#764ba2', '#f093fb'] },
      { key: 'children', label: 'Children', emoji: '👶', options: ['Wants children', 'Doesn\'t want children', 'Has children', 'Open to children'], value: children, setValue: setChildren, scale: childrenScale, opacity: childrenOpacity, glow: childrenGlow, ref: childrenCardRef, gradient: ['#f093fb', '#f5576c', '#4facfe'] },
      { key: 'pets', label: 'Pets', emoji: '🐾', options: ['Loves pets', 'Has pets', 'Open to pets', 'Allergic to pets', 'Doesn\'t like pets'], value: pets, setValue: setPets, scale: petsScale, opacity: petsOpacity, glow: petsGlow, ref: petsCardRef, gradient: ['#4facfe', '#00f2fe', '#667eea'] },
      { key: 'religion', label: 'Religion/Spirituality', emoji: '🙏', options: ['Religious', 'Spiritual', 'Not religious', 'Agnostic', 'Atheist'], value: religion, setValue: setReligion, scale: religionScale, opacity: religionOpacity, glow: religionGlow, ref: religionCardRef, gradient: ['#764ba2', '#f093fb', '#f5576c'] },
      { key: 'workLifeBalance', label: 'Work-Life Balance', emoji: '⚖️', options: ['Workaholic', 'Balanced', 'Prioritizes leisure'], value: workLifeBalance, setValue: setWorkLifeBalance, scale: workLifeBalanceScale, opacity: workLifeBalanceOpacity, glow: workLifeBalanceGlow, ref: workLifeBalanceCardRef, gradient: ['#667eea', '#4facfe', '#00f2fe'] },
      { key: 'worksOut', label: 'Works Out', emoji: '💪', options: ['All the time', 'Frequently', 'Sometimes', 'Never'], value: worksOut, setValue: setWorksOut, scale: worksOutScale, opacity: worksOutOpacity, glow: worksOutGlow, ref: worksOutCardRef, gradient: ['#f5576c', '#667eea', '#764ba2'] },
    ];

    // Determine which cards should be shown
    const shouldShowCard = (index: number) => {
      if (index === 0) return true; // First card always visible
      // Show next card when previous is completed
      for (let i = 0; i < index; i++) {
        if (!lifestyleFields[i].value) return false;
      }
      return true;
    };

    return (
      <View style={styles.stepContainer}>
        {/* Modern Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.modernHeaderCondensed}
        >
          <Text style={styles.modernHeaderEmojiCondensed}>🌱</Text>
          <Text style={styles.modernHeaderTitleCondensed}>Your Lifestyle</Text>
          <Text style={styles.modernHeaderSubtitleCondensed}>
            Tell us about your lifestyle preferences
          </Text>
        </LinearGradient>

        <ScrollView 
          ref={scrollViewRef}
          style={styles.stepContent}
          contentContainerStyle={styles.lifestyleScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {lifestyleFields.map((field, index) => {
            const isVisible = shouldShowCard(index);
            if (!isVisible) return null;

            return (
              <Animated.View
                key={field.key}
                ref={field.ref}
                style={[
                  styles.lifestyleCard,
                  {
                    transform: [{ scale: field.scale }],
                    opacity: field.opacity,
                  },
                ]}
                onLayout={(e) => {
                  const { y } = e.nativeEvent.layout;
                  lifestyleCardYsRef.current[field.key] = y;
                }}
              >
                <LinearGradient
                  colors={field.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.lifestyleCardGradient, { padding: rs.lifestyleCardPadding }]}
                >
                  <Text style={[styles.lifestyleEmoji, { fontSize: rs.lifestyleEmojiSize, marginBottom: 12 }]}>{field.emoji}</Text>
                  <Text style={[styles.lifestyleTitle, { fontSize: rs.lifestyleTitleSize, marginBottom: 8 }]}>{field.label}</Text>
                  
                  <View style={styles.lifestylePickerWrapper}>
                    <Picker
                      selectedValue={field.value}
                      onValueChange={(itemValue) => {
                        if (itemValue && itemValue !== '') {
                          step6AllowScrollRef.current = true;
                          field.setValue(itemValue);
                          // Scroll to next card only if there is one (don't scroll on last card - worksOut)
                          const nextIndex = index + 1;
                          const nextKey = lifestyleFields[nextIndex]?.key;
                          if (nextKey) {
                            // Retry scroll - next card may not have laid out yet (progressive disclosure)
                            const tryScroll = (attempt = 0) => {
                              const nextY = lifestyleCardYsRef.current[nextKey];
                              if (typeof nextY === 'number') {
                                scrollViewRef.current?.scrollTo({ y: nextY - 20, animated: true });
                              } else if (attempt < 5) {
                                setTimeout(() => tryScroll(attempt + 1), 150);
                              }
                            };
                            setTimeout(() => tryScroll(0), 350);
                          }
                        }
                      }}
                      style={styles.lifestylePicker}
                      itemStyle={styles.lifestylePickerItem}
                    >
                      <Picker.Item label={`Select ${field.label.toLowerCase()}`} value="" enabled={false} />
                      {field.options.map(opt => (
                        <Picker.Item key={opt} label={opt} value={opt} />
                      ))}
                    </Picker>
                  </View>

                  {field.value && (
                    <View style={styles.lifestyleSelectedIndicator}>
                      <Text style={styles.lifestyleSelectedText}>✓ {field.value}</Text>
                    </View>
                  )}
                </LinearGradient>
              </Animated.View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

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
            Upload at least 5 photos (up to 6 total)
          </Text>
          <Text style={[styles.modernHeaderSubtitleCondensed, { marginTop: 8, fontSize: 14, opacity: 0.9 }]}>
            {photos.length} / 5 minimum ({photos.length >= 5 ? '✓ Ready' : 'Need more'})
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
              const isRequired = slotIndex < 5;

              return (
                <View key={slotIndex} style={styles.photoSlot}>
                  {photo ? (
                    <View style={styles.photoContainer}>
                      <OptimizedImage
                        source={photo.url || photo.uri}
                        style={styles.photoImage}
                        resizeMode="cover"
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
                        isRequired && photos.length < 5 && styles.addPhotoButtonRequired
                      ]}
                      onPress={canAddMore ? handlePickPhoto : undefined}
                      disabled={!canAddMore || uploadingSlotIndex !== null}
                    >
                      <LinearGradient
                        colors={
                          isRequired && photos.length < 5
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
        {existingProfile ? (
          <TouchableOpacity
            style={styles.exitButton}
            onPress={() => {
              (navigation as any).navigate('MainTabs', { screen: 'Browse' });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.exitButtonText}>Exit</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.title}>Create Your Profile</Text>
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
      {step === 4 && renderStep4Location()}
      {step === 5 && renderStep5LookingFor()}
      {step === 6 && renderStep6Bio()}
      {step === 7 && renderStep2()}
      {step === 8 && renderStep3()}
      {step === 9 && renderStep4()}
      {step === 10 && renderStep10MinAge()}
      {step === 11 && renderStep11MaxAge()}
      {step === 12 && renderStep12PreferredGenders()}
      {step === 13 && renderStep13MaxDistance()}
      {step === 14 && renderStep6()}
      {step === 15 && renderStep7()}

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
              disabled={loading || photos.length < 5}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={loading || photos.length < 5 
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
  exitButton: {
    position: 'absolute',
    top: 52,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 10,
  },
  exitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#2d3748',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },
  focusedFirstNameInputKeyboard: {
    padding: 20,
    fontSize: 22,
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
