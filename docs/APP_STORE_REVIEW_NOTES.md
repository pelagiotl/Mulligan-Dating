# App Review Information – Notes for App Store Connect

**Paste the content below into the "Notes" field in App Store Connect → Your App → 1.0 → App Review Information.**

---

## 1. Screen recording

We have provided a screen recording (uploaded/linked below) captured on a physical iPhone. The recording shows:
- Launching the app and the initial experience
- **Account registration and login:** Phone number verification (SMS) flow
- **Account deletion:** Settings → Danger Zone → Delete Account (with confirmation)
- **Paid content / IAP:** Browse → token-based connections; Settings or token modal → Buy Mulligan Tokens (RevenueCat in-app purchase flow)
- **User-generated content:** Profile creation (photos, bio, interests), in-app messaging; **reporting and blocking:** reporting a user from profile/chat, blocking from Settings or match list
- **Sensitive data prompts:** Camera and photo library (for profile photos and chat), optional location (for Southern Oregon region check), push notifications

*(If you upload the video to a link, add the URL here. Otherwise write: "Screen recording attached to this submission.")*

---

## 2. App purpose and value

**Mulligan** is a dating app that helps adults in **Southern Oregon** find meaningful connections. The problem it solves: generic dating apps encourage endless swiping with little focus on compatibility or intent. Mulligan provides **value** by (1) focusing on a specific region (Southern Oregon) so matches are local and meetable, (2) using **tokens** to encourage intentional connections rather than mass swiping, (3) emphasizing **profiles** (interests, dealbreakers, lifestyle) so users can assess fit before connecting, and (4) offering in-app messaging and optional icebreaker games (Truth or Dare). The intended audience is adults 18+ in or near Southern Oregon who want more intentional, local dating.

---

## 3. Instructions and test credentials

**How to access main features:**
- **Login:** Use the test credentials below. The app uses phone number + SMS verification; the demo account is pre-verified.
- **Main tabs:** Connect (browse and use tokens to connect), Matches (conversations), Profile, Settings.
- **Connect:** Browse cards → tap to view full profile → use "Use token to connect" to start a match (consumes 1 Mulligan token).
- **Matches:** Open a match to chat; use the menu (⋯) for Truth or Dare, report, or block.
- **Profile:** Edit profile, photos, interests, dealbreakers.
- **Settings:** Tokens (claim free weekly token, buy more via IAP), Delete Account (Danger Zone), Privacy Policy, etc.

**Test account credentials for App Review:**
- *(Replace with a real test account you create; Apple needs to log in.)*
- **Phone number:** [Provide a phone number that receives SMS for your test account]
- **Or:** "Demo / test account: We have created a test account for review. Phone: +1 XXX XXX XXXX. A one-time code will be sent to this number at login; we can provide the code upon request, or the reviewer may use their own phone to sign up in the app."

*(You must create a real test account and put its phone number here. If the app allows email login for testing, add that too.)*

---

## 4. External services and platforms

The app uses the following to deliver core functionality:
- **Backend API:** Node.js/Express backend hosted on Render ([mulligan-backend.onrender.com](https://mulligan-backend.onrender.com)) for auth, profiles, matching, messages, tokens, and IAP webhook.
- **Web app (optional):** React frontend on Render ([mulligan-frontend.onrender.com](https://mulligan-frontend.onrender.com)); mobile app is the primary client.
- **Authentication:** Custom phone-based auth with SMS verification (e.g. Twilio or similar provider).
- **Payments / IAP:** RevenueCat for in-app purchases (Mulligan tokens); Apple In-App Purchase for processing payments. Backend webhook receives purchase events from RevenueCat to grant tokens.
- **Database:** PostgreSQL (production) for users, profiles, matches, messages, tokens.
- **Push notifications:** Expo Push Notifications; device tokens stored on backend for out-of-app alerts.
- **Geocoding/location:** Used to confirm users are in Southern Oregon (region lock); optional location permission.
- **AI (optional):** OpenAI API for generative icebreaker prompts (Truth or Dare / Never Have I Ever) when configured; fallback to static prompts if not set.

---

## 5. Regional differences

The app **restricts usage to Southern Oregon, USA**. Users outside this region see a message that the app is not available in their area and cannot browse or match. All other features (account creation, profile, IAP, messaging, reporting, blocking) function the same for users within the allowed region. There are no other regional variations in content or features.

---

## 6. Regulated industry

Mulligan is a **dating/social connection app** for adults 18+. We do not provide financial, health, legal, or other regulated services. We comply with applicable consumer and privacy laws and our Privacy Policy and Child Safety/CSAE policy are linked in the app and on our backend. No additional industry-specific documentation or credentials are required.

---

*End of Notes content. Remember to add your actual test account phone number (and screen recording link if applicable) before submitting.*
