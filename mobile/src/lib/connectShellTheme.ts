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
      };
    case 'sunny':
      return {
        background: '#fffaf3',
        border: 'rgba(251, 191, 36, 0.34)',
        shadowColor: '#fb923c',
        shadowOpacity: 0.14,
        shimmer: 'rgba(255, 255, 255, 0.45)',
      };
    case 'soft':
      return {
        background: '#fffafb',
        border: 'rgba(102, 126, 234, 0.14)',
        shadowColor: '#667eea',
        shadowOpacity: 0.12,
        shimmer: 'rgba(255, 255, 255, 0.4)',
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
