import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Asset } from 'expo-asset';
import Constants from 'expo-constants';

let matchSoundModule: number | null = null;
let messageSoundModule: number | null = null;
let tokenClaimSoundModule: number | null = null;
let mulliganBootSoundModule: number | null = null;

const isExpoGo =
  typeof Constants !== 'undefined' && Constants?.executionEnvironment === 'storeClient';

// Metro requires static string literals in require() calls.
try {
  matchSoundModule = require('../../assets/match-sound.wav');
} catch {
  try {
    matchSoundModule = require('../../assets/match-sound.mp3');
  } catch {
    matchSoundModule = null;
    if (!isExpoGo) {
      console.warn('🎵 Match sound file not found in mobile/assets/');
    }
  }
}

try {
  messageSoundModule = require('../../assets/message-sound.mp3');
} catch {
  try {
    messageSoundModule = require('../../assets/message-sound.wav');
  } catch {
    messageSoundModule = null;
  }
}

try {
  // v2 — warmer ascending refill chime (filename busts Metro asset cache)
  tokenClaimSoundModule = require('../../assets/token-claim-sound-v2.wav');
} catch {
  tokenClaimSoundModule = null;
  if (!isExpoGo) {
    console.warn('🎵 Token claim sound not found — run: node scripts/generate-token-claim-sound.js');
  }
}

try {
  // v8 — whoosh → rising bell arpeggio (payoff after “Just missed…”)
  // Rollback: require('../../assets/mulligan-boot-sound-v7.wav')
  //   (archive: assets/sound-archive/mulligan-boot-sound-v7.wav)
  mulliganBootSoundModule = require('../../assets/mulligan-boot-sound-v8.wav');
} catch {
  try {
    mulliganBootSoundModule = require('../../assets/mulligan-boot-sound-v7.wav');
  } catch {
    try {
      mulliganBootSoundModule = require('../../assets/mulligan-boot-sound.wav');
    } catch {
      mulliganBootSoundModule = null;
      if (!isExpoGo) {
        console.warn('🎵 Mulligan boot sound not found — run: node scripts/generate-mulligan-boot-sound.js');
      }
    }
  }
}

/**
 * Resolve a bundled require() asset to a playback URI without ExpoAsset.downloadAsync.
 * downloadAsync needs expo-file-system native module (AppDirectories); bundled assets
 * already have a Metro or on-disk URI via Asset.fromModule().
 */
function resolveBundledSoundUri(module: number): { uri: string } | null {
  try {
    const asset = Asset.fromModule(module);
    const uri = asset.localUri ?? asset.uri;
    if (uri) return { uri };
  } catch (e) {
    if (__DEV__) {
      console.warn('🎵 [SOUND] resolveBundledSoundUri failed:', (e as Error)?.message ?? e);
    }
  }
  return null;
}

async function configurePlaybackAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    playThroughEarpieceAndroid: false,
  });
}

type SoundHolder = { sound: Audio.Sound | null };

async function playBundledSound(
  module: number | null,
  holder: SoundHolder,
  label: string
): Promise<void> {
  if (!module) {
    if (__DEV__) {
      console.warn(`🎵 [SOUND] ${label}: module is null (asset failed to load)`);
    }
    return;
  }

  try {
    await configurePlaybackAudioMode();
    await new Promise((r) => setTimeout(r, 50));

    if (holder.sound) {
      try {
        await holder.sound.unloadAsync();
      } catch {
        /* ignore */
      }
      holder.sound = null;
    }

    // Prefer the Metro require() module directly (most reliable with expo-av).
    // Fall back to Asset URI if needed — downloadFirst=false avoids expo-file-system.
    let sound: Audio.Sound;
    try {
      ({ sound } = await Audio.Sound.createAsync(
        module,
        {
          shouldPlay: false,
          volume: 1.0,
          isLooping: false,
          isMuted: false,
        },
        null,
        false
      ));
    } catch (directErr) {
      const soundSource = resolveBundledSoundUri(module);
      if (!soundSource?.uri) {
        throw directErr;
      }
      ({ sound } = await Audio.Sound.createAsync(
        soundSource,
        {
          shouldPlay: false,
          volume: 1.0,
          isLooping: false,
          isMuted: false,
        },
        null,
        false
      ));
    }

    holder.sound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      try {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          holder.sound = null;
        }
      } catch {
        /* ignore callback errors */
      }
    });

    await sound.setVolumeAsync(1.0);
    await sound.setIsMutedAsync(false);
    await sound.playAsync();
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`🎵 [SOUND] ${label} playback failed:`, err?.message ?? error);
    if (__DEV__ && err?.message?.includes('AppDirectories')) {
      console.warn(
        '🎵 [SOUND] Tip: rebuild dev client after `npx expo install expo-file-system` if issues persist.'
      );
    }
  }
}

const matchSoundHolder: SoundHolder = { sound: null };
const messageSoundHolder: SoundHolder = { sound: null };
const tokenClaimSoundHolder: SoundHolder = { sound: null };
const mulliganBootSoundHolder: SoundHolder = { sound: null };

export async function playMatchSound(): Promise<void> {
  await playBundledSound(matchSoundModule, matchSoundHolder, 'match');
}

export async function playMessageSound(): Promise<void> {
  await playBundledSound(messageSoundModule, messageSoundHolder, 'message');
}

/** Warm ascending refill chime when monthly tokens are claimed. */
export async function playTokenClaimSound(): Promise<void> {
  await playBundledSound(tokenClaimSoundModule, tokenClaimSoundHolder, 'token-claim');
}

/** Golf swing whoosh for cold-start Mulligan boot splash. */
export async function playMulliganBootSound(): Promise<void> {
  await playBundledSound(mulliganBootSoundModule, mulliganBootSoundHolder, 'mulligan-boot');
}
