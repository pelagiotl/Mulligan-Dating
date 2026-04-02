#!/usr/bin/env bash
# After editing assets/splash.png, run from mobile/: bash scripts/sync-splash-native.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPLASH="$ROOT/assets/splash.png"
if [[ ! -f "$SPLASH" ]]; then
  echo "Missing $SPLASH"
  exit 1
fi
IOS="$ROOT/ios/Mulligan/Images.xcassets/SplashScreenLogo.imageset"
cp "$SPLASH" "$IOS/image.png"
cp "$SPLASH" "$IOS/image@2x.png"
cp "$SPLASH" "$IOS/image@3x.png"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  cp "$SPLASH" "$ROOT/android/app/src/main/res/drawable-${d}/splashscreen_logo.png"
done
echo "Synced splash.png → iOS SplashScreenLogo.imageset + Android drawable-*dpi/splashscreen_logo.png"
