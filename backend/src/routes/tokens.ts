import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

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

    // Count available tokens (granted but not used, and not returned)
    // Cap at maximum of 3 tokens
    const availableTokens = Math.min(
      tokens.filter((t: TokenRow) => !t.used_at && !t.returned_at).length,
      3
    );

    // Check if user should get weekly tokens (3 tokens per week)
    // Find the most recent weekly token grant
    // Look for tokens with source='weekly' or no source (old tokens)
    const weeklyTokens = tokens.filter((t: TokenRow) => !t.source || t.source === 'weekly');
    const lastWeeklyToken = weeklyTokens.length > 0 ? weeklyTokens[0] : null;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    let canClaimWeeklyToken = false;
    if (!lastWeeklyToken) {
      // No weekly tokens yet, can claim
      canClaimWeeklyToken = true;
    } else {
      const lastGranted = new Date(lastWeeklyToken.granted_at);
      canClaimWeeklyToken = lastGranted < oneWeekAgo;
    }

    // Can't claim if already at max (3 tokens)
    if (availableTokens >= 3) {
      canClaimWeeklyToken = false;
    }

    console.log('✅ Tokens fetched:', { availableTokens, canClaimWeeklyToken, totalTokens: tokens.length });
    res.json({
      availableTokens,
      canClaimWeeklyToken,
      tokens: tokens.slice(0, 10), // Last 10 tokens
    });
  } catch (error) {
    console.error('Tokens GET error:', error);
    res.status(500).json({ error: 'Failed to load tokens' });
  }
});

// Claim weekly tokens (3 tokens per week)
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

  // Can't claim if already at max (3 tokens)
  if (availableTokens >= 3) {
    return res.status(400).json({ 
      error: "You already have 3 tokens. Use them before claiming more!" 
    });
  }

  // Check if user can claim weekly tokens
  // Look for tokens with source='weekly' or no source (old tokens)
  const weeklyTokens = allTokens.filter((t: TokenRow) => !t.source || t.source === 'weekly');
  const lastWeeklyToken = weeklyTokens.length > 0 ? weeklyTokens[0] : null;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  if (lastWeeklyToken) {
    const lastGranted = new Date(lastWeeklyToken.granted_at);
    if (lastGranted >= oneWeekAgo) {
      return res
        .status(400)
        .json({ error: "You can only claim 3 tokens per week. Wait until next week!" });
    }
  }

  // Calculate how many tokens to grant (up to 3 total)
  const tokensToGrant = Math.min(3, 3 - availableTokens);
  const grantedTokenIds: string[] = [];

    // Grant tokens (up to 3)
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

// Grant a free token (for development/testing - bypasses weekly limit)
tokensRouter.post("/grant-free", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Grant new token without restrictions
    const tokenId = uuidv4();
    const insertResult = db.prepare(
      `INSERT INTO mulligan_tokens (id, user_id, source) VALUES (?, ?, 'dev')`
    ).run([tokenId, userId]);
    
    // Handle both sync (SQLite) and async (PostgreSQL)
    if (insertResult instanceof Promise) {
      await insertResult;
    }

    res.json({ 
      message: "Free token granted!", 
      tokenId,
      note: "This is a development token (bypasses weekly limit)"
    });
  } catch (error) {
    console.error('Tokens grant-free error:', error);
    res.status(500).json({ error: 'Failed to grant free token' });
  }
});

