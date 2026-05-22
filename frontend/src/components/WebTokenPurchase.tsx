import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import ApplePayTokenButton, { isApplePayJsAvailableForMerchant } from "./ApplePayTokenButton";
import type { Package } from "@revenuecat/purchases-js";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import {
  fetchWebPackagesByProductId,
  formatPricePerToken,
  getRevenueCatPurchases,
  isRevenueCatWebConfigured,
  isUserCancelledPurchase,
  matchRcPackage,
} from "../lib/revenuecatWeb";
import { emitTokenBalanceUpdated } from "../lib/tokenBalanceEvents";

export type WebTokenPurchaseVariant = "settings" | "landing";

export type WebTokenPurchaseProps = {
  variant: WebTokenPurchaseVariant;
  /** Used for RevenueCat checkout email when available (e.g. Settings). */
  customerEmail?: string;
};

interface TokenPackage {
  id: number;
  productId?: string;
  tokens: number;
  price: number;
  priceFormatted: string;
  pricePerToken: string;
  available?: boolean;
  wouldExceedLimit?: boolean;
  maxTokensCanBuy?: number;
}

function parseAnetIframeQuery(q: string): Record<string, string> {
  const raw = q.startsWith("#") ? q.slice(1) : q;
  const search = raw.includes("=") && !raw.startsWith("?") ? `?${raw}` : raw.startsWith("?") ? raw : `?${raw}`;
  const sp = new URLSearchParams(search);
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

declare global {
  interface Window {
    AuthorizeNetIFrame?: {
      onReceiveCommunication: (querystr: string) => void;
    };
  }
}

export default function WebTokenPurchase({ variant, customerEmail }: WebTokenPurchaseProps) {
  const { user, refreshProfile } = useAuth();
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [availableTokens, setAvailableTokens] = useState<number | null>(null);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [authorizeNetCheckoutEnabled, setAuthorizeNetCheckoutEnabled] = useState(false);
  const [applePayWebEnabled, setApplePayWebEnabled] = useState(false);
  const [applePayMerchantId, setApplePayMerchantId] = useState<string | null>(null);
  const [anetModalOpen, setAnetModalOpen] = useState(false);
  const [anetFormToken, setAnetFormToken] = useState<string | null>(null);
  const [anetHostedUrl, setAnetHostedUrl] = useState<string | null>(null);
  const anetFormSubmittedRef = useRef(false);
  const revenueCatByProductId = useRef<Record<string, Package>>({});
  const [tokenError, setTokenError] = useState("");
  const [tokenSuccess, setTokenSuccess] = useState("");
  const [expanded, setExpanded] = useState(variant === "settings");

  const fetchPackages = useCallback(async () => {
    if (!user?.id) return;
    setLoadingPackages(true);
    try {
      const data = await api.get<{
        packages: TokenPackage[];
        webCheckoutProvider?: string | null;
        availableTokens?: number;
        applePayWebEnabled?: boolean;
        applePayMerchantId?: string;
      }>("/payments/packages");
      setAuthorizeNetCheckoutEnabled(data.webCheckoutProvider === "authorizenet");
      setApplePayWebEnabled(!!data.applePayWebEnabled);
      setApplePayMerchantId(
        typeof data.applePayMerchantId === "string" && data.applePayMerchantId.trim()
          ? data.applePayMerchantId.trim()
          : null
      );
      if (typeof data.availableTokens === "number") {
        setAvailableTokens(data.availableTokens);
        emitTokenBalanceUpdated(data.availableTokens);
      }
      let list = data.packages || [];
      revenueCatByProductId.current = {};

      if (isRevenueCatWebConfigured() && user?.id) {
        try {
          const map = await fetchWebPackagesByProductId(user.id);
          revenueCatByProductId.current = map;
          list = list.map((pkg) => {
            const productId = pkg.productId;
            const rcPkg = matchRcPackage(map, productId);
            if (rcPkg && productId) {
              return {
                ...pkg,
                priceFormatted: rcPkg.webBillingProduct.price.formattedPrice,
                pricePerToken: formatPricePerToken(rcPkg, pkg.tokens),
              };
            }
            return pkg;
          });
        } catch (rcErr) {
          console.warn("[RevenueCat Web] getOfferings failed:", rcErr);
        }
      }

      list = list.map((pkg) => {
        if (pkg.priceFormatted) return pkg;
        return {
          ...pkg,
          priceFormatted: isRevenueCatWebConfigured() ? "—" : "Web setup required",
          pricePerToken: isRevenueCatWebConfigured() ? "—" : "",
        };
      });

      setPackages(list);
    } catch {
      setPackages([]);
    } finally {
      setLoadingPackages(false);
    }
  }, [user?.id]);

  const handlePurchase = async (pkg: TokenPackage) => {
    setTokenError("");
    setTokenSuccess("");

    if (!user?.id) {
      setTokenError("You must be logged in to purchase tokens.");
      return;
    }

    if (pkg.available === false) {
      setTokenError("You cannot purchase this package right now.");
      return;
    }
    if (pkg.wouldExceedLimit) {
      setTokenError(
        `This would exceed your 7 token cap. You can buy at most ${pkg.maxTokensCanBuy ?? 0} more token(s).`
      );
      return;
    }

    if (isRevenueCatWebConfigured()) {
      const rcPkg = matchRcPackage(revenueCatByProductId.current, pkg.productId);
      if (!rcPkg) {
        setTokenError(
          "This package has no price from RevenueCat. In the RC dashboard, add Web Billing products whose IDs match your mobile product IDs (e.g. mulligan_tokens_7), attach them to the current offering, then refresh."
        );
        return;
      }

      setPurchasing(pkg.id);
      try {
        const purchases = await getRevenueCatPurchases(user.id);
        await purchases.purchase({
          rcPackage: rcPkg,
          customerEmail: customerEmail ?? undefined,
        });
        setTokenSuccess(
          `${pkg.tokens} token(s) added! If your balance does not update within a minute, refresh or reopen this page.`
        );
        setTimeout(() => setTokenSuccess(""), 8000);
        await fetchPackages();
        await refreshProfile();
      } catch (err: unknown) {
        if (isUserCancelledPurchase(err)) return;
        const msg = err instanceof Error ? err.message : "Purchase failed. Please try again.";
        setTokenError(msg);
      } finally {
        setPurchasing(null);
      }
      return;
    }

    if (authorizeNetCheckoutEnabled) {
      setPurchasing(pkg.id);
      try {
        const res = await api.post<{ token: string; hostedPaymentUrl: string }>("/payments/create-checkout", {
          packageId: pkg.id,
        });
        anetFormSubmittedRef.current = false;
        setAnetFormToken(res.token);
        setAnetHostedUrl(res.hostedPaymentUrl);
        setAnetModalOpen(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Could not start checkout.";
        setTokenError(msg);
      } finally {
        setPurchasing(null);
      }
      return;
    }

    setTokenError(
      "Web checkout is not configured. Either set VITE_REVENUECAT_WEB_API_KEY (RevenueCat Web Billing) on the frontend, or set AUTHNET_API_LOGIN + AUTHNET_TRANSACTION_KEY (or AUTHORIZENET_* equivalents) and FRONTEND_URL on the backend for hosted card payments."
    );
  };

  useEffect(() => {
    void fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    if (!anetModalOpen) {
      delete window.AuthorizeNetIFrame;
      return;
    }

    window.AuthorizeNetIFrame = {
      onReceiveCommunication: (querystr: string) => {
        const params = parseAnetIframeQuery(querystr);
        const action = params.action || "";

        if (action === "cancel") {
          setAnetModalOpen(false);
          setAnetFormToken(null);
          setAnetHostedUrl(null);
          anetFormSubmittedRef.current = false;
          setTokenError("Payment was canceled.");
          return;
        }

        if (action === "transactResponse" || action === "transactionResponse") {
          const raw = params.response;
          if (!raw) return;
          void (async () => {
            try {
              const decoded = decodeURIComponent(raw.replace(/\+/g, " "));
              const payload = JSON.parse(decoded) as { transId?: string };
              const transId = payload.transId?.trim();
              if (!transId) {
                setTokenError("Payment response did not include a transaction id.");
                return;
              }
              const result = await api.post<{ ok?: boolean; tokens_granted?: number }>(
                "/payments/confirm-authorizenet",
                { transId }
              );
              setAnetModalOpen(false);
              setAnetFormToken(null);
              setAnetHostedUrl(null);
              anetFormSubmittedRef.current = false;
              const n = result.tokens_granted ?? 0;
              setTokenSuccess(
                n > 0
                  ? `${n} token(s) added to your account.`
                  : "Payment recorded. You may already be at the token cap."
              );
              setTimeout(() => setTokenSuccess(""), 8000);
              await fetchPackages();
              await refreshProfile();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "Could not confirm payment.";
              setTokenError(msg);
            }
          })();
        }
      },
    };

    return () => {
      delete window.AuthorizeNetIFrame;
    };
  }, [anetModalOpen, fetchPackages, refreshProfile]);

  useEffect(() => {
    if (!anetModalOpen || !anetFormToken || !anetHostedUrl) return;
    if (anetFormSubmittedRef.current) return;
    anetFormSubmittedRef.current = true;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = anetHostedUrl;
    form.target = "anetHostedIframe";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "token";
    input.value = anetFormToken;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }, [anetModalOpen, anetFormToken, anetHostedUrl]);

  const checkoutReady = isRevenueCatWebConfigured() || authorizeNetCheckoutEnabled;

  const gridStyle: CSSProperties =
    variant === "landing"
      ? {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.65rem",
        }
      : {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "var(--space-3)",
        };

  const cardStyle = (pkg: TokenPackage): CSSProperties => ({
    border:
      variant === "landing" ? "1px solid rgba(139, 21, 56, 0.12)" : "2px solid var(--border-medium)",
    borderRadius: variant === "landing" ? "12px" : "var(--radius-lg)",
    padding: variant === "landing" ? "0.75rem 0.6rem" : "var(--space-4)",
    textAlign: "center",
    background:
      pkg.id === 3 || pkg.id === 4
        ? variant === "landing"
          ? "rgba(139, 21, 56, 0.04)"
          : "rgba(244, 63, 94, 0.05)"
        : variant === "landing"
          ? "rgba(255,255,255,0.55)"
          : "var(--bg-secondary)",
  });

  const inner = (
    <>
      {tokenError && (
        <div className={variant === "landing" ? "landing-token-chill__msg landing-token-chill__msg--err" : "auth-error"}>
          {tokenError}
        </div>
      )}
      {tokenSuccess && (
        <div
          className={variant === "landing" ? "landing-token-chill__msg landing-token-chill__msg--ok" : "auth-success"}
        >
          {tokenSuccess}
        </div>
      )}

      {variant === "settings" && (
        <>
          <p className="settings-description" style={{ marginBottom: "var(--space-4)" }}>
            Need more tokens? Purchase Mulligan tokens to connect with more people.
          </p>
          {!isRevenueCatWebConfigured() && !authorizeNetCheckoutEnabled && (
            <p className="settings-description" style={{ marginBottom: "var(--space-3)", fontSize: "0.9rem" }}>
              To enable checkout on the web, either add{" "}
              <code style={{ fontSize: "0.85em" }}>VITE_REVENUECAT_WEB_API_KEY</code> (RevenueCat Web Billing public key)
              on the frontend, or set <code style={{ fontSize: "0.85em" }}>AUTHNET_API_LOGIN</code> /{" "}
              <code style={{ fontSize: "0.85em" }}>AUTHNET_TRANSACTION_KEY</code> (or{" "}
              <code style={{ fontSize: "0.85em" }}>AUTHORIZENET_*</code>) plus{" "}
              <code style={{ fontSize: "0.85em" }}>FRONTEND_URL</code> on the backend for hosted card payments (Authorize.Net
              / Payment Cloud). See <code>frontend/src/lib/revenuecatWeb.ts</code> for RevenueCat setup.
            </p>
          )}
          {authorizeNetCheckoutEnabled && !isRevenueCatWebConfigured() && (
            <p className="settings-description" style={{ marginBottom: "var(--space-3)", fontSize: "0.9rem" }}>
              Secure card checkout opens in a frame from your payment provider. After paying, wait for confirmation before
              closing the window.
              {applePayWebEnabled && (
                <>
                  {" "}
                  On iPhone or Mac Safari you can also use <strong>Pay with Apple Pay</strong> when it appears below each
                  package.
                </>
              )}
            </p>
          )}
        </>
      )}

      {variant === "landing" && expanded && authorizeNetCheckoutEnabled && !isRevenueCatWebConfigured() && (
        <p className="landing-token-chill__hint">
          Secure checkout opens in a short window. Don&apos;t close it until you&apos;re done.
        </p>
      )}

      {loadingPackages ? (
        <div
          style={{
            padding: variant === "landing" ? "0.75rem" : "var(--space-4)",
            textAlign: "center",
            fontSize: variant === "landing" ? "0.85rem" : undefined,
            color: "var(--text-secondary)",
          }}
        >
          Loading…
        </div>
      ) : packages.length > 0 ? (
        <div style={gridStyle}>
          {authorizeNetCheckoutEnabled &&
            !applePayWebEnabled &&
            !isRevenueCatWebConfigured() && (
              <div style={{ gridColumn: "1 / -1" }}>
                <p
                  className={variant === "landing" ? undefined : "settings-description"}
                  style={{
                    marginBottom: variant === "landing" ? "0.5rem" : "var(--space-3)",
                    fontSize: variant === "landing" ? "0.75rem" : "0.88rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.4,
                  }}
                >
                  {variant === "settings" ? (
                    <>
                      Card checkout works. <strong>Pay with Apple Pay</strong> is hidden because the payment server does
                      not report Apple Pay on the Web as ready yet (check <code>APPLE_PAY_MERCHANT_ID</code>, identity
                      cert/key, and <code>FRONTEND_URL</code> on the backend, then redeploy).
                    </>
                  ) : (
                    <>Card checkout works. Apple Pay will show here when it is enabled for this site.</>
                  )}
                </p>
              </div>
            )}
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={variant === "settings" ? "web-token-purchase__card" : undefined}
              style={cardStyle(pkg)}
            >
              <div
                className={variant === "settings" ? "web-token-purchase__quantity" : undefined}
                style={{
                  fontSize: variant === "landing" ? "1.05rem" : "1.5rem",
                  fontWeight: "bold",
                  marginBottom: variant === "landing" ? "0.25rem" : "var(--space-2)",
                  ...(variant === "settings" ? { color: "#000" } : {}),
                }}
              >
                {pkg.tokens} {pkg.tokens === 1 ? "Token" : "Tokens"}
              </div>
              <div
                style={{
                  fontSize: variant === "landing" ? "0.95rem" : "1.25rem",
                  fontWeight: 600,
                  color: "var(--color-rose-600)",
                  marginBottom: variant === "landing" ? "0.2rem" : "var(--space-2)",
                }}
              >
                {pkg.priceFormatted}
              </div>
              <div
                className={variant === "settings" ? "web-token-purchase__per-token" : undefined}
                style={{
                  fontSize: variant === "landing" ? "0.72rem" : "0.85rem",
                  color: variant === "settings" ? "#000" : "var(--text-secondary)",
                  marginBottom: variant === "landing" ? "0.45rem" : "var(--space-3)",
                }}
              >
                {pkg.pricePerToken && pkg.pricePerToken !== "—" ? `${pkg.pricePerToken} per token` : "—"}
              </div>
              {(pkg.id === 3 || pkg.id === 4) && variant === "settings" && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-rose-600)",
                    fontWeight: 600,
                    marginBottom: "var(--space-2)",
                  }}
                >
                  ⭐ Best Value
                </div>
              )}
              <button
                className={variant === "landing" ? "btn btn-primary btn-sm" : "btn btn-primary"}
                type="button"
                onClick={() => void handlePurchase(pkg)}
                disabled={
                  purchasing === pkg.id ||
                  pkg.available === false ||
                  pkg.wouldExceedLimit === true ||
                  pkg.priceFormatted === "—" ||
                  pkg.priceFormatted === "Web setup required" ||
                  (!isRevenueCatWebConfigured() && !authorizeNetCheckoutEnabled)
                }
                style={{ width: "100%", marginTop: variant === "landing" ? "0.25rem" : "var(--space-2)" }}
              >
                {purchasing === pkg.id
                  ? variant === "landing"
                    ? "…"
                    : "Processing..."
                  : variant === "landing"
                    ? "Buy"
                    : "Buy Now"}
              </button>
              {authorizeNetCheckoutEnabled &&
                applePayWebEnabled &&
                applePayMerchantId &&
                !isRevenueCatWebConfigured() &&
                pkg.available !== false &&
                !pkg.wouldExceedLimit &&
                pkg.priceFormatted !== "—" &&
                pkg.priceFormatted !== "Web setup required" && (
                  <>
                    <ApplePayTokenButton
                      packageId={pkg.id}
                      tokens={pkg.tokens}
                      merchantId={applePayMerchantId}
                      compact={variant === "landing"}
                      disabled={purchasing === pkg.id}
                      onSuccess={(msg) => {
                        setTokenSuccess(msg);
                        setTimeout(() => setTokenSuccess(""), 8000);
                        void fetchPackages();
                        void refreshProfile();
                      }}
                      onError={(msg) => setTokenError(msg)}
                      onFinally={() => {
                        void fetchPackages();
                        void refreshProfile();
                      }}
                    />
                    {!isApplePayJsAvailableForMerchant(applePayMerchantId) && (
                      <p
                        style={{
                          marginTop: "0.35rem",
                          fontSize: variant === "landing" ? "0.68rem" : "0.8rem",
                          color: "var(--text-secondary)",
                          lineHeight: 1.35,
                        }}
                      >
                        Apple Pay only appears in <strong>Safari</strong> on iPhone or Mac, with a card in Wallet. Chrome
                        and most other browsers do not support Apple Pay on the web.
                      </p>
                    )}
                  </>
                )}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: variant === "landing" ? "0.5rem" : "var(--space-4)",
            color: "var(--text-secondary)",
            textAlign: "center",
            fontSize: variant === "landing" ? "0.8rem" : undefined,
          }}
        >
          {variant === "settings" ? (
            <>
              <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>In-app purchases coming soon</p>
              <p>We&apos;re switching to a new provider. Stay tuned!</p>
            </>
          ) : (
            <p>No packages available right now.</p>
          )}
        </div>
      )}
    </>
  );

  if (variant === "landing") {
    return (
      <>
        <div className="landing-token-chill">
          <button
            type="button"
            className="landing-token-chill__toggle"
            onClick={() => {
              setExpanded((e) => !e);
              setTokenError("");
              setTokenSuccess("");
            }}
            aria-expanded={expanded}
          >
            <span className="landing-token-chill__toggle-label">
              {availableTokens !== null ? (
                <>
                  <span className="landing-token-chill__muted">You have {availableTokens} of 7 tokens.</span>{" "}
                  <span className="landing-token-chill__accent">Top up</span>
                  <span className="landing-token-chill__chevron" aria-hidden>
                    {expanded ? " ▴" : " ▾"}
                  </span>
                </>
              ) : (
                <>
                  <span className="landing-token-chill__muted">Running low on Mulligans?</span>{" "}
                  <span className="landing-token-chill__accent">Top up</span>
                  <span className="landing-token-chill__chevron" aria-hidden>
                    {expanded ? " ▴" : " ▾"}
                  </span>
                </>
              )}
            </span>
          </button>

          {!checkoutReady && !loadingPackages && !expanded && (
            <p className="landing-token-chill__fallback">
              Web checkout isn&apos;t wired yet — you can still buy tokens in{" "}
              <Link to="/settings">Settings</Link>.
            </p>
          )}

          {expanded && (
            <div className="landing-token-chill__panel">
              {!checkoutReady ? (
                <p className="landing-token-chill__fallback landing-token-chill__fallback--inpanel">
                  Web checkout isn&apos;t configured on this server yet. Use{" "}
                  <Link to="/settings">Settings → Tokens</Link> when it is, or the mobile app.
                </p>
              ) : (
                inner
              )}
            </div>
          )}
        </div>

        {anetModalOpen && (
          <div className="anet-hosted-overlay landing-token-chill__overlay">
            <div className="anet-hosted-overlay__dialog">
              <div className="anet-hosted-overlay__head">
                <strong>Secure checkout</strong>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setAnetModalOpen(false);
                    setAnetFormToken(null);
                    setAnetHostedUrl(null);
                    anetFormSubmittedRef.current = false;
                  }}
                >
                  Close
                </button>
              </div>
              <iframe title="Card payment" name="anetHostedIframe" className="anet-hosted-overlay__iframe" />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="web-token-purchase web-token-purchase--settings">{inner}</div>

      {anetModalOpen && (
        <div
          className="anet-hosted-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-3)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              background: "var(--bg-primary, #fff)",
              borderRadius: "var(--radius-lg, 12px)",
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-3)",
                borderBottom: "1px solid var(--border-medium, #e5e7eb)",
              }}
            >
              <strong>Secure checkout</strong>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setAnetModalOpen(false);
                  setAnetFormToken(null);
                  setAnetHostedUrl(null);
                  anetFormSubmittedRef.current = false;
                }}
              >
                Close
              </button>
            </div>
            <iframe
              title="Card payment"
              name="anetHostedIframe"
              style={{
                width: "100%",
                height: "min(720px, 85vh)",
                border: "none",
                display: "block",
                background: "#fff",
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
