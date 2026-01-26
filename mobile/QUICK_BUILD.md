# 🚀 Quick Build Instructions

## Install EAS CLI (choose one option)

### Option 1: Use npx (no installation needed)
You can run EAS commands directly with npx:

```bash
npx eas-cli login
npx eas-cli build --platform ios --profile production
```

### Option 2: Install globally with sudo
```bash
sudo npm install -g eas-cli
eas login
eas build --platform ios --profile production
```

### Option 3: Install locally in project
```bash
npm install --save-dev eas-cli
npx eas-cli login
npx eas-cli build --platform ios --profile production
```

## Recommended: Use Option 1 (npx)

Just run:
```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
npx eas-cli login
npx eas-cli build --platform ios --profile production
```

This will:
1. Login to your Expo account
2. Build the iOS app for production
3. Upload to TestFlight automatically

No installation needed! ✨





