import { useEffect } from "react";

export type ChatMediaKind = "image" | "video" | "voice";

interface ChatMediaModerationModalProps {
  open: boolean;
  /** Guidelines = after unlock, before capture; locked = not enough messages yet */
  variant: "guidelines" | "locked";
  mediaKind: ChatMediaKind;
  moderationWarning: string;
  lockedHint: string;
  /** When set (locked variant), show progress toward threshold — parity with mobile gate modal */
  lockedProgress?: { my: number; their: number; threshold: number };
  onConfirm: () => void;
  onCancel: () => void;
}

const KIND_META: Record<
  ChatMediaKind,
  { emoji: string; label: string; accent: "photo" | "video" | "voice" }
> = {
  image: { emoji: "📷", label: "Photo", accent: "photo" },
  video: { emoji: "🎬", label: "Video", accent: "video" },
  voice: { emoji: "🎙️", label: "Voice", accent: "voice" },
};

export default function ChatMediaModerationModal({
  open,
  variant,
  mediaKind,
  moderationWarning,
  lockedHint,
  lockedProgress,
  onConfirm,
  onCancel,
}: ChatMediaModerationModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const meta = KIND_META[mediaKind];
  const isLocked = variant === "locked";
  const richLocked = isLocked && !!lockedProgress;
  const th = lockedProgress?.threshold ?? 3;
  const myPct = lockedProgress ? Math.min(100, (lockedProgress.my / th) * 100) : 0;
  const theirPct = lockedProgress ? Math.min(100, (lockedProgress.their / th) * 100) : 0;

  return (
    <div className="chat-media-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className={`chat-media-modal chat-media-modal--${meta.accent}${richLocked ? " chat-media-modal--locked-jewel" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-media-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-media-modal-glow" aria-hidden />
        <header className="chat-media-modal-header">
          <span className="chat-media-modal-emoji" aria-hidden>
            {meta.emoji}
          </span>
          <div className="chat-media-modal-header-text">
            <p className="chat-media-modal-kicker">{meta.label}</p>
            <h2 id="chat-media-modal-title" className="chat-media-modal-title">
              {isLocked ? "Almost unlocked" : "Keep it appropriate"}
            </h2>
          </div>
        </header>

        <div className="chat-media-modal-body">
          {isLocked ? (
            <>
              <p className="chat-media-modal-lead">{lockedHint}</p>
              {lockedProgress ? (
                <div className="chat-media-modal-progress">
                  <div className="chat-media-modal-progress-row">
                    <div className="chat-media-modal-progress-head">
                      <span>You</span>
                      <span
                        className={
                          lockedProgress.my >= th
                            ? "chat-media-modal-progress-count chat-media-modal-progress-count--done"
                            : "chat-media-modal-progress-count"
                        }
                      >
                        {Math.min(lockedProgress.my, th)}/{th}
                      </span>
                    </div>
                    <div className="chat-media-modal-progress-track">
                      <div
                        className={
                          lockedProgress.my >= th
                            ? "chat-media-modal-progress-fill chat-media-modal-progress-fill--done"
                            : "chat-media-modal-progress-fill"
                        }
                        style={{ width: `${myPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="chat-media-modal-progress-row">
                    <div className="chat-media-modal-progress-head">
                      <span>Your match</span>
                      <span
                        className={
                          lockedProgress.their >= th
                            ? "chat-media-modal-progress-count chat-media-modal-progress-count--done"
                            : "chat-media-modal-progress-count"
                        }
                      >
                        {Math.min(lockedProgress.their, th)}/{th}
                      </span>
                    </div>
                    <div className="chat-media-modal-progress-track">
                      <div
                        className={
                          lockedProgress.their >= th
                            ? "chat-media-modal-progress-fill chat-media-modal-progress-fill--done"
                            : "chat-media-modal-progress-fill"
                        }
                        style={{ width: `${theirPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="chat-media-modal-lead">
              You&apos;re about to send {mediaKind === "image" ? "a photo" : mediaKind === "video" ? "a video" : "a voice message"}.
              Thanks for keeping Mulligan safe and respectful.
            </p>
          )}
          <div className="chat-media-modal-callout" role="note">
            <span className="chat-media-modal-callout-icon" aria-hidden>
              🛡️
            </span>
            <p className="chat-media-modal-callout-text">{moderationWarning}</p>
          </div>
        </div>

        <footer className="chat-media-modal-actions">
          {!isLocked && (
            <button type="button" className="btn btn-secondary chat-media-modal-btn-secondary" onClick={onCancel}>
              Not now
            </button>
          )}
          <button type="button" className="btn btn-primary chat-media-modal-btn-primary" onClick={onConfirm}>
            {isLocked ? "Got it" : "Got it, continue"}
          </button>
        </footer>
      </div>
    </div>
  );
}
