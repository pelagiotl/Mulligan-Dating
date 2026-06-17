import React from 'react';
import { View, Text, ImageBackground, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { budgetDisplay, formatVenuePinLabel, getDatePlanLaneVisual } from '../utils/datePlanLaneVisuals';

export type DatePlanMessageSnapshot = {
  id: string;
  title: string;
  description: string;
  laneId?: string;
  venueName?: string;
  venueAddress?: string;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: 'low' | 'medium' | 'high';
};

function formatPlanWhen(plan: DatePlanMessageSnapshot): string | null {
  if (!plan.suggestedDate) return null;
  const datePart = plan.suggestedDate.split('T')[0];
  const d = new Date(datePart + (plan.suggestedTime ? `T${plan.suggestedTime}` : 'T12:00'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function planDescriptionPreview(description: string): string {
  return description.split('\n\n')[0]?.trim() || description.trim();
}

export default function DatePlanProposalMessageCard({
  plan,
  proposerName,
}: {
  plan: DatePlanMessageSnapshot;
  proposerName: string;
}) {
  const visual = getDatePlanLaneVisual(plan.laneId);
  const budget = budgetDisplay(plan.budgetRange);
  const when = formatPlanWhen(plan);

  return (
    <View style={styles.card}>
      <View style={[styles.hero, styles.heroWrap]}>
        <LinearGradient
          colors={[visual.gradientFrom, visual.gradientTo]}
          style={StyleSheet.absoluteFill}
        />
        <ImageBackground
          source={{ uri: visual.imageUrl }}
          style={StyleSheet.absoluteFill}
          imageStyle={styles.heroImage}
          resizeMode="cover"
        >
        <LinearGradient
          colors={['rgba(15,10,30,0.12)', 'rgba(15,10,30,0.88)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBadges}>
          <View style={styles.laneBadge}>
            <Text style={styles.laneBadgeText}>
              {visual.emoji} {visual.label}
            </Text>
          </View>
          {plan.budgetRange ? (
            <View style={styles.budgetPill}>
              <Text style={styles.budgetPillText}>{budget.tier}</Text>
            </View>
          ) : null}
        </View>
      </ImageBackground>
      </View>
      <View style={styles.body}>
        <Text style={styles.eyebrow}>📅 {proposerName} proposed a hangout</Text>
        <Text style={styles.title}>{plan.title}</Text>
        {plan.venueName || plan.venueAddress ? (
          <Text style={styles.venue}>
            📍 {formatVenuePinLabel(plan.venueName ?? 'Suggested spot', plan.venueAddress)}
          </Text>
        ) : null}
        <Text style={styles.description}>{planDescriptionPreview(plan.description)}</Text>
        {when ? <Text style={styles.when}>🗓 {when}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
    shadowColor: '#1e1b4b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
    maxWidth: 320,
    width: '100%',
  },
  hero: {
    height: 132,
    justifyContent: 'flex-start',
  },
  heroWrap: {
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
  },
  heroBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 10,
    width: '100%',
  },
  laneBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    maxWidth: '72%',
  },
  laneBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  budgetPill: {
    backgroundColor: 'rgba(124,58,237,0.92)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  budgetPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  body: { padding: 14, paddingTop: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#7c3aed', marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '800', color: '#1e1b4b', lineHeight: 22 },
  venue: { fontSize: 12, color: '#334155', marginTop: 6 },
  description: { fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 20 },
  when: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10 },
});
