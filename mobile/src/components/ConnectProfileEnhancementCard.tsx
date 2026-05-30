import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import type { ProfileEnhancementItem } from '../utils/profileEnhancementChecklist';
import ProfileCardAnimatedEmoji from './ProfileCardAnimatedEmoji';

export type ConnectEnhancementShell = 'midnight' | 'sunny' | 'soft';

type Props = {
  items: ProfileEnhancementItem[];
  shell: ConnectEnhancementShell;
  onItemPress: (item: ProfileEnhancementItem) => void;
  onOpenProfile: () => void;
  onDismiss: () => void;
  style?: ViewStyle;
};

type RestoreProps = {
  shell: ConnectEnhancementShell;
  incompleteCount: number;
  onRestore: () => void;
  style?: ViewStyle;
};

export function ConnectProfileEnhancementRestoreLink({
  shell,
  incompleteCount,
  onRestore,
  style,
}: RestoreProps) {
  if (incompleteCount <= 0) return null;

  const palette = SHELL_STYLES[shell];

  return (
    <TouchableOpacity
      style={[styles.restore, palette.card, style]}
      onPress={onRestore}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Show Better matches profile tips, ${incompleteCount} items remaining`}
    >
      <LinearGradient
        colors={palette.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accent}
      />
      <ProfileCardAnimatedEmoji emoji="✨" variant="shimmer" fontSize={16} delay={0} />
      <View style={styles.restoreCopy}>
        <Text style={[styles.restoreTitle, { color: palette.eyebrow }]}>Show Better matches tips</Text>
        <Text style={[styles.restoreMeta, { color: palette.lead }]}>
          {incompleteCount} quick {incompleteCount === 1 ? 'update' : 'updates'} left on Profile
        </Text>
      </View>
      <Text style={[styles.restoreChev, { color: palette.chev }]}>›</Text>
    </TouchableOpacity>
  );
}

const SHELL_STYLES: Record<
  ConnectEnhancementShell,
  {
    card: ViewStyle;
    accent: readonly [string, string, ...string[]];
    eyebrow: string;
    lead: string;
    row: string;
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
      backgroundColor: 'transparent',
    },
    accent: ['#667eea', '#a78bfa', '#f093fb'],
    eyebrow: 'rgba(233, 213, 255, 0.98)',
    lead: 'rgba(255, 255, 255, 0.82)',
    row: '#fff',
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
      backgroundColor: Platform.OS === 'android' ? 'transparent' : 'rgba(255, 255, 255, 0.62)',
    },
    accent: ['#f59e0b', '#fb923c', '#fbbf24'],
    eyebrow: '#b45309',
    lead: 'rgba(120, 53, 15, 0.82)',
    row: '#78350f',
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
      backgroundColor: Platform.OS === 'android' ? 'transparent' : 'rgba(255, 255, 255, 0.68)',
    },
    accent: ['#667eea', '#f472b6', '#fda4af'],
    eyebrow: '#9d174d',
    lead: 'rgba(76, 29, 52, 0.82)',
    row: '#4c1d34',
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

function AnimatedRow({
  index,
  item,
  palette,
  onPress,
}: {
  index: number;
  item: ProfileEnhancementItem;
  palette: (typeof SHELL_STYLES)[ConnectEnhancementShell];
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay: 220 + index * 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 380,
        delay: 220 + index * 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateX]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <TouchableOpacity
        style={[
          styles.row,
          { borderColor: palette.rowBorder },
        ]}
        onPress={onPress}
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
    </Animated.View>
  );
}

export default function ConnectProfileEnhancementCard({
  items,
  shell,
  onItemPress,
  onOpenProfile,
  onDismiss,
  style,
}: Props) {
  const cardOpacity = useRef(new Animated.Value(Platform.OS === 'android' ? 1 : 0)).current;
  const cardTranslateY = useRef(new Animated.Value(Platform.OS === 'android' ? 0 : 16)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(Platform.OS === 'android' ? 1 : 0)).current;

  const palette = SHELL_STYLES[shell];
  const total = 5;
  const done = total - items.length;
  const progressPct = done / total;
  const isFocused = useIsFocused();

  useEffect(() => {
    if (Platform.OS === 'android') {
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
      contentOpacity.setValue(1);
      progressWidth.setValue(progressPct);
      return;
    }

    if (!isFocused) {
      return;
    }

    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressWidth, {
        toValue: progressPct,
        duration: 900,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 420,
        delay: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardTranslateY, contentOpacity, progressPct, progressWidth, isFocused]);

  const progressAnimWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        palette.card,
        style,
        {
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }],
        },
      ]}
      accessibilityRole="summary"
    >
      <LinearGradient
        colors={palette.accent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accent}
      />
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <ProfileCardAnimatedEmoji emoji="✨" variant="shimmer" fontSize={14} delay={0} />
          <Text style={[styles.eyebrow, { color: palette.eyebrow }]}>Better matches</Text>
        </View>
        <Text style={[styles.progressBadge, { color: palette.progress, borderColor: palette.rowBorder }]}>
          {done}/{total}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}>
        <Animated.View style={{ width: progressAnimWidth, height: '100%' }}>
          <LinearGradient
            colors={palette.progressFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressFill}
          />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.lead, { color: palette.lead, opacity: contentOpacity }]}>
        Quick Profile updates help us curate stronger connections.
      </Animated.Text>
      {items.map((item, index) => (
        <AnimatedRow
          key={item.id}
          index={index}
          item={item}
          palette={palette}
          onPress={() => onItemPress(item)}
        />
      ))}
      <Animated.View style={[styles.actions, { borderTopColor: palette.rowBorder, opacity: contentOpacity }]}>
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
      </Animated.View>
    </Animated.View>
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
    ...Platform.select({
      ios: {
        shadowColor: '#312e81',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
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
    flex: 1,
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
    ...Platform.select({
      ios: {
        shadowColor: '#667eea',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
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
  restore: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    marginTop: 14,
    overflow: 'hidden',
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#312e81',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  restoreIcon: {
    fontSize: 16,
  },
  restoreCopy: {
    flex: 1,
    gap: 2,
  },
  restoreTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  restoreMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  restoreChev: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 22,
  },
});
