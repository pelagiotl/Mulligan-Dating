import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { api, ApiError } from "../utils/api";

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
  "How do you tell the difference between chemistry and just liking the idea of someone?",
  "When do you know you're catching feelings versus keeping it casual?",
  "What's something people consistently misread about you from your profile or photos?",
  "What's your tell that you're nervous on a date — even when you're playing it cool?",
  "What would make you trust someone faster than you usually do?",
];

const DARE_PROMPTS = [
  "Send a voice note: one thing that would make me want to meet you",
  "Describe your type in 3 words — no clichés allowed",
  "Send a selfie with the look you give when you're actually interested",
  "Send a 5–10 sec video saying hi and one thing you're looking forward to",
  "Reply with the line you'd use to shoot your shot in person",
  "Send a pic of what you're doing rn with a one-line that says something real about you",
  "Send a selfie — flirty or unapologetically you",
  "Reply with 3 words that describe your vibe when you're into someone",
  "Voice note: one thing you find attractive about them — be specific",
  "Send a selfie that shows your actual smile, not the camera smile",
  "Reply with a question you've always wanted to ask a match but never have",
  "Send a selfie from an angle you like with a one-word caption",
  "Voice note: the boldest thing you'd say to break the tension on a date",
  "Reply with one green flag you've already noticed about them",
  "Voice note: one standard you hold people to on dates that isn't in your bio",
  "Send a selfie that matches how you feel after a conversation that actually went somewhere",
  "Reply with the honest reason you're still on the apps — one sentence",
  "Send a 5-second video: nod once if you'd rather skip small talk and go straight to real talk",
];

const TRUTH_PROMPTS_R = [
  "What's the wildest thing you've done on a first date?",
  "Have you ever hooked up with someone you barely knew?",
  "What's a fantasy you've never told anyone out loud?",
  "When did you last send a text you regretted the next morning?",
  "What's your biggest turn-on that isn't physical?",
  "Have you ever caught feelings during something you swore was casual?",
  "What's your honest line between flirting and leading someone on?",
];

const TRUTH_PROMPTS_SPICY = [
  "What kind of text from a match actually makes you weak?",
  "What's a kink or dynamic you've only admitted after a few drinks?",
  "What's the most shameless thing you've done to keep someone's attention?",
  "Describe the last time chemistry hit you like a truck — no names, just the feeling.",
  "What's a fantasy that's stayed in your head because you've never found the right person?",
  "What would make you break your 'I don't do that on apps' rule?",
];

const DARE_PROMPTS_R = [
  "Send a selfie that shows your 'after midnight' energy",
  "Voice note: one thing you find physically irresistible about them",
  "Text three words you'd whisper if you were sitting way too close right now",
  "Voice note: one thing that would make you veto a second date — no names, just the standard",
  "Voice note: admit whether you're a slow-burn or a fast-flame person — one sentence",
];

const DARE_PROMPTS_SPICY = [
  "Voice note: describe what you'd do with your hands if they were here — one sentence, no graphic detail",
  "Send a selfie in low light that feels like a 'you up?' text in photo form",
  "Voice note: one boundary you'd bend if the chemistry was undeniable",
  "Send a 5-sec video: slow blink + half-smile, like you're deciding whether to make a move",
  "Type the first move you'd make if they were on your couch right now — PG-13 wording only",
  "Send a 5-sec video: lip bite or lip press (subtle) then look at the camera like you're not sorry",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type SpiceId = "pg13" | "ratedr" | "spicy";

function fallbackPromptList(type: "truth" | "dare", spiceLevel: SpiceId | null): string[] {
  const level = spiceLevel ?? "pg13";
  if (type === "truth") {
    if (level === "spicy") return [...TRUTH_PROMPTS, ...TRUTH_PROMPTS_R, ...TRUTH_PROMPTS_SPICY];
    if (level === "ratedr") return [...TRUTH_PROMPTS, ...TRUTH_PROMPTS_R];
    return TRUTH_PROMPTS;
  }
  if (level === "spicy") return [...DARE_PROMPTS, ...DARE_PROMPTS_R, ...DARE_PROMPTS_SPICY];
  if (level === "ratedr") return [...DARE_PROMPTS, ...DARE_PROMPTS_R];
  return DARE_PROMPTS;
}

function formatTimeRemaining(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TRUTH_OR_DARE_MIN_EACH = 7;

function truthOrDareMessageThresholdMet(
  rows: Array<{ senderId: string }>,
  currentUserId: string,
  partnerUserId: string
): boolean {
  let my = 0;
  let other = 0;
  for (const m of rows) {
    if (m.senderId === currentUserId) my++;
    else if (m.senderId === partnerUserId) other++;
  }
  return my >= TRUTH_OR_DARE_MIN_EACH && other >= TRUTH_OR_DARE_MIN_EACH;
}

interface GameState {
  yourSpiceChoice: SpiceId | null;
  theirSpiceChoice: SpiceId | null;
  spiceReady: boolean;
  spiceLevel: SpiceId | null;
  tokenUnlocked?: boolean;
  needsSpiceChoiceFromUnlocker?: boolean;
  currentPrompt?: string | null;
  currentPromptType?: "truth" | "dare" | null;
  currentTurnUserId?: string | null;
  isYourTurn?: boolean;
  roundCount?: number;
  unlockedUntil?: string | null;
}

const SPICE_OPTIONS: { id: SpiceId; title: string; blurb: string }[] = [
  {
    id: "pg13",
    title: "PG-13",
    blurb: "Grown-up flirting and chemistry — safe for the app, never kiddie icebreakers.",
  },
  {
    id: "ratedr",
    title: "Rated R",
    blurb: "Adult tension and real stories — bold, consensual, still in-bounds.",
  },
  {
    id: "spicy",
    title: "Spicy",
    blurb: "Adult tension and desire — chat-native dares, no graphic porn.",
  },
];

function spiceLabel(id: SpiceId | null | undefined): string {
  if (id === "ratedr") return "Rated R";
  if (id === "spicy") return "Spicy";
  return "PG-13";
}

type Props = {
  matchId: string;
  socket: Socket | null;
  onSendToChat: (text: string) => Promise<boolean | void>;
  onUnlockWithToken: () => Promise<void>;
  onBeforeUnlockPrompt: () => Promise<boolean>;
  openForAccept?: boolean;
  onOpenedForAccept?: () => void;
  gameUnlockedByToken?: boolean;
  /** Required for unlock eligibility (7 messages each); omit only in tests */
  messages?: Array<{ senderId: string }>;
  currentUserId?: string;
  chatPartnerUserId?: string;
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
  messages = [],
  currentUserId,
  chatPartnerUserId,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"spice" | "choose" | "prompt">("spice");
  const [prompt, setPrompt] = useState("");
  const [promptType, setPromptType] = useState<"truth" | "dare">("truth");
  const [loading, setLoading] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [headerTimerSecs, setHeaderTimerSecs] = useState<number | null>(null);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);
  const [unlockConfirmBusy, setUnlockConfirmBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAnotherOneAtRef = useRef(0);
  const lastChooseAtRef = useRef(0);
  const intendedPromptTypeRef = useRef<"truth" | "dare" | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  const lastUnlockedUntilRef = useRef<string | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  gameStateRef.current = gameState;

  const isUnlocked = !!gameUnlockedByToken;
  const isYourTurn = gameState?.isYourTurn !== false;
  const roundCount = Math.max(1, Number(gameState?.roundCount ?? 1) || 1);

  const truthOrDareEligible =
    Boolean(currentUserId && chatPartnerUserId) &&
    truthOrDareMessageThresholdMet(
      messages,
      currentUserId as string,
      chatPartnerUserId as string
    );

  const fetchState = useCallback(async () => {
    try {
      const data = await api.get<GameState>(`/matches/${matchId}/truth-or-dare/state`);
      setGameState((prev) => ({ ...prev, ...data }));
      if (data.currentPrompt && data.currentPromptType) {
        setPrompt(data.currentPrompt);
        setPromptType(data.currentPromptType);
      }

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

      if (!data.spiceReady) {
        setStep("spice");
      } else {
        setStep("choose");
      }
    } catch (err) {
      console.warn("Truth or Dare fetch state error:", err);
    }
  }, [matchId]);

  useEffect(() => {
    if (!modalOpen || !gameState?.spiceReady) return;
    setStep((s) => (s === "spice" ? "choose" : s));
  }, [modalOpen, gameState?.spiceReady]);

  useEffect(() => {
    if (!openForAccept) return;
    setStep("spice");
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

  useEffect(() => {
    if (!unlockConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !unlockConfirmBusy) setUnlockConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlockConfirmOpen, unlockConfirmBusy]);

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
    setStep("spice");
    setPrompt("");
    setModalOpen(true);
    setLoading(true);
    void fetchState().finally(() => setLoading(false));
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void fetchState(), 3000);
  };

  const closeModal = () => {
    setModalOpen(false);
    setStep("spice");
    setPrompt("");
    setGameState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const submitSpiceChoice = async (choice: SpiceId) => {
    setLoading(true);
    try {
      await api.post(`/matches/${matchId}/truth-or-dare/spice-choice`, { choice });
      await fetchState();
    } catch (e) {
      console.warn("Truth or Dare spice choice failed:", e);
      window.alert(e instanceof Error ? e.message : "Could not save your mode. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChoose = async (type: "truth" | "dare", anotherOne = false) => {
    if (!gameStateRef.current?.spiceReady) {
      setStep("spice");
      window.alert("Pick a heat level (PG-13, Rated R, or Spicy) first — both players must choose.");
      return;
    }
    if (gameStateRef.current?.isYourTurn === false) {
      window.alert("It's your match's turn to pick Truth or Dare.");
      return;
    }
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
        setGameState((prev) => (prev ? { ...prev, ...data } : (data as GameState)));
        lastAnotherOneAtRef.current = Date.now();
      } else {
        throw new Error("No prompt returned");
      }
    } catch (e: unknown) {
      if (e instanceof ApiError && (e as { code?: string }).code === "SPICE_REQUIRED") {
        setStep("spice");
        void fetchState();
        setLoading(false);
        setTimeout(() => {
          intendedPromptTypeRef.current = null;
        }, 8000);
        return;
      }
      if (e instanceof ApiError && (e as { code?: string }).code === "NOT_YOUR_TURN") {
        setStep("choose");
        void fetchState();
        window.alert(e.message || "It's your match's turn.");
        return;
      }
      const list = fallbackPromptList(type, gameStateRef.current?.spiceLevel ?? null);
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
        const data = await api.post<GameState>(`/matches/${matchId}/truth-or-dare/send-to-chat`, {});
        setGameState((prev) => (prev ? { ...prev, ...data } : data));
      } catch (e) {
        console.warn("Truth or Dare send-to-chat:", e);
      }
    }
    closeModal();
  };

  const handleLockedPress = async () => {
    if (!truthOrDareEligible) {
      window.alert(
        `Truth or Dare unlocks after you and your match have each sent at least ${TRUTH_OR_DARE_MIN_EACH} messages in this chat.`
      );
      return;
    }
    const already = await onBeforeUnlockPrompt();
    if (already) {
      openModal();
      return;
    }
    setUnlockConfirmOpen(true);
  };

  const closeUnlockConfirm = () => {
    if (!unlockConfirmBusy) setUnlockConfirmOpen(false);
  };

  const confirmUnlockAndPlay = async () => {
    setUnlockConfirmBusy(true);
    try {
      await onUnlockWithToken();
      setUnlockConfirmOpen(false);
      openModal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not unlock the game.";
      window.alert(msg);
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

  useEffect(() => {
    if (isUnlocked && !lastUnlockedUntilRef.current) {
      void fetchState();
    }
  }, [isUnlocked, fetchState]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!modalOpen && !unlockConfirmOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen, unlockConfirmOpen]);

  const sessionExpired = gameState?.tokenUnlocked && secondsRemaining !== null && secondsRemaining <= 0;

  const unlockOverlay =
    unlockConfirmOpen ? (
      <div
        className="tod-web-unlock-overlay"
        role="presentation"
        onClick={closeUnlockConfirm}
      >
        <div
          className="tod-web-unlock-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tod-unlock-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tod-web-unlock-shine" aria-hidden />
          <div className="tod-web-unlock-hero">
            <span className="tod-web-unlock-dice" aria-hidden>
              🎲
            </span>
            <span className="tod-web-unlock-sparkles" aria-hidden>
              ✨
            </span>
          </div>
          <h2 id="tod-unlock-title" className="tod-web-unlock-title">
            Play Truth or Dare?
          </h2>
          <p className="tod-web-unlock-lead">
            You&apos;ll each pick a <strong>heat level</strong> (we use the more conservative of the two), then take
            turns with <strong>Truth</strong> or <strong>Dare</strong> — same flow as in the app.
          </p>
          <div className="tod-web-unlock-flow" aria-hidden>
            <span className="tod-web-unlock-flow-step">
              <span className="tod-web-unlock-flow-num">1</span>
              Heat
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
            <button type="button" className="tod-web-unlock-btn tod-web-unlock-btn--ghost" onClick={closeUnlockConfirm} disabled={unlockConfirmBusy}>
              Not now
            </button>
            <button
              type="button"
              className="tod-web-unlock-btn tod-web-unlock-btn--primary"
              onClick={() => void confirmUnlockAndPlay()}
              disabled={unlockConfirmBusy}
            >
              {unlockConfirmBusy ? "Unlocking…" : "Unlock & play"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const gameModalOverlay =
    modalOpen ? (
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
              {step === "spice"
                ? "Choose your heat"
                : step === "choose"
                  ? "Pick one"
                  : promptType === "truth"
                    ? "✨ Truth"
                    : "🔥 Dare"}
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
            ) : loading && step === "spice" && !gameState ? (
              <p className="tod-web-loading">Loading…</p>
            ) : step === "spice" ? (
              <div className="tod-web-spice">
                <p className="tod-web-spice-intro">
                  Each of you picks a comfort level. Prompts use the <strong>more conservative</strong> of the two so
                  nobody is pushed past their boundary.
                </p>
                <div className="tod-web-spice-grid">
                  {SPICE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tod-web-spice-card${gameState?.yourSpiceChoice === opt.id ? " tod-web-spice-card--active" : ""}`}
                      onClick={() => void submitSpiceChoice(opt.id)}
                      disabled={loading}
                    >
                      <span className="tod-web-spice-card-title">{opt.title}</span>
                      <span className="tod-web-spice-card-blurb">{opt.blurb}</span>
                    </button>
                  ))}
                </div>
                {gameState?.yourSpiceChoice ? (
                  <p className="tod-web-spice-status">
                    You chose <strong>{spiceLabel(gameState.yourSpiceChoice)}</strong>
                    {!gameState.spiceReady ? (
                      <>
                        {" "}
                        — waiting for your match to pick…
                      </>
                    ) : (
                      <>
                        {" "}
                        · Round heat: <strong>{spiceLabel(gameState.spiceLevel)}</strong>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="tod-web-spice-hint subtle">Tap a card to lock in your choice.</p>
                )}
              </div>
            ) : loading && step === "choose" ? (
              <p className="tod-web-loading">Loading…</p>
            ) : step === "choose" ? (
              <div className="tod-web-choose">
                {gameState?.spiceLevel ? (
                  <p className="tod-web-round-heat">
                    Round {roundCount} · <strong>{spiceLabel(gameState.spiceLevel)}</strong>
                  </p>
                ) : null}
                <p className="tod-web-choose-hint">
                  {isYourTurn ? "Your turn — pick Truth or Dare" : "Waiting for your match to pick Truth or Dare"}
                </p>
                <div className="tod-web-choose-row">
                  <button type="button" className="tod-web-choice tod-web-choice--truth" onClick={() => void handleChoose("truth")} disabled={!isYourTurn}>
                    <span className="tod-web-choice-emoji">✨</span>
                    Truth
                  </button>
                  <button type="button" className="tod-web-choice tod-web-choice--dare" onClick={() => void handleChoose("dare")} disabled={!isYourTurn}>
                    <span className="tod-web-choice-emoji">🔥</span>
                    Dare
                  </button>
                </div>
                <button type="button" className="tod-web-spice-change" onClick={() => setStep("spice")} disabled={loading}>
                  Change my heat level
                </button>
              </div>
            ) : loading ? (
              <p className="tod-web-loading">Generating your prompt…</p>
            ) : (
              <>
                {gameState?.spiceLevel ? (
                  <p className="tod-web-prompt-heat subtle">
                    Round {roundCount} · {isYourTurn ? "Your pick" : "Your match's pick"} · Mode: {spiceLabel(gameState.spiceLevel)}
                  </p>
                ) : null}
                <div className="tod-web-prompt-card">
                  <p className="tod-web-prompt-text">{prompt}</p>
                </div>
                <div className="tod-web-prompt-actions">
                  <button type="button" className="tod-web-send-chat" onClick={() => void handleSendToChat()}>
                    Send to chat 💬
                  </button>
                  <button type="button" className="tod-web-another" onClick={() => void handleChoose(promptType, true)} disabled={!isYourTurn}>
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
    ) : null;

  return (
    <>
      <div className="tod-web-wrap">
        <button
          type="button"
          className="tod-web-header-btn"
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
      </div>
      {typeof document !== "undefined" && unlockOverlay ? createPortal(unlockOverlay, document.body) : null}
      {typeof document !== "undefined" && gameModalOverlay ? createPortal(gameModalOverlay, document.body) : null}
    </>
  );
}
