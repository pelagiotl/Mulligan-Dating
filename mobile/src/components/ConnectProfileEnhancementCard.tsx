import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ProfileEnhancementItem } from '../utils/profileEnhancementChecklist';

export type ConnectEnhancementShell = 'midnight' | 'sunny' | 'soft';

type Props = {
  items: ProfileEnhancementItem[];
  shell: ConnectEnhancementShell;
  onItemPress: (item: ProfileEnhancementItem) => void;
  onOpenProfile: () => void;
  onDismiss: () => void;
  style?: ViewStyle;
};

const SHELL_STYLES: Record<
  ConnectEnhancementShell,
  {
    card: ViewStyle;
    accent: readonly [string, string, ...string[]];
    eyebrow: string;
    lead: string;
    row: string;
    rowBg: string;
    rowBorder: string;
    chev: string;
    dismiss: string;
    progress: string;
    progressTrack: string;
    progressFill: readonly [string, string, ...string[]];
    dot: string;
    profileBtn: readonly [string, string, ...string[]];
  }
> = {
  midnight: {
    card: {
      borderColor: 'rgba(167, 139, 250, 0.38)',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    accent: ['#667eea', '#a78bfa', '#f093fb'],
    eyebrow: 'rgba(233, 213, 255, 0.98)',
    lead: 'rgba(255, 255, 255, 0.82)',
    row: '#fff',
    rowBg: 'rgba(255, 255, 255, 0.1)',
    rowBorder: 'rgba(255, 255, 255, 0.16)',
    chev: 'rgba(255, 255, 255, 0.45)',
    dismiss: 'rgba(255, 255, 255, 0.55)',
    progress: 'rgba(255, 255, 255, 0.55)',
    progressTrack: 'rgba(255, 255, 255, 0.14)',
    progressFill: ['#667eea', '#a78bfa'],
    dot: '#c4b5fd',
    profileBtn: ['#667eea', '#764ba2'],
  },
  sunny: {
    card: {
      borderColor: 'rgba(245, 158, 11, 0.38)',
      backgroundColor: 'rgba(255, 255, 255, 0.62)',
    },
    accent: ['#f59e0b', '#fb923c', '#fbbf24'],
    eyebrow: '#b45309',
    lead: 'rgba(120, 53, 15, 0.82)',
    row: '#78350f',
    rowBg: 'rgba(255, 255, 255, 0.78)',
    rowBorder: 'rgba(245, 158, 11, 0.2)',
    chev: 'rgba(180, 83, 9, 0.45)',
    dismiss: 'rgba(120, 53, 15, 0.55)',
    progress: 'rgba(120, 53, 15, 0.55)',
    progressTrack: 'rgba(245, 158, 11, 0.18)',
    progressFill: ['#ea580c', '#f59e0b'],
    dot: '#f59e0b',
    profileBtn: ['#ea580c', '#f59e0b'],
  },
  soft: {
    card: {
      borderColor: 'rgba(244, 114, 182, 0.32)',
      backgroundColor: 'rgba(255, 255, 255, 0.68)',
    },
    accent: ['#667eea', '#f472b6', '#fda4af'],
    eyebrow: '#9d174d',
    lead: 'rgba(76, 29, 52, 0.82)',
    row: '#4c1d34',
    rowBg: 'rgba(255, 255, 255, 0.82)',
    rowBorder: 'rgba(244, 114, 182, 0.2)',
    chev: 'rgba(157, 23, 77, 0.45)',
    dismiss: 'rgba(76, 29, 52, 0.55)',
    progress: 'rgba(76, 29, 52, 0.55)',
    progressTrack: 'rgba(244, 114, 182, 0.16)',
    progressFill: ['#667eea', '#f472b6'],
    dot: '#f472b6',
    profileBtn: ['#667eea', '#764ba2'],
  },
};

export default function ConnectProfileEnhancementCard({
  items,
  shell,
  onItemPress,
  onOpenProfile,
  onDismiss,
  style,
}: Props) {
  if (items.length === 0) return null;

  const palette = SHELL_STYLES[shell];
  const total = 5;
  const done = total - items.length;
  const progressPct = done / total;

  return (
    <View style={[styles.card, palette.card, style]} accessibilityRole="summary">
      <LinearGradient
        colors={palette.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accent}
      />
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Text style={styles.icon} allowFontScaling={false}>
            ✨
          </Text>
          <Text style={[styles.eyebrow, { color: palette.eyebrow }]}>Better matches</Text>
        </View>
        <Text style={[styles.progressBadge, { color: palette.progress, borderColor: palette.rowBorder }]}>
          {done}/{total}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}>
        <LinearGradient
          colors={palette.progressFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${Math.round(progressPct * 100)}%` }]}
        />
      </View>
      <Text style={[styles.lead, { color: palette.lead }]}>
        Quick Profile updates help us curate stronger connections.
      </Text>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.row,
            { backgroundColor: palette.rowBg, borderColor: palette.rowBorder },
          ]}
          onPress={() => onItemPress(item)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={item.label}
        >
          <View style={[styles.dot, { backgroundColor: palette.dot }]} />
          <Text style={[styles.label, { color: palette.row }]} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={[styles.chev, { color: palette.chev }]}>›</Text>
        </TouchableOpacity>
      ))}
      <View style={[styles.actions, { borderTopColor: palette.rowBorder }]}>
        <TouchableOpacity onPress={onOpenProfile} activeOpacity={0.85} style={styles.profileBtnWrap}>
          <LinearGradient
            colors={palette.profileBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileBtn}
          >
            <Text style={styles.profileBtnText}>Go to Profile</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.dismiss, { color: palette.dismiss }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    marginTop: 14,
    overflow: 'hidden',
    shadowColor: '#312e81',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  progressBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  lead: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  chev: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  profileBtnWrap: {
    flex: 1,
  },
  profileBtn: {
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  profileBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dismiss: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
    paddingHorizontal: 4,
  },
});
