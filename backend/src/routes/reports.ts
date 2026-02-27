import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const reportsRouter = Router();

async function sendReportNotificationEmail(params: {
  reportId: string;
  reporterId: string;
  reportedUserId: string;
  matchId: string | null;
  reason: string | null;
  reporterDisplayName: string;
  reportedDisplayName: string;
}): Promise<void> {
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.REPORT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Mulligan <onboarding@resend.dev>";

  if (!supportEmail || !apiKey) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Report email skipped: SUPPORT_EMAIL or RESEND_API_KEY not set");
    }
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const subject = `[Mulligan] User report #${params.reportId.slice(0, 8)}`;
    const html = `
      <h2>New user report</h2>
      <p><strong>Report ID:</strong> ${params.reportId}</p>
      <p><strong>Reporter (user ID):</strong> ${params.reporterId}</p>
      <p><strong>Reporter display name:</strong> ${params.reporterDisplayName || "(none)"}</p>
      <p><strong>Reported user (user ID):</strong> ${params.reportedUserId}</p>
      <p><strong>Reported display name:</strong> ${params.reportedDisplayName || "(none)"}</p>
      <p><strong>Match ID:</strong> ${params.matchId ?? "(none)"}</p>
      ${params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : ""}
      <p><em>Review in admin or database.</em></p>
    `;
    const run = resend.emails.send({
      from,
      to: [supportEmail],
      subject,
      html,
    });
    const result = run instanceof Promise ? await run : run;
    if (result.error) {
      console.warn("Report notification email failed:", result.error);
    }
  } catch (err) {
    console.warn("Report notification email error:", err);
  }
}

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

    // Fetch display names for notification email (non-blocking)
    const reporterProfileResult = db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(userId);
    const reportedProfileResult = db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(reportedUserId);
    const reporterProfile = (reporterProfileResult instanceof Promise ? await reporterProfileResult : reporterProfileResult) as { display_name?: string } | undefined;
    const reportedProfile = (reportedProfileResult instanceof Promise ? await reportedProfileResult : reportedProfileResult) as { display_name?: string } | undefined;
    const reporterDisplayName = typeof reporterProfile?.display_name === "string" ? reporterProfile.display_name : "";
    const reportedDisplayName = typeof reportedProfile?.display_name === "string" ? reportedProfile.display_name : "";

    sendReportNotificationEmail({
      reportId,
      reporterId: userId,
      reportedUserId,
      matchId: matchIdOrNull,
      reason: reasonTrimmed,
      reporterDisplayName,
      reportedDisplayName,
    }).catch(() => {});

    res.status(201).json({ message: "Report submitted. We'll look into it." });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});
