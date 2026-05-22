import { CONNECT_TRACE_EDGE_PX } from '../constants/connectButtonEffects';

export type SweepMetrics = {
  traceW: number;
  sideSegmentH: number;
};

export function computeSweepMetrics(
  width: number,
  height: number,
  borderRadius: number
): SweepMetrics {
  const traceW = width;
  const sideSegmentH = Math.max(1, height - borderRadius * 2);
  return { traceW, sideSegmentH };
}

export type SweepFrame = {
  /** 0→1: top/bottom grow from left and right toward center. */
  hExtent: number;
  leftRailOpacity: number;
  rightRailOpacity: number;
  traceOpacity: number;
};

/**
 * Left and right caps stay fully connected; top/bottom halves meet in the middle.
 */
export function sweepFrameAt(progress: number, _metrics: SweepMetrics): SweepFrame {
  const p = Math.max(0, Math.min(1, progress));

  if (p <= 0) {
    return {
      hExtent: 0,
      leftRailOpacity: 0,
      rightRailOpacity: 0,
      traceOpacity: 0,
    };
  }

  return {
    hExtent: Math.max(0.001, p),
    leftRailOpacity: 1,
    rightRailOpacity: 1,
    traceOpacity: 1,
  };
}

/** Grow from the left (half-width segment). */
export function horizontalSweepFromLeft(segmentW: number, scaleX: number): string {
  const halfW = segmentW / 2;
  return `translateX(${-halfW}px) scaleX(${scaleX}) translateX(${halfW}px)`;
}

/** Grow from the right (half-width segment). */
export function horizontalSweepFromRight(segmentW: number, scaleX: number): string {
  const halfW = segmentW / 2;
  return `translateX(${halfW}px) scaleX(${scaleX}) translateX(${-halfW}px)`;
}

export const CONNECT_TRACE_EDGE = CONNECT_TRACE_EDGE_PX;
