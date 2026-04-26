/** Dispatched when the user's Mulligan token balance changes (claim, purchase, spend, etc.). */
export const TOKEN_BALANCE_UPDATED_EVENT = "mulligan:token-balance-updated";

export type TokenBalanceDetail = { availableTokens: number };

export function emitTokenBalanceUpdated(availableTokens: number): void {
  if (typeof window === "undefined") return;
  if (typeof availableTokens !== "number" || Number.isNaN(availableTokens)) return;
  window.dispatchEvent(
    new CustomEvent<TokenBalanceDetail>(TOKEN_BALANCE_UPDATED_EVENT, {
      detail: { availableTokens },
    })
  );
}
