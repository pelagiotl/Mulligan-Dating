import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CONNECT_TRACE_EDGE_PX } from '../constants/connectButtonEffects';

const EDGE = CONNECT_TRACE_EDGE_PX;
import { useConnectShimmerProgress } from '../hooks/useConnectShimmerProgress';
import {
  computeTraceMetrics,
  horizontalSweepTransform,
  shimmerFrameAt,
} from '../utils/connectShimmerMath';

type ConnectButtonShimmerEffectProps = {
  active?: boolean;
  borderRadius?: number;
};

/**
 * Cyan perimeter trace (top/bottom sweep + right edge) — mirrors mobile ConnectButtonShimmerEffect.
 */
export default function ConnectButtonShimmerEffect({
  active = true,
  borderRadius = 22,
}: ConnectButtonShimmerEffectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 56 });
  const progress = useConnectShimmerProgress(active);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev.width === width && prev.height === height ? prev : { width, height }
        );
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = useMemo(
    () => computeTraceMetrics(size.width, size.height, borderRadius),
    [size.width, size.height, borderRadius]
  );

  const frame = useMemo(
    () => shimmerFrameAt(progress, metrics),
    [progress, metrics]
  );

  const { traceW, sideSegmentH } = metrics;
  const sweepTransform = horizontalSweepTransform(traceW, frame.scaleX);
  const cornerArm = borderRadius + EDGE;

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className="connect-shimmer"
      style={{
        borderRadius,
        opacity: frame.traceOpacity,
        ['--connect-shimmer-radius' as string]: `${borderRadius}px`,
      }}
      aria-hidden
    >
      <div
        className="connect-shimmer__resting"
        style={{ borderRadius }}
      />

      <div
        className="connect-shimmer__corner connect-shimmer__corner--tl"
        style={{
          width: cornerArm,
          height: cornerArm,
          borderRadius: `${borderRadius}px 0 0 0`,
          opacity: frame.leftCornerOpacity,
        }}
      />
      <div
        className="connect-shimmer__corner connect-shimmer__corner--bl"
        style={{
          width: cornerArm,
          height: cornerArm,
          borderRadius: `0 0 0 ${borderRadius}px`,
          opacity: frame.leftCornerOpacity,
        }}
      />

      <div
        className="connect-shimmer__edge-left"
        style={{
          top: borderRadius,
          bottom: borderRadius,
          opacity: frame.leftEdgeOpacity,
        }}
      />

      <div
        className="connect-shimmer__edge-h"
        style={{ width: traceW, transform: sweepTransform }}
      />
      <div
        className="connect-shimmer__edge-h connect-shimmer__edge-h--bottom"
        style={{ width: traceW, transform: sweepTransform }}
      />

      <div
        className="connect-shimmer__right"
        style={{ opacity: frame.rightPhaseOpacity }}
      >
        <div
          className="connect-shimmer__corner connect-shimmer__corner--tr"
          style={{
            width: cornerArm,
            height: cornerArm,
            borderRadius: `0 ${borderRadius}px 0 0`,
          }}
        />
        <div
          className="connect-shimmer__corner connect-shimmer__corner--br"
          style={{
            width: cornerArm,
            height: cornerArm,
            borderRadius: `0 0 ${borderRadius}px 0`,
          }}
        />
        <div
          className="connect-shimmer__edge-right-clip"
          style={{ top: borderRadius, height: sideSegmentH }}
        >
          <div
            className="connect-shimmer__edge-right-fill"
            style={{
              height: sideSegmentH,
              transform: `translateY(${frame.rightTranslateY}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
