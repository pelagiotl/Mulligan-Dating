import { Router, Request, Response } from "express";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { rateLimitAPI } from "../middleware/security.js";

export const paymentsRouter = Router();

// Stub: purchases temporarily unavailable (Stripe removed; RevenueCat integration planned)
const PURCHASES_UNAVAILABLE_MSG = "Purchases temporarily unavailable.";

// Create payment intent - stubbed (was Stripe)
paymentsRouter.post("/create-intent", authenticateToken, rateLimitAPI, async (_req: AuthRequest, res) => {
  return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
});

// Webhook - stubbed (was Stripe)
paymentsRouter.post("/webhook", async (_req: Request, res: Response) => {
  return res.status(503).json({ error: PURCHASES_UNAVAILABLE_MSG });
});

// Get payment packages - return empty list so app shows "coming soon" UI
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
    res.json({ packages: [], availableTokens });
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
