import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key as web (`frontend/src/lib/connectShellTheme.ts`) for mental parity across surfaces. */
export const CONNECT_SHELL_STORAGE_KEY = 'mulligan-connect-shell';

/** Midnight = graphite hero + dark chrome; sunny = warm sunrise; soft = pastel purple pill + cool gradient chrome. */
export type ConnectShellMode = 'midnight' | 'sunny' | 'soft';

/** Default for new installs when nothing is stored yet. */
export const DEFAULT_CONNECT_SHELL_MODE: ConnectShellMode = 'midnight';

const CONNECT_SHELL_CYCLE: ConnectShellMode[] = ['midnight', 'sunny', 'soft'];

function isConnectShellMode(v: string | null): v is ConnectShellMode {
  return v === 'midnight' || v === 'sunny' || v === 'soft';
}

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
    case 'midnight':
      return 'Midnight';
    case 'sunny':
      return 'Sunny';
    case 'soft':
      return 'Soft';
  }
}

/** Perimeter trace on Connect landing / floating button (mobile). */
export type ConnectButtonShimmerColors = {
  trace: string;
  resting: string;
  glow: string;
};

/** Sober Circle match button — green perimeter trace. */
export const soberCircleButtonShimmerColors: ConnectButtonShimmerColors = {
  trace: 'rgba(187, 247, 208, 0.98)',
  resting: 'rgba(74, 222, 128, 0.36)',
  glow: '#4ade80',
};

/** Live Dates signup button — warm pink/purple perimeter trace. */
export const liveDatesButtonShimmerColors: ConnectButtonShimmerColors = {
  trace: 'rgba(255, 255, 255, 0.95)',
  resting: 'rgba(240, 147, 251, 0.38)',
  glow: '#f472b6',
};

/** Matches list row — warm blush cards (soft/sunny) or dark glass (midnight). */
export type MatchListCardColors = {
  background: string;
  border: string;
  shadowColor: string;
  shadowOpacity: number;
  perimeterGradient: readonly [string, string, ...string[]];
  perimeterGlow: string;
  shimmer: string;
  name: string;
  nameUnread: string;
  age: string;
  location: string;
  activeStatus: string;
  timer: string;
  compatText: string;
  compatBg: string;
  compatBorder: string;
  unmatchBg: string;
  unmatchBorder: string;
};

export function matchListCardColors(mode: ConnectShellMode): MatchListCardColors {
  switch (mode) {
    case 'midnight':
      return {
        background: 'rgba(28, 24, 38, 0.98)',
        border: 'rgba(244, 114, 182, 0.22)',
        shadowColor: '#000',
        shadowOpacity: 0.35,
        perimeterGradient: ['#a78bfa', '#f472b6', '#ec4899', '#a78bfa'] as const,
        perimeterGlow: 'rgba(167, 139, 250, 0.55)',
        shimmer: 'rgba(255, 255, 255, 0.12)',
        name: '#f1f5f9',
        nameUnread: '#fda4af',
        age: '#cbd5e1',
        location: '#94a3b8',
        activeStatus: '#4ade80',
        timer: '#fcd34d',
        compatText: '#fecdd3',
        compatBg: 'rgba(244, 114, 182, 0.14)',
        compatBorder: 'rgba(244, 114, 182, 0.32)',
        unmatchBg: 'rgba(38, 32, 52, 0.95)',
        unmatchBorder: 'rgba(248, 113, 113, 0.35)',
      };
    case 'sunny':
      return {
        background: '#fff7ed',
        border: 'rgba(251, 191, 36, 0.38)',
        shadowColor: '#fb923c',
        shadowOpacity: 0.16,
        perimeterGradient: ['#fcd34d', '#fb923c', '#ea580c', '#fcd34d'] as const,
        perimeterGlow: 'rgba(251, 146, 60, 0.5)',
        shimmer: 'rgba(255, 255, 255, 0.5)',
        name: '#431407',
        nameUnread: '#be123c',
        age: '#78716c',
        location: '#92400e',
        activeStatus: '#15803d',
        timer: '#b45309',
        compatText: '#9a3412',
        compatBg: 'rgba(254, 215, 170, 0.55)',
        compatBorder: 'rgba(234, 88, 12, 0.28)',
        unmatchBg: '#fffbeb',
        unmatchBorder: '#fecaca',
      };
    case 'soft':
      return {
        background: '#fff5f8',
        border: 'rgba(102, 126, 234, 0.18)',
        shadowColor: '#667eea',
        shadowOpacity: 0.14,
        perimeterGradient: ['#818cf8', '#f472b6', '#667eea', '#818cf8'] as const,
        perimeterGlow: 'rgba(102, 126, 234, 0.45)',
        shimmer: 'rgba(255, 255, 255, 0.45)',
        name: '#4c1d95',
        nameUnread: '#7f1d1d',
        age: '#64748b',
        location: '#475569',
        activeStatus: '#15803d',
        timer: '#b45309',
        compatText: '#6b21a8',
        compatBg: 'rgba(237, 233, 254, 0.85)',
        compatBorder: 'rgba(102, 126, 234, 0.28)',
        unmatchBg: '#ffffff',
        unmatchBorder: '#fecdd3',
      };
  }
}

/** Full-screen chrome gradient — aligned with web `--native-gradient-screen` (soft). */
export const CONNECT_SHELL_SOFT_GRADIENT = [
  '#667eea',
  '#764ba2',
  '#a855f7',
  '#ec4899',
  '#38bdf8',
] as const;

export const CONNECT_SHELL_MIDNIGHT_GRADIENT = [
  '#15102a',
  '#221a32',
  '#1a1528',
  '#0f172a',
] as const;

export const CONNECT_SHELL_SUNNY_GRADIENT = [
  '#38bdf8',
  '#fcd34d',
  '#fb923c',
  '#fda4af',
  '#fef08a',
] as const;

export function connectShellGradientStops(mode: ConnectShellMode): readonly string[] {
  switch (mode) {
    case 'midnight':
      return CONNECT_SHELL_MIDNIGHT_GRADIENT;
    case 'sunny':
      return CONNECT_SHELL_SUNNY_GRADIENT;
    case 'soft':
      return CONNECT_SHELL_SOFT_GRADIENT;
  }
}

/** Matches tab Limits card — aligned with web `--limits-*` per shell. */
export type ConnectionLimitsPanelColors = {
  shellGradient: readonly [string, string, ...string[]];
  accentGradient: readonly [string, string, ...string[]];
  shellBorder: string;
  eyebrow: string;
  lede: string;
  hideBorder: string;
  hideBg: string;
  hideText: string;
  collapsedBarBg: string;
  collapsedBarBorder: string;
  collapsedGem: string;
  collapsedStat: string;
  collapsedStatFull: string;
  collapsedAction: string;
  collapsedDivider: string;
  metricBg: string;
  metricBorder: string;
  metricTokensBg: string;
  metricTokensBorder: string;
  metricSlotsBg: string;
  metricSlotsBorder: string;
  metricFullBg: string;
  metricFullBorder: string;
  iconWrapBg: string;
  iconWrapBorder: string;
  iconWrapTokensBorder: string;
  iconWrapSlotsBorder: string;
  label: string;
  value: string;
  valueFull: string;
  denom: string;
  trackBg: string;
  fillTokens: string;
  fillSlots: string;
  fillFull: string;
  chipText: string;
  chipBg: string;
  chipBorder: string;
  noteBg: string;
  noteText: string;
  noteCapacityBg: string;
  noteCapacityText: string;
  loadingText: string;
  shadowColor: string;
};

export function connectionLimitsPanelColors(mode: ConnectShellMode): ConnectionLimitsPanelColors {
  switch (mode) {
    case 'midnight':
      return {
        shellGradient: ['#1c1826', '#1e1b2e', '#16122a'],
        accentGradient: ['#a78bfa', '#c084fc', '#f472b6'],
        shellBorder: 'rgba(167, 139, 250, 0.22)',
        eyebrow: '#c4b5fd',
        lede: '#94a3b8',
        hideBorder: 'rgba(167, 139, 250, 0.2)',
        hideBg: 'rgba(38, 32, 52, 0.9)',
        hideText: '#94a3b8',
        collapsedBarBg: 'rgba(30, 27, 46, 0.95)',
        collapsedBarBorder: 'rgba(167, 139, 250, 0.22)',
        collapsedGem: 'rgba(196, 181, 253, 0.55)',
        collapsedStat: '#e2e8f0',
        collapsedStatFull: '#fda4af',
        collapsedAction: '#94a3b8',
        collapsedDivider: 'rgba(167, 139, 250, 0.2)',
        metricBg: 'rgba(38, 32, 52, 0.75)',
        metricBorder: 'rgba(167, 139, 250, 0.12)',
        metricTokensBg: 'rgba(46, 40, 72, 0.9)',
        metricTokensBorder: 'rgba(129, 140, 248, 0.28)',
        metricSlotsBg: 'rgba(52, 32, 48, 0.9)',
        metricSlotsBorder: 'rgba(244, 114, 182, 0.22)',
        metricFullBg: 'rgba(52, 28, 44, 0.95)',
        metricFullBorder: 'rgba(244, 114, 182, 0.35)',
        iconWrapBg: 'rgba(22, 18, 34, 0.95)',
        iconWrapBorder: 'rgba(167, 139, 250, 0.15)',
        iconWrapTokensBorder: 'rgba(129, 140, 248, 0.32)',
        iconWrapSlotsBorder: 'rgba(244, 114, 182, 0.28)',
        label: '#94a3b8',
        value: '#f1f5f9',
        valueFull: '#fda4af',
        denom: 'rgba(226, 232, 240, 0.35)',
        trackBg: 'rgba(15, 12, 22, 0.55)',
        fillTokens: '#a78bfa',
        fillSlots: '#f472b6',
        fillFull: '#fb7185',
        chipText: '#6ee7b7',
        chipBg: 'rgba(16, 185, 129, 0.14)',
        chipBorder: 'rgba(52, 211, 153, 0.28)',
        noteBg: 'rgba(15, 12, 22, 0.45)',
        noteText: '#cbd5e1',
        noteCapacityBg: 'rgba(244, 114, 182, 0.1)',
        noteCapacityText: '#fda4af',
        loadingText: '#94a3b8',
        shadowColor: '#000',
      };
    case 'sunny':
      return {
        shellGradient: ['#fffdf7', '#fff7ed', '#fef3c7'],
        accentGradient: ['#38bdf8', '#fcd34d', '#fb923c'],
        shellBorder: 'rgba(251, 191, 36, 0.28)',
        eyebrow: '#c2410c',
        lede: '#9a3412',
        hideBorder: 'rgba(251, 191, 36, 0.28)',
        hideBg: 'rgba(255, 255, 255, 0.92)',
        hideText: '#78716c',
        collapsedBarBg: 'rgba(255, 253, 245, 0.96)',
        collapsedBarBorder: 'rgba(251, 191, 36, 0.24)',
        collapsedGem: 'rgba(234, 88, 12, 0.45)',
        collapsedStat: '#431407',
        collapsedStatFull: '#be123c',
        collapsedAction: '#78716c',
        collapsedDivider: 'rgba(251, 191, 36, 0.2)',
        metricBg: 'rgba(255, 255, 255, 0.82)',
        metricBorder: 'rgba(251, 191, 36, 0.14)',
        metricTokensBg: 'rgba(255, 255, 255, 0.98)',
        metricTokensBorder: 'rgba(56, 189, 248, 0.22)',
        metricSlotsBg: 'rgba(255, 255, 255, 0.98)',
        metricSlotsBorder: 'rgba(251, 146, 60, 0.22)',
        metricFullBg: 'rgba(255, 251, 235, 0.98)',
        metricFullBorder: 'rgba(234, 88, 12, 0.32)',
        iconWrapBg: '#ffffff',
        iconWrapBorder: 'rgba(251, 191, 36, 0.18)',
        iconWrapTokensBorder: 'rgba(56, 189, 248, 0.28)',
        iconWrapSlotsBorder: 'rgba(251, 146, 60, 0.26)',
        label: '#78716c',
        value: '#431407',
        valueFull: '#be123c',
        denom: 'rgba(67, 20, 7, 0.32)',
        trackBg: 'rgba(251, 191, 36, 0.15)',
        fillTokens: '#0ea5e9',
        fillSlots: '#f97316',
        fillFull: '#ea580c',
        chipText: '#15803d',
        chipBg: 'rgba(34, 197, 94, 0.12)',
        chipBorder: 'rgba(22, 163, 74, 0.22)',
        noteBg: 'rgba(255, 251, 235, 0.65)',
        noteText: '#78350f',
        noteCapacityBg: 'rgba(254, 215, 170, 0.45)',
        noteCapacityText: '#c2410c',
        loadingText: '#78716c',
        shadowColor: '#fb923c',
      };
    case 'soft':
      return {
        shellGradient: ['#ffffff', '#fcf8ff', '#ede9fe'],
        accentGradient: ['#818cf8', '#a78bfa', '#f472b6'],
        shellBorder: 'rgba(102, 126, 234, 0.16)',
        eyebrow: '#6d28d9',
        lede: '#64748b',
        hideBorder: 'rgba(102, 126, 234, 0.14)',
        hideBg: 'rgba(255, 255, 255, 0.92)',
        hideText: '#64748b',
        collapsedBarBg: 'rgba(255, 255, 255, 0.94)',
        collapsedBarBorder: 'rgba(102, 126, 234, 0.16)',
        collapsedGem: 'rgba(109, 40, 217, 0.4)',
        collapsedStat: '#312e81',
        collapsedStatFull: '#be185d',
        collapsedAction: '#64748b',
        collapsedDivider: 'rgba(102, 126, 234, 0.14)',
        metricBg: 'rgba(255, 255, 255, 0.85)',
        metricBorder: 'rgba(102, 126, 234, 0.1)',
        metricTokensBg: 'rgba(255, 255, 255, 0.98)',
        metricTokensBorder: 'rgba(99, 102, 241, 0.18)',
        metricSlotsBg: 'rgba(255, 255, 255, 0.98)',
        metricSlotsBorder: 'rgba(236, 72, 153, 0.14)',
        metricFullBg: 'rgba(255, 255, 255, 0.98)',
        metricFullBorder: 'rgba(139, 21, 56, 0.2)',
        iconWrapBg: '#ffffff',
        iconWrapBorder: 'rgba(102, 126, 234, 0.1)',
        iconWrapTokensBorder: 'rgba(99, 102, 241, 0.2)',
        iconWrapSlotsBorder: 'rgba(244, 63, 94, 0.16)',
        label: '#64748b',
        value: '#312e81',
        valueFull: '#9f1239',
        denom: 'rgba(49, 46, 129, 0.3)',
        trackBg: 'rgba(102, 126, 234, 0.1)',
        fillTokens: '#6366f1',
        fillSlots: '#f43f5e',
        fillFull: '#be123c',
        chipText: '#047857',
        chipBg: 'rgba(16, 185, 129, 0.1)',
        chipBorder: 'rgba(16, 185, 129, 0.18)',
        noteBg: 'rgba(237, 233, 254, 0.35)',
        noteText: '#475569',
        noteCapacityBg: 'rgba(252, 231, 243, 0.55)',
        noteCapacityText: '#9f1239',
        loadingText: '#64748b',
        shadowColor: '#667eea',
      };
  }
}

/** Profile tab — header, sections, hero cards, bio (aligned with web `--profile-*`). */
export type ProfilePageColors = {
  headerGradient: readonly [string, string, ...string[]];
  headerBorder: string;
  headerShadowColor: string;
  nameColor: string;
  nameTextShadow: string;
  sectionBg: string;
  sectionTitleColor: string;
  sectionTitleTextShadow: string;
  sectionEditLink: string;
  sectionEmptyHint: string;
  bioGradient: readonly [string, string, ...string[]];
  bioBorder: string;
  bioTitle: string;
  bioAccent: string;
  bioText: string;
  bioPlaceholder: string;
  loadingSpinner: string;
  loadingText: string;
  avatarBorder: string;
  avatarShadow: string;
  avatarOrb: string;
  shimmerOverlay: string;
  ringOuter: readonly [string, string, ...string[]];
  ringMiddle: readonly [string, string, ...string[]];
  ringInner: readonly [string, string, ...string[]];
  traceMember: readonly [string, string, ...string[]];
  traceActive: readonly [string, string, ...string[]];
  traceDisplay: readonly [string, string, ...string[]];
  traceAge: readonly [string, string, ...string[]];
  traceGender: readonly [string, string, ...string[]];
  traceLocation: readonly [string, string, ...string[]];
  traceDistance: readonly [string, string, ...string[]];
  tracePreferred: readonly [string, string, ...string[]];
  traceLooking: readonly [string, string, ...string[]];
  traceBio: readonly [string, string, ...string[]];
  traceSection: readonly [string, string, ...string[]];
  traceSectionInterests: readonly [string, string, ...string[]];
  traceSectionDealbreakers: readonly [string, string, ...string[]];
  traceSectionLooking: readonly [string, string, ...string[]];
  traceSectionLifestyle: readonly [string, string, ...string[]];
  gradMember: readonly [string, string, ...string[]];
  gradActive: readonly [string, string, ...string[]];
  gradPreview: readonly [string, string, ...string[]];
  gradDisplay: readonly [string, string, ...string[]];
  gradAge: readonly [string, string, ...string[]];
  gradGender: readonly [string, string, ...string[]];
  gradLocation: readonly [string, string, ...string[]];
  gradDistance: readonly [string, string, ...string[]];
  gradPreferred: readonly [string, string, ...string[]];
  gradLooking: readonly [string, string, ...string[]];
};

const PROFILE_TRACE_LIGHT: readonly [string, string, string, string] = [
  'rgba(255,255,255,0.95)',
  '#667eea',
  '#764ba2',
  'rgba(255,255,255,0.95)',
];

export function profilePageColors(mode: ConnectShellMode): ProfilePageColors {
  switch (mode) {
    case 'midnight':
      return {
        headerGradient: [
          'rgba(28, 24, 38, 0.98)',
          'rgba(30, 27, 46, 0.96)',
          'rgba(24, 20, 36, 0.98)',
          'rgba(30, 27, 46, 0.96)',
        ],
        headerBorder: 'rgba(167, 139, 250, 0.28)',
        headerShadowColor: '#000',
        nameColor: '#f1f5f9',
        nameTextShadow: 'rgba(167, 139, 250, 0.35)',
        sectionBg: 'rgba(30, 27, 46, 0.96)',
        sectionTitleColor: '#f1f5f9',
        sectionTitleTextShadow: 'rgba(167, 139, 250, 0.25)',
        sectionEditLink: '#c4b5fd',
        sectionEmptyHint: '#94a3b8',
        bioGradient: ['rgba(38, 32, 52, 0.95)', 'rgba(30, 27, 46, 0.92)', 'rgba(38, 32, 52, 0.9)'],
        bioBorder: 'rgba(167, 139, 250, 0.2)',
        bioTitle: '#c4b5fd',
        bioAccent: 'rgba(167, 139, 250, 0.5)',
        bioText: '#cbd5e1',
        bioPlaceholder: '#64748b',
        loadingSpinner: '#a78bfa',
        loadingText: '#94a3b8',
        avatarBorder: 'rgba(30, 27, 46, 0.95)',
        avatarShadow: '#a78bfa',
        avatarOrb: '#7c3aed',
        shimmerOverlay: 'rgba(255, 255, 255, 0.12)',
        ringOuter: ['#f472b6', '#ec4899', '#a78bfa', '#7c3aed', '#f472b6'],
        ringMiddle: ['#c084fc', '#a78bfa', '#818cf8', '#7c3aed', '#c084fc'],
        ringInner: ['#a78bfa', '#7c3aed', '#f472b6', '#ec4899', '#a78bfa'],
        traceMember: ['rgba(196, 181, 253, 0.5)', '#a78bfa', '#7c3aed', 'rgba(196, 181, 253, 0.5)'],
        traceActive: ['rgba(244, 114, 182, 0.45)', '#f472b6', '#ec4899', 'rgba(244, 114, 182, 0.45)'],
        traceDisplay: ['rgba(196, 181, 253, 0.5)', '#a78bfa', '#f472b6', 'rgba(196, 181, 253, 0.5)'],
        traceAge: ['rgba(196, 181, 253, 0.5)', '#a78bfa', '#7c3aed', 'rgba(196, 181, 253, 0.5)'],
        traceGender: ['rgba(244, 114, 182, 0.45)', '#f472b6', '#ec4899', 'rgba(244, 114, 182, 0.45)'],
        traceLocation: ['rgba(129, 140, 248, 0.45)', '#818cf8', '#6366f1', 'rgba(129, 140, 248, 0.45)'],
        traceDistance: ['rgba(52, 211, 153, 0.4)', '#34d399', '#10b981', 'rgba(52, 211, 153, 0.4)'],
        tracePreferred: ['rgba(196, 181, 253, 0.5)', '#c084fc', '#e879f9', 'rgba(196, 181, 253, 0.5)'],
        traceLooking: ['rgba(244, 114, 182, 0.45)', '#fda4af', '#f472b6', 'rgba(244, 114, 182, 0.45)'],
        traceBio: ['#a78bfa', '#f472b6', '#c084fc', 'rgba(196, 181, 253, 0.4)'],
        traceSection: ['rgba(196, 181, 253, 0.45)', '#a78bfa', '#7c3aed', '#f472b6'],
        traceSectionInterests: ['rgba(244, 114, 182, 0.45)', '#f472b6', '#ec4899', '#a78bfa'],
        traceSectionDealbreakers: ['rgba(248, 113, 113, 0.4)', '#f87171', '#f472b6', '#a78bfa'],
        traceSectionLooking: ['rgba(244, 114, 182, 0.45)', '#f472b6', '#e879f9', '#a78bfa'],
        traceSectionLifestyle: ['rgba(52, 211, 153, 0.4)', '#34d399', '#a78bfa', '#7c3aed'],
        gradMember: ['#4c1d95', '#6b21a8', '#7c3aed'],
        gradActive: ['#6b21a8', '#9333ea', '#db2777', '#ec4899'],
        gradPreview: ['#4c1d95', '#6b21a8', '#7c3aed', '#db2777'],
        gradDisplay: ['#4c1d95', '#6b21a8', '#7c3aed', '#db2777'],
        gradAge: ['#4c1d95', '#6b21a8', '#7c3aed'],
        gradGender: ['#7c3aed', '#db2777', '#ec4899'],
        gradLocation: ['#4338ca', '#6366f1', '#818cf8'],
        gradDistance: ['#065f46', '#047857', '#10b981'],
        gradPreferred: ['#5b21b6', '#7c3aed', '#c084fc'],
        gradLooking: ['#9f1239', '#db2777', '#f472b6'],
      };
    case 'sunny':
      return {
        headerGradient: [
          'rgba(255, 253, 245, 0.98)',
          'rgba(255, 247, 237, 0.96)',
          'rgba(255, 253, 245, 0.98)',
          'rgba(254, 243, 199, 0.92)',
        ],
        headerBorder: 'rgba(251, 191, 36, 0.35)',
        headerShadowColor: '#fb923c',
        nameColor: '#431407',
        nameTextShadow: 'rgba(234, 88, 12, 0.2)',
        sectionBg: 'rgba(255, 253, 245, 0.98)',
        sectionTitleColor: '#431407',
        sectionTitleTextShadow: 'rgba(251, 146, 60, 0.2)',
        sectionEditLink: '#c2410c',
        sectionEmptyHint: '#78716c',
        bioGradient: ['rgba(255, 251, 235, 0.95)', 'rgba(255, 247, 237, 0.9)', 'rgba(254, 243, 199, 0.85)'],
        bioBorder: 'rgba(251, 191, 36, 0.28)',
        bioTitle: '#c2410c',
        bioAccent: 'rgba(251, 146, 60, 0.5)',
        bioText: '#78350f',
        bioPlaceholder: '#a8a29e',
        loadingSpinner: '#ea580c',
        loadingText: '#78716c',
        avatarBorder: '#fffbeb',
        avatarShadow: '#fb923c',
        avatarOrb: '#f97316',
        shimmerOverlay: 'rgba(255, 255, 255, 0.35)',
        ringOuter: ['#fcd34d', '#fb923c', '#ea580c', '#f97316', '#fcd34d'],
        ringMiddle: ['#38bdf8', '#0ea5e9', '#fb923c', '#ea580c', '#38bdf8'],
        ringInner: ['#fb923c', '#ea580c', '#fcd34d', '#f97316', '#fb923c'],
        traceMember: ['rgba(255,255,255,0.95)', '#0ea5e9', '#ea580c', 'rgba(255,255,255,0.95)'],
        traceActive: ['rgba(255,255,255,0.95)', '#fb923c', '#ea580c', 'rgba(255,255,255,0.95)'],
        traceDisplay: ['rgba(255,255,255,0.95)', '#0ea5e9', '#fb923c', 'rgba(255,255,255,0.95)'],
        traceAge: PROFILE_TRACE_LIGHT,
        traceGender: ['rgba(255,255,255,0.95)', '#f093fb', '#f5576c', 'rgba(255,255,255,0.95)'],
        traceLocation: ['rgba(255,255,255,0.95)', '#38bdf8', '#0ea5e9', 'rgba(255,255,255,0.95)'],
        traceDistance: ['rgba(255,255,255,0.95)', '#22c55e', '#16a34a', 'rgba(255,255,255,0.95)'],
        tracePreferred: ['rgba(255,255,255,0.95)', '#fb923c', '#ea580c', 'rgba(255,255,255,0.95)'],
        traceLooking: ['rgba(255,255,255,0.95)', '#f472b6', '#ec4899', 'rgba(255,255,255,0.95)'],
        traceBio: ['#fb923c', '#fcd34d', '#ea580c', 'rgba(255,255,255,0.95)'],
        traceSection: ['rgba(255,255,255,0.95)', '#0ea5e9', '#ea580c', '#fcd34d'],
        traceSectionInterests: ['rgba(255,255,255,0.95)', '#f5576c', '#f093fb', '#ea580c'],
        traceSectionDealbreakers: ['rgba(255,255,255,0.95)', '#ef4444', '#f5576c', '#fb923c'],
        traceSectionLooking: ['rgba(255,255,255,0.95)', '#f093fb', '#fb923c', '#ea580c'],
        traceSectionLifestyle: ['rgba(255,255,255,0.95)', '#22c55e', '#38bdf8', '#ea580c'],
        gradMember: ['#0ea5e9', '#0284c7', '#0369a1'],
        gradActive: ['#fb923c', '#f97316', '#ea580c'],
        gradPreview: ['#0ea5e9', '#38bdf8', '#fb923c', '#ea580c'],
        gradDisplay: ['#0ea5e9', '#38bdf8', '#fb923c'],
        gradAge: ['#0ea5e9', '#0284c7'],
        gradGender: ['#f093fb', '#f5576c'],
        gradLocation: ['#38bdf8', '#0ea5e9'],
        gradDistance: ['#22c55e', '#16a34a'],
        gradPreferred: ['#fb923c', '#ea580c', '#fcd34d'],
        gradLooking: ['#fda4af', '#fb7185', '#f472b6'],
      };
    case 'soft':
      return {
        headerGradient: [
          'rgba(255, 255, 255, 0.98)',
          'rgba(255, 245, 248, 0.95)',
          'rgba(255, 255, 255, 0.98)',
          'rgba(250, 250, 255, 0.95)',
        ],
        headerBorder: 'rgba(255, 255, 255, 0.9)',
        headerShadowColor: '#667eea',
        nameColor: '#1a1a1a',
        nameTextShadow: 'rgba(102, 126, 234, 0.25)',
        sectionBg: 'rgba(255, 255, 255, 0.98)',
        sectionTitleColor: '#1a1a1a',
        sectionTitleTextShadow: 'rgba(102, 126, 234, 0.25)',
        sectionEditLink: '#667eea',
        sectionEmptyHint: '#64748b',
        bioGradient: ['rgba(102, 126, 234, 0.08)', 'rgba(240, 147, 251, 0.06)', 'rgba(102, 126, 234, 0.06)'],
        bioBorder: 'rgba(102, 126, 234, 0.18)',
        bioTitle: '#4f46e5',
        bioAccent: 'rgba(102, 126, 234, 0.45)',
        bioText: '#334155',
        bioPlaceholder: '#94a3b8',
        loadingSpinner: '#667eea',
        loadingText: '#64748b',
        avatarBorder: '#fff',
        avatarShadow: '#667eea',
        avatarOrb: '#667eea',
        shimmerOverlay: 'rgba(255, 255, 255, 0.3)',
        ringOuter: ['#f093fb', '#f5576c', '#667eea', '#764ba2', '#f093fb'],
        ringMiddle: ['#4facfe', '#00f2fe', '#667eea', '#764ba2', '#4facfe'],
        ringInner: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#667eea'],
        traceMember: PROFILE_TRACE_LIGHT,
        traceActive: ['rgba(255,255,255,0.95)', '#f093fb', '#f5576c', 'rgba(255,255,255,0.95)'],
        traceDisplay: ['rgba(255,255,255,0.95)', '#667eea', '#f093fb', 'rgba(255,255,255,0.95)'],
        traceAge: PROFILE_TRACE_LIGHT,
        traceGender: ['rgba(255,255,255,0.95)', '#f093fb', '#f5576c', 'rgba(255,255,255,0.95)'],
        traceLocation: ['rgba(255,255,255,0.95)', '#4facfe', '#00f2fe', 'rgba(255,255,255,0.95)'],
        traceDistance: ['rgba(255,255,255,0.95)', '#43e97b', '#38f9d7', 'rgba(255,255,255,0.95)'],
        tracePreferred: ['rgba(255,255,255,0.95)', '#a78bfa', '#e879f9', 'rgba(255,255,255,0.95)'],
        traceLooking: ['rgba(255,255,255,0.95)', '#fda4af', '#f472b6', 'rgba(255,255,255,0.95)'],
        traceBio: ['#667eea', '#f093fb', '#c084fc', 'rgba(255,255,255,0.95)'],
        traceSection: ['rgba(255,255,255,0.95)', '#667eea', '#764ba2', '#f093fb'],
        traceSectionInterests: ['rgba(255,255,255,0.95)', '#f5576c', '#f093fb', '#667eea'],
        traceSectionDealbreakers: ['rgba(255,255,255,0.95)', '#ef4444', '#f5576c', '#a78bfa'],
        traceSectionLooking: ['rgba(255,255,255,0.95)', '#f093fb', '#e879f9', '#667eea'],
        traceSectionLifestyle: ['rgba(255,255,255,0.95)', '#43e97b', '#38f9d7', '#667eea'],
        gradMember: ['#667eea', '#764ba2'],
        gradActive: ['#f093fb', '#f5576c'],
        gradPreview: ['#667eea', '#764ba2', '#a855f7'],
        gradDisplay: ['#667eea', '#764ba2', '#f093fb'],
        gradAge: ['#667eea', '#764ba2'],
        gradGender: ['#f093fb', '#f5576c'],
        gradLocation: ['#4facfe', '#00f2fe'],
        gradDistance: ['#43e97b', '#38f9d7'],
        gradPreferred: ['#a78bfa', '#c084fc', '#e879f9'],
        gradLooking: ['#fda4af', '#fb7185', '#f472b6'],
      };
  }
}

export function connectButtonShimmerColors(mode: ConnectShellMode): ConnectButtonShimmerColors {
  switch (mode) {
    case 'midnight':
      return {
        trace: 'rgba(103, 232, 249, 0.95)',
        resting: 'rgba(103, 232, 249, 0.22)',
        glow: '#22d3ee',
      };
    case 'sunny':
      return {
        trace: 'rgba(255, 255, 255, 0.98)',
        resting: 'rgba(255, 255, 255, 0.42)',
        glow: '#fef08a',
      };
    case 'soft':
      return {
        trace: 'rgba(255, 255, 255, 0.95)',
        resting: 'rgba(255, 255, 255, 0.38)',
        glow: '#ddd6fe',
      };
  }
}

export async function loadConnectShellMode(userId?: string | null): Promise<ConnectShellMode> {
  try {
    if (userId) {
      const v = await AsyncStorage.getItem(connectShellStorageKey(userId));
      if (isConnectShellMode(v)) return v;
      return DEFAULT_CONNECT_SHELL_MODE;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONNECT_SHELL_MODE;
}

export async function saveConnectShellMode(
  mode: ConnectShellMode,
  userId?: string | null
): Promise<void> {
  try {
    await AsyncStorage.setItem(connectShellStorageKey(userId), mode);
  } catch {
    /* ignore */
  }
}

export async function resetConnectShellModeForNewUser(userId: string): Promise<void> {
  await saveConnectShellMode(DEFAULT_CONNECT_SHELL_MODE, userId);
}

/** Profile setup wizard chrome — aligned with Connect shell tokens per mode. */
export type CreateProfileChromeColors = {
  screenBg: string;
  actionsBg: string;
  actionsBorder: string;
  footnote: string;
};

export function createProfileChromeColors(mode: ConnectShellMode): CreateProfileChromeColors {
  switch (mode) {
    case 'midnight':
      return {
        screenBg: '#0c0a12',
        actionsBg: 'rgba(22, 18, 34, 0.98)',
        actionsBorder: 'rgba(167, 139, 250, 0.2)',
        footnote: '#94a3b8',
      };
    case 'sunny':
      return {
        screenBg: '#fff7ed',
        actionsBg: 'rgba(255, 253, 245, 0.98)',
        actionsBorder: 'rgba(251, 146, 60, 0.22)',
        footnote: '#9a3412',
      };
    case 'soft':
      return {
        screenBg: '#f4f6ff',
        actionsBg: 'rgba(252, 248, 255, 0.98)',
        actionsBorder: 'rgba(102, 126, 234, 0.18)',
        footnote: '#64748b',
      };
  }
}
