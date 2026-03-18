# 🚀 Build for TestFlight - Ready to Submit!

## Quick Start

Navigate to the mobile directory and run:

```bash
cd mobile
eas build --platform ios --profile production
```

## What This Does

1. **Builds your app** with all recent fixes:
   - ✅ Horizontal pagination for CreateProfileScreen (swipeable cards)
   - ✅ Fixed React hooks error (moved hooks to top level)
   - ✅ Comprehensive crash handling (Sentry configured)
   - ✅ Auto-login functionality
   - ✅ Full-screen card styling improvements

2. **Auto-increments build number** from 22 → 23 (configured in eas.json)

3. **Uploads to App Store Connect** automatically

4. **Build time**: ~15-30 minutes

## Prerequisites

Make sure you're logged into EAS:
```bash
eas login
```

## After Build Completes

1. **Wait 5-10 minutes** for Apple to process the build
2. **Check App Store Connect**: https://appstoreconnect.apple.com
   - Go to: **My Apps** → **Mulligan** → **TestFlight** tab
   - Your new build will appear once processed
3. **Add to TestFlight group**:
   - Internal testers: Available immediately (no review)
   - External testers: Requires Beta App Review (24-48 hours)

## Build Notes for This Version

**What's New:**
- Improved profile creation experience with horizontal swipeable cards
- Fixed React hooks error that was causing crashes
- Enhanced error handling and crash reporting
- Better auto-login functionality
- Full-screen card layouts for better UX

**What to Test:**
- Profile creation flow (swipe through cards horizontally)
- Auto-login after app restart
- Crash reporting (check Sentry if any issues occur)
- Match notifications and audio playback

## Troubleshooting

### Build Fails?
```bash
# Check build status
eas build:list

# View build logs
eas build:view [build-id]
```

### Need to Check Credentials?
```bash
eas credentials
```

### Build Not Appearing in TestFlight?
- Wait 5-10 minutes after build completes
- Check that bundle ID matches: `app.mulligandating`
- Verify App Store Connect account has access

## Next Steps

Once build is in TestFlight:
1. ✅ Add to test group
2. ✅ Add release notes
3. ✅ Distribute to testers
4. ✅ Monitor crash reports in Sentry
5. ✅ Gather feedback for next iteration

---

**Ready? Run the build command above! 🚀**





