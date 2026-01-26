# TestFlight Submission Commands

Follow these steps to submit your app to TestFlight:

## Step 1: Navigate to the mobile directory
```bash
cd /Users/code404/Desktop/Mulligan-Dating/mobile
```

## Step 2: Install EAS CLI (if not already installed)
```bash
npm install -g eas-cli
```
OR use npx (no installation needed):
```bash
npx eas-cli@latest
```

## Step 3: Login to your Expo account
```bash
eas login
```

## Step 4: Build the iOS app for production
```bash
eas build --platform ios --profile production
```

This will:
- Build your app in the cloud
- Automatically increment the build number (configured in eas.json)
- Take about 10-20 minutes

## Step 5: Submit to TestFlight
Once the build completes, submit it to TestFlight:

```bash
eas submit --platform ios --profile production
```

This will:
- Automatically submit the latest build to App Store Connect
- Make it available in TestFlight

## Alternative: Build and Submit in One Command
You can also build and submit together:

```bash
eas build --platform ios --profile production --auto-submit
```

## Notes:
- Make sure you're logged into the correct Expo account
- Ensure your Apple Developer account is connected to Expo
- The build number will auto-increment (currently at 22 in app.json)
- The bundle identifier is: `com.lukepelagiotomerlin.mulligan`

## Check Build Status
To check the status of your builds:
```bash
eas build:list
```

## View Submission Status
To check submission status:
```bash
eas submit:list
```



