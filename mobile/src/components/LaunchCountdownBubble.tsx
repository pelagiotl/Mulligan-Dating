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
import type { ConnectShellMode } from '../lib/connectShellTheme';
import { launchCountdownTheme } from '../lib/launchCountdownTheme';

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
  /** Matches Connect landing hero + chrome (Settings → appearance). */
  connectShell: ConnectShellMode;
};

export default function LaunchCountdownBubble({
  bottomTabOccupancy,
  topInset,
  leftInset,
  rightInset,
  connectShell,
}: LaunchCountdownBubbleProps) {
  const theme = useMemo(() => launchCountdownTheme(connectShell), [connectShell]);
  const { width: vw, height: vh } = useWindowDimensions();
  const [remaining, setRemaining] = useState<Remaining>(() => computeRemaining());
  const [edge, setEdge] = useState<Edge>('top');
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [boxW, setBoxW] = useState(200);
  const [boxH, setBoxH] = useState(118);
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
          collapsed && styles.bubbleWrapCollapsed,
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
            colors={theme.collapsedGradient}
            locations={theme.collapsedGradientLocations}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.collapsedGradient,
              { borderColor: theme.collapsedBorder },
              isVerticalDock ? styles.collapsedVertical : styles.collapsedHorizontal,
            ]}
          >
            <Text style={styles.collapsedEmoji} allowFontScaling={false}>
              ⏳
            </Text>
            <Text style={[styles.collapsedLabel, { color: theme.collapsedLabel }]} numberOfLines={1}>
              {remaining.live ? 'Live' : `${remaining.days}d`}
            </Text>
            <Text
              style={[styles.collapsedChevron, { color: theme.collapsedCue }]}
              allowFontScaling={false}
            >
              {expandCue}
            </Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.expandedOuter,
              {
                borderColor: theme.expandedBorder,
                shadowColor: theme.expandedShadowColor,
              },
            ]}
          >
            <LinearGradient
              colors={theme.expandedGradient}
              locations={theme.expandedGradientLocations}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={[styles.expandedCard, isVerticalDock && styles.expandedCardVertical]}
            >
              <LinearGradient
                colors={theme.sheenColors}
                locations={[0, 0.45, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.expandedSheen}
                pointerEvents="none"
              />
              <LinearGradient
                colors={theme.accentColors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.expandedAccentBar}
                pointerEvents="none"
              />

              <View style={styles.dragHintRow}>
                <View style={[styles.dragGrip, { backgroundColor: theme.dragGrip }]} />
                <Text style={[styles.dragHint, { color: theme.dragHint }]}>Drag to an edge to dock</Text>
              </View>

              {remaining.live ? (
                <>
                  <View style={styles.headerRow}>
                    <View
                      style={[
                        styles.hourglassBadge,
                        {
                          backgroundColor: theme.hourglassBadgeBg,
                          borderColor: theme.hourglassBadgeBorder,
                        },
                      ]}
                    >
                      <Text style={styles.hourglass} allowFontScaling={false}>
                        ⏳
                      </Text>
                    </View>
                    <Text style={[styles.heading, { color: theme.heading }]}>June 6 launch</Text>
                  </View>
                  <Text style={[styles.liveMsg, { color: theme.liveMsg }]}>
                    {"We're live — welcome to Mulligan."}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.headerRow}>
                    <View
                      style={[
                        styles.hourglassBadge,
                        {
                          backgroundColor: theme.hourglassBadgeBg,
                          borderColor: theme.hourglassBadgeBorder,
                        },
                      ]}
                    >
                      <Text style={styles.hourglass} allowFontScaling={false}>
                        ⏳
                      </Text>
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={[styles.heading, { color: theme.heading }]}>June 6 launch</Text>
                      <Text style={[styles.sub, { color: theme.sub }]}>Time until launch</Text>
                    </View>
                  </View>
                  <View style={styles.grid} accessibilityLabel={`${remaining.days} days until launch`}>
                    <LinearGradient
                      colors={theme.cellGradient}
                      locations={[0, 0.5, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.cellGradient, { borderColor: theme.cellBorder }]}
                    >
                      <Text style={[styles.value, { color: theme.value }]}>{remaining.days}</Text>
                      <Text style={[styles.unit, { color: theme.unit }]}>Days</Text>
                    </LinearGradient>
                  </View>
                </>
              )}

              <Pressable
                style={[
                  styles.collapseBtn,
                  {
                    backgroundColor: theme.minimizeBg,
                    borderColor: theme.minimizeBorder,
                  },
                ]}
                onPress={() => setCollapsed(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Collapse launch countdown"
              >
                <Text style={[styles.collapseBtnText, { color: theme.minimizeText }]}>Minimize</Text>
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
    maxWidth: Platform.OS === 'android' ? 248 : 268,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 20 },
    }),
  },
  bubbleWrapCollapsed: {
    maxWidth: Platform.OS === 'android' ? 168 : 184,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 10 },
    }),
  },
  collapsedGradient: {
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedHorizontal: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 3,
    minWidth: 76,
  },
  collapsedVertical: {
    flexDirection: 'column',
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 1,
    minHeight: 52,
  },
  collapsedEmoji: {
    fontSize: 11,
  },
  collapsedLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  collapsedChevron: {
    fontSize: 8,
    marginLeft: 0,
  },
  expandedOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  expandedCard: {
    borderRadius: 16,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 11,
    minWidth: 188,
    overflow: 'hidden',
  },
  expandedCardVertical: {
    minWidth: 156,
  },
  expandedSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 52,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
    gap: 5,
    marginBottom: 4,
  },
  dragGrip: {
    width: 28,
    height: 3,
    borderRadius: 2,
  },
  dragHint: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  headerCopy: {
    flex: 1,
  },
  hourglassBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  hourglass: {
    fontSize: 16,
  },
  heading: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 8,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grid: {
    alignItems: 'center',
    marginBottom: 5,
  },
  cellGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 88,
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  unit: {
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  liveMsg: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  collapseBtn: {
    alignSelf: 'center',
    marginTop: 2,
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  collapseBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
