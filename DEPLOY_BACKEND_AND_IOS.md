# Deploy Backend (Render) + Submit to iOS TestFlight

## 1. Commit & push → Render redeploys

Render deploys from your GitHub repo. Pushing to the branch Render watches (usually `main`) triggers a redeploy.

```bash
cd /Users/code404/Desktop/Mulligan-Dating

# Stage all changes
git add .

# Commit (include recent work: inline messaging keyboard, Android keyboard config, etc.)
git commit -m "fix: inline messaging keyboard, Android softwareKeyboardLayoutMode, focus-on-tap fallback"

# Push to main (Render auto-redeploys)
git push origin main
```

If your default remote branch differs (e.g. `master`), use that instead of `main`.

**Check Render:** [Dashboard](https://dashboard.render.com) → your backend service → **Events** / **Logs** to confirm the new deploy.

---

## 2. Submit to iOS TestFlight (App Store Connect)

Run these from the **`mobile`** directory.

### Option A: Build then submit (recommended)

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile

# Log in to EAS (if needed)
npx eas-cli login

# 1. Build iOS app (production profile, auto-increment build)
npx eas-cli build --platform ios --profile production

# 2. After build finishes, submit that build to TestFlight
npx eas-cli submit --platform ios --latest --profile production
```

### Option B: Use the project script

```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
./rebuild-and-submit.sh
```

The script runs `npm install`, then `eas build`, then `eas submit` (no `--latest`; EAS will prompt for build if needed).

### Check status

```bash
# List recent builds
npx eas-cli build:list

# Inspect a build
npx eas-cli build:view <build-id>
```

### In App Store Connect

1. Open [App Store Connect](https://appstoreconnect.apple.com).
2. **My Apps** → **Mulligan** → **TestFlight**.
3. After processing (often 5–15 min), the new build appears.
4. Add internal/external testers and enable the build.

---

## Summary

| Step | Command |
|------|---------|
| **Backend (Render)** | `git add . && git commit -m "..." && git push origin main` |
| **iOS build** | `cd mobile && npx eas-cli build --platform ios --profile production` |
| **TestFlight submit** | `cd mobile && npx eas-cli submit --platform ios --latest --profile production` |

Build + submit usually takes ~20–40 minutes total.
