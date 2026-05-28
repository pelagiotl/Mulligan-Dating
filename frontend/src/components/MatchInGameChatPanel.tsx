import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

export type MatchGameChatMessage = {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

const GAME_CHAT_MAX = 80;
const COMPACT_BREAKPOINT = "(max-width: 430px)";

function bubbleBody(m: MatchGameChatMessage): string {
  const t = (m.content ?? "").trim();
  if (t) return t;
  if (m.imageUrl) return "📷 Photo";
  if (m.videoUrl) return "🎥 Video";
  if (m.audioUrl) return "🎤 Voice";
  return "";
}

type Props = {
  matchId: string;
  socket: Socket | null;
  messages: MatchGameChatMessage[];
  currentUserId: string;
  partnerDisplayName: string;
  partnerIsTyping?: boolean;
  sendingMessage?: boolean;
  onSendToChat: (text: string) => Promise<boolean | void>;
  /** When false, panel is not rendered (game not active yet). */
  visible: boolean;
  gameLabel: string;
};

export default function MatchInGameChatPanel({
  matchId,
  socket,
  messages,
  currentUserId,
  partnerDisplayName,
  partnerIsTyping = false,
  sendingMessage = false,
  onSendToChat,
  visible,
  gameLabel,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedMessages = useMemo(() => {
    const rows = messages
      .filter((m) => Boolean(bubbleBody(m)))
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    return rows.length > GAME_CHAT_MAX ? rows.slice(-GAME_CHAT_MAX) : rows;
  }, [messages]);

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const run = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    scrollToLatest();
    const t1 = window.setTimeout(scrollToLatest, 60);
    const t2 = window.setTimeout(scrollToLatest, 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible, panelOpen, sortedMessages, scrollToLatest]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(COMPACT_BREAKPOINT);
    const onChange = () => {
      const c = mq.matches;
      setCompactLayout(c);
      if (!c) setPanelOpen(true);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!visible || !compactLayout || !panelOpen) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [visible, compactLayout, panelOpen]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (typingActiveRef.current) {
      socket?.emit("stop_typing", { matchId });
      typingActiveRef.current = false;
    }
  }, [socket, matchId]);

  const pulseTyping = useCallback(
    (value: string) => {
      if (!socket) return;
      const trimmed = value.trim();
      if (!trimmed) {
        stopTyping();
        return;
      }
      if (!typingActiveRef.current) {
        socket.emit("typing", { matchId });
        typingActiveRef.current = true;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stop_typing", { matchId });
        typingActiveRef.current = false;
        typingTimeoutRef.current = null;
      }, 3000);
    },
    [socket, matchId, stopTyping]
  );

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [matchId, stopTyping]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending || sendingMessage) return;
    setSending(true);
    setDraft("");
    try {
      const ok = await onSendToChat(text);
      if (ok === false) setDraft(text);
      else scrollToLatest();
    } finally {
      setSending(false);
      stopTyping();
    }
  };

  if (!visible) return null;

  const showEmbedded = !compactLayout || panelOpen;
  const showFab = compactLayout && !panelOpen;

  return (
    <>
      {showEmbedded ? (
        <div
          className={`nhie-web-game-chat${compactLayout && panelOpen ? " nhie-web-game-chat--sheet" : ""}`}
          role="region"
          aria-label="Messages with your match"
        >
          {compactLayout && panelOpen ? (
            <div className="nhie-web-game-chat-toolbar">
              <span className="nhie-web-game-chat-toolbar-title">In-game chat</span>
              <button
                type="button"
                className="nhie-web-game-chat-minimize"
                onClick={() => setPanelOpen(false)}
                aria-label="Hide chat and keep playing"
              >
                Hide
              </button>
            </div>
          ) : null}
          {compactLayout && panelOpen ? (
            <p className="nhie-web-game-chat-toolbar-hint">
              Message each other here while you play — same thread as your match chat.
            </p>
          ) : null}
          {!(compactLayout && panelOpen) ? (
            <p className="nhie-web-game-chat-label">Message your match while you play</p>
          ) : null}
          {partnerIsTyping ? (
            <p className="nhie-web-game-chat-typing" aria-live="polite">
              {partnerDisplayName} is typing…
            </p>
          ) : null}
          <div ref={scrollRef} className="nhie-web-game-chat-scroll">
            {sortedMessages.length === 0 ? (
              <p className="nhie-web-game-chat-empty">
                No messages here yet — say something without leaving the game.
              </p>
            ) : (
              sortedMessages.map((m, idx) => {
                const mine = m.senderId === currentUserId;
                const body = bubbleBody(m);
                const prev = idx > 0 ? sortedMessages[idx - 1] : null;
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
          </div>
          <div className="nhie-web-game-chat-composer">
            <textarea
              ref={textareaRef}
              className="nhie-web-game-chat-input"
              rows={2}
              maxLength={1000}
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => {
                const v = e.target.value;
                setDraft(v);
                pulseTyping(v);
              }}
              onFocus={() => {
                scrollToLatest();
                setTimeout(scrollToLatest, 80);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={sending || sendingMessage}
              aria-label="Message to your match"
            />
            <button
              type="button"
              className="nhie-web-game-chat-send"
              onClick={() => void sendMessage()}
              disabled={sending || sendingMessage || !draft.trim()}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
      {showFab ? (
        <button
          type="button"
          className="nhie-web-game-chat-fab"
          title={`Open in-game chat — message your match without leaving ${gameLabel}`}
          aria-label={`Open in-game chat to message your match while playing ${gameLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            setPanelOpen(true);
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
    </>
  );
}
