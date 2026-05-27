import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openMatchIdRef } from "../lib/currentMatchView";

type Toast = {
  id: string;
  senderName: string;
  preview: string;
  matchId: string;
};

const TOAST_MS = 6000;
const DEDUPE_MS = 2500;

/**
 * Global in-app message alerts (all tabs). Matches mobile AuthContext behavior.
 * OS banners when backgrounded still use Web Push + service worker.
 */
export default function WebMessageNotifications() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState<Toast | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const lastDedupeRef = useRef<{ matchId: string; at: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((senderName: string, preview: string, matchId: string) => {
    const id = `${Date.now()}-${matchId}`;
    setToast({ id, senderName, preview, matchId });
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

    const socketUrl: string =
      (import.meta.env as { VITE_API_URL?: string }).VITE_API_URL ||
      (import.meta.env as { VITE_NGROK_URL?: string }).VITE_NGROK_URL ||
      "http://localhost:3001";

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("new_message", (data: {
      matchId?: string;
      senderId: string;
      senderName?: string;
      content?: string;
    }) => {
      if (!data.matchId || data.senderId === user.id) return;
      if (openMatchIdRef.current === data.matchId) return;

      const now = Date.now();
      const last = lastDedupeRef.current;
      if (last?.matchId === data.matchId && now - last.at < DEDUPE_MS) return;
      lastDedupeRef.current = { matchId: data.matchId, at: now };

      const senderName = data.senderName || "Someone";
      let preview = (data.content ?? "").trim();
      if (!preview) preview = "New message";
      if (preview.length > 50) preview = `${preview.slice(0, 50)}...`;

      showToast(senderName, preview, data.matchId);
    });

    const onVisible = () => {
      if (document.visibilityState === "visible" && socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("new_message");
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isAuthenticated, user?.id, showToast]);

  if (!toast) return null;

  const banner = (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "max(72px, calc(env(safe-area-inset-top, 0px) + 56px))",
        left: "50%",
        transform: "translateX(-50%)",
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
        color: "white",
        padding: "14px 22px",
        borderRadius: "14px",
        boxShadow: "0 8px 28px rgba(99, 102, 241, 0.45)",
        zIndex: 13000,
        maxWidth: "min(92vw, 400px)",
        cursor: "pointer",
        textAlign: "left",
      }}
      onClick={() => {
        const matchId = toast.matchId;
        setToast(null);
        navigate("/matches", { state: { openMatchId: matchId } });
      }}
    >
      <div style={{ fontWeight: 800, fontSize: "0.95rem", marginBottom: 4 }}>{toast.senderName}</div>
      <div style={{ fontSize: "0.88rem", opacity: 0.95 }}>{toast.preview}</div>
    </div>
  );

  return createPortal(banner, document.body);
}
