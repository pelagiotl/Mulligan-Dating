# Submit Mulligan to Google Play Store (Android)

## Prerequisites
- ✅ Google Play Console developer account ($25 one-time)
- ✅ EAS CLI (use `npx eas-cli` if not installed globally)

## Step 1: Create the app in Play Console
1. Go to [Google Play Console](https://play.google.com/console)
2. Click **Create app**
3. Fill in:
   - **App name:** Mulligan
   - **Default language:** English (United States)
   - **App or game:** App
   - **Free or paid:** Free
4. Accept declarations and create

## Step 2: Build the Android app
```bash
cd mobile
npx eas-cli build --platform android --profile production
```
- First build: EAS will prompt to set up credentials (choose "Let EAS handle it")
- Build takes ~15–25 minutes
- You'll get an `.aab` (Android App Bundle) URL when done

## Step 3: Submit to Play Console
**Option A – EAS Submit (recommended):**
```bash
npx eas-cli submit --platform android --profile production
```
- EAS will prompt you to link to your Play Console app (or create a new one)
- You may need a service account JSON key for automated uploads; EAS can guide you

**Option B – Manual upload:**
1. Download the `.aab` from the EAS build page
2. In Play Console → your app → **Release** → **Production** (or **Internal testing**)
3. Create new release → Upload the `.aab`

## Step 4: Complete Play Console setup (first release)
Before your first release, complete:
- **App content:** Privacy policy URL, app access, ads declaration (if any)
- **Store listing:** Short description, full description, screenshots (at least 2), feature graphic (1024×500)
- **Content rating:** Complete the questionnaire
- **Target audience:** Age groups
- **News app:** No (if not a news app)

## For internal testing (fastest path)
1. Create an **Internal testing** track
2. Upload your first `.aab`
3. Add testers (email list) – no review needed
4. Share the opt-in link with your testers

## Quick commands
```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile

# Build Android
npx eas-cli build --platform android --profile production

# Submit (after build completes)
npx eas-cli submit --platform android --profile production
```
