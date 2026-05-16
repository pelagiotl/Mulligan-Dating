import type { ConnectShellMode } from './connectShellTheme';

/** Visual tokens for the floating launch countdown — aligned with Connect landing hero + chrome. */
export type LaunchCountdownTheme = {
  collapsedGradient: readonly [string, string, ...string[]];
  collapsedGradientLocations?: readonly [number, number, ...number[]];
  collapsedBorder: string;
  expandedGradient: readonly [string, string, ...string[]];
  expandedGradientLocations?: readonly [number, number, ...number[]];
  expandedBorder: string;
  expandedShadowColor: string;
  sheenColors: readonly [string, string, ...string[]];
  accentColors: readonly [string, string, ...string[]];
  hourglassBadgeBg: string;
  hourglassBadgeBorder: string;
  heading: string;
  sub: string;
  value: string;
  unit: string;
  liveMsg: string;
  dragHint: string;
  dragGrip: string;
  collapsedLabel: string;
  collapsedCue: string;
  cellGradient: readonly [string, string, ...string[]];
  cellBorder: string;
  minimizeBg: string;
  minimizeBorder: string;
  minimizeText: string;
};

const midnight: LaunchCountdownTheme = {
  collapsedGradient: ['#2d2648', '#1a1528', '#211d33', '#121018'],
  collapsedGradientLocations: [0, 0.4, 0.7, 1],
  collapsedBorder: 'rgba(167, 139, 250, 0.38)',
  expandedGradient: ['#211d33', '#181427', '#1a1528', '#121018'],
  expandedGradientLocations: [0, 0.35, 0.7, 1],
  expandedBorder: 'rgba(167, 139, 250, 0.32)',
  expandedShadowColor: '#000',
  sheenColors: ['rgba(167, 139, 250, 0.28)', 'rgba(167, 139, 250, 0.08)', 'transparent'],
  accentColors: ['rgba(167, 139, 250, 0.95)', 'rgba(192, 132, 252, 0.85)', 'rgba(99, 102, 241, 0.7)'],
  hourglassBadgeBg: 'rgba(30, 27, 46, 0.92)',
  hourglassBadgeBorder: 'rgba(167, 139, 250, 0.35)',
  heading: '#f8fafc',
  sub: '#cbd5e1',
  value: '#f1f5f9',
  unit: '#94a3b8',
  liveMsg: '#e2e8f0',
  dragHint: '#94a3b8',
  dragGrip: 'rgba(148, 163, 184, 0.45)',
  collapsedLabel: '#f3e8ff',
  collapsedCue: '#94a3b8',
  cellGradient: ['rgba(38, 32, 58, 0.98)', 'rgba(28, 24, 44, 0.99)', 'rgba(33, 29, 51, 0.97)'],
  cellBorder: 'rgba(167, 139, 250, 0.35)',
  minimizeBg: 'rgba(30, 27, 46, 0.85)',
  minimizeBorder: 'rgba(167, 139, 250, 0.4)',
  minimizeText: '#e9d5ff',
};

const sunny: LaunchCountdownTheme = {
  collapsedGradient: ['#fffbeb', '#fef3c7', '#fde68a', '#fff7ed'],
  collapsedGradientLocations: [0, 0.35, 0.65, 1],
  collapsedBorder: 'rgba(251, 191, 36, 0.45)',
  expandedGradient: ['#ffffff', '#fffbeb', '#fef3c7', '#fff7fb'],
  expandedGradientLocations: [0, 0.3, 0.62, 1],
  expandedBorder: 'rgba(251, 191, 36, 0.4)',
  expandedShadowColor: '#ea580c',
  sheenColors: ['rgba(251, 191, 36, 0.22)', 'rgba(251, 146, 60, 0.1)', 'transparent'],
  accentColors: ['rgba(234, 88, 12, 0.9)', 'rgba(251, 146, 60, 0.85)', 'rgba(56, 189, 248, 0.75)'],
  hourglassBadgeBg: 'rgba(255, 255, 255, 0.95)',
  hourglassBadgeBorder: 'rgba(251, 191, 36, 0.45)',
  heading: '#9a3412',
  sub: '#78716c',
  value: '#1c1917',
  unit: '#78716c',
  liveMsg: '#57534e',
  dragHint: '#a8a29e',
  dragGrip: 'rgba(180, 83, 9, 0.35)',
  collapsedLabel: '#9a3412',
  collapsedCue: '#a8a29e',
  cellGradient: ['rgba(255, 255, 255, 0.98)', 'rgba(255, 251, 235, 0.99)', 'rgba(254, 243, 199, 0.95)'],
  cellBorder: 'rgba(251, 146, 60, 0.35)',
  minimizeBg: 'rgba(255, 255, 255, 0.88)',
  minimizeBorder: 'rgba(234, 88, 12, 0.35)',
  minimizeText: '#c2410c',
};

const soft: LaunchCountdownTheme = {
  collapsedGradient: ['#ffffff', '#f5f3ff', '#ede9fe', '#faf5ff'],
  collapsedGradientLocations: [0, 0.35, 0.65, 1],
  collapsedBorder: 'rgba(148, 163, 184, 0.45)',
  expandedGradient: ['#ffffff', '#faf5ff', '#f5f3ff', '#fdf2f8'],
  expandedGradientLocations: [0, 0.3, 0.62, 1],
  expandedBorder: 'rgba(255, 255, 255, 0.9)',
  expandedShadowColor: '#667eea',
  sheenColors: ['rgba(102, 126, 234, 0.18)', 'rgba(167, 139, 250, 0.08)', 'transparent'],
  accentColors: ['rgba(102, 126, 234, 0.9)', 'rgba(118, 75, 162, 0.85)', 'rgba(240, 147, 251, 0.75)'],
  hourglassBadgeBg: 'rgba(255, 255, 255, 0.95)',
  hourglassBadgeBorder: 'rgba(226, 232, 240, 0.95)',
  heading: '#0f0f0f',
  sub: '#64748b',
  value: '#1e293b',
  unit: '#64748b',
  liveMsg: '#475569',
  dragHint: '#94a3b8',
  dragGrip: 'rgba(148, 163, 184, 0.45)',
  collapsedLabel: '#4c1d95',
  collapsedCue: '#94a3b8',
  cellGradient: ['rgba(255, 255, 255, 0.98)', 'rgba(248, 250, 252, 0.99)', 'rgba(243, 244, 255, 0.95)'],
  cellBorder: 'rgba(148, 163, 184, 0.35)',
  minimizeBg: 'rgba(255, 255, 255, 0.85)',
  minimizeBorder: 'rgba(102, 126, 234, 0.3)',
  minimizeText: '#5b21b6',
};

export function launchCountdownTheme(shell: ConnectShellMode): LaunchCountdownTheme {
  switch (shell) {
    case 'sunny':
      return sunny;
    case 'soft':
      return soft;
    default:
      return midnight;
  }
}
