import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useConnectShellTheme } from '../context/ConnectShellThemeContext';
import { dateTimePickerTheme } from '../lib/dateTimePickerTheme';
import { datetimeLocalToDate, dateToDatetimeLocal } from '../utils/datetimeLocal';

type Props = {
  visible: boolean;
  value: string;
  title?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

const DAY_COUNT = 21;
const TIME_SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
const DAY_CHIP_WIDTH = 104;

type DayOption = {
  date: Date;
  key: string;
  primary: string;
  secondary: string;
};

function dateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dayOption(d: Date, index: number): Pick<DayOption, 'primary' | 'secondary'> {
  const secondary = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (index === 0) return { primary: 'Today', secondary };
  if (index === 1) return { primary: 'Tomorrow', secondary };
  return {
    primary: d.toLocaleDateString('en-US', { weekday: 'short' }),
    secondary,
  };
}

function formatTimeChip(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatSummaryParts(d: Date): { dateLine: string; timeLine: string } {
  return {
    dateLine: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    timeLine: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function nearestTimeSlot(d: Date): string {
  const minutes = d.getHours() * 60 + d.getMinutes();
  let best = TIME_SLOTS[0];
  let bestDiff = Infinity;
  for (const slot of TIME_SLOTS) {
    const [h, m] = slot.split(':').map(Number);
    const diff = Math.abs(h * 60 + m - minutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slot;
    }
  }
  return best;
}

function DayChip({
  option,
  active,
  onPress,
  theme,
}: {
  option: DayOption;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof dateTimePickerTheme>;
}) {
  const primaryText = (
    <Text
      style={[styles.dayChipPrimary, active && styles.dayChipPrimaryActive, !active && { color: theme.chipPrimary }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.82}
    >
      {option.primary}
    </Text>
  );

  const secondaryText = (
    <Text
      style={[styles.dayChipSecondary, active && styles.dayChipSecondaryActive, !active && { color: theme.chipSecondary }]}
      numberOfLines={1}
    >
      {option.secondary}
    </Text>
  );

  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.dayChipWrap, { shadowColor: theme.chipShadow }]}>
        <LinearGradient
          colors={[...theme.chipActiveGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dayChipActive}
        >
          {primaryText}
          {secondaryText}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.dayChip, { backgroundColor: theme.chipBg, borderColor: theme.chipBorder }]}
    >
      {primaryText}
      {secondaryText}
    </TouchableOpacity>
  );
}

function TimeChip({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof dateTimePickerTheme>;
}) {
  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.timeChipWrap, { shadowColor: theme.chipShadow }]}>
        <LinearGradient
          colors={[...theme.chipActiveGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.timeChipActive}
        >
          <Text style={styles.timeChipTextActive}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.timeChip, { backgroundColor: theme.chipBg, borderColor: theme.chipBorder }]}
    >
      <Text style={[styles.timeChipText, { color: theme.chipPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function DayTimePickerModal({
  visible,
  value,
  title = 'Pick day & time',
  onConfirm,
  onCancel,
}: Props) {
  const { mode } = useConnectShellTheme();
  const theme = useMemo(() => dateTimePickerTheme(mode), [mode]);
  const [selectedDate, setSelectedDate] = useState(() => datetimeLocalToDate(value));

  useEffect(() => {
    if (!visible) return;
    const d = datetimeLocalToDate(value);
    if (Number.isNaN(d.getTime())) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 7);
      fallback.setHours(19, 0, 0, 0);
      setSelectedDate(fallback);
      return;
    }
    const slot = nearestTimeSlot(d);
    const [h, m] = slot.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    setSelectedDate(d);
  }, [visible, value]);

  const dayOptions = useMemo((): DayOption[] => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAY_COUNT }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const labels = dayOption(d, i);
      return { date: d, key: dateKey(d), ...labels };
    });
  }, []);

  const selectedDayKey = dateKey(selectedDate);
  const selectedTime = `${selectedDate.getHours().toString().padStart(2, '0')}:${selectedDate
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  const summary = formatSummaryParts(selectedDate);

  const selectDay = (d: Date) => {
    const next = new Date(selectedDate);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setSelectedDate(next);
  };

  const selectTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const next = new Date(selectedDate);
    next.setHours(h, m, 0, 0);
    setSelectedDate(next);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={[styles.backdrop, { backgroundColor: theme.backdrop }]} activeOpacity={1} onPress={onCancel} />
        <View style={[styles.sheet, { borderColor: theme.sheetBorder }]}>
          <LinearGradient colors={[...theme.sheetGradient]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.handle, { backgroundColor: theme.handle }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.title }]}>{title}</Text>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.closeButton, { backgroundColor: theme.closeBg, borderColor: theme.closeBorder }]}
              accessibilityLabel="Close"
            >
              <Text style={[styles.closeText, { color: theme.closeText }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <LinearGradient
            colors={[...theme.summaryGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.summaryCard, { borderColor: theme.summaryBorder }]}
          >
            <Text style={[styles.summaryEyebrow, { color: theme.summaryEyebrow }]}>Your hangout</Text>
            <Text style={[styles.summaryDate, { color: theme.summaryDate }]}>{summary.dateLine}</Text>
            <Text style={[styles.summaryTime, { color: theme.summaryTime }]}>{summary.timeLine}</Text>
          </LinearGradient>

          <View style={[styles.sectionCard, { backgroundColor: theme.sectionBg, borderColor: theme.sectionBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.sectionLabel }]}>📅 Pick a day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {dayOptions.map((option) => (
                <DayChip
                  key={option.key}
                  option={option}
                  active={option.key === selectedDayKey}
                  onPress={() => selectDay(option.date)}
                  theme={theme}
                />
              ))}
            </ScrollView>
          </View>

          <View style={[styles.sectionCard, { backgroundColor: theme.sectionBg, borderColor: theme.sectionBorder }]}>
            <Text style={[styles.sectionLabel, { color: theme.sectionLabel }]}>⏰ Pick a time</Text>
            <View style={styles.timeGrid}>
              {TIME_SLOTS.map((slot) => (
                <TimeChip
                  key={slot}
                  label={formatTimeChip(slot)}
                  active={slot === selectedTime}
                  onPress={() => selectTime(slot)}
                  theme={theme}
                />
              ))}
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.cancelButton, { backgroundColor: theme.cancelBg, borderColor: theme.cancelBorder }]}
            >
              <Text style={[styles.cancelText, { color: theme.cancelText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(dateToDatetimeLocal(selectedDate))} activeOpacity={0.88} style={styles.doneButtonWrap}>
              <LinearGradient
                colors={[...theme.doneGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.doneButton}
              >
                <Text style={styles.doneText}>Save time</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 8,
    maxHeight: '90%',
    overflow: 'hidden',
    borderWidth: 1,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryCard: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  summaryEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  summaryDate: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
  summaryTime: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  sectionCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
  },
  dayRow: {
    gap: 10,
    paddingRight: 4,
  },
  dayChip: {
    width: DAY_CHIP_WIDTH,
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dayChipWrap: {
    width: DAY_CHIP_WIDTH,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  dayChipActive: {
    width: DAY_CHIP_WIDTH,
    minHeight: 74,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dayChipPrimary: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  dayChipSecondary: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
  },
  dayChipPrimaryActive: {
    color: '#fff',
  },
  dayChipSecondaryActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    width: '31%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipWrap: {
    width: '31%',
    borderRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  timeChipActive: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  timeChipTextActive: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
  },
  doneButtonWrap: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  doneButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
