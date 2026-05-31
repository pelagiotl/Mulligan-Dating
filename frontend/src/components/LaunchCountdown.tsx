import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  computeLaunchRemaining,
  LAUNCH_LABEL,
  type LaunchRemaining,
} from "../constants/launchSchedule";
import {
  launchDockFromRect,
  launchDockTopLeft,
  normalizeLaunchDockPersisted,
  type LaunchDockEdge,
  type LaunchDockInsets,
  type LaunchDockPersisted,
} from "../utils/launchCountdownDock";

/** Same semantics as mobile `STORAGE_KEY` shape (`edge`, `along`, `collapsed`). Legacy `{ left, top }` is migrated. */
const BUBBLE_POS_KEY = "mulligan-launch-bubble-pos";

const MOVE_PX = 8;

function computeRemaining(): LaunchRemaining {
  return computeLaunchRemaining();
}

function readBottomChromePx(): number {
  if (typeof document === "undefined") return 24;
  const root = document.documentElement;
  const tab = Number.parseFloat(getComputedStyle(root).getPropertyValue("--native-tab-height")) || 0;
  const safe =
    Number.parseFloat(getComputedStyle(root).getPropertyValue("--native-tab-safe-bottom")) || 0;
  return Math.max(24, tab + safe + 12);
}

function readDockInsets(bottomChrome: number): LaunchDockInsets {
  return { top: 8, left: 8, right: 8, bottomChrome };
}

function readPersisted(bottomChrome: number): LaunchDockPersisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BUBBLE_POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    const normalized = normalizeLaunchDockPersisted(p);
    if (normalized) return normalized;

    if (p && typeof p === "object") {
      const legacy = p as Record<string, unknown>;
      if (typeof legacy.left === "number" && typeof legacy.top === "number") {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const insets = readDockInsets(bottomChrome);
        const dock = launchDockFromRect(legacy.left, legacy.top, 280, 180, vw, vh, insets);
        return { ...dock, collapsed: false };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistState(state: LaunchDockPersisted) {
  try {
    localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export default function LaunchCountdown() {
  const [state, setState] = useState<LaunchRemaining>(() => computeRemaining());
  const [edge, setEdge] = useState<LaunchDockEdge>("top");
  const [along, setAlong] = useState(0.5);
  const [collapsed, setCollapsed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 400,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const [boxSize, setBoxSize] = useState({ w: 216, h: 148 });

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
    const saved = readPersisted(readBottomChromePx());
    if (saved) {
      setEdge(saved.edge);
      setAlong(saved.along);
      setCollapsed(saved.collapsed);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistState({ edge, along, collapsed });
  }, [edge, along, collapsed, hydrated]);

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

  const dockInsets = useMemo(
    () => readDockInsets(bottomChrome),
    [bottomChrome]
  );

  const basePos = useMemo(
    () =>
      launchDockTopLeft(
        edge,
        along,
        viewport.w,
        viewport.h,
        boxSize.w,
        boxSize.h,
        dockInsets
      ),
    [edge, along, viewport.w, viewport.h, boxSize.w, boxSize.h, dockInsets]
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
    setAlong(0.5);
    setCollapsed(false);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    persistState({ edge: "top", along: 0.5, collapsed: false });
  }, [clearLongPress]);

  const finishDragSnap = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dock = launchDockFromRect(
      r.left,
      r.top,
      r.width,
      r.height,
      vw,
      vh,
      dockInsets
    );
    setEdge(dock.edge);
    setAlong(dock.along);
    setCollapsed(true);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }, [dockInsets]);

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
          {LAUNCH_LABEL}
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
            {LAUNCH_LABEL}
          </h2>
          <p className="launch-countdown__sub">Time until launch (Pacific)</p>
        </div>
      </div>
      <div
        className="launch-countdown__grid launch-countdown__grid--days-hours"
        role="timer"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${state.days} days and ${state.hours} hours until launch`}
      >
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{state.days}</span>
          <span className="launch-countdown__unit">Days</span>
        </div>
        <div className="launch-countdown__cell">
          <span className="launch-countdown__value">{state.hours}</span>
          <span className="launch-countdown__unit">Hours</span>
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
      title="Drag anywhere along an edge to dock (collapsed). Tap chip to expand. Double-click to reset."
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
          <span
            className="launch-countdown__hourglass launch-countdown-bubble-collapsed-hourglass"
            aria-hidden
          >
            <span className="launch-countdown__hourglass-glow" />
            <span className="launch-countdown__hourglass-emoji">⏳</span>
            <span className="launch-countdown__hourglass-sand" />
          </span>
          <span className="launch-countdown-bubble-collapsed-label">
            {state.live ? "Live" : `${state.days}d ${state.hours}h`}
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
            <span className="launch-countdown-bubble__drag-label">Drag to any spot on an edge</span>
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
