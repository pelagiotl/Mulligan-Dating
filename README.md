# Mulligan 💘

> *A modern dating app where second chances lead to first connections*

Mulligan is a full-stack dating application that helps people find meaningful connections by focusing on what truly matters: shared interests, compatible preferences, and honest dealbreakers.

4## Features

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

### Games: Truth or Dare & Never Have I Ever (unlimited prompt variety)

Truth or Dare and Never Have I Ever use **OpenAI** to generate a **plethora of random prompts** — not a small fixed list. To enable that:

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys).
2. Add to backend `.env`: `OPENAI_API_KEY=your_key_here`.

With `OPENAI_API_KEY` set, every Truth/Dare and Never Have I Ever prompt is AI-generated for maximum variety. The static prompt arrays in code are **fallbacks only** (used when the key is missing or the API fails).

### Never Have I Ever – debugging if "Them" or new prompt still fail

- **Mobile (Metro / dev):** In development builds, open the app and the Metro/terminal console. You’ll see:
  - `[NHIE] Socket never_have_i_ever_updated received` – when the other user’s action triggers the socket (includes `hasNewPrompt`, `roundComplete`).
  - `[NHIE] Applying new prompt from socket` – when we show the next round’s prompt from the socket.
  - `[NHIE] Fetch state result` – after each refetch (`yourPoints`, `theirPoints`, `bothAnswered`, `promptLen`). If "Them" stays 0, check whether refetches return `theirPoints: 0` (backend/DB) or the socket never fires (socket/room).
- **Backend (Render logs):** In your Render service logs, look for:
  - `🙊 NHIE submitAnswer: both answered, generated new prompt` – confirms the backend generated and saved the new prompt when the second user answered.
  - `🙊 NHIE emit: match=... hasNewPrompt=true roundComplete=true` – confirms the backend sent the new prompt in the socket. If this appears but the other device doesn’t show the prompt, the issue is on the client (socket not received or not in room).
- **Sentry:** Enable "Debug logging" (Settings → tap version 7×). NHIE breadcrumbs and debug messages will then be attached to Sentry events so you can see the flow in production.

### Scaling (500 → thousands → millions)

Current settings target **500–1000 concurrent users** on a single Render backend (e.g. Standard 2GB/1 CPU) and a Postgres plan that allows at least ~30 connections:

- **API rate limit:** 1200 requests per 15 minutes per IP in production (~80/min per IP). Each user on their own IP gets that bucket; users on shared WiFi share one.
- **DB pool:** 30 connections per Node process in production. Your database plan’s `max_connections` must be higher than 30 (e.g. Render Postgres paid tiers).

For **thousands to hundreds of thousands** of users you’ll need: multiple backend instances (horizontal scaling), a connection pooler in front of Postgres (e.g. PgBouncer), CDN for assets, and higher DB/Redis limits. For **millions**, add read replicas, caching (Redis), and consider breaking out heavy features (e.g. AI, search) into separate services.

### Push notifications (mobile – outside-app)

To get **system** message notifications when the app is in the background or closed:

1. **Backend (Render)**  
   - Set `EXPO_ACCESS_TOKEN` in the Render service environment (create at [expo.dev → Access Tokens](https://expo.dev/accounts/[account]/settings/access-tokens)).  
   - On deploy you should see in logs: `Push: Expo SDK loaded. EXPO_ACCESS_TOKEN is set (push delivery enabled)`.

2. **Recipient device**  
   - Use a **real device** (e.g. TestFlight or EAS dev build). Push when the app is killed often does **not** work in the iOS Simulator or in Expo Go.  
   - Open the app at least once after login and **allow notifications** so the push token is saved.  
   - **Android:** The app requests notification permission (Android 13+) and uses the `default` channel. If push still doesn’t appear, create a new **EAS/development build** (not Expo Go) so the native `POST_NOTIFICATIONS` and channel config are applied.

3. **Verify in Render logs**  
   Message push uses the **same** pipeline as match and date-plan notifications (same token, same Expo config). When someone sends a chat message, look for:  
   - `📲 Push (message HTTP): recipient=… hasToken=true validFormat=true EXPO_ACCESS_TOKEN=set` → push was attempted.  
   - `✅ Push (message HTTP) sent to …` → Expo accepted it.

**Keeping push solid on all devices**

- **Backend:** `EXPO_ACCESS_TOKEN` set on Render; backend clears invalid tokens after 2 failures and retries when the recipient has no token (3s–120s).
- **iOS:** Use a real device / TestFlight build. If only the first message pushes, the app refreshes the token when you open it (or tap a notification) and when a message notification is received; bring the app to foreground once so the token is re-sent.
- **Android:** Use an EAS/dev build (not Expo Go), grant notification permission, and ensure the `default` channel exists (the app creates it). If pushes stop after a while, opening the app re-registers the token.
- **Per-device quirks:** Some devices (e.g. certain iPhones) only provide the push token after the app has been backgrounded once; delayed retries (up to 120s) send the first message’s push once the token appears. Opening the app and then exiting ensures the token is saved for later messages.  
   - If you see `hasToken=false` → the **recipient** (person who should get the notification) must open the app on a real device (TestFlight/EAS build), allow notifications, and have the app register their token at least once.  
   - If you see `⚠️ Skipping push for user …: no push token` → same as above: that user needs to open the app and allow notifications so their token is saved.  
   - If you see `EXPO_ACCESS_TOKEN=NOT SET` → set the token on Render and redeploy.

4. **If the recipient has a real build and allowed notifications but still has no token**  
   - The app now retries push registration at 1.5s, 5s, and (on Android) 15s after load, plus when they background/foreground. Have them fully close the app, open it again, and wait ~15 seconds; then check Render logs for `POST /auth/push-token: user=<recipient-id> hasToken=true` and `✅ Push token saved for user …`.  
   - You can also confirm whether the backend has a token for a user: `GET /auth/me` returns `user.hasPushToken: true/false`. If the recipient logs in and still sees `hasPushToken: false`, the client never successfully sent the token (check device logs for "Push: No projectId" or "Push token save failed").

5. **Android outside-app notifications not showing**  
   In-app notifications use the socket; **outside-app** (background/closed) use FCM. For Android, both of these are required or pushes will not be delivered when the app is in the background:

   - **FCM V1 credentials in EAS (required)**  
     Expo cannot forward pushes to Android devices without a **Google Service Account Key** configured for your EAS project:
     1. Create a [Firebase project](https://console.firebase.google.com/) and add your Android app (package `com.lukepelagiotomerlin.mulligan`).
     2. In Firebase: **Project settings → Service accounts** → **Generate New Private Key** (JSON). Keep this file private (e.g. add to `.gitignore`).
     3. Run `eas credentials` in the **mobile** folder → choose **Android** → **production** → **Set up a Google Service Account Key for Push Notifications (FCM V1)** → upload the JSON file.
     4. See [Expo: FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/) for full steps.

   - **google-services.json in the app (required)**  
     So the Android app can register with FCM and receive pushes when backgrounded:
     1. In Firebase Console, download **google-services.json** (Project settings → Your apps → Android app).
     2. Put it in `mobile/` (e.g. `mobile/google-services.json`).
     3. In `mobile/app.json`, under `expo.android`, add: `"googleServicesFile": "./google-services.json"`.
     4. Rebuild the Android app with EAS (`eas build --platform android --profile production`).

   - **Backend:** Ensure `EXPO_ACCESS_TOKEN` is set in the Render environment. Redeploy after setting.  
   - **Device:** Use an **EAS or production build** (not Expo Go). Ensure the user has **allowed notifications** when prompted.  
   - **Verify:** In Render logs when a message is sent, look for `📲 Push (message): recipient=… hasToken=true validFormat=true EXPO_ACCESS_TOKEN=set` and `✅ Push (message) sent to …`. If the backend says "sent" but the device never shows a notification, FCM credentials or `googleServicesFile` are almost certainly missing — complete the steps above and create a new Android build.

### In-app purchases (RevenueCat)

Token packs are sold via RevenueCat. To finish setup (dashboard, App Store / Play products, webhook, mobile env), see **[docs/REVENUECAT_SETUP.md](docs/REVENUECAT_SETUP.md)**.

### Project Structure

```
mulligan/
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── routes/    # API routes
│   │   ├── middleware/# Auth & validation
│   │   ├── services/  # Push, matching, games
│   │   └── database.ts
│   └── package.json
├── frontend/          # React (Vite) web app
├── mobile/            # React Native (Expo) app
│   ├── src/
│   │   ├── components/# TruthOrDare, NeverHaveIEver, etc.
│   │   ├── screens/   # Matches, Browse, Settings
│   │   └── utils/     # api.ts, pushNotifications
│   └── app.json
└── package.json
```

---

## Code at a glance

Snippets from the repo so you can see the style and structure in Cursor.

**Backend – auth middleware** (`backend/src/middleware/auth.ts`)

```ts
export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    // ... update last_active_at, save push token from X-Push-Token header
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
```

**Backend – Postgres wrapper** (`backend/src/database.ts`)  
Same API as SQLite so routes can use `db.prepare(...).get()` / `.run()` / `.all()`; with Postgres these return Promises and must be awaited.

```ts
return {
  get: async (...args: any[]) => {
    const normalizedParams = normalizeParams(...args);
    const result = await pgPool!.query(pgSql, normalizedParams);
    return result.rows[0] || null;
  },
  run: async (...args: any[]) => {
    const normalizedParams = normalizeParams(...args);
    await pgPool!.query(pgSql, normalizedParams);
    return { lastInsertRowid: 0, changes: 0 };
  },
  all: async (...args: any[]) => { /* ... */ }
};
```

**Mobile – API client** (`mobile/src/utils/api.ts`)

```ts
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
const BASE_URL = `${API_URL}/api`;

export async function getToken(): Promise<string | null> {
  if (tokenCache !== undefined) return tokenCache;
  tokenCache = await AsyncStorage.getItem('token');
  return tokenCache;
}

// Every request sends auth header + optional X-Push-Token so backend can save for push notifications
headers['Authorization'] = `Bearer ${token}`;
if (pushToken) headers['X-Push-Token'] = pushToken.trim();
```

**Mobile – push token on requests**  
The app sends the Expo push token on authenticated requests so the backend can store it and send outside-app message notifications.

---

## License

MIT

