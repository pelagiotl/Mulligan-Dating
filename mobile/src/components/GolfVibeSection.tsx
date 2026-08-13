import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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

const FORMAT_OPTS: { id: GolfFormat; label: string }[] = [
  { id: 'nine', label: '9 holes' },
  { id: 'eighteen', label: '18 holes' },
  { id: 'either', label: 'Either' },
];
const TRANSPORT_OPTS: { id: GolfTransport; label: string }[] = [
  { id: 'walk', label: 'Walk' },
  { id: 'cart', label: 'Cart' },
  { id: 'either', label: 'Either' },
];
const VIBE_OPTS: { id: GolfVibe; label: string }[] = [
  { id: 'casual', label: 'Casual' },
  { id: 'competitive', label: 'Competitive' },
  { id: 'either', label: 'Either' },
];
const LEVEL_OPTS: { id: GolfLevel; label: string }[] = [
  { id: 'just_starting', label: 'Just starting' },
  { id: 'plays_9s', label: 'Plays 9s' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

export function golfLevelBadgeLabel(level: string | null | undefined): string | null {
  if (!level) return null;
  const hit = LEVEL_OPTS.find((o) => o.id === level);
  return hit?.label || null;
}

export function golfVibeSummary(v: Partial<GolfVibeValues>): string[] {
  const bits: string[] = [];
  if (v.golfFormat) {
    bits.push(FORMAT_OPTS.find((o) => o.id === v.golfFormat)?.label || v.golfFormat);
  }
  if (v.golfTransport) {
    bits.push(TRANSPORT_OPTS.find((o) => o.id === v.golfTransport)?.label || v.golfTransport);
  }
  if (v.golfVibe) {
    bits.push(VIBE_OPTS.find((o) => o.id === v.golfVibe)?.label || v.golfVibe);
  }
  if (v.golfLevel) {
    bits.push(LEVEL_OPTS.find((o) => o.id === v.golfLevel)?.label || v.golfLevel);
  }
  return bits;
}

type ChipRowProps<T extends string> = {
  label: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
  readOnly?: boolean;
};

function ChipRow<T extends string>({ label, options, value, onChange, readOnly }: ChipRowProps<T>) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
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
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
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
};

export default function GolfVibeSection({ values, onChange, readOnly, compact }: Props) {
  const set = <K extends keyof GolfVibeValues>(key: K, val: GolfVibeValues[K]) => {
    onChange?.({ ...values, [key]: val });
  };

  if (readOnly) {
    const bits = golfVibeSummary(values);
    if (bits.length === 0) {
      return (
        <View style={[styles.wrap, compact && styles.wrapCompact]}>
          <Text style={styles.title}>Golf vibe</Text>
          <Text style={styles.empty}>No golf vibe set yet.</Text>
        </View>
      );
    }
    return (
      <View style={[styles.wrap, compact && styles.wrapCompact]}>
        <Text style={styles.title}>Golf vibe</Text>
        <View style={styles.chips}>
          {bits.map((b) => (
            <View key={b} style={[styles.chip, styles.chipOn]}>
              <Text style={[styles.chipText, styles.chipTextOn]}>{b}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.title}>Golf vibe</Text>
      <Text style={styles.hint}>Helps your Golf Dates matches know how you like to play.</Text>
      <ChipRow
        label="Preferred format"
        options={FORMAT_OPTS}
        value={values.golfFormat}
        onChange={(v) => set('golfFormat', v)}
      />
      <ChipRow
        label="Walking vs cart"
        options={TRANSPORT_OPTS}
        value={values.golfTransport}
        onChange={(v) => set('golfTransport', v)}
      />
      <ChipRow
        label="Casual vs competitive"
        options={VIBE_OPTS}
        value={values.golfVibe}
        onChange={(v) => set('golfVibe', v)}
      />
      <ChipRow
        label="Level"
        options={LEVEL_OPTS}
        value={values.golfLevel}
        onChange={(v) => set('golfLevel', v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#f0fdfa',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 14,
    gap: 10,
  },
  wrapCompact: {
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#134e4a',
  },
  hint: {
    fontSize: 12,
    color: '#0f766e',
    marginTop: -4,
  },
  empty: {
    color: '#64748b',
    fontSize: 13,
  },
  row: { gap: 6 },
  rowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  chipText: { color: '#134e4a', fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#ecfdf5' },
});
