import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key as web (`frontend/src/lib/connectShellTheme.ts`) for mental parity across surfaces. */
export const CONNECT_SHELL_STORAGE_KEY = 'mulligan-connect-shell';

/** Midnight = graphite hero + dark chrome; soft = light pill + pastel shell. */
export type ConnectShellMode = 'midnight' | 'soft';

export async function loadConnectShellMode(): Promise<ConnectShellMode> {
  try {
    const v = await AsyncStorage.getItem(CONNECT_SHELL_STORAGE_KEY);
    if (v === 'soft') return 'soft';
  } catch {
    /* ignore */
  }
  return 'midnight';
}

export async function saveConnectShellMode(mode: ConnectShellMode): Promise<void> {
  try {
    await AsyncStorage.setItem(CONNECT_SHELL_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
