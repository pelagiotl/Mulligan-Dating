# Build and Submit Instructions

## Step 1: Build the iOS App

Run this command to build your app:

```bash
./node_modules/.bin/eas build --platform ios --profile production
```

**What happens:**
- Build number automatically increments (from 22 to 23)
- Builds on EAS servers (cloud build)
- Takes about 10-20 minutes
- You'll need to authenticate with your Apple account if prompted

## Step 2: Submit to TestFlight

After the build completes successfully, submit it:

```bash
./node_modules/.bin/eas submit --platform ios --profile production
```

**What happens:**
- Uploads the build to App Store Connect
- Submits to TestFlight
- Takes about 5-10 minutes

## Alternative: Use the Script

You can also run both steps at once:

```bash
./rebuild-and-submit.sh
```

## After Submission

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to your app → TestFlight tab
3. Wait for processing to complete (usually 10-30 minutes)
4. The build will be available for testing

## What's Fixed in This Build

✅ Global error handlers for unhandled errors
✅ Improved push notification error handling  
✅ Deferred native module initialization
✅ Audio callback error handling
✅ Sentry integration (optional - works without DSN)
✅ Better error logging throughout

## Troubleshooting

If you get authentication errors:
- Make sure you're logged into the correct Apple account
- EAS will prompt you to log in if needed

If build fails:
- Check the error message in the terminal
- Make sure your EAS account is properly configured
- Run `eas login` if needed






