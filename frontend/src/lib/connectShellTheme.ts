export const CONNECT_SHELL_STORAGE_KEY = "mulligan-connect-shell";

/** Midnight = graphite hero + dark chrome; sunny = warm sunrise; soft = pastel purple “pill” + cool gradient chrome. */
export type ConnectShellMode = "midnight" | "sunny" | "soft";

/** Default for new visitors / installs when nothing is stored yet. */
export const DEFAULT_CONNECT_SHELL_MODE: ConnectShellMode = "midnight";

const CONNECT_SHELL_CYCLE: ConnectShellMode[] = ["midnight", "sunny", "soft"];

export function nextConnectShellMode(current: ConnectShellMode): ConnectShellMode {
  const i = CONNECT_SHELL_CYCLE.indexOf(current);
  const idx = i >= 0 ? i : 0;
  return CONNECT_SHELL_CYCLE[(idx + 1) % CONNECT_SHELL_CYCLE.length];
}

export function connectShellDisplayLabel(mode: ConnectShellMode): string {
  switch (mode) {
    case "midnight":
      return "Midnight";
    case "sunny":
      return "Sunny";
    case "soft":
      return "Soft";
  }
}

export function readConnectShellMode(): ConnectShellMode {
  if (typeof window === "undefined") return DEFAULT_CONNECT_SHELL_MODE;
  try {
    const v = localStorage.getItem(CONNECT_SHELL_STORAGE_KEY);
    if (v === "midnight" || v === "sunny" || v === "soft") return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_CONNECT_SHELL_MODE;
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
