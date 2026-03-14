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
}): Promise<{ sent: boolean; error?: string }> {
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.REPORT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Mulligan <onboarding@resend.dev>";

  if (!supportEmail || !apiKey) {
    if (process.env.NODE_ENV !== "test") {
      console.error(
        "[Report email] Not sent: set SUPPORT_EMAIL (or REPORT_EMAIL) and RESEND_API_KEY in your backend env (e.g. Render). " +
        "Support will not receive report notifications until these are set."
      );
    }
    return { sent: false, error: "SUPPORT_EMAIL or RESEND_API_KEY not set" };
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
      console.error("[Report email] Resend API error:", result.error);
      return { sent: false, error: String(result.error?.message ?? result.error) };
    }
    if (process.env.NODE_ENV !== "test") {
      console.log("[Report email] Sent to", supportEmail, "for report", params.reportId.slice(0, 8));
    }
    return { sent: true };
  } catch (err: any) {
    console.error("[Report email] Send failed:", err?.message || err);
    return { sent: false, error: err?.message || String(err) };
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

    await (db.prepare(
      `INSERT INTO reports (id, reporter_id, reported_user_id, match_id, reason) VALUES (?, ?, ?, ?, ?)`
    ).run(reportId, userId, reportedUserId, matchIdOrNull, reasonTrimmed) as Promise<any>);

    // Fetch display names for notification email
    const reporterProfileResult = await (db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(userId) as Promise<{ display_name?: string } | undefined>);
    const reportedProfileResult = await (db.prepare("SELECT display_name FROM profiles WHERE user_id = ?").get(reportedUserId) as Promise<{ display_name?: string } | undefined>);
    const reporterDisplayName = typeof reporterProfileResult?.display_name === "string" ? reporterProfileResult.display_name : "";
    const reportedDisplayName = typeof reportedProfileResult?.display_name === "string" ? reportedProfileResult.display_name : "";

    // Send email to support so the team can review (requires SUPPORT_EMAIL + RESEND_API_KEY on backend)
    const emailResult = await sendReportNotificationEmail({
      reportId,
      reporterId: userId,
      reportedUserId,
      matchId: matchIdOrNull,
      reason: reasonTrimmed,
      reporterDisplayName,
      reportedDisplayName,
    });
    if (!emailResult.sent && process.env.NODE_ENV !== "test") {
      console.error("[Report] Support was not emailed:", emailResult.error);
    }

    res.status(201).json({ message: "Report submitted. We'll look into it." });
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to submit report" });
  }
});
