import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import { useAuth } from '../context/AuthContext';

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
  const { refreshProfile } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      const data = await api.get<{ photos: Photo[] }>('/photos/me');
      setPhotos(data.photos || []);
    } catch (err) {
      console.error('Failed to fetch photos:', err);
      setPhotos([]);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await api.get<ProfileData>('/profile');
      setData(profileData);
      setError('');
    } catch (err: any) {
      if (err?.status === 404) {
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
        Alert.alert('Permission needed', 'Please grant camera roll access to upload photos');
        return;
      }

      // Check if we can upload more photos
      if (photos.length >= 6) {
        Alert.alert('Limit reached', 'You can only upload up to 6 photos');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadPhoto = async (uri: string) => {
    try {
      setUploading(true);

      // Create FormData for React Native
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      // React Native FormData format - backend expects 'photos' (plural) for array upload
      formData.append('photos', {
        uri,
        name: filename,
        type,
      } as any);

      // Upload photo - need to use fetch directly for FormData in React Native
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.API_URL || 'https://mulligan-backend.onrender.com';
      const response = await fetch(`${API_URL}/api/photos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - let fetch set it with boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      // Refresh photos and profile
      await fetchPhotos();
      await fetchProfile();
      await refreshProfile();

      Alert.alert('Success', 'Photo uploaded successfully!');
    } catch (err: any) {
      console.error('Upload error:', err);
      Alert.alert('Error', err?.message || 'Failed to upload photo');
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
        <ActivityIndicator size="large" color="#8B1538" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  if (!data && !error) {
    return (
      <View style={styles.noProfileContainer}>
        <Text style={styles.noProfileEmoji}>😕</Text>
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

  // Get primary photo or first photo
  const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : profile.photo_url
    ? getPhotoUrl(profile.photo_url)
    : null;

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
      <View style={styles.header}>
        {profilePhotoUrl ? (
          <Image
            source={{ uri: profilePhotoUrl }}
            style={styles.avatar}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {profile.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{profile.display_name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Age</Text>
              <Text style={styles.metaValue}>{profile.age}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Gender</Text>
              <Text style={styles.metaValue}>{profile.gender}</Text>
            </View>
          </View>
          {profile.location && (
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Location</Text>
                <Text style={styles.metaValue}>{profile.location}</Text>
              </View>
            </View>
          )}
          {profile.looking_for && (
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Looking for</Text>
                <Text style={styles.metaValue}>{profile.looking_for}</Text>
              </View>
            </View>
          )}
          {profile.bio && (
            <View style={styles.bioContainer}>
              <Text style={styles.bio}>{profile.bio}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Photos Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📸 My Photos</Text>
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
          <Text style={styles.sectionTitle}>🎯 My Interests</Text>
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
          <Text style={styles.sectionTitle}>🚫 My Dealbreakers</Text>
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
          <Text style={styles.sectionTitle}>💕 What I'm Looking For</Text>
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
          <Text style={styles.sectionTitle}>🌱 Lifestyle</Text>
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
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </TouchableOpacity>
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
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  noProfileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#f5f5f5',
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
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    alignSelf: 'center',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metaItem: {
    marginHorizontal: 12,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bioContainer: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  bio: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoContainer: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  primaryBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8B1538',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  addPhotoText: {
    fontSize: 32,
    color: '#8B1538',
    fontWeight: '300',
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
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 14,
    color: '#333',
  },
  lifestyleContainer: {
    gap: 12,
  },
  lifestyleItem: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  lifestyleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    width: 140,
  },
  lifestyleValue: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  editButton: {
    backgroundColor: '#8B1538',
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
