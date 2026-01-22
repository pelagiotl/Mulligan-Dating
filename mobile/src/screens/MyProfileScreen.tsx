import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
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
    max_distance: number;
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

export default function MyProfileScreen() {
  const navigation = useNavigation();
  const { refreshProfile, user } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  
  // Animation for header elements
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.95)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;
  
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
    if (data) {
      // Animate header entrance
      Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(headerScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.spring(avatarScale, {
          toValue: 1,
          tension: 40,
          friction: 6,
          delay: 100,
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
  }, [data]);

  useEffect(() => {
    // Only fetch data if user is authenticated
    if (user) {
      fetchProfile();
      fetchPhotos();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchPhotos = async () => {
    if (!user) return;
    try {
      const data = await api.get<{ photos: Photo[] }>('/photos/me');
      setPhotos(data.photos || []);
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
      setLoading(true);
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

  const handlePickImage = async () => {
    try {
      // Request camera roll permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed', 
          'Please grant photo library access to upload photos. You can enable this in Settings > Privacy & Security > Photos.'
        );
        return;
      }

      // Check if we can upload more photos
      if (photos.length >= 6) {
        Alert.alert('Limit reached', 'You can only upload up to 6 photos');
        return;
      }

      // Launch image picker with more flexible options
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false, // Allow full image selection without cropping
        quality: 0.9, // Higher quality
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      } else if (result.canceled) {
        // User canceled, no error needed
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

  const uploadPhoto = async (uri: string) => {
    try {
      setUploading(true);

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

      // Get token first
      const token = await AsyncStorage.getItem('token');
      if (!token) {
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

      // Refresh photos and profile
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
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    try {
      await api.delete(`/photos/${photoId}`);
      await fetchPhotos();
      await fetchProfile();
      await refreshProfile();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to delete photo');
    }
  };

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
          onPress={() => navigation.navigate('CreateProfile' as never)}
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
    <View style={styles.wrapper}>
      {/* Beautiful gradient background */}
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
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
          colors={['#fff', '#fff5f8', '#fff', '#fff5f8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradientInner}
        >
          <View style={styles.header}>
            {profilePhotoUrl ? (
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
                  source={{ uri: profilePhotoUrl }}
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

              {profile.location && (
                <LinearGradient
                  colors={['#4facfe', '#00f2fe']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>📍</Text>
                  <Text style={styles.infoCardLabel}>Location</Text>
                  <Text style={styles.infoCardValueFull}>{profile.location}</Text>
                </LinearGradient>
              )}

              {profile.looking_for && (
                <LinearGradient
                  colors={['#f5576c', '#f093fb', '#667eea']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.infoCardFull}
                >
                  <Text style={styles.infoCardEmoji}>💕</Text>
                  <Text style={styles.infoCardLabel}>Looking For</Text>
                  <Text style={styles.infoCardValueFull}>{profile.looking_for}</Text>
                </LinearGradient>
              )}

              {profile.bio && (
                <View style={styles.bioContainer}>
                  <LinearGradient
                    colors={['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.bioGradient}
                  >
                    <View style={styles.bioHeader}>
                      <Text style={styles.bioIcon}>💬</Text>
                      <Text style={styles.bioTitle}>About Me</Text>
                    </View>
                    <Text style={styles.bio}>{profile.bio}</Text>
                  </LinearGradient>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Photos Section */}
      <View style={styles.section}>
        <View style={styles.sectionTitleContainer}>
          <AnimatedEmoji emoji="📸" delay={0} />
          <Text style={styles.sectionTitle}> My Photos</Text>
        </View>
        <View style={styles.photosGrid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoContainer}>
              <Image
                source={{ uri: getPhotoUrl(photo.url) }}
                style={styles.photo}
                resizeMode="cover"
              />
              {photo.isPrimary && (
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
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity
              style={styles.addPhotoButton}
              onPress={handlePickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#8B1538" />
              ) : (
                <Text style={styles.addPhotoText}>+</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.photoHint}>
          {photos.length}/6 photos {photos.length < 6 && '(tap + to add)'}
        </Text>
      </View>

      {/* Interests */}
      {interests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🎯" delay={200} />
            <Text style={styles.sectionTitle}> My Interests</Text>
          </View>
          <View style={styles.tagsContainer}>
            {interests.map((interest, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{interest.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Dealbreakers */}
      {dealbreakers.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🚫" delay={400} />
            <Text style={styles.sectionTitle}> My Dealbreakers</Text>
          </View>
          <View style={styles.tagsContainer}>
            {dealbreakers.map((db, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{db.description}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Partner Qualities */}
      {partnerQualities.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="💕" delay={600} />
            <Text style={styles.sectionTitle}> What I'm Looking For</Text>
          </View>
          <View style={styles.tagsContainer}>
            {partnerQualities.map((q, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{q.quality}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Lifestyle */}
      {lifestyle && (
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <AnimatedEmoji emoji="🌱" delay={800} />
            <Text style={styles.sectionTitle}> Lifestyle</Text>
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
        </View>
      )}

      {/* Edit Profile Button */}
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => navigation.navigate('CreateProfile' as never)}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingVertical: 20, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={styles.editButtonText}>✨ Edit Profile</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Legal Footer */}
      <View style={{ marginTop: 'auto', paddingTop: 20 }}>
        <LegalFooter />
      </View>
      </ScrollView>
    </View>
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
    marginBottom: 24,
    marginHorizontal: 16,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 14,
  },
  headerGradientInner: {
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#fff',
  },
  header: {
    padding: 40,
    paddingTop: 48,
    borderBottomWidth: 0,
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
    fontSize: 44,
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 28,
    letterSpacing: -1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(102, 126, 234, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  infoCardGradient: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoCardFull: {
    width: '100%',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 100,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoCardEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  infoCardLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  infoCardValue: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
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
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: 'rgba(102, 126, 234, 0.3)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  bioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  bioIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  bioTitle: {
    fontSize: 16,
    color: '#667eea',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  bio: {
    fontSize: 18,
    color: '#1a1a1a',
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    padding: 28,
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 28,
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
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1a1a1a',
    marginLeft: 12,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
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
    marginTop: 28,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
