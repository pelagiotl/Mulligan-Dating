# Mulligan Mobile App 📱

React Native mobile app for Mulligan Dating.

## Setup Instructions

1. **Install dependencies:**
   ```bash
   cd mobile
   npm install
   ```

2. **Install Expo CLI globally (if not already installed):**
   ```bash
   npm install -g expo-cli
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **Run on iOS Simulator:**
   - Press `i` in the terminal, or
   - Open Xcode → Simulator → Run

5. **Run on physical device:**
   - Install Expo Go app from App Store
   - Scan QR code from terminal

## Environment Variables

Create a `.env` file in the `mobile/` directory:

```
API_URL=https://mulligan-backend.onrender.com
```

## Project Structure

```
mobile/
├── src/
│   ├── screens/        # Screen components
│   ├── components/     # Reusable components
│   ├── context/        # React Context (Auth, etc.)
│   ├── utils/          # Utilities (API client, etc.)
│   ├── services/       # Services (notifications, etc.)
│   ├── navigation/      # Navigation setup
│   └── types/          # TypeScript types
├── assets/             # Images, fonts, etc.
└── app.json            # Expo configuration
```

## Next Steps

1. Set up API client (convert from web version)
2. Set up navigation
3. Convert screens one by one
4. Add native features (camera, notifications, location)








