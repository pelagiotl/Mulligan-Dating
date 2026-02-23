# Pre-launch checklist – Mulligan Dating

Use this before going live. Items are ordered by priority.

---

## Security (must-do)

- [x] **Dev-only endpoints** – `POST /api/make-admin-by-phone` and `POST /api/create-test-users` are now **disabled in production** (only registered when `NODE_ENV !== 'production'`). No action needed.
- [ ] **Backend env in production** – Ensure these are set on your production server (e.g. Render) and **never** committed:
  - `JWT_SECRET` – long, random string (e.g. 32+ chars). Required; app validates it on startup.
  - `NODE_ENV=production` – so CORS and rate limits use production behavior and dev endpoints are off.
- [ ] **CORS** – In production the backend uses `ALLOWED_ORIGINS`. Set it to your real frontend origin(s), e.g.  
  `ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com`  
  (comma-separated, no trailing slash). Mobile app has no origin, so it’s already allowed.
- [ ] **Regenerate Resend API key** – If you ever pasted your Resend key in chat or in a repo, regenerate it in the Resend dashboard and update `RESEND_API_KEY` in production.

---

## Backend config (production server)

- [ ] **Stripe** – `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set in production. Webhook URL in Stripe dashboard should point to your production API (e.g. `https://mulligan-backend.onrender.com/api/payments/webhook`).
- [ ] **Payments redirect** – `FRONTEND_URL` (or equivalent) set to your production frontend URL for Stripe success/cancel redirects. Backend uses `FRONTEND_URL` or falls back to `http://localhost:5173`.
- [ ] **Database** – Production DB (e.g. PostgreSQL on Render) is used when you set the right env (e.g. `DATABASE_URL`). Ensure backups or managed DB is in place.
- [ ] **Twilio / SMS** – If you use phone login or SMS, ensure Twilio env vars are set in production.
- [ ] **Cloudinary** – If you use it for images, set `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in production.
- [ ] **Report email** – Already using Resend; `RESEND_API_KEY` is in `.env`. Add the same (or a new) key to production env so report emails go to mulligandating@gmail.com.

---

## Mobile app (Expo / EAS)

- [ ] **API URL** – Production builds should call your real API. App uses `EXPO_PUBLIC_API_URL` (defaults to `https://mulligan-backend.onrender.com`). If your API host is different, set this in EAS build env or in app config.
- [ ] **Store listings** – App name, description, screenshots, and privacy policy URL (e.g. `https://your-api.onrender.com/privacy`) ready for App Store / Play Store.
- [ ] **Sentry** – If you use Sentry, set DSN and env (e.g. `production`) in your build so production errors are reported.
- [ ] **Admin / test-only UI** – Any “admin” or “dev” only screens (e.g. token/admin features) are hidden or gated in production; `__DEV__` is fine for that.

---

## Legal / compliance

- [ ] **Privacy policy** – Backend serves `/privacy`; ensure the content is final and the URL is used in app store listings and in-app links.
- [ ] **Terms of service** – Same for terms if you have a `/terms` or similar.
- [ ] **Data deletion** – “Delete account” flow is implemented; confirm it removes or anonymizes the user’s data as described in your privacy policy.

---

## Nice to have

- [ ] **.env.example** – Add a `backend/.env.example` (no real secrets) listing required vars (e.g. `JWT_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `ALLOWED_ORIGINS`, `FRONTEND_URL`, `NODE_ENV`) so you or others can spin up the backend safely.
- [ ] **Rate limit reset** – `POST/GET /api/reset-rate-limit` exists for testing. Consider restricting it (e.g. by IP or removing in production) if you don’t need it live.
- [ ] **Request logging** – Backend logs all POST/PUT and body keys. For production you may want to reduce verbosity or use a proper logger with levels.
- [ ] **Health check** – `/health` and `/` are in place for Render/load balancers; confirm your host uses them.

---

## Quick reference – important env vars

| Variable | Where | Purpose |
|----------|--------|---------|
| `NODE_ENV` | Backend | `production` disables dev endpoints and tightens CORS/rate limits |
| `JWT_SECRET` | Backend | Required; used for auth and socket auth |
| `ALLOWED_ORIGINS` | Backend | Production CORS (web only; mobile has no origin) |
| `RESEND_API_KEY` | Backend | Report emails to mulligandating@gmail.com |
| `STRIPE_SECRET_KEY` | Backend | Payments |
| `STRIPE_WEBHOOK_SECRET` | Backend | Stripe webhook signature verification |
| `FRONTEND_URL` | Backend | Stripe redirect base URL |
| `EXPO_PUBLIC_API_URL` | Mobile | API base URL for production builds (default: Render URL) |

---

You’re in good shape for launch once the security and backend config items are done. The rest can be tightened as you go.
