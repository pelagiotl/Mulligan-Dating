import {
  CONNECT_SHIMMER_DURATION_MS,
  CONNECT_SHIMMER_LOOP_GAP_MS,
} from '../constants/connectButtonEffects';

/**
 * Linear 0→1 with end-of-loop hold — matches RN Animated.sequence
 * (timing 0→1, delay 50ms, snap to 0).
 */
export function connectShimmerProgressAt(
  now: number,
  startMs: number,
  durationMs = CONNECT_SHIMMER_DURATION_MS,
  loopGapMs = CONNECT_SHIMMER_LOOP_GAP_MS
): number {
  const cycleMs = durationMs + loopGapMs;
  const elapsed = (now - startMs) % cycleMs;
  return elapsed < durationMs ? elapsed / durationMs : 1;
}
