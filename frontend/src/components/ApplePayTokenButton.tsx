import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** True when Apple Pay JS can run in this browser (Safari on Mac/iOS with Wallet, etc.). */
export function isApplePayJsAvailableForMerchant(merchantId: string): boolean {
  if (typeof window === "undefined") return false;
  const S = getApplePaySession();
  if (!S || !merchantId.trim()) return false;
  return canUseApplePayJs(S, merchantId);
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
  /** Fired synchronously on tap before Apple Pay session opens (e.g. snapshot token balance). */
  onBeforePay?: () => void;
};

/**
 * Apple Pay on the Web — Authorize.Net opaqueData.
 *
 * Safari requires `new ApplePaySession` inside a *direct* user activation, and
 * rejects it if React state updates run first in the same tick (userActivation
 * can be consumed). We therefore:
 * - Prefetch `/apple-pay/prepare` on pointerenter / focus.
 * - Use a **native** `click` listener (capture) on the button so `new` runs from
 *   the DOM event path, not only React’s delegated handler.
 * - Call `session.begin()` before any `setState` from this path.
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
  onBeforePay,
}: ApplePayTokenButtonProps) {
  const [preparing, setPreparing] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [needsSecondTap, setNeedsSecondTap] = useState(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const prepRef = useRef<PrepareResponse | null>(null);
  const prepPackageIdRef = useRef<number | null>(null);
  const prepareInFlightRef = useRef(false);

  const packageIdRef = useRef(packageId);
  const merchantIdRef = useRef(merchantId);
  const disabledRef = useRef(disabled);
  const sessionOpenRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const onBeforePayRef = useRef(onBeforePay);
  const onFinallyRef = useRef(onFinally);

  packageIdRef.current = packageId;
  merchantIdRef.current = merchantId;
  disabledRef.current = disabled;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  onBeforePayRef.current = onBeforePay;
  onFinallyRef.current = onFinally;

  const clearPrepRefsOnly = useCallback(() => {
    prepRef.current = null;
    prepPackageIdRef.current = null;
  }, []);

  const clearPrep = useCallback(() => {
    clearPrepRefsOnly();
    setNeedsSecondTap(false);
  }, [clearPrepRefsOnly]);

  useEffect(() => {
    clearPrep();
    prepareInFlightRef.current = false;
    setPreparing(false);
    setSessionOpen(false);
    sessionOpenRef.current = false;
  }, [packageId, merchantId, clearPrep]);

  const runPrepare = useCallback(
    (fromPointerPrefetch: boolean) => {
      if (prepareInFlightRef.current) return;
      if (prepPackageIdRef.current === packageId && prepRef.current) return;

      prepareInFlightRef.current = true;
      setPreparing(true);
      if (!fromPointerPrefetch) setNeedsSecondTap(false);

      void api
        .post<PrepareResponse>("/payments/apple-pay/prepare", { packageId })
        .then((prep) => {
          prepRef.current = prep;
          prepPackageIdRef.current = packageId;
          if (!fromPointerPrefetch) setNeedsSecondTap(true);
        })
        .catch((e) => {
          clearPrep();
          onError(e instanceof Error ? e.message : "Could not start Apple Pay.");
        })
        .finally(() => {
          prepareInFlightRef.current = false;
          setPreparing(false);
        });
    },
    [packageId, onError, clearPrep]
  );

  /** Must stay synchronous from native click until session.begin(); no setState before begin(). */
  const openApplePaySessionSync = useCallback((prep: PrepareResponse, S: ApplePaySessionCtor) => {
    const request: Record<string, unknown> = {
      countryCode: prep.countryCode,
      currencyCode: prep.currencyCode,
      merchantIdentifier: prep.merchantIdentifier,
      supportedNetworks: prep.supportedNetworks,
      merchantCapabilities: prep.merchantCapabilities,
      total: prep.total,
    };

    clearPrepRefsOnly();

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
        onErrorRef.current(e instanceof Error ? e.message : "Could not validate with Apple.");
        setSessionOpen(false);
        sessionOpenRef.current = false;
        onFinallyRef.current?.();
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
        onSuccessRef.current(
          n > 0
            ? `${n} token(s) added to your account.`
            : "Payment recorded. You may already be at the token cap."
        );
      } catch (e) {
        console.warn("[Apple Pay] complete failed", e);
        session.completePayment(S.STATUS_FAILURE);
        onErrorRef.current(e instanceof Error ? e.message : "Payment could not be completed.");
      } finally {
        setSessionOpen(false);
        sessionOpenRef.current = false;
        onFinallyRef.current?.();
      }
    };

    session.oncancel = () => {
      setSessionOpen(false);
      sessionOpenRef.current = false;
      setNeedsSecondTap(false);
      onFinallyRef.current?.();
    };

    session.begin();

    /* Keep user-activation stack "clean" for WebKit; sync ref for guards immediately. */
    sessionOpenRef.current = true;
    queueMicrotask(() => {
      setSessionOpen(true);
      setNeedsSecondTap(false);
    });
  }, [clearPrepRefsOnly]);

  const runPrepareRef = useRef(runPrepare);
  runPrepareRef.current = runPrepare;

  const openApplePaySessionSyncRef = useRef(openApplePaySessionSync);
  openApplePaySessionSyncRef.current = openApplePaySessionSync;

  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const onNativeClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      if (disabledRef.current || sessionOpenRef.current) return;
      onBeforePayRef.current?.();

      const S = getApplePaySession();
      const mid = merchantIdRef.current;
      if (!S || !canUseApplePayJs(S, mid)) {
        onErrorRef.current("Apple Pay is not available on this device or browser.");
        return;
      }

      const prep = prepRef.current;
      const pkgId = packageIdRef.current;
      const prepOk = prep && prepPackageIdRef.current === pkgId;

      if (prepOk) {
        try {
          openApplePaySessionSyncRef.current(prep, S);
        } catch (e) {
          onErrorRef.current(e instanceof Error ? e.message : "Could not start Apple Pay.");
          setSessionOpen(false);
          sessionOpenRef.current = false;
        }
        return;
      }

      if (prepareInFlightRef.current) return;

      runPrepareRef.current(false);
    };

    el.addEventListener("click", onNativeClick, true);
    return () => el.removeEventListener("click", onNativeClick, true);
  }, [packageId, merchantId]);

  const handlePointerIntent = useCallback(() => {
    if (disabledRef.current || sessionOpenRef.current) return;
    if (prepPackageIdRef.current === packageId && prepRef.current) return;
    runPrepare(true);
  }, [packageId, runPrepare]);

  const S = typeof window !== "undefined" ? getApplePaySession() : undefined;
  if (!S || !canUseApplePayJs(S, merchantId)) {
    return null;
  }

  const label = preparing ? "…" : needsSecondTap ? "Tap again for Apple Pay" : "Pay with Apple Pay";

  return (
    <button
      ref={buttonRef}
      type="button"
      className={compact ? "apple-pay-token-btn apple-pay-token-btn--compact" : "apple-pay-token-btn"}
      onPointerEnter={handlePointerIntent}
      onFocus={handlePointerIntent}
      disabled={disabled || preparing || sessionOpen}
      aria-label={`Apple Pay — ${tokens} Mulligan token${tokens === 1 ? "" : "s"}`}
    >
      {label}
    </button>
  );
}
