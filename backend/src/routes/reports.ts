import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const reportsRouter = Router();

// Report a user (e.g. from profile card in matches)
reportsRouter.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { reportedUserId, matchId, reason } = req.body as {
      reportedUserId?: string;
      matchId?: string;
      reason?: string;
    };

    if (!reportedUserId) {
      return res.status(400).json({ error: "Reported user ID is required" });
    }

    if (reportedUserId === userId) {
      return res.status(400).json({ error: "You cannot report yourself" });
    }

    const reportId = uuidv4();
    const reasonTrimmed =
      typeof reason === "string" ? reason.trim().slice(0, 500) : null;
    const matchIdOrNull = matchId && typeof matchId === "string" ? matchId : null;

    db.prepare(
      `INSERT INTO reports (id, reporter_id, reported_user_id, match_id, reason) VALUES (?, ?, ?, ?, ?)`
    ).run(reportId, userId, reportedUserId, matchIdOrNull, reasonTrimmed);

    res.status(201).json({ message: "Report submitted. We'll look into it." });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});
