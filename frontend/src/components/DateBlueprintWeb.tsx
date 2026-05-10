import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api, ApiError } from "../utils/api";

export interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  planType: "first_date" | "follow_up";
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: "low" | "medium" | "high";
  conversationTopics: string[];
  status: "pending" | "accepted" | "modified" | "declined";
  user1Accepted: boolean;
  user2Accepted: boolean;
  user1Modifications?: string;
  user2Modifications?: string;
  createdAt: string;
  updatedAt: string;
}

type Props = {
  matchId: string;
  socket: Socket | null;
  currentUserId: string;
  /** From match list `isInitiator`: current user is `matches.user1_id`. */
  isCurrentUserMatchUser1: boolean;
  onInviteToChat: (text: string) => Promise<void>;
};

function planFromResponse(data: unknown): DatePlan | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { plan?: unknown };
  const p = ("plan" in o ? o.plan : data) as DatePlan | undefined;
  if (p && typeof p === "object" && "id" in p && typeof (p as DatePlan).id === "string") {
    return p as DatePlan;
  }
  return null;
}

function currentUserAccepted(plan: DatePlan, isUser1: boolean): boolean {
  return isUser1 ? plan.user1Accepted : plan.user2Accepted;
}

function toDatetimeLocalValue(plan: DatePlan): string {
  if (!plan.suggestedDate) return "";
  const datePart = plan.suggestedDate.split("T")[0];
  const [y, mo, da] = datePart.split("-").map((x) => parseInt(x, 10));
  const d = new Date(
    Number.isFinite(y) ? y : 1970,
    Number.isFinite(mo) ? mo - 1 : 0,
    Number.isFinite(da) ? da : 1
  );
  if (plan.suggestedTime) {
    const [h, m] = plan.suggestedTime.split(":");
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      d.setHours(hh, mm, 0, 0);
    }
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DateBlueprintWeb({
  matchId,
  socket,
  currentUserId,
  isCurrentUserMatchUser1,
  onInviteToChat,
}: Props) {
  const [plan, setPlan] = useState<DatePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datetimeDraft, setDatetimeDraft] = useState("");

  const fetchPlan = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ plan?: DatePlan } | DatePlan>(`/matches/${matchId}/date-plan`);
      const p = planFromResponse(res);
      setPlan(p);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPlan(null);
      } else {
        console.warn("Date plan fetch:", e);
        setPlan(null);
      }
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void fetchPlan();
  }, [fetchPlan]);

  useEffect(() => {
    if (!socket) return;
    const onGen = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data.plan) setPlan(data.plan);
    };
    const onUpd = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data.plan) setPlan(data.plan);
    };
    socket.on("date_plan_generated", onGen);
    socket.on("date_plan_updated", onUpd);
    return () => {
      socket.off("date_plan_generated", onGen);
      socket.off("date_plan_updated", onUpd);
    };
  }, [socket, matchId]);

  const handleGenerate = async () => {
    if (
      !window.confirm(
        "Create an AI-powered hangout plan based on your shared interests and location?"
      )
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post<{ plan?: DatePlan; success?: boolean }>(
        `/matches/${matchId}/generate-date-plan`,
        {}
      );
      const p = planFromResponse(res);
      if (p) {
        setPlan(p);
        window.alert("Hangout plan created — open the calendar to view it.");
      } else {
        window.alert("Plan was generated but could not be read. Try opening again.");
        await fetchPlan();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate hangout plan.";
      window.alert(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    setUpdating(true);
    try {
      const res = await api.post<{ plan?: DatePlan }>(`/matches/${matchId}/generate-date-plan`, {});
      const p = planFromResponse(res);
      if (p) setPlan(p);
      else await fetchPlan();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Failed to regenerate plan.");
    } finally {
      setUpdating(false);
    }
  };

  const handleAccept = async () => {
    if (!plan) return;
    setUpdating(true);
    try {
      const res = await api.post<{ plan?: DatePlan }>(
        `/matches/${matchId}/date-plan/${plan.id}/action`,
        { action: "accept" }
      );
      const p = planFromResponse(res);
      if (p) setPlan(p);
      window.alert("Accepted. Your match will see the update.");
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Failed to accept.");
    } finally {
      setUpdating(false);
    }
  };

  const openDatePicker = () => {
    if (plan) setDatetimeDraft(toDatetimeLocalValue(plan));
    setDatePickerOpen(true);
  };

  const saveDateTime = async () => {
    if (!plan || !datetimeDraft) {
      setDatePickerOpen(false);
      return;
    }
    const d = new Date(datetimeDraft);
    if (Number.isNaN(d.getTime())) {
      window.alert("Invalid date/time.");
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setUpdating(true);
    try {
      const res = await api.put<{ plan?: DatePlan }>(
        `/matches/${matchId}/date-plan/${plan.id}/date-time`,
        { suggestedDate: dateStr, suggestedTime: timeStr }
      );
      const p = planFromResponse(res);
      if (p) setPlan(p);
      setDatePickerOpen(false);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "Failed to update schedule.");
    } finally {
      setUpdating(false);
    }
  };

  const inviteText = (p: DatePlan) => {
    const parts = [`📅 ${p.title}`, p.description];
    if (p.venueName) parts.push(`📍 ${p.venueName}`);
    if (p.venueAddress) parts.push(p.venueAddress);
    if (p.suggestedDate) {
      parts.push(
        `📆 ${new Date(p.suggestedDate).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}${p.suggestedTime ? ` at ${p.suggestedTime}` : ""}`
      );
    }
    return parts.join("\n\n");
  };

  const handleInvite = async () => {
    if (!plan) return;
    await onInviteToChat(inviteText(plan));
    setModalOpen(false);
  };

  const bothAccepted = !!(plan?.user1Accepted && plan?.user2Accepted);
  const mineAccepted = plan ? currentUserAccepted(plan, isCurrentUserMatchUser1) : false;

  const modal = modalOpen
    ? createPortal(
        <div
          className="date-blueprint-web-overlay"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="date-blueprint-web-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-blueprint-web-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="date-blueprint-web-close"
              aria-label="Close"
              onClick={() => setModalOpen(false)}
            >
              ✕
            </button>
            {loading ? (
              <p className="date-blueprint-web-muted">Loading…</p>
            ) : !plan ? (
              <div className="date-blueprint-web-generate-wrap">
                <p className="date-blueprint-web-lead">
                  AI hangout ideas from your shared interests and locations.
                </p>
                <button
                  type="button"
                  className="date-blueprint-web-generate-btn"
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? "Generating…" : "📅 Generate hangout plan"}
                </button>
              </div>
            ) : (
              <div className="date-blueprint-web-plan">
                <h2 id="date-blueprint-web-title" className="date-blueprint-web-plan-title">
                  {plan.title}
                </h2>
                {plan.suggestedBy === currentUserId ? (
                  <p className="date-blueprint-web-hint">You generated this plan.</p>
                ) : null}
                <p className="date-blueprint-web-plan-desc">{plan.description}</p>
                {plan.venueName ? (
                  <div className="date-blueprint-web-block">
                    <div className="date-blueprint-web-label">📍 Venue</div>
                    <div className="date-blueprint-web-strong">{plan.venueName}</div>
                    {plan.venueAddress ? (
                      <div className="date-blueprint-web-sub">{plan.venueAddress}</div>
                    ) : null}
                  </div>
                ) : null}
                {plan.suggestedDate ? (
                  <button type="button" className="date-blueprint-web-date-btn" onClick={openDatePicker}>
                    <div className="date-blueprint-web-label">📅 When to meet</div>
                    <div className="date-blueprint-web-strong">
                      {new Date(plan.suggestedDate).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                      {plan.suggestedTime ? ` at ${plan.suggestedTime}` : ""}
                    </div>
                    <span className="date-blueprint-web-edit-hint">Tap to change ✏️</span>
                  </button>
                ) : null}
                {plan.budgetRange ? (
                  <div className="date-blueprint-web-block">
                    <div className="date-blueprint-web-label">💰 Budget</div>
                    <div className="date-blueprint-web-strong">
                      {plan.budgetRange === "low" ? "$" : plan.budgetRange === "medium" ? "$$" : "$$$"}
                    </div>
                  </div>
                ) : null}
                {plan.conversationTopics?.length ? (
                  <div className="date-blueprint-web-block">
                    <div className="date-blueprint-web-label">💬 Conversation topics</div>
                    <ul className="date-blueprint-web-topics">
                      {plan.conversationTopics.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {bothAccepted ? (
                  <div className="date-blueprint-web-badge">✅ Both accepted</div>
                ) : (
                  <div className="date-blueprint-web-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={updating || mineAccepted}
                      onClick={() => void handleAccept()}
                    >
                      {mineAccepted ? "✓ You accepted" : "Accept"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={updating}
                      onClick={() => void handleRegenerate()}
                    >
                      {updating ? "…" : "New plan"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleInvite()}>
                      Invite to chat
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  const dateModal = datePickerOpen
    ? createPortal(
        <div
          className="date-blueprint-web-overlay"
          role="presentation"
          onClick={() => setDatePickerOpen(false)}
        >
          <div
            className="date-blueprint-web-dialog date-blueprint-web-dialog--narrow"
            role="dialog"
            aria-modal="true"
            aria-label="Change meetup time"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="date-blueprint-web-picker-title">Change day &amp; time</h3>
            <label className="date-blueprint-web-picker-label">
              <span>Meetup</span>
              <input
                type="datetime-local"
                className="date-blueprint-web-datetime"
                value={datetimeDraft}
                onChange={(e) => setDatetimeDraft(e.target.value)}
              />
            </label>
            <div className="date-blueprint-web-picker-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDatePickerOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={updating} onClick={() => void saveDateTime()}>
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="date-blueprint-web-wrap">
      <button
        type="button"
        className={`tod-web-header-btn${plan ? " date-blueprint-web-header-btn--live" : ""}`}
        title={plan ? "Hangout plan" : "Generate hangout plan"}
        aria-label={plan ? "Open hangout plan" : "Generate hangout plan"}
        disabled={loading}
        onClick={() => setModalOpen(true)}
      >
        <span className="tod-web-header-emoji">📅</span>
      </button>
      {modal}
      {dateModal}
    </div>
  );
}
