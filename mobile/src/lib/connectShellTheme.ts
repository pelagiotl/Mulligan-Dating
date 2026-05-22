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
