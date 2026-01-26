#!/bin/bash

# Script to rebuild and submit Mulligan app to TestFlight
# Run this from the mobile directory

set -e  # Exit on error

echo "🚀 Starting Mulligan iOS rebuild and TestFlight submission..."
echo ""

# Navigate to mobile directory (if not already there)
cd "$(dirname "$0")"

echo "📦 Step 0: Installing/updating dependencies..."
echo "   (This includes new Sentry package for crash reporting)"
npm install
echo ""

echo "📦 Step 1: Building iOS app for production..."
echo "   This will increment build number automatically"
echo "   Note: Sentry is included (configure DSN in .env or src/utils/sentry.ts if desired)"
echo ""

# Build the iOS app
./node_modules/.bin/eas build --platform ios --profile production

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📤 Step 2: Submitting to TestFlight..."
echo ""

# Submit to TestFlight
./node_modules/.bin/eas submit --platform ios --profile production

echo ""
echo "🎉 Done! Your app is being submitted to TestFlight."
echo "   Check App Store Connect for submission status."
echo ""

