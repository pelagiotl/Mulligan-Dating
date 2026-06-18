import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { connectShellGradientStops } from '../lib/connectShellTheme';
import { iosFloatingTabBarInset } from '../utils/androidConnectShellChrome';
import OptimizedImage from '../components/OptimizedImage';
import { getPhotoUrl } from '../utils/photoUrl';
import { SOBER_CIRCLE_LEVELS, soberCircleLevelLabel } from '../constants/soberCircle';
import MatchCelebration from '../components/MatchCelebration';

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
};

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
  const { profile, refreshProfile } = useAuth();
  const { mode: shellMode } = useConnectShellTheme();
  const midnight = shellMode === 'midnight';
  const bottomPad = iosFloatingTabBarInset(insets.bottom) + 88;

  const level =
    (profile as { sober_circle_level?: string; soberCircleLevel?: string } | null)?.sober_circle_level ??
    (profile as { soberCircleLevel?: string } | null)?.soberCircleLevel ??
    null;

  const [savingLevel, setSavingLevel] = useState(false);
  const [changingLevel, setChangingLevel] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<BrowseProfile | null>(null);
  const [poolTotal, setPoolTotal] = useState(0);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<BrowseProfile | null>(null);

  const saveLevel = async (id: string) => {
    setSavingLevel(true);
    try {
      await api.put('/profile/sober-circle', { level: id });
      await refreshProfile();
      setChangingLevel(false);
      setCurrentProfile(null);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save level');
    } finally {
      setSavingLevel(false);
    }
  };

  const loadBrowse = useCallback(async (): Promise<{ profile: BrowseProfile | null; total: number }> => {
    if (!level) return { profile: null, total: 0 };
    setLoadingBrowse(true);
    try {
      const data = await api.get<{ profile: BrowseProfile | null; total?: number }>(
        '/users/browse?pool=sober&offset=0',
        false,
      );
      const total = data.total ?? 0;
      setPoolTotal(total);
      setCurrentProfile(data.profile ?? null);
      return { profile: data.profile ?? null, total };
    } catch (err: unknown) {
      setCurrentProfile(null);
      setPoolTotal(0);
      const msg = err instanceof Error ? err.message : '';
      if (msg) Alert.alert('Sober Circle', msg);
      return { profile: null, total: 0 };
    } finally {
      setLoadingBrowse(false);
    }
  }, [level]);

  useEffect(() => {
    if (level && !changingLevel) void loadBrowse();
  }, [level, changingLevel, loadBrowse]);

  const connectWithProfile = async (profileToConnect: BrowseProfile) => {
    setConnecting(true);
    try {
      try {
        Vibration.vibrate(Platform.OS === 'ios' ? [0, 30] : 30);
      } catch {
        // ignore
      }
      const result = await api.post<{ matchId: string; partnerIntroVideoUrl?: string | null }>(
        '/matches/connect',
        { targetUserId: profileToConnect.userId },
      );
      setMatchId(result.matchId);
      setMatchedProfile(profileToConnect);
      setShowCelebration(true);
      setCurrentProfile(null);
      void loadBrowse();
    } catch (err: unknown) {
      Alert.alert('Connect', err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleMainAction = async () => {
    if (connecting || loadingBrowse) return;

    if (currentProfile) {
      await connectWithProfile(currentProfile);
      return;
    }

    const { profile: found, total } = await loadBrowse();
    if (!found) {
      const hint =
        total > 0
          ? 'People are in the circle, but none match your preferences right now. Try updating distance or preferences in Profile.'
          : 'No one else is in the Sober Circle pool yet. Check back soon — or invite friends on a sober path.';
      Alert.alert('No match right now', hint);
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

  const actionLabel = currentProfile ? 'Connect in Sober Circle' : 'Find a Sober Circle match';
  const actionSub =
    currentProfile
      ? `Use a Mulligan to connect with ${currentProfile.displayName}`
      : poolTotal > 0
        ? `${poolTotal} in the pool — tap to get a random match`
        : 'Tap to search the sober connect pool';

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
          Tap the button below to get matched with someone else in the circle. Sobriety level shows here only.
        </Text>

        {loadingBrowse && !currentProfile ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={midnight ? '#f472b6' : '#16a34a'} />
        ) : currentProfile ? (
          <View style={[styles.profileCard, midnight && styles.profileCardMidnight]}>
            <Text style={[styles.matchFoundLabel, midnight && styles.leadMidnight]}>Your match</Text>
            {currentProfile.photoUrl ? (
              <OptimizedImage
                source={getPhotoUrl(currentProfile.photoUrl)}
                style={styles.photo}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>
                  {currentProfile.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.name, midnight && styles.textLight]}>
              {currentProfile.displayName}, {currentProfile.age}
            </Text>
            <Text style={[styles.meta, midnight && styles.leadMidnight]}>
              💚 {soberCircleLevelLabel(currentProfile.soberCircleLevel ?? level)}
              {currentProfile.location ? ` · 📍 ${currentProfile.location}` : ''}
            </Text>
            {currentProfile.bio ? (
              <Text style={[styles.bio, midnight && styles.leadMidnight]} numberOfLines={3}>
                {currentProfile.bio}
              </Text>
            ) : null}
            <TouchableOpacity onPress={() => void loadBrowse()} style={styles.refreshLink}>
              <Text style={styles.refreshText}>Show me someone else</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.emptyCard, midnight && styles.emptyCardMidnight]}>
            <Text style={styles.emptyEmoji}>🌿</Text>
            <Text style={[styles.emptyTitle, midnight && styles.textLight]}>Ready when you are</Text>
            <Text style={[styles.emptySub, midnight && styles.leadMidnight]}>
              {poolTotal > 0
                ? `${poolTotal} ${poolTotal === 1 ? 'person is' : 'people are'} in the sober pool. Tap below to get a random match.`
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
          disabled={connecting || loadingBrowse}
          activeOpacity={0.9}
        >
          <LinearGradient colors={['#22c55e', '#16a34a', '#667eea']} style={styles.connectGrad}>
            {connecting || loadingBrowse ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.connectText}>{actionLabel}</Text>
                <Text style={styles.connectSub}>{actionSub}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {showCelebration && matchedProfile ? (
        <MatchCelebration
          profileName={matchedProfile.displayName}
          photoUrl={matchedProfile.photoUrl}
          matchId={matchId}
          skipLoadingReveal={false}
          revealWhenMatchIdReady
          onClose={() => {
            setShowCelebration(false);
            setMatchId(null);
            setMatchedProfile(null);
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
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyCardMidnight: { backgroundColor: 'rgba(30,27,46,0.85)' },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
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
    overflow: 'hidden',
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
  },
  connectText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  connectSub: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
