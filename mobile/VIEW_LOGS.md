# How to View App Logs from TestFlight

## Method 1: Using Xcode (Easiest)

1. **Open Xcode** (if you have it installed)
2. **Connect your iPhone** to your Mac via USB
3. **Open Window → Devices and Simulators** (or press `Cmd+Shift+2`)
4. **Select your iPhone** from the left sidebar
5. **Click "Open Console"** button at the bottom
6. **Filter logs**: In the search box, type `🎵` or `SOUND` to filter for sound-related logs
7. **Trigger a match** in the app to see the logs appear in real-time

## Method 2: Using Console.app (Built into Mac)

1. **Open Console.app** (Applications → Utilities → Console)
2. **Connect your iPhone** to your Mac via USB
3. **Select your iPhone** from the left sidebar (under "Devices")
4. **Filter logs**: In the search box, type `🎵` or `SOUND`
5. **Trigger a match** in the app

## Method 3: Using Terminal (Command Line)

```bash
# List connected devices
xcrun xctrace list devices

# Stream logs from your device (replace with your device name)
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "Mulligan"' --level debug

# Or for physical device:
idevicesyslog -u <device-udid>
```

## Method 4: View Logs Directly on iPhone (iOS 15+)

1. **Settings → Privacy & Security → Analytics & Improvements → Analytics Data**
2. **Search for "Mulligan"** or look for recent crash/error logs
3. **Tap on a log file** to view it
4. **Look for entries with "🎵" or "SOUND"**

## Method 5: Using Safari Web Inspector (For WebView debugging)

If your app has any web components, you can use Safari:
1. **Settings → Safari → Advanced → Web Inspector** (enable)
2. **Connect iPhone to Mac**
3. **Open Safari on Mac → Develop → [Your iPhone] → Mulligan**

## What to Look For

When you trigger a match, look for these log entries:

```
🎵 [SOUND] ========== playMatchSound() called ==========
🎵 [SOUND] soundAsset available: YES/NO
🎵 [SOUND] Setting audio mode for playback...
🎵 [SOUND] ✅ Audio mode set successfully
🎵 [SOUND] Creating new sound instance from bundled asset...
🎵 [SOUND] ✅ Sound instance created successfully
🎵 [SOUND] Starting playback...
🎵 [SOUND] 🔊 Sound is now playing!
```

## Quick Test

1. Connect your iPhone to Mac
2. Open Xcode → Window → Devices and Simulators
3. Select your iPhone → Open Console
4. Filter by: `🎵`
5. Open the Mulligan app on your phone
6. Create a match
7. Watch the logs appear in real-time

## If You Don't Have Xcode

You can download Xcode from the Mac App Store (it's free but large ~15GB), or use Console.app which comes pre-installed on Mac.

## Alternative: Add In-App Log Viewer

If viewing logs is difficult, we could add a debug screen in the app that shows recent logs. Would you like me to add that?





