# App Review Information – Notes for App Store Connect

**Paste the content from `APP_STORE_REVIEW_NOTES_4000.txt` into the "Notes" field in App Store Connect → Your App → App Review Information.**

---

## 1. Screen recording

We have provided a screen recording captured on a physical iPhone. The recording shows:

- App launch and onboarding (phone + SMS verification)
- **Connect tab:** token-based matching (not an endless swipe deck) — browse profiles, tap **Connect & Match** (uses 1 Mulligan token)
- **Sober tab (Sober Circle):** choose sober level, find matches in a separate sober/sober-curious pool, in-tab messaging
- **Live tab (Mulligan Live Dates):** view and sign up for a local IRL dating event in Southern Oregon
- **Matches tab:** messaging, optional icebreaker games (Truth or Dare), intentional date planner, post-date reflection
- **Profile tab:** edit photos, bio, interests, dealbreakers, lifestyle
- **Settings tab:** Mulligan tokens (weekly claim + IAP via RevenueCat), privacy (show/hide last active), block list, **Delete Account** (Danger Zone)
- **Reporting and blocking** from match chat / profile
- Permission prompts: camera, photo library, optional location (Southern Oregon region check), push notifications

*(Attach the video to this submission or add a link here.)*

---

## 2. App purpose and value (differentiation)

**Mulligan** is a dating app for adults **18+** focused on **Southern Oregon**. It is **not** a generic endless-swipe app.

**How Mulligan differs:**

1. **Regional focus** — Southern Oregon only; matches are local and meetable in person.
2. **Intentional connections** — users spend **Mulligan tokens** to connect (no unlimited swiping).
3. **Rich profiles** — interests, dealbreakers, lifestyle, and photos before connecting.
4. **Sober Circle** — a separate tab and matching pool for people on a sober or sober-curious path.
5. **Mulligan Live Dates** — sign up for curated in-person dating events (IRL), not profile-only matching.
6. **In-match tools** — messaging, Truth or Dare, intentional date ideas, and private post-date reflections.

**Audience:** Adults 18+ in or near Southern Oregon who want intentional, local dating — including sober-curious users and people who want real-world events.

---

## 3. Instructions and test credentials

**Login:** We do not provide a shared test account. Please **Sign Up** with your own phone number; you will receive an SMS one-time code. Registration is quick: phone → code → create profile.

**Suggested review path (5–7 minutes):**

1. Complete sign-up and create a minimal profile (name, photo, location in Southern Oregon if prompted).
2. **Connect** — browse profiles → **Connect & Match** (uses 1 free/weekly token if available).
3. **Sober** — open Sober Circle, select a sober level, explore the separate match flow.
4. **Live** — open Mulligan Live Dates and view the featured local event.
5. **Matches** — open a conversation; explore chat tools from the match screen.
6. **Settings** — view tokens; confirm **Delete Account** exists under Danger Zone (no need to delete if testing).

**Main tabs:** Connect · Matches · Live · Sober · Profile · Settings

---

## 4. External services

- **Backend API:** Node.js/Express on Render (`mulligan-backend.onrender.com`) — auth, profiles, matching, messages, tokens, Sober Circle, Live Dates, IAP webhook
- **Authentication:** Phone number + SMS verification
- **IAP:** RevenueCat + Apple In-App Purchase (Mulligan tokens)
- **Database:** PostgreSQL
- **Push:** Expo Push Notifications
- **Location:** Geocoding for Southern Oregon region eligibility
- **AI (optional):** OpenAI for some icebreaker / date-plan copy when configured; static fallbacks otherwise

---

## 5. Regional differences

Usage is restricted to **Southern Oregon, USA**. Users outside the allowed region are told the app is not available there and cannot browse or match. Other features (account, profile, IAP, messaging, report, block) work the same inside the region.

---

## 6. Regulated industry

Dating/social connection app for adults 18+. No financial, health, or legal services. Privacy Policy and Child Safety/CSAE policy are linked in the app and on our backend.

---

*Before submitting: attach your screen recording and confirm the build includes Connect, Sober, Live, Matches, Profile, and Settings.*
