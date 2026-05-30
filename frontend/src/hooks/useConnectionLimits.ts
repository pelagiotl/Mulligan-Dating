import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api";
import { subscribeMatchSlotsUpdated } from "../lib/matchSlotEvents";
import { fetchMatchSlotStatus } from "../utils/matchSlotStatus";

export type ConnectionLimitsState = {
  loading: boolean;
  availableTokens: number;
  canClaimWeeklyToken: boolean;
  nextRefillDate: string | null;
  activeMatches: number;
  slotLimit: number;
};

export function useConnectionLimits(enabled = true) {
  const [state, setState] = useState<ConnectionLimitsState>({
    loading: true,
    availableTokens: 0,
    canClaimWeeklyToken: false,
    nextRefillDate: null,
    activeMatches: 0,
    slotLimit: 10,
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      const [tokenData, slots] = await Promise.all([
        api.get<{
          availableTokens: number;
          canClaimWeeklyToken: boolean;
          nextRefillDate?: string | null;
        }>("/tokens", false),
        fetchMatchSlotStatus(),
      ]);
      setState({
        loading: false,
        availableTokens: tokenData.availableTokens ?? 0,
        canClaimWeeklyToken: !!tokenData.canClaimWeeklyToken,
        nextRefillDate: tokenData.nextRefillDate ?? null,
        activeMatches: slots.count,
        slotLimit: slots.slotLimit,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeMatchSlotsUpdated(() => void refresh());
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

  return { ...state, refresh };
}
