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
  scaleX: number;
  leftReveal: number;
  tlOpacity: number;
  blOpacity: number;
  rightTranslateY: number;
  rightOpacity: number;
  traceOpacity: number;
};

/**
 * One linear progress drives the whole sweep: left + horizontals move together,
 * then the right edge continues without a hold or separate left phase.
 */
export function sweepFrameAt(progress: number, metrics: SweepMetrics): SweepFrame {
  const { sideSegmentH, hEnd } = metrics;
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

  const traceOpacity = 1;

  // Single lead 0→1 for horizontal phase — left edge and top/bottom stay in sync
  const lead = Math.min(1, p / hEnd);
  const scaleX = Math.max(0.001, lead);
  const leftReveal = lead;
  const tlOpacity = Math.min(1, lead * 2.5);
  const blOpacity = lead < 0.88 ? 0 : Math.min(1, (lead - 0.88) / 0.12);

  if (p < hEnd) {
    return {
      scaleX,
      leftReveal,
      tlOpacity,
      blOpacity,
      rightTranslateY: -sideSegmentH,
      rightOpacity: 0,
      traceOpacity,
    };
  }

  const rProg = Math.min(1, (p - hEnd) / (1 - hEnd));

  return {
    scaleX: 1,
    leftReveal: 1,
    tlOpacity: 1,
    blOpacity: 1,
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
