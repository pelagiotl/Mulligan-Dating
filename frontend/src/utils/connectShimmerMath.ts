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
  /** Top/bottom grow left→right (linear). */
  scaleX: number;
  /** Left rail (TL + edge + BL) visible whenever trace is on. */
  leftRailOpacity: number;
  rightTranslateY: number;
  rightOpacity: number;
  traceOpacity: number;
};

/**
 * Left perimeter is fixed and connected from the first frame; only top/bottom
 * extend right, then the right edge draws down.
 */
export function sweepFrameAt(progress: number, metrics: SweepMetrics): SweepFrame {
  const { sideSegmentH, hEnd } = metrics;
  const p = Math.max(0, Math.min(1, progress));

  if (p <= 0) {
    return {
      scaleX: 0.001,
      leftRailOpacity: 0,
      rightTranslateY: -sideSegmentH,
      rightOpacity: 0,
      traceOpacity: 0,
    };
  }

  const traceOpacity = 1;
  const leftRailOpacity = 1;
  const lead = Math.min(1, p / hEnd);
  const scaleX = Math.max(0.001, lead);

  if (p < hEnd) {
    return {
      scaleX,
      leftRailOpacity,
      rightTranslateY: -sideSegmentH,
      rightOpacity: 0,
      traceOpacity,
    };
  }

  const rProg = Math.min(1, (p - hEnd) / (1 - hEnd));

  return {
    scaleX: 1,
    leftRailOpacity: 1,
    rightTranslateY: -sideSegmentH * (1 - rProg),
    rightOpacity: 1,
    traceOpacity,
  };
}

/** Left-anchored scaleX (RN translate-scale-translate). */
export function horizontalSweepTransform(traceW: number, scaleX: number): string {
  const halfW = traceW / 2;
  return `translateX(${-halfW}px) scaleX(${scaleX}) translateX(${halfW}px)`;
}

export const CONNECT_TRACE_EDGE = CONNECT_TRACE_EDGE_PX;
