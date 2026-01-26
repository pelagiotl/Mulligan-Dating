# Quick Sentry DSN Setup

## Skip the Wizard - We Already Set Up Sentry!

The Sentry wizard command is for manual setup, but we've already integrated Sentry into your code. You just need to add your DSN.

## Step 1: Get Your DSN

1. In Sentry, go to your project
2. Click on **"Settings"** (gear icon) in the left sidebar
3. Go to **"Projects"** → **"Mulligan"** (or your project name)
4. Click on **"Client Keys (DSN)"** in the left menu
5. You'll see your DSN - it looks like:
   ```
   https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```
6. Click the **"Copy"** button to copy it

## Step 2: Add DSN to Your Project

You have two options:

### Option A: Environment Variable (Recommended)

1. Create or edit `.env` file in the `mobile/` directory:
   ```bash
   cd /Users/code404/Desktop/Mulligan-Dating/mobile
   touch .env
   ```

2. Add your DSN to the file:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```
   (Replace with your actual DSN)

3. Make sure `.env` is in `.gitignore` (it should be by default)

### Option B: Direct in Code (Quick but less secure)

1. Edit `mobile/src/utils/sentry.ts`
2. Find this line:
   ```typescript
   const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
   ```
3. Replace it with:
   ```typescript
   const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://xxxxx@xxxxx.ingest.sentry.io/xxxxx';
   ```
   (Replace with your actual DSN)

## Step 3: That's It!

After adding the DSN:
- ✅ Sentry will automatically start capturing crashes
- ✅ Works in production builds (TestFlight/App Store)
- ✅ No need to run the wizard command

## Next: Rebuild Your App

After adding the DSN, rebuild your app:

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npm install  # If you haven't already
./node_modules/.bin/eas build --platform ios --profile production
```

## Test It (Optional)

After deploying, you can test Sentry by temporarily adding this to a button:

```typescript
import { captureException } from './src/utils/sentry';
captureException(new Error('Test error'));
```

Then check your Sentry dashboard to see if it appears.






