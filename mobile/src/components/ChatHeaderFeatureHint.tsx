/**
 * Discoverability cue for chat-header icon buttons (pulse + tip).
 * Dismisses permanently after first tap (AsyncStorage).
 * Only one tip label shows at a time across the header (others still pulse).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = {
  storageKey: string;
  label: string;
  /** Lower shows first when several hints are pending. Default 100. */
  priority?: number;
  /** Soft glow tint behind the button while hinting. */
  glowColor?: string;
  /** Keep a gentle pulse even after the tip is dismissed. */
  alwaysPulse?: boolean;
  /** When false, never pulse (tips can still show). Default true. */
  enablePulse?: boolean;
  /** Keep the tip bubble visible forever (never dismiss on tap). */
  alwaysShowTip?: boolean;
  /**
   * Horizontal placement of the tip relative to the button.
   * `end` shifts the tip right (away from left-side avatar); `start` shifts left.
   */
  tipAlign?: 'center' | 'start' | 'end';
  /** Place tip above or below the button. */
  tipPlacement?: 'above' | 'below';
  /** Distance from the button edge to the tip. */
  tipLift?: number;
  /** Tip bubble width. */
  tipWidth?: number;
  children: (opts: { onPressWithHintDismiss: (open: () => void) => void }) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

type Claim = { id: string; priority: number };

let activeClaimId: string | null = null;
const pendingClaims = new Map<string, Claim>();
const claimListeners = new Set<() => void>();

function notifyClaims() {
  claimListeners.forEach((l) => l());
}

function recomputeActiveClaim() {
  let best: Claim | null = null;
  for (const claim of pendingClaims.values()) {
    if (!best || claim.priority < best.priority) best = claim;
  }
  const nextId = best?.id ?? null;
  if (nextId !== activeClaimId) {
    activeClaimId = nextId;
    notifyClaims();
  }
}

function registerClaim(id: string, priority: number) {
  pendingClaims.set(id, { id, priority });
  recomputeActiveClaim();
}

function unregisterClaim(id: string) {
  pendingClaims.delete(id);
  if (activeClaimId === id) activeClaimId = null;
  recomputeActiveClaim();
}

export default function ChatHeaderFeatureHint({
  storageKey,
  label,
  priority = 100,
  glowColor = 'rgba(45, 212, 191, 0.35)',
  alwaysPulse = false,
  enablePulse = true,
  alwaysShowTip = false,
  tipAlign = 'center',
  tipPlacement = 'above',
  tipLift = 38,
  tipWidth = 120,
  children,
  style,
}: Props) {
  const [showHint, setShowHint] = useState(alwaysShowTip);
  const [isActiveTip, setIsActiveTip] = useState(alwaysShowTip);
  const hintPulse = useRef(new Animated.Value(0)).current;
  const hintLabelOpacity = useRef(new Animated.Value(alwaysShowTip ? 1 : 0)).current;

  useEffect(() => {
    if (alwaysShowTip) {
      setShowHint(true);
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(storageKey).then((v) => {
      if (!cancelled && v !== '1') setShowHint(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey, alwaysShowTip]);

  useEffect(() => {
    if (alwaysShowTip) {
      // Sticky tip does not enter the single-active-tip claim pool.
      unregisterClaim(storageKey);
      setIsActiveTip(true);
      return;
    }
    if (!showHint) {
      unregisterClaim(storageKey);
      setIsActiveTip(false);
      return;
    }
    registerClaim(storageKey, priority);
    const sync = () => setIsActiveTip(activeClaimId === storageKey);
    sync();
    claimListeners.add(sync);
    return () => {
      claimListeners.delete(sync);
      unregisterClaim(storageKey);
    };
  }, [showHint, storageKey, priority, alwaysShowTip]);

  useEffect(() => {
    const wantPulse =
      enablePulse && (showHint || alwaysPulse || alwaysShowTip);
    if (!wantPulse) {
      hintPulse.stopAnimation();
      hintPulse.setValue(0);
      if (!alwaysShowTip && !showHint) hintLabelOpacity.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hintPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hintPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [showHint, alwaysPulse, alwaysShowTip, enablePulse, hintPulse, hintLabelOpacity]);

  useEffect(() => {
    const tipVisible = alwaysShowTip || (showHint && isActiveTip);
    if (!tipVisible) {
      hintLabelOpacity.setValue(0);
      return;
    }
    hintLabelOpacity.setValue(0);
    Animated.timing(hintLabelOpacity, {
      toValue: 1,
      duration: 420,
      delay: alwaysShowTip ? 120 : 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showHint, isActiveTip, alwaysShowTip, hintLabelOpacity]);

  const dismissHint = useCallback(() => {
    if (alwaysShowTip) return;
    if (!showHint) return;
    setShowHint(false);
    void AsyncStorage.setItem(storageKey, '1').catch(() => {});
    Animated.timing(hintLabelOpacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [showHint, storageKey, hintLabelOpacity, alwaysShowTip]);

  const onPressWithHintDismiss = useCallback(
    (open: () => void) => {
      dismissHint();
      open();
    },
    [dismissHint],
  );

  const showBubble = alwaysShowTip || (showHint && isActiveTip);
  const shouldPulse = enablePulse && (showHint || alwaysPulse || alwaysShowTip);

  const bubblePositionStyle =
    tipAlign === 'start'
      ? { left: 0 as const, right: undefined, marginLeft: 0 }
      : tipAlign === 'end'
        ? { left: undefined, right: 0 as const, marginLeft: 0 }
        : { left: '50%' as const, right: undefined, marginLeft: -(tipWidth / 2) };

  const verticalStyle =
    tipPlacement === 'below'
      ? { top: tipLift, bottom: undefined }
      : { bottom: tipLift, top: undefined };

  const caretPositionStyle =
    tipAlign === 'start'
      ? { left: 18, marginLeft: 0, right: undefined }
      : tipAlign === 'end'
        ? { left: undefined, right: 18, marginLeft: 0 }
        : { left: '50%' as const, marginLeft: -3.5, right: undefined };

  const caretVerticalStyle =
    tipPlacement === 'below'
      ? { top: -4, bottom: undefined, transform: [{ rotate: '-135deg' as const }] }
      : { bottom: -4, top: undefined, transform: [{ rotate: '45deg' as const }] };

  return (
    <View style={[styles.wrap, { zIndex: 8 + Math.round(tipLift / 10) }, style]}>
      {showBubble ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bubble,
            bubblePositionStyle,
            verticalStyle,
            {
              width: tipWidth,
              opacity: hintLabelOpacity,
              transform: [
                {
                  translateY: hintPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: tipPlacement === 'below' ? [0, 1] : [0, -1],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          <View style={[styles.caret, caretPositionStyle, caretVerticalStyle]} />
        </Animated.View>
      ) : null}

      <Animated.View
        style={
          shouldPulse
            ? {
                transform: [
                  {
                    scale: hintPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.1],
                    }),
                  },
                ],
              }
            : undefined
        }
      >
        {shouldPulse ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                backgroundColor: glowColor,
                opacity: hintPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.8],
                }),
                transform: [
                  {
                    scale: hintPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.32],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {children({ onPressWithHintDismiss })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 8,
  },
  glow: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignSelf: 'center',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    zIndex: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.24,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  label: {
    color: '#f1f5f9',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 12,
  },
  caret: {
    position: 'absolute',
    width: 7,
    height: 7,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
});
