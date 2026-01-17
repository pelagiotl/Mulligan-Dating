import { Router, Request, Response } from "express";
import express from "express";
import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { rateLimitAPI } from "../middleware/security.js";

export const paymentsRouter = Router();

// Initialize Stripe with secret key from environment (optional for development)
// Only initialize if STRIPE_SECRET_KEY is provided
let stripe: Stripe | null = null;
try {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    stripe = new Stripe(stripeKey, {
      apiVersion: "2025-12-15.clover",
    });
    console.log('✅ Stripe initialized successfully');
  } else {
    console.warn('⚠️  STRIPE_SECRET_KEY not set. Payment features will be disabled.');
  }
} catch (error) {
  console.warn('⚠️  Failed to initialize Stripe:', error);
}

// Token purchase packages
const TOKEN_PACKAGES = {
  1: { tokens: 1, price: 199 }, // $1.99 for 1 token
  3: { tokens: 3, price: 499 }, // $4.99 for 3 tokens (best value)
  5: { tokens: 5, price: 799 }, // $7.99 for 5 tokens
  10: { tokens: 10, price: 1499 }, // $14.99 for 10 tokens (best value)
};

// Create payment intent for token purchase
paymentsRouter.post("/create-intent", authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: "Payment service is not configured. Please set STRIPE_SECRET_KEY in environment variables." });
    }

    const userId = req.userId!;
    const { packageId } = req.body;

    if (!packageId || !TOKEN_PACKAGES[packageId as keyof typeof TOKEN_PACKAGES]) {
      return res.status(400).json({ error: "Invalid package ID" });
    }

    const package_ = TOKEN_PACKAGES[packageId as keyof typeof TOKEN_PACKAGES];
    const amount = package_.price; // Price in cents
    const tokensToGrant = package_.tokens;

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      metadata: {
        userId,
        packageId: packageId.toString(),
        tokensToGrant: tokensToGrant.toString(),
      },
      description: `Purchase ${tokensToGrant} Mulligan Token${tokensToGrant > 1 ? 's' : ''}`,
    });

    // Store payment intent in database for tracking
    const paymentId = uuidv4();
    const insertPaymentStmt = db.prepare(
      `INSERT INTO payments (id, user_id, payment_intent_id, amount_cents, tokens_to_grant, package_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
    );
    await (insertPaymentStmt.run([paymentId, userId, paymentIntent.id, amount, tokensToGrant, packageId]) as Promise<any>);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount,
      tokensToGrant,
    });
  } catch (error: any) {
    console.error("Payment intent creation error:", error);
    res.status(500).json({ 
      error: "Failed to create payment intent",
      details: error.message 
    });
  }
});

// Grant tokens after successful payment
async function grantPurchaseTokens(userId: string, tokensToGrant: number, paymentId: string): Promise<string[]> {
  const grantedTokenIds: string[] = [];

  for (let i = 0; i < tokensToGrant; i++) {
    const tokenId = uuidv4();
    const insertTokenStmt = db.prepare(
      `INSERT INTO mulligan_tokens (id, user_id, source, match_id) 
       VALUES (?, ?, 'purchase', NULL)`
    );
    await (insertTokenStmt.run([tokenId, userId]) as Promise<any>);
    grantedTokenIds.push(tokenId);
  }

  // Update payment record with granted token IDs
  const updatePaymentStmt = db.prepare(
    `UPDATE payments SET 
     status = 'completed', 
     tokens_granted_at = CURRENT_TIMESTAMP,
     token_ids = ?
     WHERE id = ?`
  );
  await (updatePaymentStmt.run([JSON.stringify(grantedTokenIds), paymentId]) as Promise<any>);

  return grantedTokenIds;
}

// Stripe webhook handler (must be before authenticateToken middleware)
// Note: This route must use express.raw() to verify webhook signatures
// We'll need to handle this differently in the main index.ts file
paymentsRouter.post("/webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ Stripe webhook secret not configured");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  if (!stripe) {
    console.error("❌ Stripe not initialized - webhook cannot be processed");
    return res.status(503).json({ error: "Payment service is not configured" });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle payment intent succeeded
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata.userId;
    const tokensToGrant = parseInt(paymentIntent.metadata.tokensToGrant || "0");
    const paymentIntentId = paymentIntent.id;

    console.log(`✅ Payment succeeded: ${paymentIntentId} for user ${userId}, granting ${tokensToGrant} tokens`);

    try {
      // Find payment record
      const paymentResult = db.prepare(
        `SELECT id FROM payments WHERE payment_intent_id = ? AND status = 'pending'`
      ).get([paymentIntentId]);
      const payment = (paymentResult instanceof Promise
        ? await paymentResult
        : paymentResult) as { id: string } | undefined;

      if (!payment) {
        console.error(`❌ Payment record not found for payment intent: ${paymentIntentId}`);
        return res.status(404).json({ error: "Payment record not found" });
      }

      // Grant tokens to user
      const tokenIds = await grantPurchaseTokens(userId, tokensToGrant, payment.id);
      console.log(`✅ Granted ${tokenIds.length} tokens to user ${userId}`);

      res.json({ received: true, tokensGranted: tokenIds.length });
    } catch (error: any) {
      console.error("❌ Error granting tokens after payment:", error);
      // Still return 200 to Stripe (we'll handle retries manually)
      res.status(500).json({ error: "Failed to grant tokens" });
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const paymentIntentId = paymentIntent.id;

    console.log(`❌ Payment failed: ${paymentIntentId}`);

    // Update payment status to failed
    const updatePaymentStmt = db.prepare(
      `UPDATE payments SET status = 'failed', failed_at = CURRENT_TIMESTAMP WHERE payment_intent_id = ?`
    );
    await (updatePaymentStmt.run([paymentIntentId]) as Promise<any>);

    res.json({ received: true });
  } else {
    console.log(`ℹ️  Unhandled webhook event type: ${event.type}`);
    res.json({ received: true });
  }
});

// Get payment packages
paymentsRouter.get("/packages", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    console.log(`📦 GET /api/payments/packages - User: ${userId}`);
    
    const packages = Object.entries(TOKEN_PACKAGES).map(([id, pkg]) => ({
      id: parseInt(id),
      tokens: pkg.tokens,
      price: pkg.price,
      priceFormatted: `$${(pkg.price / 100).toFixed(2)}`,
      pricePerToken: (pkg.price / pkg.tokens / 100).toFixed(2),
    }));

    console.log(`✅ Returning ${packages.length} packages to user ${userId}`);
    res.json({ packages });
  } catch (error) {
    console.error("❌ Packages GET error:", error);
    res.status(500).json({ error: "Failed to load packages" });
  }
});

// Get payment history for user
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

