# 🚀 Submit Build to iOS TestFlight

## Complete Workflow

### Step 1: Login to EAS
```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli login
```

### Step 2: Build the iOS App
```bash
npx eas-cli build --platform ios --profile production
```
**This will:**
- Build your app in the cloud (~15-30 minutes)
- Auto-increment build number from 22 → 23
- Sign with your Apple Developer certificate
- Upload to App Store Connect automatically

### Step 3: Submit to TestFlight (if not auto-submitted)
If the build completed but didn't auto-submit, run:
```bash
npx eas-cli submit --platform ios --profile production
```

## One-Liner (if already logged in)
```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile && npx eas-cli build --platform ios --profile production
```

## What Happens Next

1. **Build starts** - Takes 15-30 minutes
2. **Upload to App Store Connect** - Automatic after build
3. **Apple Processing** - Wait 5-10 minutes
4. **Available in TestFlight** - Check App Store Connect

## Check Build Status

```bash
# List recent builds
npx eas-cli build:list

# View specific build details
npx eas-cli build:view [build-id]
```

## Verify in App Store Connect

After build completes:
1. Go to: https://appstoreconnect.apple.com
2. Navigate to: **My Apps** → **Mulligan** → **TestFlight**
3. Your build will appear once Apple processes it
4. Add to test groups and distribute

---

**Ready? Run the build command above! 🚀**





