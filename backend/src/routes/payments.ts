import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { rateLimitAPI } from "../middleware/security.js";

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
function tokensForProductId(
  rawProductId: string | undefined,
  productTokens: Record<string, number>
): number {
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
    const existing = (existingResult instanceof Promise ? await existingResult : existingResult) as { id: string } | undefined;
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

  const tokensResult = db
    .prepare("SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC")
    .all([appUserId]);
  const allTokens = (tokensResult instanceof Promise ? await tokensResult : tokensResult) as any[];
  const availableTokens = allTokens.filter((t: any) => !t.used_at && !t.returned_at).length;
  const canAdd = Math.max(0, 7 - availableTokens);
  const grantCount = Math.min(tokensToGrant, canAdd);

  if (grantCount <= 0) {
    // Still record payment so we don't reprocess, but don't grant more tokens
    const paymentId = uuidv4();
    const amountCents = Math.round(priceInPurchasedCurrency * 100);
    const packageId = packageIdForProductId(productId);
    try {
      const run = db.prepare(
        `INSERT INTO payments (id, user_id, payment_intent_id, amount_cents, tokens_to_grant, package_id, status, tokens_granted_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`
      ).run([paymentId, appUserId, idempotencyKey, amountCents, tokensToGrant, packageId, new Date().toISOString()]);
      if (run instanceof Promise) await run;
    } catch (e) {
      console.error("RevenueCat webhook: failed to record payment (cap)", e);
    }
    return res.status(200).json({ received: true, capped: true });
  }

  const paymentId = uuidv4();
  const amountCents = Math.round(priceInPurchasedCurrency * 100);
  const packageId = packageIdForProductId(productId);
  const now = new Date().toISOString();
  const tokenIds: string[] = [];

  try {
    const insertPayment = db.prepare(
      `INSERT INTO payments (id, user_id, payment_intent_id, amount_cents, tokens_to_grant, package_id, status, tokens_granted_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`
    ).run([paymentId, appUserId, idempotencyKey, amountCents, tokensToGrant, packageId, now]);
    if (insertPayment instanceof Promise) await insertPayment;

    for (let i = 0; i < grantCount; i++) {
      const tokenId = uuidv4();
      tokenIds.push(tokenId);
      const insertToken = db.prepare(
        `INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, 'iap')`
      ).run([tokenId, appUserId, now]);
      if (insertToken instanceof Promise) await insertToken;
    }

    const updateTokenIds = db.prepare("UPDATE payments SET token_ids = ? WHERE id = ?").run(tokenIds.join(","), paymentId);
    if (updateTokenIds instanceof Promise) await updateTokenIds;
  } catch (error) {
    console.error("RevenueCat webhook: grant failed", error);
    return res.status(500).json({ error: "Failed to grant tokens" });
  }

  console.log(`RevenueCat: granted ${grantCount} token(s) to user ${appUserId} (product ${productId})`);
  return res.status(200).json({ received: true, tokens_granted: grantCount });
});

// Get payment packages (IAP: productId + tokens; app gets price from RevenueCat offerings)
paymentsRouter.get("/packages", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const tokensResult = db
      .prepare(
        `SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`
      )
      .all([userId]);
    const allTokens = (tokensResult instanceof Promise)
      ? await tokensResult
      : (tokensResult as any[]);
    const availableTokens = allTokens.filter(
      (t: any) => !t.used_at && !t.returned_at
    ).length;
    const maxCanBuy = Math.max(0, 7 - availableTokens);

    const packages = IAP_PACKAGES.map((p) => ({
      id: p.id,
      productId: p.productId,
      tokens: p.tokens,
      price: 0,
      priceFormatted: "", // App gets price from RevenueCat
      pricePerToken: "",
      available: maxCanBuy >= p.tokens,
      wouldExceedLimit: maxCanBuy > 0 && maxCanBuy < p.tokens,
      maxTokensCanBuy: maxCanBuy,
    }));

    res.json({ packages, availableTokens });
  } catch (error) {
    console.error("Packages GET error:", error);
    res.status(500).json({ error: "Failed to load packages" });
  }
});

// Create checkout session - stubbed (was Stripe, for web)
paymentsRouter.post("/create-checkout", authenticateToken, rateLimitAPI, async (_req: AuthRequest, res) => {
  return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
});

// Get payment history for user (reads DB only; no Stripe)
paymentsRouter.get("/history", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const paymentsResult = db.prepare(
      `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    ).all([userId]);
    const payments = (paymentsResult instanceof Promise
      ? await paymentsResult
      : paymentsResult) as any[];
    res.json({ payments });
  } catch (error) {
    console.error("Payment history error:", error);
    res.status(500).json({ error: "Failed to load payment history" });
  }
});
