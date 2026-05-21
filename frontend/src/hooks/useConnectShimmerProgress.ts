import { useEffect, useState } from 'react';
import { CONNECT_SHIMMER_DURATION_MS } from '../constants/connectButtonEffects';

/** Linear 0→1 loop for perimeter shimmer (matches RN connectButtonShimmer timing). */
export function useConnectShimmerProgress(
  active: boolean,
  durationMs = CONNECT_SHIMMER_DURATION_MS
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }

    let start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = (now - start) % durationMs;
      setProgress(elapsed / durationMs);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs]);

  return progress;
}
