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
  const [boxW, setBoxW] = useState(280);
  const [boxH, setBoxH] = useState(168);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<View>(null);

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => collapsed === false,
        onMoveShouldSetPanResponder: (_, g) =>
          collapsed === false && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderGrant: () => {
          setDragging(true);
        },
        onPanResponderMove: (_, g) => {
          setPan({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: () => {
          finishDragSnap();
        },
        onPanResponderTerminate: () => {
          finishDragSnap();
        },
      }),
    [collapsed, finishDragSnap]
  );

  const onCollapsedLongPress = useCallback(() => {
    setEdge('top');
    setCollapsed(false);
    void persist({ edge: 'top', collapsed: false });
  }, [persist]);

  const left = basePos.left + pan.x;
  const top = basePos.top + pan.y;

  const isVerticalDock = edge === 'left' || edge === 'right';

  const expandCue =
    edge === 'top' ? '▼' : edge === 'bottom' ? '▲' : edge === 'left' ? '›' : '‹';

  return (
    <View style={styles.screenOverlay} pointerEvents="box-none">
      <View
        ref={wrapRef}
        style={[
          styles.bubbleWrap,
          {
            left,
            top,
            opacity: dragging ? 0.92 : 1,
          },
        ]}
        onLayout={onLayoutBubble}
        {...(collapsed ? {} : panResponder.panHandlers)}
      >
        {collapsed ? (
          <Pressable
            onPress={() => setCollapsed(false)}
            onLongPress={onCollapsedLongPress}
            delayLongPress={420}
            accessibilityRole="button"
            accessibilityHint="Opens countdown. Long-press to reset to the top."
          >
            <LinearGradient
              colors={['#fdf2f8', '#ede9fe', '#fce7f3']}
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
          </Pressable>
        ) : (
          <LinearGradient
            colors={['#ffffff', '#fff7fb', '#faf5ff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.expandedCard, isVerticalDock && styles.expandedCardVertical]}
          >
            <View style={styles.dragHintRow}>
              <View style={styles.dragGrip} />
              <Text style={styles.dragHint}>Drag to an edge</Text>
            </View>

            {remaining.live ? (
              <>
                <View style={styles.headerRow}>
                  <Text style={styles.hourglass} allowFontScaling={false}>
                    ⏳
                  </Text>
                  <Text style={styles.heading}>June 6 launch</Text>
                </View>
                <Text style={styles.liveMsg}>{"We're live — welcome to Mulligan."}</Text>
              </>
            ) : (
              <>
                <View style={styles.headerRow}>
                  <Text style={styles.hourglass} allowFontScaling={false}>
                    ⏳
                  </Text>
                  <View style={styles.headerCopy}>
                    <Text style={styles.heading}>June 6 launch</Text>
                    <Text style={styles.sub}>Time until launch</Text>
                  </View>
                </View>
                <View style={styles.grid} accessibilityLabel={`${remaining.days} days until launch`}>
                  <View style={styles.cell}>
                    <Text style={styles.value}>{remaining.days}</Text>
                    <Text style={styles.unit}>Days</Text>
                  </View>
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
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  bubbleWrap: {
    position: 'absolute',
    zIndex: 51,
    maxWidth: Platform.OS === 'android' ? 320 : 340,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  collapsedGradient: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedHorizontal: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    minWidth: 168,
  },
  collapsedVertical: {
    flexDirection: 'column',
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
    minHeight: 120,
  },
  collapsedEmoji: {
    fontSize: 18,
  },
  collapsedLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#881337',
  },
  collapsedChevron: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 4,
  },
  expandedCard: {
    borderRadius: 22,
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    minWidth: 260,
  },
  expandedCardVertical: {
    minWidth: 200,
  },
  dragHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dragGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.45)',
  },
  dragHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.3,
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
  hourglass: {
    fontSize: 26,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5c1423',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  grid: {
    alignItems: 'center',
    marginBottom: 8,
  },
  cell: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
  },
  value: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0f172a',
  },
  unit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2,
  },
  liveMsg: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },
  collapseBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  collapseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be185d',
  },
});
