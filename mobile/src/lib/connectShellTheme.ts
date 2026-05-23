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
