import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key as web (`frontend/src/lib/connectShellTheme.ts`) for mental parity across surfaces. */
export const CONNECT_SHELL_STORAGE_KEY = 'mulligan-connect-shell';

/** Midnight = graphite hero + dark chrome; sunny = warm sunrise; soft = pastel purple pill + cool gradient chrome. */
export type ConnectShellMode = 'midnight' | 'sunny' | 'soft';

/** Default for new installs when nothing is stored yet. */
export const DEFAULT_CONNECT_SHELL_MODE: ConnectShellMode = 'midnight';

const CONNECT_SHELL_CYCLE: ConnectShellMode[] = ['midnight', 'sunny', 'soft'];

function isConnectShellMode(v: string | null): v is ConnectShellMode {
  return v === 'midnight' || v === 'sunny' || v === 'soft';
}

export function connectShellStorageKey(userId?: string | null): string {
  return userId ? `${CONNECT_SHELL_STORAGE_KEY}:${userId}` : CONNECT_SHELL_STORAGE_KEY;
}

export function nextConnectShellMode(current: ConnectShellMode): ConnectShellMode {
  const i = CONNECT_SHELL_CYCLE.indexOf(current);
  const idx = i >= 0 ? i : 0;
  return CONNECT_SHELL_CYCLE[(idx + 1) % CONNECT_SHELL_CYCLE.length];
}

export function connectShellDisplayLabel(mode: ConnectShellMode): string {
  switch (mode) {
    case 'midnight':
      return 'Midnight';
    case 'sunny':
      return 'Sunny';
    case 'soft':
      return 'Soft';
  }
}

/** Perimeter trace on Connect landing / floating button (mobile). */
export type ConnectButtonShimmerColors = {
  trace: string;
  resting: string;
  glow: string;
};

/** Matches list row — warm blush cards (soft/sunny) or dark glass (midnight). */
export type MatchListCardColors = {
  background: string;
  border: string;
  shadowColor: string;
  shadowOpacity: number;
  shimmer: string;
  name: string;
  nameUnread: string;
  age: string;
  location: string;
  activeStatus: string;
  timer: string;
  compatText: string;
  compatBg: string;
  compatBorder: string;
  unmatchBg: string;
  unmatchBorder: string;
};

export function matchListCardColors(mode: ConnectShellMode): MatchListCardColors {
  switch (mode) {
    case 'midnight':
      return {
        background: 'rgba(28, 24, 38, 0.98)',
        border: 'rgba(244, 114, 182, 0.22)',
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shimmer: 'rgba(255, 255, 255, 0.12)',
        name: '#f1f5f9',
        nameUnread: '#fda4af',
        age: '#cbd5e1',
        location: '#94a3b8',
        activeStatus: '#4ade80',
        timer: '#fcd34d',
        compatText: '#fecdd3',
        compatBg: 'rgba(244, 114, 182, 0.14)',
        compatBorder: 'rgba(244, 114, 182, 0.32)',
        unmatchBg: 'rgba(38, 32, 52, 0.95)',
        unmatchBorder: 'rgba(248, 113, 113, 0.35)',
      };
    case 'sunny':
      return {
        background: '#fff7ed',
        border: 'rgba(251, 191, 36, 0.38)',
        shadowColor: '#fb923c',
        shadowOpacity: 0.16,
        shimmer: 'rgba(255, 255, 255, 0.5)',
        name: '#431407',
        nameUnread: '#be123c',
        age: '#78716c',
        location: '#92400e',
        activeStatus: '#15803d',
        timer: '#b45309',
        compatText: '#9a3412',
        compatBg: 'rgba(254, 215, 170, 0.55)',
        compatBorder: 'rgba(234, 88, 12, 0.28)',
        unmatchBg: '#fffbeb',
        unmatchBorder: '#fecaca',
      };
    case 'soft':
      return {
        background: '#fff5f8',
        border: 'rgba(102, 126, 234, 0.18)',
        shadowColor: '#667eea',
        shadowOpacity: 0.14,
        shimmer: 'rgba(255, 255, 255, 0.45)',
        name: '#4c1d95',
        nameUnread: '#7f1d1d',
        age: '#64748b',
        location: '#475569',
        activeStatus: '#15803d',
        timer: '#b45309',
        compatText: '#6b21a8',
        compatBg: 'rgba(237, 233, 254, 0.85)',
        compatBorder: 'rgba(102, 126, 234, 0.28)',
        unmatchBg: '#ffffff',
        unmatchBorder: '#fecdd3',
      };
  }
}

/** Full-screen chrome gradient — aligned with web `--native-gradient-screen` (soft). */
export const CONNECT_SHELL_SOFT_GRADIENT = [
  '#667eea',
  '#764ba2',
  '#a855f7',
  '#ec4899',
  '#38bdf8',
] as const;

export const CONNECT_SHELL_MIDNIGHT_GRADIENT = [
  '#15102a',
  '#221a32',
  '#1a1528',
  '#0f172a',
] as const;

export const CONNECT_SHELL_SUNNY_GRADIENT = [
  '#38bdf8',
  '#fcd34d',
  '#fb923c',
  '#fda4af',
  '#fef08a',
] as const;

export function connectShellGradientStops(mode: ConnectShellMode): readonly string[] {
  switch (mode) {
    case 'midnight':
      return CONNECT_SHELL_MIDNIGHT_GRADIENT;
    case 'sunny':
      return CONNECT_SHELL_SUNNY_GRADIENT;
    case 'soft':
      return CONNECT_SHELL_SOFT_GRADIENT;
  }
}

/** Matches tab “Your limits” card — aligned with web `--limits-*` per shell. */
export type ConnectionLimitsPanelColors = {
  shellGradient: readonly [string, string, ...string[]];
  accentGradient: readonly [string, string, ...string[]];
  shellBorder: string;
  eyebrow: string;
  lede: string;
  hideBorder: string;
  hideBg: string;
  hideText: string;
  collapsedBarBg: string;
  collapsedBarBorder: string;
  collapsedGem: string;
  collapsedStat: string;
  collapsedStatFull: string;
  collapsedAction: string;
  collapsedDivider: string;
  metricBg: string;
  metricBorder: string;
  metricTokensBg: string;
  metricTokensBorder: string;
  metricSlotsBg: string;
  metricSlotsBorder: string;
  metricFullBg: string;
  metricFullBorder: string;
  iconWrapBg: string;
  iconWrapBorder: string;
  iconWrapTokensBorder: string;
  iconWrapSlotsBorder: string;
  label: string;
  value: string;
  valueFull: string;
  denom: string;
  trackBg: string;
  fillTokens: string;
  fillSlots: string;
  fillFull: string;
  chipText: string;
  chipBg: string;
  chipBorder: string;
  noteBg: string;
  noteText: string;
  noteCapacityBg: string;
  noteCapacityText: string;
  loadingText: string;
  shadowColor: string;
};

export function connectionLimitsPanelColors(mode: ConnectShellMode): ConnectionLimitsPanelColors {
  switch (mode) {
    case 'midnight':
      return {
        shellGradient: ['#1c1826', '#1e1b2e', '#16122a'],
        accentGradient: ['#a78bfa', '#c084fc', '#f472b6'],
        shellBorder: 'rgba(167, 139, 250, 0.22)',
        eyebrow: '#c4b5fd',
        lede: '#94a3b8',
        hideBorder: 'rgba(167, 139, 250, 0.2)',
        hideBg: 'rgba(38, 32, 52, 0.9)',
        hideText: '#94a3b8',
        collapsedBarBg: 'rgba(30, 27, 46, 0.95)',
        collapsedBarBorder: 'rgba(167, 139, 250, 0.22)',
        collapsedGem: 'rgba(196, 181, 253, 0.55)',
        collapsedStat: '#e2e8f0',
        collapsedStatFull: '#fda4af',
        collapsedAction: '#94a3b8',
        collapsedDivider: 'rgba(167, 139, 250, 0.2)',
        metricBg: 'rgba(38, 32, 52, 0.75)',
        metricBorder: 'rgba(167, 139, 250, 0.12)',
        metricTokensBg: 'rgba(46, 40, 72, 0.9)',
        metricTokensBorder: 'rgba(129, 140, 248, 0.28)',
        metricSlotsBg: 'rgba(52, 32, 48, 0.9)',
        metricSlotsBorder: 'rgba(244, 114, 182, 0.22)',
        metricFullBg: 'rgba(52, 28, 44, 0.95)',
        metricFullBorder: 'rgba(244, 114, 182, 0.35)',
        iconWrapBg: 'rgba(22, 18, 34, 0.95)',
        iconWrapBorder: 'rgba(167, 139, 250, 0.15)',
        iconWrapTokensBorder: 'rgba(129, 140, 248, 0.32)',
        iconWrapSlotsBorder: 'rgba(244, 114, 182, 0.28)',
        label: '#94a3b8',
        value: '#f1f5f9',
        valueFull: '#fda4af',
        denom: 'rgba(226, 232, 240, 0.35)',
        trackBg: 'rgba(15, 12, 22, 0.55)',
        fillTokens: '#a78bfa',
        fillSlots: '#f472b6',
        fillFull: '#fb7185',
        chipText: '#6ee7b7',
        chipBg: 'rgba(16, 185, 129, 0.14)',
        chipBorder: 'rgba(52, 211, 153, 0.28)',
        noteBg: 'rgba(15, 12, 22, 0.45)',
        noteText: '#cbd5e1',
        noteCapacityBg: 'rgba(244, 114, 182, 0.1)',
        noteCapacityText: '#fda4af',
        loadingText: '#94a3b8',
        shadowColor: '#000',
      };
    case 'sunny':
      return {
        shellGradient: ['#fffdf7', '#fff7ed', '#fef3c7'],
        accentGradient: ['#38bdf8', '#fcd34d', '#fb923c'],
        shellBorder: 'rgba(251, 191, 36, 0.28)',
        eyebrow: '#c2410c',
        lede: '#9a3412',
        hideBorder: 'rgba(251, 191, 36, 0.28)',
        hideBg: 'rgba(255, 255, 255, 0.92)',
        hideText: '#78716c',
        collapsedBarBg: 'rgba(255, 253, 245, 0.96)',
        collapsedBarBorder: 'rgba(251, 191, 36, 0.24)',
        collapsedGem: 'rgba(234, 88, 12, 0.45)',
        collapsedStat: '#431407',
        collapsedStatFull: '#be123c',
        collapsedAction: '#78716c',
        collapsedDivider: 'rgba(251, 191, 36, 0.2)',
        metricBg: 'rgba(255, 255, 255, 0.82)',
        metricBorder: 'rgba(251, 191, 36, 0.14)',
        metricTokensBg: 'rgba(255, 255, 255, 0.98)',
        metricTokensBorder: 'rgba(56, 189, 248, 0.22)',
        metricSlotsBg: 'rgba(255, 255, 255, 0.98)',
        metricSlotsBorder: 'rgba(251, 146, 60, 0.22)',
        metricFullBg: 'rgba(255, 251, 235, 0.98)',
        metricFullBorder: 'rgba(234, 88, 12, 0.32)',
        iconWrapBg: '#ffffff',
        iconWrapBorder: 'rgba(251, 191, 36, 0.18)',
        iconWrapTokensBorder: 'rgba(56, 189, 248, 0.28)',
        iconWrapSlotsBorder: 'rgba(251, 146, 60, 0.26)',
        label: '#78716c',
        value: '#431407',
        valueFull: '#be123c',
        denom: 'rgba(67, 20, 7, 0.32)',
        trackBg: 'rgba(251, 191, 36, 0.15)',
        fillTokens: '#0ea5e9',
        fillSlots: '#f97316',
        fillFull: '#ea580c',
        chipText: '#15803d',
        chipBg: 'rgba(34, 197, 94, 0.12)',
        chipBorder: 'rgba(22, 163, 74, 0.22)',
        noteBg: 'rgba(255, 251, 235, 0.65)',
        noteText: '#78350f',
        noteCapacityBg: 'rgba(254, 215, 170, 0.45)',
        noteCapacityText: '#c2410c',
        loadingText: '#78716c',
        shadowColor: '#fb923c',
      };
    case 'soft':
      return {
        shellGradient: ['#ffffff', '#fcf8ff', '#ede9fe'],
        accentGradient: ['#818cf8', '#a78bfa', '#f472b6'],
        shellBorder: 'rgba(102, 126, 234, 0.16)',
        eyebrow: '#6d28d9',
        lede: '#64748b',
        hideBorder: 'rgba(102, 126, 234, 0.14)',
        hideBg: 'rgba(255, 255, 255, 0.92)',
        hideText: '#64748b',
        collapsedBarBg: 'rgba(255, 255, 255, 0.94)',
        collapsedBarBorder: 'rgba(102, 126, 234, 0.16)',
        collapsedGem: 'rgba(109, 40, 217, 0.4)',
        collapsedStat: '#312e81',
        collapsedStatFull: '#be185d',
        collapsedAction: '#64748b',
        collapsedDivider: 'rgba(102, 126, 234, 0.14)',
        metricBg: 'rgba(255, 255, 255, 0.85)',
        metricBorder: 'rgba(102, 126, 234, 0.1)',
        metricTokensBg: 'rgba(255, 255, 255, 0.98)',
        metricTokensBorder: 'rgba(99, 102, 241, 0.18)',
        metricSlotsBg: 'rgba(255, 255, 255, 0.98)',
        metricSlotsBorder: 'rgba(236, 72, 153, 0.14)',
        metricFullBg: 'rgba(255, 255, 255, 0.98)',
        metricFullBorder: 'rgba(139, 21, 56, 0.2)',
        iconWrapBg: '#ffffff',
        iconWrapBorder: 'rgba(102, 126, 234, 0.1)',
        iconWrapTokensBorder: 'rgba(99, 102, 241, 0.2)',
        iconWrapSlotsBorder: 'rgba(244, 63, 94, 0.16)',
        label: '#64748b',
        value: '#312e81',
        valueFull: '#9f1239',
        denom: 'rgba(49, 46, 129, 0.3)',
        trackBg: 'rgba(102, 126, 234, 0.1)',
        fillTokens: '#6366f1',
        fillSlots: '#f43f5e',
        fillFull: '#be123c',
        chipText: '#047857',
        chipBg: 'rgba(16, 185, 129, 0.1)',
        chipBorder: 'rgba(16, 185, 129, 0.18)',
        noteBg: 'rgba(237, 233, 254, 0.35)',
        noteText: '#475569',
        noteCapacityBg: 'rgba(252, 231, 243, 0.55)',
        noteCapacityText: '#9f1239',
        loadingText: '#64748b',
        shadowColor: '#667eea',
      };
  }
}

export function connectButtonShimmerColors(mode: ConnectShellMode): ConnectButtonShimmerColors {
  switch (mode) {
    case 'midnight':
      return {
        trace: 'rgba(103, 232, 249, 0.95)',
        resting: 'rgba(103, 232, 249, 0.22)',
        glow: '#22d3ee',
      };
    case 'sunny':
      return {
        trace: 'rgba(255, 255, 255, 0.98)',
        resting: 'rgba(255, 255, 255, 0.42)',
        glow: '#fef08a',
      };
    case 'soft':
      return {
        trace: 'rgba(255, 255, 255, 0.95)',
        resting: 'rgba(255, 255, 255, 0.38)',
        glow: '#ddd6fe',
      };
  }
}

export async function loadConnectShellMode(userId?: string | null): Promise<ConnectShellMode> {
  try {
    if (userId) {
      const v = await AsyncStorage.getItem(connectShellStorageKey(userId));
      if (isConnectShellMode(v)) return v;
      return DEFAULT_CONNECT_SHELL_MODE;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONNECT_SHELL_MODE;
}

export async function saveConnectShellMode(
  mode: ConnectShellMode,
  userId?: string | null
): Promise<void> {
  try {
    await AsyncStorage.setItem(connectShellStorageKey(userId), mode);
  } catch {
    /* ignore */
  }
}

export async function resetConnectShellModeForNewUser(userId: string): Promise<void> {
  await saveConnectShellMode(DEFAULT_CONNECT_SHELL_MODE, userId);
}
