import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api } from "../utils/api";
import MatchChatDepthGateOverlay from "./MatchChatDepthGateOverlay";
import { matchChatDepthThresholdMet } from "../utils/matchChatDepthGate";

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

/** Subset of match messages for in-game chat bubbles (same thread as main chat). */
export type NhieGameChatMessage = {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

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

const GAME_CHAT_MAX = 80;

function bubbleBody(m: NhieGameChatMessage): string {
  const t = (m.content ?? "").trim();
  if (t) return t;
  if (m.imageUrl) return "📷 Photo";
  if (m.videoUrl) return "🎥 Video";
  if (m.audioUrl) return "🎤 Voice";
  return "";
}

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
  const [messageGateOpen, setMessageGateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [gameChatDraft, setGameChatDraft] = useState("");
  const [gameChatSending, setGameChatSending] = useState(false);
  const [inactiveNotice, setInactiveNotice] = useState<string | null>(null);
  const [compactGameLayout, setCompactGameLayout] = useState(false);
  const [gameChatPanelOpen, setGameChatPanelOpen] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRoundCompletedAtRef = useRef(0);
  const lastAnsweredPromptRef = useRef("");
  const lastKnownPointsRef = useRef({ yourPoints: 0, theirPoints: 0 });
  const isUser1Ref = useRef<boolean | null>(null);
  const modalOpenRef = useRef(false);
  modalOpenRef.current = modalOpen;
  const promptLockedUntilRef = useRef(0);
  const gameChatEndRef = useRef<HTMLDivElement | null>(null);
  const gameChatTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gameChatTypingActiveRef = useRef(false);
  const gameChatTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUnlocked = !!gameUnlockedByToken;
  const displayPrompt = prompt || state?.prompt || "";

  const nhieEligible =
    Boolean(currentUserId && chatPartnerUserId) &&
    matchChatDepthThresholdMet(messages, currentUserId as string, chatPartnerUserId as string);

  const stopGameChatTyping = useCallback(() => {
    if (gameChatTypingTimeoutRef.current) {
      clearTimeout(gameChatTypingTimeoutRef.current);
      gameChatTypingTimeoutRef.current = null;
    }
    if (gameChatTypingActiveRef.current) {
      socket?.emit("stop_typing", { matchId });
      gameChatTypingActiveRef.current = false;
    }
  }, [socket, matchId]);

  const pulseGameChatTypingFromValue = useCallback(
    (value: string) => {
      if (!socket || !modalOpenRef.current) return;
      const trimmed = value.trim();
      if (!trimmed) {
        stopGameChatTyping();
        return;
      }
      if (!gameChatTypingActiveRef.current) {
        socket.emit("typing", { matchId });
        gameChatTypingActiveRef.current = true;
      }
      if (gameChatTypingTimeoutRef.current) clearTimeout(gameChatTypingTimeoutRef.current);
      gameChatTypingTimeoutRef.current = setTimeout(() => {
        socket.emit("stop_typing", { matchId });
        gameChatTypingActiveRef.current = false;
        gameChatTypingTimeoutRef.current = null;
      }, 3000);
    },
    [socket, matchId, stopGameChatTyping]
  );

  const sortedGameChat = useMemo(() => {
    const rows = gameChatMessages
      .filter((m) => Boolean(bubbleBody(m)))
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    return rows.length > GAME_CHAT_MAX ? rows.slice(-GAME_CHAT_MAX) : rows;
  }, [gameChatMessages]);

  useLayoutEffect(() => {
    if (!modalOpen) return;
    gameChatEndRef.current?.scrollIntoView({ block: "end" });
  }, [modalOpen, sortedGameChat]);

  const sendGameChatMessage = async () => {
    const text = gameChatDraft.trim();
    if (!text || !currentUserId || gameChatSending || sendingMessage) return;
    setGameChatSending(true);
    setGameChatDraft("");
    try {
      const ok = await onSendToChat(text);
      if (ok === false) setGameChatDraft(text);
    } finally {
      setGameChatSending(false);
      stopGameChatTyping();
    }
  };

  useEffect(() => {
    setModalOpen(false);
    setLoading(false);
    setSubmitting(false);
    setState(null);
    setPrompt("");
    setGameChatDraft("");
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

  useEffect(() => {
    return () => {
      if (gameChatTypingTimeoutRef.current) {
        clearTimeout(gameChatTypingTimeoutRef.current);
        gameChatTypingTimeoutRef.current = null;
      }
      if (gameChatTypingActiveRef.current) {
        socket?.emit("stop_typing", { matchId });
        gameChatTypingActiveRef.current = false;
      }
    };
  }, [matchId, socket]);

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
    stopGameChatTyping();
    setModalOpen(false);
    setPrompt("");
    setGameChatDraft("");
    lastAnsweredPromptRef.current = "";
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (waitingPollRef.current) {
      clearInterval(waitingPollRef.current);
      waitingPollRef.current = null;
    }
  }, [stopGameChatTyping]);

  useEffect(() => {
    if (!inactiveNotice) return;
    const t = window.setTimeout(() => setInactiveNotice(null), 8000);
    return () => clearTimeout(t);
  }, [inactiveNotice]);

  useEffect(() => {
    if (!modalOpen) {
      stopGameChatTyping();
      setInactiveNotice(null);
      return;
    }
    const mq = window.matchMedia("(max-width: 720px)");
    setCompactGameLayout(mq.matches);
    setGameChatPanelOpen(!mq.matches);
  }, [modalOpen, stopGameChatTyping]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => {
      const c = mq.matches;
      setCompactGameLayout(c);
      if (!c) setGameChatPanelOpen(true);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!modalOpen || !compactGameLayout || !gameChatPanelOpen) return;
    requestAnimationFrame(() => gameChatTextareaRef.current?.focus());
  }, [modalOpen, compactGameLayout, gameChatPanelOpen]);

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

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

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
    if (
      !window.confirm(
        "Unlock Never Have I Ever for this match? This uses a Mulligan token so you can play together."
      )
    ) {
      return;
    }
    try {
      await onUnlockWithToken();
      openModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not unlock the game.";
      window.alert(msg);
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

  const showGameChatRoot = Boolean(state && currentUserId);
  const showEmbeddedGameChat = showGameChatRoot && (!compactGameLayout || gameChatPanelOpen);
  const showGameChatFab = showGameChatRoot && compactGameLayout && !gameChatPanelOpen;

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
                <button type="button" className="tod-web-another nhie-web-send-chat" onClick={() => void sendPromptToChat()} disabled={!displayPrompt}>
                  Send prompt to chat 💬
                </button>
              </>
            )}

            {showEmbeddedGameChat ? (
              <div
                className={`nhie-web-game-chat${compactGameLayout && gameChatPanelOpen ? " nhie-web-game-chat--sheet" : ""}`}
                role="region"
                aria-label="Messages with your match"
              >
                {compactGameLayout && gameChatPanelOpen ? (
                  <div className="nhie-web-game-chat-toolbar">
                    <span className="nhie-web-game-chat-toolbar-title">In-game chat</span>
                    <button
                      type="button"
                      className="nhie-web-game-chat-minimize"
                      onClick={() => setGameChatPanelOpen(false)}
                      aria-label="Hide chat and keep playing"
                    >
                      Hide
                    </button>
                  </div>
                ) : null}
                {compactGameLayout && gameChatPanelOpen ? (
                  <p className="nhie-web-game-chat-toolbar-hint">Message each other here while you play — same thread as your match chat.</p>
                ) : null}
                {!(compactGameLayout && gameChatPanelOpen) ? (
                  <p className="nhie-web-game-chat-label">Message your match while you play</p>
                ) : null}
                {partnerIsTyping ? (
                  <p className="nhie-web-game-chat-typing" aria-live="polite">
                    {partnerDisplayName} is typing…
                  </p>
                ) : null}
                <div className="nhie-web-game-chat-scroll">
                  {sortedGameChat.length === 0 ? (
                    <p className="nhie-web-game-chat-empty">No messages here yet — say something without leaving the game.</p>
                  ) : (
                    sortedGameChat.map((m, idx) => {
                      const mine = m.senderId === currentUserId;
                      const body = bubbleBody(m);
                      const prev = idx > 0 ? sortedGameChat[idx - 1] : null;
                      const senderFlip = prev != null && prev.senderId !== m.senderId;
                      const senderLabel = mine ? "You" : m.senderName || partnerDisplayName || "Match";
                      return (
                        <div
                          key={m.id}
                          className={`nhie-web-game-chat-row${mine ? " nhie-web-game-chat-row--mine" : " nhie-web-game-chat-row--theirs"}${senderFlip ? " nhie-web-game-chat-row--sender-gap" : ""}`}
                        >
                          <div
                            className={`nhie-web-game-chat-bubble${mine ? " nhie-web-game-chat-bubble--mine" : " nhie-web-game-chat-bubble--theirs"}`}
                          >
                            <span
                              className={`nhie-web-game-chat-who${mine ? " nhie-web-game-chat-who--mine" : " nhie-web-game-chat-who--theirs"}`}
                            >
                              {senderLabel}
                            </span>
                            <span className="nhie-web-game-chat-text">{body}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={gameChatEndRef} aria-hidden />
                </div>
                <div className="nhie-web-game-chat-composer">
                  <textarea
                    ref={gameChatTextareaRef}
                    className="nhie-web-game-chat-input"
                    rows={2}
                    maxLength={1000}
                    placeholder="Type a message…"
                    value={gameChatDraft}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGameChatDraft(v);
                      pulseGameChatTypingFromValue(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendGameChatMessage();
                      }
                    }}
                    disabled={gameChatSending || sendingMessage}
                    aria-label="Message to your match"
                  />
                  <button
                    type="button"
                    className="nhie-web-game-chat-send"
                    onClick={() => void sendGameChatMessage()}
                    disabled={gameChatSending || sendingMessage || !gameChatDraft.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : null}

            <button type="button" className="tod-web-close" onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
        {showGameChatFab ? (
          <button
            type="button"
            className="nhie-web-game-chat-fab"
            title="Open in-game chat — message your match without leaving Never Have I Ever"
            aria-label="Open in-game chat to message your match while playing Never Have I Ever"
            onClick={(e) => {
              e.stopPropagation();
              setGameChatPanelOpen(true);
            }}
          >
            <span className="nhie-web-game-chat-fab-inner">
              <span className="nhie-web-game-chat-fab-emoji" aria-hidden>
                💬
              </span>
              <span className="nhie-web-game-chat-fab-caption">Game chat</span>
            </span>
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div className="tod-web-wrap nhie-web-wrap">
        <button
          type="button"
          className="tod-web-header-btn nhie-web-header-btn"
          onClick={() => void handleHeaderClick()}
          aria-label={isUnlocked ? "Open Never Have I Ever" : "Unlock Never Have I Ever"}
        >
          <span className="tod-web-header-emoji" aria-hidden>
            🙊
          </span>
        </button>
      </div>
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
