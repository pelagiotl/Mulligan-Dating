import { CONNECT_TRACE_EDGE_PX } from '../constants/connectButtonEffects';

export type SweepMetrics = {
  traceW: number;
  sideSegmentH: number;
  hEnd: number;
};

export function computeSweepMetrics(
  width: number,
  height: number,
  borderRadius: number
): SweepMetrics {
  const traceW = width;
  const sideSegmentH = Math.max(1, height - borderRadius * 2);
  const perimeter = traceW + sideSegmentH;
  const hEnd = perimeter > 0 ? traceW / perimeter : 0.75;
  return { traceW, sideSegmentH, hEnd };
}

export type SweepFrame = {
  /** Top/bottom horizontal extent (0.001–1), linear with progress. */
  scaleX: number;
  /** Left vertical 0→1 top to bottom while sweep begins at left. */
  leftReveal: number;
  tlOpacity: number;
  blOpacity: number;
  rightTranslateY: number;
  rightOpacity: number;
  traceOpacity: number;
};

/**
 * Left→right sweep: left edge grows top→bottom, top/bottom extend right, right edge draws down.
 * Progress 0 = nothing drawn; 1 = full perimeter before loop reset.
 */
export function sweepFrameAt(progress: number, metrics: SweepMetrics): SweepFrame {
  const { traceW, sideSegmentH, hEnd } = metrics;
  const p = Math.max(0, Math.min(1, progress));

  if (p <= 0) {
    return {
      scaleX: 0.001,
      leftReveal: 0,
      tlOpacity: 0,
      blOpacity: 0,
      rightTranslateY: -sideSegmentH,
      rightOpacity: 0,
      traceOpacity: 0,
    };
  }

  const traceOpacity = p <= 0.03 ? 0.5 + (p / 0.03) * 0.5 : 1;

  // Left edge + corners: connect top→bottom during early left→right phase
  const leftPhaseEnd = Math.min(0.14, hEnd * 0.18);
  const leftReveal = Math.min(1, p / leftPhaseEnd);
  const tlOpacity = Math.min(1, leftReveal * 1.4);
  const blOpacity = leftReveal < 0.72 ? 0 : Math.min(1, (leftReveal - 0.72) / 0.28);

  // Top/bottom: constant horizontal speed (linear in progress until hEnd)
  const hProgress = Math.min(1, p / hEnd);
  const scaleX = Math.max(0.001, hProgress);

  // Right edge: only after horizontal sweep reaches the right side
  const blend = Math.min(0.04, (1 - hEnd) * 0.4);
  const cornerStart = Math.max(hEnd * 0.92, hEnd - blend);
  let rightOpacity = 0;
  let rightTranslateY = -sideSegmentH;
  if (p > cornerStart) {
    const rProg = Math.min(1, (p - cornerStart) / (1 - cornerStart));
    rightOpacity = 1;
    rightTranslateY = -sideSegmentH * (1 - rProg);
  }

  return {
    scaleX,
    leftReveal,
    tlOpacity,
    blOpacity,
    rightTranslateY,
    rightOpacity,
    traceOpacity,
  };
}

/** Left-anchored scaleX (RN translate-scale-translate). */
export function horizontalSweepTransform(traceW: number, scaleX: number): string {
  const halfW = traceW / 2;
  return `translateX(${-halfW}px) scaleX(${scaleX}) translateX(${halfW}px)`;
}

export const CONNECT_TRACE_EDGE = CONNECT_TRACE_EDGE_PX;
