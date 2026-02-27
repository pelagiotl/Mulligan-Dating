# Debugging production issues (without rebuilding)

To diagnose issues in TestFlight/production without rebuilding and resubmitting, use **Sentry** and optional **debug logging**.

## 1. Sentry breadcrumbs (always on)

Breadcrumbs are automatically added in critical flows. When an error or crash is sent to Sentry, the event includes the **breadcrumb trail** (last ~100 breadcrumbs), so you can see what the user did right before the error.

**Instrumented flows:**

- **Never Have I Ever:** `Submitting answer` → `Answer response` (with server points) → `Fetch state received` when state is fetched.
- **Match celebration / Keep Browsing:** `Keep Browsing tapped` → `Navigate to Browse` (with navigator ready flag).

In Sentry: open an issue → **Breadcrumbs** tab to see this trail.

## 2. Debug logging (opt-in)

When enabled, the app also sends **debug messages** to Sentry with full context (e.g. API response payload for NHIE). Use this when you need to inspect exact values (e.g. why points didn’t update) without adding logs and rebuilding.

**How to enable**

1. In the app, go to **Settings**.
2. Tap the **version text** at the bottom **7 times** within a few seconds.
3. Confirm the alert: “Debug logging for Sentry is now ON.”
4. Reproduce the issue (e.g. play NHIE, tap Keep Browsing).
5. In **Sentry** → your project → **Issues** or **Discover**, look for messages with level **debug** and category `NHIE` or `MatchCelebration`. The `extra` payload will contain the data (e.g. `yourPoints`, `theirPoints`, `pointsFromRound`).

**How to disable**

- Tap the version text 7 times again and turn it off in the alert.

The setting is stored on the device (AsyncStorage). No new build is required to turn it on or off.

## 3. What to look for in Sentry

- **NHIE points not updating:**  
  - Breadcrumbs: `NHIE` → `Answer response` (check `serverYourPts`, `serverTheirPts`, `roundComplete`).  
  - With debug ON: debug message `[NHIE] Answer response full` and `[NHIE] Fetch state full` with full API fields. If the **response** has correct points but the UI doesn’t, the bug is on the client; if the response has wrong/zero points, the bug is on the backend.

- **Keep Browsing / screen freeze:**  
  - Breadcrumbs: `MatchCelebration` → `Keep Browsing tapped` → `Navigate to Browse` (and `ready: true/false`). If “Navigate to Browse” never appears, the timeout/navigate didn’t run; if `ready` is false, the navigator wasn’t ready.

## 4. Adding more instrumentation

- **Breadcrumbs** (always): `import { addBreadcrumb } from '../utils/debugLogger';` then `addBreadcrumb('Category', 'Short message', { key: value });` at important steps.
- **Debug-only detail:** `import { debugLog } from '../utils/debugLogger';` then `await debugLog('Category', 'Message', { full: data });` when you want payloads only when debug is ON.

Keep payloads small (no huge objects). Sensitive data is filtered by Sentry rules; avoid logging tokens or PII.
