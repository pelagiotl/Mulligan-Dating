import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { db } from "../database.js";

export const swipesRouter = Router();

/**
 * Track swipe interaction (like/pass)
 * This feeds the collaborative filtering system
 */
swipesRouter.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { candidateId, action } = req.body as {
      candidateId: string;
      action: "like" | "pass";
    };

    if (!candidateId || !action || !["like", "pass"].includes(action)) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const userId = req.userId;

    // Check if interaction already exists
    const existing = db
      .prepare("SELECT id FROM swipe_interactions WHERE user_id = ? AND candidate_id = ?")
      .get(userId, candidateId) as { id: string } | undefined;

    if (existing) {
      // Update existing interaction
      db.prepare("UPDATE swipe_interactions SET action = ? WHERE id = ?").run(action, existing.id);
    } else {
      // Create new interaction
      const id = uuidv4();
      db.prepare(
        "INSERT INTO swipe_interactions (id, user_id, candidate_id, action) VALUES (?, ?, ?, ?)"
      ).run(id, userId, candidateId, action);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Swipe tracking error:", error);
    res.status(500).json({ error: "Failed to track swipe" });
  }
});

/**
 * Get swipe history for a user (for debugging/admin)
 */
swipesRouter.get("/history", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const swipes = db
      .prepare(
        "SELECT candidate_id, action, created_at FROM swipe_interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
      )
      .all(userId) as Array<{ candidate_id: string; action: string; created_at: string }>;

    res.json({ swipes });
  } catch (error) {
    console.error("Get swipe history error:", error);
    res.status(500).json({ error: "Failed to get swipe history" });
  }
});

