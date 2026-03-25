import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const reportsRouter = Router();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUtcDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

interface ReportPartyRow {
  id: string;
  email: string | null;
  phone_number: string | null;
  created_at: string | null;
  last_active_at: string | null;
  is_admin: number | null;
  is_restricted: number | null;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  location: string | null;
  bio: string | null;
}

async function loadReportParty(userId: string): Promise<ReportPartyRow | null> {
  const row = await (db
    .prepare(
      `SELECT u.id, u.email, u.phone_number, u.created_at, u.last_active_at, u.is_admin, u.is_restricted,
              p.display_name, p.age, p.gender, p.location, p.bio
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get([userId]) as Promise<ReportPartyRow | undefined>);
  return row ?? null;
}

function partySectionHtml(opts: {
  title: string;
  subtitle: string;
  row: ReportPartyRow | null;
}): string {
  const { title, subtitle, row } = opts;
  if (!row) {
    return `
      <div style="margin:16px 0;padding:12px 16px;border:1px solid #ccc;border-radius:8px;background:#fafafa;">
        <h3 style="margin:0 0 4px 0;font-size:16px;">${escapeHtml(title)}</h3>
        <p style="margin:0;color:#666;font-size:13px;">${escapeHtml(subtitle)}</p>
        <p style="margin:12px 0 0 0;"><em>No user row found (deleted or invalid ID).</em></p>
      </div>`;
  }
  const name = row.display_name?.trim() || "(no display name)";
  const bioExcerpt = truncate(row.bio, 600);
  const flags: string[] = [];
  if (row.is_admin === 1) flags.push("ADMIN");
  if (row.is_restricted === 1) flags.push("RESTRICTED");
  const flagLine = flags.length ? flags.join(" · ") : "Normal account";

  const rows: [string, string][] = [
    ["Display name", name],
    ["Phone", row.phone_number?.trim() || "—"],
    ["Email", row.email?.trim() || "—"],
    ["Age", row.age != null ? String(row.age) : "—"],
    ["Gender", row.gender?.trim() || "—"],
    ["Location", row.location?.trim() || "—"],
    ["Account created", formatUtcDateTime(row.created_at)],
    ["Last active (server)", formatUtcDateTime(row.last_active_at)],
    ["Account flags", flagLine],
    ["User ID (copy for admin / DB)", row.id],
  ];

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#444;font-size:13px;white-space:nowrap;"><strong>${escapeHtml(k)}</strong></td>` +
        `<td style="padding:6px 0;font-size:13px;color:#111;">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  const bioBlock =
    bioExcerpt.length > 0
      ? `<p style="margin:12px 0 0 0;font-size:13px;color:#333;"><strong>Bio (excerpt)</strong><br/>${escapeHtml(bioExcerpt)}</p>`
      : "";

  return `
      <div style="margin:16px 0;padding:12px 16px;border:2px solid #c62828;border-radius:8px;background:#fff8f8;">
        <h3 style="margin:0 0 4px 0;font-size:16px;color:#b71c1c;">${escapeHtml(title)}</h3>
        <p style="margin:0;color:#666;font-size:13px;">${escapeHtml(subtitle)}</p>
        <table style="margin-top:12px;border-collapse:collapse;width:100%;">${tableRows}</table>
        ${bioBlock}
      </div>`;
}

function reporterSectionHtml(row: ReportPartyRow | null): string {
  if (!row) {
    return `<p><em>Reporter account not found.</em></p>`;
  }
  const name = row.display_name?.trim() || "(no display name)";
  const innerRows: [string, string][] = [
    ["Display name", name],
    ["Phone", row.phone_number?.trim() || "—"],
    ["Email", row.email?.trim() || "—"],
    ["User ID", row.id],
  ];
  const tableRows = innerRows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;color:#555;font-size:13px;"><strong>${escapeHtml(k)}</strong></td>` +
        `<td style="padding:4px 0;font-size:13px;">${escapeHtml(v)}</td></tr>`
    )
    .join("");
  return `
      <div style="margin:16px 0;padding:12px 16px;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;">
        <h3 style="margin:0 0 8px 0;font-size:15px;">Reporter (submitted the report)</h3>
        <table style="border-collapse:collapse;width:100%;">${tableRows}</table>
      </div>`;
}

async function sendReportNotificationEmail(params: {
  reportId: string;
  matchId: string | null;
  reason: string | null;
  reporter: ReportPartyRow | null;
  reported: ReportPartyRow | null;
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
    const reportedName =
      params.reported?.display_name?.trim() || "Unknown user";
    const reporterName =
      params.reporter?.display_name?.trim() || "Unknown reporter";
    const subject = `[Mulligan] Report: ${reportedName} ← ${reporterName} (#${params.reportId.slice(0, 8)})`;

    const reasonBlock = params.reason
      ? `<div style="margin:16px 0;padding:12px 16px;border-left:4px solid #333;background:#f5f5f5;">
           <strong>Reason from reporter</strong>
           <p style="margin:8px 0 0 0;font-size:14px;">${escapeHtml(params.reason)}</p>
         </div>`
      : `<p><em>No reason text was provided.</em></p>`;

    const matchBlock =
      params.matchId != null
        ? `<p style="font-size:13px;color:#333;"><strong>Related match ID</strong> (for messages / DB): <code>${escapeHtml(params.matchId)}</code></p>`
        : `<p style="font-size:13px;color:#666;"><strong>Related match ID:</strong> — (not tied to a specific match)</p>`;

    const adminHint = `<p style="font-size:13px;color:#555;margin-top:16px;">
        In the <strong>Admin</strong> user list, search by <strong>phone</strong>, <strong>email</strong>, <strong>display name</strong>, or paste the full <strong>user ID</strong> below.
      </p>`;

    const referenceFooter = `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />
      <p style="font-size:12px;color:#888;"><strong>Report ID</strong> (database): <code>${escapeHtml(params.reportId)}</code></p>`;

    const reportedSection = partySectionHtml({
      title: "Reported user — review / restrict here",
      subtitle: "Use phone + user ID to find this account in Admin and take action if needed.",
      row: params.reported,
    });

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;line-height:1.45;color:#222;">
        <h2 style="margin:0 0 8px 0;">New user report</h2>
        ${reportedSection}
        ${reporterSectionHtml(params.reporter)}
        ${reasonBlock}
        ${matchBlock}
        ${adminHint}
        ${referenceFooter}
      </div>
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

    const [reporterRow, reportedRow] = await Promise.all([
      loadReportParty(userId),
      loadReportParty(reportedUserId),
    ]);

    // Send email to support so the team can review (requires SUPPORT_EMAIL + RESEND_API_KEY on backend)
    const emailResult = await sendReportNotificationEmail({
      reportId,
      matchId: matchIdOrNull,
      reason: reasonTrimmed,
      reporter: reporterRow,
      reported: reportedRow,
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
