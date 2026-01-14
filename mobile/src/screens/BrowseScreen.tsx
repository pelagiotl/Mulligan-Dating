import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { getPhotoUrl } from '../utils/photoUrl';
import { useAuth } from '../context/AuthContext';
import TokenDisplay from '../components/TokenDisplay';
import MatchCelebration from '../components/MatchCelebration';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location?: string;
  bio?: string;
  photoUrl?: string;
  photos?: Photo[];
  interests: string[];
  lookingFor?: string;
  distance?: number | null;
}

export default function BrowseScreen() {
  const navigation = useNavigation();
  const { profile: userProfile } = useAuth();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [showMatchCelebration, setShowMatchCelebration] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [browseUnlocked, setBrowseUnlocked] = useState<boolean | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const checkBrowseUnlocked = async () => {
    try {
      // Try to fetch a profile - if we get 403, browsing is locked
      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=0`);
      // If we get data (even if null profile), browsing is unlocked
      setBrowseUnlocked(true);
      return true;
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      const errorMessage = err?.message || err?.error || '';
      
      // 403 status means browsing is locked
      if (status === 403) {
        console.log('🔒 Browsing is locked - need to unlock with token');
        setBrowseUnlocked(false);
        return false;
      }
      
      // Check error message for lock-related text
      if (errorMessage.toLowerCase().includes('browsing is locked') || 
          errorMessage.toLowerCase().includes('locked') ||
          errorMessage.toLowerCase().includes('use a token to unlock')) {
        console.log('🔒 Browsing is locked (from error message)');
        setBrowseUnlocked(false);
        return false;
      }
      
      // For other errors (network, etc), don't assume unlocked - show error
      console.error('❌ Browse check error:', err);
      setBrowseUnlocked(false); // Default to locked to be safe
      setError('Failed to check browse status. Please try again.');
      return false;
    }
  };

  const handleUnlockBrowse = async () => {
    if (unlocking) return;
    
    setUnlocking(true);
    setError('');

    try {
      await api.post('/users/unlock-browse', {});
      setBrowseUnlocked(true);
      // Now fetch the first profile
      await fetchProfile();
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to unlock browsing. Please try again.';
      setError(errorMessage);
      setTimeout(() => setError(''), 8000);
    } finally {
      setUnlocking(false);
    }
  };

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await api.get<{
        profile: Profile | null;
        hasMore: boolean;
        offset: number;
        total: number;
      }>(`/users/browse?offset=${offset}`);

      // If we get here, browsing is unlocked
      setBrowseUnlocked(true);

      if (data.profile) {
        // Fetch photos for this profile
        try {
          const photosData = await api.get<{ photos: Photo[] }>(
            `/photos/profile/${data.profile.id}`
          );
          data.profile.photos = photosData.photos;
        } catch (photoErr) {
          data.profile.photos = [];
        }
        setCurrentPhotoIndex(0);
      }

      setCurrentProfile(data.profile);
      setHasMore(data.hasMore);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.error ||
        err?.error ||
        err?.message ||
        'Failed to load profiles';

      const errorLower = errorMessage.toLowerCase();
      const status = err?.status || err?.response?.status;

      // Check if browsing is locked (403 status)
      if (status === 403) {
        console.log('🔒 Browse endpoint returned 403 - browsing is locked');
        setBrowseUnlocked(false);
        setCurrentProfile(null);
        setError('');
        setLoading(false);
        return;
      }

      if (
        status === 400 ||
        errorLower.includes('complete your profile') ||
        errorLower.includes('please complete your profile') ||
        (errorLower.includes('profile') &&
          (errorLower.includes('not found') || errorLower.includes('complete')))
      ) {
        setCurrentProfile(null);
        setError('');
      } else {
        setError(errorMessage);
        setCurrentProfile(null);
      }
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [offset]);

  useEffect(() => {
    if (!hasFetched) {
      // Try to fetch profile directly - fetchProfile will handle 403 errors
      fetchProfile();
    }
  }, []);

  useEffect(() => {
    if (hasFetched && offset > 0) {
      fetchProfile();
    }
  }, [offset]);

  // Initialize socket connection
  useEffect(() => {
    let socket: Socket | null = null;

    const initSocket = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !userProfile) return;

      const API_URL = process.env.API_URL || 'https://mulligan-backend.onrender.com';
      socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Browse: Connected to WebSocket server');
      });

      socket.on('disconnect', () => {
        console.log('❌ Browse: Disconnected from WebSocket server');
      });

      socket.on('new_match', (data: {
        matchId: string;
        otherUserId: string;
        otherUserName: string;
        message: string;
        stage: string;
      }) => {
        setMatchNotification(data.message);
        setTimeout(() => setMatchNotification(null), 5000);
      });
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [userProfile]);

  const handleConnect = async (profile: Profile) => {
    if (connecting) return;

    setConnecting(true);
    setError('');

    try {
      const result = await api.post<{
        message: string;
        isMutual: boolean;
        matchId: string;
        stage: string;
      }>('/matches/connect', { targetUserId: profile.userId });

      // Success! Automatically show match celebration
      console.log('✅ Match created successfully:', result);
      
      // Clear the current profile immediately so it doesn't show behind the celebration
      setCurrentProfile(null);
      
      // Show celebration modal - this will automatically appear
      setMatchedProfile(profile);
      setShowMatchCelebration(true);
      
      setConnecting(false);
    } catch (err: any) {
      let errorMessage = 'Failed to connect. Please try again.';

      if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
        if ('status' in err) {
          const apiErr = err as Error & { status: number };
          if (apiErr.status === 400) {
            errorMessage =
              err.message ||
              'Cannot connect. Please check that both you and the other person have photos uploaded and you have available tokens.';
          } else if (apiErr.status === 401) {
            errorMessage = 'Session expired. Please log in again.';
          } else if (apiErr.status === 404) {
            errorMessage = 'Profile not found. Please refresh and try again.';
          } else if (apiErr.status === 408) {
            errorMessage = 'Request timed out. The server may be slow. Please try again.';
          }
        }
      }

      setError(errorMessage);
      setTimeout(() => setError(''), 8000);
      setConnecting(false);
    }
  };

  const handleCelebrationClose = () => {
    setShowMatchCelebration(false);
    setMatchedProfile(null);
    // Move to next profile after celebration
    setOffset((prev) => prev + 1);
  };

  const needsProfile = !userProfile && !loading;

  const photos = currentProfile?.photos || [];
  const primaryPhoto = photos.find((p) => p.isPrimary) || photos[0];
  const profilePhotoUrl = primaryPhoto
    ? getPhotoUrl(primaryPhoto.url)
    : currentProfile?.photoUrl
    ? getPhotoUrl(currentProfile.photoUrl)
    : null;

  if (loading && !hasFetched) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B1538" />
        <Text style={styles.loadingText}>Finding Amazing People</Text>
        <Text style={styles.loadingSubtitle}>Searching for your perfect match</Text>
      </View>
    );
  }

  // Show landing page when browsing is locked (false or null initially)
  const showLandingPage = (browseUnlocked === false || (browseUnlocked === null && hasFetched && !loading)) && !needsProfile;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Match Notification */}
      {matchNotification && (
        <TouchableOpacity
          style={styles.notification}
          onPress={() => {
            setMatchNotification(null);
            navigation.navigate('Matches' as never);
          }}
        >
          <Text style={styles.notificationText}>{matchNotification}</Text>
        </TouchableOpacity>
      )}

      {/* Browse Locked State - Beautiful Landing Page */}
      {showLandingPage ? (
        <View style={styles.landingPageWrapper}>
          <View style={styles.landingContainer}>
            {/* Decorative gradient background */}
            <View style={styles.landingGradient} />
            
            {/* Main content */}
            <View style={styles.landingContent}>
              <View style={styles.landingIconContainer}>
                <Text style={styles.landingIcon}>💘</Text>
              </View>
              
              <Text style={styles.landingTitle}>Discover People</Text>
              <Text style={styles.landingSubtitle}>
                Find someone who shares your interests and values
              </Text>
              
              <View style={styles.landingFeatures}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>✨</Text>
                  <Text style={styles.featureText}>Quality Matches</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>🎯</Text>
                  <Text style={styles.featureText}>Shared Interests</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureIcon}>💝</Text>
                  <Text style={styles.featureText}>Meaningful Connections</Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={[styles.landingButton, unlocking && styles.landingButtonDisabled]}
                onPress={handleUnlockBrowse}
                disabled={unlocking}
              >
                {unlocking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.landingButtonText}>Connect (Use Token)</Text>
                    <Text style={styles.landingButtonSubtext}>Start discovering amazing people</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <Text style={styles.landingHint}>
                Use a token to unlock browsing and see profiles
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          {/* Header - only show when not on landing page */}
          <View style={styles.header}>
            <TokenDisplay />
            <Text style={styles.title}>Discover People</Text>
            <Text style={styles.subtitle}>Find someone who shares your interests and values</Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}
        </>
      )}

      {/* Other states - only show when not on landing page */}
      {!showLandingPage && (
        <>
          {needsProfile ? (
        <View style={styles.noProfileContainer}>
          <Text style={styles.noProfileEmoji}>🚀</Text>
          <Text style={styles.noProfileText}>
            Create your profile to start discovering people!
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateProfile' as never)}
          >
            <Text style={styles.createButtonText}>Create Profile</Text>
          </TouchableOpacity>
        </View>
      ) : !currentProfile && !loading ? (
        <View style={styles.noMoreContainer}>
          <Text style={styles.noMoreEmoji}>🔍</Text>
          <Text style={styles.noMoreTitle}>No more profiles</Text>
          <Text style={styles.noMoreText}>
            You've seen everyone! Check back later for new people.
          </Text>
        </View>
      ) : currentProfile ? (
        <View style={styles.profileCard}>
          {/* Photo Gallery */}
          {photos.length > 0 ? (
            <View style={styles.photoGallery}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const index = Math.round(
                    event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                  );
                  setCurrentPhotoIndex(index);
                }}
                style={styles.photoScrollView}
              >
                {photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: getPhotoUrl(photo.url) }}
                    style={[styles.profilePhoto, { width: SCREEN_WIDTH - 40 }]}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
              {photos.length > 1 && (
                <View style={styles.photoIndicators}>
                  {photos.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.photoIndicator,
                        index === currentPhotoIndex && styles.photoIndicatorActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : profilePhotoUrl ? (
            <Image
              source={{ uri: profilePhotoUrl }}
              style={styles.profilePhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>
                {currentProfile.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{currentProfile.displayName}</Text>
              <Text style={styles.age}>{currentProfile.age}</Text>
            </View>

            {currentProfile.location && (
              <Text style={styles.location}>📍 {currentProfile.location}</Text>
            )}

            {currentProfile.distance !== null && currentProfile.distance !== undefined && (
              <Text style={styles.distance}>
                {Math.round(currentProfile.distance)} miles away
              </Text>
            )}

            {currentProfile.bio && (
              <Text style={styles.bio}>{currentProfile.bio}</Text>
            )}

            {currentProfile.lookingFor && (
              <View style={styles.lookingForContainer}>
                <Text style={styles.lookingForLabel}>Looking for:</Text>
                <Text style={styles.lookingForValue}>{currentProfile.lookingFor}</Text>
              </View>
            )}

            {currentProfile.interests.length > 0 && (
              <View style={styles.interestsContainer}>
                <Text style={styles.interestsLabel}>Interests:</Text>
                <View style={styles.interestsList}>
                  {currentProfile.interests.slice(0, 6).map((interest, idx) => (
                    <View key={idx} style={styles.interestTag}>
                      <Text style={styles.interestText}>{interest}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Connect Button - Automatically creates match */}
          <TouchableOpacity
            style={[styles.connectButton, connecting && styles.connectButtonDisabled]}
            onPress={() => handleConnect(currentProfile)}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.connectButtonText}>Connect & Match 🎟️</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
        </>
      )}

      {/* Match Celebration Modal */}
      {showMatchCelebration && matchedProfile && (
        <MatchCelebration
          profileName={matchedProfile.displayName}
          photoUrl={
            matchedProfile.photos?.find((p) => p.isPrimary)?.url ||
            matchedProfile.photos?.[0]?.url ||
            matchedProfile.photoUrl ||
            undefined
          }
          onClose={handleCelebrationClose}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8B1538',
    marginTop: 16,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  notification: {
    position: 'absolute',
    top: 20,
    left: '5%',
    right: '5%',
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 8,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B1538',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 12,
    margin: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  noProfileContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
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
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  noMoreContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  noMoreEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  noMoreText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Landing page styles (when browsing is locked)
  landingPageWrapper: {
    flex: 1,
    paddingTop: 20,
  },
  landingContainer: {
    position: 'relative',
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: 'hidden',
    minHeight: 500,
  },
  landingGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#8B1538',
    opacity: 0.05,
  },
  landingContent: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  landingIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  landingIcon: {
    fontSize: 48,
  },
  landingTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B1538',
    marginBottom: 12,
    textAlign: 'center',
  },
  landingSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  landingFeatures: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: '500',
  },
  landingButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 12,
  },
  landingButtonDisabled: {
    opacity: 0.6,
  },
  landingButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  landingButtonSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
  landingHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  // Keep old styles for backward compatibility
  lockedContainer: {
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  lockedEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  lockedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  unlockButton: {
    backgroundColor: '#8B1538',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  unlockButtonDisabled: {
    opacity: 0.6,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  photoGallery: {
    position: 'relative',
  },
  photoScrollView: {
    height: SCREEN_WIDTH * 1.2,
  },
  profilePhoto: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
  },
  photoIndicators: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  photoIndicatorActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  photoPlaceholder: {
    width: SCREEN_WIDTH - 40,
    height: SCREEN_WIDTH * 1.2,
    backgroundColor: '#8B1538',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    fontSize: 80,
    color: '#fff',
    fontWeight: 'bold',
  },
  profileInfo: {
    padding: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  age: {
    fontSize: 24,
    color: '#666',
  },
  location: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  distance: {
    fontSize: 14,
    color: '#999',
    marginBottom: 12,
  },
  bio: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 16,
  },
  lookingForContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  lookingForLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  lookingForValue: {
    fontSize: 14,
    color: '#333',
  },
  interestsContainer: {
    marginBottom: 20,
  },
  interestsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  interestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  interestText: {
    fontSize: 14,
    color: '#333',
  },
  connectButton: {
    backgroundColor: '#8B1538',
    paddingVertical: 16,
    margin: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
