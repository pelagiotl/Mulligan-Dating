import { Audio } from 'expo-av';
import Constants from 'expo-constants';

let matchSound: Audio.Sound | null = null;
let messageSound: Audio.Sound | null = null;
let matchSoundModule: any = null;
let messageSoundModule: any = null;

// Try to load sound file at module load time
// CRITICAL: Metro bundler requires static string literals in require() calls
// Using variables will cause "Requiring unknown module 'undefined'" errors
// MUST use direct string literals like require('../assets/match-sound.mp3')
const isExpoGo = typeof Constants !== 'undefined' && Constants?.executionEnvironment === 'storeClient';

// Only attempt to load if not in Expo Go (to avoid noisy errors in dev)
if (!isExpoGo) {
  // Load match sound
  try {
    matchSoundModule = require('../assets/match-sound.mp3');
    console.log('🎵 ✅ Match sound module loaded successfully (MP3)');
  } catch (mp3Error: any) {
    try {
      matchSoundModule = require('../assets/match-sound.wav');
      console.log('🎵 ✅ Match sound module loaded successfully (WAV)');
    } catch (wavError: any) {
      matchSoundModule = null;
      console.warn('🎵 ⚠️  Match sound file not found. Sound notifications will be disabled.');
    }
  }
  
  // Load message sound
  try {
    messageSoundModule = require('../assets/message-sound.mp3');
    console.log('🎵 ✅ Message sound module loaded successfully (MP3)');
  } catch (mp3Error: any) {
    try {
      messageSoundModule = require('../assets/message-sound.wav');
      console.log('🎵 ✅ Message sound module loaded successfully (WAV)');
    } catch (wavError: any) {
      messageSoundModule = null;
      console.warn('🎵 ⚠️  Message sound file not found. Message sound notifications will be disabled.');
    }
  }
} else {
  // In Expo Go, audio files won't bundle - this is expected
  matchSoundModule = null;
  messageSoundModule = null;
  console.log('🎵 ℹ️  Running in Expo Go - sound will be disabled (this is normal)');
}

/**
 * Play a pleasant match notification sound
 * 
 * Note: Audio file loading via require() does not work in Expo Go due to Metro bundler limitations.
 * The sound will work in TestFlight and production builds where assets are properly bundled.
 * 
 * Works in:
 * - TestFlight builds ✅
 * - Production iOS/Android builds ✅
 * - Development (Expo Go) ❌ - Metro doesn't bundle audio files with require()
 * 
 * Note: Sound file is optional - if no file is found, this gracefully skips playback
 */
export async function playMatchSound() {
  // Always log in production for debugging TestFlight issues
  console.log('🎵 [SOUND] ========== playMatchSound() called ==========');
  console.log('🎵 [SOUND] isExpoGo:', isExpoGo);
  console.log('🎵 [SOUND] matchSoundModule:', matchSoundModule);
  console.log('🎵 [SOUND] matchSoundModule type:', typeof matchSoundModule);
  console.log('🎵 [SOUND] matchSoundModule === null:', matchSoundModule === null);
  console.log('🎵 [SOUND] matchSoundModule available:', matchSoundModule !== null && matchSoundModule !== undefined ? 'YES' : 'NO');
  
  // If no sound file available, skip playback
  if (!matchSoundModule || matchSoundModule === null || matchSoundModule === undefined) {
    if (isExpoGo) {
      console.log('🎵 [SOUND] ℹ️  Running in Expo Go - sound disabled (expected behavior)');
      console.log('🎵 [SOUND] ℹ️  Sound will work in TestFlight/production builds');
    } else {
      console.warn('🎵 [SOUND] ⚠️ Skipping sound - no sound file found in bundle');
      console.warn('🎵 [SOUND] Make sure match-sound.mp3 is in mobile/assets/ directory');
      console.warn('🎵 [SOUND] Check that assetBundlePatterns includes audio files in app.json');
    }
    return;
  }

  try {
    console.log('🎵 [SOUND] Setting audio mode for playback...');
    // Set audio mode for playback - important for iOS
    // Use PLAYBACK category which is designed for media playback and respects silent mode settings
    // But we set playsInSilentModeIOS to true to override silent mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true, // CRITICAL: Allows sound to play in silent mode
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS, // Mix with other audio
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      playThroughEarpieceAndroid: false, // Ensure sound plays through speaker
    });
    console.log('🎵 [SOUND] ✅ Audio mode set successfully');
    
    // Small delay to ensure audio session is fully configured
    await new Promise(resolve => setTimeout(resolve, 100));

    // Unload previous sound if it exists
    if (matchSound) {
      try {
        console.log('🎵 [SOUND] Unloading previous sound instance...');
        await matchSound.unloadAsync();
        console.log('🎵 [SOUND] ✅ Previous sound unloaded');
      } catch (e) {
        console.log('🎵 [SOUND] ⚠️ Error unloading previous sound (non-critical):', e);
        // Ignore errors when unloading
      }
      matchSound = null;
    }

    console.log('🎵 [SOUND] Creating new sound instance from bundled asset...');
    console.log('🎵 [SOUND] Sound module:', matchSoundModule);
    console.log('🎵 [SOUND] Sound module type:', typeof matchSoundModule);
    
    // Validate sound module before using it
    if (!matchSoundModule || matchSoundModule === undefined) {
      console.error('🎵 [SOUND] ❌ Sound module is null or undefined - cannot create sound');
      throw new Error('Sound module is null or undefined');
    }
    
    // Handle different return types from require()
    // In production builds, require() can return:
    // - A number (asset ID) - Audio.Sound.createAsync() accepts this directly
    // - An object with uri/localUri property
    // - The module itself
    let soundSource: any = matchSoundModule;
    
    // If it's an object with uri/localUri, use that
    if (typeof matchSoundModule === 'object' && matchSoundModule !== null) {
      if (matchSoundModule.localUri) {
        soundSource = { uri: matchSoundModule.localUri };
        console.log('🎵 [SOUND] Using localUri from asset object');
      } else if (matchSoundModule.uri) {
        soundSource = { uri: matchSoundModule.uri };
        console.log('🎵 [SOUND] Using uri from asset object');
      } else {
        // Try to use the module directly - might have a default export
        soundSource = matchSoundModule.default || matchSoundModule;
        console.log('🎵 [SOUND] Using module directly');
      }
    } else if (typeof matchSoundModule === 'number') {
      // Asset ID - pass directly
      soundSource = matchSoundModule;
      console.log('🎵 [SOUND] Using asset ID (number)');
    }
    
    console.log('🎵 [SOUND] Final sound source:', soundSource);
    
    // Load and play the match notification sound
    // Volume set to 1.0 (max) to ensure it's audible
    const { sound } = await Audio.Sound.createAsync(
      soundSource,
      {
        shouldPlay: false, // We'll call playAsync() manually for better control
        volume: 1.0, // Maximum volume for better audibility
        isLooping: false,
        rate: 1.0,
        shouldCorrectPitch: true,
        isMuted: false, // Ensure sound is not muted
      }
    );
    console.log('🎵 [SOUND] ✅ Sound instance created successfully');
    console.log('🎵 [SOUND] Sound object:', sound);

    matchSound = sound;

    // Set up playback status listener before playing
    // Wrap callback in try-catch to prevent crashes from errors in the callback
    sound.setOnPlaybackStatusUpdate((status) => {
      try {
        if (status.isLoaded) {
          console.log('🎵 [SOUND] Status update:', {
            isPlaying: status.isPlaying,
            didJustFinish: status.didJustFinish,
            volume: status.volume,
          });
          
          if (status.didJustFinish) {
            console.log('🎵 [SOUND] ✅ Sound finished playing, cleaning up...');
            sound.unloadAsync().catch((err) => {
              console.log('🎵 [SOUND] ⚠️ Error during cleanup (non-critical):', err);
            });
            matchSound = null;
          }
        }
      } catch (callbackError) {
        // Prevent errors in the callback from crashing the app
        console.error('🎵 [SOUND] ⚠️ Error in playback status callback (non-critical):', callbackError);
      }
    });

    console.log('🎵 [SOUND] Starting playback...');
    // Play the sound - set volume again right before playing to ensure it's not muted
    await sound.setVolumeAsync(1.0);
    await sound.setIsMutedAsync(false);
    
    // Get status before playing to verify sound is ready
    const statusBeforePlay = await sound.getStatusAsync();
    console.log('🎵 [SOUND] Status before play:', {
      isLoaded: statusBeforePlay.isLoaded,
      volume: statusBeforePlay.isLoaded ? statusBeforePlay.volume : 'N/A',
      isMuted: statusBeforePlay.isLoaded ? statusBeforePlay.isMuted : 'N/A',
    });
    
    // Play the sound
    const playbackStatus = await sound.playAsync();
    console.log('🎵 [SOUND] ✅ playAsync() called successfully');
    console.log('🎵 [SOUND] Playback status:', playbackStatus.isLoaded ? 'Loaded' : 'Not loaded');
    
    if (playbackStatus.isLoaded) {
      console.log('🎵 [SOUND] 🔊 Sound is now playing!');
      console.log('🎵 [SOUND] Volume:', playbackStatus.volume);
      console.log('🎵 [SOUND] Is muted:', playbackStatus.isMuted);
      console.log('🎵 [SOUND] Is playing:', playbackStatus.isPlaying);
      
      // Verify it's actually playing after a short delay
      setTimeout(async () => {
        const statusAfterPlay = await sound.getStatusAsync();
        if (statusAfterPlay.isLoaded) {
          console.log('🎵 [SOUND] Status after 200ms:', {
            isPlaying: statusAfterPlay.isPlaying,
            volume: statusAfterPlay.volume,
            isMuted: statusAfterPlay.isMuted,
          });
          if (!statusAfterPlay.isPlaying) {
            console.warn('🎵 [SOUND] ⚠️ Sound stopped playing unexpectedly');
          }
        }
      }, 200);
    } else {
      console.warn('🎵 [SOUND] ⚠️ Playback status not loaded - sound may not play');
      console.warn('🎵 [SOUND] Full status:', JSON.stringify(playbackStatus, null, 2));
    }
  } catch (error: any) {
    // Log errors even in production to help debug TestFlight issues
    console.error('🎵 [SOUND] ❌ ERROR playing match sound:', error?.message || String(error));
    console.error('🎵 [SOUND] Error type:', error?.name || 'Unknown');
    console.error('🎵 [SOUND] Error stack:', error?.stack || 'No stack trace');
    
    // Try to provide helpful debugging info
    if (error?.message?.includes('Cannot find module')) {
      console.error('🎵 [SOUND] 💡 TIP: Sound file may not be bundled. Make sure match-sound.mp3 exists in mobile/assets/');
    }
    if (error?.message?.includes('permission')) {
      console.error('🎵 [SOUND] 💡 TIP: Check audio permissions in app.json');
    }
    
    // Try fallback: Use a system notification sound via expo-notifications
    // Skip fallback to prevent additional errors - sound is non-critical
    console.warn('🎵 [SOUND] ⚠️ Skipping notification fallback to prevent crashes');
    // Note: Notification fallback was causing "undefined is not a function" errors
    // Sound playback is non-critical - app works fine without it
  }
}

