import { Router } from "express";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  getOrCreateReferralCode,
  getUserByReferralCode,
} from "../utils/referrals.js";

export const referralsRouter = Router();

// Get user's referral code and stats
referralsRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get or create referral code
    const referralCode = await getOrCreateReferralCode(userId);

    // Get referral stats
    const referralsStmt = db.prepare(
      `SELECT r.*, u.email as referred_email, p.display_name as referred_name
       FROM referrals r
       LEFT JOIN users u ON u.id = r.referred_id
       LEFT JOIN profiles p ON p.user_id = r.referred_id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`
    );
    const referrals = await (referralsStmt.all([userId]) as Promise<any[]>);

    // Count total referrals and tokens earned
    const totalReferrals = referrals.length;
    const tokensEarned = referrals.filter((r) => r.token_granted === 1).length;

    // Get referral link - try to detect the frontend URL from the request
    const baseUrl = process.env.FRONTEND_URL || 
                    (req.headers.origin || req.headers.referer || "http://localhost:5174").replace(/\/$/, "");
    const referralLink = `${baseUrl}/signup?ref=${referralCode}`;

    res.json({
      referralCode,
      referralLink,
      totalReferrals,
      tokensEarned,
      referrals: referrals.map((r) => ({
        id: r.id,
        referredEmail: r.referred_email,
        referredName: r.referred_name,
        createdAt: r.created_at,
        tokenGranted: r.token_granted === 1,
      })),
    });
  } catch (error) {
    console.error('Referrals route error:', error);
    res.status(500).json({ 
      error: 'Failed to load referral data',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    });
  }
});

// Validate a referral code (for signup page)
referralsRouter.get("/validate/:code", async (req, res) => {
  const { code } = req.params;
  const referrerId = await getUserByReferralCode(code);

  if (!referrerId) {
    return res.status(404).json({ valid: false, error: "Invalid referral code" });
  }

  // Get referrer's name if available
  const profileStmt = db.prepare("SELECT display_name FROM profiles WHERE user_id = ?");
  const profile = await (profileStmt.get([referrerId]) as Promise<{ display_name: string } | null>);

  res.json({
    valid: true,
    referrerName: profile?.display_name || "a friend",
  });
});


