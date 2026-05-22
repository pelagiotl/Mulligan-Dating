import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CONNECT_SHIMMER_DURATION_MS,
  CONNECT_TRACE_EDGE_PX,
} from '../constants/connectButtonEffects';
import { connectShimmerProgressAt } from '../hooks/useConnectShimmerProgress';
import {
  computeSweepMetrics,
  horizontalSweepTransform,
  sweepFrameAt,
  type SweepMetrics,
} from '../utils/connectShimmerMath';

const EDGE = CONNECT_TRACE_EDGE_PX;

type ConnectButtonShimmerEffectProps = {
  active?: boolean;
  borderRadius?: number;
  sweepWidth?: number;
};

type LayerRefs = {
  trace: HTMLDivElement | null;
  top: HTMLDivElement | null;
  bottom: HTMLDivElement | null;
  left: HTMLDivElement | null;
  tl: HTMLDivElement | null;
  bl: HTMLDivElement | null;
  rightStack: HTMLDivElement | null;
  rightFill: HTMLDivElement | null;
};

/**
 * Left→right perimeter sweep: left grows top→bottom, horizontals extend right, right draws down.
 */
export default function ConnectButtonShimmerEffect({
  active = true,
  borderRadius = 22,
  sweepWidth = 320,
}: ConnectButtonShimmerEffectProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<LayerRefs>({
    trace: null,
    top: null,
    bottom: null,
    left: null,
    tl: null,
    bl: null,
    rightStack: null,
    rightFill: null,
  });
  const metricsRef = useRef<SweepMetrics>(
    computeSweepMetrics(sweepWidth, 56, borderRadius)
  );
  const animStartRef = useRef(performance.now());
  const [size, setSize] = useState({ width: sweepWidth, height: 56 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const box = host.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        setSize((prev) =>
          prev.width === box.width && prev.height === box.height
            ? prev
            : { width: box.width, height: box.height }
        );
        metricsRef.current = computeSweepMetrics(
          box.width,
          box.height,
          borderRadius
        );
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [borderRadius]);

  useEffect(() => {
    if (!active) return;

    animStartRef.current = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = connectShimmerProgressAt(
        now,
        animStartRef.current,
        CONNECT_SHIMMER_DURATION_MS
      );
      const frame = sweepFrameAt(p, metricsRef.current);
      const { traceW } = metricsRef.current;
      const sweep = horizontalSweepTransform(traceW, frame.scaleX);
      const L = layersRef.current;

      if (L.trace) L.trace.style.opacity = String(frame.traceOpacity);
      if (L.top) {
        L.top.style.width = `${traceW}px`;
        L.top.style.transform = sweep;
      }
      if (L.bottom) {
        L.bottom.style.width = `${traceW}px`;
        L.bottom.style.transform = sweep;
      }
      if (L.left) {
        L.left.style.transform = `scaleY(${frame.leftReveal})`;
      }
      if (L.tl) L.tl.style.opacity = String(frame.tlOpacity);
      if (L.bl) L.bl.style.opacity = String(frame.blOpacity);
      if (L.rightStack) L.rightStack.style.opacity = String(frame.rightOpacity);
      if (L.rightFill) {
        L.rightFill.style.transform = `translateY(${frame.rightTranslateY}px)`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, borderRadius]);

  if (!active) return null;

  const { width, height } = size;
  const { sideSegmentH } = metricsRef.current;
  const cornerArm = borderRadius + EDGE;

  return (
    <div
      ref={hostRef}
      className="connect-shimmer"
      style={{ borderRadius }}
      aria-hidden
    >
      <div className="connect-shimmer__resting" style={{ borderRadius }} />

      <div
        ref={(el) => {
          layersRef.current.trace = el;
        }}
        className="connect-shimmer__trace"
      >
        <div
          ref={(el) => {
            layersRef.current.tl = el;
          }}
          className="connect-shimmer__corner connect-shimmer__corner--tl"
          style={{
            width: cornerArm,
            height: cornerArm,
            borderRadius: `${borderRadius}px 0 0 0`,
          }}
        />
        <div
          ref={(el) => {
            layersRef.current.bl = el;
          }}
          className="connect-shimmer__corner connect-shimmer__corner--bl"
          style={{
            width: cornerArm,
            height: cornerArm,
            borderRadius: `0 0 0 ${borderRadius}px`,
          }}
        />

        <div
          ref={(el) => {
            layersRef.current.left = el;
          }}
          className="connect-shimmer__edge-left"
          style={{
            top: borderRadius,
            height: sideSegmentH,
          }}
        />

        <div
          ref={(el) => {
            layersRef.current.top = el;
          }}
          className="connect-shimmer__edge-h"
          style={{ width }}
        />
        <div
          ref={(el) => {
            layersRef.current.bottom = el;
          }}
          className="connect-shimmer__edge-h connect-shimmer__edge-h--bottom"
          style={{ width }}
        />

        <div
          ref={(el) => {
            layersRef.current.rightStack = el;
          }}
          className="connect-shimmer__right"
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
              ref={(el) => {
                layersRef.current.rightFill = el;
              }}
              className="connect-shimmer__edge-right-fill"
              style={{ height: sideSegmentH }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
