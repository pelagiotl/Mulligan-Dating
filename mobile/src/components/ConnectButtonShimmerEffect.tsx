import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import ConnectButtonHeartFireworks from './ConnectButtonHeartFireworks';
import {
  connectButtonShimmerColors,
  type ConnectButtonShimmerColors,
  type ConnectShellMode,
} from '../lib/connectShellTheme';

/** One loop of the perimeter trace (linear progress 0→1). */
export const CONNECT_SHIMMER_DURATION_MS = 3400;

const EDGE = 2.5;

type ConnectButtonShimmerEffectProps = {
  /** Loops 0 → 1 (linear timing — constant speed along the perimeter). */
  progress: Animated.Value;
  borderRadius?: number;
  /** Fallback width before onLayout (left-anchored scaleX math). */
  sweepWidth?: number;
  /** Shooting-star hearts + mini bursts on the button. */
  showHearts?: boolean;
  /** Landing chrome — trace contrast on sunny/soft shells. */
  shell?: ConnectShellMode;
  /** Optional override (e.g. Sober Circle green trace). */
  colors?: ConnectButtonShimmerColors;
  style?: StyleProp<ViewStyle>;
};

type TraceMetrics = {
  traceW: number;
  sideSegmentH: number;
  hEnd: number;
};

function computeMetrics(width: number, height: number, borderRadius: number): TraceMetrics {
  const traceW = width;
  const sideSegmentH = Math.max(1, height - borderRadius * 2);
  const perimeter = traceW + sideSegmentH;
  const hEnd = perimeter > 0 ? traceW / perimeter : 0.75;
  return { traceW, sideSegmentH, hEnd };
}

/**
 * Shared corner window: top/bottom still finish while the right edge begins moving
 * so speed does not drop when the sweep reaches the right side.
 */
function buildSweepInterpolates(progress: Animated.Value, metrics: TraceMetrics) {
  const { traceW, sideSegmentH, hEnd } = metrics;
  const halfW = traceW / 2;

  const blend = Math.min(0.045, (1 - hEnd) * 0.45);
  const cornerStart = Math.max(0, hEnd - blend);
  const cornerEnd = Math.min(1, hEnd + blend * 0.35);

  const scaleX = progress.interpolate({
    inputRange: [0, cornerStart, cornerEnd, 1],
    outputRange: [0.001, 0.97, 1, 1],
    extrapolate: 'clamp',
  });

  const sweepTransform = [
    { translateX: -halfW },
    { scaleX },
    { translateX: halfW },
  ];

  const rightEdgeY = progress.interpolate({
    inputRange: [0, cornerStart, cornerEnd, 1],
    outputRange: [-sideSegmentH, -sideSegmentH, -sideSegmentH * 0.35, 0],
    extrapolate: 'clamp',
  });

  return { sweepTransform, rightEdgeY, cornerStart };
}

type CornerKind = 'tl' | 'tr' | 'bl' | 'br';

function cornerLStyle(
  kind: CornerKind,
  borderRadius: number,
  traceColor: string
) {
  const arm = borderRadius + EDGE;
  const base = {
    position: 'absolute' as const,
    width: arm,
    height: arm,
    backgroundColor: 'transparent',
  };
  switch (kind) {
    case 'tl':
      return {
        ...base,
        left: 0,
        top: 0,
        borderTopWidth: EDGE,
        borderLeftWidth: EDGE,
        borderTopColor: traceColor,
        borderLeftColor: traceColor,
        borderTopLeftRadius: borderRadius,
      };
    case 'tr':
      return {
        ...base,
        right: 0,
        top: 0,
        borderTopWidth: EDGE,
        borderRightWidth: EDGE,
        borderTopColor: traceColor,
        borderRightColor: traceColor,
        borderTopRightRadius: borderRadius,
      };
    case 'bl':
      return {
        ...base,
        left: 0,
        bottom: 0,
        borderBottomWidth: EDGE,
        borderLeftWidth: EDGE,
        borderBottomColor: traceColor,
        borderLeftColor: traceColor,
        borderBottomLeftRadius: borderRadius,
      };
    case 'br':
      return {
        ...base,
        right: 0,
        bottom: 0,
        borderBottomWidth: EDGE,
        borderRightWidth: EDGE,
        borderBottomColor: traceColor,
        borderRightColor: traceColor,
        borderBottomRightRadius: borderRadius,
      };
  }
}

/**
 * Perimeter traces left → top & bottom extend with sweep; right edge top→bottom.
 */
export default function ConnectButtonShimmerEffect({
  progress,
  borderRadius = 22,
  sweepWidth = 320,
  showHearts = true,
  shell = 'midnight',
  colors: colorsOverride,
  style,
}: ConnectButtonShimmerEffectProps) {
  const colors = useMemo(
    () => colorsOverride ?? connectButtonShimmerColors(shell),
    [colorsOverride, shell],
  );
  const layoutLocked = useRef(false);
  const [metrics, setMetrics] = useState(() =>
    computeMetrics(sweepWidth, 56, borderRadius)
  );

  useEffect(() => {
    layoutLocked.current = false;
    setMetrics(computeMetrics(sweepWidth, 56, borderRadius));
  }, [shell, borderRadius, sweepWidth]);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) {
        const next = computeMetrics(width, height, borderRadius);
        setMetrics((prev) => {
          if (
            prev.traceW === next.traceW &&
            prev.sideSegmentH === next.sideSegmentH &&
            prev.hEnd === next.hEnd
          ) {
            return prev;
          }
          return next;
        });
        layoutLocked.current = true;
      }
    },
    [borderRadius]
  );

  const { sweepTransform, rightEdgeY, cornerStart } = useMemo(
    () => buildSweepInterpolates(progress, metrics),
    [progress, metrics]
  );

  const { traceW, sideSegmentH, hEnd } = metrics;

  const traceOpacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 0.03, 1],
        outputRange: [0.5, 1, 1],
      }),
    [progress]
  );

  const rightPhaseOpacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [cornerStart - 0.002, cornerStart],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [progress, cornerStart]
  );

  const leftCornerOpacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, Math.min(0.05, hEnd * 0.12)],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [progress, hEnd]
  );

  const leftEdgeOpacity = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, Math.min(0.06, hEnd * 0.14)],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [progress, hEnd]
  );

  const edgeStyles = useMemo(
    () => ({
      left: {
        position: 'absolute' as const,
        left: 0,
        width: EDGE,
        backgroundColor: colors.trace,
        shadowColor: colors.glow,
        shadowOpacity: 0.6,
        shadowRadius: 5,
      },
      top: {
        position: 'absolute' as const,
        top: 0,
        height: EDGE,
        backgroundColor: colors.trace,
        shadowColor: colors.glow,
        shadowOpacity: 0.7,
        shadowRadius: 6,
      },
      bottom: {
        position: 'absolute' as const,
        bottom: 0,
        height: EDGE,
        backgroundColor: colors.trace,
        shadowColor: colors.glow,
        shadowOpacity: 0.7,
        shadowRadius: 6,
      },
      right: {
        position: 'absolute' as const,
        right: 0,
        top: 0,
        width: EDGE,
        backgroundColor: colors.trace,
        shadowColor: colors.glow,
        shadowOpacity: 0.85,
        shadowRadius: 6,
      },
      resting: {
        borderWidth: 1,
        borderColor: colors.resting,
      },
    }),
    [colors]
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      onLayout={onLayout}
    >
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius }]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.restingPerimeter,
            edgeStyles.resting,
            { borderRadius },
          ]}
        />

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: traceOpacity }]}>
          <Animated.View
            style={[cornerLStyle('tl', borderRadius, colors.trace), { opacity: leftCornerOpacity }]}
          />
          <Animated.View
            style={[cornerLStyle('bl', borderRadius, colors.trace), { opacity: leftCornerOpacity }]}
          />
          <Animated.View
            style={[
              edgeStyles.left,
              {
                top: borderRadius,
                bottom: borderRadius,
                opacity: leftEdgeOpacity,
              },
            ]}
          />

          <Animated.View
            style={[
              edgeStyles.top,
              { width: traceW, left: 0, transform: sweepTransform },
            ]}
          />
          <Animated.View
            style={[
              edgeStyles.bottom,
              { width: traceW, left: 0, transform: sweepTransform },
            ]}
          />

          <Animated.View
            style={[styles.rightStack, { opacity: rightPhaseOpacity }]}
            pointerEvents="none"
          >
            <View style={cornerLStyle('tr', borderRadius, colors.trace)} />
            <View style={cornerLStyle('br', borderRadius, colors.trace)} />
            <View
              style={[
                styles.rightEdgeClip,
                { top: borderRadius, height: sideSegmentH },
              ]}
            >
              <Animated.View
                style={[
                  edgeStyles.right,
                  {
                    height: sideSegmentH,
                    transform: [{ translateY: rightEdgeY }],
                  },
                ]}
              />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
      {showHearts ? <ConnectButtonHeartFireworks active /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  restingPerimeter: {},
  rightStack: {
    ...StyleSheet.absoluteFillObject,
  },
  rightEdgeClip: {
    position: 'absolute',
    right: 0,
    width: EDGE,
    overflow: 'hidden',
  },
});
