import { useEffect } from "react";

let lockCount = 0;
let savedOverflow: string | undefined;

/** Prevent document scroll while overlays are open (ref-counted for nested modals). */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;

  return () => {
    if (typeof document === "undefined") return;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow ?? "";
      savedOverflow = undefined;
    }
  };
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}

/** Clears scroll locks left behind when leaving a tab/route (e.g. Matches chat → Profile). */
export function releaseAllBodyScrollLocks(): void {
  if (typeof document === "undefined") return;
  lockCount = 0;
  savedOverflow = undefined;
  document.body.style.overflow = "";
  document.body.classList.remove("matches-mobile-chat-open", "matches-chat-keyboard-open");
  document.body.style.removeProperty("--chat-keyboard-inset");
}
