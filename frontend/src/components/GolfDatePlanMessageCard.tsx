import { useMemo, useState } from "react";
import { api } from "../utils/api";
import DayTimePickerField from "./DayTimePickerField";
import { dateToDatetimeLocal, datetimeLocalToDate } from "../utils/datetimeLocal";

export type GolfDatePlanMessageSnapshot = {
  id: string;
  courseId: string;
  courseName: string;
  courseCity: string;
  bookingUrl: string;
  holes?: "9" | "18" | "both";
  difficulty?: "easy" | "moderate" | "challenging";
  bestForFirstDate?: boolean;
  proposedAt?: string | null;
  notes: {
    balls?: boolean;
    tees?: boolean;
    snacks?: boolean;
    other?: string;
  };
  status?: string;
  createdBy?: string;
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBD";
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function firstNamePossessive(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "They";
  return /s$/i.test(first) ? `${first}'` : `${first}'s`;
}

function holesLabel(h?: GolfDatePlanMessageSnapshot["holes"]): string | null {
  if (h === "9") return "9️⃣ 9 holes";
  if (h === "18") return "🏌️ 18 holes";
  if (h === "both") return "🔁 9 or 18";
  return null;
}

function difficultyLabel(d?: GolfDatePlanMessageSnapshot["difficulty"]): string | null {
  if (d === "easy") return "🌱 Easygoing";
  if (d === "moderate") return "⚖️ Moderate";
  if (d === "challenging") return "🔥 Challenging";
  return null;
}

function bringingChips(notes: GolfDatePlanMessageSnapshot["notes"]): string[] {
  const chips: string[] = [];
  if (notes.balls) chips.push("⚪ Balls");
  if (notes.tees) chips.push("🪵 Tees");
  if (notes.snacks) chips.push("🥤 Snacks");
  if (notes.other?.trim()) chips.push(`✨ ${notes.other.trim()}`);
  return chips;
}

export default function GolfDatePlanMessageCard({
  plan,
  proposerName,
  matchId,
  currentUserId,
  isOwnInvite,
  onPlanUpdated,
}: {
  plan: GolfDatePlanMessageSnapshot;
  proposerName: string;
  matchId?: string;
  currentUserId?: string | null;
  /** True when the viewer sent this invite (they cannot retune their own proposal here). */
  isOwnInvite?: boolean;
  onPlanUpdated?: (next: GolfDatePlanMessageSnapshot) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holes = holesLabel(plan.holes);
  const difficulty = difficultyLabel(plan.difficulty);
  const bringing = bringingChips(plan.notes);
  const bringingTitle = `🎒 ${firstNamePossessive(proposerName)} bringing`;

  const canAdjustDate = Boolean(
    matchId &&
      currentUserId &&
      (isOwnInvite === false ||
        (plan.createdBy != null && plan.createdBy !== currentUserId)),
  );

  const initialPickerValue = useMemo(() => {
    if (plan.proposedAt) {
      const d = new Date(plan.proposedAt);
      if (!Number.isNaN(d.getTime())) return dateToDatetimeLocal(d);
    }
    return dateToDatetimeLocal(new Date());
  }, [plan.proposedAt]);

  const [pickerValue, setPickerValue] = useState(initialPickerValue);

  const openPicker = () => {
    setError(null);
    setPickerValue(initialPickerValue);
    setPickerOpen(true);
  };

  const submitNewTime = async () => {
    if (!matchId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await api.put<{ golfDatePlan?: GolfDatePlanMessageSnapshot }>(
        `/golf/date-plans/${matchId}/${plan.id}`,
        { proposedAt: datetimeLocalToDate(pickerValue).toISOString() },
      );
      setPickerOpen(false);
      if (data.golfDatePlan) {
        onPlanUpdated?.(data.golfDatePlan);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update tee time");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="chat-golf-date-plan-card">
      <div className="chat-golf-date-plan-hero">
        <p className="chat-golf-date-plan-hero-eyebrow">GOLF DATE INVITE</p>
        <h4 className="chat-golf-date-plan-hero-title">You&apos;re invited ⛳</h4>
        <p className="chat-golf-date-plan-hero-sub">{proposerName} proposed a round</p>
      </div>
      <div className="chat-golf-date-plan-body">
        <h5 className="chat-golf-date-plan-course">{plan.courseName}</h5>
        <p className="chat-golf-date-plan-city">📍 {plan.courseCity}</p>

        {canAdjustDate ? (
          <button
            type="button"
            className="chat-golf-date-plan-when-btn"
            onClick={openPicker}
            disabled={saving}
            aria-label="Suggest a different tee time"
          >
            <span className="chat-golf-date-plan-when">📅 {formatWhen(plan.proposedAt)}</span>
            <span className="chat-golf-date-plan-when-hint">
              {saving ? "Saving…" : "Tap to suggest a new time"}
            </span>
          </button>
        ) : (
          <p className="chat-golf-date-plan-when">📅 {formatWhen(plan.proposedAt)}</p>
        )}

        {(holes || difficulty || plan.bestForFirstDate) && (
          <div className="chat-golf-date-plan-chips">
            {plan.bestForFirstDate ? (
              <span className="chat-golf-date-plan-chip chat-golf-date-plan-chip--first">
                ⭐ First-date friendly
              </span>
            ) : null}
            {difficulty ? <span className="chat-golf-date-plan-chip">{difficulty}</span> : null}
            {holes ? <span className="chat-golf-date-plan-chip">{holes}</span> : null}
          </div>
        )}

        <p className="chat-golf-date-plan-bringing-label">{bringingTitle}</p>
        {bringing.length > 0 ? (
          <div className="chat-golf-date-plan-chips">
            {bringing.map((chip) => (
              <span key={chip} className="chat-golf-date-plan-chip chat-golf-date-plan-chip--bring">
                {chip}
              </span>
            ))}
          </div>
        ) : (
          <p className="chat-golf-date-plan-tbd">TBD — talk it out in chat</p>
        )}

        <a
          className="chat-golf-date-plan-book"
          href={plan.bookingUrl}
          target="_blank"
          rel="noreferrer"
        >
          📅 Book Tee Time
        </a>
      </div>

      {pickerOpen ? (
        <div
          className="chat-golf-date-plan-modal-backdrop"
          role="presentation"
          onClick={() => !saving && setPickerOpen(false)}
        >
          <div
            className="chat-golf-date-plan-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Suggest a new tee time"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="chat-golf-date-plan-modal-title">Suggest a new tee time</h4>
            <DayTimePickerField value={pickerValue} onChange={setPickerValue} />
            {error ? <p className="chat-golf-date-plan-modal-error">{error}</p> : null}
            <div className="chat-golf-date-plan-modal-actions">
              <button
                type="button"
                className="chat-golf-date-plan-modal-cancel"
                onClick={() => setPickerOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="chat-golf-date-plan-modal-save"
                onClick={() => void submitNewTime()}
                disabled={saving}
              >
                {saving ? "Saving…" : "Update time"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
