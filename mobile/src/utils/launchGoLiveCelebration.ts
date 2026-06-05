import AsyncStorage from '@react-native-async-storage/async-storage';

export const LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY = 'mulligan:launch-go-live-celebration-seen';

export async function isLaunchGoLiveCelebrationSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markLaunchGoLiveCelebrationSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAUNCH_GO_LIVE_CELEBRATION_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}
