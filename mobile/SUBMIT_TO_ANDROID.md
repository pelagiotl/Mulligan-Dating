# Submit Mulligan to Google Play (Android)

## Prerequisites

- **Google Play Console** developer account ($25 one-time): [play.google.com/console](https://play.google.com/console)
- **EAS CLI** (use `npx eas-cli` — no global install needed)

## Complete workflow

### Step 1: Log in to EAS

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli login
```

### Step 2: Build the Android app

```bash
npx eas-cli build --platform android --profile production
```

- First time: EAS will prompt for Android credentials → choose **Let EAS handle it**.
- Build takes about **15–25 minutes**.
- You get an `.aab` (Android App Bundle) when it finishes.

**16 KB page size (Google Play):** The app targets **Expo SDK 53** (React Native 0.79) with 16 KB–aligned native libraries. Production builds use EAS image `sdk-53`, AGP 8.8.2, NDK 28, `useLegacyPackaging: false`, and `extractNativeLibs="false"`. Commit and push before building so EAS picks up `mobile/android/` and `package-lock.json`. If Play still flags a specific `.so`, check the bundle explorer and update that dependency; see [Expo’s 16 KB guide](https://github.com/expo/fyi/blob/main/android-16kb-page-sizes.md).

### Step 3: Submit to Google Play

**Option A – EAS Submit (recommended):**

```bash
npx eas-cli submit --platform android --profile production --latest
```

Or: `npm run eas:submit-android` (from `mobile/`).

- EAS will ask you to link your Play Console app (or create one).
- For automated uploads you may need a **Google Play service account**; EAS will guide you.

**Option B – Manual upload:**

1. Download the `.aab` from the [EAS build page](https://expo.dev/accounts/[your-account]/projects/mulligan/builds).
2. In Play Console → your app → **Release** → **Production** (or **Internal testing**).
3. **Create new release** → upload the `.aab`.

### One-liner (if already logged in)

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile && npx eas-cli build --platform android --profile production
```

Then after the build completes:

```bash
npx eas-cli submit --platform android --profile production
```

## First release checklist (Play Console)

Before your first release you must complete:

| Section           | What to do |
|-------------------|------------|
| **App content**   | Privacy policy URL, app access, ads declaration (if any) |
| **Store listing**| Short description, full description, at least 2 screenshots, feature graphic (1024×500) |
| **Content rating** | Complete the questionnaire |
| **Target audience** | Age groups |
| **News app**      | No (unless it’s a news app) |

## Internal testing (fastest)

1. In Play Console, open **Testing** → **Internal testing**.
2. Create a release and upload your first `.aab`.
3. Add testers by email — no review needed.
4. Share the opt-in link with testers.

## Check build status

```bash
# List recent builds
npx eas-cli build:list

# View a specific build
npx eas-cli build:view [build-id]
```

## Verify in Play Console

After submission:

1. Go to [Google Play Console](https://play.google.com/console).
2. Open your app → **Release** → **Production** (or **Internal testing**).
3. Your release will show as pending or in review.

---

**Ready? Run the build command above, then submit when it’s done.**
