#!/usr/bin/env bash
# Verify a release APK has 16 KB zip alignment for native libs (Google Play check).
# Usage: ./scripts/check-android-16k-alignment.sh path/to/app-release.apk
# Requires Android SDK build-tools 35+ (zipalign on PATH or ANDROID_HOME set).

set -euo pipefail
APK="${1:?Usage: $0 <release.apk>}"

if [[ -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/build-tools/35.0.0/zipalign" ]]; then
  ZA="${ANDROID_HOME}/build-tools/35.0.0/zipalign"
elif command -v zipalign >/dev/null 2>&1; then
  ZA=zipalign
else
  echo "Set ANDROID_HOME or add zipalign (build-tools 35+) to PATH."
  exit 1
fi

echo "Running: $ZA -c -P 16 -v 4 \"$APK\""
"$ZA" -c -P 16 -v 4 "$APK" && echo "OK: 16 KB page alignment check passed."
