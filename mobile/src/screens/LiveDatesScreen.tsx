import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../utils/api';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { connectShellGradientStops } from '../lib/connectShellTheme';
import { iosFloatingTabBarInset } from '../utils/androidConnectShellChrome';

type LiveEvent = {
  id: string;
  title: string;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  eventAt: string;
  foodTrucks: string[];
  capacity: number;
  signupCount: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  isSignedUp: boolean;
};

function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function LiveDatesScreen() {
  const insets = useSafeAreaInsets();
  const { mode: shellMode } = useConnectShellTheme();
  const midnight = shellMode === 'midnight';
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingUp, setSigningUp] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ events: LiveEvent[] }>('/live-dates/events', false);
      setEvents(data.events ?? []);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signup = async (eventId: string) => {
    setSigningUp(eventId);
    try {
      await api.post('/live-dates/signup', { eventId });
      await load();
      Alert.alert('You\'re in! 🎟️', 'Your ticket is saved. We\'ll send a reminder before the event.');
    } catch (err: unknown) {
      Alert.alert('Signup failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSigningUp(null);
    }
  };

  const bottomPad = iosFloatingTabBarInset(insets.bottom) + 16;

  return (
    <LinearGradient colors={connectShellGradientStops(shellMode)} style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
        }
      >
        <Text style={[styles.title, midnight && styles.titleMidnight]}>Live Dates</Text>
        <Text style={[styles.lead, midnight && styles.leadMidnight]}>
          In-person mixers across Southern Oregon — meet matches IRL with good food and good vibes.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={midnight ? '#f472b6' : '#8B1538'} />
        ) : events.length === 0 ? (
          <View style={[styles.emptyCard, midnight && styles.emptyCardMidnight]}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={[styles.emptyTitle, midnight && styles.textLight]}>No upcoming events yet</Text>
            <Text style={[styles.emptySub, midnight && styles.leadMidnight]}>Check back soon — new mixers drop regularly.</Text>
          </View>
        ) : (
          events.map((event) => (
            <View key={event.id} style={[styles.card, midnight && styles.cardMidnight]}>
              {event.isSignedUp ? (
                <View style={styles.ticketBadge}>
                  <Text style={styles.ticketBadgeText}>🎟️ Your ticket</Text>
                </View>
              ) : null}
              <Text style={[styles.cardTitle, midnight && styles.textLight]}>{event.title}</Text>
              <Text style={[styles.when, midnight && styles.leadMidnight]}>{formatEventWhen(event.eventAt)}</Text>
              {event.venueName ? (
                <Text style={[styles.venue, midnight && styles.leadMidnight]}>
                  📍 {event.venueName}
                  {event.venueAddress ? ` · ${event.venueAddress}` : ''}
                </Text>
              ) : null}
              {event.description ? (
                <Text style={[styles.desc, midnight && styles.leadMidnight]}>{event.description}</Text>
              ) : null}
              {event.foodTrucks.length > 0 ? (
                <Text style={[styles.food, midnight && styles.leadMidnight]}>
                  🚚 {event.foodTrucks.join(' · ')}
                </Text>
              ) : null}
              <Text style={[styles.counter, midnight && styles.leadMidnight]}>
                {event.signupCount} signed up ({event.maleCount} guys · {event.femaleCount} girls
                {event.otherCount > 0 ? ` · ${event.otherCount} other` : ''}) · cap {event.capacity}
              </Text>
              {!event.isSignedUp ? (
                <TouchableOpacity
                  style={styles.signupBtn}
                  onPress={() => signup(event.id)}
                  disabled={signingUp === event.id}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#f5576c', '#f093fb', '#667eea']} style={styles.signupGrad}>
                    {signingUp === event.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.signupText}>Sign Up</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#1e1b4b', marginBottom: 6 },
  titleMidnight: { color: '#f8fafc' },
  lead: { fontSize: 14, lineHeight: 20, color: '#475569', marginBottom: 20 },
  leadMidnight: { color: 'rgba(248,250,252,0.75)' },
  textLight: { color: '#f1f5f9' },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.2)',
  },
  emptyCardMidnight: {
    backgroundColor: 'rgba(30,27,46,0.85)',
    borderColor: 'rgba(244,114,182,0.25)',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1e1b4b', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', color: '#64748b' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.22)',
    shadowColor: '#667eea',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardMidnight: {
    backgroundColor: 'rgba(26,22,40,0.92)',
    borderColor: 'rgba(167,139,250,0.28)',
  },
  ticketBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  ticketBadgeText: { fontSize: 12, fontWeight: '700', color: '#15803d' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1e1b4b', marginBottom: 4 },
  when: { fontSize: 14, fontWeight: '600', color: '#5b21b6', marginBottom: 6 },
  venue: { fontSize: 13, color: '#475569', marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 20, color: '#334155', marginBottom: 8 },
  food: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  counter: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 12 },
  signupBtn: { borderRadius: 999, overflow: 'hidden' },
  signupGrad: { paddingVertical: Platform.OS === 'ios' ? 14 : 12, alignItems: 'center' },
  signupText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
