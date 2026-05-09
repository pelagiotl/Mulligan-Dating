import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../utils/api";

export const REPORT_REASON_OPTIONS = [
  { id: "threats", label: "Threats / violence / self-harm", urgentEligible: true, emoji: "🛑" },
  { id: "sexual", label: "Unwanted sexual content (non-consensual)", urgentEligible: true, emoji: "🚫" },
  { id: "money", label: "Asking for money / scams / illegal activity", urgentEligible: true, emoji: "💸" },
  { id: "harassment", label: "Harassment / bullying", urgentEligible: false, emoji: "⚠️" },
  { id: "hate", label: "Hate speech", urgentEligible: false, emoji: "🧿" },
  { id: "spam", label: "Spam / repeated unwanted messages", urgentEligible: false, emoji: "📣" },
  { id: "other", label: "Other", urgentEligible: false, emoji: "📝" },
] as const;

const MAX_REPORT_CATEGORIES = 3;

interface ReportUserModalProps {
  open: boolean;
  reportedUserId: string | null;
  matchId: string | null;
  reportedDisplayName: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function ReportUserModal({
  open,
  reportedUserId,
  matchId,
  reportedDisplayName,
  onClose,
  onSubmitted,
}: ReportUserModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setUrgent(false);
      setDetails("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const urgentEligible = useMemo(
    () => selectedIds.some((id) => REPORT_REASON_OPTIONS.find((o) => o.id === id)?.urgentEligible),
    [selectedIds]
  );

  useEffect(() => {
    if (!urgentEligible && urgent) setUrgent(false);
  }, [urgentEligible, urgent]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleReason = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_REPORT_CATEGORIES) {
        setError(`Select up to ${MAX_REPORT_CATEGORIES} reasons.`);
        return prev;
      }
      setError(null);
      return [...prev, id];
    });
  };

  const submit = async () => {
    if (!reportedUserId || !matchId) {
      setError("Report target is missing. Please try again.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Choose at least one category.");
      return;
    }
    const selectedLabels = REPORT_REASON_OPTIONS.filter((o) => selectedIds.includes(o.id)).map((o) => o.label);
    const parts: string[] = [];
    if (urgent) parts.push("URGENT");
    parts.push(`Reasons: ${selectedLabels.join(", ")}`);
    const trimmed = details.trim();
    if (trimmed) parts.push(`Details: ${trimmed}`);
    const reason = parts.join(" | ").slice(0, 480);

    setSubmitting(true);
    setError(null);
    try {
      await api.post("/reports", {
        reportedUserId,
        matchId,
        reason,
      });
      onSubmitted();
      onClose();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to submit report";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="report-user-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="report-user-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-user-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="report-user-modal-header">
          <h2 id="report-user-modal-title" className="report-user-modal-title">
            Report {reportedDisplayName}
          </h2>
          <p className="report-user-modal-subtitle">Select all that apply (up to {MAX_REPORT_CATEGORIES})</p>
        </header>

        <div className="report-user-modal-scroll">
          <ul className="report-user-reason-list">
            {REPORT_REASON_OPTIONS.map((opt) => {
              const selected = selectedIds.includes(opt.id);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    className={`report-user-reason-row${selected ? " report-user-reason-row--selected" : ""}`}
                    onClick={() => toggleReason(opt.id)}
                  >
                    <span className="report-user-reason-emoji" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="report-user-reason-label">{opt.label}</span>
                    <span className={`report-user-check${selected ? " report-user-check--on" : ""}`} aria-hidden>
                      {selected ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className={`report-user-urgent${!urgentEligible ? " report-user-urgent--disabled" : ""}`}
            disabled={!urgentEligible}
            onClick={() => urgentEligible && setUrgent((v) => !v)}
          >
            <span className={`report-user-check report-user-check--lg${urgent ? " report-user-check--on" : ""}`} aria-hidden>
              {urgent ? "✓" : ""}
            </span>
            <span className="report-user-urgent-text">
              <span className="report-user-urgent-title">This is urgent</span>
              <span className="report-user-urgent-sub">
                {urgentEligible
                  ? "For threats, self-harm, non-consensual sexual content, or scams / illegal activity."
                  : "Select a safety-critical reason above to enable."}
              </span>
            </span>
          </button>

          <label className="report-user-details-label" htmlFor="report-user-details">
            Optional details
          </label>
          <textarea
            id="report-user-details"
            className="report-user-details-input"
            rows={3}
            maxLength={320}
            placeholder="1–2 sentences (optional)"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          {error ? <p className="report-user-error">{error}</p> : null}
        </div>

        <footer className="report-user-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={submitting || selectedIds.length === 0}
          >
            {submitting ? "Sending…" : "Submit report"}
          </button>
        </footer>
      </div>
    </div>
  );
}
