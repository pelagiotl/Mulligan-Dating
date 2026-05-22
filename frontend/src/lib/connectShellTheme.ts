export const CONNECT_SHELL_STORAGE_KEY = "mulligan-connect-shell";

/** Midnight = graphite hero + dark chrome; sunny = warm sunrise; soft = pastel purple “pill” + cool gradient chrome. */
export type ConnectShellMode = "midnight" | "sunny" | "soft";

/** Default for new visitors / installs when nothing is stored yet. */
export const DEFAULT_CONNECT_SHELL_MODE: ConnectShellMode = "midnight";

const CONNECT_SHELL_CYCLE: ConnectShellMode[] = ["midnight", "sunny", "soft"];

function isConnectShellMode(v: string | null): v is ConnectShellMode {
  return v === "midnight" || v === "sunny" || v === "soft";
}

/** Per-user key so a new account on the same browser does not inherit another user's theme. */
export function connectShellStorageKey(userId?: string | null): string {
  return userId ? `${CONNECT_SHELL_STORAGE_KEY}:${userId}` : CONNECT_SHELL_STORAGE_KEY;
}

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

/**
 * Read Connect shell theme. Authenticated users only use their per-user key (default midnight).
 * Without a user id, returns midnight — React must not read the legacy global key (avoids leaking
 * a prior session's sunny/soft onto a new account before /auth/me returns).
 */
export function readConnectShellMode(userId?: string | null): ConnectShellMode {
  if (typeof window === "undefined") return DEFAULT_CONNECT_SHELL_MODE;
  try {
    if (userId) {
      const v = localStorage.getItem(connectShellStorageKey(userId));
      if (isConnectShellMode(v)) return v;
      return DEFAULT_CONNECT_SHELL_MODE;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONNECT_SHELL_MODE;
}

export function applyConnectShellMode(mode: ConnectShellMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-connect-shell", mode);
}

export function persistConnectShellMode(mode: ConnectShellMode, userId?: string | null): void {
  try {
    localStorage.setItem(connectShellStorageKey(userId), mode);
  } catch {
    /* ignore */
  }
  applyConnectShellMode(mode);
}

/** Force midnight for a new account (signup / phone verify isNewUser). */
export function resetConnectShellModeForNewUser(userId: string): void {
  persistConnectShellMode(DEFAULT_CONNECT_SHELL_MODE, userId);
}
