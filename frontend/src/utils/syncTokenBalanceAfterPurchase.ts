import { api } from "./api";
import { emitTokenBalanceUpdated } from "../lib/tokenBalanceEvents";

/**
 * Poll GET /tokens after IAP/web checkout — RevenueCat webhooks and cache can lag briefly.
 * Returns the latest available token count when found.
 */
export async function syncTokenBalanceAfterPurchase(
  balanceBefore?: number
): Promise<number | null> {
  const start =
    typeof balanceBefore === "number" && !Number.isNaN(balanceBefore) ? balanceBefore : null;
  const maxAttempts = 10;
  const delayMs = 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const tokenData = await api.get<{ availableTokens: number }>(
        `/tokens?_=${Date.now()}`
      );
      const n = tokenData.availableTokens;
      if (typeof n === "number" && !Number.isNaN(n)) {
        emitTokenBalanceUpdated(n);
        if (start === null || n > start) return n;
      }
    } catch {
      // keep polling
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  try {
    const tokenData = await api.get<{ availableTokens: number }>(
      `/tokens?_=${Date.now()}`
    );
    const n = tokenData.availableTokens;
    if (typeof n === "number" && !Number.isNaN(n)) {
      emitTokenBalanceUpdated(n);
      return n;
    }
  } catch {
    // ignore
  }
  return null;
}
