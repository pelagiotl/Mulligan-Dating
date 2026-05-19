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

const HEADER_GRADIENT: Record<"photo" | "video" | "voice", string> = {
  photo: "linear-gradient(135deg, #667eea 0%, #764ba2 48%, #f093fb 100%)",
  video: "linear-gradient(135deg, #0f766e 0%, #0d9488 42%, #5eead4 100%)",
  voice: "linear-gradient(135deg, #db2777 0%, #a855f7 48%, #f472b6 100%)",
};

function ProgressRow({
  label,
  count,
  threshold,
}: {
  label: string;
  count: number;
  threshold: number;
}) {
  const done = count >= threshold;
  const pct = Math.min(100, (count / threshold) * 100);
  return (
    <div className="chat-media-modal-progress-row">
      <div className="chat-media-modal-progress-head">
        <span>{label}</span>
        <span
          className={
            done ? "chat-media-modal-progress-count chat-media-modal-progress-count--done" : "chat-media-modal-progress-count"
          }
        >
          {Math.min(count, threshold)}/{threshold}
        </span>
      </div>
      <div className="chat-media-modal-progress-track">
        <div
          className={done ? "chat-media-modal-progress-fill chat-media-modal-progress-fill--done" : "chat-media-modal-progress-fill"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

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
  const th = lockedProgress?.threshold ?? 3;

  return (
    <div className="chat-media-modal-overlay" role="presentation">
      <button type="button" className="chat-media-modal-backdrop" aria-label="Close" onClick={onCancel} />
      <div
        className="chat-media-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-media-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-media-modal-rim">
          <div className="chat-media-modal-inner">
            <header
              className="chat-media-modal-header"
              style={{ background: HEADER_GRADIENT[meta.accent] }}
            >
              <span className="chat-media-modal-emoji" aria-hidden>
                {meta.emoji}
              </span>
              <div>
                <p className="chat-media-modal-kicker">
                  {isLocked ? "Chat media" : meta.label}
                </p>
                <h2 id="chat-media-modal-title" className="chat-media-modal-title">
                  {isLocked ? "Almost unlocked" : "Keep it appropriate"}
                </h2>
              </div>
            </header>

            <div className="chat-media-modal-body">
              {isLocked ? (
                <>
                  <p className="chat-media-modal-lead">{lockedHint}</p>
                  <div className="chat-media-modal-chips" aria-hidden>
                    <span className="chat-media-modal-chip">📷 Photos</span>
                    <span className="chat-media-modal-chip">🎬 Video</span>
                    <span className="chat-media-modal-chip">🎙️ Voice</span>
                  </div>
                  {lockedProgress ? (
                    <div className="chat-media-modal-progress-card">
                      <p className="chat-media-modal-progress-label">Message progress</p>
                      <ProgressRow label="You" count={lockedProgress.my} threshold={th} />
                      <ProgressRow label="Your match" count={lockedProgress.their} threshold={th} />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="chat-media-modal-lead">
                  You&apos;re about to send{" "}
                  {mediaKind === "image" ? "a photo" : mediaKind === "video" ? "a video" : "a voice message"}.
                  Thanks for keeping Mulligan safe and respectful.
                </p>
              )}

              <div className="chat-media-modal-standards" role="note">
                <span className="chat-media-modal-standards-icon" aria-hidden>
                  🛡️
                </span>
                <div>
                  <p className="chat-media-modal-standards-kicker">Community standards</p>
                  <p className="chat-media-modal-standards-text">{moderationWarning}</p>
                </div>
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
      </div>
    </div>
  );
}
