import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { canClaimWeekly, getNextRefillDate } from "../utils/weeklyTokens.js";

export const tokensRouter = Router();

interface TokenRow {
  id: string;
  user_id: string;
  granted_at: string;
  used_at: string | null;
  returned_at: string | null;
  match_id: string | null;
  source?: string | null;
}

/**
 * Grant initial tokens to a new user (7 tokens)
 * This should be called when a user first signs up
 */
export async function grantInitialTokens(userId: string): Promise<string[]> {
  const grantedTokenIds: string[] = [];
  
  // Grant 7 initial tokens
  for (let i = 0; i < 7; i++) {
    const tokenId = uuidv4();
    const insertResult = db.prepare(
      `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'initial')`
    ).run([tokenId, userId]);
    
    // Handle both sync (SQLite) and async (PostgreSQL)
    if (insertResult instanceof Promise) {
      await insertResult;
    }
    
    grantedTokenIds.push(tokenId);
  }
  
  console.log(`✅ Granted 7 initial tokens to user ${userId}`);
  return grantedTokenIds;
}

// Get user's token balance and history
tokensRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get all tokens for user
    const tokensResult = db
      .prepare(
        `SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`
      )
      .all([userId]);
    
    // Handle both sync (SQLite) and async (PostgreSQL)
    const tokens = (tokensResult instanceof Promise)
      ? await tokensResult
      : tokensResult as TokenRow[];

    // Count available tokens (granted but not used, and not returned). Cap at 7 for display.
    const rawAvailable = tokens.filter((t: TokenRow) => !t.used_at && !t.returned_at).length;
    const availableTokens = Math.min(rawAvailable, 7);

    // Check if user can claim weekly (7 days since last weekly claim)
    const weeklyTokens = tokens.filter((t: TokenRow) => !t.source || t.source === 'weekly');
    const lastWeeklyToken = weeklyTokens.length > 0 ? weeklyTokens[0] : null;
    let canClaimWeeklyToken = canClaimWeekly(lastWeeklyToken ? lastWeeklyToken.granted_at : null);

    // Can't claim if already at max (7 tokens)
    if (availableTokens >= 7) {
      canClaimWeeklyToken = false;
    }

    // Next refill = 7 days after last weekly claim (or null if never claimed)
    const nextRefillDate = getNextRefillDate(lastWeeklyToken?.granted_at ?? null);

    console.log('✅ Tokens fetched:', { availableTokens, canClaimWeeklyToken, totalTokens: tokens.length });
    res.json({
      availableTokens,
      canClaimWeeklyToken,
      nextRefillDate,
      tokens: tokens.slice(0, 10), // Last 10 tokens
    });
  } catch (error) {
    console.error('Tokens GET error:', error);
    res.status(500).json({ error: 'Failed to load tokens' });
  }
});

// Claim weekly tokens (7 tokens per week, fills up to 7 max)
tokensRouter.post("/claim", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check current token count
    const allTokensResult = db
      .prepare(
        `SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`
      )
      .all([userId]);
    
    // Handle both sync (SQLite) and async (PostgreSQL)
    const allTokens = (allTokensResult instanceof Promise)
      ? await allTokensResult
      : allTokensResult as TokenRow[];

  const availableTokens = allTokens.filter(
    (t: TokenRow) => !t.used_at && !t.returned_at
  ).length;

  // Can't claim if already at max (7 tokens)
  if (availableTokens >= 7) {
    return res.status(400).json({ 
      error: "You already have 7 tokens. Use them before claiming more!" 
    });
  }

  // Check if user can claim weekly tokens (7 days since last claim)
  const weeklyTokens = allTokens.filter((t: TokenRow) => !t.source || t.source === 'weekly');
  const lastWeeklyToken = weeklyTokens.length > 0 ? weeklyTokens[0] : null;
  if (lastWeeklyToken && !canClaimWeekly(lastWeeklyToken.granted_at)) {
    return res
      .status(400)
      .json({ error: "You can only claim weekly tokens once per week. Wait until next week!" });
  }

  // Calculate how many tokens to grant (fill up to 7 max)
  // If user has 2 tokens, grant 5 more to reach 7 (not 7 more)
  const tokensToGrant = 7 - availableTokens;
  const grantedTokenIds: string[] = [];

    // Grant tokens (fill up to 7)
    for (let i = 0; i < tokensToGrant; i++) {
      const tokenId = uuidv4();
      const insertResult = db.prepare(
        `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'weekly')`
      ).run([tokenId, userId]);
      
      // Handle both sync (SQLite) and async (PostgreSQL)
      if (insertResult instanceof Promise) {
        await insertResult;
      }
      
      grantedTokenIds.push(tokenId);
    }

    res.json({ 
      message: `${tokensToGrant} token${tokensToGrant > 1 ? 's' : ''} claimed!`, 
      tokensGranted: tokensToGrant,
      tokenIds: grantedTokenIds
    });
  } catch (error) {
    console.error('Tokens claim error:', error);
    res.status(500).json({ error: 'Failed to claim tokens' });
  }
});

// Check and return expired tokens (called periodically or on login)
tokensRouter.post("/check-returns", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    // Find matches that are in stage1 but haven't progressed in 2 weeks
    const expiredMatchesResult = db
      .prepare(
        `SELECT m.*, t.id as token_id 
         FROM matches m
         JOIN mulligan_tokens t ON t.match_id = m.id
         WHERE (m.user1_id = ? OR m.user2_id = ?)
         AND m.stage = 'stage1'
         AND m.stage1_at < ?
         AND t.returned_at IS NULL`
      )
      .all([userId, userId, twoWeeksAgo.toISOString()]);
    
    // Handle both sync (SQLite) and async (PostgreSQL)
    const expiredMatches = (expiredMatchesResult instanceof Promise)
      ? await expiredMatchesResult
      : expiredMatchesResult as any[];

    let tokensReturned = 0;

    for (const match of expiredMatches) {
      // Mark match as expired
      const updateMatchResult = db.prepare(`UPDATE matches SET stage = 'expired' WHERE id = ?`).run([match.id]);
      if (updateMatchResult instanceof Promise) {
        await updateMatchResult;
      }

      // Return the token
      const updateTokenResult = db.prepare(
        `UPDATE mulligan_tokens SET returned_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run([match.token_id]);
      
      if (updateTokenResult instanceof Promise) {
        await updateTokenResult;
      }

      tokensReturned++;
    }

    res.json({ tokensReturned });
  } catch (error) {
    console.error('Tokens check-returns error:', error);
    res.status(500).json({ error: 'Failed to check token returns' });
  }
});

// Grant a free token (for development/testing - bypasses weekly limit, still capped at 7 total)
tokensRouter.post("/grant-free", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const allTokensResult = db
      .prepare(`SELECT * FROM mulligan_tokens WHERE user_id = ? ORDER BY granted_at DESC`)
      .all([userId]);
    const allTokens = (allTokensResult instanceof Promise ? await allTokensResult : allTokensResult) as TokenRow[];
    const availableTokens = allTokens.filter((t: TokenRow) => !t.used_at && !t.returned_at).length;

    if (availableTokens >= 7) {
      return res.status(400).json({
        error: "You already have 7 tokens (the maximum). Use some before claiming more.",
      });
    }

    const tokenId = uuidv4();
    const insertResult = db.prepare(
      `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'dev')`
    ).run([tokenId, userId]);

    if (insertResult instanceof Promise) {
      await insertResult;
    }

    res.json({
      message: "Free token granted!",
      tokenId,
      note: "This is a development token (bypasses weekly limit)",
    });
  } catch (error) {
    console.error('Tokens grant-free error:', error);
    res.status(500).json({ error: 'Failed to grant free token' });
  }
});

