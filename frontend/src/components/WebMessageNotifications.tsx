import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { shouldSuppressInAppMessageToast } from "../lib/currentMatchView";
import { playMessageChime } from "../utils/matchSound";

type Toast = {
  id: string;
  senderName: string;
  preview: string;
  matchId: string;
};

const TOAST_MS = 6500;
const DEDUPE_MS = 2500;

function resolveSocketUrl(): string {
  return (
    (import.meta.env as { VITE_API_URL?: string }).VITE_API_URL ||
    (import.meta.env as { VITE_NGROK_URL?: string }).VITE_NGROK_URL ||
    "http://localhost:3001"
  );
}

/**
 * Global in-app message alerts on every authenticated tab (Browse, Settings, Matches, etc.).
 * OS lock-screen banners use Web Push when the app is backgrounded.
 */
export default function WebMessageNotifications() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState<Toast | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string | null>(null);
  const lastDedupeRef = useRef<{ matchId: string; at: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  userIdRef.current = user?.id ?? null;

  const showToast = useCallback((senderName: string, preview: string, matchId: string) => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const id = `${Date.now()}-${matchId}`;
    setToast({ id, senderName, preview, matchId });
    playMessageChime();

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, TOAST_MS);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    const onNewMessage = (data: {
      matchId?: string;
      senderId: string;
      senderName?: string;
      content?: string;
      imageUrl?: string | null;
      videoUrl?: string | null;
      audioUrl?: string | null;
    }) => {
      const uid = userIdRef.current;
      if (!data.matchId || !uid || data.senderId === uid) return;
      if (shouldSuppressInAppMessageToast(data.matchId)) return;

      const now = Date.now();
      const last = lastDedupeRef.current;
      if (last?.matchId === data.matchId && now - last.at < DEDUPE_MS) return;
      lastDedupeRef.current = { matchId: data.matchId, at: now };

      const senderName = data.senderName || "Someone";
      let preview = (data.content ?? "").trim();
      if (!preview) {
        if (data.imageUrl) preview = "📷 Photo";
        else if (data.videoUrl) preview = "Video";
        else if (data.audioUrl) preview = "Voice message";
        else preview = "New message";
      }
      if (preview.length > 50) preview = `${preview.slice(0, 50)}...`;

      showToast(senderName, preview, data.matchId);
    };

    socket.on("new_message", onNewMessage);

    const ensureConnected = () => {
      if (document.visibilityState !== "visible") return;
      const s = socketRef.current;
      if (s && !s.connected) s.connect();
    };

    document.addEventListener("visibilitychange", ensureConnected);
    window.addEventListener("focus", ensureConnected);
    window.addEventListener("pageshow", ensureConnected);

    return () => {
      document.removeEventListener("visibilitychange", ensureConnected);
      window.removeEventListener("focus", ensureConnected);
      window.removeEventListener("pageshow", ensureConnected);
      socket.off("new_message", onNewMessage);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isAuthenticated, user?.id, showToast]);

  if (!toast) return null;

  const banner = (
    <button
      type="button"
      className="web-message-toast"
      aria-live="polite"
      onClick={() => {
        const matchId = toast.matchId;
        setToast(null);
        navigate("/matches", { state: { openMatchId: matchId } });
      }}
    >
      <span className="web-message-toast__kicker">New message</span>
      <span className="web-message-toast__sender">{toast.senderName}</span>
      <span className="web-message-toast__preview">{toast.preview}</span>
    </button>
  );

  return createPortal(banner, document.body);
}
