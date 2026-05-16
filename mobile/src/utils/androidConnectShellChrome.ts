import { Platform } from 'react-native';
import type { ConnectShellMode } from '../lib/connectShellTheme';

/** Legacy pastel multi-stop — kept for non-Android surfaces that still reference it. */
export const ANDROID_SHELL_SOFT_BACKDROP = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'] as const;

/** Warm sunrise / sky — Android sunny Connect shell. */
export const ANDROID_SHELL_SUNNY_BACKDROP = ['#38bdf8', '#fcd34d', '#fb923c', '#fda4af', '#fef08a'] as const;

/** Matches Browse midnight backdrop (`BrowseScreen`). */
export const ANDROID_SHELL_MIDNIGHT_BACKDROP = ['#15102a', '#221a32', '#1a1528', '#0f172a'] as const;

export function androidShellBackdropColors(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  if (Platform.OS !== 'android') return ANDROID_SHELL_SOFT_BACKDROP;
  if (mode === 'midnight') return ANDROID_SHELL_MIDNIGHT_BACKDROP;
  if (mode === 'sunny') return ANDROID_SHELL_SUNNY_BACKDROP;
  return ANDROID_SHELL_SOFT_BACKDROP;
}

/** Solid body fill below headers / loading screens when midnight shell is on (Android only). */
export function androidShellTabBodyBg(mode: ConnectShellMode): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  if (mode === 'midnight') return '#12101c';
  if (mode === 'sunny') return '#fff7ed';
  return '#f4f6ff';
}
