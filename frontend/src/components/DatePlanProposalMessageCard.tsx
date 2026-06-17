import { budgetDisplay, formatVenuePinLabel, getDatePlanLaneVisual } from "../utils/datePlanLaneVisuals";

export type DatePlanMessageSnapshot = {
  id: string;
  title: string;
  description: string;
  laneId?: string;
  venueName?: string;
  venueAddress?: string;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: "low" | "medium" | "high";
};

function formatPlanWhen(plan: DatePlanMessageSnapshot): string | null {
  if (!plan.suggestedDate) return null;
  const datePart = plan.suggestedDate.split("T")[0];
  const d = new Date(datePart + (plan.suggestedTime ? `T${plan.suggestedTime}` : "T12:00"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function planDescriptionPreview(description: string): string {
  return description.split("\n\n")[0]?.trim() || description.trim();
}

export default function DatePlanProposalMessageCard({
  plan,
  proposerName,
}: {
  plan: DatePlanMessageSnapshot;
  proposerName: string;
}) {
  const visual = getDatePlanLaneVisual(plan.laneId);
  const budget = budgetDisplay(plan.budgetRange);
  const when = formatPlanWhen(plan);

  return (
    <article className="chat-date-plan-card">
      <div className="chat-date-plan-hero" style={{ backgroundImage: `url(${visual.imageUrl})` }}>
        <div className="chat-date-plan-hero-overlay" />
        <span className="chat-date-plan-lane-badge">
          {visual.emoji} {visual.label}
        </span>
        {plan.budgetRange ? (
          <span className="chat-date-plan-budget-pill" title={budget.label}>
            {budget.tier}
          </span>
        ) : null}
      </div>
      <div className="chat-date-plan-body">
        <p className="chat-date-plan-eyebrow">📅 {proposerName} proposed a hangout</p>
        <h4 className="chat-date-plan-title">{plan.title}</h4>
        {plan.venueName || plan.venueAddress ? (
          <p className="chat-date-plan-venue">
            📍 {formatVenuePinLabel(plan.venueName ?? "Suggested spot", plan.venueAddress)}
          </p>
        ) : null}
        <p className="chat-date-plan-desc">{planDescriptionPreview(plan.description)}</p>
        {when ? <p className="chat-date-plan-when">🗓 {when}</p> : null}
      </div>
    </article>
  );
}
