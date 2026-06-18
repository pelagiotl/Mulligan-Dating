# App Review Information – Notes for App Store Connect

**Paste the content from `APP_STORE_REVIEW_NOTES_4000.txt` into the "Notes" field in App Store Connect → Your App → App Review Information.**

---

## Suggested opening (Resolution Center / 4.3(b) resubmit)

We respectfully address **Guideline 4.3(b)**. Mulligan is not a generic swipe app. It is a regional intentional dating product for **Southern Oregon** with: mandatory **video intro** onboarding, **token-based Connect**, a dedicated **Sober Circle** tab and pool, **Mulligan Live Dates** for IRL events, in-match tools (games, Smart Date Planner), and **post-date reflection** with mutual reveal when both want a second date. Our attached screen recording demonstrates each of these flows.

---

## 1. Screen recording

We have provided a screen recording captured on a physical iPhone. The recording shows:

- App launch and onboarding (phone + SMS verification, **mandatory intro video**)
- **Connect tab:** token-based matching (not an endless swipe deck) — browse profiles, tap **Connect & Match** (uses 1 Mulligan token)
- **Sober tab (Sober Circle):** choose sober level, find matches in a separate sober/sober-curious pool
- **Live tab (Mulligan Live Dates):** view and sign up for a local IRL dating event in Southern Oregon
- **Matches tab:** messaging, optional icebreaker games (Truth or Dare), Smart Date Planner, **post-date reflection** and **Date 2 ready** mutual reveal
- **Profile tab:** edit photos, bio, interests, dealbreakers, lifestyle
- **Settings tab:** Mulligan tokens (weekly claim + IAP via RevenueCat), privacy (show/hide last active), block list, **Delete Account** (Danger Zone)
- **Reporting and blocking** from match chat / profile
- Permission prompts: camera, photo library, optional location (Southern Oregon region check), push notifications

*(Attach the video to this submission or add a link here.)*

---

## 2. App purpose and value (differentiation)

**Mulligan** is a dating app for adults **18+** focused on **Southern Oregon**. It is **not** a generic endless-swipe app.

**How Mulligan differs:**

1. **Mandatory video intro** — short onboarding video so personality and voice come through before matching
2. **Regional focus** — Southern Oregon only; matches are local and meetable in person
3. **Intentional connections** — users spend **Mulligan tokens** to connect (no unlimited swiping)
4. **Rich profiles** — interests, dealbreakers, lifestyle, and photos before connecting
5. **Sober Circle** — a separate tab and matching pool for people on a sober or sober-curious path
6. **Mulligan Live Dates** — sign up for curated in-person dating events (IRL), not profile-only matching
7. **Post-date reflection** — private after-date prompts; mutual reveal only when both want a second date
8. **In-match tools** — messaging, Truth or Dare, Smart Date Planner with local venue ideas

**Audience:** Adults 18+ in or near Southern Oregon who want intentional, local dating — including sober-curious users and people who want real-world events.

---

## 3. Instructions and test credentials

**Login:** We do not provide a shared test account. Please **Sign Up** with your own phone number; you will receive an SMS one-time code. Registration: phone → code → profile → **intro video** → Connect.

**Suggested review path (5–7 minutes):**

1. Complete sign-up and create a minimal profile (name, photo, location in Southern Oregon if prompted, intro video)
2. **Connect** — browse profiles → **Connect & Match** (uses 1 free/weekly token if available)
3. **Sober** — open Sober Circle, select a sober level, explore the separate match flow
4. **Live** — open Mulligan Live Dates and view the featured local event
5. **Matches** — open a conversation; explore chat tools; tap **We went on a date** to see reflection flow
6. **Settings** — view tokens; confirm **Delete Account** exists under Danger Zone (no need to delete if testing)

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
