import type { ConnectShellMode } from './connectShellTheme';
import {
  ANDROID_SHELL_MIDNIGHT_BACKDROP,
  ANDROID_SHELL_SOFT_BACKDROP,
  ANDROID_SHELL_SUNNY_BACKDROP,
} from '../utils/androidConnectShellChrome';
import { launchCountdownTheme } from './launchCountdownTheme';

export type MatchCelebrationTheme = {
  backdrop: readonly [string, string, ...string[]];
  backdropLocations: readonly [number, number, ...number[]];
  scrim: string;
  cardGradient: readonly [string, string, ...string[]];
  cardGradientLocations: readonly [number, number, ...number[]];
  cardBorder: string;
  cardShadow: string;
  loadingCardGradient: readonly [string, string, ...string[]];
  loadingBorder: string;
  loadingTitle: string;
  loadingSub: string;
  loadingDot: string;
  title: string;
  titleAccent: string;
  subtitle: string;
  subtitleBold: string;
  explanationBg: string;
  explanationBorder: string;
  explanationTitle: string;
  explanationText: string;
  explanationBullet: string;
  primaryCta: readonly [string, string, ...string[]];
  secondaryBg: string;
  secondaryBorder: string;
  secondaryText: string;
  photoRing: string;
  photoBorder: string;
  placeholderGradient: readonly [string, string, ...string[]];
  confettiColors: readonly string[];
  /** Rising/falling particles — aligned with Connect value props + celebration copy. */
  floatingEmojis: readonly string[];
};

function midnightTheme(): MatchCelebrationTheme {
  const lc = launchCountdownTheme('midnight');
  return {
    backdrop: ANDROID_SHELL_MIDNIGHT_BACKDROP,
    backdropLocations: [0, 0.35, 0.7, 1],
    scrim: 'rgba(6, 8, 18, 0.78)',
    cardGradient: lc.expandedGradient,
    cardGradientLocations: lc.expandedGradientLocations ?? [0, 0.35, 0.7, 1],
    cardBorder: lc.expandedBorder,
    cardShadow: '#000',
    loadingCardGradient: ['#2d2648', '#211d33', '#1a1528'],
    loadingBorder: 'rgba(167, 139, 250, 0.42)',
    loadingTitle: lc.heading,
    loadingSub: lc.sub,
    loadingDot: '#c084fc',
    title: '#f8fafc',
    titleAccent: '#f0abfc',
    subtitle: '#cbd5e1',
    subtitleBold: '#f9a8d4',
    explanationBg: 'rgba(167, 139, 250, 0.12)',
    explanationBorder: 'rgba(167, 139, 250, 0.28)',
    explanationTitle: '#e9d5ff',
    explanationText: '#cbd5e1',
    explanationBullet: '#c084fc',
    primaryCta: ['#a855f7', '#6366f1', '#ec4899'],
    secondaryBg: 'rgba(30, 27, 46, 0.88)',
    secondaryBorder: 'rgba(244, 114, 182, 0.55)',
    secondaryText: '#fce7f3',
    photoRing: 'rgba(192, 132, 252, 0.55)',
    photoBorder: '#2d2648',
    placeholderGradient: ['#7c3aed', '#c026d3'],
    confettiColors: ['#a855f7', '#ec4899', '#6366f1', '#f472b6', '#c084fc'],
    floatingEmojis: ['✨', '❤️‍🔥', '💝', '🎯', '💕', '💖', '❤️‍🔥', '😍', '💌', '😉'],
  };
}

function sunnyTheme(): MatchCelebrationTheme {
  const lc = launchCountdownTheme('sunny');
  return {
    backdrop: ANDROID_SHELL_SUNNY_BACKDROP,
    backdropLocations: [0, 0.3, 0.65, 1],
    scrim: 'rgba(124, 45, 18, 0.45)',
    cardGradient: lc.expandedGradient,
    cardGradientLocations: lc.expandedGradientLocations ?? [0, 0.3, 0.62, 1],
    cardBorder: lc.expandedBorder,
    cardShadow: '#ea580c',
    loadingCardGradient: ['#ffffff', '#fffbeb', '#fef3c7'],
    loadingBorder: 'rgba(251, 191, 36, 0.5)',
    loadingTitle: lc.heading,
    loadingSub: lc.sub,
    loadingDot: '#fb923c',
    title: '#431407',
    titleAccent: '#ea580c',
    subtitle: '#78716c',
    subtitleBold: '#c2410c',
    explanationBg: 'rgba(251, 191, 36, 0.15)',
    explanationBorder: 'rgba(251, 146, 60, 0.35)',
    explanationTitle: '#9a3412',
    explanationText: '#57534e',
    explanationBullet: '#ea580c',
    primaryCta: ['#fbbf24', '#fb923c', '#38bdf8'],
    secondaryBg: 'rgba(255, 255, 255, 0.92)',
    secondaryBorder: 'rgba(234, 88, 12, 0.4)',
    secondaryText: '#c2410c',
    photoRing: 'rgba(251, 146, 60, 0.5)',
    photoBorder: '#fff',
    placeholderGradient: ['#fb923c', '#fbbf24'],
    confettiColors: ['#fbbf24', '#fb923c', '#38bdf8', '#fda4af', '#fde68a'],
    floatingEmojis: ['✨', '❤️‍🔥', '💝', '🎯', '💕', '❤️‍🔥', '😍', '💌', '🌹', '😉'],
  };
}

function softTheme(): MatchCelebrationTheme {
  const lc = launchCountdownTheme('soft');
  return {
    backdrop: ANDROID_SHELL_SOFT_BACKDROP,
    backdropLocations: [0, 0.25, 0.55, 0.8, 1],
    scrim: 'rgba(49, 46, 129, 0.42)',
    cardGradient: lc.expandedGradient,
    cardGradientLocations: lc.expandedGradientLocations ?? [0, 0.3, 0.62, 1],
    cardBorder: lc.expandedBorder,
    cardShadow: '#667eea',
    loadingCardGradient: ['#ffffff', '#f5f3ff', '#ede9fe'],
    loadingBorder: 'rgba(129, 140, 248, 0.45)',
    loadingTitle: lc.heading,
    loadingSub: lc.sub,
    loadingDot: '#818cf8',
    title: '#1e293b',
    titleAccent: '#7c3aed',
    subtitle: '#64748b',
    subtitleBold: '#6d28d9',
    explanationBg: 'rgba(102, 126, 234, 0.1)',
    explanationBorder: 'rgba(129, 140, 248, 0.35)',
    explanationTitle: '#5b21b6',
    explanationText: '#475569',
    explanationBullet: '#6366f1',
    primaryCta: ['#667eea', '#764ba2', '#f093fb'],
    secondaryBg: 'rgba(255, 255, 255, 0.94)',
    secondaryBorder: 'rgba(102, 126, 234, 0.45)',
    secondaryText: '#5b21b6',
    photoRing: 'rgba(129, 140, 248, 0.45)',
    photoBorder: '#fff',
    placeholderGradient: ['#667eea', '#a855f7'],
    confettiColors: ['#667eea', '#a855f7', '#f093fb', '#818cf8', '#c084fc'],
    floatingEmojis: ['✨', '❤️‍🔥', '💝', '🎯', '💕', '💖', '❤️‍🔥', '💌', '🦋', '😉'],
  };
}

export function matchCelebrationTheme(mode: ConnectShellMode): MatchCelebrationTheme {
  switch (mode) {
    case 'sunny':
      return sunnyTheme();
    case 'soft':
      return softTheme();
    default:
      return midnightTheme();
  }
}
