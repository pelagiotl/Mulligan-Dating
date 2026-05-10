import { useEffect } from "react";
import { createPortal } from "react-dom";

interface NotificationProps {
  message: string;
  type?: "success" | "info" | "warning" | "error";
  onClose: () => void;
  duration?: number;
}

export default function Notification({
  message,
  type = "success",
  onClose,
  duration = 5000,
}: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const el = (
    <div
      className={`notification notification-${type}`}
      role="status"
      aria-live="polite"
    >
      <div className="notification-content">
        <span className="notification-icon">
          {type === "success" && "✨"}
          {type === "info" && "💡"}
          {type === "warning" && "⚠️"}
          {type === "error" && "❌"}
        </span>
        <span className="notification-message">{message}</span>
      </div>
      <button type="button" className="notification-close" onClick={onClose} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(el, document.body);
}

