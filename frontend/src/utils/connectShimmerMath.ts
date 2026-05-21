export type TraceMetrics = {
  traceW: number;
  sideSegmentH: number;
  hEnd: number;
  cornerStart: number;
  cornerEnd: number;
};

export function interpolatePiecewise(
  t: number,
  input: number[],
  output: number[]
): number {
  if (t <= input[0]) return output[0];
  const last = input.length - 1;
  if (t >= input[last]) return output[last];
  for (let i = 0; i < last; i++) {
    if (t >= input[i] && t <= input[i + 1]) {
      const span = input[i + 1] - input[i];
      if (span <= 0) return output[i + 1];
      const u = (t - input[i]) / span;
      return output[i] + u * (output[i + 1] - output[i]);
    }
  }
  return output[last];
}

export function computeTraceMetrics(
  width: number,
  height: number,
  borderRadius: number
): TraceMetrics {
  const traceW = width;
  const sideSegmentH = Math.max(1, height - borderRadius * 2);
  const perimeter = traceW + sideSegmentH;
  const hEnd = perimeter > 0 ? traceW / perimeter : 0.75;
  const blend = Math.min(0.045, (1 - hEnd) * 0.45);
  const cornerStart = Math.max(0, hEnd - blend);
  const cornerEnd = Math.min(1, hEnd + blend * 0.35);
  return { traceW, sideSegmentH, hEnd, cornerStart, cornerEnd };
}

export type ShimmerFrame = {
  scaleX: number;
  rightTranslateY: number;
  traceOpacity: number;
  leftCornerOpacity: number;
  leftEdgeOpacity: number;
  rightPhaseOpacity: number;
};

export function shimmerFrameAt(p: number, metrics: TraceMetrics): ShimmerFrame {
  const { traceW, sideSegmentH, hEnd, cornerStart, cornerEnd } = metrics;
  const keys = [0, cornerStart, cornerEnd, 1];

  return {
    scaleX: interpolatePiecewise(p, keys, [0.001, 0.97, 1, 1]),
    rightTranslateY: interpolatePiecewise(p, keys, [
      -sideSegmentH,
      -sideSegmentH,
      -sideSegmentH * 0.35,
      0,
    ]),
    traceOpacity: interpolatePiecewise(p, [0, 0.03, 1], [0.5, 1, 1]),
    leftCornerOpacity: interpolatePiecewise(
      p,
      [0, Math.min(0.05, hEnd * 0.12)],
      [0, 1]
    ),
    leftEdgeOpacity: interpolatePiecewise(
      p,
      [0, Math.min(0.06, hEnd * 0.14)],
      [0, 1]
    ),
    rightPhaseOpacity: interpolatePiecewise(
      p,
      [cornerStart - 0.002, cornerStart],
      [0, 1]
    ),
  };
}

/** Left-anchored scaleX transform for a bar of width traceW. */
export function horizontalSweepTransform(
  traceW: number,
  scaleX: number
): string {
  const halfW = traceW / 2;
  return `translateX(${-halfW}px) scaleX(${scaleX}) translateX(${halfW}px)`;
}
