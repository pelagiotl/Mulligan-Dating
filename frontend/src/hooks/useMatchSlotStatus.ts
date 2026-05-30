import { useCallback, useEffect, useState } from "react";
import { subscribeMatchSlotsUpdated } from "../lib/matchSlotEvents";
import { fetchMatchSlotStatus, type MatchSlotStatus } from "../utils/matchSlotStatus";

export function useMatchSlotStatus(enabled = true) {
  const [status, setStatus] = useState<MatchSlotStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await fetchMatchSlotStatus();
    setStatus(next);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeMatchSlotsUpdated(() => {
      void refresh();
    });
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, refresh]);

  return { status, loading, refresh, isAtCapacity: status?.isAtCapacity ?? false };
}
