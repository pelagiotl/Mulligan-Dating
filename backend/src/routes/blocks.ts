import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  blockUserByPhoneNumber,
  listBlockedPhoneNumbers,
  unblockPhoneNumber,
} from "../services/blockedMatching.js";
import { formatPhoneNationalDisplay, usNational10Digits } from "../utils/phoneDigits.js";

export const blocksRouter = Router();

// Block a user by account id (e.g. from profile modal)
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

    const existingBlock = await (db
      .prepare("SELECT id FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
      .get(userId, blockedUserId) as Promise<{ id: string } | undefined>);

    if (existingBlock) {
      return res.status(400).json({ error: "User already blocked" });
    }

    const blockId = uuidv4();
    await (db.prepare(
      `INSERT INTO blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)`
    ).run(blockId, userId, blockedUserId) as Promise<any>);

    await (db.prepare(
      `UPDATE matches SET stage = 'expired' 
       WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?))
       AND stage != 'expired'`
    ).run(userId, blockedUserId, blockedUserId, userId) as Promise<any>);

    const targetPhoneResult = db.prepare("SELECT phone_number FROM users WHERE id = ?").get([blockedUserId]);
    const targetPhoneRow = (targetPhoneResult instanceof Promise
      ? await targetPhoneResult
      : targetPhoneResult) as { phone_number: string | null } | undefined;
    const national10 = usNational10Digits(targetPhoneRow?.phone_number ?? null);
    if (national10) {
      await (db
        .prepare(
          `DELETE FROM blocked_phone_numbers WHERE blocker_id = ? AND phone_national_10 = ?`
        )
        .run([userId, national10]) as Promise<unknown>);
    }

    res.json({ message: "User blocked successfully" });
  } catch (err: any) {
    console.error("Block user error:", err);
    res.status(500).json({ error: "Failed to block user" });
  }
});

// Block by phone number (settings) — blocks existing accounts or preemptively blocks a number
blocksRouter.post("/by-phone", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const raw = req.body?.phoneNumber ?? req.body?.phone ?? "";
    if (!raw || typeof raw !== "string") {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const result = await blockUserByPhoneNumber(userId, raw.trim());
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const message = result.alreadyBlocked
      ? "That number is already on your block list."
      : result.phoneOnly
        ? "Phone number blocked. They won't appear in browse if they join with this number."
        : "User blocked. They won't appear in browse and any active match was ended.";

    res.json({
      message,
      phoneNational10: result.phoneNational10,
      phoneDisplay: result.phoneDisplay,
      blockedUserId: result.blockedUserId,
      phoneOnly: result.phoneOnly,
      alreadyBlocked: result.alreadyBlocked,
    });
  } catch (err: any) {
    console.error("Block by phone error:", err);
    res.status(500).json({ error: "Failed to block phone number" });
  }
});

// Unblock by phone number (must be registered before /:blockedUserId)
blocksRouter.delete("/by-phone/:phone", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const raw = decodeURIComponent(req.params.phone ?? "");
    const result = await unblockPhoneNumber(userId, raw);
    if (!result.ok) {
      return res.status(result.status ?? 400).json({ error: result.error });
    }
    res.json({ message: "Phone number unblocked" });
  } catch (err: any) {
    console.error("Unblock by phone error:", err);
    res.status(500).json({ error: "Failed to unblock phone number" });
  }
});

// Unblock a user by account id
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

// List blocked users and phone-only blocks
blocksRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const blocks = await (db
      .prepare(`
        SELECT b.*, u.email as blocked_email, u.phone_number as blocked_phone,
               p.display_name as blocked_name
        FROM blocks b
        JOIN users u ON u.id = b.blocked_id
        LEFT JOIN profiles p ON p.user_id = b.blocked_id
        WHERE b.blocker_id = ?
        ORDER BY b.created_at DESC
      `)
      .all(userId) as Promise<any[]>);

    const blockedPhoneNumbers = await listBlockedPhoneNumbers(userId);

    res.json({
      blockedUsers: blocks.map((b) => {
        const national10 = usNational10Digits(b.blocked_phone);
        return {
          id: b.blocked_id,
          email: b.blocked_email ?? "",
          displayName: b.blocked_name ?? null,
          phoneDisplay: national10 ? formatPhoneNationalDisplay(national10) : null,
          phoneNational10: national10,
          blockedAt: b.created_at,
        };
      }),
      blockedPhoneNumbers,
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
