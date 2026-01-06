import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate a unique referral code for a user
 * Format: 6-8 character alphanumeric code (e.g., "ABC123")
 */
export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars (0, O, I, 1)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get or create a referral code for a user
 */
export function getOrCreateReferralCode(userId: string): string {
  // Check if user already has a referral code
  const user = db
    .prepare("SELECT referral_code FROM users WHERE id = ?")
    .get(userId) as { referral_code: string | null } | undefined;

  if (user?.referral_code) {
    return user.referral_code;
  }

  // Generate a unique code
  let code: string;
  let attempts = 0;
  do {
    code = generateReferralCode();
    attempts++;
    if (attempts > 10) {
      // Fallback to UUID-based code if we can't generate a short one
      code = uuidv4().substring(0, 8).toUpperCase().replace(/-/g, "");
    }
  } while (
    db.prepare("SELECT id FROM users WHERE referral_code = ?").get(code) &&
    attempts < 10
  );

  // Save the code
  db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").run(
    code,
    userId
  );

  return code;
}

/**
 * Find user by referral code
 */
export function getUserByReferralCode(code: string): string | null {
  const user = db
    .prepare("SELECT id FROM users WHERE referral_code = ?")
    .get(code) as { id: string } | undefined;

  return user?.id || null;
}

/**
 * Grant a referral token to a user
 */
export function grantReferralToken(referrerId: string): string {
  const tokenId = uuidv4();
  db.prepare(
    `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'referral')`
  ).run(tokenId, referrerId);
  return tokenId;
}





