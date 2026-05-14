# Mulligan — app-specific R8 rules (RN + Expo base rules come from node_modules via build.gradle)

# Readable production stack traces; R8 still strips unused code.
-dontobfuscate

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# RevenueCat / Purchases
-keep class com.revenuecat.purchases.** { *; }
-dontwarn com.revenuecat.purchases.**

# Sentry
-keepattributes SourceFile,LineNumberTable
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# Google Play Services / Wallet / FCM
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# OkHttp / platform
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**

# SoLoader
-keep class com.facebook.soloader.** { *; }
