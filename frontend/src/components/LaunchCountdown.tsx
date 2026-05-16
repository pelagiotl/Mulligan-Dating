import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Local midnight at the start of launch day (June 6, 2026). */
const LAUNCH_MS = new Date(2026, 5, 6, 0, 0, 0, 0).getTime();

/** Same semantics as mobile `STORAGE_KEY` shape (`edge` + `collapsed`). Legacy `{ left, top }` is migrated. */
const BUBBLE_POS_KEY = "mulligan-launch-bubble-pos";

const MOVE_PX = 8;

type Edge = "top" | "right" | "bottom" | "left";

type Remaining =
  | { live: true; days: 0 }
  | { live: false; days: number };

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

function nearestEdge(cx: number, cy: number, vw: number, vh: number): Edge {
  const dTop = cy;
  const dBottom = vh - cy;
  const dLeft = cx;
  const dRight = vw - cx;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return "top";
  if (min === dBottom) return "bottom";
  if (min === dLeft) return "left";
  return "right";
}

function readBottomChromePx(): number {
  if (typeof document === "undefined") return 24;
  const root = document.documentElement;
  const tab = Number.parseFloat(getComputedStyle(root).getPropertyValue("--native-tab-height")) || 0;
  const safe =
    Number.parseFloat(getComputedStyle(root).getPropertyValue("--native-tab-safe-bottom")) || 0;
  return Math.max(24, tab + safe + 12);
}

function presetTopLeft(
  edge: Edge,
  vw: number,
  vh: number,
  boxW: number,
  boxH: number,
  bottomChrome: number
): { left: number; top: number } {
  const m = 8;
  const leftInset = m;
  const topInset = m;
  const rightInset = m;
  switch (edge) {
    case "top":
      return { left: Math.max(leftInset, (vw - boxW) / 2), top: topInset };
    case "bottom":
      return {
        left: Math.max(leftInset, (vw - boxW) / 2),
        top: Math.max(topInset, vh - bottomChrome - boxH - m),
      };
    case "left":
      return { left: leftInset, top: Math.max(topInset, (vh - boxH) / 2) };
    case "right":
    default:
      return {
        left: Math.max(leftInset, vw - rightInset - boxW - m),
        top: Math.max(topInset, (vh - boxH) / 2),
      };
  }
}

function readPersisted(): { edge: Edge; collapsed: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BUBBLE_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== "object") return null;

    if (
      typeof p.edge === "string" &&
      (p.edge === "top" || p.edge === "right" || p.edge === "bottom" || p.edge === "left")
    ) {
      return { edge: p.edge, collapsed: !!p.collapsed };
    }

    if (typeof p.left === "number" && typeof p.top === "number") {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = p.left + 140;
      const cy = p.top + 90;
      return { edge: nearestEdge(cx, cy, vw, vh), collapsed: false };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistState(edge: Edge, collapsed: boolean) {
  try {
    localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify({ edge, collapsed }));
  } catch {
    /* ignore */
  }
}

export default function LaunchCountdown() {
  const [state, setState] = useState<Remaining>(() => computeRemaining());
  const [edge, setEdge] = useState<Edge>("top");
  const [collapsed, setCollapsed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 400,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const [boxSize, setBoxSize] = useState({ w: 280, h: 200 });

  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const collapsedRef = useRef(collapsed);
  const dragMovedRef = useRef(false);
  const pointerSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const capturingRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);

  collapsedRef.current = collapsed;

  useEffect(() => {
    const id = window.setInterval(() => setState(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = readPersisted();
    if (saved) {
      setEdge(saved.edge);
      setCollapsed(saved.collapsed);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistState(edge, collapsed);
  }, [edge, collapsed, hydrated]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width <= 0 || cr.height <= 0) return;
      setBoxSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, hydrated]);

  const bottomChrome = useMemo(() => readBottomChromePx(), [viewport.w, viewport.h]);

  const basePos = useMemo(
    () => presetTopLeft(edge, viewport.w, viewport.h, boxSize.w, boxSize.h, bottomChrome),
    [edge, viewport.w, viewport.h, boxSize.w, boxSize.h, bottomChrome]
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const resetToTopExpanded = useCallback(() => {
    clearLongPress();
    setEdge("top");
    setCollapsed(false);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    persistState("top", false);
  }, [clearLongPress]);

  const finishDragSnap = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const nextEdge = nearestEdge(cx, cy, vw, vh);
    setEdge(nextEdge);
    setCollapsed(true);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }, []);

  const finishDragSnapRef = useRef(finishDragSnap);
  finishDragSnapRef.current = finishDragSnap;

  const onBubblePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-launch-minimize]")) return;

      pointerSessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
      dragMovedRef.current = false;
      capturingRef.current = false;

      if (collapsedRef.current) {
        clearLongPress();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          resetToTopExpanded();
        }, 480);
      }

      const onMove = (ev: PointerEvent) => {
        const sess = pointerSessionRef.current;
        if (!sess || ev.pointerId !== sess.pointerId) return;
        const dx = ev.clientX - sess.startX;
        const dy = ev.clientY - sess.startY;
        if (
          !dragMovedRef.current &&
          (Math.abs(dx) > MOVE_PX || Math.abs(dy) > MOVE_PX)
        ) {
          dragMovedRef.current = true;
          clearLongPress();
          const wrap = bubbleRef.current;
          if (wrap && !capturingRef.current) {
            capturingRef.current = true;
            try {
              wrap.setPointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            setDragging(true);
          }
        }
        if (dragMovedRef.current) {
          setPan({ x: dx, y: dy });
        }
      };

      const onUp = (ev: PointerEvent) => {
        const sess = pointerSessionRef.current;
        if (!sess || ev.pointerId !== sess.pointerId) return;
        pointerSessionRef.current = null;
        clearLongPress();
        const wrap = bubbleRef.current;
        if (wrap && capturingRef.current) {
          try {
            wrap.releasePointerCapture(ev.pointerId);
          } catch {
            /* ignore */
          }
        }
        capturingRef.current = false;
        setDragging(false);

        const moved = dragMovedRef.current;
        dragMovedRef.current = false;

        const col = collapsedRef.current;
        if (col) {
          if (!moved) {
            setCollapsed(false);
            setPan({ x: 0, y: 0 });
          } else {
            finishDragSnapRef.current();
          }
        } else if (moved) {
          finishDragSnapRef.current();
        } else {
          setPan({ x: 0, y: 0 });
        }

        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearLongPress, resetToTopExpanded]
  );

  const onDoubleClickBubble = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        localStorage.removeItem(BUBBLE_POS_KEY);
      } catch {
        /* ignore */
      }
      resetToTopExpanded();
    },
    [resetToTopExpanded]
  );

  const left = basePos.left + pan.x;
  const top = basePos.top + pan.y;
  const isVerticalDock = edge === "left" || edge === "right";
  const expandCue =
    edge === "top" ? "▼" : edge === "bottom" ? "▲" : edge === "left" ? "›" : "‹";

  const countdownSection = state.live ? (
    <section
      className="launch-countdown launch-countdown--live"
      aria-labelledby="launch-countdown-heading"
    >
      <div className="launch-countdown__header-row">
        <span className="launch-countdown__hourglass" aria-hidden>
          <span className="launch-countdown__hourglass-glow" />
          <span className="launch-countdown__hourglass-emoji">⏳</span>
          <span className="launch-countdown__hourglass-sand" />
        </span>
        <h2 id="launch-countdown-heading" className="launch-countdown__heading">
          June 6 launch
        </h2>
      </div>
      <p className="launch-countdown__live-msg">We&apos;re live — welcome to Mulligan.</p>
    </section>
  ) : (
    <section className="launch-countdown" aria-labelledby="launch-countdown-heading">
      <div className="launch-countdown__header-row">
        <span className="launch-countdown__hourglass" aria-hidden>
          <span className="launch-countdown__hourglass-glow" />
          <span className="launch-countdown__hourglass-emoji">⏳</span>
          <span className="launch-countdown__hourglass-sand" />
        </span>
        <div className="launch-countdown__copy">
          <h2 id="launch-countdown-heading" className="launch-countdown__heading">
            June 6 launch
          </h2>
          <p className="launch-countdown__sub">Time until launch</p>
        </div>
      </div>
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
    "launch-countdown-bubble launch-countdown-bubble--custom launch-countdown-bubble--docked" +
    (collapsed ? " launch-countdown-bubble--collapsed" : " launch-countdown-bubble--expanded-shell") +
    (dragging ? " launch-countdown-bubble--dragging" : "");

  const bubble = (
    <div
      ref={bubbleRef}
      className={bubbleClass}
      style={{
        left,
        top,
      }}
      onPointerDown={onBubblePointerDown}
      onDoubleClick={onDoubleClickBubble}
      title="Drag toward an edge to dock (collapsed). Click chip to expand. Double-click to reset."
      role="group"
      aria-label="Launch countdown widget"
    >
      {!state.live ? <span className="launch-countdown-bubble__pin" aria-hidden /> : null}

      {collapsed ? (
        <div
          className={
            "launch-countdown-bubble-collapsed-inner" +
            (isVerticalDock ? " launch-countdown-bubble-collapsed-inner--vertical" : "")
          }
        >
          <span className="launch-countdown-bubble-collapsed-emoji" aria-hidden>
            ⏳
          </span>
          <span className="launch-countdown-bubble-collapsed-label">
            {state.live ? "Live" : `${state.days}d`}
          </span>
          <span className="launch-countdown-bubble-collapsed-cue" aria-hidden>
            {expandCue}
          </span>
        </div>
      ) : (
        <div
          className={
            "launch-countdown-bubble-expanded-card" +
            (isVerticalDock ? " launch-countdown-bubble-expanded-card--vertical-dock" : "")
          }
        >
          <div className="launch-countdown-bubble__drag-hint">
            <span className="launch-countdown-bubble__drag-grip" aria-hidden />
            <span className="launch-countdown-bubble__drag-label">Drag to an edge to dock</span>
          </div>
          {countdownSection}
          <button
            type="button"
            className="launch-countdown-bubble__minimize"
            data-launch-minimize
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(true);
              setPan({ x: 0, y: 0 });
            }}
          >
            Minimize
          </button>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  if (!hydrated) return null;

  return createPortal(bubble, document.body);
}
