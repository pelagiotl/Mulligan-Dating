# RevenueCat In-App Purchase Setup (Mulligan Tokens)

This guide walks you through finishing the RevenueCat integration so users can buy Mulligan tokens in the app.

---

## What’s Already Done

- **Mobile:** `react-native-purchases` and `react-native-purchases-ui` are installed; RevenueCat is configured in `App.tsx` from env keys; `Purchases.logIn` / `Purchases.logOut` in `AuthContext` for user ID.
- **Env:** `mobile/.env.example` documents `EXPO_PUBLIC_REVENUECAT_API_KEY` (and optional iOS/Android keys).
- **Backend:** `mulligan_tokens` and `payments` tables exist; admin token-grant logic exists. A **RevenueCat webhook** handler and **packages** endpoint are implemented so the app can show real packages and grant tokens when RevenueCat sends purchase events.

---

## Step 1: RevenueCat Dashboard

1. **Create account / project**  
   Go to [app.revenuecat.com](https://app.revenuecat.com) and create a project (e.g. “Mulligan”).

2. **Add apps**  
   - **iOS:** Add an app; use your App Store Connect app’s bundle ID (e.g. `com.lukepelagiotomerlin.mulligan`).  
   - **Android:** Add an app; use your Play Console application ID.

3. **Connect stores**  
   - **iOS:** In RevenueCat, link the app to App Store Connect (Shared Secret or App Store Connect API key).  
   - **Android:** In RevenueCat, link the app using a Google Play service account (JSON key).  
   See RevenueCat docs: [App Store Connect](https://www.revenuecat.com/docs/getting-started/configuration/app-store-connect), [Google Play](https://www.revenuecat.com/docs/getting-started/configuration/google-play-setup).

4. **Create products**  
   Create **four** token products (prices are set in the stores; backend only maps product ID → token count):

   | Product ID         | Tokens | Example price |
   |--------------------|--------|----------------|
   | `mulligan_1_token` | 1      | $1.99          |
   | `tokens_3`         | 3      | $4.99          |
   | `tokens_5`         | 5      | $7.99          |
   | `tokens_7`         | 7      | $9.99          |

   - In **App Store Connect** and **Google Play Console**, create **consumable** (or non-consumable) in-app products with these product IDs and your chosen prices. (iOS 1-token product uses `mulligan_1_token`; you can use the same or `tokens_1` on Android.)  
   - In **RevenueCat → Products**, create products with the **same identifiers** as in the stores (`mulligan_1_token`, `tokens_3`, `tokens_5`, `tokens_7`) and attach them to your apps.

5. **Create an offering (optional but recommended)**  
   In RevenueCat → **Offerings**, create a **default** offering and add **packages** that reference all four products (1, 3, 5, 7 tokens). The app will use `Purchases.getOfferings()` and purchase by package.

6. **Get API keys**  
   In RevenueCat: **Project Settings → API keys**. Copy the **public** SDK keys (one for iOS, one for Android). Use the **test** keys for development.

---

## Step 2: App Store Connect & Google Play

- **App Store Connect:** Create four consumable (or non-consumable) IAPs with product IDs `tokens_1`, `tokens_3`, `tokens_5`, `tokens_7` and prices $1.99, $4.99, $7.99, $9.99 (or your chosen prices). Submit for review with your app.  
- **Google Play:** Create four in-app products with the same IDs and prices in Play Console. Activate them.

---

## Step 3: Mobile App

1. **Env**  
   In `mobile/.env` (create from `mobile/.env.example`):

   ```bash
   EXPO_PUBLIC_REVENUECAT_API_KEY=your_public_sdk_key_here
   ```

   Or per platform:

   ```bash
   EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_xxxx
   EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_xxxx
   ```

2. **Run a real build**  
   RevenueCat’s native code does not run in Expo Go. Use an EAS dev or production build:

   ```bash
   cd mobile && eas build --profile development --platform ios
   ```

   Then install and run that build on a device or simulator that supports IAP.

3. **Purchase flow (already implemented)**  
   - The app calls `Purchases.getOfferings()` and shows packages from the default offering.  
   - On “Buy”, it calls `Purchases.purchasePackage(package)`.  
   - After a successful purchase, RevenueCat sends a webhook to your backend; the backend grants tokens and records the payment.  
   - The app refetches token count (e.g. via `/tokens` or `/settings`) to update the UI.

---

## Step 4: Backend (Webhook & Packages)

1. **Webhook URL**  
   Your backend must expose a **public HTTPS** URL for RevenueCat, e.g.:

   `https://your-backend.onrender.com/api/payments/webhook/revenuecat`

2. **Configure in RevenueCat**  
   - RevenueCat Dashboard → **Integrations → Webhooks**.  
   - Add your webhook URL.  
   - (Recommended) Set an **Authorization** header (e.g. `Bearer YOUR_SECRET`) and store the same secret in your backend env as `REVENUECAT_WEBHOOK_AUTHORIZATION`.

3. **Backend env**  
   On Render (or your host), set:

   ```bash
   REVENUECAT_WEBHOOK_AUTHORIZATION=Bearer your_secret_here
   ```

   Optional: product → token mapping (default is `mulligan_1_token:1,tokens_3:3,tokens_5:5,tokens_7:7`):

   ```bash
   REVENUECAT_PRODUCT_TOKENS=mulligan_1_token:1,tokens_3:3,tokens_5:5,tokens_7:7
   ```

4. **Idempotency**  
   The webhook handler uses `transaction_id` (and event `id`) to avoid granting tokens twice for the same purchase. Processed events are stored in the `payments` table (`payment_intent_id` stores the RevenueCat transaction/id).

---

## Step 5: End-to-End Flow

1. User opens Settings or the token purchase modal → app fetches **packages** from your backend **and** offerings from RevenueCat (backend returns product IDs and metadata; app uses RevenueCat for price and purchase).  
2. User taps a package → app calls `Purchases.purchasePackage(...)` with the matching RevenueCat package.  
3. Apple/Google charges the user; RevenueCat records the purchase and sends a **webhook** (e.g. `NON_RENEWING_PURCHASE` or `INITIAL_PURCHASE`) to your backend.  
4. Backend webhook handler:  
   - Verifies the Authorization header.  
   - Checks idempotency (transaction_id / event id already processed?).  
   - Maps `product_id` → token count (e.g. `mulligan_1_token` → 1, `tokens_7` → 7).  
   - Ensures user is under the 7-token cap, then inserts into `payments` and inserts rows into `mulligan_tokens` with `source = 'iap'`.  
   - Returns `200`.  
5. App refetches token balance (or listens for an update) and shows the new balance.

---

## Troubleshooting

- **“No offerings” or empty packages:** Ensure products are created in RevenueCat and attached to the correct app; create a default offering with packages.  
- **Purchase works but tokens don’t appear:** Check backend logs for the webhook; confirm webhook URL and auth header in RevenueCat; confirm `REVENUECAT_WEBHOOK_AUTHORIZATION` is set on the server.  
- **Expo Go:** RevenueCat requires a native build; use EAS build, not Expo Go, for IAP testing.  
- **Sandbox:** Use App Store Connect and Play Console sandbox testers to test purchases without being charged.

---

## File Reference

| Area        | File(s) |
|------------|--------|
| Mobile IAP | `mobile/App.tsx` (configure), `mobile/src/context/AuthContext.tsx` (logIn/logOut), `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/components/TokenDisplay.tsx` (handlePurchase, packages UI) |
| Backend    | `backend/src/routes/payments.ts` (webhook, GET /packages) |
| Env        | `mobile/.env`, backend env (e.g. Render): `REVENUECAT_WEBHOOK_AUTHORIZATION`, optional `REVENUECAT_PRODUCT_TOKENS` |
