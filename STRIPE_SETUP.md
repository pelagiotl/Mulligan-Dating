# Stripe Payment Setup

This guide covers the environment variables and Stripe Dashboard configuration needed for in-app token purchases.

## Environment Variables

### Backend (Render / production)
- **STRIPE_SECRET_KEY** – Your Stripe secret key (starts with `sk_`)
- **STRIPE_WEBHOOK_SECRET** – Webhook signing secret (starts with `whsec_`)

### Mobile app (EAS Build / local)
- **EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY** – Your Stripe publishable key (starts with `pk_`)

## Setting the publishable key for EAS builds (required for TestFlight)

The key is **baked into the app at build time**. If you see "Payment not configured" or "Stripe is not configured" in TestFlight, the key was missing when that build was created.

1. In [expo.dev](https://expo.dev) → your project → **Secrets**
2. Add secret: **Name** `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, **Value** `pk_live_...` or `pk_test_...`
3. Create a **new** iOS production build and submit to TestFlight (existing installs won’t get the key until you install a build made after the secret was set).

### Local dev (Expo Go / simulator)

1. In the **mobile** folder, create a file named **`.env`** (copy from **`.env.example`**).
2. Set the variable **exactly** (no spaces around `=`):  
   `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxx`  
   (Get the key from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikey).)
3. **Restart the dev server** after changing `.env` (stop and start `expo start`). Env vars are loaded when the bundler starts.

## Stripe webhook configuration

1. Open [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. **Add endpoint**
3. Endpoint URL: `https://your-backend-url.com/api/payments/webhook` (e.g. `https://mulligan-backend.onrender.com/api/payments/webhook`)
4. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed` (optional)
5. Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in your backend environment

## Flow

1. User taps buy → app calls `/payments/create-intent` → backend creates PaymentIntent and returns `clientSecret`
2. App shows Stripe PaymentSheet with `clientSecret`
3. User pays → Stripe confirms payment
4. Stripe sends `payment_intent.succeeded` webhook → backend grants tokens
5. App refreshes token count (webhook usually completes within 1–2 seconds)

## Testing

- Use Stripe **test keys** (`pk_test_...`, `sk_test_...`) and **test card** `4242 4242 4242 4242`
- For local webhook testing, use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks to your backend
