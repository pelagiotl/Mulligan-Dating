/** Shared with mobile ConnectButtonShimmerEffect / ConnectButtonHeartFireworks. */
export const CONNECT_SHIMMER_DURATION_MS = 3400;

/** Discover People card feature row — used for web Connect CTA falling particles. */
export const CONNECT_LANDING_FEATURE_EMOJIS = ['✨', '🎯', '💝'] as const;

export const CONNECT_TRACE_COLOR = 'rgba(103, 232, 249, 0.95)';
export const CONNECT_TRACE_EDGE_PX = 2.5;

export type ShootingHeartSpec = {
  emoji: string;
  left: string;
  delayMs: number;
  durationMs: number;
  startY: number;
  endY: number;
  driftX: number;
  sizePx: number;
  startRotationDeg: number;
  endRotationDeg: number;
};

export type BurstHeartSpec = {
  emoji: string;
  delayMs: number;
  durationMs: number;
  offsetX: number;
  offsetY: number;
  sizePx: number;
};

/** Web Connect CTA — fewer particles; aligned with Discover People feature emojis. */
const CONNECT_SHOOTING_SPECS: ShootingHeartSpec[] = [
  { emoji: '✨', left: '8%', delayMs: 0, durationMs: 2200, startY: -36, endY: 34, driftX: 14, sizePx: 15, startRotationDeg: -18, endRotationDeg: 8 },
  { emoji: '🎯', left: '26%', delayMs: 280, durationMs: 2400, startY: -42, endY: 30, driftX: -10, sizePx: 17, startRotationDeg: 12, endRotationDeg: -6 },
  { emoji: '💝', left: '44%', delayMs: 520, durationMs: 2000, startY: -38, endY: 36, driftX: 6, sizePx: 14, startRotationDeg: 0, endRotationDeg: 0 },
  { emoji: '✨', left: '58%', delayMs: 120, durationMs: 2600, startY: -44, endY: 32, driftX: -14, sizePx: 16, startRotationDeg: -8, endRotationDeg: 14 },
  { emoji: '🎯', left: '74%', delayMs: 640, durationMs: 2300, startY: -40, endY: 35, driftX: 10, sizePx: 15, startRotationDeg: 16, endRotationDeg: -10 },
  { emoji: '💝', left: '90%', delayMs: 400, durationMs: 2100, startY: -34, endY: 38, driftX: -8, sizePx: 14, startRotationDeg: -12, endRotationDeg: 6 },
];

const CONNECT_BURST_SPECS: BurstHeartSpec[] = [
  { emoji: '💕', delayMs: 0, durationMs: 1400, offsetX: -42, offsetY: -8, sizePx: 12 },
  { emoji: '💖', delayMs: 450, durationMs: 1500, offsetX: 38, offsetY: -12, sizePx: 13 },
  { emoji: '✨', delayMs: 900, durationMs: 1200, offsetX: -28, offsetY: 14, sizePx: 11 },
  { emoji: '💗', delayMs: 1350, durationMs: 1400, offsetX: 44, offsetY: 10, sizePx: 12 },
  { emoji: '💝', delayMs: 1800, durationMs: 1300, offsetX: 0, offsetY: -16, sizePx: 13 },
];

/** Arcing particles from above — same specs as mobile shooting hearts. */
export const CONNECT_SHOOTING_HEARTS = CONNECT_SHOOTING_SPECS;

/** Center burst particles (mobile only; omitted on web — reads as a static heart on the button). */
export const CONNECT_BURST_HEARTS = CONNECT_BURST_SPECS;
