import { useEffect } from "react";
import { useConnectShellTheme } from "../context/ConnectShellThemeContext";

export type UnblockConfirmVariant = "user" | "phone";

type Props = {
  isOpen: boolean;
  label: string;
  variant?: UnblockConfirmVariant;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const USER_BULLETS = [
  "May appear in Browse again",
  "You could match and chat again",
  "You can block again anytime",
] as const;

const PHONE_BULLETS = [
  "Removed from your block list",
  "This number can be used on Mulligan again",
  "You can block the number again anytime",
] as const;

export default function UnblockConfirmModal({
  isOpen,
  label,
  variant = "user",
  confirming = false,
  onConfirm,
  onCancel,
}: Props) {
  const { mode: connectShell } = useConnectShellTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onCancel, confirming]);

  if (!isOpen) return null;

  const name = label.trim() || (variant === "phone" ? "this number" : "this person");
  const bullets = variant === "phone" ? PHONE_BULLETS : USER_BULLETS;
  const subtitle =
    variant === "phone"
      ? "They will no longer be blocked by phone on Mulligan."
      : "They may show up in Browse again — and you could match.";

  return (
    <div
      className={`unblock-confirm-modal-overlay unblock-confirm-modal-overlay--${connectShell}`}
      onClick={confirming ? undefined : onCancel}
      role="presentation"
    >
      <div
        className={`unblock-confirm-modal unblock-confirm-modal--${connectShell}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unblock-confirm-title"
        aria-describedby="unblock-confirm-subtitle"
      >
        <div className="unblock-confirm-modal__header">
          <div className="unblock-confirm-modal__header-glow" aria-hidden />
          <span className="unblock-confirm-modal__icon" aria-hidden>
            🔓
          </span>
          <h3 id="unblock-confirm-title" className="unblock-confirm-modal__title">
            Unblock {name}?
          </h3>
          <p id="unblock-confirm-subtitle" className="unblock-confirm-modal__subtitle">
            {subtitle}
          </p>
        </div>

        <div className="unblock-confirm-modal__body">
          <ul className="unblock-confirm-modal__bullets">
            {bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="unblock-confirm-modal__hint">
            {variant === "phone"
              ? "Only affects blocking by phone number."
              : "Your past match history is not restored automatically."}
          </p>
        </div>

        <div className="unblock-confirm-modal__actions">
          <button
            type="button"
            className="unblock-confirm-modal__cancel"
            onClick={onCancel}
            disabled={confirming}
          >
            Cancel
          </button>
          <button
            type="button"
            className="unblock-confirm-modal__confirm"
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? "Unblocking…" : "Unblock"}
          </button>
        </div>
      </div>
    </div>
  );
}
