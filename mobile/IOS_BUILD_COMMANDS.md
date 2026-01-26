# iOS Build and Submit Commands

## 1. Build for iOS Production

Build the app for iOS production (TestFlight):

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli build --platform ios --profile production
```

This will:
- Auto-increment the build number (currently at 30)
- Upload the build to EAS servers
- Build takes 10-20 minutes typically

## 2. Submit Latest Build to TestFlight

After the build completes, submit it to TestFlight:

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli submit --platform ios --latest
```

## 3. Build and Submit in One Command (Requires Apple Account Login)

If you want to build and auto-submit in one step:

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli build --platform ios --profile production --auto-submit
```

Note: This will prompt for Apple account credentials during the build.

## 4. Check Build Status

Monitor your build progress:

```bash
npx eas-cli build:list --platform ios --limit 5
```

## 5. Submit a Specific Build

If you need to submit a specific build by ID:

```bash
npx eas-cli submit --platform ios --id <build-id>
```

Find the build ID from: https://expo.dev/accounts/mulligandating/projects/mulligan/builds

## Quick Reference

**Current Build Info:**
- Build Number: 30 (auto-increments)
- Bundle Identifier: com.lukepelagiotomerlin.mulligan
- Latest Build URL: https://expo.dev/accounts/mulligandating/projects/mulligan/builds/18a96355-9bcd-47ae-b96e-71af33543a35

**Most Common Workflow:**
```bash
# Step 1: Build
npx eas-cli build --platform ios --profile production

# Step 2: Wait for build to complete, then submit
npx eas-cli submit --platform ios --latest
```





