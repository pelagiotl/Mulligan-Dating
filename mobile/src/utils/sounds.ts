import { Audio } from 'expo-av';

let matchSound: Audio.Sound | null = null;
let soundAsset: any = null;

// Try to load sound file at module load time
// This works in development, TestFlight, and production iOS builds
console.log('🎵 Attempting to load sound file...');
try {
  // Try MP3 first (best Metro bundler support)
  soundAsset = require('../assets/match-sound.mp3');
  console.log('🎵 ✅ MP3 require() succeeded! Type:', typeof soundAsset, 'Value:', soundAsset);
} catch (mp3Error: any) {
  console.log('🎵 ❌ MP3 require() failed:', mp3Error?.message || String(mp3Error));
  try {
    // Try M4A (Mac/iOS native format)
    soundAsset = require('../assets/match-sound.m4a');
    console.log('🎵 ✅ M4A require() succeeded!');
  } catch (m4aError: any) {
    console.log('🎵 ❌ M4A require() failed:', m4aError?.message || String(m4aError));
    try {
      // Try WAV (may not bundle with Metro, but works if it does)
      soundAsset = require('../assets/match-sound.wav');
      console.log('🎵 ✅ WAV require() succeeded!');
    } catch (wavError: any) {
      // No sound file found - app will work fine without sound
      soundAsset = null;
      console.log('🎵 ❌ All formats failed - match sound will be disabled');
      console.log('🎵 MP3 error:', mp3Error?.message || String(mp3Error));
      console.log('🎵 M4A error:', m4aError?.message || String(m4aError));
      console.log('🎵 WAV error:', wavError?.message || String(wavError));
    }
  }
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
  console.log('🎵 [SOUND] playMatchSound() called');
  console.log('🎵 [SOUND] soundAsset available:', soundAsset ? 'YES' : 'NO');
  
  // If no sound file available, skip silently
  if (!soundAsset) {
    console.warn('🎵 [SOUND] ⚠️ Skipping sound - no sound file found in bundle');
    console.warn('🎵 [SOUND] Make sure match-sound.mp3 is in mobile/assets/ directory');
    return;
  }

  try {
    console.log('🎵 [SOUND] Setting audio mode for playback...');
    // Set audio mode for playback - important for iOS
    // This ensures sound plays even if phone is in silent mode
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true, // CRITICAL: Allows sound to play in silent mode
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX, // Changed to DO_NOT_MIX for better playback
      interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      playThroughEarpieceAndroid: false, // Ensure sound plays through speaker
    });
    console.log('🎵 [SOUND] ✅ Audio mode set successfully');

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
    // Load and play the match notification sound
    // Volume set to 1.0 (max) to ensure it's audible
    const { sound } = await Audio.Sound.createAsync(
      soundAsset,
      {
        shouldPlay: false, // We'll call playAsync() manually for better control
        volume: 1.0, // Maximum volume for better audibility
        isLooping: false,
        rate: 1.0,
        shouldCorrectPitch: true,
      }
    );
    console.log('🎵 [SOUND] ✅ Sound instance created successfully');

    matchSound = sound;

    // Set up playback status listener before playing
    sound.setOnPlaybackStatusUpdate((status) => {
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
    });

    console.log('🎵 [SOUND] Starting playback...');
    // Play the sound
    const playbackStatus = await sound.playAsync();
    console.log('🎵 [SOUND] ✅ playAsync() called successfully');
    console.log('🎵 [SOUND] Playback status:', playbackStatus.isLoaded ? 'Loaded' : 'Not loaded');
    
    if (playbackStatus.isLoaded) {
      console.log('🎵 [SOUND] 🔊 Sound is now playing!');
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
  }
}

