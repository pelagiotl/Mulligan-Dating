import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type GolfFormat = 'nine' | 'eighteen' | 'either';
export type GolfTransport = 'walk' | 'cart' | 'either';
export type GolfVibe = 'casual' | 'competitive' | 'either';
export type GolfLevel = 'just_starting' | 'plays_9s' | 'intermediate' | 'advanced';

export type GolfVibeValues = {
  golfFormat: GolfFormat | null;
  golfTransport: GolfTransport | null;
  golfVibe: GolfVibe | null;
  golfLevel: GolfLevel | null;
};

type Opt<T extends string> = { id: T; label: string; emoji: string };

const FORMAT_OPTS: Opt<GolfFormat>[] = [
  { id: 'nine', label: '9 holes', emoji: '9️⃣' },
  { id: 'eighteen', label: '18 holes', emoji: '🏌️' },
  { id: 'either', label: 'Either', emoji: '✨' },
];
const TRANSPORT_OPTS: Opt<GolfTransport>[] = [
  { id: 'walk', label: 'Walk', emoji: '🚶' },
  { id: 'cart', label: 'Cart', emoji: '🛺' },
  { id: 'either', label: 'Either', emoji: '🔀' },
];
const VIBE_OPTS: Opt<GolfVibe>[] = [
  { id: 'casual', label: 'Casual', emoji: '😎' },
  { id: 'competitive', label: 'Competitive', emoji: '🏆' },
  { id: 'either', label: 'Either', emoji: '⚖️' },
];
const LEVEL_OPTS: Opt<GolfLevel>[] = [
  { id: 'just_starting', label: 'Just starting', emoji: '🌱' },
  { id: 'plays_9s', label: 'Plays 9s', emoji: '⛳' },
  { id: 'intermediate', label: 'Intermediate', emoji: '📈' },
  { id: 'advanced', label: 'Advanced', emoji: '🔥' },
];

const ROW_META: { key: keyof GolfVibeValues; label: string; emoji: string; options: Opt<string>[] }[] = [
  { key: 'golfFormat', label: 'Preferred format', emoji: '🏁', options: FORMAT_OPTS },
  { key: 'golfTransport', label: 'Walking vs cart', emoji: '👟', options: TRANSPORT_OPTS },
  { key: 'golfVibe', label: 'Casual vs competitive', emoji: '💫', options: VIBE_OPTS },
  { key: 'golfLevel', label: 'Level', emoji: '📊', options: LEVEL_OPTS },
];

export function golfLevelBadgeLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  const hit = LEVEL_OPTS.find((o) => o.id === level);
  return hit ? `${hit.emoji} ${hit.label}` : null;
}

export function golfVibeSummary(v: Partial<GolfVibeValues>): string[] {
  const bits: string[] = [];
  if (v.golfFormat) {
    const o = FORMAT_OPTS.find((x) => x.id === v.golfFormat);
    if (o) bits.push(`${o.emoji} ${o.label}`);
  }
  if (v.golfTransport) {
    const o = TRANSPORT_OPTS.find((x) => x.id === v.golfTransport);
    if (o) bits.push(`${o.emoji} ${o.label}`);
  }
  if (v.golfVibe) {
    const o = VIBE_OPTS.find((x) => x.id === v.golfVibe);
    if (o) bits.push(`${o.emoji} ${o.label}`);
  }
  if (v.golfLevel) {
    const o = LEVEL_OPTS.find((x) => x.id === v.golfLevel);
    if (o) bits.push(`${o.emoji} ${o.label}`);
  }
  return bits;
}

type ChipRowProps<T extends string> = {
  label: string;
  labelEmoji: string;
  options: Opt<T>[];
  value: T | null;
  onChange: (next: T) => void;
  readOnly?: boolean;
};

function ChipRow<T extends string>({
  label,
  labelEmoji,
  options,
  value,
  onChange,
  readOnly,
}: ChipRowProps<T>) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>
        <Text style={styles.rowLabelEmoji}>{labelEmoji} </Text>
        {label}
      </Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const on = value === o.id;
          if (readOnly && !on) return null;
          return (
            <TouchableOpacity
              key={o.id}
              disabled={readOnly}
              activeOpacity={0.85}
              onPress={() => onChange(o.id)}
              style={[styles.chip, on && styles.chipOn, readOnly && styles.chipReadOnly]}
            >
              {on ? (
                <LinearGradient
                  colors={['#14b8a6', '#0f766e', '#0d9488']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chipGrad}
                >
                  <Text style={styles.chipEmoji} allowFontScaling={false}>
                    {o.emoji}
                  </Text>
                  <Text style={[styles.chipText, styles.chipTextOn]}>{o.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.chipInner}>
                  <Text style={styles.chipEmojiMuted} allowFontScaling={false}>
                    {o.emoji}
                  </Text>
                  <Text style={styles.chipText}>{o.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

type Props = {
  values: GolfVibeValues;
  onChange?: (next: GolfVibeValues) => void;
  readOnly?: boolean;
  compact?: boolean;
  /** Hide card chrome/title when nested under another section header. */
  embedded?: boolean;
};

export default function GolfVibeSection({
  values,
  onChange,
  readOnly,
  compact,
  embedded,
}: Props) {
  const set = <K extends keyof GolfVibeValues>(key: K, val: GolfVibeValues[K]) => {
    onChange?.({ ...values, [key]: val });
  };

  const bits = golfVibeSummary(values);

  const body =
    readOnly && bits.length === 0 ? (
      <Text style={styles.empty}>No golf vibe set yet.</Text>
    ) : readOnly ? (
      <View style={styles.chips}>
        {bits.map((b) => (
          <View key={b} style={[styles.chip, styles.chipOn, styles.chipReadOnly]}>
            <LinearGradient
              colors={['#14b8a6', '#0f766e', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.chipGrad}
            >
              <Text style={[styles.chipText, styles.chipTextOn]}>{b}</Text>
            </LinearGradient>
          </View>
        ))}
      </View>
    ) : (
      <>
        {!embedded ? (
          <Text style={styles.hint}>Helps your Golf Dates matches know how you like to play.</Text>
        ) : null}
        {ROW_META.map((row) => (
          <ChipRow
            key={row.key}
            label={row.label}
            labelEmoji={row.emoji}
            options={row.options as Opt<string>[]}
            value={values[row.key]}
            onChange={(v) => set(row.key, v as GolfVibeValues[typeof row.key])}
          />
        ))}
      </>
    );

  if (embedded) {
    return <View style={[styles.embedded, compact && styles.embeddedCompact]}>{body}</View>;
  }

  return (
    <View
      style={[
        styles.cardOuter,
        compact && styles.cardOuterCompact,
        Platform.OS === 'ios' ? styles.cardShadowIos : styles.cardShadowAndroid,
      ]}
    >
      <LinearGradient
        colors={['#ecfdf5', '#f0fdfa', '#ccfbf1', '#d1fae5']}
        locations={[0, 0.35, 0.75, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGrad}
      >
        <View style={styles.header}>
          <LinearGradient
            colors={['#2dd4bf', '#14b8a6', '#0d9488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerEmojiWrap}
          >
            <Text style={styles.headerEmoji} allowFontScaling={false}>
              ⛳
            </Text>
          </LinearGradient>
          <View style={styles.headerTextCol}>
            <Text style={styles.eyebrow}>GOLF DATES</Text>
            <Text style={styles.title}>Golf vibe</Text>
          </View>
        </View>
        <View style={styles.accentLine} />
        {body}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.55)',
  },
  cardOuterCompact: {
    borderRadius: 18,
  },
  cardShadowIos: {
    shadowColor: '#0f766e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  cardShadowAndroid: {
    elevation: 5,
  },
  cardGrad: {
    padding: 16,
    gap: 12,
  },
  embedded: {
    gap: 10,
  },
  embeddedCompact: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  headerEmoji: {
    fontSize: 22,
  },
  headerTextCol: {
    flex: 1,
    gap: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#0f766e',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#134e4a',
    letterSpacing: -0.2,
  },
  accentLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(20, 184, 166, 0.28)',
    marginTop: -2,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#0f766e',
    fontWeight: '500',
  },
  empty: {
    color: '#64748b',
    fontSize: 13,
  },
  row: { gap: 8 },
  rowLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowLabelEmoji: {
    fontSize: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.45)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
  },
  chipOn: {
    borderColor: '#0f766e',
    backgroundColor: 'transparent',
  },
  chipReadOnly: {
    borderWidth: 0,
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipEmojiMuted: {
    fontSize: 14,
    opacity: 0.9,
  },
  chipText: {
    color: '#134e4a',
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextOn: {
    color: '#ecfdf5',
  },
});
