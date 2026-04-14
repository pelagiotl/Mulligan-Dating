import { useCallback, useState } from "react";
import { api } from "../utils/api";

type PrepareResponse = {
  checkoutId: string;
  merchantIdentifier: string;
  displayName: string;
  countryCode: string;
  currencyCode: string;
  supportedNetworks: string[];
  merchantCapabilities: string[];
  total: { label: string; amount: string; type?: string };
};

type ApplePaySessionCtor = {
  canMakePayments(): boolean;
  canMakePaymentsWithActiveCard(merchantIdentifier: string): boolean;
  supportsVersion(version: number): boolean;
  readonly STATUS_SUCCESS: number;
  readonly STATUS_FAILURE: number;
  new (version: number, request: Record<string, unknown>): ApplePaySessionInstance;
};

type ApplePaySessionInstance = {
  begin(): void;
  abort(): void;
  completeMerchantValidation(merchantSession: unknown): void;
  completePayment(result: number): void;
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: unknown } }) => void) | null;
  oncancel: (() => void) | null;
};

function getApplePaySession(): ApplePaySessionCtor | undefined {
  return (typeof window !== "undefined" && (window as unknown as { ApplePaySession?: ApplePaySessionCtor }).ApplePaySession) || undefined;
}

function applePaySessionVersion(S: ApplePaySessionCtor): number {
  for (const v of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]) {
    if (S.supportsVersion(v)) return v;
  }
  return 3;
}

function canUseApplePayJs(S: ApplePaySessionCtor, merchantId: string): boolean {
  try {
    if (S.canMakePaymentsWithActiveCard(merchantId)) return true;
  } catch {
    /* ignore */
  }
  return S.canMakePayments();
}

type ApplePayTokenButtonProps = {
  packageId: number;
  tokens: number;
  merchantId: string;
  disabled?: boolean;
  compact?: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onFinally?: () => void;
};

/**
 * Apple Pay on the Web for Mulligan token packs (Authorize.Net opaqueData).
 * Renders nothing if ApplePaySession is unavailable or cannot pay.
 */
export default function ApplePayTokenButton({
  packageId,
  tokens,
  merchantId,
  disabled,
  compact,
  onSuccess,
  onError,
  onFinally,
}: ApplePayTokenButtonProps) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    const S = getApplePaySession();
    if (!S || !canUseApplePayJs(S, merchantId)) {
      onError("Apple Pay is not available on this device or browser.");
      return;
    }

    setBusy(true);
    try {
      const prep = await api.post<PrepareResponse>("/payments/apple-pay/prepare", { packageId });
      const request: Record<string, unknown> = {
        countryCode: prep.countryCode,
        currencyCode: prep.currencyCode,
        merchantIdentifier: prep.merchantIdentifier,
        supportedNetworks: prep.supportedNetworks,
        merchantCapabilities: prep.merchantCapabilities,
        total: prep.total,
      };

      const session = new S(applePaySessionVersion(S), request);

      session.onvalidatemerchant = async (event) => {
        try {
          const { merchantSession } = await api.post<{ merchantSession: unknown }>(
            "/payments/apple-pay/validate-merchant",
            { validationURL: event.validationURL }
          );
          session.completeMerchantValidation(merchantSession);
        } catch (e) {
          console.warn("[Apple Pay] validate merchant failed", e);
          session.abort();
          onError(e instanceof Error ? e.message : "Could not validate with Apple.");
          setBusy(false);
          onFinally?.();
        }
      };

      session.onpaymentauthorized = async (event) => {
        try {
          const token = event.payment.token as Record<string, unknown>;
          const result = await api.post<{ ok?: boolean; tokens_granted?: number; error?: string }>(
            "/payments/apple-pay/complete",
            { checkoutId: prep.checkoutId, paymentToken: token }
          );
          session.completePayment(S.STATUS_SUCCESS);
          const n = result.tokens_granted ?? 0;
          onSuccess(
            n > 0
              ? `${n} token(s) added to your account.`
              : "Payment recorded. You may already be at the token cap."
          );
        } catch (e) {
          console.warn("[Apple Pay] complete failed", e);
          session.completePayment(S.STATUS_FAILURE);
          onError(e instanceof Error ? e.message : "Payment could not be completed.");
        } finally {
          setBusy(false);
          onFinally?.();
        }
      };

      session.oncancel = () => {
        setBusy(false);
        onFinally?.();
      };

      session.begin();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not start Apple Pay.");
      setBusy(false);
      onFinally?.();
    }
  }, [merchantId, onError, onFinally, onSuccess, packageId]);

  const S = typeof window !== "undefined" ? getApplePaySession() : undefined;
  if (!S || !canUseApplePayJs(S, merchantId)) {
    return null;
  }

  return (
    <button
      type="button"
      className={compact ? "apple-pay-token-btn apple-pay-token-btn--compact" : "apple-pay-token-btn"}
      onClick={() => void run()}
      disabled={disabled || busy}
      aria-label={`Apple Pay — ${tokens} Mulligan token${tokens === 1 ? "" : "s"}`}
    >
      {busy ? "…" : "Pay with Apple Pay"}
    </button>
  );
}
