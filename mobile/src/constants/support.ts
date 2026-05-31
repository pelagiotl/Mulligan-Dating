import { Linking, Platform } from 'react-native';

export const SUPPORT_EMAIL = 'Mulligandating@gmail.com';

const CREATE_PROFILE_SUPPORT_SUBJECT = 'Mulligan — help creating my profile';
const MATCHES_SUPPORT_SUBJECT = 'Mulligan — question from Matches';

export type MatchesSupportContext = {
  userId?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  surface?: 'android' | 'ios';
  availableTokens?: number;
  activeMatches?: number;
  slotLimit?: number;
};

function supportFieldLine(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  return `${label}: ${trimmed ? trimmed : '—'}`;
}

function matchesSupportSurface(): 'android' | 'ios' {
  return Platform.OS === 'android' ? 'android' : 'ios';
}

/** Per-line encoding avoids `+` for spaces (URLSearchParams / form-style mailto bugs). */
function encodeMailtoBody(lines: string[]): string {
  return lines.map((line) => encodeURIComponent(line)).join('%0D%0A');
}

function buildMatchesSupportBodyLines(ctx: MatchesSupportContext): string[] {
  const surface = ctx.surface ?? matchesSupportSurface();
  const lines = [
    'Hi Mulligan team,',
    '',
    'I have a question about my Matches tab.',
    '',
    supportFieldLine('Name', ctx.displayName),
    supportFieldLine('Phone', ctx.phoneNumber),
    supportFieldLine('User ID', ctx.userId ?? undefined),
    supportFieldLine('App', surface),
  ];
  if (ctx.availableTokens != null) {
    lines.push(`Mulligans available: ${ctx.availableTokens}`);
  }
  if (ctx.activeMatches != null && ctx.slotLimit != null) {
    lines.push(`Active connections: ${ctx.activeMatches} / ${ctx.slotLimit}`);
  }
  lines.push('', 'Thanks!');
  return lines;
}

export function getCreateProfileSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CREATE_PROFILE_SUPPORT_SUBJECT)}`;
}

export function getMatchesSupportMailtoUrl(ctx: MatchesSupportContext): string {
  const body = encodeMailtoBody(buildMatchesSupportBodyLines(ctx));
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(MATCHES_SUPPORT_SUBJECT)}&body=${body}`;
}

export function openCreateProfileSupportEmail(): void {
  void Linking.openURL(getCreateProfileSupportMailtoUrl());
}

export function openMatchesSupportEmail(ctx: MatchesSupportContext): void {
  void Linking.openURL(getMatchesSupportMailtoUrl(ctx));
}
