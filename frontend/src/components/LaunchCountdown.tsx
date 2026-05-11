import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Local midnight at the start of launch day (June 6, 2026). */
const LAUNCH_MS = new Date(2026, 5, 6, 0, 0, 0, 0).getTime();

const BUBBLE_POS_KEY = "mulligan-launch-bubble-pos";

type Remaining =
  | { live: true; days: 0 }
  | { live: false; days: number };

type BubblePlacement = { left: number; top: number };

function readSavedPlacement(): BubblePlacement | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BUBBLE_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      p &&
      typeof p === "object" &&
      typeof (p as BubblePlacement).left === "number" &&
      typeof (p as BubblePlacement).top === "number" &&
      Number.isFinite((p as BubblePlacement).left) &&
      Number.isFinite((p as BubblePlacement).top)
    ) {
      return { left: (p as BubblePlacement).left, top: (p as BubblePlacement).top };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function clampPlacement(left: number, top: number, width: number, height: number): BubblePlacement {
  const margin = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const maxL = Math.max(margin, vw - width - margin);
  const maxT = Math.max(margin, vh - height - margin);
  return {
    left: Math.min(maxL, Math.max(margin, left)),
    top: Math.min(maxT, Math.max(margin, top)),
  };
}

function computeRemaining(): Remaining {
  const diff = LAUNCH_MS - Date.now();
  if (diff <= 0) {
    return { live: true, days: 0 };
  }
  return {
    live: false,
    days: Math.floor(diff / 86400000),
  };
}

export default function LaunchCountdown() {
  const [state, setState] = useState<Remaining>(() => computeRemaining());
  const [placement, setPlacement] = useState<BubblePlacement | null>(() => readSavedPlacement());
  const [dragging, setDragging] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setState(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  const persistPlacement = useCallback((p: BubblePlacement) => {
    try {
      localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const reclampToViewport = useCallback(() => {
    setPlacement((prev) => {
      if (!prev) return prev;
      const el = bubbleRef.current;
      if (!el) return prev;
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return prev;
      const next = clampPlacement(prev.left, prev.top, width, height);
      if (next.left !== prev.left || next.top !== prev.top) {
        persistPlacement(next);
        return next;
      }
      return prev;
    });
  }, [persistPlacement]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => reclampToViewport());
    window.addEventListener("resize", reclampToViewport);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reclampToViewport);
    };
  }, [reclampToViewport]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const startLeft = placement?.left ?? rect.left;
    const startTop = placement?.top ?? rect.top;
    if (!placement) {
      setPlacement({ left: startLeft, top: startTop });
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft,
      startTop,
    };
    setDragging(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
  }, [placement]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const el = bubbleRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    const next = clampPlacement(d.startLeft + dx, d.startTop + dy, width, height);
    setPlacement(next);
    e.preventDefault();
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      const el = bubbleRef.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const next = clampPlacement(left, top, width, height);
      setPlacement(next);
      persistPlacement(next);
    });
  }, [persistPlacement]);

  const onDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      localStorage.removeItem(BUBBLE_POS_KEY);
    } catch {
      /* ignore */
    }
    setPlacement(null);
  }, []);

  const inner = state.live ? (
    <section
      className="launch-countdown launch-countdown--live"
      aria-labelledby="launch-countdown-heading"
    >
      <h2 id="launch-countdown-heading" className="launch-countdown__heading">
        June 6 launch
      </h2>
      <p className="launch-countdown__live-msg">We&apos;re live — welcome to Mulligan.</p>
    </section>
  ) : (
    <section className="launch-countdown" aria-labelledby="launch-countdown-heading">
      <h2 id="launch-countdown-heading" className="launch-countdown__heading">
        June 6 launch
      </h2>
      <p className="launch-countdown__sub">Time until launch</p>
      <div
        className="launch-countdown__grid launch-countdown__grid--days-only"
        role="timer"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${state.days} days remaining`}
      >
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{state.days}</span>
          <span className="launch-countdown__unit">Days</span>
        </div>
      </div>
    </section>
  );

  const bubbleClass =
    "launch-countdown-bubble" +
    (placement ? " launch-countdown-bubble--custom" : "") +
    (dragging ? " launch-countdown-bubble--dragging" : "");

  const bubble = (
    <div
      ref={bubbleRef}
      className={bubbleClass}
      style={placement ? { left: placement.left, top: placement.top } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      title="Drag to move. Double-click to reset to the default corner."
      role="group"
      aria-label="Launch countdown widget"
    >
      <span className="launch-countdown-bubble__pin" aria-hidden />
      {inner}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(bubble, document.body);
}
