import { CONNECT_SHIMMER_DURATION_MS } from '../constants/connectButtonEffects';

/** Linear 0→1 loop with no end hold — continuous motion. */
export function connectShimmerProgressAt(
  now: number,
  startMs: number,
  durationMs = CONNECT_SHIMMER_DURATION_MS
): number {
  const elapsed = (now - startMs) % durationMs;
  return elapsed / durationMs;
}
