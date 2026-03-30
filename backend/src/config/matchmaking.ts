/**
 * Remote matchmaking gate — no app store release required.
 *
 * Set MATCHMAKING_DISABLED=true on the server (e.g. Render) before App Store go-live;
 * clear it or set to false when matching should open (e.g. June 6).
 *
 * Optional: MATCHMAKING_DISABLED_MESSAGE — shown in the API error and app UI.
 */

function envTruthy(v: string | undefined): boolean {
  if (v === undefined || v === "") return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** When true, unlock-browse, browse, and connect are blocked. */
export function isMatchmakingGloballyDisabled(): boolean {
  return envTruthy(process.env.MATCHMAKING_DISABLED);
}

export function getMatchmakingDisabledMessage(): string {
  const custom = process.env.MATCHMAKING_DISABLED_MESSAGE?.trim();
  if (custom) return custom;
  return "Matching isn’t open yet. Check back on launch day!";
}

export function matchmakingDisabledJson() {
  return {
    error: getMatchmakingDisabledMessage(),
    code: "MATCHMAKING_DISABLED" as const,
  };
}
