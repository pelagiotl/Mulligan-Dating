# Crash Debugging Guide

## Current Issue

The app is crashing with a native-level crash (Objective-C/C++). The crash is happening in the React Native bridge during native module invocation.

## What We Know

- ✅ Crash happens after app successfully launches
- ✅ Crash is in native code (`RCTNativeModule::invoke`)
- ❌ Without debug symbols, we can't see which specific call is failing
- ❌ JavaScript error handlers can't catch native C++ crashes

## What We've Added

1. **Native Module Guard** - Prevents native module calls until app is fully initialized
2. **Deferred Push Notifications** - Increased delay to 3 seconds + guard
3. **Enhanced Error Handling** - Better logging and error capture
4. **Sentry Integration** - Will capture native crashes with full stack traces (when configured)

## Next Steps - CRITICAL

### 1. Configure Sentry (DO THIS FIRST)

Without Sentry, we're flying blind. We need it to see what's actually crashing.

**Follow:** `mobile/SENTRY_SETUP.md`

**Why it's critical:**
- Sentry captures native crashes with full stack traces
- Shows exactly which JavaScript call triggered the crash
- Includes device info, OS version, and more context

### 2. Upload Debug Symbols (dSYMs)

For iOS, you need to upload dSYM files to Sentry:

1. After building with EAS, download the dSYM from the build artifacts
2. Or configure EAS to auto-upload symbols (see Sentry docs)
3. Without dSYMs, crash reports show memory addresses instead of code locations

### 3. Test and Review Crash Reports

1. Deploy the new build with all the safeguards
2. Test the app - try to reproduce the crash
3. Check Sentry dashboard for crash reports
4. Look for the specific native module that's failing

## Temporary Workaround (If Needed)

If crashes persist, we can temporarily disable features to isolate:

1. **Disable Push Notifications**
   - Comment out `registerForPushNotificationsAsync()` calls
   - See if crash still happens

2. **Disable Audio**
   - Comment out `playMatchSound()` calls
   - See if crash still happens

3. **Disable Location**
   - Comment out Location module calls
   - See if crash still happens

## Common Causes of Native Module Crashes

1. **Calling native modules before JS bridge is ready**
   - ✅ Fixed with NativeModuleGuard

2. **Invalid parameters passed to native modules**
   - Need Sentry to identify which call

3. **Native module not properly linked/installed**
   - Should show in build logs

4. **Memory issues (out of bounds access)**
   - Need Sentry with symbols to diagnose

5. **Threading issues (calling from wrong thread)**
   - React Native should handle this, but can happen

## How to Check If Fixes Work

1. **Monitor crash frequency**
   - Before: Crashes immediately after launch
   - After: Should crash less frequently (or not at all)

2. **Check Sentry reports**
   - Look for new crash reports with better stack traces
   - Identify the specific module/call causing issues

3. **Check console logs**
   - Look for warnings about native modules being called too early
   - Check for error messages from our guards

## If Crash Still Happens

1. **Check Sentry dashboard** - This is your best diagnostic tool
2. **Share the Sentry crash report** - It will show the exact failing code
3. **Check the specific module** - We can then add targeted fixes

## Current Build Status

- ✅ Native Module Guard added
- ✅ Enhanced error handling
- ✅ Sentry integration (needs DSN configuration)
- ⏳ Waiting for Sentry setup to get full diagnostics






