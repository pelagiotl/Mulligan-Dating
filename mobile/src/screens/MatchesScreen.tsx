import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Animated,
  Dimensions,
  Modal,
  Vibration,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getPhotoUrl } from '../utils/photoUrl';
import { playMatchSound, playMessageSound } from '../utils/sounds';
import LegalFooter from '../components/LegalFooter';
import CompatibilityPulse from '../components/CompatibilityPulse';
import MulliganMoments from '../components/MulliganMoments';
import DateBlueprint from '../components/DateBlueprint';

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Match {
  id: string;
  stage: 'pending' | 'stage1' | 'stage2';
  status: string;
  createdAt: string;
  stage1At: string | null;
  stage2At: string | null;
  expiresAt: string | null;
  isInitiator: boolean;
  userWantsReveal?: boolean;
  otherWantsReveal?: boolean;
  unreadCount?: number;
  otherUser: {
    userId: string;
    displayName: string;
    age: number;
    bio: string | null;
    gender: string;
    location: string | null;
    photoUrl: string | null;
    profileId?: string;
    photos?: Photo[];
    interests: string[];
    values: string[];
    partnerQualities: Array<{ quality: string; importance: number }>;
  };
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
}

// Animated Heart Emoji Component
function AnimatedHeartEmoji() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <Animated.View
      style={{
        transform: [
          { scale: pulseAnim },
          { rotate: rotate },
        ],
      }}
    >
      <Text style={styles.animatedHeartEmoji}>💕</Text>
    </Animated.View>
  );
}

// Animated Header Gradient Component
function AnimatedHeaderGradient({ 
  children, 
  matchesCount,
  gradientPos 
}: { 
  children: React.ReactNode; 
  matchesCount: number;
  gradientPos?: Animated.Value;
}) {
  return (
    <Animated.View style={styles.headerGradient}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Animated.View>
  );
}

// Animated Match Card Component
function MatchCardAnimated({ 
  item, 
  index, 
  photoUrl, 
  getTimeRemaining,
  getStageBadgeStyle,
  getStageEmoji,
  onPress, 
  onUnmatch 
}: {
  item: Match;
  index: number;
  photoUrl: string | null;
  getTimeRemaining: (expiresAt: string | null) => string | null;
  getStageBadgeStyle: (stage: string) => any;
  getStageEmoji: (stage: string) => string;
  onPress: () => void;
  onUnmatch: (id: string) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const photoScaleAnim = useRef(new Animated.Value(0.95)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(photoScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        delay: index * 60 + 100,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Subtle shimmer effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    // Subtle glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
    
    // Pulse animation for stage2 badge
    if (item.stage === 'stage2') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, []);
  
  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <Animated.View
      style={[
        styles.matchCardWrapper,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.matchCard}
        onPress={onPress}
        activeOpacity={0.85}
      >
        {/* Subtle shimmer overlay */}
        <Animated.View
          style={[
            styles.shimmerOverlay,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.15, 0],
              }),
              transform: [{ translateX: shimmerTranslate }],
            },
          ]}
          pointerEvents="none"
        />
        <View style={styles.matchCardContent}>
          <View style={styles.photoWrapper}>
            {photoUrl ? (
              <Animated.View style={{ transform: [{ scale: photoScaleAnim }] }}>
                <View style={styles.photoContainer}>
                  <Image source={{ uri: photoUrl }} style={styles.matchPhoto} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.1)']}
                    style={styles.photoGradientOverlay}
                  />
                  {/* Subtle glow around photo */}
                  <Animated.View
                    style={[
                      styles.photoGlow,
                      {
                        opacity: glowAnim,
                      },
                    ]}
                    pointerEvents="none"
                  />
                </View>
              </Animated.View>
            ) : (
              <Animated.View style={{ transform: [{ scale: photoScaleAnim }] }}>
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  style={styles.matchPhoto}
                >
                  <Text style={styles.matchPhotoPlaceholderText}>
                    {item.otherUser.displayName.charAt(0).toUpperCase()}
                  </Text>
                </LinearGradient>
                {/* Subtle glow around placeholder */}
                <Animated.View
                  style={[
                    styles.photoGlow,
                    {
                      opacity: glowAnim,
                    },
                  ]}
                  pointerEvents="none"
                />
              </Animated.View>
            )}
            {item.stage === 'stage2' && (
              <Animated.View 
                style={[
                  styles.stage2Indicator,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              >
                <Text style={styles.stage2IndicatorText}>💕</Text>
              </Animated.View>
            )}
            {/* Unread message badge */}
            {item.unreadCount && item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.matchInfo}>
            <View style={styles.matchHeader}>
              <Text style={[styles.matchName, item.unreadCount && item.unreadCount > 0 && styles.matchNameUnread]}>
                {item.otherUser.displayName}
              </Text>
              <Text style={styles.matchAge}>, {item.otherUser.age}</Text>
            </View>
            {renderMatchLocation(item.otherUser.location)}
            <View style={styles.badgesRow}>
              <View style={styles.stageContainer}>
                <Animated.View style={item.stage === 'stage2' ? { transform: [{ scale: pulseAnim }] } : undefined}>
                  <LinearGradient
                    colors={item.stage === 'pending' ? ['#fff5f8', '#ffeef7'] : item.stage === 'stage1' ? ['#ffe6f3', '#ffd9ec'] : ['#ff6b9d', '#ff1493']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.stageBadge, getStageBadgeStyle(item.stage)]}
                  >
                    <Text style={styles.stageEmoji}>{getStageEmoji(item.stage)}</Text>
                    <Text style={[styles.stageText, item.stage === 'stage2' && { color: '#fff' }]}>
                      {item.stage === 'pending' ? 'Pending' : item.stage === 'stage1' ? 'Stage 1' : 'Stage 2'}
                    </Text>
                  </LinearGradient>
                </Animated.View>
              </View>
              {item.expiresAt && getTimeRemaining(item.expiresAt) && (
                <View style={styles.timerContainer}>
                  <Text style={styles.timerEmoji}>⏳</Text>
                  <Text style={styles.timerText}>
                    {getTimeRemaining(item.expiresAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.unmatchButton}
            onPress={(e) => {
              e.stopPropagation();
              onUnmatch(item.id);
            }}
          >
            <Text style={styles.unmatchButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Empty State Component with Animation
function EmptyStateAnimated({ navigation }: { navigation: any }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ])
      ),
    ]).start();
  }, []);
  
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });
  
  return (
    <View style={styles.emptyContainer}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyBackgroundGradient}
      />
      <Animated.View 
        style={[
          styles.emptyEmojiContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }, { rotate }],
          },
        ]}
      >
        <Text style={styles.emptyEmoji}>💔</Text>
      </Animated.View>
      <Animated.Text style={[styles.emptyTitle, { opacity: fadeAnim }]}>
        No matches yet
      </Animated.Text>
      <Animated.Text style={[styles.emptyText, { opacity: fadeAnim }]}>
        Start browsing to find your perfect match!
      </Animated.Text>
      <TouchableOpacity
        style={styles.browseButton}
        onPress={() => navigation.navigate('Browse' as never)}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb']}
          style={styles.browseButtonGradient}
        >
          <Text style={styles.browseButtonText}>✨ Browse People</Text>
        </LinearGradient>
      </TouchableOpacity>
      <LegalFooter />
    </View>
  );
}

// Match Profile Modal Component with Enhanced Animations
function MatchProfileModal({ 
  match, 
  visible, 
  onClose 
}: { 
  match: Match; 
  visible: boolean; 
  onClose: () => void;
}) {
  const { otherUser } = match;
  const { user } = useAuth();
  const [currentUserInterests, setCurrentUserInterests] = useState<string[]>([]);
  const primaryPhoto = otherUser.photos?.find(p => p.isPrimary) || otherUser.photos?.[0];
  const profilePhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : (otherUser.photoUrl ? getPhotoUrl(otherUser.photoUrl) : null);
  const allPhotos = otherUser.photos || [];
  
  // Fetch current user's interests when modal opens
  useEffect(() => {
    if (visible && user) {
      const fetchUserInterests = async () => {
        try {
          console.log('🔍 Fetching user interests for compatibility check...');
          const data = await api.get('/profile');
          console.log('📋 Profile data received:', {
            hasInterests: !!data.interests,
            interestsType: Array.isArray(data.interests),
            interestsLength: data.interests?.length,
            interestsSample: data.interests?.slice(0, 3),
          });
          
          if (data.interests && Array.isArray(data.interests)) {
            const interests = data.interests.map((i: any) => {
              // Handle both object format {name: "..."} and string format
              return typeof i === 'string' ? i : (i.name || i);
            });
            console.log('✅ Processed interests:', interests);
            setCurrentUserInterests(interests);
          } else {
            console.log('⚠️ No interests found in profile data');
            setCurrentUserInterests([]);
          }
        } catch (error: any) {
          console.error('❌ Could not fetch user interests for compatibility check:', error);
          setCurrentUserInterests([]);
        }
      };
      fetchUserInterests();
    } else {
      // Reset when modal closes
      setCurrentUserInterests([]);
    }
  }, [visible, user, match.id]);
  
  // Calculate common interests
  const matchInterests = otherUser.interests || [];
  const commonInterests = currentUserInterests.filter(interest => 
    matchInterests.some(matchInterest => 
      matchInterest.toLowerCase() === interest.toLowerCase()
    )
  );
  
  // Debug logging
  useEffect(() => {
    if (visible) {
      console.log('🔍 Compatibility check:', {
        currentUserInterestsCount: currentUserInterests.length,
        matchInterestsCount: matchInterests.length,
        commonInterestsCount: commonInterests.length,
        currentUserInterests: currentUserInterests.slice(0, 5),
        matchInterests: matchInterests.slice(0, 5),
        commonInterests: commonInterests.slice(0, 5),
      });
    }
  }, [visible, currentUserInterests, matchInterests, commonInterests]);
  
  // Calculate compatibility percentage
  const compatibilityPercentage = matchInterests.length > 0 
    ? Math.round((commonInterests.length / Math.max(matchInterests.length, currentUserInterests.length)) * 100)
    : 0;
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const photoScale = useRef(new Animated.Value(0.8)).current;
  const photoOpacity = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  
  // Continuous ring animations
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.3)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;
  const sparkle1Y = useRef(new Animated.Value(0)).current;
  const sparkle1X = useRef(new Animated.Value(0)).current;
  const sparkle2Y = useRef(new Animated.Value(0)).current;
  const sparkle2X = useRef(new Animated.Value(0)).current;
  const sparkle3Y = useRef(new Animated.Value(0)).current;
  const sparkle3X = useRef(new Animated.Value(0)).current;
  const avatarBreath = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (visible) {
      // Animate modal entrance
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.spring(photoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(photoOpacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 500,
          delay: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Start continuous ring animations after entrance
      setTimeout(() => {
        // Ring 1 pulsing
        Animated.loop(
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
        ).start();
        
        // Ring 2 pulsing (staggered)
        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(ring2Scale, {
                toValue: 1.2,
                duration: 2500,
                useNativeDriver: true,
              }),
              Animated.timing(ring2Opacity, {
                toValue: 0.6,
                duration: 2500,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(ring2Scale, {
                toValue: 1,
                duration: 2500,
                useNativeDriver: true,
              }),
              Animated.timing(ring2Opacity, {
                toValue: 0.4,
                duration: 2500,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();
        
        // Ring 3 pulsing (staggered)
        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(ring3Scale, {
                toValue: 1.25,
                duration: 3000,
                useNativeDriver: true,
              }),
              Animated.timing(ring3Opacity, {
                toValue: 0.5,
                duration: 3000,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(ring3Scale, {
                toValue: 1,
                duration: 3000,
                useNativeDriver: true,
              }),
              Animated.timing(ring3Opacity, {
                toValue: 0.3,
                duration: 3000,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();
        
        // Continuous rotation
        Animated.loop(
          Animated.timing(ringRotation, {
            toValue: 1,
            duration: 20000,
            useNativeDriver: true,
          })
        ).start();
        
        // Glow pulsing
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowPulse, {
              toValue: 1.3,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(glowPulse, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ])
        ).start();
        
        // Sparkle 1 floating
        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(sparkle1Y, {
                toValue: -15,
                duration: 2000,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle1X, {
                toValue: 10,
                duration: 2000,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(sparkle1Y, {
                toValue: 0,
                duration: 2000,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle1X, {
                toValue: 0,
                duration: 2000,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();
        
        // Sparkle 2 floating
        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(sparkle2Y, {
                toValue: 10,
                duration: 1800,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle2X, {
                toValue: -12,
                duration: 1800,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(sparkle2Y, {
                toValue: 0,
                duration: 1800,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle2X, {
                toValue: 0,
                duration: 1800,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();
        
        // Sparkle 3 floating
        Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(sparkle3Y, {
                toValue: -8,
                duration: 2200,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle3X, {
                toValue: 8,
                duration: 2200,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(sparkle3Y, {
                toValue: 0,
                duration: 2200,
                useNativeDriver: true,
              }),
              Animated.timing(sparkle3X, {
                toValue: 0,
                duration: 2200,
                useNativeDriver: true,
              }),
            ]),
          ])
        ).start();
        
        // Avatar breathing effect
        Animated.loop(
          Animated.sequence([
            Animated.timing(avatarBreath, {
              toValue: 1.02,
              duration: 3000,
              useNativeDriver: true,
            }),
            Animated.timing(avatarBreath, {
              toValue: 1,
              duration: 3000,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }, 500);
    } else {
      // Reset animations when closing
      fadeAnim.setValue(0);
      slideAnim.setValue(Dimensions.get('window').height);
      photoScale.setValue(0.8);
      photoOpacity.setValue(0);
      contentFade.setValue(0);
      ring1Scale.setValue(1);
      ring1Opacity.setValue(0.6);
      ring2Scale.setValue(1);
      ring2Opacity.setValue(0.4);
      ring3Scale.setValue(1);
      ring3Opacity.setValue(0.3);
      ringRotation.setValue(0);
      glowPulse.setValue(1);
      sparkle1Y.setValue(0);
      sparkle1X.setValue(0);
      sparkle2Y.setValue(0);
      sparkle2X.setValue(0);
      sparkle3Y.setValue(0);
      sparkle3X.setValue(0);
      avatarBreath.setValue(1);
    }
  }, [visible]);
  
  const rotation = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <Animated.View 
        style={[
          styles.modalOverlay,
          { opacity: fadeAnim }
        ]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header with close button */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ Profile</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.7)']}
                  style={styles.modalCloseButtonGradient}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            
            {/* Profile Photo with animated rings */}
            <View style={styles.modalPhotoContainer}>
              <Animated.View
                style={[
                  styles.modalPhotoWrapper,
                  {
                    transform: [{ scale: photoScale }],
                    opacity: photoOpacity,
                  },
                ]}
              >
                {/* Animated pulsing orb behind rings */}
                <Animated.View
                  style={[
                    styles.modalPhotoOrb,
                    {
                      transform: [{ scale: glowPulse }],
                      opacity: glowPulse.interpolate({
                        inputRange: [1, 1.3],
                        outputRange: [0.2, 0.4],
                      }),
                    },
                  ]}
                />
                
                {/* Animated rings around photo */}
                <Animated.View
                  style={[
                    styles.modalPhotoRing3,
                    {
                      transform: [
                        { scale: ring3Scale },
                        { rotate: rotation },
                      ],
                      opacity: ring3Opacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.modalPhotoRing2,
                    {
                      transform: [
                        { scale: ring2Scale },
                        { rotate: rotation },
                      ],
                      opacity: ring2Opacity,
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.modalPhotoRing1,
                    {
                      transform: [
                        { scale: ring1Scale },
                        { rotate: rotation },
                      ],
                      opacity: ring1Opacity,
                    },
                  ]}
                />
                
                {/* Glow effect with pulse */}
                <Animated.View
                  style={[
                    styles.modalPhotoGlow,
                    {
                      transform: [{ scale: glowPulse }],
                      opacity: glowPulse.interpolate({
                        inputRange: [1, 1.3],
                        outputRange: [0.3, 0.5],
                      }),
                    },
                  ]}
                />
                
                {/* Avatar with breathing effect */}
                <Animated.View
                  style={{
                    transform: [{ scale: avatarBreath }],
                  }}
                >
                  {profilePhotoUrl ? (
                    <Image
                      source={{ uri: profilePhotoUrl }}
                      style={styles.modalPhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#667eea', '#764ba2', '#f093fb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.modalPhotoPlaceholder}
                    >
                      <Text style={styles.modalPhotoPlaceholderText}>
                        {otherUser.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                  )}
                </Animated.View>
                
                {/* Floating sparkles */}
                <Animated.Text
                  style={[
                    styles.modalPhotoSparkle1,
                    {
                      transform: [
                        { translateX: sparkle1X },
                        { translateY: sparkle1Y },
                      ],
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.modalPhotoSparkle2,
                    {
                      transform: [
                        { translateX: sparkle2X },
                        { translateY: sparkle2Y },
                      ],
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
                <Animated.Text
                  style={[
                    styles.modalPhotoSparkle3,
                    {
                      transform: [
                        { translateX: sparkle3X },
                        { translateY: sparkle3Y },
                      ],
                    },
                  ]}
                >
                  ✨
                </Animated.Text>
              </Animated.View>
            </View>
            
            {/* Compatibility Section - Common Interests */}
            {commonInterests.length > 0 ? (
              <Animated.View 
                style={[
                  styles.modalCompatibilitySection,
                  { opacity: contentFade }
                ]}
              >
                <LinearGradient
                  colors={['rgba(102, 126, 234, 0.15)', 'rgba(118, 75, 162, 0.15)', 'rgba(240, 147, 251, 0.15)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalCompatibilityCard}
                >
                  <View style={styles.modalCompatibilityHeader}>
                    <Text style={styles.modalCompatibilityEmoji}>💫</Text>
                    <View style={styles.modalCompatibilityTitleContainer}>
                      <Text style={styles.modalCompatibilityTitle}>You Both Love</Text>
                      <Text style={styles.modalCompatibilitySubtitle}>
                        {commonInterests.length} {commonInterests.length === 1 ? 'interest' : 'interests'} in common
                      </Text>
                    </View>
                  </View>
                  <View style={styles.modalCompatibilityTags}>
                    {commonInterests.slice(0, 6).map((interest, idx) => (
                      <LinearGradient
                        key={idx}
                        colors={['#667eea', '#764ba2']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.modalCompatibilityTag}
                      >
                        <Text style={styles.modalCompatibilityTagText}>{interest}</Text>
                      </LinearGradient>
                    ))}
                    {commonInterests.length > 6 && (
                      <View style={styles.modalCompatibilityMore}>
                        <Text style={styles.modalCompatibilityMoreText}>
                          +{commonInterests.length - 6} more
                        </Text>
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </Animated.View>
            ) : currentUserInterests.length > 0 && matchInterests.length > 0 ? (
              // Show a subtle message if interests exist but none are common
              <Animated.View 
                style={[
                  styles.modalCompatibilitySection,
                  { opacity: contentFade }
                ]}
              >
                <View style={styles.modalCompatibilityEmptyCard}>
                  <Text style={styles.modalCompatibilityEmptyText}>
                    💫 No shared interests yet, but you both have unique interests to explore!
                  </Text>
                </View>
              </Animated.View>
            ) : null}
            
            {/* Basic Info with gradient cards */}
            <Animated.View 
              style={[
                styles.modalInfoSection,
                { opacity: contentFade }
              ]}
            >
              <Text style={styles.modalName}>{otherUser.displayName}</Text>
              <View style={styles.modalBasicInfo}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalInfoCardGradient}
                >
                  <Text style={styles.modalInfoCardEmoji}>🎂</Text>
                  <Text style={styles.modalInfoLabel}>Age</Text>
                  <Text style={styles.modalInfoValue}>{otherUser.age}</Text>
                </LinearGradient>
                <LinearGradient
                  colors={['#f093fb', '#f5576c']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalInfoCardGradient}
                >
                  <Text style={styles.modalInfoCardEmoji}>⚧️</Text>
                  <Text style={styles.modalInfoLabel}>Gender</Text>
                  <Text style={styles.modalInfoValue}>{otherUser.gender}</Text>
                </LinearGradient>
              </View>
              
              {otherUser.location && (
                <LinearGradient
                  colors={['#4facfe', '#00f2fe']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalInfoCardFullGradient}
                >
                  <Text style={styles.modalInfoCardEmoji}>📍</Text>
                  <Text style={styles.modalInfoLabel}>Location</Text>
                  <Text style={styles.modalInfoValueFull}>{otherUser.location}</Text>
                </LinearGradient>
              )}
              
              {otherUser.bio && (
                <View style={styles.modalBioCard}>
                  <LinearGradient
                    colors={['rgba(102, 126, 234, 0.1)', 'rgba(118, 75, 162, 0.1)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalBioGradient}
                  >
                    <View style={styles.modalBioHeader}>
                      <Text style={styles.modalBioIcon}>💬</Text>
                      <Text style={styles.modalBioLabel}>About</Text>
                    </View>
                    <Text style={styles.modalBio}>{otherUser.bio}</Text>
                  </LinearGradient>
                </View>
              )}
            </Animated.View>
            
            {/* Photos */}
            {allPhotos.length > 0 && (
              <Animated.View 
                style={[
                  styles.modalSection,
                  { opacity: contentFade }
                ]}
              >
                <View style={styles.modalSectionHeader}>
                  <Text style={styles.modalSectionEmoji}>📸</Text>
                  <Text style={styles.modalSectionTitle}>Photos</Text>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.modalPhotosScroll}
                  contentContainerStyle={styles.modalPhotosContainer}
                >
                  {allPhotos.map((photo, idx) => (
                    <Animated.View
                      key={photo.id}
                      style={{
                        opacity: contentFade,
                        transform: [{
                          translateX: contentFade.interpolate({
                            inputRange: [0, 1],
                            outputRange: [50, 0],
                          })
                        }],
                      }}
                    >
                      <Image
                        source={{ uri: getPhotoUrl(photo.url) }}
                        style={styles.modalPhotoThumbnail}
                        resizeMode="cover"
                      />
                    </Animated.View>
                  ))}
                </ScrollView>
              </Animated.View>
            )}
            
            {/* Interests */}
            {otherUser.interests && otherUser.interests.length > 0 && (
              <Animated.View 
                style={[
                  styles.modalSection,
                  { opacity: contentFade }
                ]}
              >
                <View style={styles.modalSectionHeader}>
                  <Text style={styles.modalSectionEmoji}>🎯</Text>
                  <Text style={styles.modalSectionTitle}>Interests</Text>
                </View>
                <View style={styles.modalTagsContainer}>
                  {otherUser.interests.map((interest, idx) => (
                    <LinearGradient
                      key={idx}
                      colors={['#fff', '#f8f9ff']}
                      style={styles.modalTagGradient}
                    >
                      <Text style={styles.modalTagText}>{interest}</Text>
                    </LinearGradient>
                  ))}
                </View>
              </Animated.View>
            )}
            
            {/* Values */}
            {otherUser.values && otherUser.values.length > 0 && (
              <Animated.View 
                style={[
                  styles.modalSection,
                  { opacity: contentFade }
                ]}
              >
                <View style={styles.modalSectionHeader}>
                  <Text style={styles.modalSectionEmoji}>💎</Text>
                  <Text style={styles.modalSectionTitle}>Values</Text>
                </View>
                <View style={styles.modalTagsContainer}>
                  {otherUser.values.map((value, idx) => (
                    <LinearGradient
                      key={idx}
                      colors={['#fff', '#f8f9ff']}
                      style={styles.modalTagGradient}
                    >
                      <Text style={styles.modalTagText}>{value}</Text>
                    </LinearGradient>
                  ))}
                </View>
              </Animated.View>
            )}
            
            {/* Partner Qualities */}
            {otherUser.partnerQualities && otherUser.partnerQualities.length > 0 && (
              <Animated.View 
                style={[
                  styles.modalSection,
                  { opacity: contentFade }
                ]}
              >
                <View style={styles.modalSectionHeader}>
                  <Text style={styles.modalSectionEmoji}>💕</Text>
                  <Text style={styles.modalSectionTitle}>Looking For</Text>
                </View>
                <View style={styles.modalTagsContainer}>
                  {otherUser.partnerQualities.map((q, idx) => (
                    <LinearGradient
                      key={idx}
                      colors={['#fff', '#f8f9ff']}
                      style={styles.modalTagGradient}
                    >
                      <Text style={styles.modalTagText}>{q.quality}</Text>
                    </LinearGradient>
                  ))}
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// Helper function to render location with proper formatting
function renderMatchLocation(location: string | null | undefined) {
  if (!location) return null;
  
  const locationParts = location.split(',').map(s => s.trim());
  const city = locationParts[0] || '';
  const state = locationParts.slice(1).join(', ') || '';
  
  if (!state) {
    return <Text style={styles.matchLocation}>📍 {location}</Text>;
  }
  
  return (
    <View style={styles.matchLocationContainer}>
      <Text style={styles.matchLocationEmoji}>📍</Text>
      <View style={styles.matchLocationTextContainer}>
        <Text style={styles.matchLocationCity}>{city}</Text>
        <Text style={styles.matchLocationComma}>, </Text>
        <Text style={styles.matchLocationState}>{state}</Text>
      </View>
    </View>
  );
}

export default function MatchesScreen() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<FlatList>(null);
  const selectedMatchRef = useRef<Match | null>(null);
  const textInputRef = useRef<TextInput>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Header animations
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(1)).current;
  
  // Message animations
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({}).current;
  
  // Chat transition animations
  const chatSlideAnim = useRef(new Animated.Value(0)).current;
  const chatFadeAnim = useRef(new Animated.Value(0)).current;

  // Update current time for timer display
  // Update every second if any match is close to expiring (< 1 hour), otherwise every minute
  useEffect(() => {
    const checkUrgentMatches = () => {
      const now = new Date();
      return matches.some(match => {
        if (!match.expiresAt) return false;
        const expirationDate = new Date(match.expiresAt);
        const diff = expirationDate.getTime() - now.getTime();
        return diff > 0 && diff < 3600000; // Less than 1 hour
      });
    };

    const hasUrgentMatch = checkUrgentMatches();
    const updateInterval = hasUrgentMatch ? 1000 : 60000; // Update every second if urgent, otherwise every minute

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, updateInterval);

    return () => clearInterval(interval);
  }, [matches]);

  // Handle keyboard show/hide events
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        // Scroll to end when keyboard appears
        setTimeout(() => {
          messagesEndRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Calculate time remaining until expiration
  const getTimeRemaining = (expiresAt: string | null): string | null => {
    if (!expiresAt) return null;
    
    const expirationDate = new Date(expiresAt);
    const now = currentTime;
    const diff = expirationDate.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const handleKeyPress = (e: any) => {
    // On mobile/web, detect Enter key press
    // For multiline, we'll allow Enter to send (Shift+Enter could be for new line in future)
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      const trimmed = newMessage.trim();
      if (trimmed && !sendingMessage) {
        // Prevent default newline behavior
        e.preventDefault();
        // Send message with current content, then it will clear
        handleSendMessage(trimmed);
        return;
      }
    }
  };

  const handleTextChange = (text: string) => {
    // If we're in the process of sending, don't update (prevents newline from being added)
    if (!sendingMessage) {
      setNewMessage(text);
    }
  };

  // Initialize WebSocket connection
  useEffect(() => {
    const initSocket = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || !user) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Matches: Connected to WebSocket server');
      });

      socket.on('disconnect', () => {
        console.log('❌ Matches: Disconnected from WebSocket server');
      });

      socket.on('new_message', (message: Message & { matchId?: string }) => {
        // Only add message if we're viewing this match's chat
        const currentMatchId = selectedMatchRef.current?.id;
        // Be more lenient - if no matchId in message, assume it's for current match
        // Also check if message sender is current user (for messages we just sent)
        const isForCurrentMatch = currentMatchId && (
          message.matchId === currentMatchId || 
          !message.matchId ||
          message.senderId === user?.id
        );
        
        if (isForCurrentMatch) {
          setMessages((prev) => {
            // Check if message already exists (avoid duplicates)
            if (prev.some((m) => m.id === message.id || (m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId))) {
              // If we have a temp message with same content, replace it
              const hasTemp = prev.some(m => m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId);
              if (hasTemp) {
                const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId));
                return [...filtered, { ...message, isOwn: message.senderId === user?.id }];
              }
              return prev;
            }
            return [...prev, { ...message, isOwn: message.senderId === user?.id }];
          });
        } else {
          // Message is for a different match - refresh matches list to show unread indicator
          // Play message sound to notify user (only if message is from another user)
          if (message.senderId !== user?.id) {
            playMessageSound().catch(() => {
              // Non-critical - app works without sound
              console.log('Message sound not available');
            });
          }
          console.log('💬 New message received for different match, refreshing matches list');
          fetchMatches();
        }
        
        // Play message sound if message is from another user and we're viewing this match
        if (isForCurrentMatch && message.senderId !== user?.id) {
          playMessageSound().catch(() => {
            // Non-critical - app works without sound
            console.log('Message sound not available');
          });
        }
      });

      socket.on('new_match', (data: {
        matchId: string;
        otherUserId: string;
        otherUserName: string;
        message: string;
        stage: string;
      }) => {
        // Play match notification sound
        playMatchSound().catch(() => {
          // Non-critical - app works without sound
          console.log('Match sound not available');
        });
        
        Alert.alert('🎉 New Match!', data.message);
        fetchMatches();
      });
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user]);

  useEffect(() => {
    // Wait for auth to finish loading before checking authentication
    if (authLoading) {
      console.log('⏳ MatchesScreen: Waiting for auth to load...');
      return;
    }

    // Wait a bit for auth to initialize, then fetch matches
    const timer = setTimeout(() => {
      const checkAuthAndFetch = async () => {
        const token = await AsyncStorage.getItem('token');
        if (token && user && isAuthenticated) {
          console.log('✅ MatchesScreen: User authenticated, fetching matches...');
          await fetchMatches();
        } else {
          console.log('⚠️ MatchesScreen: Not authenticated or no token');
          console.log('   Token exists:', !!token);
          console.log('   User exists:', !!user);
          console.log('   isAuthenticated:', isAuthenticated);
          setLoading(false);
        }
      };
      checkAuthAndFetch();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [user, isAuthenticated, authLoading]);

  useEffect(() => {
    selectedMatchRef.current = selectedMatch;
    
    // Animate chat transition
    if (selectedMatch) {
      chatSlideAnim.setValue(300);
      chatFadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(chatSlideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(chatFadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      chatSlideAnim.setValue(0);
      chatFadeAnim.setValue(1);
    }
    
    if (!socketRef.current || !selectedMatch) return;

    if (selectedMatch.stage !== 'pending') {
      socketRef.current.emit('join_match', selectedMatch.id);
      fetchMessages(selectedMatch.id);
      socketRef.current.emit('mark_read', { matchId: selectedMatch.id });
      // Refresh matches list to update unread counts after marking as read
      setTimeout(() => {
        fetchMatches();
      }, 500);
    }

    return () => {
      if (socketRef.current && selectedMatch) {
        socketRef.current.emit('leave_match', selectedMatch.id);
      }
    };
  }, [selectedMatch?.id]);

  // Handle route params when screen is focused (for deep linking to specific match)
  useFocusEffect(
    useCallback(() => {
      const routeParams = route.params as { matchId?: string } | undefined;
      console.log('🔍 useFocusEffect - route params:', routeParams);
      console.log('🔍 useFocusEffect - matches count:', matches.length);
      console.log('🔍 useFocusEffect - selectedMatch:', selectedMatch?.id);
      
      // If we have a matchId in route params, always refetch matches first
      // (especially important for newly created matches that might not be in the list yet)
      if (routeParams?.matchId && user && isAuthenticated && !authLoading && !loading) {
        const matchToSelect = matches.find(m => m.id === routeParams.matchId);
        if (!matchToSelect) {
          console.log('🔄 Match not found in current list, refetching matches...');
          fetchMatches().then(() => {
            // After refetch, the fetchMatches function will auto-select the match
            console.log('✅ Matches refetched, auto-selection should happen in fetchMatches');
          });
        } else if (!selectedMatch) {
          console.log('🎯 Match found in list, auto-selecting:', routeParams.matchId);
          setSelectedMatch(matchToSelect);
        }
      } else if (routeParams?.matchId && matches.length === 0 && !loading) {
        console.log('⏳ Matches not loaded yet, will auto-select after fetch');
      }
    }, [matches, route.params, selectedMatch, user, isAuthenticated, authLoading, loading, fetchMatches])
  );

  const fetchMatches = useCallback(async () => {
    try {
      setLoading(true);
      
      // Double-check token before making request
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.error('❌ No token found in AsyncStorage');
        setMatches([]);
        setLoading(false);
        return;
      }
      
      console.log('✅ Token found, fetching matches...');
      const data = await api.get<{ matches: Match[] }>('/matches');
      console.log('✅ Matches fetched successfully:', data.matches?.length || 0, 'matches');
      const fetchedMatches = data.matches || [];
      setMatches(fetchedMatches);
      
      // Auto-select match if matchId is provided in route params
      const routeParams = route.params as { matchId?: string } | undefined;
      console.log('🔍 fetchMatches - route params:', routeParams);
      if (routeParams?.matchId && fetchedMatches.length > 0) {
        const matchToSelect = fetchedMatches.find(m => m.id === routeParams.matchId);
        if (matchToSelect) {
          console.log('🎯 Auto-selecting match from route params (in fetchMatches):', routeParams.matchId);
          // Use setTimeout to ensure state updates properly
          setTimeout(() => {
            setSelectedMatch(matchToSelect);
          }, 100);
        } else {
          console.log('⚠️ Match not found in fetched matches:', routeParams.matchId);
          console.log('   Available match IDs:', fetchedMatches.map(m => m.id));
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to fetch matches:', error);
      
      // If authentication error, clear token and show message
      if (error?.status === 401 || error?.message?.includes('Authentication')) {
        console.error('❌ Authentication error - token may be invalid or expired');
        await AsyncStorage.removeItem('token');
        setMatches([]);
      } else {
        setMatches([]);
      }
    } finally {
      setLoading(false);
    }
  }, [route.params]);

  // Auto-select match when matches are loaded and route params exist
  // Only auto-select if matchId is in route params AND selectedMatch is null
  // (don't auto-select if user manually cleared the selection)
  useEffect(() => {
    const routeParams = route.params as { matchId?: string } | undefined;
    // Only auto-select if we have a matchId in route params, matches are loaded,
    // no match is currently selected, and we're not loading
    if (routeParams?.matchId && matches.length > 0 && !selectedMatch && !loading) {
      const matchToSelect = matches.find(m => m.id === routeParams.matchId);
      if (matchToSelect) {
        console.log('🎯 Auto-selecting match from route params (after matches loaded):', routeParams.matchId);
        setSelectedMatch(matchToSelect);
      } else {
        console.log('⚠️ Match not found in matches list:', routeParams.matchId);
        console.log('   Available match IDs:', matches.map(m => m.id));
      }
    }
  }, [matches, route.params, selectedMatch, loading]);

  // Debug logging - must be before any early returns
  useEffect(() => {
    console.log('🔄 MatchesScreen render - selectedMatch:', selectedMatch?.id || 'null');
  }, [selectedMatch]);

  const fetchMessages = async (matchId: string) => {
    try {
      const data = await api.get<{ messages: Message[] }>(`/matches/${matchId}/messages`);
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setMessages([]);
    }
  };

  const handleBack = useCallback(() => {
    console.log('🔙 handleBack called - clearing selected match');
    console.log('   Current selectedMatch:', selectedMatch?.id);
    // Refresh matches to update unread counts after viewing messages
    fetchMatches();
    // Clear messages first
    setMessages([]);
    // Clear selectedMatch - use direct setter instead of functional update
    console.log('   Setting selectedMatch to null...');
    setSelectedMatch(null);
    console.log('   selectedMatch state updated to null');
  }, [selectedMatch, fetchMatches]);

  const handleSendMessage = async (messageToSend?: string) => {
    const messageContent = (messageToSend || newMessage).trim();
    if (!messageContent || !selectedMatch || sendingMessage || !user) return;

    // Clear input immediately - use both state and ref
    setNewMessage('');
    if (textInputRef.current) {
      textInputRef.current.setNativeProps({ text: '' });
    }
    
    // Dismiss keyboard after sending message and reset keyboard height
    Keyboard.dismiss();
    // Small delay to ensure keyboard dismisses before resetting height
    setTimeout(() => {
      setKeyboardHeight(0);
    }, 100);
    
    setSendingMessage(true);

    // Optimistically add message to UI immediately
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: messageContent,
      senderId: user.id,
      senderName: user.displayName || 'You',
      sentAt: new Date().toISOString(),
      isOwn: true,
    };
    // Create animation for temp message
    const tempAnim = new Animated.Value(0);
    messageAnimations[tempMessage.id] = tempAnim;
    Animated.spring(tempAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await api.post<{ message: Message }>(`/matches/${selectedMatch.id}/messages`, {
        content: messageContent,
      });
      
      // Replace temp message with real message from server
      if (response.message) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMessage.id);
          return [...filtered, { ...response.message, isOwn: response.message.senderId === user.id }];
        });
      } else {
        // If no message in response, keep temp message (socket will replace it, or it stays as fallback)
        // Don't remove it - let socket handler or next fetch replace it
        console.log('No message in response, keeping temp message until socket confirms');
      }
    } catch (error: any) {
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      Alert.alert('Error', error?.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleUnmatch = async (matchId: string) => {
    Alert.alert(
      'Unmatch',
      'Are you sure you want to unmatch? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/matches/${matchId}/unmatch`);
              setMatches((prev) => prev.filter((m) => m.id !== matchId));
              if (selectedMatch?.id === matchId) {
                setSelectedMatch(null);
                setMessages([]);
              }
              
              // Show reflection prompt
              setTimeout(() => {
                Alert.alert(
                  '💭 Quick Reflection',
                  'Match ended successfully',
                  [
                    { text: 'OK', style: 'default' },
                  ]
                );
              }, 500);
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to unmatch');
            }
          },
        },
      ]
    );
  };

  const getMatchPhoto = (match: Match) => {
    if (match.stage === 'stage2' && match.otherUser.photos?.length) {
      const primaryPhoto = match.otherUser.photos.find((p) => p.isPrimary) || match.otherUser.photos[0];
      return getPhotoUrl(primaryPhoto.url);
    }
    return match.otherUser.photoUrl ? getPhotoUrl(match.otherUser.photoUrl) : null;
  };

  // Show loading while auth is initializing or matches are loading
  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>
          {authLoading ? 'Checking authentication...' : 'Loading matches...'}
        </Text>
      </View>
    );
  }
  
  // If not authenticated, show message
  if (!isAuthenticated || !user) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <AnimatedHeartEmoji />
              <Text style={styles.headerTitle}> Your Matches</Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptyText}>
            You need to be logged in to view your matches.
          </Text>
        </View>
      </View>
    );
  }

  const getStageBadgeStyle = (stage: string) => {
    switch (stage) {
      case 'stage2':
        return styles.stageBadgeStage2;
      case 'stage1':
        return styles.stageBadgeStage1;
      default:
        return styles.stageBadgePending;
    }
  };

  const getStageEmoji = (stage: string) => {
    switch (stage) {
      case 'stage2':
        return '💕';
      case 'stage1':
        return '💖';
      default:
        return '💌';
    }
  };

  if (!selectedMatch) {
    console.log('📋 Rendering matches list view');
    return (
      <View style={styles.container}>
        <AnimatedHeaderGradient matchesCount={matches.length} gradientPos={headerGradientPos}>
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <AnimatedHeartEmoji />
              <Text style={styles.headerTitle}> Your Matches</Text>
            </View>
            <Text style={styles.headerSubtitle}>{matches.length} {matches.length === 1 ? 'match' : 'matches'}</Text>
          </View>
        </AnimatedHeaderGradient>
        {matches.length === 0 ? (
          <EmptyStateAnimated navigation={navigation} />
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.matchesList, { paddingBottom: 100 }]}
            ListFooterComponent={<LegalFooter />}
            renderItem={({ item, index }) => {
              const photoUrl = getMatchPhoto(item);
              
              return (
                <MatchCardAnimated 
                  item={item} 
                  index={index} 
                  photoUrl={photoUrl} 
                  getTimeRemaining={getTimeRemaining}
                  getStageBadgeStyle={getStageBadgeStyle}
                  getStageEmoji={getStageEmoji}
                  onPress={() => {
                    // Haptic feedback - vibrate when user clicks a match
                    if (Platform.OS === 'ios') {
                      Vibration.vibrate(50); // Increased from 10ms to 50ms for better feel on iOS
                    } else {
                      Vibration.vibrate(50); // Same for Android
                    }
                    setSelectedMatch(item);
                  }} 
                  onUnmatch={(id) => handleUnmatch(id)} 
                />
              );
            }}
          />
        )}
      </View>
    );
  }

  console.log('💬 Rendering chat view for match:', selectedMatch?.id);
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.chatHeaderGradient}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity 
            onPress={() => {
              console.log('🔙 Back button TOUCHED');
              console.log('   Current selectedMatch before clear:', selectedMatch?.id);
              // Clear route params to prevent auto-selection from re-triggering
              navigation.setParams({ matchId: undefined });
              // Clear messages and selectedMatch directly
              setMessages([]);
              setSelectedMatch(null);
              console.log('   State cleared - selectedMatch set to null, route params cleared');
            }}
            style={styles.backButtonContainer}
            activeOpacity={0.7}
          >
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <View style={styles.chatHeaderNameRow}>
              {(() => {
                const chatPhotoUrl = getMatchPhoto(selectedMatch);
                return chatPhotoUrl ? (
                  <Image
                    source={{ uri: chatPhotoUrl }}
                    style={styles.chatHeaderPhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chatHeaderPhotoPlaceholder}
                  >
                    <Text style={styles.chatHeaderPhotoPlaceholderText}>
                      {selectedMatch.otherUser.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                );
              })()}
              <Text style={styles.chatHeaderTitle}>{selectedMatch.otherUser.displayName}</Text>
            </View>
            <View style={styles.chatHeaderSubtitleRow}>
              <Text style={styles.chatHeaderSubtitle}>
                {selectedMatch.otherUser.age} • {selectedMatch.stage === 'pending' ? 'Pending' : selectedMatch.stage === 'stage1' ? 'Stage 1' : 'Stage 2'}
              </Text>
              {selectedMatch.stage !== 'pending' && (
                <CompatibilityPulse matchId={selectedMatch.id} socket={socketRef.current} />
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowProfileModal(true)}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            <Text style={styles.profileButtonText}>👤</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
      
      {/* Profile Modal */}
      {showProfileModal && selectedMatch && (
        <MatchProfileModal
          match={selectedMatch}
          visible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {/* New Features: Mulligan Moments and Date Blueprint */}
      {selectedMatch && selectedMatch.stage !== 'pending' && (
        <ScrollView 
          style={styles.featuresContainer}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          <MulliganMoments 
            matchId={selectedMatch.id} 
            socket={socketRef.current}
            onStarterGenerated={(starter) => {
              // Auto-fill the message input with the generated starter
              setNewMessage(starter);
              if (textInputRef.current) {
                textInputRef.current.focus();
              }
            }}
          />
          <DateBlueprint 
            matchId={selectedMatch.id} 
            socket={socketRef.current}
            currentUserId={user?.id || ''}
          />
        </ScrollView>
      )}

      <Animated.View 
        style={[
          { flex: 1 },
          {
            opacity: chatFadeAnim,
            transform: [{ translateX: chatSlideAnim }],
          },
        ]}
      >
        <FlatList
          ref={messagesEndRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={[
            styles.messagesContent,
            { 
              paddingBottom: keyboardHeight > 0 
                ? keyboardHeight + 100 
                : 95 + (Platform.OS === 'ios' ? 70 : 68)
            }
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
          scrollEnabled={true}
          onContentSizeChange={() => {
            messagesEndRef.current?.scrollToEnd({ animated: true });
          }}
          onLayout={() => {
            messagesEndRef.current?.scrollToEnd({ animated: false });
          }}
          renderItem={({ item, index }) => {
            // Get or create animation for this message
            if (!messageAnimations[item.id]) {
              messageAnimations[item.id] = new Animated.Value(0);
              // Animate message entrance
              Animated.parallel([
                Animated.spring(messageAnimations[item.id], {
                  toValue: 1,
                  tension: 50,
                  friction: 7,
                  delay: index * 30,
                  useNativeDriver: true,
                }),
              ]).start();
            }
            
            const messageAnim = messageAnimations[item.id];
            
            return item.isOwn ? (
              <Animated.View 
                style={[
                  styles.messageContainerOwn,
                  {
                    opacity: messageAnim,
                    transform: [
                      { 
                        translateX: messageAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [50, 0],
                        })
                      },
                      {
                        scale: messageAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        })
                      }
                    ],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#f093fb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.messageBubbleOwn}
                >
                  <Text style={styles.messageTextOwn}>
                    {item.content}
                  </Text>
                  <Text style={styles.messageTimeOwn}>
                    {new Date(item.sentAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </LinearGradient>
              </Animated.View>
            ) : (
              <Animated.View 
                style={[
                  styles.messageContainerOther,
                  {
                    opacity: messageAnim,
                    transform: [
                      { 
                        translateX: messageAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-50, 0],
                        })
                      },
                      {
                        scale: messageAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        })
                      }
                    ],
                  },
                ]}
              >
                <View style={styles.messageBubbleOther}>
                  <Text style={styles.messageTextOther}>
                    {item.content}
                  </Text>
                  <Text style={styles.messageTimeOther}>
                    {new Date(item.sentAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </Animated.View>
            );
          }}
        />
      </Animated.View>

        <Animated.View 
          style={[
            styles.inputContainer,
            {
              position: 'absolute',
              bottom: keyboardHeight > 0 
                ? keyboardHeight 
                : Platform.OS === 'ios' ? 70 : 68,
              left: 0,
              right: 0,
              zIndex: 1000,
              elevation: 10,
              opacity: chatFadeAnim,
              transform: [{ translateX: chatSlideAnim }],
            }
          ]}
        >
          <TextInput
            ref={textInputRef}
            style={styles.input}
            value={newMessage}
            onChangeText={handleTextChange}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            onKeyPress={handleKeyPress}
            returnKeyType="send"
            blurOnSubmit={false}
            onFocus={() => {
              // Scroll to end when input is focused to ensure latest messages are visible
              setTimeout(() => {
                messagesEndRef.current?.scrollToEnd({ animated: true });
              }, 300);
            }}
          />
          <TouchableOpacity
            onPress={() => {
              console.log('📤 Send button pressed!');
              handleSendMessage();
            }}
            disabled={sendingMessage || !newMessage.trim()}
            style={styles.sendButtonContainer}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPressIn={() => console.log('📤 Send button press in')}
            onPressOut={() => console.log('📤 Send button press out')}
          >
            <LinearGradient
              colors={sendingMessage || !newMessage.trim() ? ['#a0aec0', '#718096'] : ['#667eea', '#764ba2', '#f093fb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendButton}
              pointerEvents="none"
            >
              {sendingMessage ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  chatHeaderGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  headerGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomWidth: 0,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  header: {
    padding: 24,
    paddingBottom: 24,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  animatedHeartEmoji: {
    fontSize: 36,
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    position: 'relative',
  },
  emptyBackgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.05,
  },
  emptyEmojiContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 12,
    borderWidth: 4,
    borderColor: '#fff',
  },
  emptyEmoji: {
    fontSize: 80,
  },
  emptyTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  emptyText: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 26,
    fontWeight: '400',
    paddingHorizontal: 20,
  },
  browseButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#8B1538',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  browseButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  matchesList: {
    padding: 16,
    paddingTop: 20,
  },
  matchCardWrapper: {
    marginBottom: 12,
    marginHorizontal: 4,
  },
  matchCard: {
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(102, 126, 234, 0.1)',
  },
  matchCardContent: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    position: 'relative',
  },
  photoWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  photoContainer: {
    position: 'relative',
    borderRadius: 35,
    overflow: 'hidden',
  },
  matchPhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  photoGradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    borderRadius: 35,
  },
  photoGlow: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#667eea',
    top: -3,
    left: -3,
    opacity: 0.3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '200%',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ rotate: '15deg' }],
  },
  stage2Indicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ff6b9d',
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  stage2IndicatorText: {
    fontSize: 14,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 10,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  matchPhotoPlaceholderText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  matchInfo: {
    flex: 1,
    paddingRight: 8,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  matchName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  matchNameUnread: {
    fontWeight: '900',
  },
  matchAge: {
    fontSize: 17,
    color: '#666',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  matchLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchLocationEmoji: {
    fontSize: 14,
    marginRight: 5,
  },
  matchLocationTextContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  matchLocationCity: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
  },
  matchLocationComma: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
  },
  matchLocationState: {
    fontSize: 14,
    color: '#888',
    fontWeight: '400',
  },
  matchLocation: {
    fontSize: 14,
    color: '#888',
    marginBottom: 10,
    fontWeight: '400',
  },
  stageContainer: {
    alignSelf: 'flex-start',
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  stageBadgePending: {
    borderColor: '#ffb3d1',
  },
  stageBadgeStage1: {
    borderColor: '#ff6b9d',
  },
  stageBadgeStage2: {
    borderColor: '#ff1493',
  },
  stageEmoji: {
    fontSize: 14,
    marginRight: 6,
  },
  stageText: {
    fontSize: 12,
    color: '#ff6b9d',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#fff8f0',
    borderWidth: 2,
    borderColor: '#ffb84d',
    shadowColor: '#ffb84d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  timerEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  timerText: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  unmatchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  unmatchButtonText: {
    fontSize: 16,
    color: '#dc2626',
    fontWeight: '800',
    lineHeight: 16,
  },
  chatHeaderGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 18,
  },
  backButtonContainer: {
    marginRight: 12,
  },
  backButton: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatHeaderPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  chatHeaderPhotoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  chatHeaderPhotoPlaceholderText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flex: 1,
  },
  chatHeaderSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  chatHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  featuresContainer: {
    maxHeight: 90,
    backgroundColor: '#f5f7fa',
    paddingVertical: 2,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 16,
    flexGrow: 1,
  },
  messageContainerOwn: {
    alignSelf: 'flex-end',
    marginBottom: 2,
    maxWidth: '65%',
  },
  messageContainerOther: {
    alignSelf: 'flex-start',
    marginBottom: 2,
    maxWidth: '65%',
  },
  messageBubbleOwn: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    borderBottomRightRadius: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  messageBubbleOther: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    borderBottomLeftRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  messageTextOwn: {
    fontSize: 15,
    lineHeight: 20,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  messageTextOther: {
    fontSize: 15,
    lineHeight: 20,
    color: '#2d3748',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  messageTimeOwn: {
    fontSize: 9,
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.75)',
    alignSelf: 'flex-end',
    fontWeight: '500',
  },
  messageTimeOther: {
    fontSize: 9,
    marginTop: 2,
    color: '#718096',
    alignSelf: 'flex-start',
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    borderTopWidth: 1.5,
    borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
    alignItems: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    maxHeight: 80,
    fontSize: 14,
    backgroundColor: '#f9fafb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  sendButtonContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 1001,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  sendButton: {
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  profileButtonText: {
    fontSize: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    flex: 1,
    marginTop: Platform.OS === 'ios' ? 50 : 20,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingTop: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  modalCloseButton: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalCloseButtonGradient: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 20,
    color: '#667eea',
    fontWeight: '900',
  },
  modalPhotoContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  modalCompatibilitySection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  modalCompatibilityCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(102, 126, 234, 0.3)',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  modalCompatibilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalCompatibilityEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  modalCompatibilityTitleContainer: {
    flex: 1,
  },
  modalCompatibilityTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  modalCompatibilitySubtitle: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalCompatibilityTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalCompatibilityTag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  modalCompatibilityTagText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalCompatibilityMore: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.3)',
    marginRight: 8,
    marginBottom: 8,
  },
  modalCompatibilityMoreText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  modalCompatibilityEmptyCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(102, 126, 234, 0.08)',
    borderWidth: 2,
    borderColor: 'rgba(102, 126, 234, 0.2)',
    alignItems: 'center',
  },
  modalCompatibilityEmptyText: {
    fontSize: 15,
    color: '#667eea',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalPhotoWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  modalPhotoOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#667eea',
    top: -40,
    left: -40,
    zIndex: 0,
  },
  modalPhotoRing1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: '#667eea',
    top: -10,
    left: -10,
    zIndex: 1,
  },
  modalPhotoRing2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: '#764ba2',
    borderStyle: 'dashed',
    top: -15,
    left: -15,
    zIndex: 1,
  },
  modalPhotoRing3: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 2.5,
    borderColor: '#f093fb',
    borderStyle: 'dotted',
    top: -20,
    left: -20,
    zIndex: 1,
  },
  modalPhoto: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 8,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 3,
  },
  modalPhotoPlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 8,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 3,
  },
  modalPhotoPlaceholderText: {
    fontSize: 60,
    color: '#fff',
    fontWeight: 'bold',
  },
  modalPhotoGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#667eea',
    top: -10,
    left: -10,
    zIndex: 1,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  modalPhotoSparkle1: {
    position: 'absolute',
    top: -5,
    right: 20,
    zIndex: 10,
    fontSize: 28,
    textShadowColor: '#667eea',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    fontWeight: 'bold',
  },
  modalPhotoSparkle2: {
    position: 'absolute',
    bottom: 10,
    left: -5,
    zIndex: 10,
    fontSize: 26,
    textShadowColor: '#f093fb',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    fontWeight: 'bold',
  },
  modalPhotoSparkle3: {
    position: 'absolute',
    top: 30,
    left: -10,
    zIndex: 10,
    fontSize: 24,
    textShadowColor: '#4facfe',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    fontWeight: 'bold',
  },
  modalInfoSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  modalName: {
    fontSize: 40,
    fontWeight: '900',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  modalBasicInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  modalInfoCardGradient: {
    flex: 1,
    paddingVertical: 22,
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
  modalInfoCardEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  modalInfoCardFullGradient: {
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
  modalInfoLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  modalInfoValue: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modalInfoValueFull: {
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
  modalBioCard: {
    marginTop: 24,
    width: '100%',
  },
  modalBioGradient: {
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
  modalBioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalBioIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  modalBioLabel: {
    fontSize: 16,
    color: '#667eea',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  modalBio: {
    fontSize: 18,
    color: '#1a1a1a',
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modalSection: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalSectionEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  modalSectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(102, 126, 234, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  modalPhotosScroll: {
    marginHorizontal: -24,
  },
  modalPhotosContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  modalPhotoThumbnail: {
    width: 140,
    height: 140,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    marginRight: 12,
  },
  modalTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalTagGradient: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#667eea',
    marginRight: 8,
    marginBottom: 8,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  modalTagText: {
    fontSize: 15,
    color: '#667eea',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
