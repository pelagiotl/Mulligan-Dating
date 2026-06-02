import AsyncStorage from '@react-native-async-storage/async-storage';

export const LAUNCH_LIVE_PROMPT_SEEN_KEY = 'mulligan:launch-live-connect-prompt-seen';

export const LAUNCH_LIVE_BANNER_MESSAGE = "We're live — tap Connect to start matching.";

export async function isLaunchLiveConnectPromptSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LAUNCH_LIVE_PROMPT_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markLaunchLiveConnectPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAUNCH_LIVE_PROMPT_SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}
