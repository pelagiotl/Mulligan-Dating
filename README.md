# Mulligan 💘

> *A modern dating app where second chances lead to first connections*

Mulligan is a full-stack dating application that helps people find meaningful connections by focusing on what truly matters: shared interests, compatible preferences, and honest dealbreakers.

## Features

- **User Authentication** - Secure signup and login
- **Rich Profiles** - Express yourself with interests, hobbies, and photos
- **Preferences & Dealbreakers** - Be honest about what you want
- **Smart Matching** - Find people who share your values
- **In-app message notifications** - Reliable notifications when you receive new messages
- **Truth or Dare** - Icebreaker game with a 7-minute timer
- **Beautiful UI** - A delightful experience on every device

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (development) / PostgreSQL (production)
- **Styling**: CSS with custom properties

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development servers (frontend + backend)
npm run dev
```

The frontend will be available at: [http://localhost:5173](http://localhost:5173)
The backend API will be available at: [http://localhost:3001](http://localhost:3001)

### Geocoding Setup (Optional but Recommended)

For accurate distance calculations in matching, set up a  geocoding API key. The app supports multiple providers:

**Option 1: Mapbox (Recommended)**
1. Sign up at https://account.mapbox.com/
2. Get your access token
3. Add to backend `.env` file: `MAPBOX_ACCESS_TOKEN=your_token_here`

**Option 2: Google Maps**
1. Get API key from https://console.cloud.google.com/
2. Add to backend `.env` file: `GOOGLE_MAPS_API_KEY=your_key_here`

**Option 3: Free (No Setup)**
- If no API keys are provided, the app uses Nominatim (OpenStreetMap)
- Free but has rate limits (1 request per second)
- Good for development, not recommended for production

The app will automatically use the best available provider.

### Push notifications (mobile – outside-app)

To get **system** message notifications when the app is in the background or closed:

1. **Backend (Render)**  
   - Set `EXPO_ACCESS_TOKEN` in the Render service environment (create at [expo.dev → Access Tokens](https://expo.dev/accounts/[account]/settings/access-tokens)).  
   - On deploy you should see in logs: `Push: Expo SDK loaded. EXPO_ACCESS_TOKEN is set (push delivery enabled)`.

2. **Recipient device**  
   - Use a **real device** (e.g. TestFlight or EAS dev build). Push when the app is killed often does **not** work in the iOS Simulator or in Expo Go.  
   - Open the app at least once after login and **allow notifications** so the push token is saved.

3. **Verify in Render logs**  
   Message push uses the **same** pipeline as match and date-plan notifications (same token, same Expo config). When someone sends a chat message, look for:  
   - `📲 Push (message HTTP): recipient=… hasToken=true validFormat=true EXPO_ACCESS_TOKEN=set` → push was attempted.  
   - `✅ Push (message HTTP) sent to …` → Expo accepted it.  
   - If you see `hasToken=false` → the **recipient** (person who should get the notification) must open the app on a real device (TestFlight/EAS build), allow notifications, and have the app register their token at least once.  
   - If you see `⚠️ Skipping push for user …: no push token` → same as above: that user needs to open the app and allow notifications so their token is saved.  
   - If you see `EXPO_ACCESS_TOKEN=NOT SET` → set the token on Render and redeploy.

4. **If the recipient has a real build and allowed notifications but still has no token**  
   - The app now retries push registration at 1.5s and 5s after load (and when they background/foreground). Have them fully close the app, open it again, and wait ~10 seconds; then check Render logs for `POST /auth/push-token: user=<recipient-id> hasToken=true` and `✅ Push token saved for user …`.  
   - You can also confirm whether the backend has a token for a user: `GET /auth/me` returns `user.hasPushToken: true/false`. If the recipient logs in and still sees `hasPushToken: false`, the client never successfully sent the token (check device logs for "Push: No projectId" or "Push token save failed").

### Project Structure

```
mulligan/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── routes/    # API routes
│   │   ├── models/    # Data models
│   │   ├── middleware/# Auth & validation
│   │   └── index.ts   # Entry point
│   └── package.json
├── frontend/          # React application
│   ├── src/
│   │   ├── components/# Reusable components
│   │   ├── pages/     # Page components
│   │   ├── hooks/     # Custom hooks
│   │   └── App.tsx    # Root component
│   └── package.json
└── package.json       # Root workspace config
```

## License

MIT

