#!/bin/bash

# 🚀 Mulligan TestFlight Submission Script
# This script builds and submits your app to TestFlight

set -e  # Exit on error

echo "🚀 Starting TestFlight submission process..."
echo ""

# Navigate to mobile directory
cd "$(dirname "$0")"
echo "📁 Current directory: $(pwd)"
echo ""

# Install dependencies (includes eas-cli as devDependency)
echo "📦 Ensuring dependencies are installed (including EAS CLI)..."
npm install
echo ""

# Check if logged in (use npx so we use local eas-cli)
echo "🔐 Checking EAS login status..."
if ! npx eas whoami &> /dev/null; then
    echo "⚠️  Not logged in. Please log in:"
    npx eas login
    echo ""
fi

echo "📦 Building iOS app for production..."
echo "   This will take 15-30 minutes..."
echo ""

# Build the app (use local eas-cli via npx)
npx eas build --platform ios --profile production

echo ""
echo "✅ Build completed!"
echo ""
echo "📤 Submitting to TestFlight..."
echo ""

# Submit to TestFlight
npx eas submit --platform ios --profile production

echo ""
echo "🎉 Submission complete!"
echo ""
echo "Next steps:"
echo "1. Wait 5-10 minutes for Apple to process"
echo "2. Go to: https://appstoreconnect.apple.com"
echo "3. Navigate to: My Apps → Mulligan → TestFlight"
echo "4. Your build will appear once processed"
echo ""
echo "✨ Done!"



