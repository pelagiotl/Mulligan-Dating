import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Vibration,
  Modal,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { connectShellGradientStops, soberCircleButtonShimmerColors } from '../lib/connectShellTheme';
import { iosFloatingTabBarInset } from '../utils/androidConnectShellChrome';
import OptimizedImage from '../components/OptimizedImage';
import { getPhotoUrl } from '../utils/photoUrl';
import { SOBER_CIRCLE_LEVELS, soberCircleLevelLabel } from '../constants/soberCircle';
import MatchCelebration from '../components/MatchCelebration';
import IntentionalDatePlanner from '../components/IntentionalDatePlanner';
import ConnectButtonShimmerEffect, { CONNECT_SHIMMER_DURATION_MS } from '../components/ConnectButtonShimmerEffect';
import SmoothPulsingEmoji from '../components/SmoothPulsingEmoji';
import type { SoberCircleStackParamList } from '../navigation/SoberCircleNavigator';
import { setPendingOpenMatchId } from '../utils/pendingMatchOpen';

type BrowseProfile = {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  location?: string;
  bio?: string;
  photoUrl?: string;
  soberCircleLevel?: string;
  photoVerified?: boolean;
};

type SoberMatch = {
  id: string;
  stage: string;
  unreadCount?: number;
  otherUser: {
    userId: string;
    displayName: string;
    age: number;
    photoUrl?: string | null;
    soberCircleLevel?: string | null;
    photoVerified?: boolean;
  };
};

type NoMatchModalProps = {
  visible: boolean;
  midnight: boolean;
  poolHasPeople: boolean;
  onClose: () => void;
  onTryAgain: () => void;
  onUpdateProfile: () => void;
};

function NoMatchModal({
  visible,
  midnight,
  poolHasPeople,
  onClose,
  onTryAgain,
  onUpdateProfile,
}: NoMatchModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.noMatchOverlay}>
        <LinearGradient
          colors={['#22c55e', '#16a34a', '#667eea', '#4ade80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.noMatchCard, midnight && styles.noMatchCardMidnight]}>
          <LinearGradient
            colors={midnight ? ['#1a1628', '#1e1b2e', '#162016'] : ['#f0fdf4', '#ffffff', '#ecfdf5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.noMatchCardInner}
          >
            <View style={styles.noMatchEmojiRing}>
              <Text style={styles.noMatchEmoji}>{poolHasPeople ? '🔍' : '🌿'}</Text>
            </View>
            <Text style={[styles.noMatchTitle, midnight && styles.textLight]}>No match right now</Text>
            <Text style={[styles.noMatchBody, midnight && styles.leadMidnight]}>
              {poolHasPeople
                ? 'People are in the circle, but none fit your preferences today. Try widening distance or updating who you want to meet.'
                : 'The sober pool is still growing. Check back soon — or invite friends on a sober path.'}
            </Text>
            <TouchableOpacity style={styles.noMatchPrimaryBtn} onPress={onTryAgain} activeOpacity={0.88}>
              <LinearGradient colors={['#22c55e', '#16a34a', '#667eea']} style={styles.noMatchPrimaryGrad}>
                <Text style={styles.noMatchPrimaryText}>Try again 🌿</Text>
              </LinearGradient>
            </TouchableOpacity>
            {poolHasPeople ? (
              <TouchableOpacity onPress={onUpdateProfile} style={styles.noMatchSecondaryBtn} activeOpacity={0.8}>
                <Text style={styles.noMatchSecondaryText}>Update preferences</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} style={styles.noMatchDismiss} activeOpacity={0.7}>
              <Text style={[styles.noMatchDismissText, midnight && styles.leadMidnight]}>Not now</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

function LevelPicker({
  midnight,
  currentLevel,
  savingLevel,
  onSelect,
  onCancel,
}: {
  midnight: boolean;
  currentLevel: string | null;
  savingLevel: boolean;
  onSelect: (id: string) => void;
  onCancel?: () => void;
}) {
  return (
    <View style={styles.levelPickerWrap}>
      {onCancel ? (
        <TouchableOpacity onPress={onCancel} style={styles.changeCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.changeCancelText, midnight && styles.leadMidnight]}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
      {SOBER_CIRCLE_LEVELS.map((opt) => {
        const selected = currentLevel === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            style={[
              styles.levelCard,
              midnight && styles.levelCardMidnight,
              selected && styles.levelCardSelected,
              selected && midnight && styles.levelCardSelectedMidnight,
            ]}
            onPress={() => onSelect(opt.id)}
            disabled={savingLevel}
            activeOpacity={0.85}
          >
            <Text style={styles.levelEmoji}>{opt.emoji}</Text>
            <View style={styles.levelText}>
              <Text style={[styles.levelLabel, midnight && styles.textLight]}>{opt.label}</Text>
              <Text style={[styles.levelSub, midnight && styles.leadMidnight]}>{opt.sub}</Text>
            </View>
            {selected ? <Text style={styles.levelCheck}>✓</Text> : null}
          </TouchableOpacity>
        );
      })}
      {savingLevel ? <ActivityIndicator style={{ marginTop: 16 }} color="#22c55e" /> : null}
    </View>
  );
}

export default function SoberCircleScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = useNavigation<StackNavigationProp<SoberCircleStackParamList, 'SoberCircleHome'>>();
  const { user, profile, refreshProfile, registerMatchListRefresh } = useAuth();
  const { mode: shellMode } = useConnectShellTheme();
  const midnight = shellMode === 'midnight';
  const bottomPad = iosFloatingTabBarInset(insets.bottom) + 88;
  const matchButtonSweepWidth = Math.max(280, windowWidth - 48);

  const matchButtonPulse = useRef(new Animated.Value(1)).current;
  const matchButtonShimmer = useRef(new Animated.Value(0)).current;
  const matchButtonScale = useRef(new Animated.Value(1)).current;
  const matchButtonLoopsRef = useRef<{
    pulseLoop: Animated.CompositeAnimation;
    shimmerLoop: Animated.CompositeAnimation;
  } | null>(null);

  const startMatchButtonAnimations = useCallback(() => {
    const loops = matchButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      matchButtonLoopsRef.current = null;
    }
    matchButtonPulse.setValue(1);
    matchButtonShimmer.stopAnimation();
    matchButtonShimmer.setValue(0);
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(matchButtonPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(matchButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(matchButtonShimmer, {
          toValue: 1,
          duration: CONNECT_SHIMMER_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(50),
        Animated.timing(matchButtonShimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    pulseLoop.start();
    shimmerLoop.start();
    matchButtonLoopsRef.current = { pulseLoop, shimmerLoop };
  }, [matchButtonPulse, matchButtonShimmer]);

  const stopMatchButtonAnimations = useCallback(() => {
    const loops = matchButtonLoopsRef.current;
    if (loops) {
      loops.pulseLoop.stop();
      loops.shimmerLoop.stop();
      matchButtonLoopsRef.current = null;
    }
    matchButtonPulse.setValue(1);
    matchButtonShimmer.stopAnimation();
    matchButtonShimmer.setValue(0);
  }, [matchButtonPulse, matchButtonShimmer]);

  const viewerSoberLevel =
    (profile as { sober_circle_level?: string; soberCircleLevel?: string } | null)?.sober_circle_level ??
    (profile as { soberCircleLevel?: string } | null)?.soberCircleLevel ??
    null;
  const viewerDisplayName =
    (profile as { display_name?: string; displayName?: string } | null)?.display_name ??
    (profile as { displayName?: string } | null)?.displayName ??
    'You';

  const level =
    (profile as { sober_circle_level?: string; soberCircleLevel?: string } | null)?.sober_circle_level ??
    (profile as { soberCircleLevel?: string } | null)?.soberCircleLevel ??
    null;

  const [savingLevel, setSavingLevel] = useState(false);
  const [changingLevel, setChangingLevel] = useState(false);
  const [poolTotal, setPoolTotal] = useState(0);
  const [loadingPoolTotal, setLoadingPoolTotal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [datePlannerOpen, setDatePlannerOpen] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<BrowseProfile | null>(null);
  const [matchedIntroVideoUrl, setMatchedIntroVideoUrl] = useState<string | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<{
    reasons: string[];
    sharedInterests: string[];
    sharedValues: number;
  } | null>(null);
  const [soberMatches, setSoberMatches] = useState<SoberMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [noMatchModal, setNoMatchModal] = useState<{ visible: boolean; poolHasPeople: boolean }>({
    visible: false,
    poolHasPeople: false,
  });

  useFocusEffect(
    useCallback(() => {
      if (!level || changingLevel) return () => {};
      const timeoutId = setTimeout(() => {
        if (isFocused) startMatchButtonAnimations();
      }, 80);
      return () => {
        clearTimeout(timeoutId);
        stopMatchButtonAnimations();
      };
    }, [level, changingLevel, isFocused, startMatchButtonAnimations, stopMatchButtonAnimations]),
  );

  const loadSoberMatches = useCallback(async () => {
    if (!level) return;
    setLoadingMatches(true);
    try {
      const data = await api.get<{ matches: SoberMatch[] }>('/matches?pool=sober', false);
      setSoberMatches(data.matches ?? []);
    } catch {
      setSoberMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [level]);

  useFocusEffect(
    useCallback(() => {
      if (level && !changingLevel) void loadSoberMatches();
    }, [level, changingLevel, loadSoberMatches]),
  );

  useEffect(() => {
    registerMatchListRefresh(() => {
      void loadSoberMatches();
    });
    return () => registerMatchListRefresh(null);
  }, [registerMatchListRefresh, loadSoberMatches]);

  const openSoberChat = useCallback(
    (id: string) => {
      setPendingOpenMatchId(id);
      navigation.navigate('SoberCircleChat', { matchId: id, soberCircleMode: true });
    },
    [navigation],
  );

  const saveLevel = async (id: string) => {
    setSavingLevel(true);
    try {
      await api.put('/profile/sober-circle', { level: id });
      await refreshProfile();
      setChangingLevel(false);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save level');
    } finally {
      setSavingLevel(false);
    }
  };

  /** Pool count only — does not reveal a candidate on screen (Connect-style landing). */
  const refreshPoolTotal = useCallback(async () => {
    if (!level) return;
    setLoadingPoolTotal(true);
    try {
      const data = await api.get<{ total?: number }>('/users/browse?pool=sober&offset=0', false);
      setPoolTotal(data.total ?? 0);
    } catch {
      setPoolTotal(0);
    } finally {
      setLoadingPoolTotal(false);
    }
  }, [level]);

  useEffect(() => {
    if (level && !changingLevel) void refreshPoolTotal();
  }, [level, changingLevel, refreshPoolTotal]);

  const connectWithProfile = async (profileToConnect: BrowseProfile) => {
    const result = await api.post<{
      matchId: string;
      existingMatch?: boolean;
      partnerIntroVideoUrl?: string | null;
      explanation?: { reasons: string[]; sharedInterests: string[]; sharedValues: number } | null;
    }>('/matches/connect', { targetUserId: profileToConnect.userId, source: 'sober_circle' });

    if (result.existingMatch) {
      openSoberChat(result.matchId);
      void refreshPoolTotal();
      return;
    }

    setMatchId(result.matchId);
    setMatchedProfile(profileToConnect);
    setMatchedIntroVideoUrl(result.partnerIntroVideoUrl ?? null);
    setMatchExplanation(result.explanation ?? null);
    setShowCelebration(true);
    void refreshPoolTotal();
    void loadSoberMatches();
  };

  const handleMainAction = async () => {
    if (connecting || loadingPoolTotal) return;

    setConnecting(true);
    try {
      try {
        Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30);
      } catch {
        // ignore
      }

      const data = await api.get<{ profile: BrowseProfile | null; total?: number }>(
        '/users/browse?pool=sober&offset=0',
        false,
      );
      const total = data.total ?? 0;
      setPoolTotal(total);

      if (!data.profile) {
        setNoMatchModal({ visible: true, poolHasPeople: total > 0 });
        return;
      }

      await connectWithProfile(data.profile);
    } catch (err: unknown) {
      Alert.alert('Sober Circle', err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  if (!level || changingLevel) {
    return (
      <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: bottomPad }]}>
          <Text style={[styles.title, midnight && styles.textLight]}>Sober Circle</Text>
          <Text style={[styles.lead, midnight && styles.leadMidnight]}>
            A trust-based space to connect with others on a sober or sober-curious path. Choose the level that fits
            you — you can change it anytime.
          </Text>
          <LevelPicker
            midnight={midnight}
            currentLevel={level}
            savingLevel={savingLevel}
            onSelect={saveLevel}
            onCancel={level ? () => setChangingLevel(false) : undefined}
          />
        </ScrollView>
      </LinearGradient>
    );
  }

  const actionLabel = 'Find a Sober Circle match';
  const actionSub =
    poolTotal > 0
      ? `${poolTotal} in the pool — tap to connect with someone new`
      : 'Tap to search the sober connect pool';
  const findingMatch = connecting || loadingPoolTotal;

  return (
    <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}>
        <Text style={[styles.title, midnight && styles.textLight]}>Sober Circle</Text>

        <View style={styles.levelRow}>
          <View style={[styles.levelPill, midnight && styles.levelPillMidnight]}>
            <Text style={[styles.levelPillText, midnight && styles.textLight]}>
              💚 {soberCircleLevelLabel(level)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setChangingLevel(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.lead, midnight && styles.leadMidnight]}>
          Tap below when you are ready — we will find someone in the circle and connect you. No one is shown until
          you tap.
        </Text>

        {soberMatches.length > 0 ? (
          <View style={styles.matchesSection}>
            <View style={styles.matchesSectionHeader}>
              <Text style={[styles.matchesSectionTitle, midnight && styles.textLight]}>Your circle matches</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SoberCircleChat', { soberCircleMode: true })}
              >
                <Text style={styles.matchesSectionLink}>See all →</Text>
              </TouchableOpacity>
            </View>
            {soberMatches.slice(0, 3).map((m) => {
              const photo = m.otherUser.photoUrl;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.matchRow, midnight && styles.matchRowMidnight]}
                  onPress={() => openSoberChat(m.id)}
                  activeOpacity={0.85}
                >
                  {photo ? (
                    <OptimizedImage source={getPhotoUrl(photo)} style={styles.matchRowPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.matchRowPhotoPlaceholder}>
                      <Text style={styles.matchRowPhotoLetter}>
                        {m.otherUser.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.matchRowText}>
                    <Text style={[styles.matchRowName, midnight && styles.textLight]} numberOfLines={1}>
                      {m.otherUser.displayName}
                    </Text>
                    <Text style={[styles.matchRowMeta, midnight && styles.leadMidnight]} numberOfLines={1}>
                      💚 {soberCircleLevelLabel(m.otherUser.soberCircleLevel ?? level)}
                    </Text>
                  </View>
                  <View style={styles.matchRowCta}>
                    {m.unreadCount && m.unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{m.unreadCount > 9 ? '9+' : m.unreadCount}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.matchRowMessage}>Message 💬</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : loadingMatches ? (
          <ActivityIndicator style={{ marginBottom: 12 }} color={midnight ? '#4ade80' : '#16a34a'} />
        ) : null}

        {loadingPoolTotal && soberMatches.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={midnight ? '#4ade80' : '#16a34a'} />
        ) : (
          <View style={[styles.emptyCard, midnight && styles.emptyCardMidnight]}>
            <SmoothPulsingEmoji emoji="🌿" fontSize={40} variant="emoji" containerStyle={styles.emptyEmojiWrap} />
            <Text style={[styles.emptyTitle, midnight && styles.textLight]}>Ready when you are</Text>
            <Text style={[styles.emptySub, midnight && styles.leadMidnight]}>
              {poolTotal > 0
                ? `${poolTotal} ${poolTotal === 1 ? 'person is' : 'people are'} in the sober pool. Tap below when you want us to pick someone and connect you.`
                : 'Be the first to find a match — tap below and we\'ll search the sober connect pool for you.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.connectButtonFixed,
          { bottom: iosFloatingTabBarInset(insets.bottom) + 8 },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.connectBtnOuter}
          onPress={() => void handleMainAction()}
          onPressIn={() => {
            if (findingMatch) return;
            try {
              Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30);
            } catch (_) {}
            Animated.timing(matchButtonScale, {
              toValue: 0.96,
              duration: 30,
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.spring(matchButtonScale, {
              toValue: 1,
              friction: 6,
              tension: 300,
              useNativeDriver: true,
            }).start();
          }}
          disabled={findingMatch}
          activeOpacity={1}
        >
          <Animated.View
            style={{
              transform: [{ scale: Animated.multiply(matchButtonPulse, matchButtonScale) }],
            }}
          >
            <LinearGradient colors={['#22c55e', '#16a34a', '#667eea']} style={styles.connectGrad}>
              <ConnectButtonShimmerEffect
                key={`sober-match-shimmer-${shellMode}`}
                shell={shellMode}
                colors={soberCircleButtonShimmerColors}
                progress={matchButtonShimmer}
                borderRadius={28}
                sweepWidth={matchButtonSweepWidth}
                showHearts={false}
              />
              {findingMatch ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.connectText}>{actionLabel}</Text>
                  <Text style={styles.connectSub}>{actionSub}</Text>
                </>
              )}
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <NoMatchModal
        visible={noMatchModal.visible}
        midnight={midnight}
        poolHasPeople={noMatchModal.poolHasPeople}
        onClose={() => setNoMatchModal((s) => ({ ...s, visible: false }))}
        onTryAgain={() => {
          setNoMatchModal((s) => ({ ...s, visible: false }));
          void handleMainAction();
        }}
        onUpdateProfile={() => {
          setNoMatchModal((s) => ({ ...s, visible: false }));
          const parent = navigation.getParent();
          parent?.navigate('MyProfile' as never);
        }}
      />

      {showCelebration && matchedProfile ? (
        <MatchCelebration
          profileName={matchedProfile.displayName}
          photoUrl={matchedProfile.photoUrl}
          introVideoUrl={matchedIntroVideoUrl}
          explanation={matchExplanation}
          matchId={matchId}
          celebrationFlow="sober_circle"
          partnerSoberLevel={matchedProfile.soberCircleLevel ?? null}
          viewerSoberLevel={viewerSoberLevel}
          viewerName={viewerDisplayName.split(' ')[0] || 'You'}
          skipLoadingReveal={false}
          revealWhenMatchIdReady
          onSeeDateIdeas={() => {
            setShowCelebration(false);
            setDatePlannerOpen(true);
          }}
          onClose={() => {
            setShowCelebration(false);
            setMatchId(null);
            setMatchedProfile(null);
            setMatchedIntroVideoUrl(null);
            setMatchExplanation(null);
            void loadSoberMatches();
          }}
        />
      ) : null}

      {datePlannerOpen && matchId && user?.id && matchedProfile ? (
        <IntentionalDatePlanner
          visible={datePlannerOpen}
          onClose={() => setDatePlannerOpen(false)}
          matchId={matchId}
          partnerName={matchedProfile.displayName || 'your match'}
          currentUserId={user.id}
          isCurrentUserMatchUser1
          onProposalSent={() => {
            const chatMatchId = matchId;
            setDatePlannerOpen(false);
            setShowCelebration(false);
            setMatchId(null);
            setMatchedProfile(null);
            setMatchedIntroVideoUrl(null);
            setMatchExplanation(null);
            void loadSoberMatches();
            if (chatMatchId) openSoberChat(chatMatchId);
          }}
        />
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#1e1b4b', marginBottom: 8 },
  textLight: { color: '#f8fafc' },
  lead: { fontSize: 14, lineHeight: 20, color: '#475569', marginBottom: 16 },
  leadMidnight: { color: 'rgba(248,250,252,0.75)' },
  levelPickerWrap: { marginTop: 4 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  levelCardMidnight: {
    backgroundColor: 'rgba(26,22,40,0.9)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  levelCardSelected: {
    borderColor: '#22c55e',
    borderWidth: 2,
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  levelCardSelectedMidnight: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: '#4ade80',
  },
  levelEmoji: { fontSize: 28, marginRight: 14 },
  levelText: { flex: 1 },
  levelLabel: { fontSize: 16, fontWeight: '700', color: '#1e1b4b' },
  levelSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  levelCheck: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  changeLink: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
  changeCancel: { alignSelf: 'flex-end', marginBottom: 8 },
  changeCancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  levelPill: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  levelPillMidnight: { backgroundColor: 'rgba(34,197,94,0.2)' },
  levelPillText: { fontSize: 13, fontWeight: '700', color: '#166534' },
  matchesSection: { marginBottom: 16 },
  matchesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchesSectionTitle: { fontSize: 16, fontWeight: '800', color: '#1e1b4b' },
  matchesSectionLink: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
  },
  matchRowMidnight: {
    backgroundColor: 'rgba(26,22,40,0.92)',
    borderColor: 'rgba(34,197,94,0.32)',
  },
  matchRowPhoto: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  matchRowPhotoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchRowPhotoLetter: { color: '#fff', fontSize: 20, fontWeight: '800' },
  matchRowText: { flex: 1, minWidth: 0 },
  matchRowName: { fontSize: 15, fontWeight: '700', color: '#1e1b4b' },
  matchRowMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  matchRowCta: { alignItems: 'flex-end', marginLeft: 8 },
  matchRowMessage: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  unreadBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginBottom: 4,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyCardMidnight: { backgroundColor: 'rgba(30,27,46,0.85)' },
  emptyEmojiWrap: { marginBottom: 8, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b' },
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  matchFoundLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 10,
  },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  profileCardMidnight: {
    backgroundColor: 'rgba(26,22,40,0.92)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  photo: { width: 120, height: 120, borderRadius: 60, marginBottom: 12 },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoPlaceholderText: { fontSize: 40, color: '#fff', fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: '#1e1b4b' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  meta: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' },
  bio: { fontSize: 14, lineHeight: 20, color: '#334155', marginTop: 10, textAlign: 'center' },
  refreshLink: { marginTop: 14 },
  refreshText: { color: '#16a34a', fontWeight: '700', fontSize: 14 },
  connectButtonFixed: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 10,
  },
  connectBtnOuter: {
    borderRadius: 999,
    overflow: 'visible',
    shadowColor: '#16a34a',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  connectGrad: {
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  connectText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  connectSub: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  noMatchOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noMatchCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#16a34a',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  noMatchCardMidnight: {
    shadowColor: '#4ade80',
  },
  noMatchCardInner: {
    padding: 28,
    alignItems: 'center',
  },
  noMatchEmojiRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(34,197,94,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  noMatchEmoji: { fontSize: 36 },
  noMatchTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e1b4b',
    textAlign: 'center',
    marginBottom: 8,
  },
  noMatchBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  noMatchPrimaryBtn: {
    alignSelf: 'stretch',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  noMatchPrimaryGrad: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  noMatchPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  noMatchSecondaryBtn: { paddingVertical: 8 },
  noMatchSecondaryText: { color: '#16a34a', fontSize: 14, fontWeight: '700' },
  noMatchDismiss: { marginTop: 4, paddingVertical: 6 },
  noMatchDismissText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
});
