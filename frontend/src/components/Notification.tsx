import { useEffect } from "react";

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

  return (
    <div className={`notification notification-${type}`}>
      <div className="notification-content">
        <span className="notification-icon">
          {type === "success" && "✨"}
          {type === "info" && "💡"}
          {type === "warning" && "⚠️"}
          {type === "error" && "❌"}
        </span>
        <span className="notification-message">{message}</span>
      </div>
      <button className="notification-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

