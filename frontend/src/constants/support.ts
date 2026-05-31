export const SUPPORT_EMAIL = "Mulligandating@gmail.com";

const CREATE_PROFILE_SUPPORT_SUBJECT = "Mulligan — help creating my profile";
const MATCHES_SUPPORT_SUBJECT = "Mulligan — question from Matches";
const LOGIN_SUPPORT_SUBJECT = "Mulligan — help signing in";

export type MatchesSupportContext = {
  userId?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  surface: "web" | "android" | "ios";
  availableTokens?: number;
  activeMatches?: number;
  slotLimit?: number;
};

function supportFieldLine(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  return `${label}: ${trimmed ? trimmed : "—"}`;
}

/** Per-line encoding avoids `+` for spaces (URLSearchParams / form-style mailto bugs). */
function encodeMailtoBody(lines: string[]): string {
  return lines.map((line) => encodeURIComponent(line)).join("%0D%0A");
}

function buildMatchesSupportBodyLines(ctx: MatchesSupportContext): string[] {
  const lines = [
    "Hi Mulligan team,",
    "",
    "I have a question about my Matches tab.",
    "",
    supportFieldLine("Name", ctx.displayName),
    supportFieldLine("Phone", ctx.phoneNumber),
    supportFieldLine("User ID", ctx.userId ?? undefined),
    supportFieldLine("App", ctx.surface),
  ];
  if (ctx.availableTokens != null) {
    lines.push(`Mulligans available: ${ctx.availableTokens}`);
  }
  if (ctx.activeMatches != null && ctx.slotLimit != null) {
    lines.push(`Active connections: ${ctx.activeMatches} / ${ctx.slotLimit}`);
  }
  lines.push("", "Thanks!");
  return lines;
}

export function getCreateProfileSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CREATE_PROFILE_SUPPORT_SUBJECT)}`;
}

export function getMatchesSupportMailtoUrl(ctx: MatchesSupportContext): string {
  const body = encodeMailtoBody(buildMatchesSupportBodyLines(ctx));
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(MATCHES_SUPPORT_SUBJECT)}&body=${body}`;
}

export type LoginSupportContext = {
  phoneNumber?: string | null;
  surface: "web" | "android" | "ios";
  step?: "phone" | "verify";
};

function buildLoginSupportBodyLines(ctx: LoginSupportContext): string[] {
  const stepLabel = ctx.step === "verify" ? "Verifying code" : "Entering phone number";
  return [
    "Hi Mulligan team,",
    "",
    "I need help signing in to Mulligan.",
    "",
    supportFieldLine("Phone", ctx.phoneNumber),
    supportFieldLine("App", ctx.surface),
    `Step: ${stepLabel}`,
    "",
    "Thanks!",
  ];
}

export function getLoginSupportMailtoUrl(ctx: LoginSupportContext): string {
  const body = encodeMailtoBody(buildLoginSupportBodyLines(ctx));
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(LOGIN_SUPPORT_SUBJECT)}&body=${body}`;
}
