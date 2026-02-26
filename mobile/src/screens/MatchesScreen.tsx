import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from '../utils/debounce';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Animated,
  Dimensions,
  useWindowDimensions,
  Modal,
  Vibration,
  KeyboardAvoidingView,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getToken } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getPhotoUrl } from '../utils/photoUrl';
import { getPendingOpenMatchId, clearPendingOpenMatchId } from '../utils/pendingMatchOpen';
import { getPendingGameRequest, clearPendingGameRequest, type PendingGameRequest } from '../utils/pendingGameRequest';
import { currentMatchIdRef } from '../utils/currentMatchView';
import { playMatchSound, playMessageSound } from '../utils/sounds';
import { navigationRef } from '../navigation/navigationRef';
import LegalFooter from '../components/LegalFooter';
import CompatibilityPulse from '../components/CompatibilityPulse';
import MulliganMoments from '../components/MulliganMoments';
import DateBlueprint from '../components/DateBlueprint';
import TruthOrDare from '../components/TruthOrDare';
import NeverHaveIEver from '../components/NeverHaveIEver';
import OptimizedImage from '../components/OptimizedImage';
import GameRequestModal from '../components/GameRequestModal';
import MatchCelebration from '../components/MatchCelebration';
import * as ImagePicker from 'expo-image-picker';
import { Video, Audio } from 'expo-av';

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface GameUnlocks {
  truth_or_dare: boolean;
  never_have_i_ever: boolean;
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
  gameUnlocks?: GameUnlocks;
  compatibilityScore?: number | null;
  profileCompatibility?: number | null;
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
    lastActiveAt?: string | null;
  };
}

interface Message {
  id: string;
  content: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
  likedBy?: string | null;
}

// Voice message play button + playback (uri must be a full URL for remote audio)
function VoiceMessagePlayer({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadAndPlay = useCallback(async (audioUri: string, isRetry: boolean) => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const loadOptions: { uri: string; overrideFileExtensionIOS?: string } = { uri: audioUri };
    const hasAudioExt = /\.(m4a|mp3|mp4|aac|ogg|wav)(\?|#|$)/i.test(audioUri);
    if (Platform.OS === 'ios' && !hasAudioExt) {
      loadOptions.overrideFileExtensionIOS = 'm4a';
    }
    const { sound } = await Audio.Sound.createAsync(
      loadOptions as any,
      { shouldPlay: false, volume: 1.0, isLooping: false }
    );
    soundRef.current = sound;
    setPlaying(true);
    sound.setOnPlaybackStatusUpdate((s) => {
      if (s.isLoaded && ((s as any).didJustFinishAndNotReset ?? s.didJustFinish)) setPlaying(false);
    });
    await sound.playAsync();
  }, []);
  const play = useCallback(async () => {
    const rawUri = (uri || '').trim();
    if (!rawUri) return;
    // Prefer full URL; keep query string for CDNs (e.g. Cloudinary) that use it
    const audioUri = rawUri.startsWith('http') ? rawUri : getPhotoUrl(rawUri) || rawUri;
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
        setPlaying(true);
        soundRef.current.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && ((s as any).didJustFinishAndNotReset ?? s.didJustFinish)) setPlaying(false);
        });
        return;
      }
      await loadAndPlay(audioUri, false);
    } catch (e: any) {
      if (!soundRef.current) {
        try {
          await loadAndPlay(audioUri.split('?')[0].split('#')[0], true);
          return;
        } catch (_) {}
      }
      setPlaying(false);
      console.warn('Voice message playback failed:', e?.message ?? e);
      Alert.alert('Playback failed', 'Could not play voice message. Please try again.');
    }
  }, [uri, loadAndPlay]);
  useEffect(() => () => {
    soundRef.current?.unloadAsync?.().catch(() => {});
    soundRef.current = null;
  }, []);
  return (
    <TouchableOpacity onPress={play} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 20, gap: 8 }}>
      <Text style={{ fontSize: 18 }}>{playing ? '⏸' : '▶️'}</Text>
      <Text style={{ fontSize: 14, color: '#333' }}>Voice message</Text>
    </TouchableOpacity>
  );
}

// Memoized message bubble - prevents re-renders when parent state changes (typing, keyboard, etc.)
const ANIMATE_LAST_N = 8; // Only animate the last N messages for performance

const MessageBubble = React.memo(function MessageBubble({
  item,
  animValue,
  styles: s,
  onImagePress,
  matchId,
  currentUserId,
  onLikePress,
}: {
  item: Message;
  animValue: Animated.Value | null;
  styles: { [key: string]: any };
  onImagePress?: (url: string) => void;
  matchId?: string | null;
  currentUserId?: string | null;
  onLikePress?: (messageId: string, currentlyLiked: boolean) => void;
}) {
  const formattedTime = useMemo(
    () => new Date(item.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [item.sentAt]
  );

  const isLikedByThem = item.isOwn && !!item.likedBy;
  const isLikedByMe = !item.isOwn && item.likedBy === currentUserId;
  const canLike = !item.isOwn && matchId && currentUserId && onLikePress;

  const renderBubbleContent = (isOwn: boolean) => (
    <>
      {item.imageUrl ? (
        onImagePress ? (
          <TouchableOpacity
            onPress={() => onImagePress(item.imageUrl!)}
            activeOpacity={0.9}
            style={{ margin: 0, padding: 0 }}
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={s.messageImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <Image
            source={{ uri: item.imageUrl }}
            style={s.messageImage}
            resizeMode="cover"
          />
        )
      ) : null}
      {item.videoUrl ? (
        <Video
          source={{ uri: item.videoUrl }}
          style={{ width: 220, height: 220, borderRadius: 12 }}
          useNativeControls
          resizeMode="contain"
          isLooping={false}
        />
      ) : null}
      {item.audioUrl ? (
        <VoiceMessagePlayer uri={getPhotoUrl(item.audioUrl) || item.audioUrl} />
      ) : null}
      {item.content ? (
        <Text style={isOwn ? s.messageTextOwn : s.messageTextOther}>{item.content}</Text>
      ) : null}
      {item.isOwn ? (
        <View style={s.messageFooterOwn}>
          <Text style={s.messageTimeOwn}>{formattedTime}</Text>
          {item.readAt ? <Text style={s.messageStatusRead}>✓✓</Text> : <Text style={s.messageStatusSent}>✓</Text>}
          {isLikedByThem ? <Text style={s.messageHeartOwn}> ❤️</Text> : null}
        </View>
      ) : (
        <View style={s.messageFooterOther}>
          <Text style={s.messageTimeOther}>{formattedTime}</Text>
          {canLike ? (
            <TouchableOpacity
              onPress={() => onLikePress!(item.id, !!item.likedBy)}
              hitSlop={12}
              style={s.messageHeartTouch}
            >
              <Text style={s.messageHeartOther}>{isLikedByMe ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          ) : isLikedByMe ? (
            <Text style={s.messageHeartOther}>❤️</Text>
          ) : null}
        </View>
      )}
    </>
  );

  if (animValue) {
    return item.isOwn ? (
      <Animated.View
        style={[
          s.messageContainerOwn,
          {
            opacity: animValue,
            transform: [
              { translateX: animValue.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) },
              { scale: animValue.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          },
        ]}
      >
        <LinearGradient colors={['#667eea', '#764ba2', '#f093fb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.messageBubbleOwn}>
          {renderBubbleContent(true)}
        </LinearGradient>
      </Animated.View>
    ) : (
      <Animated.View
        style={[
          s.messageContainerOther,
          {
            opacity: animValue,
            transform: [
              { translateX: animValue.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) },
              { scale: animValue.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            ],
          },
        ]}
      >
        <View style={s.messageBubbleOther}>
          {renderBubbleContent(false)}
        </View>
      </Animated.View>
    );
  }

  // Static render for older messages (no animation)
  return item.isOwn ? (
    <View style={s.messageContainerOwn}>
      <LinearGradient colors={['#667eea', '#764ba2', '#f093fb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.messageBubbleOwn}>
        {renderBubbleContent(true)}
      </LinearGradient>
    </View>
  ) : (
    <View style={s.messageContainerOther}>
      <View style={s.messageBubbleOther}>
        {renderBubbleContent(false)}
      </View>
    </View>
  );
});

// Typing Indicator Component with Animated Dots
function TypingIndicator() {
  const dot1Anim = useRef(new Animated.Value(0.3)).current;
  const dot2Anim = useRef(new Animated.Value(0.3)).current;
  const dot3Anim = useRef(new Animated.Value(0.3)).current;
  
  useEffect(() => {
    const animateDot = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };
    
    const anim1 = animateDot(dot1Anim, 0);
    const anim2 = animateDot(dot2Anim, 200);
    const anim3 = animateDot(dot3Anim, 400);
    
    anim1.start();
    anim2.start();
    anim3.start();
    
    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, []);
  
  return (
    <View style={styles.typingIndicatorContainer}>
      <View style={styles.typingBubble}>
        <View style={styles.typingDots}>
          <Animated.View style={[styles.typingDot, { opacity: dot1Anim }]} />
          <Animated.View style={[styles.typingDot, { opacity: dot2Anim }]} />
          <Animated.View style={[styles.typingDot, { opacity: dot3Anim }]} />
        </View>
      </View>
    </View>
  );
}

// Animated Heart Emoji Component
function AnimatedHeartEmoji() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
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

    // Glow pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.5,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Shimmer effect
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '10deg'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [0.6, 1],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [1, 1.15],
  });

  return (
    <Animated.View
      style={[
        styles.animatedHeartContainer,
        {
          transform: [
            { scale: pulseAnim },
            { rotate: rotate },
          ],
        },
      ]}
    >
      {/* Glow effect behind heart */}
      <Animated.View
        style={[
          styles.animatedHeartGlow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
        pointerEvents="none"
      />
      
      {/* Gradient background */}
      <LinearGradient
        colors={['#ff6b9d', '#ff1493', '#ff69b4', '#ff1493']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.animatedHeartGradient}
      >
        {/* Shimmer overlay */}
        <Animated.View
          style={[
            styles.animatedHeartShimmer,
            {
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.3, 0],
              }),
              transform: [
                {
                  translateX: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, 50],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        />
        <Text style={styles.animatedHeartEmoji}>💕</Text>
      </LinearGradient>
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
// Memoized to prevent unnecessary re-renders when parent updates
const MatchCardAnimated = React.memo(function MatchCardAnimated({ 
  item, 
  index, 
  photoUrl, 
  getTimeRemaining,
  formatLastActive,
  getStageBadgeStyle,
  getStageEmoji,
  onPress, 
  onUnmatch,
  onStagePress,
}: {
  item: Match;
  index: number;
  photoUrl: string | null;
  getTimeRemaining: (expiresAt: string | null) => string | null;
  formatLastActive: (lastActiveAt: string | null | undefined) => string | null;
  getStageBadgeStyle: (stage: string) => any;
  getStageEmoji: (stage: string) => string;
  onPress: () => void;
  onUnmatch: (id: string) => void;
  onStagePress?: (stage: 'stage1' | 'stage2') => void;
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
                  <OptimizedImage source={photoUrl} style={styles.matchPhoto} showLoadingIndicator={false} />
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
                    {item.otherUser.displayName && item.otherUser.displayName.length > 0
                      ? item.otherUser.displayName.charAt(0).toUpperCase()
                      : '?'}
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
            {item.unreadCount != null && item.unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.matchInfo}>
            <View style={styles.matchHeader}>
              <Text style={[styles.matchName, item.unreadCount && item.unreadCount > 0 && styles.matchNameUnread]}>
                {item.otherUser.displayName ?? ''}
              </Text>
              <Text style={styles.matchAge}>, {item.otherUser.age != null ? String(item.otherUser.age) : ''}</Text>
              {item.unreadCount != null && item.unreadCount > 0 ? (
                <View style={styles.unreadDot} />
              ) : null}
              {item.unreadCount != null && item.unreadCount > 0 ? (
                <Text style={styles.unreadLabel} numberOfLines={1}>New</Text>
              ) : null}
            </View>
            {renderMatchLocation(item.otherUser.location)}
            {formatLastActive(item.otherUser.lastActiveAt) ? (
              <Text style={styles.activeStatusText} numberOfLines={1}>
                🟢 {formatLastActive(item.otherUser.lastActiveAt)}
              </Text>
            ) : null}
            <View style={styles.badgesRow}>
              {item.profileCompatibility != null && item.stage !== 'pending' && (
                <View style={styles.matchCardCompatibilityBadge}>
                  <Text style={styles.matchCardCompatibilityIcon}>💕</Text>
                  <Text style={styles.matchCardCompatibilityText}>{item.profileCompatibility}%</Text>
                </View>
              )}
              <View style={styles.stageContainer}>
                <Animated.View style={item.stage === 'stage2' ? { transform: [{ scale: pulseAnim }] } : undefined}>
                  {(item.stage === 'stage1' || item.stage === 'stage2') && onStagePress ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => onStagePress(item.stage as 'stage1' | 'stage2')}
                    >
                      <LinearGradient
                        colors={item.stage === 'stage1' ? ['#ff80ab', '#ff4081', '#ff80ab'] : ['#ff6b9d', '#ff1493']}
                        locations={item.stage === 'stage1' ? [0, 0.5, 1] : undefined}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.stageBadge, getStageBadgeStyle(item.stage)]}
                      >
                        <Text style={styles.stageEmoji}>{getStageEmoji(item.stage)}</Text>
                        <Text style={[styles.stageText, item.stage === 'stage2' && { color: '#fff' }, item.stage === 'stage1' && styles.stageTextStage1]}>
                          {item.stage === 'stage1' ? 'Level 1' : 'Level 2'}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : (
                    <LinearGradient
                      colors={item.stage === 'pending' ? ['#fff5f8', '#ffeef7'] : item.stage === 'stage1' ? ['#ff80ab', '#ff4081', '#ff80ab'] : ['#ff6b9d', '#ff1493']}
                      locations={item.stage === 'stage1' ? [0, 0.5, 1] : undefined}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.stageBadge, getStageBadgeStyle(item.stage)]}
                    >
                      <Text style={styles.stageEmoji}>{getStageEmoji(item.stage)}</Text>
                      <Text style={[styles.stageText, item.stage === 'stage2' && { color: '#fff' }, item.stage === 'stage1' && styles.stageTextStage1]}>
                        {item.stage === 'pending' ? 'Pending' : item.stage === 'stage1' ? 'Level 1' : 'Level 2'}
                      </Text>
                    </LinearGradient>
                  )}
                </Animated.View>
              </View>
              {item.expiresAt && getTimeRemaining(item.expiresAt) ? (
                <View style={styles.timerContainer}>
                  <Text style={styles.timerEmoji}>⏳</Text>
                  <Text style={styles.timerText}>{getTimeRemaining(item.expiresAt)}</Text>
                </View>
              ) : null}
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
}, (prevProps, nextProps) => {
  // Custom comparison function for memoization
  // Only re-render if these props change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.unreadCount === nextProps.item.unreadCount &&
    prevProps.item.stage === nextProps.item.stage &&
    prevProps.item.expiresAt === nextProps.item.expiresAt &&
    prevProps.item.profileCompatibility === nextProps.item.profileCompatibility &&
    prevProps.photoUrl === nextProps.photoUrl
  );
});

// Empty State Component with Animation
function EmptyStateAnimated({ navigation }: { navigation: any }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Browse button pulse/shimmer (same style as Connect button)
  const browseButtonPulse = useRef(new Animated.Value(1)).current;
  const browseButtonShimmer = useRef(new Animated.Value(0)).current;
  const browseButtonLoopsRef = useRef<{ pulseLoop: Animated.CompositeAnimation; shimmerLoop: Animated.CompositeAnimation } | null>(null);

  const startBrowseButtonAnimations = useCallback(() => {
    if (browseButtonLoopsRef.current) return;
    browseButtonPulse.setValue(1);
    browseButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(browseButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(browseButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(browseButtonShimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(browseButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    shimmerLoop.start();
    browseButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, []);

  const stopBrowseButtonAnimations = useCallback(() => {
    const loops = browseButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      browseButtonLoopsRef.current = null;
    }
    browseButtonPulse.setValue(1);
    browseButtonShimmer.setValue(0);
  }, []);

  // Start pulse/shimmer on mount; stop on unmount (component only mounts when empty state is visible)
  useEffect(() => {
    startBrowseButtonAnimations();
    return stopBrowseButtonAnimations;
  }, [startBrowseButtonAnimations, stopBrowseButtonAnimations]);
  
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
      <TouchableOpacity
        style={styles.browseButton}
        onPress={() => navigation.navigate('Browse' as never)}
        activeOpacity={0.9}
      >
        <Animated.View style={{ transform: [{ scale: browseButtonPulse }] }}>
          <View style={styles.browseButtonInner}>
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb']}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View
              style={[
                styles.browseButtonShimmer,
                {
                  opacity: browseButtonShimmer.interpolate({
                    inputRange: [0, 0.3, 0.5, 0.7, 1],
                    outputRange: [0, 0.5, 0.8, 0.5, 0],
                  }),
                  transform: [
                    { skewX: '-25deg' },
                    { translateX: browseButtonShimmer.interpolate({ inputRange: [0, 1], outputRange: [-150, 350] }) },
                  ],
                },
              ]}
              pointerEvents="none"
            />
            <Text style={styles.browseButtonText}>✨ Browse People</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
      <LegalFooter />
    </View>
  );
}

// Match Profile Modal Component with Enhanced Animations
function MatchProfileModal({ 
  match, 
  visible, 
  onClose,
  onPhotoPress,
}: { 
  match: Match; 
  visible: boolean; 
  onClose: () => void;
  onPhotoPress?: (url: string, allUrls?: string[], index?: number) => void;
}) {
  const { otherUser } = match;
  const { user } = useAuth();
  const [currentUserInterests, setCurrentUserInterests] = useState<string[]>([]);
  // Stage1: primary profile picture only; Stage2: all photos
  const primaryPhoto = match.stage === 'stage1'
    ? (otherUser.photoUrl ? { id: 'primary', url: otherUser.photoUrl, isPrimary: true, displayOrder: 0 } : null)
    : (otherUser.photos?.find(p => p.isPrimary) || otherUser.photos?.[0] || null);
  const profilePhotoUrl = primaryPhoto ? getPhotoUrl(primaryPhoto.url) : (otherUser.photoUrl ? getPhotoUrl(otherUser.photoUrl) : null);
  const allPhotos = match.stage === 'stage1'
    ? (primaryPhoto ? [primaryPhoto] : [])
    : (otherUser.photos || []);
  const canSwipePhotos = match.stage === 'stage2' && allPhotos.length > 1;

  // Current index for main avatar when Level 2 has multiple photos (tap left/right to cycle)
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0);
  useEffect(() => {
    if (!visible) setMainPhotoIndex(0);
  }, [visible, match.id]);

  const mainPhotoUrl = canSwipePhotos && allPhotos[mainPhotoIndex]
    ? getPhotoUrl(allPhotos[mainPhotoIndex].url)
    : profilePhotoUrl;
  const goPrevPhoto = () => setMainPhotoIndex((i) => (i <= 0 ? allPhotos.length - 1 : i - 1));
  const goNextPhoto = () => setMainPhotoIndex((i) => (i >= allPhotos.length - 1 ? 0 : i + 1));

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
            <View style={styles.modalPhotoContainer} pointerEvents="box-none">
              <Animated.View
                pointerEvents="box-none"
                style={[
                  styles.modalPhotoWrapper,
                  {
                    transform: [{ scale: photoScale }],
                    opacity: photoOpacity,
                  },
                ]}
              >
                {/* Animated pulsing orb behind rings - pointerEvents none so photo tap works */}
                <Animated.View
                  pointerEvents="none"
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
                
                {/* Animated rings around photo - pointerEvents none so photo tap works */}
                <Animated.View
                  pointerEvents="none"
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
                  pointerEvents="none"
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
                  pointerEvents="none"
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
                
                {/* Glow effect with pulse - pointerEvents none so photo tap works */}
                <Animated.View
                  pointerEvents="none"
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
                
                {/* Avatar with breathing effect - tappable to open full-screen; Level 2: tap left/right to cycle photos */}
                {onPhotoPress && !canSwipePhotos && mainPhotoUrl ? (
                  <TouchableOpacity
                    onPress={() => onPhotoPress(mainPhotoUrl, canSwipePhotos ? allPhotos.map(p => getPhotoUrl(p.url)) : undefined, canSwipePhotos ? mainPhotoIndex : undefined)}
                    activeOpacity={0.9}
                    style={styles.modalPhotoTouchable}
                    accessibilityLabel="View full size photo"
                  >
                    <Animated.View
                      style={{
                        transform: [{ scale: avatarBreath }],
                      }}
                      pointerEvents="none"
                    >
                      {mainPhotoUrl ? (
                        <OptimizedImage source={mainPhotoUrl} style={styles.modalPhoto} resizeMode="cover" showLoadingIndicator={false} />
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
                    <Animated.Text
                      pointerEvents="none"
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
                      pointerEvents="none"
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
                      pointerEvents="none"
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
                  </TouchableOpacity>
                ) : (
                  <>
                  <Animated.View
                    style={{
                      transform: [{ scale: avatarBreath }],
                    }}
                  >
                    {mainPhotoUrl ? (
                      canSwipePhotos ? (
                        <View style={styles.modalPhotoSwipeContainer}>
                          <TouchableOpacity style={styles.modalPhotoSwipeSide} onPress={goPrevPhoto} activeOpacity={1} accessibilityLabel="Previous photo" />
                          <TouchableOpacity
                            style={[styles.modalPhotoSwipeCenter, { zIndex: 10, elevation: 10 }]}
                            onPress={() => onPhotoPress?.(mainPhotoUrl, allPhotos.map(p => getPhotoUrl(p.url)), mainPhotoIndex)}
                            activeOpacity={0.9}
                            accessibilityLabel="View full size photo"
                          >
                            <OptimizedImage source={mainPhotoUrl} style={styles.modalPhoto} resizeMode="cover" showLoadingIndicator={false} />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.modalPhotoSwipeSide} onPress={goNextPhoto} activeOpacity={1} accessibilityLabel="Next photo" />
                        </View>
                      ) : onPhotoPress ? (
                        <TouchableOpacity style={[styles.modalPhotoTouchable, { zIndex: 10, elevation: 10 }]} onPress={() => onPhotoPress(mainPhotoUrl, undefined, undefined)} activeOpacity={0.9} accessibilityLabel="View full size photo">
                          <OptimizedImage source={mainPhotoUrl} style={styles.modalPhoto} resizeMode="cover" showLoadingIndicator={false} />
                        </TouchableOpacity>
                      ) : (
                        <OptimizedImage source={mainPhotoUrl} style={styles.modalPhoto} resizeMode="cover" showLoadingIndicator={false} />
                      )
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
                  {/* Floating sparkles - only when not using wrapper touchable */}
                  {(!onPhotoPress || canSwipePhotos) && (
                    <>
                      <Animated.Text
                        pointerEvents="none"
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
                        pointerEvents="none"
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
                        pointerEvents="none"
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
                    </>
                  )}
                  </>
                )}
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
                  {allPhotos.map((photo, idx) => {
                    const photoUrl = getPhotoUrl(photo.url);
                    const thumb = (
                      <OptimizedImage
                        source={photo.url}
                        style={styles.modalPhotoThumbnail}
                        resizeMode="cover"
                        showLoadingIndicator={false}
                      />
                    );
                    return (
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
                        {onPhotoPress ? (
                          <TouchableOpacity
                            onPress={() => onPhotoPress(photoUrl, allPhotos.map(p => getPhotoUrl(p.url)), idx)}
                            activeOpacity={0.9}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="View full size photo"
                          >
                            {thumb}
                          </TouchableOpacity>
                        ) : thumb}
                      </Animated.View>
                    );
                  })}
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
  const { user, isAuthenticated, loading: authLoading, registerMatchListRefresh } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Compact chat header on small screens (e.g. iPhone SE 667pt) so more messages are visible
  const isSmallScreen = windowHeight < 680;
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingVideoUri, setPendingVideoUri] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const sendInFlightRef = useRef(false);
  const sendSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SEND_SAFETY_MS = 40000; // Unstick send UI if request hangs (e.g. cold server, bad network)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [stageInfoModalVisible, setStageInfoModalVisible] = useState(false);
  const [stageInfoStage, setStageInfoStage] = useState<'stage1' | 'stage2' | null>(null);
  const [showPhotoGuidelinesModal, setShowPhotoGuidelinesModal] = useState(false);
  const [gameRequestToShow, setGameRequestToShow] = useState<PendingGameRequest | null>(null);
  const [openGameForAccept, setOpenGameForAccept] = useState<{ matchId: string; gameType: 'truth_or_dare' | 'never_have_i_ever' } | null>(null);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const [fullScreenPhotoList, setFullScreenPhotoList] = useState<string[] | null>(null);
  const [fullScreenPhotoIndex, setFullScreenPhotoIndex] = useState(0);
  const fullScreenOpenedFromProfileCardRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<FlatList>(null);
  const selectedMatchRef = useRef<Match | null>(null);
  const matchesRef = useRef<Match[]>([]);
  const lastFetchedMatchIdRef = useRef<string | null>(null);
  const textInputRef = useRef<TextInput>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [profileCompatibility, setProfileCompatibility] = useState<number | null>(null);
  const [compatibilityDetails, setCompatibilityDetails] = useState<{ reasons: string[]; sharedInterests: string[]; sharedValues: number } | null>(null);
  const [showAgeCardModal, setShowAgeCardModal] = useState(false);
  const [showCompatibilityCardModal, setShowCompatibilityCardModal] = useState(false);
  const [messageLikedToast, setMessageLikedToast] = useState<{ likerName: string } | null>(null);
  
  useEffect(() => {
    if (!messageLikedToast) return;
    const t = setTimeout(() => setMessageLikedToast(null), 3000);
    return () => clearTimeout(t);
  }, [messageLikedToast]);
  
  // Header animations
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(1)).current;
  
  // Message animations
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({}).current;
  
  // Chat transition animations
  const chatSlideAnim = useRef(new Animated.Value(0)).current;
  const chatFadeAnim = useRef(new Animated.Value(0)).current;

  matchesRef.current = matches;

  // Only show matches that haven't passed their 7-day expiration (so they disappear when timer hits 0)
  const visibleMatches = useMemo(() => {
    const now = currentTime.getTime();
    return matches.filter(m => !m.expiresAt || new Date(m.expiresAt).getTime() > now);
  }, [matches, currentTime]);

  // Clear selected match if it has expired (so we don't show chat for an expired match)
  useEffect(() => {
    if (!selectedMatch || !selectedMatch.expiresAt) return;
    if (new Date(selectedMatch.expiresAt).getTime() <= currentTime.getTime()) {
      setSelectedMatch(null);
    }
  }, [selectedMatch, currentTime]);

  // Clear pending image when switching matches
  useEffect(() => {
    setPendingImageUri(null);
  }, [selectedMatch?.id]);

  // Unstick send UI when leaving chat (e.g. back to list or switch match) so send works again
  useEffect(() => {
    if (!selectedMatch) {
      if (sendSafetyTimeoutRef.current) {
        clearTimeout(sendSafetyTimeoutRef.current);
        sendSafetyTimeoutRef.current = null;
      }
      sendInFlightRef.current = false;
      setSendingMessage(false);
    }
  }, [selectedMatch]);

  // Fetch profile compatibility when viewing a match (interests, dealbreakers, looking for, etc.)
  useEffect(() => {
    if (!selectedMatch || selectedMatch.stage === 'pending') {
      setProfileCompatibility(null);
      setCompatibilityDetails(null);
      return;
    }
    const fetchCompat = async () => {
      try {
        const r = await api.get(`/matches/${selectedMatch.id}/profile-compatibility`, false);
        const val = r.profileCompatibility;
        if (typeof val === 'number') {
          setProfileCompatibility(val);
          setCompatibilityDetails({
            reasons: Array.isArray(r.reasons) ? r.reasons : [],
            sharedInterests: Array.isArray(r.sharedInterests) ? r.sharedInterests : [],
            sharedValues: typeof r.sharedValues === 'number' ? r.sharedValues : 0,
          });
        } else {
          setProfileCompatibility(null);
          setCompatibilityDetails(null);
        }
      } catch (e) {
        if (__DEV__) console.warn('Profile compatibility fetch failed:', e);
        setProfileCompatibility(null);
        setCompatibilityDetails(null);
      }
    };
    fetchCompat();
  }, [selectedMatch?.id, selectedMatch?.stage]);

  // Update current time for timer display — every second if any match has expiration (so expired matches disappear on the tick)
  useEffect(() => {
    const hasAnyExpiring = matches.some(m => m.expiresAt);
    const updateInterval = hasAnyExpiring ? 1000 : 60000;

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, updateInterval);

    return () => clearInterval(interval);
  }, [matches]);

  // When keyboardHeight changes, scroll after layout updates so newest messages stay anchored
  useEffect(() => {
    if (keyboardHeight > 0 && messages.length > 0) {
      const t1 = setTimeout(() => scrollToLatestMessageRef.current(), 100);
      const t2 = setTimeout(() => scrollToLatestMessageRef.current(), 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [keyboardHeight, messages.length]);

  // Android: extra offset so input bar and messages stay visible above keyboard (avoids keyboard covering text)
  const effectiveKeyboardHeight = keyboardHeight > 0 && Platform.OS === 'android'
    ? keyboardHeight + 40
    : keyboardHeight;

  // Handle keyboard show/hide events - scroll to show most recent message when keyboard opens
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        // Scroll to newest after layout settles (contentContainerStyle + wrapper padding update, then FlatList relayouts)
        const scrollToNewest = () => scrollToLatestMessageRef.current();
        setTimeout(scrollToNewest, 50);
        setTimeout(scrollToNewest, 150);
        setTimeout(scrollToNewest, 350);
        setTimeout(scrollToNewest, 550);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        // Scroll to newest when keyboard dismisses so messages stay anchored
        setTimeout(() => scrollToLatestMessageRef.current(), 100);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // Calculate time remaining until expiration
  const getTimeRemaining = useCallback((expiresAt: string | null): string | null => {
    if (!expiresAt) return null;
    
    const expirationDate = new Date(expiresAt);
    const now = currentTime;
    let diff = expirationDate.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    // Cap at 7 days so timer never shows more than 7d 0h (handles legacy matches created with end-of-day logic)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    diff = Math.min(diff, sevenDaysMs);
    
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
  }, [currentTime]);

  // Format last active for display in match list (only shown when other user has show_active_status on)
  const formatLastActive = useCallback((lastActiveAt: string | null | undefined): string | null => {
    if (!lastActiveAt) return null;
    const then = new Date(lastActiveAt).getTime();
    const now = currentTime.getTime();
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    if (diffDays === 1) return 'Active yesterday';
    if (diffDays < 7) return `Active ${diffDays}d ago`;
    return null; // Don't show for older
  }, [currentTime]);

  const handleKeyPress = (e: any) => {
    // Hardware keyboard / web: Enter sends (Shift+Enter for newline in future)
    if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
      const trimmed = newMessage.trim();
      if (trimmed && !sendingMessage) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        handleSendMessage(trimmed);
        return;
      }
    }
  };

  // Debounced typing indicator emission (reduces socket events)
  const emitTypingDebounced = useRef(
    debounce(() => {
      if (socketRef.current && selectedMatch && selectedMatch.stage !== 'pending') {
        socketRef.current.emit('typing', { matchId: selectedMatch.id });
      }
    }, 500)
  ).current;

  const handleTextChange = useCallback((text: string) => {
    // If we're in the process of sending, don't update (prevents newline from being added)
    if (!sendingMessage) {
      setNewMessage(text);
      
      // Emit typing indicator (debounced to reduce socket events)
      if (text.trim().length > 0 && selectedMatch?.id && selectedMatch.stage !== 'pending') {
        if (!isTyping) {
          setIsTyping(true);
          // Emit immediately on first character
          socketRef.current?.emit('typing', { matchId: selectedMatch.id });
        } else {
          // Use debounced emission for subsequent characters
          emitTypingDebounced();
        }
        
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        // Set timeout to stop typing indicator after 2 seconds of no typing
        typingTimeoutRef.current = setTimeout(() => {
          if (selectedMatch?.id) {
            setIsTyping(false);
            socketRef.current?.emit('stop_typing', { matchId: selectedMatch.id });
          }
        }, 2000);
      } else {
        // If text is empty, stop typing immediately
        if (isTyping && selectedMatch?.id) {
          setIsTyping(false);
          socketRef.current?.emit('stop_typing', { matchId: selectedMatch.id });
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
    }
  }, [sendingMessage, selectedMatch, isTyping, emitTypingDebounced]);

  // Reversed for inverted FlatList: index 0 = newest (anchored at bottom near input)
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Scroll to most recent message (index 0 in inverted list = newest at bottom)
  const scrollToLatestMessage = useCallback(() => {
    if (messages.length === 0) return;
    const list = messagesEndRef.current;
    if (!list) return;
    list.scrollToIndex({ index: 0, viewPosition: 1, animated: false });
  }, [messages.length]);

  const scrollToLatestMessageRef = useRef(scrollToLatestMessage);
  scrollToLatestMessageRef.current = scrollToLatestMessage;

  const scrollToEndDebounced = useRef(
    debounce(() => {
      InteractionManager.runAfterInteractions(() => {
        scrollToLatestMessageRef.current();
      });
    }, 80)
  ).current;

  const scrollToEndOnLayout = useCallback(() => {
    scrollToLatestMessageRef.current();
  }, []);

  // Scroll to most recent message when opening a chat or when messages load - multiple attempts for layout timing
  useEffect(() => {
    if (!selectedMatch || messages.length === 0) return;
    const scroll = () => scrollToLatestMessageRef.current();
    const t1 = setTimeout(scroll, 0);
    const t2 = setTimeout(scroll, 100);
    const t3 = setTimeout(scroll, 350);
    const t4 = setTimeout(scroll, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [selectedMatch?.id, messages.length]);

  const onScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    // Fallback: scrollToOffset 0 shows newest (index 0) in inverted list
    setTimeout(() => {
      messagesEndRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, 100);
  }, []);

  const onImagePress = useCallback((url: string) => {
    fullScreenOpenedFromProfileCardRef.current = false;
    setFullScreenImageUrl(url);
  }, []);

  const handleLikePress = useCallback(
    async (messageId: string, currentlyLiked: boolean) => {
      if (!selectedMatch?.id || !user?.id) return;
      try {
        const base = `/matches/${selectedMatch.id}/messages/${messageId}/like`;
        if (currentlyLiked) {
          await api.delete(base);
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, likedBy: null } : m)));
        } else {
          await api.post(base, {});
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, likedBy: user.id } : m)));
        }
      } catch (_) {
        // Optionally show error toast
      }
    },
    [selectedMatch?.id, user?.id]
  );

  // Memoized renderItem - with inverted list, index 0 = newest; animate last N (first N in reversed)
  const renderMessageItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const shouldAnimate = index < ANIMATE_LAST_N;

      let animValue: Animated.Value | null = null;
      if (shouldAnimate) {
        if (!messageAnimations[item.id]) {
          messageAnimations[item.id] = new Animated.Value(0);
          Animated.spring(messageAnimations[item.id], {
            toValue: 1,
            tension: 50,
            friction: 7,
            delay: Math.min(index * 20, 150),
            useNativeDriver: true,
          }).start();
        }
        animValue = messageAnimations[item.id];
      }

      return (
        <MessageBubble
          item={item}
          animValue={animValue}
          styles={styles}
          onImagePress={onImagePress}
          matchId={selectedMatch?.id}
          currentUserId={user?.id}
          onLikePress={handleLikePress}
        />
      );
    },
    [messages.length, onImagePress, selectedMatch?.id, user?.id, handleLikePress]
  );

  // Prune old message animations when list changes (prevents memory leak)
  useEffect(() => {
    const ids = new Set(messages.map((m) => m.id));
    Object.keys(messageAnimations).forEach((id) => {
      if (!ids.has(id)) delete messageAnimations[id];
    });
  }, [messages]);

  // In inverted FlatList: ListHeaderComponent appears at bottom (near input), ListFooterComponent at top
  const listHeaderComponent = useMemo(
    () => (typingUsers.size > 0 ? <TypingIndicator /> : null),
    [typingUsers.size]
  );

  const messagesContentStyle = useMemo(
    () => [styles.messagesContent],
    []
  );

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
        // Re-join match room on reconnect so we receive real-time messages
        const current = selectedMatchRef.current;
        if (current?.id) {
          socket.emit('join_match', current.id);
        }
      });

      socket.on('disconnect', () => {
        console.log('❌ Matches: Disconnected from WebSocket server');
      });

      // Handle typing indicators
      socket.on('user_typing', (data: { matchId: string; userId: string; displayName?: string }) => {
        const currentMatchId = selectedMatchRef.current?.id;
        if (data.matchId === currentMatchId && data.userId !== user?.id) {
          setTypingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.add(data.userId);
            return newSet;
          });
        }
      });
      
      // Handle typing stopped
      socket.on('typing_stopped', (data: { matchId: string; userId: string }) => {
        const currentMatchId = selectedMatchRef.current?.id;
        if (data.matchId === currentMatchId && data.userId !== user?.id) {
          setTypingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(data.userId);
            return newSet;
          });
        }
      });
      
      // Handle message read receipts (backend marks all messages in match as read)
      socket.on('messages_read', (data: { matchId: string }) => {
        const currentMatchId = selectedMatchRef.current?.id;
        if (data.matchId === currentMatchId) {
          // Mark all unread messages from the other user as read
          const now = new Date().toISOString();
          setMessages((prev) =>
            prev.map((msg) =>
              !msg.isOwn && !msg.readAt ? { ...msg, readAt: now } : msg
            )
          );
        }
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
          // Stop typing indicator when message is received
          setTypingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(message.senderId);
            return newSet;
          });
          
          setMessages((prev) => {
            // Check if message already exists (avoid duplicates)
            if (prev.some((m) => m.id === message.id || (m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId))) {
              // If we have a temp message with same content, replace it
              const hasTemp = prev.some(m => m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId);
              if (hasTemp) {
                const filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.content === message.content && m.senderId === message.senderId));
                const next = [...filtered, { ...message, isOwn: message.senderId === user?.id }];
                return next.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
              }
              return prev;
            }
            const next = [...prev, { ...message, isOwn: message.senderId === user?.id }];
            return next.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
          });
        } else {
          // Message is for a different match - AuthContext shows in-app Alert + sound; just refresh list
          fetchMatches();
        }
        
        // Play message sound if message is from another user and we're viewing this match
        if (isForCurrentMatch && message.senderId !== user?.id) {
          playMessageSound().catch(() => {
            // Non-critical - app works without sound
            console.log('Message sound not available');
          });
        }
        // Scroll to show newest message when we receive one (index 0 in inverted list)
        if (isForCurrentMatch) {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => scrollToLatestMessageRef.current(), 100);
          });
        }
      });

      socket.on('message_liked', (data: { matchId: string; messageId: string; likedBy: string; likerName?: string; senderId?: string }) => {
        const currentMatchId = selectedMatchRef.current?.id;
        if (currentMatchId !== data.matchId) return;
        setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, likedBy: data.likedBy } : m)));
        if (data.senderId === user?.id && data.likerName) {
          setMessageLikedToast({ likerName: data.likerName });
        }
      });

      socket.on('message_unliked', (data: { matchId: string; messageId: string }) => {
        const currentMatchId = selectedMatchRef.current?.id;
        if (currentMatchId !== data.matchId) return;
        setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, likedBy: null } : m)));
      });

      // Match notification: refresh list (match sound played by AuthContext for both users)
      socket.on('new_match', () => {
        fetchMatches();
      });

      socket.on('stage_advanced', (data: { matchId: string; stage: string }) => {
        if (data.stage !== 'stage2') return;
        setMatches((prev) => prev.map((m) => m.id === data.matchId ? { ...m, stage: 'stage2' } : m));
        setSelectedMatch((prev) => prev && prev.id === data.matchId ? { ...prev, stage: 'stage2' } : prev);
      });

      socket.on('game_request_received', (data: { requestId: string; matchId: string; fromUserId: string; fromUserName: string; gameType: 'truth_or_dare' | 'never_have_i_ever' }) => {
        playMessageSound().catch(() => {});
        setGameRequestToShow({
          requestId: data.requestId,
          matchId: data.matchId,
          fromUserId: data.fromUserId,
          fromUserName: data.fromUserName,
          gameType: data.gameType,
        });
        const matchToSelect = matchesRef.current.find(m => m.id === data.matchId);
        if (matchToSelect) setSelectedMatch(matchToSelect);
      });

      socket.on('game_request_responded', (data: { requestId: string; matchId: string; gameType: string; accepted: boolean }) => {
        if (data.accepted) {
          const m = matchesRef.current.find(x => x.id === data.matchId);
          if (m) {
            setSelectedMatch(m);
            setOpenGameForAccept({ matchId: data.matchId, gameType: data.gameType as 'truth_or_dare' | 'never_have_i_ever' });
          }
        }
      });

      socket.on('game_unlocked', (data: { matchId: string; gameType: string }) => {
        const gameKey = data.gameType === 'truth_or_dare' ? 'truth_or_dare' : 'never_have_i_ever';
        setMatches(prev => prev.map(m => m.id === data.matchId ? {
          ...m,
          gameUnlocks: {
            ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
            [gameKey]: true,
          },
        } : m));
        if (selectedMatchRef.current?.id === data.matchId) {
          setSelectedMatch(prev => prev ? { ...prev, gameUnlocks: { ...(prev.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), [gameKey]: true } } : null);
        }
      });

      // Real-time: other user unmatched — remove match from list and close chat if open
      socket.on('match_unmatched', (data: { matchId: string; unmatchedBy?: string }) => {
        const { matchId } = data;
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
        if (selectedMatchRef.current?.id === matchId) {
          setSelectedMatch(null);
          setMessages([]);
        }
      });
    };

    initSocket();

      return () => {
        if (socketRef.current) {
          socketRef.current.off('user_typing');
          socketRef.current.off('typing_stopped');
          socketRef.current.off('messages_read');
          socketRef.current.off('new_message');
          socketRef.current.off('message_liked');
          socketRef.current.off('message_unliked');
          socketRef.current.off('new_match');
          socketRef.current.off('stage_advanced');
          socketRef.current.off('game_request_received');
          socketRef.current.off('game_request_responded');
          socketRef.current.off('game_unlocked');
          socketRef.current.disconnect();
        }
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
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

  // Expose currently viewed match so AuthContext can avoid showing in-app alert when user is in this chat
  useEffect(() => {
    currentMatchIdRef.current = selectedMatch?.id ?? null;
    return () => { currentMatchIdRef.current = null; };
  }, [selectedMatch?.id]);

  useEffect(() => {
    selectedMatchRef.current = selectedMatch;

    // Chat transition: fade only (no translateX so messages/input stay on screen)
    if (selectedMatch) {
      chatSlideAnim.setValue(0);
      chatFadeAnim.setValue(0);
      Animated.timing(chatFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      chatSlideAnim.setValue(0);
      chatFadeAnim.setValue(1);
    }
    
    if (!selectedMatch) return;

    if (selectedMatch.stage !== 'pending') {
      // Refetch matches immediately so gameUnlocks (Truth or Dare, etc.) is fresh for the other user
      fetchMatches();
      setNewMessage(''); // clear input so Mulligan Moment starter doesn't carry over to another match
      // Only clear messages when switching to a *different* match (avoids clearing on effect re-run for same match)
      const matchId = selectedMatch.id;
      if (lastFetchedMatchIdRef.current !== null && lastFetchedMatchIdRef.current !== matchId) {
        console.log(`📨 Switching from match ${lastFetchedMatchIdRef.current} to ${matchId}, clearing messages`);
        setMessages([]);
      } else {
        console.log(`📨 Opening match ${matchId} (same as last or first time)`);
      }
      // Fetch messages immediately via HTTP - don't wait for socket (messages load works without real-time)
      fetchMessages(selectedMatch.id);
      if (socketRef.current) {
        socketRef.current.emit('join_match', selectedMatch.id);
        socketRef.current.emit('mark_read', { matchId: selectedMatch.id });
      }
    }

    return () => {
      if (socketRef.current && selectedMatch) {
        socketRef.current.emit('leave_match', selectedMatch.id);
      }
    };
  }, [selectedMatch?.id, fetchMessages]);

  // Poll for new messages when chat is open (fallback if socket misses an event). 15s interval to avoid rate limits (429).
  useEffect(() => {
    if (!selectedMatch || selectedMatch.stage === 'pending') return;
    const interval = setInterval(() => {
      if (selectedMatchRef.current?.id === selectedMatch.id) {
        fetchMessages(selectedMatch.id);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedMatch?.id, selectedMatch?.stage, fetchMessages]);

  // Handle route params and pending open (e.g. "Send message" on celebration, game request from push) when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!user || !isAuthenticated || authLoading) return;
      const pendingId = getPendingOpenMatchId();
      const pendingGame = getPendingGameRequest();
      const routeParams = route.params as { matchId?: string; showGameRequest?: boolean; showMatchCelebration?: boolean; matchName?: string } | undefined;
      const matchIdToOpen = pendingId ?? routeParams?.matchId;

      const runPendingLogic = async () => {
        if (matchIdToOpen) {
          const matchToSelect = matches.find(m => m.id === matchIdToOpen);
          if (matchToSelect) {
            setSelectedMatch(matchToSelect);
            if (pendingId) clearPendingOpenMatchId();
            // Refetch matches so gameUnlocks (e.g. Truth or Dare) is fresh for the other user
            fetchMatches();
            if (pendingGame && (routeParams?.showGameRequest || pendingGame.matchId === matchIdToOpen)) {
              setGameRequestToShow(pendingGame);
              clearPendingGameRequest();
            }
          } else {
            // Match not in list (e.g. just created, opened from notification) - clear cache and fetch for fresh data
            api.clearCache('/matches');
            await fetchMatches();
          }
        } else if (pendingGame && matches.length > 0 && !loading) {
          const matchToSelect = matches.find(m => m.id === pendingGame.matchId);
          if (matchToSelect) {
            setSelectedMatch(matchToSelect);
            setGameRequestToShow(pendingGame);
            clearPendingGameRequest();
          }
        }
      };

      // When we have a pending match to open, run immediately - don't wait for interactions
      if (matchIdToOpen || (pendingGame && matches.length > 0)) {
        runPendingLogic();
      } else {
        const task = InteractionManager.runAfterInteractions(runPendingLogic);
        return () => task.cancel();
      }
    }, [matches, route.params, user, isAuthenticated, authLoading, loading, fetchMatches])
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
        return [];
      }
      
      const data = await api.get<{ matches: Match[] }>('/matches');
      const fetchedMatches = data.matches || [];
      setMatches(fetchedMatches);

      // Prefetch primary photos so they display immediately when user opens the matches list
      fetchedMatches.forEach((m: Match) => {
        let raw: string | null = null;
        if (m.stage === 'stage2' && m.otherUser.photos?.length) {
          const primary = m.otherUser.photos.find((p: Photo) => p.isPrimary) || m.otherUser.photos[0];
          raw = primary?.url ?? null;
        } else {
          raw = m.otherUser.photoUrl ?? null;
        }
        if (raw) Image.prefetch(getPhotoUrl(raw));
      });

      // Auto-select match from pending (celebration "Send message") or route params
      const pendingId = getPendingOpenMatchId();
      const routeParams = route.params as { matchId?: string } | undefined;
      const matchIdToOpen = pendingId ?? routeParams?.matchId;
      if (matchIdToOpen && fetchedMatches.length > 0) {
        const matchToSelect = fetchedMatches.find(m => m.id === matchIdToOpen);
        if (matchToSelect) {
          setSelectedMatch(matchToSelect);
          if (pendingId) clearPendingOpenMatchId();
        }
      }
      return fetchedMatches;
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
      return [];
    } finally {
      setLoading(false);
    }
  }, [route.params]);

  // When new_match is received (e.g. User B matched with User A while A is on Connect tab), refresh list via AuthContext socket
  useEffect(() => {
    registerMatchListRefresh(() => fetchMatches());
    return () => registerMatchListRefresh(null);
  }, [registerMatchListRefresh, fetchMatches]);

  // Auto-select match when matches load and we have pending or route param (e.g. celebration "Send message")
  // When matches refresh (e.g. after fetchMatches), re-set selectedMatch from fresh list so gameUnlocks is up to date
  useEffect(() => {
    const pendingId = getPendingOpenMatchId();
    const routeParams = route.params as { matchId?: string } | undefined;
    const matchIdToOpen = pendingId ?? routeParams?.matchId;
    if (matchIdToOpen && matches.length > 0 && !loading) {
      const matchToSelect = matches.find(m => m.id === matchIdToOpen);
      if (matchToSelect) {
        setSelectedMatch(matchToSelect);
        if (pendingId) clearPendingOpenMatchId();
      }
    } else if (selectedMatch?.id && matches.length > 0) {
      // Keep selectedMatch in sync with fresh matches (e.g. gameUnlocks after the other user unlocked)
      const updated = matches.find(m => m.id === selectedMatch.id);
      if (updated && (updated.gameUnlocks?.truth_or_dare !== selectedMatch.gameUnlocks?.truth_or_dare || updated.gameUnlocks?.never_have_i_ever !== selectedMatch.gameUnlocks?.never_have_i_ever)) {
        setSelectedMatch(updated);
      }
    }
  }, [matches, route.params, loading, selectedMatch?.id, selectedMatch?.gameUnlocks?.truth_or_dare, selectedMatch?.gameUnlocks?.never_have_i_ever]);

  const fetchMessages = useCallback(async (matchId: string, retryCount = 0) => {
    const maxRetries = 3;
    try {
      const data = await api.get<{ messages: Message[] }>(`/matches/${matchId}/messages`, false);
      const raw = Array.isArray(data?.messages) ? data.messages : [];
      const list = [...raw].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
      if (selectedMatchRef.current?.id === matchId) {
        lastFetchedMatchIdRef.current = matchId;
        setMessages(list);
        // If we got 0 messages, retry once after short delay (handles race when match just created)
        if (list.length === 0 && retryCount < 1) {
          setTimeout(() => fetchMessages(matchId, retryCount + 1), 400);
        }
      }
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      const message = error?.message ?? '';
      const isMatchNotFound = status === 404 || /match not found|not yet mutual/i.test(message);

      if (isMatchNotFound) {
        // Match no longer exists or not mutual (e.g. other user unmatched, stale list). Don't retry.
        if (selectedMatchRef.current?.id === matchId) {
          lastFetchedMatchIdRef.current = null;
          setMessages([]);
          fetchMatches();
          setSelectedMatch(null);
        }
        if (__DEV__) {
          console.warn('⚠️ Match no longer available, returning to list:', matchId);
        }
        return;
      }

      const isRateLimit = status === 429;
      if (isRateLimit && retryCount === 0) {
        console.warn('⚠️ Rate limited (429) fetching messages — will retry after 10s');
      } else {
        console.error('Failed to fetch messages:', error);
      }
      // 429: back off longer and only retry once to avoid hammering the server
      const retryDelay = isRateLimit ? 10000 : 600;
      const allowedRetries = isRateLimit ? 1 : maxRetries;
      if (retryCount < allowedRetries) {
        setTimeout(() => fetchMessages(matchId, retryCount + 1), retryDelay);
        return;
      }
      // DON'T clear messages on error - keep existing messages visible
      console.warn(`⚠️ Failed to fetch messages after ${retryCount + 1} attempts, keeping existing messages`);
      if (selectedMatchRef.current?.id === matchId) {
        lastFetchedMatchIdRef.current = matchId;
        setMessages((prev) => prev.length > 0 ? prev : []);
      }
    }
  }, [fetchMatches]);

  const handleBack = useCallback(() => {
    console.log('🔙 handleBack called - clearing selected match');
    console.log('   Current selectedMatch:', selectedMatch?.id);
    lastFetchedMatchIdRef.current = null;
    // Refresh matches to update unread counts after viewing messages
    fetchMatches();
    setMessages([]);
    setSelectedMatch(null);
  }, [selectedMatch, fetchMatches]);

  const handleSendMessage = async (messageToSend?: string, imageUrlToSend?: string, videoUrlToSend?: string, audioUrlToSend?: string) => {
    const messageContent = (messageToSend ?? newMessage).trim();
    const hasContent = messageContent.length > 0;
    const hasImage = !!imageUrlToSend;
    const hasVideo = !!videoUrlToSend;
    const hasAudio = !!audioUrlToSend;
    if ((!hasContent && !hasImage && !hasVideo && !hasAudio) || !selectedMatch || !user) return;
    // Ref guard: prevent concurrent sends (state update is async so rapid taps can both pass sendingMessage check)
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;

    // Stop typing indicator
    if (isTyping && selectedMatch.id) {
      setIsTyping(false);
      socketRef.current?.emit('stop_typing', { matchId: selectedMatch.id });
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    setNewMessage('');
    Keyboard.dismiss();
    setTimeout(() => setKeyboardHeight(0), 100);
    
    setSendingMessage(true);
    if (sendSafetyTimeoutRef.current) clearTimeout(sendSafetyTimeoutRef.current);
    sendSafetyTimeoutRef.current = setTimeout(() => {
      sendSafetyTimeoutRef.current = null;
      if (sendInFlightRef.current) {
        sendInFlightRef.current = false;
        setSendingMessage(false);
        Alert.alert('Send taking longer than usual', 'You can try again. The message may still send.');
      }
    }, SEND_SAFETY_MS);

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content: (hasImage || hasVideo || hasAudio) && !hasContent ? '' : messageContent,
      imageUrl: imageUrlToSend || null,
      videoUrl: videoUrlToSend || null,
      audioUrl: audioUrlToSend || null,
      senderId: user.id,
      senderName: user.displayName || 'You',
      sentAt: new Date().toISOString(),
      isOwn: true,
    };
    const tempAnim = new Animated.Value(0);
    messageAnimations[tempMessage.id] = tempAnim;
    Animated.spring(tempAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
    setMessages((prev) => [...prev, tempMessage]);

    const scrollToNewestAfterLayout = () => {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => scrollToLatestMessageRef.current(), 50);
      });
    };
    scrollToNewestAfterLayout();
    setTimeout(scrollToNewestAfterLayout, 200);

    const sendPayload = {
      content: messageContent || '',
      ...(imageUrlToSend ? { imageUrl: imageUrlToSend } : {}),
      ...(videoUrlToSend ? { videoUrl: videoUrlToSend } : {}),
      ...(audioUrlToSend ? { audioUrl: audioUrlToSend } : {}),
    };
    const doSend = () =>
      api.post<{ message: Message; stage?: string; autoAdvanced?: boolean }>(
        `/matches/${selectedMatch.id}/messages`,
        sendPayload,
        { timeoutMs: 35000 }
      );

    try {
      let response: Awaited<ReturnType<typeof doSend>>;
      try {
        response = await doSend();
      } catch (firstErr: any) {
        const isTimeout =
          firstErr?.message?.toLowerCase().includes('timeout') ||
          firstErr?.status === 408 ||
          firstErr?.message?.toLowerCase().includes('aborted');
        if (isTimeout) {
          await new Promise((r) => setTimeout(r, 2000));
          response = await doSend();
        } else {
          throw firstErr;
        }
      }

      // Replace temp message with real message from server (dedupe: socket may have already added it)
      if (response.message) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempMessage.id && m.id !== response.message!.id);
          const next = [...filtered, { ...response.message, isOwn: response.message.senderId === user.id }];
          return next.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
        });
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => scrollToLatestMessageRef.current(), 50);
          setTimeout(() => scrollToLatestMessageRef.current(), 250);
        });
      } else {
        // If no message in response, keep temp message (socket will replace it, or it stays as fallback)
        console.log('No message in response, keeping temp message until socket confirms');
      }
      // When both users have sent 2+ messages each, backend returns stage: 'stage2' — update UI immediately
      if (response.stage === 'stage2') {
        setSelectedMatch((prev) => prev && prev.id === selectedMatch.id ? { ...prev, stage: 'stage2' } : prev);
        setMatches((prev) => prev.map((m) => m.id === selectedMatch.id ? { ...m, stage: 'stage2' } : m));
      }
    } catch (error: any) {
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      const msg = error?.message || 'Failed to send message';
      Alert.alert('Error', msg.includes('timeout') ? 'Network request timed out. Please check your connection and try again.' : msg);
    } finally {
      if (sendSafetyTimeoutRef.current) {
        clearTimeout(sendSafetyTimeoutRef.current);
        sendSafetyTimeoutRef.current = null;
      }
      sendInFlightRef.current = false;
      setSendingMessage(false);
    }
  };

  const handleSendPhoto = useCallback(async () => {
    if (!selectedMatch || sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || !user) return;
    Alert.alert(
      'Send photo, video, or voice',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera access in Settings to take photos.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.85,
              });
              if (!result.canceled && result.assets[0]) {
                setPendingVideoUri(null);
                setPendingImageUri(result.assets[0].uri);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to take photo');
            }
          },
        },
        {
          text: 'Take Video',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera access in Settings to record video.');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                videoMaxDuration: 60,
                quality: 0.7,
              });
              if (!result.canceled && result.assets[0]) {
                setPendingImageUri(null);
                setPendingVideoUri(result.assets[0].uri);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to record video');
            }
          },
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant photo library access in Settings.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 0.85,
              });
              if (!result.canceled && result.assets[0]) {
                setPendingVideoUri(null);
                setPendingImageUri(result.assets[0].uri);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to pick photo');
            }
          },
        },
        {
          text: 'Video Library',
          onPress: async () => {
            try {
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant library access in Settings.');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                videoMaxDuration: 60,
              });
              if (!result.canceled && result.assets[0]) {
                setPendingImageUri(null);
                setPendingVideoUri(result.assets[0].uri);
              }
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to pick video');
            }
          },
        },
        {
          text: 'Record Voice',
          onPress: async () => {
            try {
              const { status } = await Audio.requestPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant microphone access in Settings to record voice messages.');
                return;
              }
              await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
              const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
              recordingRef.current = recording;
              setIsRecordingVoice(true);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to start recording');
            }
          },
        },
      ]
    );
  }, [selectedMatch, sendingMessage, uploadingImage, uploadingVideo, uploadingAudio, user]);

  const uploadAndSendImage = async (uri: string) => {
    if (!selectedMatch || !user) return;
    setUploadingImage(true);
    try {
      const token = await getToken();
      if (!token || !token.trim()) {
        throw new Error('Session expired. Please log in again.');
      }
      const filename = uri.split('/').pop() || 'photo.jpg';
      const ext = filename.toLowerCase().match(/\.(\w+)$/)?.[1] || 'jpg';
      const mimeTypes: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';

      const formData = new FormData();
      formData.append('image', { uri, type: mimeType, name: filename } as any);

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      const response = await fetch(
        `${API_URL}/api/matches/${selectedMatch.id}/messages/upload-image`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed: ${response.status}`);
      }

      const { imageUrl } = await response.json();
      if (imageUrl) {
        await handleSendMessage('', imageUrl);
      } else {
        throw new Error('No image URL returned');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to upload photo');
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadAndSendVideo = async (uri: string) => {
    if (!selectedMatch || !user) return;
    setUploadingVideo(true);
    try {
      const token = await getToken();
      if (!token?.trim()) throw new Error('Session expired. Please log in again.');
      const filename = uri.split('/').pop() || 'video.mp4';
      const formData = new FormData();
      formData.append('video', { uri, type: 'video/mp4', name: filename } as any);
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      const response = await fetch(`${API_URL}/api/matches/${selectedMatch.id}/messages/upload-video`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed: ${response.status}`);
      }
      const { videoUrl } = await response.json();
      if (videoUrl) await handleSendMessage('', undefined, videoUrl);
      else throw new Error('No video URL returned');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to upload video');
    } finally {
      setUploadingVideo(false);
    }
  };

  const uploadAndSendAudio = async (uri: string) => {
    if (!selectedMatch || !user) return;
    setUploadingAudio(true);
    try {
      const token = await getToken();
      if (!token?.trim()) throw new Error('Session expired. Please log in again.');
      const filename = uri.split('/').pop() || 'voice.m4a';
      const formData = new FormData();
      formData.append('audio', { uri, type: 'audio/mp4', name: filename } as any);
      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      const response = await fetch(`${API_URL}/api/matches/${selectedMatch.id}/messages/upload-audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed: ${response.status}`);
      }
      const { audioUrl } = await response.json();
      if (audioUrl) await handleSendMessage('', undefined, undefined, audioUrl);
      else throw new Error('No audio URL returned');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to upload voice message');
    } finally {
      setUploadingAudio(false);
    }
  };

  const stopVoiceRecordingAndSend = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecordingVoice(false);
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (uri) await uploadAndSendAudio(uri);
    } catch (e) {
      Alert.alert('Error', 'Failed to save recording');
    }
  }, [selectedMatch, user]);

  const cancelVoiceRecording = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecordingVoice(false);
    if (rec) {
      try { await rec.stopAndUnloadAsync(); } catch (_) {}
    }
  }, []);

  const handleUnmatch = useCallback(async (matchId: string) => {
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
              
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to unmatch');
            }
          },
        },
      ]
    );
  }, [selectedMatch]);

  // Memoize getMatchPhoto to avoid recalculating
  const getMatchPhoto = useCallback((match: Match) => {
    if (match.stage === 'stage2' && match.otherUser.photos?.length) {
      const primaryPhoto = match.otherUser.photos.find((p) => p.isPrimary) || match.otherUser.photos[0];
      return primaryPhoto?.url || null;
    }
    return match.otherUser.photoUrl || null;
  }, []);

  // All hooks must be called before any early returns (Rules of Hooks)
  const getStageBadgeStyle = useCallback((stage: string) => {
    switch (stage) {
      case 'stage2':
        return styles.stageBadgeStage2;
      case 'stage1':
        return styles.stageBadgeStage1;
      default:
        return styles.stageBadgePending;
    }
  }, []);

  const getStageEmoji = useCallback((stage: string) => {
    switch (stage) {
      case 'stage2':
        return '💕';
      case 'stage1':
        return '💖';
      default:
        return '💌';
    }
  }, []);

  const handleStageInfoPress = useCallback((stage: 'stage1' | 'stage2') => {
    setStageInfoStage(stage);
    setStageInfoModalVisible(true);
  }, []);

  // When tab is not focused, render minimal view so leaving Matches tab is instant
  if (!isFocused) {
    return <View style={{ flex: 1 }} />;
  }

  // Show loading while auth is initializing or matches are loading (only when not in a conversation—
  // when selectedMatch is set, refetches run in background and must not hide chat/input)
  if (authLoading || (loading && !selectedMatch)) {
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

  if (!selectedMatch) {
    return (
      <View style={styles.container}>
        <AnimatedHeaderGradient matchesCount={visibleMatches.length} gradientPos={headerGradientPos}>
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <AnimatedHeartEmoji />
              <Text style={styles.headerTitle}> Your Matches</Text>
            </View>
            <Text style={styles.headerSubtitle}>{visibleMatches.length} {visibleMatches.length === 1 ? 'match' : 'matches'}</Text>
          </View>
        </AnimatedHeaderGradient>
        {visibleMatches.length === 0 ? (
          <EmptyStateAnimated navigation={navigation} />
        ) : (
          <FlatList
            data={visibleMatches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.matchesList, { paddingBottom: 100 }]}
            ListFooterComponent={<LegalFooter />}
            // Performance optimizations
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={10}
            windowSize={10}
            getItemLayout={(data, index) => ({
              length: 120, // Approximate height of match card
              offset: 120 * index,
              index,
            })}
            renderItem={({ item, index }) => {
              const photoUrl = getMatchPhoto(item);
              
              return (
                <MatchCardAnimated 
                  item={item} 
                  index={index} 
                  photoUrl={photoUrl} 
                  getTimeRemaining={getTimeRemaining}
                  formatLastActive={formatLastActive}
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
                  onStagePress={handleStageInfoPress}
                />
              );
            }}
          />
        )}
        {/* Stage Info Modal - also in list view so tapping Level 1/2 on a card shows it */}
        <Modal
          visible={stageInfoModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setStageInfoModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.stageInfoOverlay}
            onPress={() => setStageInfoModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.stageInfoCard}>
              <LinearGradient
                colors={stageInfoStage === 'stage2' ? ['#ff85b3', '#ff4d94', '#e91e8c'] : ['#ff6b9d', '#ff4081', '#ff80ab', '#ff1493']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.stageInfoCardGradient}
              >
                <View style={styles.stageInfoIconRing}>
                  <Text style={styles.stageInfoBigEmoji}>{stageInfoStage === 'stage1' ? '💖' : '💕'}</Text>
                </View>
                <Text style={styles.stageInfoTitle}>
                  {stageInfoStage === 'stage1' ? 'Level 1' : 'Level 2'}
                </Text>
                <Text style={styles.stageInfoSubtitle}>
                  {stageInfoStage === 'stage1' ? 'Primary photo revealed' : 'All photos unlocked'}
                </Text>
                <View style={styles.stageInfoDivider} />
                <Text style={styles.stageInfoBody}>
                  {stageInfoStage === 'stage1'
                    ? 'You can see each other\'s primary profile picture. Chat and send at least 2 messages each to unlock Level 2 and see all photos.'
                    : 'You\'ve both sent 2+ messages! All profile photos are now visible to each other.'}
                </Text>
                <TouchableOpacity
                  style={styles.stageInfoCloseBtn}
                  onPress={() => setStageInfoModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#fff', '#f8f8ff']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.stageInfoCloseBtnGradient}
                  >
                    <Text style={styles.stageInfoCloseText}>Got it</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: windowWidth, maxWidth: windowWidth, overflow: 'hidden', alignSelf: 'center' }]}>
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.chatHeaderGradient,
          isSmallScreen && {
            paddingTop: Platform.OS === 'ios' ? Math.max(insets.top, 12) + 4 : 12,
          },
        ]}
      >
        <View style={[styles.chatHeader, isSmallScreen && { padding: 10, paddingBottom: 8 }]}>
          {/* Top row: Back | Photo | Name */}
          <View style={[styles.chatHeaderTopRow, isSmallScreen && { marginBottom: 6 }]}>
            <TouchableOpacity
              onPress={() => {
                console.log('🔙 Back button TOUCHED');
                setFullScreenImageUrl(null);
                setShowProfileModal(false);
                navigation.setParams({ matchId: undefined });
                setMessages([]);
                setSelectedMatch(null);
              }}
              style={styles.chatHeaderBackTouch}
              activeOpacity={0.7}
            >
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowProfileModal(true)}
              activeOpacity={0.8}
              style={styles.chatHeaderPhotoTouch}
            >
              {(() => {
                const chatPhotoUrl = getMatchPhoto(selectedMatch);
                const photoUri = chatPhotoUrl ? getPhotoUrl(chatPhotoUrl) : null;
                const photoStyle = isSmallScreen ? { width: 46, height: 46, borderRadius: 23, borderWidth: 2 } : undefined;
                return photoUri ? (
                  <OptimizedImage
                    source={chatPhotoUrl}
                    style={[styles.chatHeaderPhoto, photoStyle]}
                    resizeMode="cover"
                    showLoadingIndicator={false}
                  />
                ) : (
                  <LinearGradient
                    colors={['#667eea', '#764ba2', '#f093fb']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.chatHeaderPhotoPlaceholder, photoStyle]}
                  >
                    <Text style={[styles.chatHeaderPhotoPlaceholderText, isSmallScreen && { fontSize: 20 }]} numberOfLines={1}>
                      {selectedMatch.otherUser.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                );
              })()}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowProfileModal(true)}
              activeOpacity={0.8}
              style={styles.chatHeaderTitleTouch}
            >
              <Text style={[styles.chatHeaderTitle, isSmallScreen && { fontSize: 16 }]} numberOfLines={1} ellipsizeMode="tail">{selectedMatch.otherUser.displayName}</Text>
            </TouchableOpacity>
          </View>
          {/* Bottom row: stacked pills (age, level, compatibility) + game icons */}
          <View style={[styles.chatHeaderBottomRow, isSmallScreen && { gap: 6 }]}>
            <View style={[styles.chatHeaderPillRow, isSmallScreen && { gap: 4 }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowAgeCardModal(true)}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatHeaderAgePill}
                >
                  <Text style={styles.chatHeaderAgePillIcon}>🎂</Text>
                  <Text style={styles.chatHeaderAgePillText}>{selectedMatch.otherUser.age}</Text>
                  <Text style={styles.chatHeaderAgePillLabel}>yrs</Text>
                </LinearGradient>
              </TouchableOpacity>
              {selectedMatch.stage === 'pending' ? (
                <View style={styles.chatHeaderStagePillWrap}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.12)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chatHeaderStagePill}
                  >
                    <Text style={styles.chatHeaderStagePillText}>Pending</Text>
                  </LinearGradient>
                </View>
              ) : (selectedMatch.stage === 'stage1' || selectedMatch.stage === 'stage2') ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleStageInfoPress(selectedMatch.stage as 'stage1' | 'stage2')}
                  style={[styles.chatHeaderStagePillWrap, selectedMatch.stage === 'stage1' && styles.chatHeaderStagePillWrapStage1]}
                >
                  <LinearGradient
                    colors={selectedMatch.stage === 'stage2' ? ['#ff85b3', '#ff4d94'] : ['#ff80ab', '#ff4081', '#ff80ab']}
                    locations={selectedMatch.stage === 'stage1' ? [0, 0.5, 1] : undefined}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.chatHeaderStagePill, selectedMatch.stage === 'stage2' && styles.chatHeaderStagePillStage2, selectedMatch.stage === 'stage1' && styles.chatHeaderStagePillStage1]}
                  >
                    {selectedMatch.stage === 'stage1' && (
                      <LinearGradient
                        colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
                        style={styles.chatHeaderStagePillGloss}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                      />
                    )}
                    <Text style={styles.chatHeaderStagePillEmoji}>{selectedMatch.stage === 'stage1' ? '💖' : '💕'}</Text>
                    <Text style={[styles.chatHeaderStagePillText, selectedMatch.stage === 'stage2' && styles.chatHeaderStagePillTextStage2, selectedMatch.stage === 'stage1' && styles.chatHeaderStagePillTextStage1]}>
                      {selectedMatch.stage === 'stage1' ? 'Level 1' : 'Level 2'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <View style={styles.chatHeaderStagePillWrap}>
                  <LinearGradient colors={['#ff85b3', '#ff4d94']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chatHeaderStagePill, styles.chatHeaderStagePillStage2]}>
                    <Text style={styles.chatHeaderStagePillEmoji}>💕</Text>
                    <Text style={[styles.chatHeaderStagePillText, styles.chatHeaderStagePillTextStage2]}>Level 2</Text>
                  </LinearGradient>
                </View>
              )}
              {profileCompatibility != null && selectedMatch.stage !== 'pending' && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowCompatibilityCardModal(true)}
                  style={styles.chatHeaderCompatibilityBadgeWrap}
                >
                  <LinearGradient
                    colors={
                      profileCompatibility >= 80 ? ['#ff6b9d', '#c44569', '#f093fb'] :
                      profileCompatibility >= 60 ? ['#667eea', '#764ba2', '#a855f7'] :
                      ['#6366f1', '#8b5cf6', '#a78bfa']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chatHeaderCompatibilityBadge}
                  >
                    <Text style={styles.chatHeaderCompatibilityIcon}>💕</Text>
                    <Text style={styles.chatHeaderCompatibilityText}>{profileCompatibility}%</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
            {selectedMatch.stage !== 'pending' && (
              <View style={styles.chatHeaderActionsRow}>
                <TruthOrDare
                    matchId={selectedMatch.id}
                    messages={messages}
                    currentUserId={user?.id || ''}
                    socket={socketRef.current}
                    onSendToChat={(text) => { handleSendMessage(text); }}
                    onRequestGame={async () => {
                      try {
                        await api.post(`/matches/${selectedMatch.id}/game-request`, { gameType: 'truth_or_dare' });
                        Alert.alert('Request sent!', 'Waiting for them to accept. You\'ll be notified when they do.');
                      } catch (e: any) {
                        Alert.alert('Error', e?.message || 'Failed to send game request');
                      }
                    }}
                    onBeforeUnlockPrompt={async () => {
                      const matches = await fetchMatches();
                      const m = matches.find(mm => mm.id === selectedMatch.id);
                      if (m?.gameUnlocks?.truth_or_dare) {
                        setSelectedMatch(m);
                        return true;
                      }
                      return false;
                    }}
                    onUnlockWithToken={async () => {
                      await api.post(`/matches/${selectedMatch.id}/unlock-game`, { gameType: 'truth_or_dare' });
                      api.clearCache('/matches');
                      api.clearCache('/tokens');
                      setSelectedMatch(prev => prev ? { ...prev, gameUnlocks: { ...(prev.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), truth_or_dare: true } } : null);
                      setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, gameUnlocks: { ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), truth_or_dare: true } } : m));
                    }}
                    openForAccept={openGameForAccept?.gameType === 'truth_or_dare' && openGameForAccept?.matchId === selectedMatch.id}
                    onOpenedForAccept={() => setOpenGameForAccept(null)}
                    gameUnlockedByToken={selectedMatch.gameUnlocks?.truth_or_dare}
                    headerMode
                  />
                  <NeverHaveIEver
                    matchId={selectedMatch.id}
                    messages={messages}
                    currentUserId={user?.id || ''}
                    socket={socketRef.current}
                    onBeforeUnlockPrompt={async () => {
                      const matches = await fetchMatches();
                      const m = matches.find(mm => mm.id === selectedMatch.id);
                      if (m?.gameUnlocks?.never_have_i_ever) {
                        setSelectedMatch(m);
                        return true;
                      }
                      return false;
                    }}
                    onUnlockWithToken={async () => {
                      await api.post(`/matches/${selectedMatch.id}/unlock-game`, { gameType: 'never_have_i_ever' });
                      api.clearCache('/matches');
                      api.clearCache('/tokens');
                      setSelectedMatch(prev => prev ? { ...prev, gameUnlocks: { ...(prev.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), never_have_i_ever: true } } : null);
                      setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, gameUnlocks: { ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), never_have_i_ever: true } } : m));
                    }}
                    openForAccept={openGameForAccept?.gameType === 'never_have_i_ever' && openGameForAccept?.matchId === selectedMatch.id}
                    onOpenedForAccept={() => setOpenGameForAccept(null)}
                    gameUnlockedByToken={selectedMatch.gameUnlocks?.never_have_i_ever}
                    headerMode
                  />
                  <DateBlueprint
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
                    currentUserId={user?.id || ''}
                    headerMode
                    onInviteToChat={(text) => handleSendMessage(text)}
                  />
                  <CompatibilityPulse matchId={selectedMatch.id} socket={socketRef.current} isFocused={isFocused} />
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
      
      {/* Age card popup - fun message when tapping the age pill */}
      <Modal
        visible={showAgeCardModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAgeCardModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.ageCardOverlay}
          onPress={() => setShowAgeCardModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => setShowAgeCardModal(false)} style={styles.ageCardTouchable}>
            <LinearGradient
              colors={['#667eea', '#764ba2', '#f093fb', '#f5576c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ageCardGradient}
            >
              <Text style={styles.ageCardEmoji}>✨</Text>
              <Text style={styles.ageCardTitle}>Age is just a number</Text>
              <Text style={styles.ageCardBody}>
                …but connection is timeless. Here's to finding someone who makes every moment count—whether you're sharing laughs, dreams, or the last slice of pizza.
              </Text>
              <Text style={styles.ageCardHint}>Tap anywhere to close</Text>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Compatibility card popup - tap the % badge to see why you match; scrollable so user can read all info */}
      <Modal
        visible={showCompatibilityCardModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompatibilityCardModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.ageCardOverlay}
          onPress={() => setShowCompatibilityCardModal(false)}
        >
          <View style={styles.compatCardTouchable}>
            <LinearGradient
              colors={profileCompatibility != null && profileCompatibility >= 80
                ? ['#ff6b9d', '#c44569', '#f093fb', '#ff8a80']
                : ['#667eea', '#764ba2', '#a855f7', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.compatCardGradient}
            >
              <ScrollView
                style={styles.compatCardScroll}
                contentContainerStyle={styles.compatCardScrollContent}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.compatCardEmoji}>💕</Text>
                <Text style={styles.compatCardTitle}>
                  {profileCompatibility != null ? `${profileCompatibility}%` : ''} Profile Match
                </Text>
                <Text style={styles.compatCardSubtitle}>
                  Based on interests, values, lifestyle & what you're looking for
                </Text>
                {(compatibilityDetails?.reasons?.length ?? 0) > 0 && (
                  <View style={styles.compatCardReasons}>
                    {compatibilityDetails!.reasons.map((reason, i) => (
                      <View key={i} style={styles.compatCardReasonRow}>
                        <Text style={styles.compatCardReasonBullet}>✓</Text>
                        <Text style={styles.compatCardReasonText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {(compatibilityDetails?.sharedInterests?.length ?? 0) > 0 && (
                  <View style={styles.compatCardSection}>
                    <Text style={styles.compatCardSectionTitle}>Shared interests</Text>
                    <Text style={styles.compatCardSectionText}>
                      {compatibilityDetails!.sharedInterests.join(', ')}
                    </Text>
                  </View>
                )}
                {(compatibilityDetails?.sharedValues ?? 0) > 0 && (
                  <Text style={styles.compatCardValues}>
                    {compatibilityDetails!.sharedValues} shared value{compatibilityDetails!.sharedValues !== 1 ? 's' : ''}
                  </Text>
                )}
                {(!compatibilityDetails?.reasons?.length && !compatibilityDetails?.sharedInterests?.length && !(compatibilityDetails?.sharedValues ?? 0)) && (
                  <Text style={styles.compatCardEmpty}>
                    You're a solid match based on your profiles—keep the conversation going!
                  </Text>
                )}
                <Text style={styles.ageCardHint}>Tap outside to close</Text>
              </ScrollView>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Modal - when user taps photo we close this and show full-screen image so only one modal is visible */}
      {showProfileModal && selectedMatch && (
        <MatchProfileModal
          match={selectedMatch}
          visible={showProfileModal}
          onClose={() => {
            setShowProfileModal(false);
            setFullScreenImageUrl(null);
            setFullScreenPhotoList(null);
          }}
          onPhotoPress={(url, allUrls, index) => {
            fullScreenOpenedFromProfileCardRef.current = true;
            setShowProfileModal(false);
            setFullScreenImageUrl(url);
            setFullScreenPhotoList(allUrls && allUrls.length > 1 ? allUrls : null);
            setFullScreenPhotoIndex(typeof index === 'number' ? index : 0);
          }}
        />
      )}

      {/* Full-screen image viewer - if opened from profile card, tap to close returns to profile card; Level 2: swipe or tap left/right to view all photos */}
      <Modal
        visible={!!fullScreenImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => {
          const fromProfile = fullScreenOpenedFromProfileCardRef.current;
          setFullScreenImageUrl(null);
          setFullScreenPhotoList(null);
          fullScreenOpenedFromProfileCardRef.current = false;
          if (fromProfile) setShowProfileModal(true);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' }}>
          {fullScreenPhotoList && fullScreenPhotoList.length > 1 ? (
            <>
              <FlatList
                data={fullScreenPhotoList}
                keyExtractor={(uri, idx) => `${idx}-${(uri || '').slice(-20)}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={Math.min(Math.max(0, fullScreenPhotoIndex), fullScreenPhotoList.length - 1)}
                getItemLayout={(_: any, index: number) => ({
                  length: windowWidth,
                  offset: windowWidth * index,
                  index,
                })}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
                  if (idx >= 0 && idx < fullScreenPhotoList.length) setFullScreenPhotoIndex(idx);
                }}
                renderItem={({ item: uri }) => (
                  <TouchableOpacity
                    activeOpacity={1}
                    style={{ width: windowWidth, flex: 1, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => {
                      const fromProfile = fullScreenOpenedFromProfileCardRef.current;
                      setFullScreenImageUrl(null);
                      setFullScreenPhotoList(null);
                      fullScreenOpenedFromProfileCardRef.current = false;
                      if (fromProfile) setShowProfileModal(true);
                    }}
                  >
                    <OptimizedImage
                      source={uri}
                      style={{ width: windowWidth, height: windowHeight * 0.8 }}
                      resizeMode="contain"
                      showLoadingIndicator={false}
                    />
                  </TouchableOpacity>
                )}
              />
              <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                  <Text style={{ color: '#fff', fontSize: 14 }}>
                    {fullScreenPhotoIndex + 1} / {fullScreenPhotoList.length}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={1}
              style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
              onPress={() => {
                const fromProfile = fullScreenOpenedFromProfileCardRef.current;
                setFullScreenImageUrl(null);
                setFullScreenPhotoList(null);
                fullScreenOpenedFromProfileCardRef.current = false;
                if (fromProfile) setShowProfileModal(true);
              }}
            >
              {fullScreenImageUrl ? (
                <OptimizedImage
                  source={fullScreenImageUrl}
                  style={{ width: windowWidth, height: windowHeight * 0.8 }}
                  resizeMode="contain"
                  showLoadingIndicator={false}
                />
              ) : null}
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      {/* Photo guidelines - shown when user taps camera icon before send photo/video/voice options */}
      <Modal
        visible={showPhotoGuidelinesModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPhotoGuidelinesModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.photoGuidelinesOverlay}
          onPress={() => setShowPhotoGuidelinesModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.photoGuidelinesCard}>
            <LinearGradient
              colors={['#4a4a4a', '#2d2d2d', '#1a1a1a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.photoGuidelinesCardGradient}
            >
              <Text style={styles.photoGuidelinesEmoji}>⚠️</Text>
              <Text style={styles.photoGuidelinesTitle}>Keep it appropriate</Text>
              <Text style={styles.photoGuidelinesBody}>
                Don&apos;t be dumb. F**k around and get banned.
              </Text>
              <Text style={styles.photoGuidelinesSubtext}>
                Inappropriate photos can get you permanently banned from Mulligan.
              </Text>
              <TouchableOpacity
                style={styles.photoGuidelinesButton}
                onPress={() => {
                  setShowPhotoGuidelinesModal(false);
                  handleSendPhoto();
                }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoGuidelinesButtonGradient}
                >
                  <Text style={styles.photoGuidelinesButtonText}>Got it</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Game Request Modal - when User B receives invite */}
      <GameRequestModal
        visible={!!gameRequestToShow}
        request={gameRequestToShow}
        onClose={() => setGameRequestToShow(null)}
        onAccepted={(matchId, gameType) => {
          setGameRequestToShow(null);
          const gameKey = gameType === 'truth_or_dare' ? 'truth_or_dare' : 'never_have_i_ever';
          const m = matches.find(x => x.id === matchId);
          if (m) {
            const updated = { ...m, gameUnlocks: { ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }), [gameKey]: true } };
            setSelectedMatch(updated);
            setMatches(prev => prev.map(x => x.id === matchId ? updated : x));
          }
          setOpenGameForAccept({ matchId, gameType });
        }}
      />

      {/* Match Celebration - when User B opens app from match notification (push or in-app) */}
      {(() => {
        const rp = route.params as { showMatchCelebration?: boolean; matchId?: string; matchName?: string } | undefined;
        const celebrationMatchId = rp?.showMatchCelebration ? rp?.matchId : undefined;
        const celebrationMatch = celebrationMatchId ? matches.find(m => m.id === celebrationMatchId) : null;
        return celebrationMatchId ? (
          <MatchCelebration
            profileName={rp?.matchName || celebrationMatch?.otherUser?.displayName || 'Someone'}
            photoUrl={
              celebrationMatch?.otherUser?.photoUrl
                ? getPhotoUrl(celebrationMatch.otherUser.photoUrl)
                : celebrationMatch?.otherUser?.photos?.[0]?.url
                ? getPhotoUrl(celebrationMatch.otherUser.photos[0].url)
                : undefined
            }
            matchId={celebrationMatchId}
            onClose={() => {
              navigation.setParams({ matchId: undefined, showMatchCelebration: undefined, matchName: undefined });
              const m = matches.find(x => x.id === celebrationMatchId);
              if (m) setSelectedMatch(m);
            }}
          />
        ) : null;
      })()}

      {/* Stage Info Modal - explains Level 1 / Level 2 */}
      <Modal
        visible={stageInfoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setStageInfoModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.stageInfoOverlay}
          onPress={() => setStageInfoModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.stageInfoCard}>
            <LinearGradient
              colors={stageInfoStage === 'stage2' ? ['#ff85b3', '#ff4d94', '#e91e8c'] : ['#ff6b9d', '#ff4081', '#ff80ab', '#ff1493']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.stageInfoCardGradient}
            >
              <View style={styles.stageInfoIconRing}>
                <Text style={styles.stageInfoBigEmoji}>{stageInfoStage === 'stage1' ? '💖' : '💕'}</Text>
              </View>
              <Text style={styles.stageInfoTitle}>
                {stageInfoStage === 'stage1' ? 'Level 1' : 'Level 2'}
              </Text>
              <Text style={styles.stageInfoSubtitle}>
                {stageInfoStage === 'stage1' ? 'Primary photo revealed' : 'All photos unlocked'}
              </Text>
              <View style={styles.stageInfoDivider} />
              <Text style={styles.stageInfoBody}>
                {stageInfoStage === 'stage1'
                  ? 'You can see each other\'s primary profile picture. Chat and send at least 2 messages each to unlock Level 2 and see all photos.'
                  : 'You\'ve both sent 2+ messages! All profile photos are now visible to each other.'}
              </Text>
              <TouchableOpacity
                style={styles.stageInfoCloseBtn}
                onPress={() => setStageInfoModalVisible(false)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#fff', '#f8f8ff']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.stageInfoCloseBtnGradient}
                >
                  <Text style={styles.stageInfoCloseText}>Got it</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* New Features: Mulligan Moments - fixed at top (Date Blueprint moved to header) */}
      {selectedMatch && selectedMatch.stage !== 'pending' && (
        <View style={[styles.featuresContainer, { maxHeight: Math.min(200, windowHeight * 0.32) }]}>
          <MulliganMoments 
            matchId={selectedMatch.id} 
            socket={socketRef.current}
            compact
            onStarterGenerated={(starter) => {
              setNewMessage(starter);
              if (textInputRef.current) {
                textInputRef.current.focus();
              }
            }}
          />
        </View>
      )}

      <Animated.View 
        style={[
          styles.chatMessagesWrapper,
          {
            opacity: chatFadeAnim,
            paddingBottom: effectiveKeyboardHeight > 0
              ? effectiveKeyboardHeight + 72
              : (Platform.OS === 'ios' ? 56 + Math.round(insets.bottom * 0.5) : 56 + 56) + 72,
          },
        ]}
      >
        <FlatList
          ref={messagesEndRef}
          data={invertedMessages}
          inverted
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={messagesContentStyle}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
          scrollEnabled={true}
          maxToRenderPerBatch={50}
          updateCellsBatchingPeriod={50}
          initialNumToRender={50}
          windowSize={15}
          removeClippedSubviews={false}
          onContentSizeChange={scrollToEndDebounced}
          onLayout={scrollToEndOnLayout}
          onScrollToIndexFailed={onScrollToIndexFailed}
          renderItem={renderMessageItem}
          extraData={messages.length}
          ListHeaderComponent={listHeaderComponent}
        />
      </Animated.View>

      {messageLikedToast ? (
        <View style={styles.messageLikedToast} pointerEvents="none">
          <Text style={styles.messageLikedToastText}>❤️ {messageLikedToast.likerName} loved your message</Text>
        </View>
      ) : null}

        <Animated.View 
          style={[
            styles.inputContainer,
            {
              position: 'absolute',
              bottom: effectiveKeyboardHeight > 0
                ? effectiveKeyboardHeight
                : Platform.OS === 'ios'
                  ? 56 + Math.round(insets.bottom * 0.5)
                  : 56 + 56, // Android: extra offset so input sits above tab bar (tab bar has marginBottom + height)
              left: 0,
              right: 0,
              width: windowWidth,
              maxWidth: windowWidth,
              paddingHorizontal: 12,
              zIndex: 1000,
              elevation: 10,
              opacity: chatFadeAnim,
            }
          ]}
          pointerEvents="box-none"
          collapsable={false}
        >
          {isRecordingVoice ? (
            <View style={[styles.pendingImagePreview, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }]}>
              <Text style={{ color: '#666', fontSize: 14 }}>Recording... Tap Stop to send</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={cancelVoiceRecording} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                  <Text style={{ color: '#e53e3e', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={stopVoiceRecordingAndSend} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#667eea', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Stop & Send</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {pendingImageUri ? (
            <View style={styles.pendingImagePreview}>
              <Image source={{ uri: pendingImageUri }} style={styles.pendingImageThumb} />
              <TouchableOpacity
                onPress={() => setPendingImageUri(null)}
                style={styles.pendingImageRemove}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.pendingImageRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {pendingVideoUri ? (
            <View style={styles.pendingImagePreview}>
              <Text style={{ color: '#667eea', fontSize: 14 }}>Video attached</Text>
              <TouchableOpacity
                onPress={() => setPendingVideoUri(null)}
                style={styles.pendingImageRemove}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.pendingImageRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {(uploadingImage || uploadingVideo || uploadingAudio) ? (
            <View style={styles.sendingMediaBar}>
              <ActivityIndicator size="small" color="#667eea" />
              <Text style={styles.sendingMediaText}>
                {uploadingImage ? 'Sending photo...' : uploadingVideo ? 'Sending video...' : 'Sending voice...'}
              </Text>
            </View>
          ) : null}
          <TouchableWithoutFeedback
            onPress={() => textInputRef.current?.focus()}
            accessible={false}
          >
            <View style={styles.inputWrapper}>
              <TouchableOpacity
                onPress={() => setShowPhotoGuidelinesModal(true)}
                disabled={sendingMessage || uploadingImage || uploadingVideo || uploadingAudio}
                style={styles.photoButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {uploadingImage || uploadingVideo || uploadingAudio ? (
                  <ActivityIndicator size="small" color="#667eea" />
                ) : (
                  <Text style={styles.photoButtonIcon}>📷</Text>
                )}
              </TouchableOpacity>
              <TextInput
                ref={textInputRef}
                style={styles.input}
                value={newMessage}
                onChangeText={handleTextChange}
                onFocus={() => {
                  setTimeout(() => scrollToLatestMessageRef.current(), 100);
                  setTimeout(() => scrollToLatestMessageRef.current(), 350);
                }}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                multiline
                maxLength={500}
                editable={!sendingMessage}
                showSoftInputOnFocus={true}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (newMessage.trim() && !sendingMessage) handleSendMessage(newMessage.trim());
                }}
                onKeyPress={handleKeyPress}
              />
            </View>
          </TouchableWithoutFeedback>
          <TouchableOpacity
            onPress={async () => {
              if (sendingMessage || uploadingImage || uploadingVideo || uploadingAudio) return;
              if (pendingImageUri) {
                const uri = pendingImageUri;
                setPendingImageUri(null);
                await uploadAndSendImage(uri);
              } else if (pendingVideoUri) {
                const uri = pendingVideoUri;
                setPendingVideoUri(null);
                await uploadAndSendVideo(uri);
              } else if (newMessage.trim()) {
                handleSendMessage(newMessage.trim());
              }
            }}
            disabled={sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || (!newMessage.trim() && !pendingImageUri && !pendingVideoUri)}
            style={styles.sendButtonContainer}
            activeOpacity={0.7}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <LinearGradient
              colors={sendingMessage || (!newMessage.trim() && !pendingImageUri && !pendingVideoUri) ? ['#a0aec0', '#718096'] : ['#667eea', '#764ba2', '#f093fb']}
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
  animatedHeartContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedHeartGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff1493',
    shadowColor: '#ff1493',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 0,
  },
  animatedHeartGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#ff1493',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1,
    overflow: 'hidden',
  },
  animatedHeartShimmer: {
    position: 'absolute',
    width: '200%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ rotate: '15deg' }],
  },
  animatedHeartEmoji: {
    fontSize: 28,
    lineHeight: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    zIndex: 2,
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
  browseButtonInner: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 25,
    minHeight: 56,
  },
  browseButtonShimmer: {
    position: 'absolute',
    top: -20,
    left: 0,
    bottom: -20,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginLeft: 6,
    alignSelf: 'center',
  },
  unreadLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22c55e',
    marginLeft: 4,
    letterSpacing: 0.2,
  },
  matchAge: {
    fontSize: 17,
    color: '#666',
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  activeStatusText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '600',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  matchCardCompatibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(139, 21, 56, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(139, 21, 56, 0.25)',
  },
  matchCardCompatibilityIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  matchCardCompatibilityText: {
    fontSize: 12,
    color: '#8B1538',
    fontWeight: '700',
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
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#ff4081',
    shadowOpacity: 0.45,
    shadowRadius: 8,
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
  stageTextStage1: {
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
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
    flexDirection: 'column',
    padding: 16,
    paddingBottom: 14,
  },
  chatHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  chatHeaderBackTouch: {
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
  chatHeaderPhotoTouch: {
    marginRight: 12,
    flexShrink: 0,
  },
  chatHeaderPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  chatHeaderPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderTitleTouch: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    flex: 1,
    minWidth: 0,
  },
  chatHeaderCompatibilityBadgeWrap: {
    marginLeft: 0,
    minWidth: 80,
    alignSelf: 'center',
  },
  chatHeaderCompatibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  chatHeaderCompatibilityIcon: {
    fontSize: 11,
    marginRight: 3,
  },
  chatHeaderCompatibilityText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    marginRight: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderCompatibilityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compatCardTouchable: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  compatCardGradient: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  compatCardScroll: {
    maxHeight: 420,
  },
  compatCardScrollContent: {
    paddingBottom: 8,
  },
  compatCardEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 8,
  },
  compatCardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  compatCardSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 16,
  },
  compatCardReasons: {
    marginBottom: 12,
  },
  compatCardReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  compatCardReasonBullet: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.95)',
    marginRight: 8,
  },
  compatCardReasonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  compatCardSection: {
    marginBottom: 12,
  },
  compatCardSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  compatCardSectionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  compatCardValues: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  compatCardEmpty: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 12,
  },
  chatHeaderBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  chatHeaderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  chatHeaderPillRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 0,
  },
  chatHeaderAgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 80,
  },
  chatHeaderAgePillIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  chatHeaderAgePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    marginRight: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderAgePillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ageCardOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ageCardTouchable: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  ageCardGradient: {
    padding: 28,
    alignItems: 'center',
  },
  ageCardEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  ageCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  ageCardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
  },
  ageCardHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 16,
  },
  chatHeaderStagePillWrap: {
    marginLeft: 0,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
    minWidth: 80,
    alignSelf: 'center',
  },
  chatHeaderStagePillWrapStage1: {
    shadowColor: '#ff4081',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  chatHeaderStagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    position: 'relative',
  },
  chatHeaderStagePillStage1: {
    borderColor: 'rgba(255,255,255,0.6)',
  },
  chatHeaderStagePillStage2: {
    borderColor: 'rgba(255,255,255,0.5)',
  },
  chatHeaderStagePillGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  chatHeaderStagePillEmoji: {
    fontSize: 11,
    marginRight: 3,
  },
  chatHeaderStagePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b84d6f',
    letterSpacing: 0.3,
  },
  chatHeaderStagePillTextStage1: {
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  chatHeaderStagePillTextStage2: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  chatHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  chatHeaderSubtitleInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatHeaderStageLink: {
    textDecorationLine: 'underline',
  },
  stageInfoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  stageInfoCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#ff1493',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  stageInfoCardGradient: {
    padding: 28,
    paddingTop: 32,
    paddingBottom: 28,
  },
  stageInfoIconRing: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  stageInfoBigEmoji: {
    fontSize: 36,
  },
  stageInfoTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  stageInfoSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stageInfoDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginBottom: 18,
    marginHorizontal: 8,
  },
  stageInfoBody: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  stageInfoCloseBtn: {
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  stageInfoCloseBtnGradient: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  stageInfoCloseText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 0.3,
  },
  photoGuidelinesOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  photoGuidelinesCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  photoGuidelinesCardGradient: {
    padding: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  photoGuidelinesEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  photoGuidelinesTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  photoGuidelinesBody: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 24,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  photoGuidelinesSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
    marginBottom: 22,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  photoGuidelinesButton: {
    alignSelf: 'center',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  photoGuidelinesButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 22,
  },
  photoGuidelinesButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    backgroundColor: '#f5f7fa',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  gamesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    paddingHorizontal: 4,
    marginTop: 12,
  },
  squareGameButton: {
    flex: 1,
    aspectRatio: 1,
    minHeight: 76,
    maxHeight: 104,
  },
  chatMessagesWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  messagesList: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  messagesContent: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 16,
    flexGrow: 1,
    width: '100%',
    maxWidth: '100%',
  },
  messageContainerOwn: {
    alignSelf: 'flex-end',
    marginBottom: 2,
    maxWidth: '85%',
  },
  messageContainerOther: {
    alignSelf: 'flex-start',
    marginBottom: 2,
    maxWidth: '85%',
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
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#e5e7eb',
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
  messageFooterOwn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  messageFooterOther: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  messageHeartOwn: {
    fontSize: 12,
  },
  messageHeartTouch: {
    padding: 4,
  },
  messageHeartOther: {
    fontSize: 14,
  },
  messageLikedToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignSelf: 'center',
    zIndex: 999,
    elevation: 999,
  },
  messageLikedToastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  messageStatusSent: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  messageStatusRead: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  typingIndicatorContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  typingBubble: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#667eea',
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
  pendingImagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  pendingImageThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  pendingImageRemove: {
    marginLeft: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingImageRemoveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sendingMediaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  sendingMediaText: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '600',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoButton: {
    padding: 8,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoButtonIcon: {
    fontSize: 24,
  },
  inputPressable: {
    flex: 1,
  },
  inputPlaceholder: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 8,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
  },
  inputPlaceholderText: {
    fontSize: 14,
    color: '#999',
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
  modalPhotoSwipeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
  },
  modalPhotoSwipeSide: {
    width: 56,
    height: 200,
  },
  modalPhotoSwipeCenter: {
    width: 200,
    height: 200,
  },
  modalPhotoTouchable: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
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
