# 🔄 Rebuild for TestFlight - Step by Step

## Quick Steps

### Step 1: Navigate to Mobile Directory
```bash
cd mobile
```

### Step 2: Ensure You're Logged In
```bash
eas login
```
(If already logged in, this will confirm your account)

### Step 3: Build for iOS TestFlight
```bash
eas build --platform ios --profile production
```

**What this does:**
- Builds your app in the cloud with EAS Build
- Automatically increments the build number (due to `autoIncrement: true` in eas.json)
- Signs the app with your Apple Developer certificate
- Uploads directly to App Store Connect
- Takes approximately 15-30 minutes

### Step 4: Monitor Build Progress
While the build is running, you can:
- Watch the progress in your terminal
- Or check online: https://expo.dev/accounts/[your-account]/projects/mulligan/builds

### Step 5: Wait for Build to Complete
Once you see "Build finished successfully", wait 5-10 minutes for Apple to process it.

### Step 6: Check App Store Connect
1. Go to: https://appstoreconnect.apple.com
2. Navigate to: **My Apps** → **Mulligan** → **TestFlight** tab
3. Your new build should appear in the list
4. Once processing is complete, you can:
   - Add it to your existing TestFlight group
   - Or create a new test group

### Step 7: Distribute to Testers
- **Internal Testers**: Available immediately (no review)
- **External Testers**: Requires Beta App Review (24-48 hours)

## What's New in This Build

This build includes:
- ✅ Enhanced match sound notifications (volume increased, better error handling)
- ✅ Fixed seamless transition from Connect button to match celebration
- ✅ Improved authentication handling
- ✅ expo-av plugin configured for audio playback

## Troubleshooting

### Build Fails?
```bash
# Check recent builds
eas build:list

# View specific build logs
eas build:view [build-id]
```

### Certificate Issues?
```bash
# Manage credentials
eas credentials
```

### Need to Cancel a Build?
- Go to: https://expo.dev → Your project → Builds
- Click "Cancel" on the in-progress build

## Alternative: Preview Build (Faster Testing)

If you want a faster build for internal testing only:
```bash
eas build --platform ios --profile preview
```
- Faster build (no App Store Connect upload)
- Good for testing before production build
- Download .ipa file directly

## Time Estimate
- **Build Time**: 15-30 minutes
- **Apple Processing**: 5-10 minutes
- **Total**: ~20-40 minutes from command to TestFlight

## Next Steps After Build
1. ✅ Build completes
2. ✅ Wait for Apple processing (5-10 min)
3. ✅ Build appears in TestFlight
4. ✅ Add to test group
5. ✅ Testers receive update notification
6. ✅ Test the match sound! 🎵







