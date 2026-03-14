import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const blocksRouter = Router();

// Block a user
blocksRouter.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { blockedUserId } = req.body;

    if (!blockedUserId) {
      return res.status(400).json({ error: "User ID required" });
    }

    if (blockedUserId === userId) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    // Check if already blocked
    const existingBlock = await (db
      .prepare("SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
      .get(userId, blockedUserId) as Promise<{ id: string } | undefined>);

    if (existingBlock) {
      return res.status(400).json({ error: "User already blocked" });
    }

    // Create block
    const blockId = uuidv4();
    await (db.prepare(
      `INSERT INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)`
    ).run(blockId, userId, blockedUserId) as Promise<any>);

    // Also expire any existing matches
    await (db.prepare(
      `UPDATE matches SET stage = 'expired' 
       WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
       AND stage != 'expired'`
    ).run(userId, blockedUserId, blockedUserId, userId) as Promise<any>);

    res.json({ message: "User blocked successfully" });
  } catch (err: any) {
    console.error("Block user error:", err);
    res.status(500).json({ error: "Failed to block user" });
  }
});

// Unblock a user
blocksRouter.delete("/:blockedUserId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { blockedUserId } = req.params;

    const result = await (db
      .prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
      .run(userId, blockedUserId) as Promise<{ changes: number }>);

    if (result.changes === 0) {
      return res.status(404).json({ error: "User not blocked" });
    }

    res.json({ message: "User unblocked successfully" });
  } catch (err: any) {
    console.error("Unblock user error:", err);
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

// Get list of blocked users
blocksRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const blocks = await (db
      .prepare(`
        SELECT b.*, u.email as blocked_email, p.display_name as blocked_name
        FROM blocks b
        JOIN users u ON u.id = b.blocked_id
        LEFT JOIN profiles p ON p.user_id = b.blocked_id
        WHERE b.blocker_id = ?
        ORDER BY b.created_at DESC
      `)
      .all(userId) as Promise<any[]>);

    res.json({
      blockedUsers: blocks.map((b) => ({
        id: b.blocked_id,
        email: b.blocked_email ?? "",
        displayName: b.blocked_name ?? null,
        blockedAt: b.created_at,
      })),
    });
  } catch (err: any) {
    console.error("List blocked users error:", err);
    res.status(500).json({ error: "Failed to load blocked users" });
  }
});

// Check if a user is blocked
blocksRouter.get("/check/:userId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { userId: targetUserId } = req.params;

    // Check if current user blocked target, or target blocked current user
    const block1 = await (db
      .prepare("SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
      .get(userId, targetUserId) as Promise<{ id: string } | undefined>);

    const block2 = await (db
      .prepare("SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
      .get(targetUserId, userId) as Promise<{ id: string } | undefined>);

    res.json({
      isBlocked: !!(block1 || block2),
      youBlockedThem: !!block1,
      theyBlockedYou: !!block2,
    });
  } catch (err: any) {
    console.error("Check blocked error:", err);
    res.status(500).json({ error: "Failed to check block status" });
  }
});













