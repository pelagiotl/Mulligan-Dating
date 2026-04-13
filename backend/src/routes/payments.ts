import { Router, Request, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { rateLimitAPI } from "../middleware/security.js";
import {
  createHostedPaymentPageToken,
  getAuthorizeNetHostedFormUrl,
  getTransactionDetails,
  isAuthorizeNetConfigured,
  newCheckoutInvoiceId,
} from "../lib/authorizenet.js";

export const paymentsRouter = Router();

// Stub: purchases temporarily unavailable (Stripe removed)
const PURCHASES_UNAVAILABLE_MSG = "Purchases temporarily unavailable.";

// RevenueCat: product_id -> number of tokens to grant
// Prices are set in App Store / Play Store: 1 token $1.99, 3 tokens $4.99, 5 tokens $7.99, 7 tokens $9.99
// Product IDs must match App Store Connect, Google Play, and RevenueCat offerings.
// Override with env REVENUECAT_PRODUCT_TOKENS=mulligan_token_1:1,mulligan_tokens_3:3,mulligan_tokens_5:5,mulligan_tokens_7:7
const DEFAULT_PRODUCT_TOKENS: Record<string, number> = {
  mulligan_token_1: 1,
  mulligan_tokens_3: 3,
  mulligan_tokens_5: 5,
  mulligan_tokens_7: 7,
};

function getProductTokensMap(): Record<string, number> {
  const env = process.env.REVENUECAT_PRODUCT_TOKENS;
  if (!env) return DEFAULT_PRODUCT_TOKENS;
  const out: Record<string, number> = {};
  env.split(",").forEach((pair) => {
    const [id, num] = pair.split(":").map((s) => s.trim());
    if (id && num) out[id] = parseInt(num, 10) || 0;
  });
  return Object.keys(out).length ? out : DEFAULT_PRODUCT_TOKENS;
}

// IAP packages for GET /packages (productId must match RevenueCat / App Store / Play Store product IDs)
const IAP_PACKAGES = [
  { id: 1, productId: "mulligan_token_1", tokens: 1 },
  { id: 2, productId: "mulligan_tokens_3", tokens: 3 },
  { id: 3, productId: "mulligan_tokens_5", tokens: 5 },
  { id: 4, productId: "mulligan_tokens_7", tokens: 7 },
];

/** Web (Authorize.Net Accept Hosted) — same USD prices as mobile store copy. */
const WEB_PACKAGE_AMOUNT_CENTS: Record<number, number> = {
  1: 199,
  2: 499,
  3: 799,
  4: 999,
};

function usdFormatted(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function frontendOrigin(): string | null {
  const direct = process.env.FRONTEND_URL?.trim();
  if (direct) return direct.replace(/\/$/, "");
  const origins = process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();
  if (origins) return origins.replace(/\/$/, "");
  return null;
}

type GrantSource = "iap" | "web";

async function grantTokensAfterPurchase(params: {
  userId: string;
  idempotencyKey: string;
  amountCents: number;
  tokensToGrant: number;
  packageId: number;
  source: GrantSource;
}): Promise<{ grantCount: number; capped: boolean }> {
  const { userId, idempotencyKey, amountCents, tokensToGrant, packageId, source } = params;

  const tokensResult = db
    .prepare(`SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`)
    .all([userId]);
  const allTokens = (tokensResult instanceof Promise ? await tokensResult : tokensResult) as any[];
  const availableTokens = allTokens.filter((t: any) => !t.used_at && !t.returned_at).length;
  const canAdd = Math.max(0, 7 - availableTokens);
  const grantCount = Math.min(tokensToGrant, canAdd);

  if (grantCount <= 0) {
    const paymentId = uuidv4();
    try {
      const run = db
        .prepare(
          `INSERT INTO payments (id, user_id, payment_intent_id, amount_cents, tokens_to_grant, package_id, status, tokens_granted_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`
        )
        .run([paymentId, userId, idempotencyKey, amountCents, tokensToGrant, packageId, new Date().toISOString()]);
      if (run instanceof Promise) await run;
    } catch (e) {
      console.error("grantTokensAfterPurchase: failed to record payment (cap)", e);
    }
    return { grantCount: 0, capped: true };
  }

  const paymentId = uuidv4();
  const now = new Date().toISOString();
  const tokenIds: string[] = [];

  const insertPayment = db
    .prepare(
      `INSERT INTO payments (id, user_id, payment_intent_id, amount_cents, tokens_to_grant, package_id, status, tokens_granted_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`
    )
    .run([paymentId, userId, idempotencyKey, amountCents, tokensToGrant, packageId, now]);
  if (insertPayment instanceof Promise) await insertPayment;

  for (let i = 0; i < grantCount; i++) {
    const tokenId = uuidv4();
    tokenIds.push(tokenId);
    const insertToken = db
      .prepare(`INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, ?)`)
      .run([tokenId, userId, now, source]);
    if (insertToken instanceof Promise) await insertToken;
  }

  const updateTokenIds = db.prepare("UPDATE payments SET token_ids = ? WHERE id = ?").run(tokenIds.join(","), paymentId);
  if (updateTokenIds instanceof Promise) await updateTokenIds;

  return { grantCount, capped: grantCount < tokensToGrant };
}

type RcWebhookEvent = {
  type?: string;
  id?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  price_in_purchased_currency?: number;
  currency?: string;
};

/** RevenueCat POST body is `{ api_version, event: { type, app_user_id, ... } }`. Support flat body too. */
function parseRevenueCatWebhookBody(body: Record<string, unknown> | null | undefined): RcWebhookEvent {
  const ev =
    body?.event && typeof body.event === "object" && body.event !== null && !Array.isArray(body.event)
      ? (body.event as Record<string, unknown>)
      : body;
  const b = body ?? {};
  return {
    type: (ev?.type as string) ?? (b.type as string | undefined),
    id: (ev?.id as string) ?? (b.id as string | undefined),
    app_user_id: (ev?.app_user_id as string) ?? (b.app_user_id as string | undefined),
    product_id: (ev?.product_id as string) ?? (b.product_id as string | undefined),
    transaction_id: (ev?.transaction_id as string) ?? (b.transaction_id as string | undefined),
    price_in_purchased_currency:
      (ev?.price_in_purchased_currency as number) ?? (b.price_in_purchased_currency as number | undefined),
    currency: (ev?.currency as string) ?? (b.currency as string | undefined),
  };
}

/** Play Store product ids from RC may be `sku:basePlanId` — map using the store sku prefix. */
function tokensForProductId(rawProductId: string | undefined, productTokens: Record<string, number>): number {
  if (!rawProductId) return 0;
  if (productTokens[rawProductId]) return productTokens[rawProductId];
  const base = rawProductId.split(":")[0]?.trim();
  if (base && base !== rawProductId && productTokens[base]) return productTokens[base];
  return 0;
}

function packageIdForProductId(rawProductId: string | undefined): number {
  const sku = rawProductId?.includes(":") ? rawProductId.split(":")[0]?.trim() : rawProductId;
  return IAP_PACKAGES.find((p) => p.productId === sku)?.id ?? 1;
}

// Create payment intent - stubbed (was Stripe)
paymentsRouter.post("/create-intent", authenticateToken, rateLimitAPI, async (_req: AuthRequest, res) => {
  return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
});

// Webhook - stubbed (was Stripe)
paymentsRouter.post("/webhook", async (_req: Request, res: Response) => {
  return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
});

// RevenueCat webhook: grant tokens on NON_RENEWING_PURCHASE or INITIAL_PURCHASE (idempotent by transaction_id)
paymentsRouter.post("/webhook/revenuecat", async (req: Request, res: Response) => {
  const authHeader = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  if (authHeader && req.headers.authorization !== authHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rc = parseRevenueCatWebhookBody(req.body as Record<string, unknown>);
  const eventType = rc.type;
  const eventId = rc.id;
  const appUserId = rc.app_user_id;
  const productId = rc.product_id;
  const transactionId = rc.transaction_id;
  const priceInPurchasedCurrency = rc.price_in_purchased_currency ?? 0;

  if (!eventType || !appUserId) {
    console.warn("RevenueCat webhook: missing type or app_user_id", {
      hasEventWrapper: !!(req.body as { event?: unknown })?.event,
    });
    return res.status(400).json({ error: "Missing type or app_user_id" });
  }

  // Only grant tokens for these events
  const isPurchase =
    eventType === "NON_RENEWING_PURCHASE" ||
    eventType === "INITIAL_PURCHASE" ||
    eventType === "TEST";

  if (!isPurchase) {
    return res.status(200).json({ received: true });
  }

  const idempotencyKey = transactionId || eventId;
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Missing transaction_id for purchase event" });
  }

  try {
    const existingResult = db.prepare("SELECT id FROM payments WHERE payment_intent_id = ?").get(idempotencyKey);
    const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as
      | { id: string }
      | undefined;
    if (existing) {
      return res.status(200).json({ received: true, already_processed: true });
    }
  } catch {
    // table might not exist in old DBs
  }

  const productTokens = getProductTokensMap();
  const tokensToGrant = tokensForProductId(productId, productTokens);
  if (!tokensToGrant || tokensToGrant < 1) {
    console.warn("RevenueCat webhook: unknown or zero-token product_id", productId);
    return res.status(200).json({ received: true });
  }

  const amountCents = Math.round(priceInPurchasedCurrency * 100);
  const packageId = packageIdForProductId(productId);

  try {
    const { grantCount, capped } = await grantTokensAfterPurchase({
      userId: appUserId,
      idempotencyKey,
      amountCents,
      tokensToGrant,
      packageId,
      source: "iap",
    });
    console.log(`RevenueCat: granted ${grantCount} token(s) to user ${appUserId} (product ${productId})`);
    return res.status(200).json({ received: true, tokens_granted: grantCount, capped });
  } catch (error) {
    console.error("RevenueCat webhook: grant failed", error);
    return res.status(500).json({ error: "Failed to grant tokens" });
  }
});

// Get payment packages (IAP: productId + tokens; app gets price from RevenueCat offerings)
paymentsRouter.get("/packages", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const tokensResult = db.prepare(`SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`).all([userId]);
    const allTokens = (tokensResult instanceof Promise ? await tokensResult : tokensResult) as any[];
    const availableTokens = allTokens.filter((t: any) => !t.used_at && !t.returned_at).length;
    const maxCanBuy = Math.max(0, 7 - availableTokens);

    const anet = isAuthorizeNetConfigured();
    const packages = IAP_PACKAGES.map((p) => {
      const cents = WEB_PACKAGE_AMOUNT_CENTS[p.id];
      const priceFormatted = anet && cents ? usdFormatted(cents) : "";
      const pricePerToken =
        anet && cents ? `${usdFormatted(Math.round(cents / p.tokens))} per token` : "";
      return {
        id: p.id,
        productId: p.productId,
        tokens: p.tokens,
        price: anet && cents ? cents / 100 : 0,
        priceFormatted,
        pricePerToken,
        available: maxCanBuy >= p.tokens,
        wouldExceedLimit: maxCanBuy > 0 && maxCanBuy < p.tokens,
        maxTokensCanBuy: maxCanBuy,
      };
    });

    res.json({
      packages,
      availableTokens,
      webCheckoutProvider: anet ? "authorizenet" : null,
    });
  } catch (error) {
    console.error("Packages GET error:", error);
    res.status(500).json({ error: "Failed to load packages" });
  }
});

const checkoutBodySchema = z.object({
  packageId: z.coerce.number().int().min(1).max(99),
});

const confirmBodySchema = z.object({
  transId: z.string().min(4).max(64),
});

// Authorize.Net Accept Hosted: returns token + URL for iframe POST (web only)
paymentsRouter.post("/create-checkout", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  if (!isAuthorizeNetConfigured()) {
    return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
  }

  const parsed = checkoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid packageId" });
  }

  const userId = req.userId!;
  const packageId = parsed.data.packageId;
  const pkg = IAP_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    return res.status(400).json({ error: "Unknown package" });
  }

  const amountCents = WEB_PACKAGE_AMOUNT_CENTS[packageId];
  if (!amountCents) {
    return res.status(400).json({ error: "Unknown package amount" });
  }

  const tokensResult = db.prepare(`SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`).all([userId]);
  const allTokens = (tokensResult instanceof Promise ? await tokensResult : tokensResult) as any[];
  const availableTokens = allTokens.filter((t: any) => !t.used_at && !t.returned_at).length;
  const maxCanBuy = Math.max(0, 7 - availableTokens);
  if (maxCanBuy < pkg.tokens) {
    return res.status(400).json({
      error:
        maxCanBuy <= 0
          ? "You are at the 7 token limit."
          : `You can buy at most ${maxCanBuy} more token(s). Pick a smaller package.`,
    });
  }

  const origin = frontendOrigin();
  if (!origin) {
    console.error("create-checkout: set FRONTEND_URL (or ALLOWED_ORIGINS) for payment return + iframe communicator");
    return res.status(500).json({ error: "Server is not configured for web checkout (missing FRONTEND_URL)." });
  }

  let customerEmail: string | undefined;
  try {
    const row = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email?: string } | undefined;
    customerEmail = row?.email?.trim() || undefined;
  } catch {
    // ignore
  }

  const sessionId = newCheckoutInvoiceId();
  const amountDollars = (amountCents / 100).toFixed(2);

  try {
    const ins = db
      .prepare(
        `INSERT INTO web_checkout_sessions (id, user_id, package_id, tokens, amount_cents, status) VALUES (?, ?, ?, ?, ?, 'pending')`
      )
      .run([sessionId, userId, packageId, pkg.tokens, amountCents]);
    if (ins instanceof Promise) await ins;
  } catch (e) {
    console.error("create-checkout: failed to insert session", e);
    return res.status(500).json({ error: "Could not start checkout" });
  }

  const returnUrl = `${origin}/settings`;
  const cancelUrl = `${origin}/settings?payment=canceled`;
  const iframeCommunicatorUrl = `${origin}/IFrameCommunicator.html`;

  try {
    const token = await createHostedPaymentPageToken({
      amountDollars,
      invoiceNumber: sessionId,
      description: `Mulligan ${pkg.tokens} token(s)`,
      returnUrl,
      cancelUrl,
      iframeCommunicatorUrl,
      customerEmail,
    });

    return res.json({
      token,
      hostedPaymentUrl: getAuthorizeNetHostedFormUrl(),
    });
  } catch (e) {
    console.error("create-checkout: Authorize.Net error", e);
    try {
      const del = db.prepare("DELETE FROM web_checkout_sessions WHERE id = ?").run([sessionId]);
      if (del instanceof Promise) await del;
    } catch {
      // ignore
    }
    const msg = e instanceof Error ? e.message : "Payment provider error";
    return res.status(502).json({ error: msg });
  }
});

// After Accept Hosted iframe posts transactResponse, client sends transId; server verifies with getTransactionDetails
paymentsRouter.post("/confirm-authorizenet", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  if (!isAuthorizeNetConfigured()) {
    return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
  }

  const parsed = confirmBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid transId" });
  }

  const transId = parsed.data.transId.trim();
  const userId = req.userId!;
  const idempotencyKey = `anet_${transId}`;

  try {
    const existingResult = db.prepare("SELECT id FROM payments WHERE payment_intent_id = ?").get(idempotencyKey);
    const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as
      | { id: string }
      | undefined;
    if (existing) {
      return res.json({ ok: true, already_processed: true });
    }
  } catch {
    // continue
  }

  let details;
  try {
    details = await getTransactionDetails(transId);
  } catch (e) {
    console.error("confirm-authorizenet: getTransactionDetails failed", e);
    return res.status(400).json({ error: "Could not verify payment with provider." });
  }

  if (details.responseCode !== "1") {
    return res.status(400).json({ error: "Payment was not approved." });
  }

  const invoice = details.order?.invoiceNumber?.trim();
  if (!invoice) {
    return res.status(400).json({ error: "Missing order reference on transaction." });
  }

  let session: {
    id: string;
    user_id: string;
    package_id: number;
    tokens: number;
    amount_cents: number;
    status: string;
    created_at: string;
  } | undefined;

  try {
    const row = db.prepare("SELECT * FROM web_checkout_sessions WHERE id = ?").get(invoice);
    session = (row instanceof Promise ? await row : row) as typeof session;
  } catch {
    session = undefined;
  }

  if (!session || session.status !== "pending") {
    return res.status(400).json({ error: "No matching checkout session." });
  }

  if (session.user_id !== userId) {
    return res.status(403).json({ error: "Checkout does not belong to this account." });
  }

  const createdMs = new Date(session.created_at).getTime();
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > 45 * 60 * 1000) {
    return res.status(400).json({ error: "Checkout expired. Start again from Settings." });
  }

  const authAmount = parseFloat(details.authAmount || "0");
  const paidCents = Math.round(authAmount * 100);
  if (!Number.isFinite(paidCents) || Math.abs(paidCents - session.amount_cents) > 2) {
    return res.status(400).json({ error: "Amount mismatch for this checkout." });
  }

  try {
    const { grantCount, capped } = await grantTokensAfterPurchase({
      userId: session.user_id,
      idempotencyKey,
      amountCents: session.amount_cents,
      tokensToGrant: session.tokens,
      packageId: session.package_id,
      source: "web",
    });

    const upd = db.prepare("UPDATE web_checkout_sessions SET status = 'completed' WHERE id = ?").run([invoice]);
    if (upd instanceof Promise) await upd;

    console.log(`Authorize.Net: granted ${grantCount} token(s) to user ${session.user_id} (trans ${transId})`);
    return res.json({ ok: true, tokens_granted: grantCount, capped });
  } catch (error) {
    console.error("confirm-authorizenet: grant failed", error);
    return res.status(500).json({ error: "Failed to grant tokens" });
  }
});

// Get payment history for user (reads DB only; no Stripe)
paymentsRouter.get("/history", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const paymentsResult = db.prepare(`SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all([userId]);
    const payments = (paymentsResult instanceof Promise ? await paymentsResult : paymentsResult) as any[];
    res.json({ payments });
  } catch (error) {
    console.error("Payment history error:", error);
    res.status(500).json({ error: "Failed to load payment history" });
  }
});
