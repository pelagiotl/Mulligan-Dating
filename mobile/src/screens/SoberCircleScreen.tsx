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

export default function SoberCircleScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { mode: shellMode } = useConnectShellTheme();
  const midnight = shellMode === 'midnight';
  const bottomPad = iosFloatingTabBarInset(insets.bottom) + 16;

  const level =
    (profile as { sober_circle_level?: string; soberCircleLevel?: string } | null)?.sober_circle_level ??
    (profile as { soberCircleLevel?: string } | null)?.soberCircleLevel ??
    null;

  const [savingLevel, setSavingLevel] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<BrowseProfile | null>(null);
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
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save level');
    } finally {
      setSavingLevel(false);
    }
  };

  const loadBrowse = useCallback(async () => {
    if (!level) return;
    setLoadingBrowse(true);
    try {
      const data = await api.get<{ profile: BrowseProfile | null }>('/users/browse?pool=sober&offset=0', false);
      setCurrentProfile(data.profile ?? null);
    } catch (err: unknown) {
      setCurrentProfile(null);
      const msg = err instanceof Error ? err.message : '';
      if (msg && !msg.includes('locked')) Alert.alert('Sober Circle', msg);
    } finally {
      setLoadingBrowse(false);
    }
  }, [level]);

  useEffect(() => {
    if (level) void loadBrowse();
  }, [level, loadBrowse]);

  const connect = async () => {
    if (!currentProfile) return;
    setConnecting(true);
    try {
      const result = await api.post<{ matchId: string; partnerIntroVideoUrl?: string | null }>(
        '/matches/connect',
        { targetUserId: currentProfile.userId },
      );
      setMatchId(result.matchId);
      setMatchedProfile(currentProfile);
      setShowCelebration(true);
      setCurrentProfile(null);
      void loadBrowse();
    } catch (err: unknown) {
      Alert.alert('Connect', err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  if (!level) {
    return (
      <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: bottomPad }]}>
          <Text style={[styles.title, midnight && styles.textLight]}>Sober Circle</Text>
          <Text style={[styles.lead, midnight && styles.leadMidnight]}>
            A trust-based space to connect with others on a sober or sober-curious path. Pick your level once — you
            can update it anytime in Profile.
          </Text>
          {SOBER_CIRCLE_LEVELS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.levelCard, midnight && styles.levelCardMidnight]}
              onPress={() => saveLevel(opt.id)}
              disabled={savingLevel}
              activeOpacity={0.85}
            >
              <Text style={styles.levelEmoji}>{opt.emoji}</Text>
              <View style={styles.levelText}>
                <Text style={[styles.levelLabel, midnight && styles.textLight]}>{opt.label}</Text>
                <Text style={[styles.levelSub, midnight && styles.leadMidnight]}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {savingLevel ? <ActivityIndicator style={{ marginTop: 16 }} color="#764ba2" /> : null}
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}>
        <Text style={[styles.title, midnight && styles.textLight]}>Sober Circle</Text>
        <View style={[styles.levelPill, midnight && styles.levelPillMidnight]}>
          <Text style={[styles.levelPillText, midnight && styles.textLight]}>
            💚 {soberCircleLevelLabel(level)}
          </Text>
        </View>
        <Text style={[styles.lead, midnight && styles.leadMidnight]}>
          Connect with others in the circle. Sobriety level shows next to names here only.
        </Text>

        {loadingBrowse ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={midnight ? '#f472b6' : '#8B1538'} />
        ) : !currentProfile ? (
          <View style={[styles.emptyCard, midnight && styles.emptyCardMidnight]}>
            <Text style={styles.emptyEmoji}>🌿</Text>
            <Text style={[styles.emptyTitle, midnight && styles.textLight]}>No one in the circle right now</Text>
            <Text style={[styles.emptySub, midnight && styles.leadMidnight]}>Check back soon — more members join every week.</Text>
            <TouchableOpacity onPress={() => void loadBrowse()} style={styles.refreshLink}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.profileCard, midnight && styles.profileCardMidnight]}>
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
              💚 {soberCircleLevelLabel((currentProfile as { soberCircleLevel?: string }).soberCircleLevel ?? level)}
              {currentProfile.location ? ` · 📍 ${currentProfile.location}` : ''}
            </Text>
            {currentProfile.bio ? (
              <Text style={[styles.bio, midnight && styles.leadMidnight]} numberOfLines={3}>
                {currentProfile.bio}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.connectBtn} onPress={connect} disabled={connecting} activeOpacity={0.85}>
              <LinearGradient colors={['#22c55e', '#16a34a', '#667eea']} style={styles.connectGrad}>
                {connecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.connectText}>Connect in Sober Circle</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

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
  levelEmoji: { fontSize: 28, marginRight: 14 },
  levelText: { flex: 1 },
  levelLabel: { fontSize: 16, fontWeight: '700', color: '#1e1b4b' },
  levelSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  levelPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
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
  emptySub: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 6 },
  refreshLink: { marginTop: 12 },
  refreshText: { color: '#764ba2', fontWeight: '700' },
  profileCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.2)',
  },
  profileCardMidnight: {
    backgroundColor: 'rgba(26,22,40,0.92)',
    borderColor: 'rgba(167,139,250,0.28)',
  },
  photo: { width: 120, height: 120, borderRadius: 60, marginBottom: 12 },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#764ba2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoPlaceholderText: { fontSize: 40, color: '#fff', fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: '#1e1b4b' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center' },
  bio: { fontSize: 14, lineHeight: 20, color: '#334155', marginTop: 10, textAlign: 'center' },
  connectBtn: { marginTop: 16, alignSelf: 'stretch', borderRadius: 999, overflow: 'hidden' },
  connectGrad: { paddingVertical: Platform.OS === 'ios' ? 14 : 12, alignItems: 'center' },
  connectText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
