import { Platform } from 'react-native';
import {
  connectShellGradientStops,
  CONNECT_SHELL_MIDNIGHT_GRADIENT,
  CONNECT_SHELL_SOFT_GRADIENT,
  CONNECT_SHELL_SUNNY_GRADIENT,
  type ConnectShellMode,
} from '../lib/connectShellTheme';

/** Pastel multi-stop — matches web soft `--native-gradient-screen`. */
export const ANDROID_SHELL_SOFT_BACKDROP = CONNECT_SHELL_SOFT_GRADIENT;

/** Warm sunrise / sky — Android sunny Connect shell. */
export const ANDROID_SHELL_SUNNY_BACKDROP = CONNECT_SHELL_SUNNY_GRADIENT;

/** Matches Browse midnight backdrop (`BrowseScreen`). */
export const ANDROID_SHELL_MIDNIGHT_BACKDROP = CONNECT_SHELL_MIDNIGHT_GRADIENT;

export function androidShellBackdropColors(mode: ConnectShellMode): readonly [string, string, ...string[]] {
  const stops = connectShellGradientStops(mode);
  if (Platform.OS !== 'android') return stops as readonly [string, string, ...string[]];
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
