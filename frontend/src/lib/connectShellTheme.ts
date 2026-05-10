export const CONNECT_SHELL_STORAGE_KEY = "mulligan-connect-shell";

/** Midnight = graphite hero + dark chrome; soft = original light pill + pastel shell. */
export type ConnectShellMode = "midnight" | "soft";

export function readConnectShellMode(): ConnectShellMode {
  if (typeof window === "undefined") return "midnight";
  try {
    const v = localStorage.getItem(CONNECT_SHELL_STORAGE_KEY);
    if (v === "soft") return "soft";
  } catch {
    /* ignore */
  }
  return "midnight";
}

export function applyConnectShellMode(mode: ConnectShellMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-connect-shell", mode);
}

export function persistConnectShellMode(mode: ConnectShellMode): void {
  try {
    localStorage.setItem(CONNECT_SHELL_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyConnectShellMode(mode);
}
