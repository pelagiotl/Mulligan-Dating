#!/usr/bin/env bash
# After editing assets/icon.png, adaptive-icon.png, or splash.png, run from mobile/:
#   bash scripts/sync-native-from-assets.sh
# Expo (app.json) already points at ./assets/*; this copies the same files into iOS/Android native trees.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/sync-splash-native.sh"
cp "$ROOT/assets/icon.png" "$ROOT/ios/Mulligan/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
(cd "$ROOT" && node scripts/sync-android-launcher-icons-from-assets.js)
echo "✅ Native app icon + splash synced from assets/icon.png, adaptive-icon.png, splash.png"
