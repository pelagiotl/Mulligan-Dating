import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { api } from "../utils/api";

const TRUTH_PROMPTS = [
  "What's the one thing that would make you actually stop scrolling?",
  "What's your non-negotiable when you're really into someone?",
  "What's the boldest thing you've ever said to someone you wanted?",
  "What would make you break your own rules for someone?",
  "What's the first thing you notice when you're attracted — and you can't say eyes?",
  "What's your idea of a perfect first date when you're both fully present?",
  "What's something you'd only admit to someone you're actually into?",
  "What's the best compliment you've gotten that actually made you feel something?",
  "What's your dealbreaker that nobody talks about?",
  "What would make you cancel other plans just to see them?",
  "What's the most underrated green flag in someone?",
  "What's something you find attractive that most people don't mention?",
  "What would make you want a second date before the first one's even over?",
  "What's your love language when it comes to showing you're into someone?",
  "What's the line you'd use to ask someone out in person — no filter?",
];

const DARE_PROMPTS = [
  "Send a voice note: one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés allowed",
  "Send a selfie with the look you give when you're actually interested",
  "Send a 5–10 sec video saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to shoot your shot in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Describe your ideal first date in 3 emojis",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them — be specific",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Send a quick video of your reaction to something that made you laugh today",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break the tension on a date",
  "Send a 5-second video saying one thing you'd want to do on a first date",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTimeRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface GameState {
  yourSpiceChoice: "pg13" | "ratedr" | "spicy" | null;
  theirSpiceChoice: "pg13" | "ratedr" | "spicy" | null;
  spiceReady: boolean;
  spiceLevel: "pg13" | "ratedr" | "spicy" | null;
  tokenUnlocked?: boolean;
  needsSpiceChoiceFromUnlocker?: boolean;
  currentPrompt?: string | null;
  currentPromptType?: "truth" | "dare" | null;
  unlockedUntil?: string | null;
}

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

export default function TruthOrDareWeb({
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
  const [step, setStep] = useState<"choose" | "prompt">("choose");
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState<"truth" | "dare">("truth");
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [headerTimerSecs, setHeaderTimerSecs] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnotherOneAtRef = useRef(0);
  const lastChooseAtRef = useRef(0);
  const intendedPromptTypeRef = useRef<"truth" | "dare" | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  const lastUnlockedUntilRef = useRef<string | null>(null);

  const isUnlocked = !!gameUnlockedByToken;

  const fetchState = useCallback(async () => {
    try {
      const data = await api.get<GameState>(`/matches/${matchId}/truth-or-dare/state`);
      setGameState((prev) => ({ ...prev, ...data, spiceLevel: "pg13", spiceReady: true }));
      const recentlyRequestedAnother = Date.now() - lastAnotherOneAtRef.current < 5000;
      const recentlyChose = Date.now() - lastChooseAtRef.current < 8000;
      const alreadyShowingPrompt = stepRef.current === "prompt";
      if (recentlyRequestedAnother && alreadyShowingPrompt) {
        setLoading(false);
        return;
      }
      if (recentlyChose && intendedPromptTypeRef.current != null) {
        setStep("prompt");
        setLoading(false);
        return;
      }
      if (recentlyRequestedAnother && data.currentPrompt && data.currentPromptType) {
        setPromptType(data.currentPromptType);
        setStep("prompt");
        setLoading(false);
        return;
      }
      if (alreadyShowingPrompt) return;
      setStep("choose");
    } catch (err) {
      console.warn("Truth or Dare fetch state error:", err);
    }
  }, [matchId]);

  useEffect(() => {
    if (!openForAccept) return;
    setStep("choose");
    setPrompt("");
    setModalOpen(true);
    setLoading(true);
    void fetchState().finally(() => setLoading(false));
    onOpenedForAccept?.();
  }, [openForAccept, fetchState, onOpenedForAccept]);

  useEffect(() => {
    if (!modalOpen) return;
    const onUpdate = () => {
      if (Date.now() - lastAnotherOneAtRef.current < 6000) return;
      void fetchState();
    };
    socket?.on("truth_or_dare_updated", onUpdate);
    return () => {
      socket?.off("truth_or_dare_updated", onUpdate);
    };
  }, [modalOpen, socket, fetchState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const untilStr = gameState?.unlockedUntil ?? lastUnlockedUntilRef.current;
  if (gameState?.unlockedUntil) lastUnlockedUntilRef.current = gameState.unlockedUntil;

  useEffect(() => {
    if (!untilStr) {
      if (!modalOpen) setSecondsRemaining(null);
      return;
    }
    const tick = () => {
      const until = new Date(untilStr);
      const now = new Date();
      const secs = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 1000));
      if (modalOpen) setSecondsRemaining(secs);
      if (isUnlocked) setHeaderTimerSecs(secs);
      if (secs <= 0 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        lastUnlockedUntilRef.current = null;
        setHeaderTimerSecs(0);
        void fetchState();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [modalOpen, untilStr, isUnlocked, fetchState]);

  const openModal = () => {
    setStep("choose");
    setPrompt("");
    setModalOpen(true);
    setLoading(true);
    void fetchState().finally(() => setLoading(false));
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void fetchState(), 3000);
  };

  const closeModal = () => {
    setModalOpen(false);
    setStep("choose");
    setPrompt("");
    setGameState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleChoose = async (type: "truth" | "dare", anotherOne = false) => {
    lastChooseAtRef.current = Date.now();
    intendedPromptTypeRef.current = type;
    if (anotherOne) {
      lastAnotherOneAtRef.current = Date.now();
    }
    setPromptType(type);
    setStep("prompt");
    setLoading(true);
    setPrompt("");
    await new Promise((r) => setTimeout(r, 0));

    let finalPrompt = "";
    try {
      const data = await api.post<{ prompt: string }>(`/matches/${matchId}/truth-or-dare`, {
        type,
        anotherOne,
      });
      if (data?.prompt) {
        finalPrompt = data.prompt;
        setPrompt(finalPrompt);
        lastAnotherOneAtRef.current = Date.now();
      } else {
        throw new Error("No prompt returned");
      }
    } catch {
      const list = type === "truth" ? TRUTH_PROMPTS : DARE_PROMPTS;
      finalPrompt = pickRandom(list);
      setPrompt(finalPrompt);
      lastAnotherOneAtRef.current = Date.now();
    } finally {
      setLoading(false);
      setTimeout(() => {
        intendedPromptTypeRef.current = null;
      }, 8000);
    }
  };

  const handleSendToChat = async () => {
    if (prompt) {
      const prefix = promptType === "truth" ? "Truth: " : "Dare: ";
      await onSendToChat(`${prefix}${prompt}`);
      try {
        await api.post(`/matches/${matchId}/truth-or-dare/send-to-chat`, {});
      } catch (e) {
        console.warn("Truth or Dare send-to-chat:", e);
      }
    }
    closeModal();
  };

  const handleLockedPress = async () => {
    const already = await onBeforeUnlockPrompt();
    if (already) {
      openModal();
      return;
    }
    const play = window.confirm(
      "Play Truth or Dare? Pick Truth or Dare, then you can send the prompt to chat. (Uses the same game session as the app.)"
    );
    if (!play) return;
    try {
      await onUnlockWithToken();
      openModal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not unlock the game.";
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

  useEffect(() => {
    if (isUnlocked && !lastUnlockedUntilRef.current) {
      void fetchState();
    }
  }, [isUnlocked, fetchState]);

  const sessionExpired = gameState?.tokenUnlocked && secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <div className="tod-web-wrap">
      <button
        type="button"
        className={`tod-web-header-btn ${isUnlocked ? "tod-web-header-btn--live" : "tod-web-header-btn--locked"}`}
        onClick={() => void handleHeaderClick()}
        aria-label={isUnlocked ? "Open Truth or Dare" : "Unlock Truth or Dare"}
      >
        <span className="tod-web-header-emoji" aria-hidden>
          🎲
        </span>
      </button>
      {isUnlocked && headerTimerSecs !== null && headerTimerSecs > 0 && (
        <span className="tod-web-timer-badge">⏱ {formatTimeRemaining(headerTimerSecs)}</span>
      )}

      {modalOpen ? (
        <div
          className="tod-web-modal-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="tod-web-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tod-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tod-web-modal-gradient">
              <h2 id="tod-modal-title" className="tod-web-modal-title">
                {step === "choose" ? "Pick one" : promptType === "truth" ? "✨ Truth" : "🔥 Dare"}
              </h2>
              {gameState?.unlockedUntil && secondsRemaining !== null && secondsRemaining > 0 && (
                <div className="tod-web-session-timer">
                  <span className="tod-web-session-label">Session time left</span>
                  <span className="tod-web-session-value">⏱ {formatTimeRemaining(secondsRemaining)}</span>
                </div>
              )}
              {sessionExpired ? (
                <p className="tod-web-expired">
                  Session ended. Unlock again from the dice button to play another round.
                </p>
              ) : loading && step === "choose" ? (
                <p className="tod-web-loading">Loading…</p>
              ) : step === "choose" ? (
                <div className="tod-web-choose">
                  <p className="tod-web-choose-hint">Pick Truth or Dare</p>
                  <div className="tod-web-choose-row">
                    <button type="button" className="tod-web-choice tod-web-choice--truth" onClick={() => void handleChoose("truth")}>
                      <span className="tod-web-choice-emoji">✨</span>
                      Truth
                    </button>
                    <button type="button" className="tod-web-choice tod-web-choice--dare" onClick={() => void handleChoose("dare")}>
                      <span className="tod-web-choice-emoji">🔥</span>
                      Dare
                    </button>
                  </div>
                </div>
              ) : loading ? (
                <p className="tod-web-loading">Generating your prompt…</p>
              ) : (
                <>
                  <div className="tod-web-prompt-card">
                    <p className="tod-web-prompt-text">{prompt}</p>
                  </div>
                  <div className="tod-web-prompt-actions">
                    <button type="button" className="tod-web-send-chat" onClick={() => void handleSendToChat()}>
                      Send to chat 💬
                    </button>
                    <button type="button" className="tod-web-another" onClick={() => void handleChoose(promptType, true)}>
                      Another one ↻
                    </button>
                  </div>
                </>
              )}
              <button type="button" className="tod-web-close" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
