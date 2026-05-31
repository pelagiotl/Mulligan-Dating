export const SUPPORT_EMAIL = "Mulligandating@gmail.com";

const CREATE_PROFILE_SUPPORT_SUBJECT = "Mulligan — help creating my profile";
const MATCHES_SUPPORT_SUBJECT = "Mulligan — question from Matches";

export type MatchesSupportContext = {
  userId?: string | null;
  surface: "web" | "android" | "ios";
  availableTokens?: number;
  activeMatches?: number;
  slotLimit?: number;
};

function buildMatchesSupportBody(ctx: MatchesSupportContext): string {
  const lines = [
    "",
    "---",
    `User ID: ${ctx.userId ?? "unknown"}`,
    `App: ${ctx.surface}`,
  ];
  if (ctx.availableTokens != null) {
    lines.push(`Mulligans available: ${ctx.availableTokens}`);
  }
  if (ctx.activeMatches != null && ctx.slotLimit != null) {
    lines.push(`Active connections: ${ctx.activeMatches} / ${ctx.slotLimit}`);
  }
  return lines.join("\n");
}

export function getCreateProfileSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CREATE_PROFILE_SUPPORT_SUBJECT)}`;
}

export function getMatchesSupportMailtoUrl(ctx: MatchesSupportContext): string {
  const params = new URLSearchParams({
    subject: MATCHES_SUPPORT_SUBJECT,
    body: buildMatchesSupportBody(ctx),
  });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
