# 🚀 TestFlight Launch Steps

## Prerequisites
- ✅ Apple Developer Account ($99/year) - https://developer.apple.com
- ✅ Backend deployed to Render (Professional plan)
- ✅ All services configured (Twilio, Stripe)

## Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

## Step 2: Login to Expo
```bash
eas login
```
(This will prompt you to create a free Expo account if you don't have one)

## Step 3: Configure EAS Build
```bash
cd mobile
eas build:configure
```
This will:
- Create `eas.json` configuration file
- Set up build profiles
- Link your Expo account

## Step 4: Build for iOS (TestFlight)
```bash
cd mobile
eas build --platform ios --profile preview
```

Or for production build:
```bash
eas build --platform ios --profile production
```

**What happens:**
- EAS will build your app in the cloud
- Sign it with your Apple Developer certificate
- Upload to App Store Connect automatically
- Takes ~15-30 minutes

## Step 5: App Store Connect Setup

### A. Create App (if not already created)
1. Go to: https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform**: iOS
   - **Name**: Mulligan
   - **Primary Language**: English
   - **Bundle ID**: `com.mulligan.dating` (select from dropdown)
   - **SKU**: `mulligan-dating-001`
   - **User Access**: Full Access

### B. Set Up TestFlight
1. Go to TestFlight tab in App Store Connect
2. Wait for build to appear (may take a few minutes after EAS build completes)
3. Select your build
4. Add testers:
   - **Internal Testers**: Up to 100 (your Apple Developer team members)
   - **External Testers**: Up to 10,000 (requires Beta App Review)
5. Add build notes:
   - What's new in this build
   - What to test
   - Known issues (if any)

### C. Submit for Review (External Testers)
- Internal testers: No review needed
- External testers: Requires Beta App Review (24-48 hours)

## Step 6: Share TestFlight Link
Once approved, App Store Connect will provide:
- TestFlight link for testers
- Invitation emails automatically sent

## Troubleshooting

### Build fails?
- Check EAS build logs: `eas build:list`
- Verify app.json configuration
- Check bundle ID matches App Store Connect

### Build not appearing in TestFlight?
- Wait 5-10 minutes after build completes
- Check App Store Connect → TestFlight → Builds
- Verify bundle ID matches

### Certificate issues?
- EAS handles certificates automatically
- If issues: `eas credentials` in mobile directory

## Time Estimate
- EAS Build: 15-30 minutes
- App Store Connect processing: 5-10 minutes
- TestFlight review (external testers): 24-48 hours
- **Total**: 2-3 days from build to external testers

## Need Help?
- EAS Docs: https://docs.expo.dev/build/introduction/
- App Store Connect: https://help.apple.com/app-store-connect/
- Expo Discord: https://discord.gg/expo








