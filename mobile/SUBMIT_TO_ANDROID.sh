#!/bin/bash

# Submit Mulligan to Google Play (Android)
# Builds the Android app and submits via EAS.

set -e

echo "🚀 Starting Android (Google Play) submission..."
echo ""

cd "$(dirname "$0")"
echo "📁 Working in: $(pwd)"
echo ""

echo "📦 Ensuring dependencies (including EAS CLI)..."
npm install
echo ""

echo "🔐 Checking EAS login..."
if ! npx eas whoami &> /dev/null; then
    echo "⚠️  Not logged in. Run:"
    npx eas login
    echo ""
fi

echo "📦 Building Android app (production)..."
echo "   This usually takes 15–25 minutes."
echo ""

npx eas build --platform android --profile production

echo ""
echo "✅ Build finished!"
echo ""
echo "📤 Submitting to Google Play..."
echo ""

npx eas submit --platform android --profile production

echo ""
echo "🎉 Submission complete!"
echo ""
echo "Next steps:"
echo "1. Open https://play.google.com/console"
echo "2. Go to your app → Release → Production (or Internal testing)"
echo "3. Complete store listing, content rating, and policy if first release"
echo ""
echo "✨ Done!"
