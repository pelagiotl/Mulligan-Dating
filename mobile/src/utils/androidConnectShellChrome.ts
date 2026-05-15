import { Platform } from 'react-native';
import type { ConnectShellMode } from '../lib/connectShellTheme';

/** Pastel shell — default non–Android and Android soft mode. */
export const ANDROID_SHELL_SOFT_BACKDROP = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'] as const;

/** Matches Browse midnight backdrop (`BrowseScreen`). */
export const ANDROID_SHELL_MIDNIGHT_BACKDROP = ['#15102a', '#221a32', '#1a1528', '#0f172a'] as const;

export function androidShellBackdropColors(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  if (Platform.OS !== 'android') return ANDROID_SHELL_SOFT_BACKDROP;
  return mode === 'midnight' ? ANDROID_SHELL_MIDNIGHT_BACKDROP : ANDROID_SHELL_SOFT_BACKDROP;
}

/** Solid body fill below headers / loading screens when midnight shell is on (Android only). */
export function androidShellTabBodyBg(mode: ConnectShellMode): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  return mode === 'midnight' ? '#12101c' : undefined;
}
