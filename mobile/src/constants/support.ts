import { Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'Mulligandating@gmail.com';

const CREATE_PROFILE_SUPPORT_SUBJECT = 'Mulligan — help creating my profile';
const MATCHES_SUPPORT_SUBJECT = 'Mulligan — question from Matches';

export type MatchesSupportContext = {
  userId?: string | null;
  surface?: 'android' | 'ios';
  availableTokens?: number;
  activeMatches?: number;
  slotLimit?: number;
};

function matchesSupportSurface(): 'android' | 'ios' {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

function buildMatchesSupportBody(ctx: MatchesSupportContext): string {
  const surface = ctx.surface ?? matchesSupportSurface();
  const lines = [
    '',
    '---',
    `User ID: ${ctx.userId ?? 'unknown'}`,
    `App: ${surface}`,
  ];
  if (ctx.availableTokens != null) {
    lines.push(`Mulligans available: ${ctx.availableTokens}`);
  }
  if (ctx.activeMatches != null && ctx.slotLimit != null) {
    lines.push(`Active connections: ${ctx.activeMatches} / ${ctx.slotLimit}`);
  }
  return lines.join('\n');
}

export function getCreateProfileSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CREATE_PROFILE_SUPPORT_SUBJECT)}`;
}

export function getMatchesSupportMailtoUrl(ctx: MatchesSupportContext): string {
  const body = buildMatchesSupportBody(ctx);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(MATCHES_SUPPORT_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

export function openCreateProfileSupportEmail(): void {
  void Linking.openURL(getCreateProfileSupportMailtoUrl());
}

export function openMatchesSupportEmail(ctx: MatchesSupportContext): void {
  void Linking.openURL(getMatchesSupportMailtoUrl(ctx));
}
