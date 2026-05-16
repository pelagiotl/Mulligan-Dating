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
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { androidShellBackdropColors, androidShellTabBodyBg } from '../utils/androidConnectShellChrome';
import { getPhotoUrl } from '../utils/photoUrl';
import { getPendingOpenMatchId, clearPendingOpenMatchId } from '../utils/pendingMatchOpen';
import { getPendingGameRequest, clearPendingGameRequest, type PendingGameRequest } from '../utils/pendingGameRequest';
import { currentMatchIdRef } from '../utils/currentMatchView';
import { playMatchSound, playMessageSound } from '../utils/sounds';
import { navigationRef } from '../navigation/navigationRef';
import LegalFooter from '../components/LegalFooter';
import MulliganMoments from '../components/MulliganMoments';
import DateBlueprint from '../components/DateBlueprint';
import TruthOrDare, {
  truthOrDareMessageThresholdMet,
  truthOrDareMessageCounts,
  TRUTH_OR_DARE_MIN_EACH,
} from '../components/TruthOrDare';
import TruthOrDareMessageGateModal from '../components/TruthOrDareMessageGateModal';
import ChatMediaLockedGateModal from '../components/ChatMediaLockedGateModal';
import NeverHaveIEver from '../components/NeverHaveIEver';
import OptimizedImage from '../components/OptimizedImage';
import GameRequestModal from '../components/GameRequestModal';
import MatchCelebration from '../components/MatchCelebration';
import PhotoUnlockExplainerModal from '../components/PhotoUnlockExplainerModal';

/** Set to true to show the Never Have I Ever game card in match detail. */
const SHOW_NEVER_HAVE_I_EVER = true;

/** When media buttons are used before 3+3 message unlock (aligned with web). */
const CHAT_MEDIA_MIN_EACH = 3;
const CHAT_MEDIA_LOCKED_SUBTITLE =
  'Photos, video, and voice unlock after you and your match have each sent at least 3 messages in this chat.';
const CHAT_MEDIA_LOCKED_MODERATION =
  'Inappropriate photos, video, or voice can get you permanently banned from Mulligan. F**k around and get banned.';

/** Remove legacy profile-compatibility bullets (interest-only card). */
function filterInterestCompatReasons(reasons: string[]): string[] {
  return reasons.filter((line) => {
    const low = line.toLowerCase();
    if (low.includes('looking for the same thing')) return false;
    if (low.includes('similar lifestyle preferences')) return false;
    return true;
  });
}
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
    lookingFor?: string | null;
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

// Animated heart icon next to “Your Matches” (header) — Mulligan rose/maroon (soft) or pink/magenta (midnight), not cold blues
function AnimatedLinkHeaderIcon({ connectShell }: { connectShell: ConnectShellMode }) {
  const isMidnight = connectShell === 'midnight';
  const isSunny = connectShell === 'sunny';
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Continuous pulse animation (tighter on Android to avoid parent clipping)
    const pulseMax = Platform.OS === 'android' ? 1.08 : 1.14;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: pulseMax,
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
      collapsable={false}
    >
      {/* Glow behind icon */}
      <Animated.View
        style={[
          styles.animatedHeartGlow,
          isMidnight
            ? styles.animatedHeartGlowMidnight
            : isSunny
              ? styles.animatedHeartGlowSunny
              : styles.animatedHeartGlowSoft,
          Platform.OS === 'android' && { elevation: 0 },
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
        pointerEvents="none"
      />

      {/*
        Android: keep emoji OUTSIDE LinearGradient. expo-linear-gradient + borderRadius + elevation
        often clips children; sibling Text avoids the top of the heart being cut off.
      */}
      <View style={styles.animatedHeartBadgeWrap} collapsable={false}>
        <LinearGradient
          colors={
            isMidnight
              ? (['#fbcfe8', '#f472b6', '#c026d3'] as const)
              : isSunny
                ? (['#fed7aa', '#fb923c', '#ea580c'] as const)
                : (['#fecdd3', '#fb7185', '#be185d'] as const)
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            StyleSheet.absoluteFillObject,
            styles.animatedHeartGradientDisc,
            isMidnight
              ? styles.animatedHeartGradientMidnight
              : isSunny
                ? styles.animatedHeartGradientSunny
                : styles.animatedHeartGradientSoft,
            Platform.OS === 'android' && styles.animatedHeartGradientAndroidNoElevation,
          ]}
        >
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
        </LinearGradient>
        <Text
          style={[
            styles.animatedHeartEmoji,
            Platform.OS === 'android' && styles.animatedHeartEmojiAndroid,
          ]}
        >
          ❤️
        </Text>
      </View>
    </Animated.View>
  );
}

/** Safe area + room so the header heart / glow are not clipped (especially Android status bar + scale animation). */
function matchesHeaderPaddingTop(topInset: number): number {
  const minInset = Platform.OS === 'android' ? 10 : 12;
  const extra = Platform.OS === 'android' ? 14 : 10;
  return Math.max(topInset, minInset) + extra;
}

// Animated Header Gradient Component
function AnimatedHeaderGradient({
  children,
  matchesCount,
  gradientPos,
  shellBackdropColors,
}: {
  children: React.ReactNode;
  matchesCount: number;
  gradientPos?: Animated.Value;
  shellBackdropColors: readonly [string, string, ...string[]];
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      style={[styles.headerGradient, { paddingTop: matchesHeaderPaddingTop(insets.top), overflow: 'visible' }]}
    >
      <LinearGradient
        colors={[...shellBackdropColors]}
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
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
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
                  <Text style={styles.matchCardCompatibilityIcon}>🎯</Text>
                  <Text style={styles.matchCardCompatibilityText}>{item.profileCompatibility}%</Text>
                </View>
              )}
              {item.stage === 'pending' ? (
                <View style={styles.stageContainer}>
                  <LinearGradient
                    colors={['#fff5f8', '#ffeef7']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.stageBadge, getStageBadgeStyle(item.stage)]}
                  >
                    <Text style={styles.stageEmoji}>{getStageEmoji(item.stage)}</Text>
                    <Text style={styles.stageText}>Pending</Text>
                  </LinearGradient>
                </View>
              ) : null}
              {item.expiresAt && getTimeRemaining(item.expiresAt) ? (
                <Text style={styles.timerInline}>
                  ⏳ {getTimeRemaining(item.expiresAt)}
                </Text>
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
function EmptyStateAnimated({
  navigation,
  shellBackdropColors,
  shellIsMidnightAndroid,
}: {
  navigation: any;
  shellBackdropColors: readonly [string, string, ...string[]];
  shellIsMidnightAndroid?: boolean;
}) {
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
        colors={[...shellBackdropColors]}
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
      <Animated.Text style={[styles.emptyTitle, { opacity: fadeAnim }, shellIsMidnightAndroid && { color: '#f1f5f9' }]}>
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

/** Quick view profile sheet — Mulligan rose/maroon (soft) vs midnight pink/graphite; aligns with Connect shell. */
type QuickViewPalette = {
  overlayGradient: readonly [string, string, string];
  sheetBg: string;
  headerBg: string;
  headerBorder: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  accentMuted: string;
  tagBg: string;
  tagBorder: string;
  tagText: string;
  tagMutedBg: string;
  tagMutedBorder: string;
  tagMutedText: string;
  ringGradient: readonly [string, string, string];
  placeholderGradient: readonly [string, string, string];
  closeBg: string;
  closeBorder: string;
  closeText: string;
  photoBorder: string;
  thumbBorder: string;
  compatShadow: string;
};

function quickViewPalette(mode: ConnectShellMode): QuickViewPalette {
  if (mode === 'midnight') {
    return {
      overlayGradient: ['rgba(8, 6, 16, 0.94)', 'rgba(22, 16, 34, 0.92)', 'rgba(72, 28, 58, 0.88)'],
      sheetBg: '#14101c',
      headerBg: 'rgba(22, 18, 32, 0.98)',
      headerBorder: 'rgba(244, 114, 182, 0.20)',
      primaryText: '#f8fafc',
      secondaryText: '#cbd5e1',
      mutedText: '#94a3b8',
      cardBg: '#1c1726',
      cardBorder: 'rgba(244, 114, 182, 0.18)',
      accent: '#f472b6',
      accentMuted: 'rgba(244, 114, 182, 0.55)',
      tagBg: 'rgba(244, 63, 94, 0.16)',
      tagBorder: 'rgba(244, 114, 182, 0.32)',
      tagText: '#fecdd3',
      tagMutedBg: 'rgba(30, 27, 41, 0.9)',
      tagMutedBorder: 'rgba(148, 163, 184, 0.22)',
      tagMutedText: '#cbd5e1',
      ringGradient: ['#fbcfe8', '#f472b6', '#c026d3'],
      placeholderGradient: ['#9d174d', '#86198f', '#6b21a8'],
      closeBg: 'rgba(255, 255, 255, 0.08)',
      closeBorder: 'rgba(244, 114, 182, 0.28)',
      closeText: '#e2e8f0',
      photoBorder: 'rgba(255, 255, 255, 0.22)',
      thumbBorder: 'rgba(244, 114, 182, 0.35)',
      compatShadow: '#f472b6',
    };
  }
  if (mode === 'sunny') {
    return {
      overlayGradient: ['rgba(124, 45, 18, 0.88)', 'rgba(251, 146, 60, 0.74)', 'rgba(253, 224, 71, 0.38)'],
      sheetBg: '#fffbeb',
      headerBg: 'rgba(255, 251, 235, 0.96)',
      headerBorder: 'rgba(251, 146, 60, 0.24)',
      primaryText: '#431407',
      secondaryText: '#57534e',
      mutedText: '#78716c',
      cardBg: '#ffffff',
      cardBorder: 'rgba(251, 146, 60, 0.16)',
      accent: '#ea580c',
      accentMuted: 'rgba(234, 88, 12, 0.62)',
      tagBg: 'rgba(254, 215, 170, 0.48)',
      tagBorder: 'rgba(234, 88, 12, 0.24)',
      tagText: '#9a3412',
      tagMutedBg: 'rgba(255, 251, 235, 0.95)',
      tagMutedBorder: 'rgba(212, 212, 216, 0.45)',
      tagMutedText: '#57534e',
      ringGradient: ['#fed7aa', '#fb923c', '#ea580c'],
      placeholderGradient: ['#ea580c', '#c2410c', '#9a3412'],
      closeBg: 'rgba(255, 255, 255, 0.92)',
      closeBorder: 'rgba(251, 146, 60, 0.22)',
      closeText: '#57534e',
      photoBorder: '#ffffff',
      thumbBorder: 'rgba(251, 146, 60, 0.38)',
      compatShadow: '#fb923c',
    };
  }
  return {
    overlayGradient: ['rgba(76, 29, 46, 0.91)', 'rgba(76, 29, 120, 0.82)', 'rgba(236, 72, 153, 0.42)'],
    sheetBg: '#fffafb',
    headerBg: 'rgba(255, 253, 253, 0.96)',
    headerBorder: 'rgba(225, 29, 72, 0.14)',
    primaryText: '#1a1523',
    secondaryText: '#334155',
    mutedText: '#64748b',
    cardBg: '#ffffff',
    cardBorder: 'rgba(225, 29, 72, 0.11)',
    accent: '#be185d',
    accentMuted: 'rgba(190, 24, 93, 0.65)',
    tagBg: 'rgba(254, 205, 211, 0.42)',
    tagBorder: 'rgba(190, 24, 93, 0.22)',
    tagText: '#881337',
    tagMutedBg: 'rgba(248, 250, 252, 0.95)',
    tagMutedBorder: 'rgba(148, 163, 184, 0.35)',
    tagMutedText: '#475569',
    ringGradient: ['#fecdd3', '#fb7185', '#be185d'],
    placeholderGradient: ['#db2777', '#be185d', '#881337'],
    closeBg: 'rgba(255, 255, 255, 0.92)',
    closeBorder: 'rgba(225, 29, 72, 0.16)',
    closeText: '#57534e',
    photoBorder: '#ffffff',
    thumbBorder: 'rgba(255, 255, 255, 0.95)',
    compatShadow: '#be185d',
  };
}

// Match Profile Modal Component with Enhanced Animations
// When noModal is true, renders only the inner content (used inside a parent Modal to avoid double-modal flash)
function MatchProfileModal({ 
  match, 
  visible, 
  onClose,
  onPhotoPress,
  onReport,
  onBlock,
  noModal = false,
}: { 
  match: Match; 
  visible: boolean; 
  onClose: () => void;
  onPhotoPress?: (url: string, allUrls?: string[], index?: number) => void;
  onReport?: () => void;
  onBlock?: () => void;
  noModal?: boolean;
}) {
  const { otherUser } = match;
  const { user } = useAuth();
  const { mode: connectShellMode } = useConnectShellTheme();
  const insets = useSafeAreaInsets();
  const palette = useMemo(() => quickViewPalette(connectShellMode), [connectShellMode]);
  const quickViewSheetTop =
    Platform.OS === 'android' ? Math.max(insets.top, 8) + 8 : Math.max(insets.top, 14) + 28;
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

  // Current index when all photos unlocked and multiple (tap left/right to cycle)
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
  
  // Animations — entrance only (calmer than looping rings/sparkles)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const photoScale = useRef(new Animated.Value(0.92)).current;
  const photoOpacity = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 68,
          friction: 12,
          useNativeDriver: true,
        }),
        Animated.spring(photoScale, {
          toValue: 1,
          tension: 120,
          friction: 14,
          delay: 80,
          useNativeDriver: true,
        }),
        Animated.timing(photoOpacity, {
          toValue: 1,
          duration: 320,
          delay: 80,
          useNativeDriver: true,
        }),
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 420,
          delay: 140,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(Dimensions.get('window').height);
      photoScale.setValue(0.92);
      photoOpacity.setValue(0);
      contentFade.setValue(0);
    }
  }, [visible]);
  
  const overlayContent = (
      <Animated.View 
        style={[
          styles.modalOverlay,
          { opacity: fadeAnim }
        ]}
      >
        <LinearGradient
          colors={[...palette.overlayGradient]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY: slideAnim }],
              marginTop: quickViewSheetTop,
              backgroundColor: palette.sheetBg,
              borderTopLeftRadius: Platform.OS === 'android' ? 32 : 28,
              borderTopRightRadius: Platform.OS === 'android' ? 32 : 28,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: palette.cardBorder,
            },
          ]}
        >
          <ScrollView 
            style={[styles.modalScrollView, { backgroundColor: palette.sheetBg }]}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header with close button */}
            <View style={[styles.modalHeader, { backgroundColor: palette.headerBg, borderBottomColor: palette.headerBorder }]}>
              <View style={styles.modalHeaderTitles}>
                <Text style={[styles.modalTitleEyebrow, { color: palette.mutedText }]}>Quick view</Text>
                <Text style={[styles.modalTitle, { color: palette.primaryText }]}>Profile</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={styles.modalCloseButton}
                activeOpacity={0.7}
                accessibilityLabel="Close profile"
              >
                <View style={[styles.modalCloseButtonInner, { backgroundColor: palette.closeBg, borderColor: palette.closeBorder }]}>
                  <Text style={[styles.modalCloseText, { color: palette.closeText }]}>✕</Text>
                </View>
              </TouchableOpacity>
            </View>
            
            {/* Profile photo — framed hero, tap for full screen */}
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
                <LinearGradient
                  colors={[...palette.ringGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalPhotoFrameRing}
                  pointerEvents="none"
                />
                {onPhotoPress && !canSwipePhotos && mainPhotoUrl ? (
                  <TouchableOpacity
                    onPress={() => onPhotoPress(mainPhotoUrl, canSwipePhotos ? allPhotos.map(p => getPhotoUrl(p.url)) : undefined, canSwipePhotos ? mainPhotoIndex : undefined)}
                    activeOpacity={0.92}
                    style={styles.modalPhotoTouchable}
                    accessibilityLabel="View full size photo"
                  >
                    {mainPhotoUrl ? (
                      <OptimizedImage source={mainPhotoUrl} style={[styles.modalPhoto, { borderColor: palette.photoBorder }]} resizeMode="cover" showLoadingIndicator={false} />
                    ) : (
                      <LinearGradient
                        colors={[...palette.placeholderGradient]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.modalPhotoPlaceholder, { borderColor: palette.photoBorder }]}
                      >
                        <Text style={styles.modalPhotoPlaceholderText}>
                          {otherUser.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    <Text style={[styles.modalPhotoTapHint, { color: palette.mutedText }]}>Tap to expand</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.modalPhotoInnerClip}>
                    {mainPhotoUrl ? (
                      canSwipePhotos ? (
                        <View style={styles.modalPhotoSwipeContainer}>
                          <TouchableOpacity style={styles.modalPhotoSwipeSide} onPress={goPrevPhoto} activeOpacity={1} accessibilityLabel="Previous photo" />
                          <TouchableOpacity
                            style={[styles.modalPhotoSwipeCenter, { zIndex: 10, elevation: 10 }]}
                            onPress={() => onPhotoPress?.(mainPhotoUrl, allPhotos.map(p => getPhotoUrl(p.url)), mainPhotoIndex)}
                            activeOpacity={0.92}
                            accessibilityLabel="View full size photo"
                          >
                            <OptimizedImage source={mainPhotoUrl} style={[styles.modalPhoto, { borderColor: palette.photoBorder }]} resizeMode="cover" showLoadingIndicator={false} />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.modalPhotoSwipeSide} onPress={goNextPhoto} activeOpacity={1} accessibilityLabel="Next photo" />
                        </View>
                      ) : onPhotoPress ? (
                        <TouchableOpacity style={[styles.modalPhotoTouchable, { zIndex: 10, elevation: 10 }]} onPress={() => onPhotoPress(mainPhotoUrl, undefined, undefined)} activeOpacity={0.92} accessibilityLabel="View full size photo">
                          <OptimizedImage source={mainPhotoUrl} style={[styles.modalPhoto, { borderColor: palette.photoBorder }]} resizeMode="cover" showLoadingIndicator={false} />
                          <Text style={[styles.modalPhotoTapHint, { color: palette.mutedText }]}>Tap to expand</Text>
                        </TouchableOpacity>
                      ) : (
                        <OptimizedImage source={mainPhotoUrl} style={[styles.modalPhoto, { borderColor: palette.photoBorder }]} resizeMode="cover" showLoadingIndicator={false} />
                      )
                    ) : (
                      <LinearGradient
                        colors={[...palette.placeholderGradient]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.modalPhotoPlaceholder, { borderColor: palette.photoBorder }]}
                      >
                        <Text style={styles.modalPhotoPlaceholderText}>
                          {otherUser.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </LinearGradient>
                    )}
                    {canSwipePhotos && allPhotos.length > 1 ? (
                      <Text style={[styles.modalPhotoSwipeHint, { color: palette.mutedText }]}>Tap edges to browse photos</Text>
                    ) : null}
                  </View>
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
                <View
                  style={[
                    styles.modalCompatibilityCard,
                    {
                      backgroundColor: palette.cardBg,
                      borderColor: palette.cardBorder,
                      shadowColor: palette.compatShadow,
                    },
                  ]}
                >
                  <View style={[styles.modalCompatibilityAccent, { backgroundColor: palette.accent }]} />
                  <View style={styles.modalCompatibilityHeader}>
                    <Text style={[styles.modalCompatibilityEmoji, { color: palette.accent }]}>✦</Text>
                    <View style={styles.modalCompatibilityTitleContainer}>
                      <Text style={[styles.modalCompatibilityEyebrow, { color: palette.mutedText }]}>In common</Text>
                      <Text style={[styles.modalCompatibilityTitle, { color: palette.primaryText }]}>You both like</Text>
                      <Text style={[styles.modalCompatibilitySubtitle, { color: palette.secondaryText }]}>
                        {commonInterests.length} {commonInterests.length === 1 ? 'interest' : 'interests'} overlap
                      </Text>
                    </View>
                  </View>
                  <View style={styles.modalCompatibilityTags}>
                    {commonInterests.slice(0, 6).map((interest, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.modalCompatibilityTag,
                          {
                            backgroundColor: palette.tagBg,
                            borderColor: palette.tagBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.modalCompatibilityTagText, { color: palette.tagText }]}>{interest}</Text>
                      </View>
                    ))}
                    {commonInterests.length > 6 && (
                      <View
                        style={[
                          styles.modalCompatibilityMore,
                          {
                            backgroundColor: palette.tagMutedBg,
                            borderColor: palette.tagMutedBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.modalCompatibilityMoreText, { color: palette.tagMutedText }]}>
                          +{commonInterests.length - 6} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </Animated.View>
            ) : currentUserInterests.length > 0 && matchInterests.length > 0 ? (
              // Show a subtle message if interests exist but none are common
              <Animated.View 
                style={[
                  styles.modalCompatibilitySection,
                  { opacity: contentFade }
                ]}
              >
                <View
                  style={[
                    styles.modalCompatibilityEmptyCard,
                    { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                  ]}
                >
                  <Text style={[styles.modalCompatibilityEmptyText, { color: palette.secondaryText }]}>
                    💫 No shared interests yet, but you both have unique interests to explore!
                  </Text>
                </View>
              </Animated.View>
            ) : null}
            
            {/* Basic info — calm stat chips */}
            <Animated.View 
              style={[
                styles.modalInfoSection,
                { opacity: contentFade }
              ]}
            >
              <Text style={[styles.modalName, { color: palette.primaryText }]}>{otherUser.displayName}</Text>
              <View style={styles.modalBasicInfo}>
                <View
                  style={[
                    styles.modalInfoStatCard,
                    { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                  ]}
                >
                  <Text style={styles.modalInfoStatEmoji}>🎂</Text>
                  <Text style={[styles.modalInfoStatLabel, { color: palette.mutedText }]}>Age</Text>
                  <Text style={[styles.modalInfoStatValue, { color: palette.primaryText }]}>{otherUser.age}</Text>
                </View>
                <View
                  style={[
                    styles.modalInfoStatCard,
                    { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                  ]}
                >
                  <Text style={styles.modalInfoStatEmoji}>⚧️</Text>
                  <Text style={[styles.modalInfoStatLabel, { color: palette.mutedText }]}>Gender</Text>
                  <Text style={[styles.modalInfoStatValue, { color: palette.primaryText }]} numberOfLines={2}>{otherUser.gender}</Text>
                </View>
              </View>
              
              {otherUser.location && (
                <View
                  style={[
                    styles.modalInfoLocationCard,
                    { marginTop: 10, marginBottom: 0, backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                  ]}
                >
                  <Text style={styles.modalInfoStatEmoji}>📍</Text>
                  <Text style={[styles.modalInfoStatLabel, { color: palette.mutedText }]}>Location</Text>
                  <Text style={[styles.modalInfoLocationValue, { color: palette.primaryText }]}>{otherUser.location}</Text>
                </View>
              )}

              {otherUser.bio && (
                <View style={[styles.modalBioCard, { marginTop: 14 }]}>
                  <View
                    style={[
                      styles.modalBioInner,
                      { backgroundColor: palette.cardBg, borderColor: palette.cardBorder },
                    ]}
                  >
                    <Text style={[styles.modalBioEyebrow, { color: palette.accent }]}>About</Text>
                    <Text style={[styles.modalBio, { color: palette.secondaryText }]}>{otherUser.bio}</Text>
                  </View>
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
                  <Text style={[styles.modalSectionEyebrow, { color: palette.mutedText }]}>Gallery</Text>
                  <Text style={[styles.modalSectionTitle, { color: palette.primaryText }]}>Photos</Text>
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
                        style={[styles.modalPhotoThumbnail, { borderColor: palette.thumbBorder }]}
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
                  <Text style={[styles.modalSectionEyebrow, { color: palette.mutedText }]}>Their world</Text>
                  <Text style={[styles.modalSectionTitle, { color: palette.primaryText }]}>Interests</Text>
                </View>
                <View style={styles.modalTagsContainer}>
                  {otherUser.interests.map((interest, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.modalTagPill,
                        {
                          backgroundColor: palette.tagBg,
                          borderColor: palette.tagBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.modalTagPillText, { color: palette.tagText }]}>{interest}</Text>
                    </View>
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
                  <Text style={[styles.modalSectionEyebrow, { color: palette.mutedText }]}>What they care about</Text>
                  <Text style={[styles.modalSectionTitle, { color: palette.primaryText }]}>Values</Text>
                </View>
                <View style={styles.modalTagsContainer}>
                  {otherUser.values.map((value, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.modalTagPillMuted,
                        {
                          backgroundColor: palette.tagMutedBg,
                          borderColor: palette.tagMutedBorder,
                        },
                      ]}
                    >
                      <Text style={[styles.modalTagPillMutedText, { color: palette.tagMutedText }]}>{value}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}
            
            {/* Report and Block buttons */}
            {(onReport || onBlock) && (
              <Animated.View style={[styles.modalSection, { opacity: contentFade, marginTop: 8, marginBottom: 24, flexDirection: 'row', justifyContent: 'center', gap: 12 }]}>
                {onBlock && (
                  <TouchableOpacity
                    onPress={onBlock}
                    style={[
                      styles.modalBlockButton,
                      {
                        backgroundColor: palette.tagMutedBg,
                        borderColor: palette.tagMutedBorder,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modalBlockButtonText, { color: palette.secondaryText }]}>🚫 Block</Text>
                  </TouchableOpacity>
                )}
                {onReport && (
                  <TouchableOpacity
                    onPress={onReport}
                    style={[
                      styles.modalReportButton,
                      {
                        backgroundColor:
                          connectShellMode === 'midnight'
                            ? 'rgba(254, 202, 202, 0.12)'
                            : connectShellMode === 'sunny'
                              ? 'rgba(255, 237, 213, 0.55)'
                              : '#fef2f2',
                        borderColor:
                          connectShellMode === 'midnight'
                            ? 'rgba(248, 113, 113, 0.35)'
                            : connectShellMode === 'sunny'
                              ? 'rgba(251, 146, 60, 0.4)'
                              : '#fecaca',
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.modalReportButtonText,
                        {
                          color:
                            connectShellMode === 'midnight'
                              ? '#fecaca'
                              : connectShellMode === 'sunny'
                                ? '#c2410c'
                                : '#b91c1c',
                        },
                      ]}
                    >
                      🚩 Report
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
  );

  if (noModal) {
    return <View style={{ flex: 1 }}>{overlayContent}</View>;
  }
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      {overlayContent}
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

/** Stage-1 chat banner — Android-only richer treatment (gradient rim, chips); tap still opens detail alert. */
function PhotoUnlockStage1BannerAndroid({
  otherDisplayName,
  midnight,
  onPress,
}: {
  otherDisplayName: string;
  midnight: boolean;
  onPress: () => void;
}) {
  const name = otherDisplayName.trim() || 'your match';
  const rimColors = midnight
    ? (['rgba(251, 113, 133, 0.85)', 'rgba(251, 191, 36, 0.65)', 'rgba(244, 63, 94, 0.75)'] as const)
    : (['#f472b6', '#fb923c', '#fbbf24'] as const);
  const innerBg = midnight ? '#14121e' : '#fffefb';
  const titleColor = midnight ? '#fde68a' : '#9f1239';
  const subtitleColor = midnight ? 'rgba(226, 232, 240, 0.72)' : '#78716c';
  const bodyColor = midnight ? '#e2e8f0' : '#44403c';
  const nameColor = midnight ? '#fda4af' : '#be123c';
  const hintColor = midnight ? 'rgba(226, 232, 240, 0.5)' : 'rgba(120, 113, 108, 0.72)';
  const iconBubbleColors = midnight
    ? (['#9d174d', '#c2410c'] as const)
    : (['#db2777', '#ea580c'] as const);

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.photoUnlockBannerOuter}>
      <LinearGradient
        colors={[...rimColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.photoUnlockBannerRim}
      >
        <View style={[styles.photoUnlockBannerInner, { backgroundColor: innerBg }]}>
          <View style={styles.photoUnlockBannerHeaderRow}>
            <LinearGradient colors={[...iconBubbleColors]} style={styles.photoUnlockBannerIconBubble}>
              <Text style={styles.photoUnlockBannerIconEmoji}>✨</Text>
            </LinearGradient>
            <View style={styles.photoUnlockBannerTitleBlock}>
              <Text style={[styles.photoUnlockBannerTitle, { color: titleColor }]}>Unlock all photos</Text>
              <Text style={[styles.photoUnlockBannerSubtitle, { color: subtitleColor }]}>
                One preview now · full galleries after you both chat
              </Text>
            </View>
          </View>
          <Text style={[styles.photoUnlockBannerBody, { color: bodyColor }]}>
            You each see one photo at first. After you and{' '}
            <Text style={[styles.photoUnlockBannerName, { color: nameColor }]}>{name}</Text>
            {' have each sent at least '}
            <Text style={[styles.photoUnlockBannerEmphasis, { color: nameColor }]}>3 messages</Text>
            {" in this chat, you'll both see each other's full galleries."}
          </Text>
          <View style={styles.photoUnlockBannerChips}>
            <View
              style={[
                styles.photoUnlockBannerChip,
                midnight ? styles.photoUnlockBannerChipMidnight : styles.photoUnlockBannerChipDay,
              ]}
            >
              <Text
                style={[
                  styles.photoUnlockBannerChipText,
                  midnight ? styles.photoUnlockBannerChipTextMidnight : styles.photoUnlockBannerChipTextDay,
                ]}
              >
                📷 1 photo each
              </Text>
            </View>
            <View
              style={[
                styles.photoUnlockBannerChip,
                midnight ? styles.photoUnlockBannerChipMidnight : styles.photoUnlockBannerChipDay,
              ]}
            >
              <Text
                style={[
                  styles.photoUnlockBannerChipText,
                  midnight ? styles.photoUnlockBannerChipTextMidnight : styles.photoUnlockBannerChipTextDay,
                ]}
              >
                💬 3 msgs each → unlock
              </Text>
            </View>
          </View>
          <Text style={[styles.photoUnlockBannerTapHint, { color: hintColor }]}>Tap for a quick recap</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
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
  const { mode: connectShellMode } = useConnectShellTheme();
  const shellBackdropColors = useMemo(
    () => androidShellBackdropColors(connectShellMode),
    [connectShellMode]
  );
  const tabBodyBg = useMemo(() => androidShellTabBodyBg(connectShellMode), [connectShellMode]);
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMatchId, setReportMatchId] = useState<string | null>(null);
  const [reportReportedUserId, setReportReportedUserId] = useState<string | null>(null);
  const [reportSelectedReasonIds, setReportSelectedReasonIds] = useState<string[]>([]);
  const [reportUrgent, setReportUrgent] = useState(false);
  const [reportDetails, setReportDetails] = useState('');
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
  const [compatibilityDetails, setCompatibilityDetails] = useState<{ reasons: string[]; sharedInterests: string[] } | null>(null);
  const [showAgeCardModal, setShowAgeCardModal] = useState(false);
  const [showCompatibilityCardModal, setShowCompatibilityCardModal] = useState(false);
  const [messageLikedToast, setMessageLikedToast] = useState<{ likerName: string } | null>(null);
  /** Mulligan-styled explainer (replaces system Alert on photo-unlock banner tap). */
  const [photoUnlockExplainerVisible, setPhotoUnlockExplainerVisible] = useState(false);
  /** Momentary “photos unlocked” celebration when stage1 → stage2 (each user sent 3+ messages). */
  const [galleryUnlockCelebration, setGalleryUnlockCelebration] = useState(false);
  const [truthOrDareGateModalVisible, setTruthOrDareGateModalVisible] = useState(false);
  const [chatMediaGateModalVisible, setChatMediaGateModalVisible] = useState(false);
  const galleryUnlockCelebrationDedupeRef = useRef<{ matchId: string; at: number } | null>(null);
  const unlockCelebrateOpacity = useRef(new Animated.Value(0)).current;
  const unlockCelebrateTranslateY = useRef(new Animated.Value(-36)).current;

  const triggerGalleryUnlockCelebration = useCallback((matchId: string) => {
    const now = Date.now();
    const prev = galleryUnlockCelebrationDedupeRef.current;
    if (prev && prev.matchId === matchId && now - prev.at < 6000) return;
    galleryUnlockCelebrationDedupeRef.current = { matchId, at: now };
    setGalleryUnlockCelebration(true);
  }, []);

  useEffect(() => {
    if (!messageLikedToast) return;
    const t = setTimeout(() => setMessageLikedToast(null), 3000);
    return () => clearTimeout(t);
  }, [messageLikedToast]);

  useEffect(() => {
    setGalleryUnlockCelebration(false);
    setPhotoUnlockExplainerVisible(false);
  }, [selectedMatch?.id]);

  useEffect(() => {
    if (selectedMatch?.stage !== 'stage1') setPhotoUnlockExplainerVisible(false);
  }, [selectedMatch?.stage]);

  useEffect(() => {
    if (!galleryUnlockCelebration) return;
    unlockCelebrateOpacity.setValue(0);
    unlockCelebrateTranslateY.setValue(-36);
    Animated.parallel([
      Animated.spring(unlockCelebrateTranslateY, {
        toValue: 0,
        friction: 9,
        tension: 95,
        useNativeDriver: true,
      }),
      Animated.timing(unlockCelebrateOpacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
    try {
      Vibration.vibrate(Platform.OS === 'ios' ? [0, 40, 60, 90] : [0, 80, 120, 160]);
    } catch {
      /* non-critical */
    }
    const t = setTimeout(() => setGalleryUnlockCelebration(false), 5200);
    return () => clearTimeout(t);
  }, [galleryUnlockCelebration]);
  
  // Header animations
  const headerGradientPos = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(1)).current;
  
  // Message animations
  const messageAnimations = useRef<{ [key: string]: Animated.Value }>({}).current;
  
  // Chat transition animations
  const chatSlideAnim = useRef(new Animated.Value(0)).current;
  const chatFadeAnim = useRef(new Animated.Value(0)).current;

  const chatMediaUnlocked = useMemo(() => {
    if (!selectedMatch || !user?.id) return false;
    const myId = user.id;
    const otherId = selectedMatch.otherUser.userId;
    let my = 0;
    let other = 0;
    for (const m of messages) {
      if (m.senderId === myId) my++;
      else if (m.senderId === otherId) other++;
    }
    return my >= CHAT_MEDIA_MIN_EACH && other >= CHAT_MEDIA_MIN_EACH;
  }, [messages, selectedMatch?.id, selectedMatch?.otherUser?.userId, user?.id]);

  const chatMediaMessageCounts = useMemo(() => {
    if (!selectedMatch || !user?.id) return { my: 0, their: 0 };
    const myId = user.id;
    const otherId = selectedMatch.otherUser.userId;
    let my = 0;
    let their = 0;
    for (const m of messages) {
      if (m.senderId === myId) my++;
      else if (m.senderId === otherId) their++;
    }
    return { my, their };
  }, [messages, selectedMatch?.id, selectedMatch?.otherUser?.userId, user?.id]);

  const truthOrDareGateCounts = useMemo(() => {
    if (!user?.id || !selectedMatch?.otherUser?.userId) return { my: 0, their: 0 };
    return truthOrDareMessageCounts(messages, user.id, selectedMatch.otherUser.userId);
  }, [messages, selectedMatch?.id, selectedMatch?.otherUser?.userId, user?.id]);

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

  // Fetch profile compatibility when viewing a match (interest overlap → 0–100%, details for modal)
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
            reasons: filterInterestCompatReasons(Array.isArray(r.reasons) ? r.reasons : []),
            sharedInterests: Array.isArray(r.sharedInterests) ? r.sharedInterests : [],
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
    // During send, ignore non-empty native TextInput churn (Android multiline can echo old text after clear)
    if (sendingMessage && text !== '') {
      return;
    }
    setNewMessage(text);

    if (!sendingMessage) {
      
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
    () => (
      <View>
        {selectedMatch?.stage === 'stage1' ? (
          Platform.OS === 'android' ? (
            <PhotoUnlockStage1BannerAndroid
              otherDisplayName={selectedMatch.otherUser.displayName ?? ''}
              midnight={connectShellMode === 'midnight'}
              onPress={() => setPhotoUnlockExplainerVisible(true)}
            />
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.photoUnlockHintTouchable}
              onPress={() => setPhotoUnlockExplainerVisible(true)}
            >
              <Text style={styles.photoUnlockHintText}>📷 How photos unlock</Text>
            </TouchableOpacity>
          )
        ) : null}
        {typingUsers.size > 0 ? <TypingIndicator /> : null}
      </View>
    ),
    [typingUsers.size, selectedMatch?.stage, selectedMatch?.otherUser?.displayName, selectedMatch?.id, connectShellMode]
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
        const current = selectedMatchRef.current;
        const shouldCelebrate = Boolean(current?.id === data.matchId && current.stage === 'stage1');
        setMatches((prev) => prev.map((m) => (m.id === data.matchId ? { ...m, stage: 'stage2' } : m)));
        setSelectedMatch((prev) => (prev && prev.id === data.matchId ? { ...prev, stage: 'stage2' } : prev));
        if (shouldCelebrate) triggerGalleryUnlockCelebration(data.matchId);
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

      // Real-time: other user unmatched — remove match from list and close chat if open (no refetch to avoid white flicker)
      socket.on('match_unmatched', (data: { matchId: string; unmatchedBy?: string }) => {
        const { matchId } = data;
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
        if (selectedMatchRef.current?.id === matchId) {
          setSelectedMatch(null);
          setMessages([]);
        }
        if (getPendingOpenMatchId() === matchId) clearPendingOpenMatchId();
        navigation.setParams({ matchId: undefined } as { matchId?: string });
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
  }, [user, triggerGalleryUnlockCelebration]);

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
      // Optimistically clear unread badge so it disappears when user goes back to list
      setMatches((prev) =>
        prev.map((m) => (m.id === selectedMatch.id ? { ...m, unreadCount: 0 } : m))
      );
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
        if (raw) Image.prefetch(getPhotoUrl(raw)).catch(() => { /* ignore 404 / failed uploads */ });
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

  // When we landed with showMatchCelebration (e.g. User B opened app from "matched with you" push), force refresh
  // so the new match is in the list. useFocusEffect may not run if the tab was already focused.
  useEffect(() => {
    const rp = route.params as { showMatchCelebration?: boolean; matchId?: string } | undefined;
    if (rp?.showMatchCelebration && rp?.matchId) {
      api.clearCache('/matches');
      fetchMatches();
    }
  }, [route.params?.showMatchCelebration, route.params?.matchId, fetchMatches]);

  // When matches refresh, keep selectedMatch aligned with the row from GET /matches (partner profile edits, photos, etc.).
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
      const updated = matches.find(m => m.id === selectedMatch.id);
      if (updated) {
        setSelectedMatch(updated);
      }
    }
  }, [matches, route.params, loading, selectedMatch?.id]);

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
          setSelectedMatch(null);
          setMatches((prev) => prev.filter((m) => m.id !== matchId));
          api.clearCache('/matches');
          // Don't call fetchMatches() — it does setLoading(true) and causes white flicker for User B
          if (getPendingOpenMatchId() === matchId) clearPendingOpenMatchId();
          navigation.setParams({ matchId: undefined } as { matchId?: string });
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
  }, [fetchMatches, navigation]);

  const handleBack = useCallback(() => {
    console.log('🔙 handleBack called - clearing selected match');
    console.log('   Current selectedMatch:', selectedMatch?.id);
    lastFetchedMatchIdRef.current = null;
    // Clear cache so refetch gets fresh unread counts from server (mark_read has been emitted)
    api.clearCache('/matches');
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
    const wasStage1BeforeSend = selectedMatch.stage === 'stage1';
    const sendingMatchId = selectedMatch.id;
    // Ref guard: prevent concurrent sends (state update is async so rapid taps can both pass sendingMessage check)
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSendingMessage(true);

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
    if (Platform.OS === 'android') {
      queueMicrotask(() => textInputRef.current?.clear?.());
    }
    Keyboard.dismiss();
    setTimeout(() => setKeyboardHeight(0), 100);
    
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
      // When each user has sent 3+ messages, backend returns stage: 'stage2' — update UI immediately
      if (response.stage === 'stage2') {
        setSelectedMatch((prev) => (prev && prev.id === sendingMatchId ? { ...prev, stage: 'stage2' } : prev));
        setMatches((prev) => prev.map((m) => (m.id === sendingMatchId ? { ...m, stage: 'stage2' } : m)));
        if (wasStage1BeforeSend) triggerGalleryUnlockCelebration(sendingMatchId);
      }
    } catch (error: any) {
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      setNewMessage(messageContent);
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
    if (!chatMediaUnlocked) {
      setChatMediaGateModalVisible(true);
      return;
    }
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
  }, [selectedMatch, sendingMessage, uploadingImage, uploadingVideo, uploadingAudio, user, chatMediaUnlocked]);

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

  const handleReportMatch = useCallback(() => {
    if (!selectedMatch) return;
    setShowProfileModal(false); // avoid double-modals while the user is in the profile overlay
    setFullScreenImageUrl(null);
    setFullScreenPhotoList(null);
    setReportMatchId(selectedMatch.id);
    setReportReportedUserId(selectedMatch.otherUser.userId);
    setReportSelectedReasonIds([]);
    setReportUrgent(false);
    setReportDetails('');
    setShowReportModal(true);
  }, [selectedMatch]);

  const REPORT_REASON_OPTIONS = useMemo(
    () => [
      { id: 'threats', label: 'Threats / violence / self-harm', urgentEligible: true, emoji: '🛑' },
      { id: 'sexual', label: 'Unwanted sexual content (non-consensual)', urgentEligible: true, emoji: '🚫' },
      { id: 'money', label: 'Asking for money / scams / illegal activity', urgentEligible: true, emoji: '💸' },
      { id: 'harassment', label: 'Harassment / bullying', urgentEligible: false, emoji: '⚠️' },
      { id: 'hate', label: 'Hate speech', urgentEligible: false, emoji: '🧿' },
      { id: 'spam', label: 'Spam / repeated unwanted messages', urgentEligible: false, emoji: '📣' },
      { id: 'other', label: 'Other', urgentEligible: false, emoji: '📝' },
    ],
    []
  );

  const MAX_REPORT_CATEGORIES = 3;
  const urgentEligibleNow = reportSelectedReasonIds.some((id) =>
    REPORT_REASON_OPTIONS.find((o) => o.id === id)?.urgentEligible
  );

  useEffect(() => {
    if (reportUrgent && !urgentEligibleNow) setReportUrgent(false);
  }, [urgentEligibleNow, reportUrgent]);

  const toggleReportReason = (id: string) => {
    setReportSelectedReasonIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_REPORT_CATEGORIES) {
        Alert.alert('Too many selections', `Please select up to ${MAX_REPORT_CATEGORIES} reasons.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const submitReport = async () => {
    if (!reportReportedUserId || !reportMatchId) {
      Alert.alert('Error', 'Report target is missing. Please try again.');
      return;
    }
    if (reportSelectedReasonIds.length === 0) {
      Alert.alert('Select a reason', 'Please choose at least one category for the report.');
      return;
    }

    const selectedLabels = REPORT_REASON_OPTIONS
      .filter((o) => reportSelectedReasonIds.includes(o.id))
      .map((o) => o.label);

    const parts: string[] = [];
    if (reportUrgent) parts.push('URGENT');
    parts.push(`Reasons: ${selectedLabels.join(', ')}`);

    const trimmedDetails = reportDetails.trim();
    if (trimmedDetails) {
      parts.push(`Details: ${trimmedDetails}`);
    }

    const reason = parts.join(' | ').slice(0, 480); // backend also truncates to 500

    try {
      await api.post('/reports', {
        reportedUserId: reportReportedUserId,
        matchId: reportMatchId,
        reason,
      });
      setShowReportModal(false);
      setReportMatchId(null);
      setReportReportedUserId(null);
      setReportSelectedReasonIds([]);
      setReportUrgent(false);
      setReportDetails('');
      Alert.alert('Thanks', "We'll look into it.");
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to submit report');
    }
  };

  const handleBlockMatch = useCallback(() => {
    if (!selectedMatch) return;
    const name = selectedMatch.otherUser?.displayName || 'this user';
    Alert.alert(
      'Block',
      `Block ${name}? They will be removed from your matches and won't see you in browse. You can unblock them later in Settings.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/blocks', {
                blockedUserId: selectedMatch.otherUser.userId,
              });
              api.clearCache('/matches');
              setMatches((prev) => prev.filter((m) => m.id !== selectedMatch.id));
              setSelectedMatch(null);
              setShowProfileModal(false);
              setFullScreenImageUrl(null);
              setFullScreenPhotoList(null);
              Alert.alert('Done', 'User has been blocked.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to block user');
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
        return '🖼️';
      case 'stage1':
        return '📷';
      default:
        return '💌';
    }
  }, []);

  // When tab is not focused, render minimal view so leaving Matches tab is instant
  if (!isFocused) {
    return <View style={{ flex: 1 }} />;
  }

  // Show loading while auth is initializing or matches are loading (only when not in a conversation—
  // when selectedMatch is set, refetches run in background and must not hide chat/input).
  // Skip loading screen when User B is opening for match celebration so they don't see a brief "Loading matches..." flash.
  const routeParamsForCelebration = route.params as { showMatchCelebration?: boolean; matchId?: string } | undefined;
  const openingForCelebration = !!(routeParamsForCelebration?.showMatchCelebration && routeParamsForCelebration?.matchId);
  if (authLoading || (loading && !selectedMatch && !openingForCelebration)) {
    return (
      <View style={[styles.loadingContainer, tabBodyBg != null && { backgroundColor: tabBodyBg }]}>
        <ActivityIndicator size="large" color={tabBodyBg != null ? '#f472b6' : '#667eea'} />
        <Text style={[styles.loadingText, tabBodyBg != null && { color: '#e2e8f0' }]}>
          {authLoading ? 'Checking authentication...' : 'Loading matches...'}
        </Text>
      </View>
    );
  }
  
  // If not authenticated, show message
  if (!isAuthenticated || !user) {
    return (
      <View style={[styles.container, tabBodyBg != null && { backgroundColor: tabBodyBg }]}>
        <LinearGradient
          colors={[...shellBackdropColors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: matchesHeaderPaddingTop(insets.top) }]}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <AnimatedLinkHeaderIcon connectShell={connectShellMode} />
              <Text style={styles.headerTitle}>Your Matches</Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, tabBodyBg != null && { color: '#f1f5f9' }]}>Please log in</Text>
          <Text style={[styles.emptyText, tabBodyBg != null && { color: '#94a3b8' }]}>
            You need to be logged in to view your matches.
          </Text>
        </View>
    </View>
  );
  }

  if (!selectedMatch) {
    return (
      <View style={[styles.container, tabBodyBg != null && { backgroundColor: tabBodyBg }]}>
        <AnimatedHeaderGradient
          matchesCount={visibleMatches.length}
          gradientPos={headerGradientPos}
          shellBackdropColors={shellBackdropColors}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <AnimatedLinkHeaderIcon connectShell={connectShellMode} />
              <Text style={styles.headerTitle}>Your Matches</Text>
            </View>
          </View>
        </AnimatedHeaderGradient>
        {visibleMatches.length === 0 ? (
          <EmptyStateAnimated
            navigation={navigation}
            shellBackdropColors={shellBackdropColors}
            shellIsMidnightAndroid={Platform.OS === 'android' && connectShellMode === 'midnight'}
          />
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
                />
              );
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { width: windowWidth, maxWidth: windowWidth, overflow: 'hidden', alignSelf: 'center' },
        tabBodyBg != null && { backgroundColor: tabBodyBg },
      ]}
    >
      <LinearGradient
        colors={[...shellBackdropColors]}
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
          {/* Bottom row: age, photo visibility, compatibility + game icons */}
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
              ) : null}
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
                    <Text style={styles.chatHeaderCompatibilityIcon}>🎯</Text>
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
                    chatPartnerUserId={selectedMatch.otherUser.userId}
                    socket={socketRef.current}
                    onSendToChat={(text) => { handleSendMessage(text); }}
                    onRequestGame={async () => {
                      const uid = user?.id;
                      const pid = selectedMatch.otherUser.userId;
                      if (!uid || !pid || !truthOrDareMessageThresholdMet(messages, uid, pid)) {
                        setTruthOrDareGateModalVisible(true);
                        return;
                      }
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
                  {SHOW_NEVER_HAVE_I_EVER && (
                    <NeverHaveIEver
                      matchId={selectedMatch.id}
                      messages={messages}
                      currentUserId={user?.id || ''}
                      chatPartnerUserId={selectedMatch.otherUser.userId}
                      socket={socketRef.current}
                      onSendToChat={(text) => {
                        void handleSendMessage(text);
                      }}
                      sendingMessage={sendingMessage}
                      partnerDisplayName={selectedMatch.otherUser.displayName}
                      partnerIsTyping={typingUsers.has(selectedMatch.otherUser.userId)}
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
                  )}
                  <DateBlueprint
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
                    currentUserId={user?.id || ''}
                    chatPartnerUserId={selectedMatch.otherUser.userId}
                    messages={messages}
                    headerMode
                    onInviteToChat={(text) => handleSendMessage(text)}
                  />
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <TruthOrDareMessageGateModal
        visible={truthOrDareGateModalVisible}
        onClose={() => setTruthOrDareGateModalVisible(false)}
        myCount={truthOrDareGateCounts.my}
        theirCount={truthOrDareGateCounts.their}
        threshold={TRUTH_OR_DARE_MIN_EACH}
      />

      <ChatMediaLockedGateModal
        visible={chatMediaGateModalVisible}
        onClose={() => setChatMediaGateModalVisible(false)}
        myCount={chatMediaMessageCounts.my}
        theirCount={chatMediaMessageCounts.their}
        threshold={CHAT_MEDIA_MIN_EACH}
        subtitle={CHAT_MEDIA_LOCKED_SUBTITLE}
        moderationWarning={CHAT_MEDIA_LOCKED_MODERATION}
      />

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
              <Text style={styles.ageCardTitle}>Age is one piece of the picture</Text>
              <Text style={styles.ageCardBody}>
                Mulligan shows age so you have context—what matters more is shared interests, respect, and whether you actually want to meet up. Keep things kind, honest, and public when you first connect.
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
                <Text style={styles.compatCardEmoji}>🎯</Text>
                <Text style={styles.compatCardTitle}>
                  {profileCompatibility != null ? `${profileCompatibility}%` : ''} Interest match
                </Text>
                <Text style={styles.compatCardSubtitle}>
                  This score reflects how your interests overlap—the more you have in common, the higher the connection.
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
                {(!compatibilityDetails?.reasons?.length && !compatibilityDetails?.sharedInterests?.length) && (
                  <Text style={styles.compatCardEmpty}>
                    Add more interests to your profile to see stronger overlap scores with people you vibe with.
                  </Text>
                )}
                <Text style={styles.ageCardHint}>Tap outside to close</Text>
              </ScrollView>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Single modal: profile card or full-screen image — no switching between modals so no chat flash */}
      <Modal
        visible={(showProfileModal && !!selectedMatch) || !!fullScreenImageUrl}
        animationType="none"
        transparent
        onRequestClose={() => {
          setShowProfileModal(false);
          setFullScreenImageUrl(null);
          setFullScreenPhotoList(null);
        }}
      >
        {fullScreenImageUrl ? (
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
                        setFullScreenImageUrl(null);
                        setFullScreenPhotoList(null);
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
                  setFullScreenImageUrl(null);
                  setFullScreenPhotoList(null);
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
        ) : selectedMatch ? (
          <MatchProfileModal
            match={selectedMatch}
            visible={true}
            noModal
            onClose={() => {
              setShowProfileModal(false);
              setFullScreenImageUrl(null);
              setFullScreenPhotoList(null);
            }}
            onPhotoPress={(url, allUrls, index) => {
              fullScreenOpenedFromProfileCardRef.current = true;
              setFullScreenImageUrl(url);
              setFullScreenPhotoList(allUrls && allUrls.length > 1 ? allUrls : null);
              setFullScreenPhotoIndex(typeof index === 'number' ? index : 0);
            }}
            onReport={handleReportMatch}
            onBlock={handleBlockMatch}
          />
        ) : null}
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
                Inappropriate photos, video, or voice can get you permanently banned from Mulligan. F**k around and get banned.
              </Text>
              <Text style={styles.photoGuidelinesSubtext}>
                Tap Got it to continue.
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

      {/* Report modal: multi-select reasons + optional urgent checkbox */}
      <Modal
        visible={showReportModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.reportOverlay}
          onPress={() => setShowReportModal(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.reportCard}
            onPress={(e) => e.stopPropagation()}
          >
            <LinearGradient
              colors={['#ff6b9d', '#764ba2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.reportHeaderGradient}
            >
              <Text style={styles.reportHeaderTitle}>Report user</Text>
              <Text style={styles.reportHeaderSubtitle}>
                Select all that apply (up to {MAX_REPORT_CATEGORIES})
              </Text>
            </LinearGradient>

            <ScrollView style={styles.reportScroll} contentContainerStyle={styles.reportScrollContent}>
              <View style={styles.reportReasonList}>
                {REPORT_REASON_OPTIONS.map((opt) => {
                  const selected = reportSelectedReasonIds.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.reportReasonRow,
                        selected ? styles.reportReasonRowSelected : undefined,
                      ]}
                      onPress={() => toggleReportReason(opt.id)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.reportReasonLeft}>
                        <Text style={styles.reportReasonEmoji}>{opt.emoji}</Text>
                        <Text style={styles.reportReasonLabel}>{opt.label}</Text>
                      </View>
                      <View style={[styles.reportCheckbox, selected ? styles.reportCheckboxChecked : undefined]}>
                        {selected ? <Text style={styles.reportCheckboxText}>✓</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.reportUrgentRow, !urgentEligibleNow ? styles.reportUrgentRowDisabled : undefined]}
                onPress={() => {
                  if (!urgentEligibleNow) return;
                  setReportUrgent((v) => !v);
                }}
              >
                <View style={[styles.reportUrgentCheckbox, reportUrgent ? styles.reportUrgentCheckboxChecked : undefined, !urgentEligibleNow ? styles.reportUrgentCheckboxDisabled : undefined]}>
                  {reportUrgent ? <Text style={styles.reportCheckboxText}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reportUrgentTitle, !urgentEligibleNow ? styles.reportUrgentTextDisabled : undefined]}>
                    This is urgent
                  </Text>
                  <Text style={[styles.reportUrgentSubtitle, !urgentEligibleNow ? styles.reportUrgentTextDisabled : undefined]}>
                    {urgentEligibleNow
                      ? 'For threats, self-harm, non-consensual sexual content, or scams/illegal activity.'
                      : 'Select a safety-critical reason above to enable.'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TextInput
                style={styles.reportDetailsInput}
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder="Optional details (1–2 sentences)"
                placeholderTextColor="rgba(0,0,0,0.35)"
                multiline
                maxLength={320}
              />
            </ScrollView>

            <View style={styles.reportActions}>
              <TouchableOpacity
                style={[styles.reportActionButton, styles.reportActionCancel]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={[styles.reportActionText, { color: '#1a1a1a' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.reportActionButton,
                  reportSelectedReasonIds.length === 0 ? styles.reportActionDisabled : styles.reportActionSubmit,
                ]}
                onPress={() => void submitReport()}
                disabled={reportSelectedReasonIds.length === 0}
              >
                <Text style={[styles.reportActionText, reportSelectedReasonIds.length === 0 ? { color: 'rgba(255,255,255,0.7)' } : undefined]}>
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
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

      {/* Match Celebration - when User B opens app from connection notification (push or in-app); skip loading card */}
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
            skipLoadingReveal={true}
          />
        ) : null;
      })()}

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
              : (Platform.OS === 'ios' ? 56 + Math.round(insets.bottom * 0.5) : 0) + 72,
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

      {galleryUnlockCelebration ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.galleryUnlockCelebrationOverlay,
            {
              top: insets.top + (Platform.OS === 'ios' ? 52 : 58),
              opacity: unlockCelebrateOpacity,
              transform: [{ translateY: unlockCelebrateTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.93}
            onPress={() => setGalleryUnlockCelebration(false)}
            style={styles.galleryUnlockCelebrationTouchable}
          >
            <LinearGradient
              colors={
                connectShellMode === 'midnight'
                  ? ['#fbbf24', '#f472b6', '#a855f7']
                  : ['#fde047', '#fb7185', '#e879f9']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.galleryUnlockCelebrationRim}
            >
              <View
                style={[
                  styles.galleryUnlockCelebrationInner,
                  connectShellMode === 'midnight'
                    ? styles.galleryUnlockCelebrationInnerMidnight
                    : styles.galleryUnlockCelebrationInnerDay,
                ]}
              >
                <Text style={styles.galleryUnlockCelebrationEmoji}>🎉 📸</Text>
                <Text
                  style={[
                    styles.galleryUnlockCelebrationTitle,
                    connectShellMode === 'midnight' && styles.galleryUnlockCelebrationTitleMidnight,
                  ]}
                >
                  All photos unlocked!
                </Text>
                <Text
                  style={[
                    styles.galleryUnlockCelebrationSubtitle,
                    connectShellMode === 'midnight' && styles.galleryUnlockCelebrationSubtitleMidnight,
                  ]}
                >
                  {"You've both earned it — swipe through each other's full galleries."}
                </Text>
                <Text
                  style={[
                    styles.galleryUnlockCelebrationDismiss,
                    connectShellMode === 'midnight' && styles.galleryUnlockCelebrationDismissMidnight,
                  ]}
                >
                  Tap to dismiss
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {selectedMatch?.stage === 'stage1' ? (
        <PhotoUnlockExplainerModal
          visible={photoUnlockExplainerVisible}
          onClose={() => setPhotoUnlockExplainerVisible(false)}
          otherDisplayName={selectedMatch.otherUser.displayName ?? ''}
          midnight={connectShellMode === 'midnight'}
        />
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
                  : 0,
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
                onPress={() => {
                  if (!chatMediaUnlocked) {
                    setChatMediaGateModalVisible(true);
                    return;
                  }
                  setShowPhotoGuidelinesModal(true);
                }}
                disabled={sendingMessage || uploadingImage || uploadingVideo || uploadingAudio}
                style={styles.photoButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  style={[
                    styles.photoButtonIcon,
                    (uploadingImage || uploadingVideo || uploadingAudio) && { opacity: 0.6 },
                    !chatMediaUnlocked && { opacity: 0.4 },
                  ]}
                >
                  📷
                </Text>
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
    ...Platform.select({
      android: { overflow: 'visible' as const },
      default: {},
    }),
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
    paddingTop: 0,
    borderBottomWidth: 0,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'visible',
  },
  header: {
    padding: 24,
    paddingTop: 28,
    paddingBottom: 24,
    overflow: 'visible',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: Platform.OS === 'android' ? 12 : 10,
    overflow: 'visible',
  },
  animatedHeartContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
    overflow: 'visible',
    paddingTop: Platform.OS === 'android' ? 16 : 6,
    paddingBottom: Platform.OS === 'android' ? 12 : 6,
    paddingHorizontal: Platform.OS === 'android' ? 8 : 6,
  },
  animatedHeartGlow: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 66,
    height: 66,
    borderRadius: 33,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 18,
    elevation: 10,
    zIndex: 0,
  },
  animatedHeartGlowSoft: {
    backgroundColor: 'rgba(136, 19, 55, 0.28)',
    shadowColor: '#881337',
  },
  animatedHeartGlowSunny: {
    backgroundColor: 'rgba(251, 146, 60, 0.32)',
    shadowColor: '#ea580c',
  },
  animatedHeartGlowMidnight: {
    backgroundColor: 'rgba(244, 114, 182, 0.36)',
    shadowColor: '#ec4899',
  },
  animatedHeartBadgeWrap: {
    width: 52,
    height: 52,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  /** Fills badge wrap; shimmer stays inside so rounded corners stay clean. */
  animatedHeartGradientDisc: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 3,
  },
  animatedHeartGradientAndroidNoElevation: {
    elevation: 0,
  },
  animatedHeartGradientSoft: {
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#881337',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.42,
    shadowRadius: 10,
    elevation: 12,
  },
  animatedHeartGradientSunny: {
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 12,
  },
  animatedHeartGradientMidnight: {
    borderColor: 'rgba(255, 255, 255, 0.26)',
    shadowColor: '#db2777',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.48,
    shadowRadius: 14,
    elevation: 14,
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
    lineHeight: 32,
    textAlign: 'center' as const,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    zIndex: 2,
  },
  animatedHeartEmojiAndroid: {
    includeFontPadding: false,
    lineHeight: 34,
    marginTop: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
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
  timerInline: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: '600',
    letterSpacing: 0.2,
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
  chatHeaderStagePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b84d6f',
    letterSpacing: 0.3,
  },
  chatHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  chatHeaderSubtitleInner: {
    flexDirection: 'row',
    alignItems: 'center',
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
  galleryUnlockCelebrationOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 1002,
    elevation: 24,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  galleryUnlockCelebrationTouchable: {
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 20,
    elevation: 20,
  },
  galleryUnlockCelebrationRim: {
    borderRadius: 20,
    padding: 2,
  },
  galleryUnlockCelebrationInner: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  galleryUnlockCelebrationInnerMidnight: {
    backgroundColor: 'rgba(18, 16, 28, 0.94)',
  },
  galleryUnlockCelebrationInnerDay: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
  },
  galleryUnlockCelebrationEmoji: {
    fontSize: 30,
    marginBottom: 6,
    textAlign: 'center',
  },
  galleryUnlockCelebrationTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    color: '#881337',
  },
  galleryUnlockCelebrationTitleMidnight: {
    color: '#fde68a',
  },
  galleryUnlockCelebrationSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
    color: '#57534e',
    letterSpacing: 0.12,
  },
  galleryUnlockCelebrationSubtitleMidnight: {
    color: '#e2e8f0',
  },
  galleryUnlockCelebrationDismiss: {
    marginTop: 14,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(136, 19, 55, 0.55)',
    textAlign: 'center',
  },
  galleryUnlockCelebrationDismissMidnight: {
    color: 'rgba(253, 230, 138, 0.58)',
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
  photoUnlockHintTouchable: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(102, 126, 234, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(102, 126, 234, 0.35)',
  },
  photoUnlockHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4c51bf',
    letterSpacing: 0.2,
  },
  photoUnlockBannerOuter: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    marginBottom: 10,
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  photoUnlockBannerRim: {
    borderRadius: 18,
    padding: 2,
  },
  photoUnlockBannerInner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  photoUnlockBannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  photoUnlockBannerIconBubble: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUnlockBannerIconEmoji: {
    fontSize: 22,
  },
  photoUnlockBannerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  photoUnlockBannerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  photoUnlockBannerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.15,
  },
  photoUnlockBannerBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
    letterSpacing: 0.1,
  },
  photoUnlockBannerName: {
    fontWeight: '700',
  },
  photoUnlockBannerEmphasis: {
    fontWeight: '800',
  },
  photoUnlockBannerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  photoUnlockBannerChip: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoUnlockBannerChipMidnight: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.38)',
  },
  photoUnlockBannerChipDay: {
    backgroundColor: 'rgba(253, 242, 248, 0.95)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  photoUnlockBannerChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  photoUnlockBannerChipTextMidnight: {
    color: '#fde68a',
  },
  photoUnlockBannerChipTextDay: {
    color: '#9f1239',
  },
  photoUnlockBannerTapHint: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.35,
    textTransform: 'uppercase' as const,
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  modalContainer: {
    flex: 1,
    marginTop: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 24,
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    paddingBottom: 44,
  },
  modalBlockButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalBlockButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  modalReportButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  modalReportButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#b91c1c',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: '#fff',
  },
  modalHeaderTitles: {
    flex: 1,
    paddingRight: 12,
  },
  modalTitleEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.6,
  },
  modalCloseButton: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  modalCloseButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#475569',
    fontWeight: '600',
  },
  modalPhotoContainer: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
  },
  modalCompatibilitySection: {
    paddingHorizontal: 22,
    marginBottom: 20,
  },
  modalCompatibilityCard: {
    borderRadius: 20,
    padding: 18,
    paddingLeft: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
    overflow: 'hidden',
  },
  modalCompatibilityAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#6366f1',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  modalCompatibilityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalCompatibilityEmoji: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
    color: '#6366f1',
  },
  modalCompatibilityTitleContainer: {
    flex: 1,
  },
  modalCompatibilityEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalCompatibilityTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  modalCompatibilitySubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  modalCompatibilityTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalCompatibilityTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  modalCompatibilityTagText: {
    fontSize: 14,
    color: '#3730a3',
    fontWeight: '600',
  },
  modalCompatibilityMore: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalCompatibilityMoreText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  modalCompatibilityEmptyCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalCompatibilityEmptyText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalPhotoWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 244,
    height: 244,
  },
  modalPhotoFrameRing: {
    position: 'absolute',
    width: 244,
    height: 244,
    borderRadius: 122,
    top: 0,
    left: 0,
  },
  modalPhotoInnerClip: {
    width: 220,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modalPhoto: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: '#fff',
    backgroundColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 3,
  },
  modalPhotoSwipeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 220,
  },
  modalPhotoSwipeSide: {
    width: 52,
    height: 220,
  },
  modalPhotoSwipeCenter: {
    width: 220,
    height: 220,
  },
  modalPhotoTouchable: {
    width: 220,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 10,
    elevation: 10,
  },
  modalPhotoTapHint: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.4,
  },
  modalPhotoSwipeHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  modalPhotoPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 110,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#312e81',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 3,
  },
  modalPhotoPlaceholderText: {
    fontSize: 56,
    color: '#fff',
    fontWeight: '700',
  },
  modalInfoSection: {
    paddingHorizontal: 22,
    marginBottom: 20,
  },
  modalName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: -0.6,
  },
  modalBasicInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  modalInfoStatCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 108,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  modalInfoStatEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  modalInfoStatLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  modalInfoStatValue: {
    fontSize: 22,
    color: '#0f172a',
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalInfoLocationCard: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  modalInfoLocationValue: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  modalBioCard: {
    marginTop: 8,
    width: '100%',
  },
  modalBioInner: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  modalBioEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  modalBio: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 24,
    textAlign: 'left',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  modalSection: {
    paddingHorizontal: 22,
    marginBottom: 24,
  },
  modalSectionHeader: {
    marginBottom: 12,
  },
  modalSectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalSectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.4,
  },
  modalPhotosScroll: {
    marginHorizontal: -22,
  },
  modalPhotosContainer: {
    paddingHorizontal: 22,
    gap: 12,
  },
  modalPhotoThumbnail: {
    width: 132,
    height: 132,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
    marginRight: 12,
  },
  modalTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalTagPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
  },
  modalTagPillText: {
    fontSize: 14,
    color: '#4338ca',
    fontWeight: '600',
  },
  modalTagPillMuted: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalTagPillMutedText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  reportCard: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  reportHeaderGradient: {
    padding: 20,
  },
  reportHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: '#fff',
    marginBottom: 6,
  },
  reportHeaderSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 18,
  },
  reportScroll: {
    maxHeight: 520,
  },
  reportScrollContent: {
    padding: 18,
    gap: 14,
  },
  reportReasonList: {
    gap: 10,
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.25)',
    backgroundColor: 'rgba(102,126,234,0.05)',
  },
  reportReasonRowSelected: {
    borderColor: 'rgba(255,77,148,0.55)',
    backgroundColor: 'rgba(255,107,179,0.08)',
  },
  reportReasonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  reportReasonEmoji: {
    fontSize: 18,
    marginRight: 10,
  },
  reportReasonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 18,
  },
  reportCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(102,126,234,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  reportCheckboxChecked: {
    borderColor: 'rgba(255,77,148,0.85)',
    backgroundColor: 'rgba(255,107,179,0.14)',
  },
  reportUrgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,77,148,0.35)',
    backgroundColor: 'rgba(255,107,179,0.08)',
  },
  reportUrgentRowDisabled: {
    opacity: 0.5,
  },
  reportUrgentCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,77,148,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginRight: 10,
  },
  reportUrgentCheckboxChecked: {
    backgroundColor: 'rgba(255,77,148,0.18)',
  },
  reportUrgentCheckboxDisabled: {
    borderColor: 'rgba(255,77,148,0.25)',
  },
  reportActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  reportActionCancel: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderColor: 'rgba(0,0,0,0.06)',
  },
  reportActionSubmit: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  reportActionDisabled: {
    opacity: 0.6,
  },
  reportActionText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  reportCheckboxText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 16,
  },
  reportUrgentTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  reportUrgentSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.55)',
    lineHeight: 16,
  },
  reportUrgentTextDisabled: {
    color: 'rgba(0,0,0,0.4)',
  },
  reportDetailsInput: {
    minHeight: 92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.02)',
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  reportActions: {
    flexDirection: 'row',
    padding: 18,
    paddingTop: 0,
    gap: 12,
  },
});
