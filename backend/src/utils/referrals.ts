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
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  // Check if user already has a referral code
  const userStmt = db.prepare("SELECT referral_code FROM users WHERE id = ?");
  const user = await (userStmt.get(userId) as Promise<{ referral_code: string | null } | null>);

  if (user?.referral_code) {
    return user.referral_code;
  }

  // Generate a unique code
  let code: string;
  let attempts = 0;
  let isUnique = false;
  do {
    code = generateReferralCode();
    attempts++;
    if (attempts > 10) {
      // Fallback to UUID-based code if we can't generate a short one
      code = uuidv4().substring(0, 8).toUpperCase().replace(/-/g, "");
    }
    const checkStmt = db.prepare("SELECT id FROM users WHERE referral_code = ?");
    const existing = await (checkStmt.get(code) as Promise<any>);
    isUnique = !existing;
  } while (!isUnique && attempts < 10);

  // Save the code
  const updateStmt = db.prepare("UPDATE users SET referral_code = ? WHERE id = ?");
  await (updateStmt.run([code, userId]) as Promise<any>);

  return code;
}

/**
 * Find user by referral code
 */
export async function getUserByReferralCode(code: string): Promise<string | null> {
  const stmt = db.prepare("SELECT id FROM users WHERE referral_code = ?");
  const user = await (stmt.get(code) as Promise<{ id: string } | null>);

  return user?.id || null;
}

/**
 * Grant a referral token to a user
 */
export async function grantReferralToken(referrerId: string): Promise<string> {
  const tokenId = uuidv4();
  const stmt = db.prepare(
    `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'referral')`
  );
  await (stmt.run([tokenId, referrerId]) as Promise<any>);
  return tokenId;
}





