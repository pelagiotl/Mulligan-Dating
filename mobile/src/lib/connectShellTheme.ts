import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key as web (`frontend/src/lib/connectShellTheme.ts`) for mental parity across surfaces. */
export const CONNECT_SHELL_STORAGE_KEY = 'mulligan-connect-shell';

/** Midnight = graphite hero + dark chrome; sunny = warm sunrise; soft = pastel purple pill + cool gradient chrome. */
export type ConnectShellMode = 'midnight' | 'sunny' | 'soft';

/** Default for new installs when nothing is stored yet. */
export const DEFAULT_CONNECT_SHELL_MODE: ConnectShellMode = 'midnight';

const CONNECT_SHELL_CYCLE: ConnectShellMode[] = ['midnight', 'sunny', 'soft'];

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

export async function loadConnectShellMode(): Promise<ConnectShellMode> {
  try {
    const v = await AsyncStorage.getItem(CONNECT_SHELL_STORAGE_KEY);
    if (v === 'midnight' || v === 'sunny' || v === 'soft') return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_CONNECT_SHELL_MODE;
}

export async function saveConnectShellMode(mode: ConnectShellMode): Promise<void> {
  try {
    await AsyncStorage.setItem(CONNECT_SHELL_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
