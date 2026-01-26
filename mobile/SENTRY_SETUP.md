# Sentry Crash Reporting Setup

Sentry has been added to help diagnose crashes. Follow these steps to enable it:

## Quick Setup (Optional but Recommended)

1. **Create a Sentry account** (free tier available)
   - Go to https://sentry.io/signup/
   - Create an account or sign in 

2. **Create a new project**
   - After signing in, click "Create Project" or "+ New Project"
   - Select **"React Native"** as the platform (this is the correct choice for Expo/React Native apps)
   - Name it "Mulligan" (or your preferred name)
   - ⚠️ Important: Choose "React Native", NOT "React" or "JavaScript" - React Native includes native crash support

3. **Get your DSN**
   - After creating the project, you'll see your DSN (Data Source Name)
   - It looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
   - Copy this DSN

4. **Add DSN to your project**

   **Option A: Environment Variable (Recommended)**
   - Create or edit `.env` file in the `mobile/` directory
   - Add: `EXPO_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
   - Replace with your actual DSN

   **Option B: Direct Configuration**
   - Edit `mobile/src/utils/sentry.ts`
   - Replace the empty string: `const SENTRY_DSN = 'your-dsn-here';`

5. **Install dependencies** (if not already done)
   ```bash
   cd mobile
   npm install
   ```

6. **Rebuild your app**
   ```bash
   ./node_modules/.bin/eas build --platform ios --profile production
   ```

## What Sentry Captures

- ✅ Native crashes (C++/Objective-C)
- ✅ JavaScript errors
- ✅ Unhandled promise rejections
- ✅ React component errors
- ✅ Stack traces with file names and line numbers
- ✅ Device info, OS version, app version
- ✅ User context (if configured)

## Viewing Crash Reports

1. Go to https://sentry.io
2. Navigate to your project
3. Check the "Issues" tab for crashes
4. Click on any issue to see:
   - Full stack trace
   - Device information
   - User context
   - Breadcrumbs (actions leading to crash)

## Testing Sentry

To verify Sentry is working:

1. Add this to a button handler temporarily:
   ```typescript
   import { captureException } from './src/utils/sentry';
   
   // In a button handler:
   captureException(new Error('Test error from Sentry'));
   ```

2. Trigger the error and check your Sentry dashboard

## Disabling Sentry

If you don't want to use Sentry:
- Just don't set the DSN - Sentry will log a warning but won't crash
- The app will work normally without Sentry configured

## Important Notes

- Sentry only captures errors in **production builds** (not Expo Go)
- Make sure to upload debug symbols (dSYMs) for iOS to see full stack traces
- EAS Build should handle symbol uploads automatically when Sentry is configured

## Need Help?

- Sentry Docs: https://docs.sentry.io/platforms/react-native/
- React Native Setup: https://docs.sentry.io/platforms/react-native/

