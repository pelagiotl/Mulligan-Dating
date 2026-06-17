import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api, ApiError } from "../utils/api";
import { budgetDisplay, getDatePlanLaneVisual } from "../utils/datePlanLaneVisuals";
import {
  defaultDatetimeLocal,
  datetimeLocalToDate,
} from "../utils/datetimeLocal";
import { getCachedDateIdeas, setCachedDateIdeas } from "../utils/dateIdeasCache";
import DayTimePickerField from "./DayTimePickerField";

export interface DatePlanIdea {
  laneId: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  budgetRange: "low" | "medium" | "high";
  conversationTopics: string[];
}

export interface DatePlan {
  id: string;
  matchId: string;
  suggestedBy: string;
  title: string;
  description: string;
  venueName?: string;
  venueAddress?: string;
  suggestedDate?: string;
  suggestedTime?: string;
  budgetRange?: "low" | "medium" | "high";
  conversationTopics: string[];
  status: "pending" | "accepted" | "modified" | "declined";
  user1Accepted: boolean;
  user2Accepted: boolean;
  user1Modifications?: string;
  user2Modifications?: string;
  isProposed?: boolean;
  proposedAt?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  matchId: string;
  partnerName: string;
  currentUserId: string;
  isCurrentUserMatchUser1: boolean;
  socket?: Socket | null;
  onProposalSent?: () => void;
};

function resolveLaneId(plan: DatePlan, ideas: DatePlanIdea[]): string | undefined {
  return ideas.find((i) => i.title === plan.title)?.laneId;
}

function formatPlanWhen(plan: DatePlan): string {
  if (!plan.suggestedDate) return "Time TBD";
  const datePart = plan.suggestedDate.split("T")[0];
  const d = new Date(datePart + (plan.suggestedTime ? `T${plan.suggestedTime}` : "T12:00"));
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DatePlanHeroBanner({
  laneId,
  budgetRange,
  compact,
}: {
  laneId?: string;
  budgetRange?: string;
  compact?: boolean;
}) {
  const visual = getDatePlanLaneVisual(laneId);
  const budget = budgetDisplay(budgetRange);
  return (
    <div
      className={`idp-hero${compact ? " idp-hero--compact" : ""}`}
      style={{ backgroundImage: `url(${visual.imageUrl})` }}
      role="presentation"
    >
      <div className="idp-hero-overlay" />
      <span className="idp-hero-lane">
        {visual.emoji} {visual.label}
      </span>
      {budgetRange ? <span className="idp-hero-budget">{budget.tier}</span> : null}
    </div>
  );
}

function DatePlanIdeaCard({
  idea,
  selected,
  onSelect,
}: {
  idea: DatePlanIdea;
  selected: boolean;
  onSelect: () => void;
}) {
  const visual = getDatePlanLaneVisual(idea.laneId);
  const budget = budgetDisplay(idea.budgetRange);
  return (
    <button
      type="button"
      className={`idp-idea-card${selected ? " idp-idea-card--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="idp-idea-hero" style={{ backgroundImage: `url(${visual.imageUrl})` }}>
        <div className="idp-idea-hero-overlay" />
        <span className="idp-idea-lane-badge">
          {visual.emoji} {visual.label}
        </span>
        <span className="idp-idea-budget-pill" title={budget.label}>
          {budget.tier}
        </span>
      </div>
      <div className="idp-idea-body">
        <h3 className="idp-idea-title">{idea.title}</h3>
        <p className="idp-idea-desc">{idea.description.split("\n\n")[0]}</p>
        {idea.venueName ? <p className="idp-venue">📍 {idea.venueName}</p> : null}
      </div>
    </button>
  );
}

function IdeaSkeletonGrid() {
  return (
    <div className="idp-ideas-grid" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="idp-skeleton-card">
          <div className="idp-skeleton-hero" />
          <div className="idp-skeleton-line idp-skeleton-line--title" />
          <div className="idp-skeleton-line" />
          <div className="idp-skeleton-line idp-skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

export default function IntentionalDatePlanner({
  open,
  onClose,
  matchId,
  partnerName,
  currentUserId,
  isCurrentUserMatchUser1,
  socket = null,
  onProposalSent,
}: Props) {
  const [ideas, setIdeas] = useState<DatePlanIdea[]>([]);
  const [meetingLocation, setMeetingLocation] = useState("");
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [activePlan, setActivePlan] = useState<DatePlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<DatePlanIdea | null>(null);
  const [datetimeDraft, setDatetimeDraft] = useState(defaultDatetimeLocal);
  const [counterNote, setCounterNote] = useState("");
  const [counterDatetime, setCounterDatetime] = useState(defaultDatetimeLocal);
  const [showCounter, setShowCounter] = useState(false);
  const seenLaneIdsRef = useRef<string[]>([]);
  const seenTitlesRef = useRef<string[]>([]);
  const seenVenueNamesRef = useRef<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mineAccepted = activePlan
    ? isCurrentUserMatchUser1
      ? activePlan.user1Accepted
      : activePlan.user2Accepted
    : false;
  const bothConfirmed = !!(activePlan?.user1Accepted && activePlan?.user2Accepted);
  const isProposer = activePlan?.suggestedBy === currentUserId;
  const awaitingMyResponse =
    !!activePlan?.isProposed && !isProposer && activePlan.status === "pending" && !mineAccepted;

  const fetchActivePlan = useCallback(async () => {
    try {
      setLoadingPlan(true);
      const res = await api.get<{ plan?: DatePlan }>(`/matches/${matchId}/date-plan`);
      setActivePlan(res?.plan ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setActivePlan(null);
    } finally {
      setLoadingPlan(false);
    }
  }, [matchId]);

  const fetchIdeas = useCallback(async (previousIdeas: DatePlanIdea[] = []) => {
    const excludeLaneIds = [
      ...new Set([...seenLaneIdsRef.current, ...previousIdeas.map((idea) => idea.laneId)]),
    ];
    const excludeTitles = [
      ...new Set([...seenTitlesRef.current, ...previousIdeas.map((idea) => idea.title)]),
    ];

    const excludeVenueNames = [
      ...new Set([
        ...seenVenueNamesRef.current,
        ...previousIdeas.map((idea) => idea.venueName).filter((name): name is string => !!name),
      ]),
    ];

    setLoadingIdeas(true);
    setError("");
    try {
      const body: {
        count: number;
        excludeLaneIds?: string[];
        excludeTitles?: string[];
        excludeVenueNames?: string[];
      } = { count: 4 };
      if (excludeLaneIds.length > 0) body.excludeLaneIds = excludeLaneIds;
      if (excludeTitles.length > 0) body.excludeTitles = excludeTitles;
      if (excludeVenueNames.length > 0) body.excludeVenueNames = excludeVenueNames;
      const res = await api.post<{
        ideas: DatePlanIdea[];
        meetingLocation: string;
        sharedInterests: string[];
      }>(`/matches/${matchId}/generate-date-ideas`, body);
      const newIdeas = res.ideas ?? [];
      setIdeas(newIdeas);
      seenLaneIdsRef.current = [...new Set([...seenLaneIdsRef.current, ...newIdeas.map((idea) => idea.laneId)])];
      seenTitlesRef.current = [...new Set([...seenTitlesRef.current, ...newIdeas.map((idea) => idea.title)])];
      seenVenueNamesRef.current = [
        ...new Set([
          ...seenVenueNamesRef.current,
          ...newIdeas.map((idea) => idea.venueName).filter((name): name is string => !!name),
        ]),
      ];
      setMeetingLocation(res.meetingLocation ?? "");
      setSharedInterests(res.sharedInterests ?? []);
      setCachedDateIdeas(matchId, {
        ideas: newIdeas,
        meetingLocation: res.meetingLocation ?? "",
        sharedInterests: res.sharedInterests ?? [],
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.message.toLowerCase().includes("route not found")) {
        setError(
          "Smart hangout ideas need the latest backend deploy. The production server does not have this feature yet.",
        );
      } else {
        setError(e instanceof ApiError ? e.message : "Could not load date ideas.");
      }
    } finally {
      setLoadingIdeas(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!open) return;
    setSelectedIdea(null);
    setShowCounter(false);
    seenLaneIdsRef.current = [];
    seenTitlesRef.current = [];
    seenVenueNamesRef.current = [];
    setError("");
    void fetchActivePlan();
    const cached = getCachedDateIdeas(matchId);
    if (cached) {
      setIdeas(cached.ideas);
      setMeetingLocation(cached.meetingLocation);
      setSharedInterests(cached.sharedInterests);
      return;
    }
    void fetchIdeas();
  }, [open, matchId, fetchActivePlan, fetchIdeas]);

  useEffect(() => {
    if (!socket || !open) return;
    const onProposed = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data.plan) setActivePlan(data.plan);
    };
    const onUpdated = (data: { matchId?: string; plan?: DatePlan }) => {
      if (data?.matchId === matchId && data.plan) setActivePlan(data.plan);
    };
    socket.on("date_plan_proposed", onProposed);
    socket.on("date_plan_updated", onUpdated);
    socket.on("date_plan_generated", onUpdated);
    return () => {
      socket.off("date_plan_proposed", onProposed);
      socket.off("date_plan_updated", onUpdated);
      socket.off("date_plan_generated", onUpdated);
    };
  }, [socket, open, matchId]);

  const handlePropose = async () => {
    if (!selectedIdea) return;
    const d = datetimeLocalToDate(datetimeDraft);
    if (Number.isNaN(d.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ plan: DatePlan }>(`/matches/${matchId}/date-plan/propose`, {
        idea: selectedIdea,
        suggestedDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        suggestedTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      });
      setActivePlan(res.plan);
      setSelectedIdea(null);
      onProposalSent?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to send proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (action: "accept" | "decline" | "modify", extra?: Record<string, string>) => {
    if (!activePlan) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.post<{ plan: DatePlan }>(
        `/matches/${matchId}/date-plan/${activePlan.id}/action`,
        { action, ...extra },
      );
      setActivePlan(res.plan);
      setShowCounter(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCounter = async () => {
    if (!activePlan || !counterNote.trim()) {
      setError("Add a short note with your counter suggestion.");
      return;
    }
    const d = datetimeLocalToDate(counterDatetime);
    if (Number.isNaN(d.getTime())) {
      setError("Pick a valid counter date and time.");
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    await runAction("modify", {
      modifications: counterNote.trim(),
      counterDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      counterTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    });
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="idp-overlay" role="presentation" onClick={onClose}>
      <div
        className="idp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="idp-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <header className="idp-header">
          <span className="idp-header-icon" aria-hidden>
            📅
          </span>
          <div>
            <h2 id="idp-title" className="idp-title">
              Smart Date Ideas for You Two
            </h2>
            <p className="idp-subtitle">
              Tailored to your interests{meetingLocation ? ` near ${meetingLocation}` : ""} — pick one and propose a time to {partnerName}.
            </p>
          </div>
        </header>

        {sharedInterests.length > 0 ? (
          <div className="idp-interests">
            {sharedInterests.slice(0, 6).map((i) => (
              <span key={i} className="idp-interest-chip">
                {i}
              </span>
            ))}
          </div>
        ) : null}

        {error ? <p className="idp-error">{error}</p> : null}

        {loadingPlan ? (
          <p className="idp-muted">Checking for active proposals…</p>
        ) : bothConfirmed && activePlan ? (
          <div className="idp-confirmed-card idp-status-card">
            <DatePlanHeroBanner
              laneId={resolveLaneId(activePlan, ideas)}
              budgetRange={activePlan.budgetRange}
              compact
            />
            <div className="idp-status-body">
              <div className="idp-confirmed-badge">✅ Hangout confirmed</div>
              <h3 className="idp-idea-title">{activePlan.title}</h3>
              <p className="idp-idea-desc">{activePlan.description}</p>
              {activePlan.venueName ? <p className="idp-venue">📍 {activePlan.venueName}</p> : null}
              <p className="idp-when">🗓 {formatPlanWhen(activePlan)}</p>
            </div>
          </div>
        ) : activePlan?.isProposed ? (
          <div className="idp-proposal-card idp-status-card">
            <DatePlanHeroBanner
              laneId={resolveLaneId(activePlan, ideas)}
              budgetRange={activePlan.budgetRange}
              compact
            />
            <div className="idp-status-body">
            <p className="idp-proposal-label">
              {isProposer ? "Your proposal" : `${partnerName}'s proposal`}
            </p>
            <h3 className="idp-idea-title">{activePlan.title}</h3>
            <p className="idp-idea-desc">{activePlan.description}</p>
            {activePlan.venueName ? (
              <p className="idp-venue">
                📍 {activePlan.venueName}
                {activePlan.venueAddress ? ` · ${activePlan.venueAddress}` : ""}
              </p>
            ) : null}
            <p className="idp-when">🗓 {formatPlanWhen(activePlan)}</p>
            {awaitingMyResponse && !showCounter ? (
              <div className="idp-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => void runAction("accept")}>
                  Accept
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => setShowCounter(true)}>
                  Counter
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={() => void runAction("decline")}>
                  Decline
                </button>
              </div>
            ) : null}
            {showCounter ? (
              <div className="idp-counter">
                <DayTimePickerField
                  label="Suggest a different time"
                  value={counterDatetime}
                  onChange={setCounterDatetime}
                />
                <label className="idp-field">
                  <span>Note to {partnerName}</span>
                  <textarea
                    className="idp-note"
                    rows={2}
                    value={counterNote}
                    onChange={(e) => setCounterNote(e.target.value)}
                    placeholder="How about Saturday afternoon instead?"
                  />
                </label>
                <div className="idp-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => void handleCounter()}>
                    Send counter
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCounter(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {!awaitingMyResponse && !bothConfirmed ? (
              <p className="idp-muted">
                {mineAccepted ? "You accepted — waiting for your match." : "Waiting for a response…"}
              </p>
            ) : null}
            </div>
          </div>
        ) : null}

        {!bothConfirmed && !activePlan?.isProposed ? (
          <>
            {loadingIdeas ? (
              <>
                <p className="idp-muted idp-loading-label">Finding intentional ideas for you two…</p>
                <IdeaSkeletonGrid />
              </>
            ) : (
              <div className="idp-ideas-grid">
                {ideas.map((idea) => (
                  <DatePlanIdeaCard
                    key={`${idea.laneId}-${idea.title}`}
                    idea={idea}
                    selected={selectedIdea?.title === idea.title}
                    onSelect={() => setSelectedIdea(idea)}
                  />
                ))}
              </div>
            )}

            {selectedIdea ? (
              <div className="idp-propose-panel">
                <h3 className="idp-propose-heading">Propose “{selectedIdea.title}”</h3>
                <DayTimePickerField
                  label="When works for you?"
                  value={datetimeDraft}
                  onChange={setDatetimeDraft}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={submitting}
                  onClick={() => void handlePropose()}
                >
                  {submitting ? "Sending…" : `Send proposal to ${partnerName}`}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="idp-refresh"
              disabled={loadingIdeas}
              onClick={() => {
                setSelectedIdea(null);
                void fetchIdeas(ideas);
              }}
            >
              {loadingIdeas ? "Refreshing…" : "↻ New ideas"}
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
