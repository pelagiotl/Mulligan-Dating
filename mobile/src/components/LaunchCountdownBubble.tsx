import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  useWindowDimensions,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

/** Same launch instant as web `frontend/src/components/LaunchCountdown.tsx` */
const LAUNCH_MS = new Date(2026, 5, 6, 0, 0, 0, 0).getTime();

const STORAGE_KEY = 'mulligan-launch-bubble-mobile-v1';

type Edge = 'top' | 'right' | 'bottom' | 'left';

type Persisted = {
  edge: Edge;
  collapsed: boolean;
};

type Remaining = { live: true; days: 0 } | { live: false; days: number };

function computeRemaining(): Remaining {
  const diff = LAUNCH_MS - Date.now();
  if (diff <= 0) return { live: true, days: 0 };
  return { live: false, days: Math.floor(diff / 86400000) };
}

function nearestEdge(cx: number, cy: number, vw: number, vh: number): Edge {
  const dTop = cy;
  const dBottom = vh - cy;
  const dLeft = cx;
  const dRight = vw - cx;
  const min = Math.min(dTop, dBottom, dLeft, dRight);
  if (min === dTop) return 'top';
  if (min === dBottom) return 'bottom';
  if (min === dLeft) return 'left';
  return 'right';
}

function presetTopLeft(
  edge: Edge,
  vw: number,
  vh: number,
  topInset: number,
  leftInset: number,
  rightInset: number,
  bottomChrome: number,
  w: number,
  h: number
): { left: number; top: number } {
  const m = 8;
  switch (edge) {
    case 'top':
      return { left: Math.max(m + leftInset, (vw - w) / 2), top: topInset + m };
    case 'bottom':
      return {
        left: Math.max(m + leftInset, (vw - w) / 2),
        top: Math.max(m + topInset, vh - bottomChrome - h - m),
      };
    case 'left':
      return { left: leftInset + m, top: Math.max(m + topInset, (vh - h) / 2) };
    case 'right':
    default:
      return {
        left: Math.max(m + leftInset, vw - rightInset - m - w),
        top: Math.max(m + topInset, (vh - h) / 2),
      };
  }
}

export type LaunchCountdownBubbleProps = {
  /** Height from bottom of screen occupied by tab bar + safe area (see BrowseScreen). */
  bottomTabOccupancy: number;
  topInset: number;
  leftInset: number;
  rightInset: number;
};

export default function LaunchCountdownBubble({
  bottomTabOccupancy,
  topInset,
  leftInset,
  rightInset,
}: LaunchCountdownBubbleProps) {
  const { width: vw, height: vh } = useWindowDimensions();
  const [remaining, setRemaining] = useState<Remaining>(() => computeRemaining());
  const [edge, setEdge] = useState<Edge>('top');
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [boxW, setBoxW] = useState(248);
  const [boxH, setBoxH] = useState(152);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<View>(null);
  const dragMovedRef = useRef(false);
  const collapsedLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapsedLongPressTimer = useCallback(() => {
    if (collapsedLongPressTimerRef.current) {
      clearTimeout(collapsedLongPressTimerRef.current);
      collapsedLongPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCollapsedLongPressTimer(), [clearCollapsedLongPressTimer]);

  useEffect(() => {
    const id = setInterval(() => setRemaining(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const j = JSON.parse(raw) as Partial<Persisted>;
          if (j.edge === 'top' || j.edge === 'bottom' || j.edge === 'left' || j.edge === 'right') {
            setEdge(j.edge);
          }
          if (typeof j.collapsed === 'boolean') {
            setCollapsed(j.collapsed);
          }
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: Persisted) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void persist({ edge, collapsed });
  }, [edge, collapsed, hydrated, persist]);

  const basePos = useMemo(
    () => presetTopLeft(edge, vw, vh, topInset, leftInset, rightInset, bottomTabOccupancy, boxW, boxH),
    [edge, vw, vh, topInset, leftInset, rightInset, bottomTabOccupancy, boxW, boxH]
  );

  const onLayoutBubble = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setBoxW(width);
      setBoxH(height);
    }
  }, []);

  const finishDragSnap = useCallback(() => {
    wrapRef.current?.measureInWindow((x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const nextEdge = nearestEdge(cx, cy, vw, vh);
      setEdge(nextEdge);
      setCollapsed(true);
      setPan({ x: 0, y: 0 });
      setDragging(false);
    });
  }, [vw, vh]);

  const resetToTopExpanded = useCallback(() => {
    clearCollapsedLongPressTimer();
    setEdge('top');
    setCollapsed(false);
    setPan({ x: 0, y: 0 });
    setDragging(false);
    void persist({ edge: 'top', collapsed: false });
  }, [persist, clearCollapsedLongPressTimer]);

  const MOVE_PX = 12;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        /**
         * Collapsed chip: claim touches immediately so a tap gets Grant + Release and can expand.
         * Expanded card: wait for movement so “Minimize” and inner taps work without stealing the responder.
         */
        onStartShouldSetPanResponder: () => collapsed,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          !collapsed && (Math.abs(g.dx) > MOVE_PX || Math.abs(g.dy) > MOVE_PX),
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !collapsed && (Math.abs(g.dx) > MOVE_PX || Math.abs(g.dy) > MOVE_PX),
        onPanResponderGrant: (_, g) => {
          if (collapsed) {
            dragMovedRef.current = false;
            setDragging(false);
            clearCollapsedLongPressTimer();
            collapsedLongPressTimerRef.current = setTimeout(() => {
              collapsedLongPressTimerRef.current = null;
              resetToTopExpanded();
            }, 480);
          } else {
            dragMovedRef.current =
              Math.abs(g.dx) > MOVE_PX || Math.abs(g.dy) > MOVE_PX;
            setDragging(true);
            clearCollapsedLongPressTimer();
          }
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > MOVE_PX || Math.abs(g.dy) > MOVE_PX) {
            dragMovedRef.current = true;
            clearCollapsedLongPressTimer();
            setDragging(true);
          }
          setPan({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: () => {
          clearCollapsedLongPressTimer();
          const moved = dragMovedRef.current;
          dragMovedRef.current = false;
          setDragging(false);
          if (collapsed) {
            if (!moved) {
              setCollapsed(false);
              setPan({ x: 0, y: 0 });
            } else {
              finishDragSnap();
            }
          } else if (moved) {
            finishDragSnap();
          } else {
            setPan({ x: 0, y: 0 });
          }
        },
        onPanResponderTerminate: () => {
          clearCollapsedLongPressTimer();
          dragMovedRef.current = false;
          setDragging(false);
          setPan({ x: 0, y: 0 });
        },
      }),
    [collapsed, finishDragSnap, clearCollapsedLongPressTimer, resetToTopExpanded]
  );

  const left = basePos.left + pan.x;
  const top = basePos.top + pan.y;

  const isVerticalDock = edge === 'left' || edge === 'right';

  const expandCue =
    edge === 'top' ? '▼' : edge === 'bottom' ? '▲' : edge === 'left' ? '›' : '‹';

  return (
    <View style={styles.screenOverlay} pointerEvents="box-none">
      <View
        ref={wrapRef}
        collapsable={false}
        style={[
          styles.bubbleWrap,
          {
            left,
            top,
            opacity: dragging ? 0.92 : 1,
          },
        ]}
        onLayout={onLayoutBubble}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityHint="Drag to move and dock on an edge. Tap collapsed chip to expand. Hold collapsed chip to reset."
      >
        {collapsed ? (
          <LinearGradient
            colors={['#fdf4ff', '#ede9fe', '#fce7f3', '#fff7ed']}
            locations={[0, 0.35, 0.65, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.collapsedGradient,
              isVerticalDock ? styles.collapsedVertical : styles.collapsedHorizontal,
            ]}
          >
            <Text style={styles.collapsedEmoji} allowFontScaling={false}>
              ⏳
            </Text>
            <Text style={styles.collapsedLabel} numberOfLines={1}>
              {remaining.live ? 'Live' : `${remaining.days}d`}
            </Text>
            <Text style={styles.collapsedChevron} allowFontScaling={false}>
              {expandCue}
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.expandedOuter}>
            <LinearGradient
              colors={['#ffffff', '#faf5ff', '#fdf2f8', '#f5f3ff']}
              locations={[0, 0.3, 0.62, 1]}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={[styles.expandedCard, isVerticalDock && styles.expandedCardVertical]}
            >
              <LinearGradient
                colors={['rgba(192, 38, 211, 0.22)', 'rgba(244, 114, 182, 0.12)', 'transparent']}
                locations={[0, 0.45, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.expandedSheen}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(217, 70, 239, 0.9)', 'rgba(244, 114, 182, 0.85)', 'rgba(99, 102, 241, 0.75)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.expandedAccentBar}
                pointerEvents="none"
              />

              <View style={styles.dragHintRow}>
                <View style={styles.dragGrip} />
                <Text style={styles.dragHint}>Drag to an edge to dock</Text>
              </View>

              {remaining.live ? (
                <>
                  <View style={styles.headerRow}>
                    <View style={styles.hourglassBadge}>
                      <Text style={styles.hourglass} allowFontScaling={false}>
                        ⏳
                      </Text>
                    </View>
                    <Text style={styles.heading}>June 6 launch</Text>
                  </View>
                  <Text style={styles.liveMsg}>{"We're live — welcome to Mulligan."}</Text>
                </>
              ) : (
                <>
                  <View style={styles.headerRow}>
                    <View style={styles.hourglassBadge}>
                      <Text style={styles.hourglass} allowFontScaling={false}>
                        ⏳
                      </Text>
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={styles.heading}>June 6 launch</Text>
                      <Text style={styles.sub}>Time until launch</Text>
                    </View>
                  </View>
                  <View style={styles.grid} accessibilityLabel={`${remaining.days} days until launch`}>
                    <LinearGradient
                      colors={['rgba(255, 255, 255, 0.98)', 'rgba(250, 245, 255, 0.99)', 'rgba(254, 242, 242, 0.95)']}
                      locations={[0, 0.5, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.cellGradient}
                    >
                      <Text style={styles.value}>{remaining.days}</Text>
                      <Text style={styles.unit}>Days</Text>
                    </LinearGradient>
                  </View>
                </>
              )}

              <Pressable
                style={styles.collapseBtn}
                onPress={() => setCollapsed(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Collapse launch countdown"
              >
                <Text style={styles.collapseBtnText}>Minimize</Text>
              </Pressable>
            </LinearGradient>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    ...(Platform.OS === 'android' ? { elevation: 24 } : {}),
  },
  bubbleWrap: {
    position: 'absolute',
    zIndex: 201,
    maxWidth: Platform.OS === 'android' ? 292 : 318,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 26 },
    }),
  },
  collapsedGradient: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedHorizontal: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    minWidth: 142,
  },
  collapsedVertical: {
    flexDirection: 'column',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 3,
    minHeight: 102,
  },
  collapsedEmoji: {
    fontSize: 16,
  },
  collapsedLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#86198f',
  },
  collapsedChevron: {
    fontSize: 10,
    color: '#94a3b8',
    marginLeft: 2,
  },
  expandedOuter: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
  },
  expandedCard: {
    borderRadius: 20,
    paddingTop: 12,
    paddingBottom: 11,
    paddingHorizontal: 14,
    minWidth: 236,
    overflow: 'hidden',
  },
  expandedCardVertical: {
    minWidth: 188,
  },
  expandedSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 78,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  expandedAccentBar: {
    position: 'absolute',
    top: 8,
    left: 22,
    right: 22,
    height: 2,
    borderRadius: 2,
    opacity: 0.92,
  },
  dragHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dragGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.5)',
  },
  dragHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7c8796',
    letterSpacing: 0.35,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
  },
  hourglassBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
  },
  hourglass: {
    fontSize: 20,
  },
  heading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#701a75',
    letterSpacing: -0.35,
  },
  sub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  grid: {
    alignItems: 'center',
    marginBottom: 8,
  },
  cellGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(236, 72, 153, 0.28)',
    minWidth: 118,
  },
  value: {
    fontSize: 34,
    fontWeight: '900',
    color: '#312e81',
    letterSpacing: -0.8,
  },
  unit: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  liveMsg: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  collapseBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(219, 39, 119, 0.28)',
  },
  collapseBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#be185d',
  },
});
