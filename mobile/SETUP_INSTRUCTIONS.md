# 🚀 React Native Setup Instructions

## Step 1: Install Dependencies

Since we hit npm permission issues, let's install manually:

```bash
cd mobile
npm install
```

If that doesn't work, try:
```bash
npm install --cache /tmp/.npm
```

## Step 2: Install Expo CLI (if needed)

```bash
npm install -g expo-cli
```

Or use npx (no global install needed):
```bash
npx expo start
```

## Step 3: Create Assets Folder

You'll need to create placeholder images:

```bash
mkdir -p mobile/assets
```

Then add:
- `icon.png` (1024x1024) - App icon
- `splash.png` (1284x2778) - Splash screen
- `adaptive-icon.png` (1024x1024) - Android adaptive icon
- `favicon.png` (48x48) - Web favicon

For now, you can use placeholder images or I can help you create them.

## Step 4: Start Development Server

```bash
cd mobile
npm start
```

This will:
1. Start Expo dev server
2. Show a QR code
3. Open Metro bundler

## Step 5: Run on iOS

**Option A: iOS Simulator (Recommended for development)**
- Press `i` in the terminal
- Or open Xcode → Simulator → Run

**Option B: Physical Device**
- Install "Expo Go" from App Store
- Scan QR code from terminal

## What's Already Set Up

✅ Project structure created
✅ API client converted (uses AsyncStorage)
✅ TypeScript configuration
✅ Expo configuration with permissions
✅ Navigation structure ready

## Next Steps

1. ✅ API client - DONE
2. ⏳ Set up navigation
3. ⏳ Convert first screen (PhoneLogin)
4. ⏳ Add native features

## Troubleshooting

**If npm install fails:**
- Try: `npm install --cache /tmp/.npm`
- Or: `sudo chown -R $(whoami) ~/.npm`

**If Expo CLI not found:**
- Use: `npx expo start` instead of `expo start`

**If iOS Simulator not opening:**
- Make sure Xcode is installed
- Run: `xcode-select --install`








