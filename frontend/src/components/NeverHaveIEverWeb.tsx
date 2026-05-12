import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api } from "../utils/api";

type SpiceId = "pg13" | "ratedr" | "spicy";
type AnswerId = "have" | "havent";

type GameState = {
  prompt: string;
  phase: "lobby" | "playing";
  yourSpiceChoice: SpiceId | null;
  theirSpiceChoice: SpiceId | null;
  spiceReady: boolean;
  spiceLevel: SpiceId | null;
  tokenUnlocked?: boolean;
  needsSpiceChoiceFromUnlocker?: boolean;
  unlockedByUserId?: string | null;
  yourPoints: number;
  theirPoints: number;
  yourStrikes?: number;
  theirStrikes?: number;
  yourAnswer: AnswerId | null;
  theirAnswer: AnswerId | null;
  bothAnswered: boolean;
  gameOver: boolean;
  winner: "you" | "them" | null;
  isUser1?: boolean;
  roundJustCompleted?: boolean;
  newPrompt?: string;
  pointsFromRound?: { newYourStrikes?: number; newTheirStrikes?: number };
};

type SocketPayload = {
  matchId?: string;
  newPrompt?: string;
  roundComplete?: boolean;
  user1Strikes?: number;
  user2Strikes?: number;
};

type Props = {
  matchId: string;
  socket: Socket | null;
  onSendToChat: (text: string) => Promise<void>;
  onUnlockWithToken: () => Promise<void>;
  onBeforeUnlockPrompt: () => Promise<boolean>;
  openForAccept?: boolean;
  onOpenedForAccept?: () => void;
  gameUnlockedByToken?: boolean;
};

const SPICE_OPTIONS: { id: SpiceId; title: string; blurb: string }[] = [
  {
    id: "pg13",
    title: "PG-13",
    blurb: "Playful dating prompts that keep it light but still revealing.",
  },
  {
    id: "ratedr",
    title: "Rated R",
    blurb: "Bolder stories and chemistry, tasteful and still in-bounds.",
  },
  {
    id: "spicy",
    title: "Spicy",
    blurb: "The most provocative version, app-safe and consent-forward.",
  },
];

function spiceLabel(id: SpiceId | null | undefined): string {
  if (id === "ratedr") return "Rated R";
  if (id === "spicy") return "Spicy";
  return "PG-13";
}

function answerLabel(answer: AnswerId | null | undefined): string {
  if (answer === "have") return "I have";
  if (answer === "havent") return "I haven't";
  return "";
}

function coercePoints(data: Partial<GameState>, side: "your" | "their"): number {
  if (side === "your") {
    return Math.max(0, Number(data.yourPoints ?? data.yourStrikes ?? 0) || 0);
  }
  return Math.max(0, Number(data.theirPoints ?? data.theirStrikes ?? 0) || 0);
}

function normalizeState(data: Partial<GameState>, prev?: GameState | null): GameState {
  const yourPoints = coercePoints(data, "your");
  const theirPoints = coercePoints(data, "their");
  const hasChosen = Boolean(data.yourSpiceChoice || data.theirSpiceChoice);
  const phase =
    data.phase ??
    (data.spiceReady && (data.prompt || data.spiceLevel || hasChosen) ? "playing" : "lobby");

  return {
    prompt: data.prompt ?? prev?.prompt ?? "",
    phase,
    yourSpiceChoice: data.yourSpiceChoice ?? prev?.yourSpiceChoice ?? null,
    theirSpiceChoice: data.theirSpiceChoice ?? prev?.theirSpiceChoice ?? null,
    spiceReady: Boolean(data.spiceReady ?? prev?.spiceReady ?? false),
    spiceLevel: data.spiceLevel ?? prev?.spiceLevel ?? null,
    tokenUnlocked: Boolean(data.tokenUnlocked ?? prev?.tokenUnlocked ?? false),
    needsSpiceChoiceFromUnlocker: Boolean(
      data.needsSpiceChoiceFromUnlocker ?? prev?.needsSpiceChoiceFromUnlocker ?? false
    ),
    unlockedByUserId: data.unlockedByUserId ?? prev?.unlockedByUserId ?? null,
    yourPoints,
    theirPoints,
    yourStrikes: yourPoints,
    theirStrikes: theirPoints,
    yourAnswer: data.yourAnswer ?? null,
    theirAnswer: data.theirAnswer ?? null,
    bothAnswered: Boolean(data.bothAnswered),
    gameOver: Boolean(data.gameOver),
    winner: data.winner ?? null,
    isUser1: data.isUser1 ?? prev?.isUser1,
  };
}

export default function NeverHaveIEverWeb({
  matchId,
  socket,
  onSendToChat,
  onUnlockWithToken,
  onBeforeUnlockPrompt,
  openForAccept,
  onOpenedForAccept,
  gameUnlockedByToken = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [unlockConfirmBusy, setUnlockConfirmBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [prompt, setPrompt] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundCompletedAtRef = useRef(0);
  const lastAnsweredPromptRef = useRef("");
  const lastKnownPointsRef = useRef({ yourPoints: 0, theirPoints: 0 });
  const isUser1Ref = useRef<boolean | null>(null);
  const modalOpenRef = useRef(false);
  modalOpenRef.current = modalOpen;

  const isUnlocked = Boolean(gameUnlockedByToken);
  const displayPrompt = prompt || state?.prompt || "";

  const mergeState = useCallback((next: GameState) => {
    if (next.isUser1 !== undefined) isUser1Ref.current = Boolean(next.isUser1);
    setState((prev) => {
      const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
      const staleRoundPrompt =
        recentRound &&
        lastAnsweredPromptRef.current.trim() !== "" &&
        next.prompt.trim() === lastAnsweredPromptRef.current.trim();
      const keptPrompt =
        staleRoundPrompt
          ? prev?.prompt ?? ""
          : recentRound && (prev?.prompt?.trim() ?? "") !== "" && !next.prompt
          ? prev?.prompt ?? next.prompt
          : next.prompt;
      const refYou = Math.max(lastKnownPointsRef.current.yourPoints, next.yourPoints);
      const refThem = Math.max(lastKnownPointsRef.current.theirPoints, next.theirPoints);
      lastKnownPointsRef.current = { yourPoints: refYou, theirPoints: refThem };
      return {
        ...next,
        prompt: keptPrompt,
        yourPoints: refYou,
        theirPoints: refThem,
        yourStrikes: refYou,
        theirStrikes: refThem,
        isUser1: next.isUser1 ?? prev?.isUser1,
      };
    });
    const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
    const staleRoundPrompt =
      recentRound &&
      lastAnsweredPromptRef.current.trim() !== "" &&
      next.prompt.trim() === lastAnsweredPromptRef.current.trim();
    if (!staleRoundPrompt && (Date.now() - lastRoundCompletedAtRef.current >= 6000 || next.prompt)) {
      setPrompt(next.prompt || "");
      if (recentRound && next.prompt.trim() && next.prompt.trim() !== lastAnsweredPromptRef.current.trim()) {
        lastAnsweredPromptRef.current = "";
      }
    }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const data = await api.get<GameState>(`/matches/${matchId}/never-have-i-ever`);
      const next = normalizeState(data, state);
      mergeState(next);
    } catch (err) {
      console.warn("Never Have I Ever fetch error:", err);
    }
  }, [matchId, mergeState, state]);

  const scheduleRoundRefetches = useCallback(() => {
    window.setTimeout(() => void fetchState(), 400);
    window.setTimeout(() => void fetchState(), 1000);
    window.setTimeout(() => void fetchState(), 2000);
    window.setTimeout(() => void fetchState(), 3500);
  }, [fetchState]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    setLoading(true);
    void fetchState().finally(() => setLoading(false));
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void fetchState(), 3000);
  }, [fetchState]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setUnlockConfirmOpen(false);
    setPrompt("");
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (waitingPollRef.current) {
      clearInterval(waitingPollRef.current);
      waitingPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!openForAccept) return;
    openModal();
    onOpenedForAccept?.();
  }, [openForAccept, openModal, onOpenedForAccept]);

  useEffect(() => {
    if (!modalOpen) return;
    const onUpdate = (payload: SocketPayload = {}) => {
      if (payload.matchId && payload.matchId !== matchId) return;

      if (payload.roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
      }

      if (payload.user1Strikes != null && payload.user2Strikes != null) {
        const isUser1 = isUser1Ref.current ?? state?.isUser1 ?? true;
        const yourPoints = isUser1 ? payload.user1Strikes : payload.user2Strikes;
        const theirPoints = isUser1 ? payload.user2Strikes : payload.user1Strikes;
        lastKnownPointsRef.current = {
          yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, yourPoints),
          theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, theirPoints),
        };
        setState((prev) =>
          prev
            ? {
                ...prev,
                yourPoints: lastKnownPointsRef.current.yourPoints,
                theirPoints: lastKnownPointsRef.current.theirPoints,
                yourStrikes: lastKnownPointsRef.current.yourPoints,
                theirStrikes: lastKnownPointsRef.current.theirPoints,
              }
            : prev
        );
      }

      if (payload.roundComplete && payload.newPrompt?.trim()) {
        lastAnsweredPromptRef.current = "";
        setPrompt(payload.newPrompt);
        setState((prev) =>
          prev
            ? {
                ...prev,
                prompt: payload.newPrompt!,
                yourAnswer: null,
                theirAnswer: null,
                bothAnswered: false,
              }
            : prev
        );
      }

      void fetchState();
      scheduleRoundRefetches();
    };

    socket?.on("never_have_i_ever_updated", onUpdate);
    return () => {
      socket?.off("never_have_i_ever_updated", onUpdate);
    };
  }, [fetchState, matchId, modalOpen, scheduleRoundRefetches, socket, state?.isUser1]);

  useEffect(() => {
    if (!modalOpen || state?.bothAnswered || state?.yourAnswer == null) return;
    const id = setInterval(() => void fetchState(), 1500);
    waitingPollRef.current = id;
    const stop = window.setTimeout(() => {
      if (waitingPollRef.current === id) {
        clearInterval(waitingPollRef.current);
        waitingPollRef.current = null;
      }
    }, 20000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      if (waitingPollRef.current === id) waitingPollRef.current = null;
    };
  }, [fetchState, modalOpen, state?.bothAnswered, state?.yourAnswer]);

  useEffect(() => {
    if (isUnlocked && !state) {
      void fetchState();
    }
  }, [fetchState, isUnlocked, state]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (waitingPollRef.current) clearInterval(waitingPollRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!modalOpen && !unlockConfirmOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen, unlockConfirmOpen]);

  useEffect(() => {
    if (!unlockConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !unlockConfirmBusy) setUnlockConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlockConfirmOpen, unlockConfirmBusy]);

  const submitSpiceChoice = async (choice: SpiceId) => {
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/spice-choice`, {
        choice,
      });
      const next = normalizeState(data, state);
      mergeState({ ...next, yourSpiceChoice: data.yourSpiceChoice ?? choice });
    } catch (err) {
      console.warn("Never Have I Ever spice choice error:", err);
      window.alert(err instanceof Error ? err.message : "Could not save your version.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnswer = async (answer: AnswerId) => {
    if (submitting || state?.yourAnswer != null || state?.gameOver) return;
    setSubmitting(true);
    lastAnsweredPromptRef.current = displayPrompt;

    if (state) {
      const optimisticYour = state.yourPoints + (answer === "have" ? 1 : 0);
      lastKnownPointsRef.current = {
        yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, optimisticYour),
        theirPoints: lastKnownPointsRef.current.theirPoints,
      };
      setState((prev) =>
        prev
          ? {
              ...prev,
              yourAnswer: answer,
              yourPoints: Math.max(prev.yourPoints, optimisticYour),
              yourStrikes: Math.max(prev.yourPoints, optimisticYour),
            }
          : prev
      );
    }

    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/answer`, {
        answer,
      });
      if (data.isUser1 !== undefined) isUser1Ref.current = Boolean(data.isUser1);

      const fromRound = data.pointsFromRound;
      const serverYour = Math.max(
        0,
        Number(fromRound?.newYourStrikes ?? data.yourPoints ?? data.yourStrikes ?? 0) || 0
      );
      const serverTheir = Math.max(
        0,
        Number(fromRound?.newTheirStrikes ?? data.theirPoints ?? data.theirStrikes ?? 0) || 0
      );
      const roundComplete = Boolean(data.roundJustCompleted || data.bothAnswered);
      const nextPrompt = data.newPrompt ?? data.prompt ?? "";

      lastKnownPointsRef.current = {
        yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, serverYour),
        theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, serverTheir),
      };

      setState((prev) => {
        const base = normalizeState(data, prev);
        return {
          ...base,
          prompt: roundComplete ? nextPrompt : nextPrompt || prev?.prompt || base.prompt,
          yourAnswer: roundComplete ? null : data.yourAnswer ?? answer,
          theirAnswer: roundComplete ? null : data.theirAnswer ?? prev?.theirAnswer ?? null,
          bothAnswered: roundComplete ? false : Boolean(data.bothAnswered),
          yourPoints: Math.max(base.yourPoints, lastKnownPointsRef.current.yourPoints),
          theirPoints: Math.max(base.theirPoints, lastKnownPointsRef.current.theirPoints),
          yourStrikes: Math.max(base.yourPoints, lastKnownPointsRef.current.yourPoints),
          theirStrikes: Math.max(base.theirPoints, lastKnownPointsRef.current.theirPoints),
        };
      });

      if (roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
        if (nextPrompt.trim()) {
          lastAnsweredPromptRef.current = "";
        }
        setPrompt(nextPrompt);
        scheduleRoundRefetches();
      } else if (nextPrompt) {
        setPrompt(nextPrompt);
      }
    } catch (err) {
      console.warn("Never Have I Ever answer error:", err);
      window.alert(err instanceof Error ? err.message : "Could not submit your answer.");
      void fetchState();
    } finally {
      setSubmitting(false);
    }
  };

  const restartGame = async () => {
    setSubmitting(true);
    try {
      const data = await api.post<GameState>(`/matches/${matchId}/never-have-i-ever/restart`, {});
      lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
      const next = normalizeState(data, null);
      mergeState(next);
    } catch (err) {
      console.warn("Never Have I Ever restart error:", err);
      void fetchState();
    } finally {
      setSubmitting(false);
    }
  };

  const handleLockedPress = async () => {
    const already = await onBeforeUnlockPrompt();
    if (already) {
      openModal();
      return;
    }
    setUnlockConfirmOpen(true);
  };

  const confirmUnlockAndPlay = async () => {
    setUnlockConfirmBusy(true);
    try {
      await onUnlockWithToken();
      setUnlockConfirmOpen(false);
      openModal();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not unlock Never Have I Ever.");
    } finally {
      setUnlockConfirmBusy(false);
    }
  };

  const handleHeaderClick = async () => {
    if (isUnlocked) {
      openModal();
      return;
    }
    await handleLockedPress();
  };

  const sendPromptToChat = async () => {
    const text = displayPrompt.trim();
    if (!text) return;
    await onSendToChat(`Never Have I Ever: ${text}`);
    try {
      await api.post(`/matches/${matchId}/never-have-i-ever/send-to-chat`, {});
    } catch (err) {
      console.warn("Never Have I Ever send-to-chat:", err);
    }
    closeModal();
  };

  const unlockOverlay =
    unlockConfirmOpen ? (
      <div className="tod-web-unlock-overlay nhie-web-unlock-overlay" role="presentation" onClick={() => !unlockConfirmBusy && setUnlockConfirmOpen(false)}>
        <div
          className="tod-web-unlock-card nhie-web-unlock-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nhie-unlock-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tod-web-unlock-shine" aria-hidden />
          <div className="tod-web-unlock-hero">
            <span className="tod-web-unlock-dice nhie-web-unlock-monkey" aria-hidden>
              🙊
            </span>
            <span className="tod-web-unlock-sparkles" aria-hidden>
              ✨
            </span>
          </div>
          <h2 id="nhie-unlock-title" className="tod-web-unlock-title">
            Play Never Have I Ever?
          </h2>
          <p className="tod-web-unlock-lead">
            You&apos;ll each pick a version, answer the same prompt, and the next prompt appears automatically once
            both of you choose <strong>I have</strong> or <strong>I haven&apos;t</strong>.
          </p>
          <div className="tod-web-unlock-flow" aria-hidden>
            <span className="tod-web-unlock-flow-step">
              <span className="tod-web-unlock-flow-num">1</span>
              Version
            </span>
            <span className="tod-web-unlock-flow-arrow">→</span>
            <span className="tod-web-unlock-flow-step">
              <span className="tod-web-unlock-flow-num">2</span>
              Answer
            </span>
          </div>
          <div className="tod-web-unlock-actions">
            <button type="button" className="tod-web-unlock-btn tod-web-unlock-btn--ghost" onClick={() => setUnlockConfirmOpen(false)} disabled={unlockConfirmBusy}>
              Not now
            </button>
            <button type="button" className="tod-web-unlock-btn tod-web-unlock-btn--primary nhie-web-unlock-primary" onClick={() => void confirmUnlockAndPlay()} disabled={unlockConfirmBusy}>
              {unlockConfirmBusy ? "Opening…" : "Unlock & play"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const gameModal =
    modalOpen ? (
      <div className="tod-web-modal-overlay" role="presentation" onClick={closeModal}>
        <div
          className="tod-web-modal nhie-web-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nhie-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tod-web-modal-gradient nhie-web-modal-gradient">
            <h2 id="nhie-modal-title" className="tod-web-modal-title">
              🙊 Never Have I Ever
            </h2>

            {loading && !state ? (
              <p className="tod-web-loading">Loading…</p>
            ) : state?.phase === "lobby" || !state?.spiceReady ? (
              <div className="tod-web-spice">
                <p className="tod-web-spice-intro">
                  Pick your version. Your match picks theirs too; the round uses the more conservative of the two.
                </p>
                <div className="tod-web-spice-grid">
                  {SPICE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tod-web-spice-card${state?.yourSpiceChoice === opt.id ? " tod-web-spice-card--active nhie-web-spice-card--active" : ""}`}
                      onClick={() => void submitSpiceChoice(opt.id)}
                      disabled={submitting}
                    >
                      <span className="tod-web-spice-card-title">{opt.title}</span>
                      <span className="tod-web-spice-card-blurb">{opt.blurb}</span>
                    </button>
                  ))}
                </div>
                <p className="tod-web-spice-status">
                  {state?.yourSpiceChoice ? (
                    <>
                      You chose <strong>{spiceLabel(state.yourSpiceChoice)}</strong>
                      {state.theirSpiceChoice ? (
                        <>
                          {" "}
                          · They chose <strong>{spiceLabel(state.theirSpiceChoice)}</strong>
                        </>
                      ) : (
                        " — waiting for your match…"
                      )}
                    </>
                  ) : (
                    "Tap a card to lock in your choice."
                  )}
                </p>
              </div>
            ) : state.gameOver ? (
              <div className="nhie-web-game-over">
                <p className="nhie-web-result-title">
                  {state.winner === "you" ? "You won" : "You're pretty freaky"}
                </p>
                <p className="nhie-web-result-copy">
                  First to 10 points loses. You: {state.yourPoints} · Them: {state.theirPoints}
                </p>
                <button type="button" className="nhie-web-primary-action" onClick={() => void restartGame()} disabled={submitting}>
                  {submitting ? "Starting…" : "Play again"}
                </button>
              </div>
            ) : (
              <>
                <p className="nhie-web-first-to-lose">First to 10 points loses</p>
                <div className="nhie-web-tally-row">
                  <div className="nhie-web-tally-box">
                    <span className="nhie-web-tally-label">You</span>
                    <span className="nhie-web-tally-value">{state.yourPoints}</span>
                  </div>
                  <span className="nhie-web-tally-vs">vs</span>
                  <div className="nhie-web-tally-box">
                    <span className="nhie-web-tally-label">Them</span>
                    <span className="nhie-web-tally-value">{state.theirPoints}</span>
                  </div>
                </div>
                <p className="tod-web-prompt-heat subtle">Playing at: {spiceLabel(state.spiceLevel)}</p>
                <div className="tod-web-prompt-card nhie-web-prompt-card">
                  <p className="tod-web-prompt-text nhie-web-prompt-text">
                    {displayPrompt || "Getting prompt…"}
                  </p>
                </div>
                {state.yourAnswer ? (
                  <p className="nhie-web-waiting">
                    You said <strong>{answerLabel(state.yourAnswer)}</strong>
                    {state.theirAnswer ? ` · They said ${answerLabel(state.theirAnswer)}` : " · waiting for them…"}
                  </p>
                ) : null}
                <div className="nhie-web-answer-row">
                  <button
                    type="button"
                    className={`nhie-web-answer nhie-web-answer--have${state.yourAnswer === "have" ? " nhie-web-answer--selected" : ""}`}
                    onClick={() => void submitAnswer("have")}
                    disabled={submitting || state.yourAnswer != null || !displayPrompt}
                  >
                    I have
                  </button>
                  <button
                    type="button"
                    className={`nhie-web-answer nhie-web-answer--havent${state.yourAnswer === "havent" ? " nhie-web-answer--selected" : ""}`}
                    onClick={() => void submitAnswer("havent")}
                    disabled={submitting || state.yourAnswer != null || !displayPrompt}
                  >
                    I haven&apos;t
                  </button>
                </div>
                <button type="button" className="tod-web-another nhie-web-send-chat" onClick={() => void sendPromptToChat()} disabled={!displayPrompt}>
                  Send prompt to chat 💬
                </button>
              </>
            )}

            <button type="button" className="tod-web-close" onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="tod-web-wrap nhie-web-wrap">
        <button
          type="button"
          className={`tod-web-header-btn nhie-web-header-btn ${isUnlocked ? "nhie-web-header-btn--live" : "tod-web-header-btn--locked"}`}
          onClick={() => void handleHeaderClick()}
          aria-label={isUnlocked ? "Open Never Have I Ever" : "Unlock Never Have I Ever"}
        >
          <span className="tod-web-header-emoji" aria-hidden>
            🙊
          </span>
        </button>
      </div>
      {typeof document !== "undefined" && unlockOverlay ? createPortal(unlockOverlay, document.body) : null}
      {typeof document !== "undefined" && gameModal ? createPortal(gameModal, document.body) : null}
    </>
  );
}
