import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api } from "../utils/api";
import MatchChatDepthGateOverlay from "./MatchChatDepthGateOverlay";
import MatchInGameChatPanel, { type MatchGameChatMessage } from "./MatchInGameChatPanel";
import { matchChatDepthThresholdMet } from "../utils/matchChatDepthGate";
import { useBodyScrollLock } from "../utils/bodyScrollLock";

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
  roundId?: string | null;
  roundJustCompleted?: boolean;
  newPrompt?: string;
  pointsFromRound?: { newYourStrikes?: number; newTheirStrikes?: number };
  inactiveReset?: boolean;
};

type SocketPayload = {
  matchId?: string;
  newPrompt?: string;
  roundId?: string | null;
  roundComplete?: boolean;
  roundReset?: boolean;
  inactiveReset?: boolean;
  user1Strikes?: number;
  user2Strikes?: number;
};

/** @deprecated Use MatchGameChatMessage from MatchInGameChatPanel */
export type NhieGameChatMessage = MatchGameChatMessage;

type Props = {
  matchId: string;
  socket: Socket | null;
  /** Return false if the send failed (caller may restore draft text). */
  onSendToChat: (text: string) => Promise<boolean | void>;
  gameChatMessages?: NhieGameChatMessage[];
  currentUserId?: string | null;
  sendingMessage?: boolean;
  partnerDisplayName?: string;
  partnerIsTyping?: boolean;
  onUnlockWithToken?: () => Promise<void>;
  onBeforeUnlockPrompt?: () => Promise<boolean>;
  openForAccept?: boolean;
  onOpenedForAccept?: () => void;
  gameUnlockedByToken?: boolean;
  /** Required for unlock eligibility (7 messages each) */
  messages?: Array<{ senderId: string }>;
  chatPartnerUserId?: string;
};

const SPICE_OPTIONS: { id: SpiceId; title: string; blurb: string }[] = [
  {
    id: "pg13",
    title: "PG-13",
    blurb: "Grown-up confessions — witty, sharp, and emotionally real.",
  },
  {
    id: "ratedr",
    title: "Rated R",
    blurb: "Mature audience: suggestive stories, tension, and real chemistry.",
  },
  {
    id: "spicy",
    title: "Spicy",
    blurb: "Maximum heat — bold, seductive, almost edgy (still app-safe).",
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
  const gameOver = Boolean(data.gameOver) || yourPoints >= 10 || theirPoints >= 10;
  const winner =
    data.winner ??
    (gameOver
      ? theirPoints >= 10 && yourPoints < 10
        ? "you"
        : yourPoints >= 10 && theirPoints < 10
          ? "them"
          : null
      : null);
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
    gameOver,
    winner,
    isUser1: data.isUser1 ?? prev?.isUser1,
    roundId: data.roundId ?? prev?.roundId ?? null,
    inactiveReset: Boolean(data.inactiveReset),
  };
}

export default function NeverHaveIEverWeb({
  matchId,
  socket,
  onSendToChat,
  gameChatMessages = [],
  currentUserId = null,
  sendingMessage = false,
  partnerDisplayName = "Them",
  partnerIsTyping = false,
  onUnlockWithToken,
  onBeforeUnlockPrompt,
  openForAccept,
  onOpenedForAccept,
  gameUnlockedByToken = false,
  messages = [],
  chatPartnerUserId,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [unlockConfirmBusy, setUnlockConfirmBusy] = useState(false);
  const [messageGateOpen, setMessageGateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [inactiveNotice, setInactiveNotice] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundCompletedAtRef = useRef(0);
  const lastAnsweredPromptRef = useRef("");
  const lastKnownPointsRef = useRef({ yourPoints: 0, theirPoints: 0 });
  const isUser1Ref = useRef<boolean | null>(null);
  const modalOpenRef = useRef(false);
  modalOpenRef.current = modalOpen;
  const promptLockedUntilRef = useRef(0);
  const isUnlocked = !!gameUnlockedByToken;
  const displayPrompt = prompt || state?.prompt || "";

  const nhieEligible =
    Boolean(currentUserId && chatPartnerUserId) &&
    matchChatDepthThresholdMet(messages, currentUserId as string, chatPartnerUserId as string);

  useEffect(() => {
    setModalOpen(false);
    setLoading(false);
    setSubmitting(false);
    setState(null);
    setPrompt("");
    lastRoundCompletedAtRef.current = 0;
    lastAnsweredPromptRef.current = "";
    lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
    isUser1Ref.current = null;
    promptLockedUntilRef.current = 0;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (waitingPollRef.current) {
      clearInterval(waitingPollRef.current);
      waitingPollRef.current = null;
    }
  }, [matchId]);

  const gameOver = !!state && (state.gameOver || state.yourPoints >= 10 || state.theirPoints >= 10);
  const gameResultTitle = (() => {
    if (!state) return "";
    if (state.winner === "you") return "You won";
    if (state.winner === "them") return "You're pretty freaky";
    if (state.theirPoints >= 10 && state.yourPoints < 10) return "You won";
    if (state.yourPoints >= 10 && state.theirPoints < 10) return "You're pretty freaky";
    if (state.yourPoints >= 10 && state.theirPoints >= 10) return "Game over";
    return "Game over";
  })();
  const gameResultCopy = (() => {
    if (!state) return "";
    if (gameResultTitle === "You won") return `They hit 10 points first. You: ${state.yourPoints} · Them: ${state.theirPoints}`;
    if (gameResultTitle === "You're pretty freaky") return `You hit 10 points first. You: ${state.yourPoints} · Them: ${state.theirPoints}`;
    return `First to 10 points loses. You: ${state.yourPoints} · Them: ${state.theirPoints}`;
  })();

  const mergeState = useCallback((next: GameState) => {
    if (next.isUser1 !== undefined) isUser1Ref.current = Boolean(next.isUser1);
    if (next.inactiveReset) {
      lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
      setInactiveNotice("Game restarted — someone was away for a while.");
    }
    setState((prev) => {
      const recentRound = Date.now() - lastRoundCompletedAtRef.current < 6000;
      const promptLocked = Date.now() < promptLockedUntilRef.current;
      const resetToZero =
        next.inactiveReset ||
        (next.yourPoints === 0 &&
          next.theirPoints === 0 &&
          ((prev?.gameOver ?? false) || (prev?.yourPoints ?? 0) >= 10 || (prev?.theirPoints ?? 0) >= 10));
      const staleRoundPrompt =
        recentRound &&
        lastAnsweredPromptRef.current.trim() !== "" &&
        next.prompt.trim() === lastAnsweredPromptRef.current.trim();
      const keptPrompt =
        promptLocked && prev?.prompt
          ? prev.prompt
          : staleRoundPrompt
            ? prev?.prompt ?? ""
            : recentRound && (prev?.prompt?.trim() ?? "") !== "" && !next.prompt
            ? prev?.prompt ?? next.prompt
            : next.prompt;
      const refYou = resetToZero ? 0 : Math.max(lastKnownPointsRef.current.yourPoints, next.yourPoints);
      const refThem = resetToZero ? 0 : Math.max(lastKnownPointsRef.current.theirPoints, next.theirPoints);
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
    const promptLocked = Date.now() < promptLockedUntilRef.current;
    const staleRoundPrompt =
      recentRound &&
      lastAnsweredPromptRef.current.trim() !== "" &&
      next.prompt.trim() === lastAnsweredPromptRef.current.trim();
    if (!promptLocked && !staleRoundPrompt && (Date.now() - lastRoundCompletedAtRef.current >= 6000 || next.prompt)) {
      setPrompt(next.prompt || "");
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
    setPrompt("");
    lastAnsweredPromptRef.current = "";
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
    if (!inactiveNotice) return;
    const t = window.setTimeout(() => setInactiveNotice(null), 8000);
    return () => clearTimeout(t);
  }, [inactiveNotice]);

  useEffect(() => {
    if (!modalOpen) setInactiveNotice(null);
  }, [modalOpen]);

  useEffect(() => {
    if (!openForAccept) return;
    openModal();
    onOpenedForAccept?.();
  }, [openForAccept, openModal, onOpenedForAccept]);

  useEffect(() => {
    if (!modalOpen) return;
    const onUpdate = (payload: SocketPayload = {}) => {
      if (payload.matchId && payload.matchId !== matchId) return;

      if (payload.inactiveReset) {
        setInactiveNotice("Game restarted — someone was away for a while.");
        lastKnownPointsRef.current = { yourPoints: 0, theirPoints: 0 };
      }

      if (payload.roundComplete) {
        lastRoundCompletedAtRef.current = Date.now();
      }

      if (payload.user1Strikes != null && payload.user2Strikes != null) {
        const isUser1 = isUser1Ref.current ?? state?.isUser1 ?? true;
        const yourPoints = isUser1 ? payload.user1Strikes : payload.user2Strikes;
        const theirPoints = isUser1 ? payload.user2Strikes : payload.user1Strikes;
        const nextPoints = payload.roundReset || payload.inactiveReset
          ? { yourPoints, theirPoints }
          : {
              yourPoints: Math.max(lastKnownPointsRef.current.yourPoints, yourPoints),
              theirPoints: Math.max(lastKnownPointsRef.current.theirPoints, theirPoints),
            };
        lastKnownPointsRef.current = nextPoints;
        setState((prev) =>
          prev
            ? {
                ...prev,
                yourPoints: nextPoints.yourPoints,
                theirPoints: nextPoints.theirPoints,
                yourStrikes: nextPoints.yourPoints,
                theirStrikes: nextPoints.theirPoints,
                gameOver: payload.roundReset ? false : prev.gameOver,
              }
            : prev
        );
      }

      if (payload.roundComplete && payload.newPrompt?.trim()) {
        setPrompt(payload.newPrompt);
        promptLockedUntilRef.current = Date.now() + 5000;
        setState((prev) =>
          prev
            ? {
                ...prev,
                prompt: payload.newPrompt!,
                roundId: payload.roundId ?? prev.roundId ?? null,
                yourAnswer: null,
                theirAnswer: null,
                bothAnswered: false,
                gameOver: payload.roundReset ? false : prev.gameOver,
              }
            : prev
        );
        return;
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
  }, [fetchState, matchId, modalOpen, state?.bothAnswered, state?.yourAnswer]);

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

  useBodyScrollLock(modalOpen || unlockConfirmOpen);

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
        roundId: state?.roundId ?? null,
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
          roundId: data.roundId ?? base.roundId ?? prev?.roundId ?? null,
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
        setPrompt(nextPrompt.trim() ? nextPrompt : "");
        if (nextPrompt.trim()) {
          promptLockedUntilRef.current = Date.now() + 5000;
        } else {
          scheduleRoundRefetches();
        }
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
    if (!nhieEligible) {
      setMessageGateOpen(true);
      return;
    }
    const already = (await onBeforeUnlockPrompt?.()) ?? false;
    if (already) {
      openModal();
      return;
    }
    if (!onUnlockWithToken) return;
    setUnlockConfirmOpen(true);
  };

  const closeUnlockConfirm = () => {
    if (!unlockConfirmBusy) setUnlockConfirmOpen(false);
  };

  const confirmUnlockAndPlay = async () => {
    if (!onUnlockWithToken) return;
    setUnlockConfirmBusy(true);
    try {
      await onUnlockWithToken();
      setUnlockConfirmOpen(false);
      openModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start the game.";
      window.alert(msg);
    } finally {
      setUnlockConfirmBusy(false);
    }
  };

  const handleHeaderClick = async () => {
    if (!nhieEligible) {
      setMessageGateOpen(true);
      return;
    }
    if (isUnlocked) {
      openModal();
      return;
    }
    await handleLockedPress();
  };

  const showGameChat = Boolean(state && currentUserId);

  const unlockOverlay = unlockConfirmOpen ? (
    <div className="tod-web-unlock-overlay nhie-web-unlock-overlay" role="presentation" onClick={closeUnlockConfirm}>
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
          You&apos;ll each pick a <strong>spice level</strong> (we use the more conservative of the two), then
          answer <strong>Have</strong> or <strong>Haven&apos;t</strong> — first to 10 points loses. Same flow as in
          the app.
        </p>
        <div className="tod-web-unlock-flow" aria-hidden>
          <span className="tod-web-unlock-flow-step">
            <span className="tod-web-unlock-flow-num">1</span>
            Spice
          </span>
          <span className="tod-web-unlock-flow-arrow">→</span>
          <span className="tod-web-unlock-flow-step">
            <span className="tod-web-unlock-flow-num">2</span>
            Play
          </span>
        </div>
        <div className="tod-web-unlock-chips" role="list">
          {SPICE_OPTIONS.map((opt) => (
            <span key={opt.id} className="tod-web-unlock-chip" role="listitem">
              {opt.title}
            </span>
          ))}
        </div>
        <div className="tod-web-unlock-actions">
          <button
            type="button"
            className="tod-web-unlock-btn tod-web-unlock-btn--ghost"
            onClick={closeUnlockConfirm}
            disabled={unlockConfirmBusy}
          >
            Not now
          </button>
          <button
            type="button"
            className="tod-web-unlock-btn tod-web-unlock-btn--primary nhie-web-unlock-primary"
            onClick={() => void confirmUnlockAndPlay()}
            disabled={unlockConfirmBusy}
          >
            {unlockConfirmBusy ? "Starting…" : "Let's play"}
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

            {inactiveNotice ? (
              <p className="nhie-web-inactive-notice" role="status">
                {inactiveNotice}
              </p>
            ) : null}

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
            ) : gameOver ? (
              <div className="nhie-web-game-over">
                <p className="nhie-web-result-title">{gameResultTitle}</p>
                <p className="nhie-web-result-copy">{gameResultCopy}</p>
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
              </>
            )}

            {showGameChat ? (
              <MatchInGameChatPanel
                matchId={matchId}
                socket={socket}
                messages={gameChatMessages}
                currentUserId={currentUserId}
                partnerDisplayName={partnerDisplayName}
                partnerIsTyping={partnerIsTyping}
                sendingMessage={sendingMessage}
                onSendToChat={onSendToChat}
                visible={showGameChat}
                gameLabel="Never Have I Ever"
              />
            ) : null}

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
          className="tod-web-header-btn nhie-web-header-btn"
          onClick={() => void handleHeaderClick()}
          aria-label={isUnlocked ? "Open Never Have I Ever" : "Play Never Have I Ever"}
        >
          <span className="tod-web-header-emoji" aria-hidden>
            🙊
          </span>
        </button>
      </div>
      {typeof document !== "undefined" && unlockOverlay ? createPortal(unlockOverlay, document.body) : null}
      {typeof document !== "undefined" && gameModal ? createPortal(gameModal, document.body) : null}
      {typeof document !== "undefined" && currentUserId ? (
        createPortal(
          <MatchChatDepthGateOverlay
            open={messageGateOpen}
            onClose={() => setMessageGateOpen(false)}
            feature="never_have_i_ever"
            messages={messages}
            currentUserId={currentUserId}
            chatPartnerUserId={chatPartnerUserId}
          />,
          document.body
        )
      ) : null}
    </>
  );
}
