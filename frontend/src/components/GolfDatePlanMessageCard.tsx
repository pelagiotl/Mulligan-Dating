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
}: {
  plan: GolfDatePlanMessageSnapshot;
  proposerName: string;
}) {
  const holes = holesLabel(plan.holes);
  const difficulty = difficultyLabel(plan.difficulty);
  const bringing = bringingChips(plan.notes);

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
        <p className="chat-golf-date-plan-when">📅 {formatWhen(plan.proposedAt)}</p>

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

        <p className="chat-golf-date-plan-bringing-label">🎒 Who&apos;s bringing</p>
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
    </article>
  );
}
