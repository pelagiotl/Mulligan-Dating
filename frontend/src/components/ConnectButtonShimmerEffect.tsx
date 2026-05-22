import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CONNECT_SHIMMER_DURATION_MS,
  CONNECT_TRACE_EDGE_PX,
} from '../constants/connectButtonEffects';
import { connectShimmerProgressAt } from '../hooks/useConnectShimmerProgress';
import {
  computeSweepMetrics,
  horizontalSweepFromLeft,
  horizontalSweepFromRight,
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
  leftRail: HTMLDivElement | null;
  rightRail: HTMLDivElement | null;
  topLeft: HTMLDivElement | null;
  topRight: HTMLDivElement | null;
  bottomLeft: HTMLDivElement | null;
  bottomRight: HTMLDivElement | null;
};

/**
 * Static left + right caps; top/bottom grow from both sides and meet in the middle.
 */
export default function ConnectButtonShimmerEffect({
  active = true,
  borderRadius = 22,
  sweepWidth = 320,
}: ConnectButtonShimmerEffectProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<LayerRefs>({
    trace: null,
    leftRail: null,
    rightRail: null,
    topLeft: null,
    topRight: null,
    bottomLeft: null,
    bottomRight: null,
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
      const halfW = traceW / 2;
      const sweepL = horizontalSweepFromLeft(halfW, frame.hExtent);
      const sweepR = horizontalSweepFromRight(halfW, frame.hExtent);
      const L = layersRef.current;

      if (L.trace) L.trace.style.opacity = String(frame.traceOpacity);
      if (L.leftRail) L.leftRail.style.opacity = String(frame.leftRailOpacity);
      if (L.rightRail) L.rightRail.style.opacity = String(frame.rightRailOpacity);
      if (L.topLeft) {
        L.topLeft.style.width = `${halfW}px`;
        L.topLeft.style.transform = sweepL;
      }
      if (L.topRight) {
        L.topRight.style.width = `${halfW}px`;
        L.topRight.style.transform = sweepR;
      }
      if (L.bottomLeft) {
        L.bottomLeft.style.width = `${halfW}px`;
        L.bottomLeft.style.transform = sweepL;
      }
      if (L.bottomRight) {
        L.bottomRight.style.width = `${halfW}px`;
        L.bottomRight.style.transform = sweepR;
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
  const halfW = width / 2;

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
            layersRef.current.leftRail = el;
          }}
          className="connect-shimmer__left-rail"
          style={{
            height,
            ['--connect-shimmer-radius' as string]: `${borderRadius}px`,
          }}
        >
          <div
            className="connect-shimmer__corner connect-shimmer__corner--tl"
            style={{
              width: cornerArm,
              height: cornerArm,
              borderRadius: `${borderRadius}px 0 0 0`,
            }}
          />
          <div
            className="connect-shimmer__edge-left"
            style={{ top: borderRadius, height: sideSegmentH }}
          />
          <div
            className="connect-shimmer__corner connect-shimmer__corner--bl"
            style={{
              width: cornerArm,
              height: cornerArm,
              borderRadius: `0 0 0 ${borderRadius}px`,
            }}
          />
        </div>

        <div
          ref={(el) => {
            layersRef.current.rightRail = el;
          }}
          className="connect-shimmer__right-rail"
          style={{
            height,
            ['--connect-shimmer-radius' as string]: `${borderRadius}px`,
          }}
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
            className="connect-shimmer__edge-right"
            style={{ top: borderRadius, height: sideSegmentH }}
          />
          <div
            className="connect-shimmer__corner connect-shimmer__corner--br"
            style={{
              width: cornerArm,
              height: cornerArm,
              borderRadius: `0 0 ${borderRadius}px 0`,
            }}
          />
        </div>

        <div
          ref={(el) => {
            layersRef.current.topLeft = el;
          }}
          className="connect-shimmer__edge-h connect-shimmer__edge-h--left"
          style={{ width: halfW }}
        />
        <div
          ref={(el) => {
            layersRef.current.topRight = el;
          }}
          className="connect-shimmer__edge-h connect-shimmer__edge-h--right"
          style={{ width: halfW }}
        />
        <div
          ref={(el) => {
            layersRef.current.bottomLeft = el;
          }}
          className="connect-shimmer__edge-h connect-shimmer__edge-h--bottom connect-shimmer__edge-h--left"
          style={{ width: halfW }}
        />
        <div
          ref={(el) => {
            layersRef.current.bottomRight = el;
          }}
          className="connect-shimmer__edge-h connect-shimmer__edge-h--bottom connect-shimmer__edge-h--right"
          style={{ width: halfW }}
        />
      </div>
    </div>
  );
}
