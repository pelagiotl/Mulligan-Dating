export type LaunchDockEdge = "top" | "right" | "bottom" | "left";

export type LaunchDockPersisted = {
  edge: LaunchDockEdge;
  collapsed: boolean;
  /** 0 = start of edge, 1 = end (top/bottom: left→right; left/right: top→bottom). */
  along: number;
};

export type LaunchDockInsets = {
  top: number;
  left: number;
  right: number;
  bottomChrome: number;
};

const EDGE_MARGIN = 8;

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function nearestLaunchDockEdge(cx: number, cy: number, vw: number, vh: number): LaunchDockEdge {
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

/** Pixel top/left for a docked bubble from edge + along ratio. */
export function launchDockTopLeft(
  edge: LaunchDockEdge,
  along: number,
  vw: number,
  vh: number,
  boxW: number,
  boxH: number,
  insets: LaunchDockInsets
): { left: number; top: number } {
  const m = EDGE_MARGIN;
  const a = clamp01(along);
  const { top: topInset, left: leftInset, right: rightInset, bottomChrome } = insets;

  switch (edge) {
    case "top": {
      const minL = leftInset + m;
      const maxL = vw - rightInset - m - boxW;
      const span = Math.max(0, maxL - minL);
      return { left: minL + a * span, top: topInset + m };
    }
    case "bottom": {
      const minL = leftInset + m;
      const maxL = vw - rightInset - m - boxW;
      const span = Math.max(0, maxL - minL);
      return {
        left: minL + a * span,
        top: Math.max(topInset + m, vh - bottomChrome - boxH - m),
      };
    }
    case "left": {
      const minT = topInset + m;
      const maxT = vh - bottomChrome - m - boxH;
      const span = Math.max(0, maxT - minT);
      return { left: leftInset + m, top: minT + a * span };
    }
    case "right":
    default: {
      const minT = topInset + m;
      const maxT = vh - bottomChrome - m - boxH;
      const span = Math.max(0, maxT - minT);
      return {
        left: Math.max(leftInset + m, vw - rightInset - m - boxW),
        top: minT + a * span,
      };
    }
  }
}

/** Derive edge + along from bubble rect after drag (or legacy saved pixels). */
export function launchDockFromRect(
  left: number,
  top: number,
  boxW: number,
  boxH: number,
  vw: number,
  vh: number,
  insets: LaunchDockInsets
): { edge: LaunchDockEdge; along: number } {
  const cx = left + boxW / 2;
  const cy = top + boxH / 2;
  const edge = nearestLaunchDockEdge(cx, cy, vw, vh);
  const m = EDGE_MARGIN;

  switch (edge) {
    case "top":
    case "bottom": {
      const minL = insets.left + m;
      const maxL = vw - insets.right - m - boxW;
      const span = Math.max(1, maxL - minL);
      return { edge, along: clamp01((left - minL) / span) };
    }
    case "left":
    case "right":
    default: {
      const minT = insets.top + m;
      const maxT = vh - insets.bottomChrome - m - boxH;
      const span = Math.max(1, maxT - minT);
      return { edge, along: clamp01((top - minT) / span) };
    }
  }
}

export function normalizeLaunchDockPersisted(raw: unknown): LaunchDockPersisted | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const edge = p.edge;
  if (edge !== "top" && edge !== "right" && edge !== "bottom" && edge !== "left") {
    return null;
  }
  const along =
    typeof p.along === "number" && Number.isFinite(p.along) ? clamp01(p.along) : 0.5;
  return { edge, collapsed: !!p.collapsed, along };
}
