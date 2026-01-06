import { useEffect } from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "warning" | "info";
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  type = "warning",
}: ConfirmModalProps) {
  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      confirmBg: "var(--color-rose-600)",
      confirmHover: "var(--color-rose-700)",
      border: "var(--color-rose-300)",
    },
    warning: {
      confirmBg: "var(--color-gold-500)",
      confirmHover: "var(--color-gold-600)",
      border: "var(--color-gold-300)",
    },
    info: {
      confirmBg: "var(--color-rose-500)",
      confirmHover: "var(--color-rose-600)",
      border: "var(--color-rose-300)",
    },
  };

  const styles = typeStyles[type];

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-header">
          <h3 className="confirm-modal-title">{title}</h3>
        </div>
        <div className="confirm-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>
        <div className="confirm-modal-actions">
          <button
            className="btn btn-secondary confirm-modal-cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className="btn btn-primary confirm-modal-confirm"
            onClick={onConfirm}
            style={{
              backgroundColor: styles.confirmBg,
              borderColor: styles.confirmBg,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = styles.confirmHover;
              e.currentTarget.style.borderColor = styles.confirmHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = styles.confirmBg;
              e.currentTarget.style.borderColor = styles.confirmBg;
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

