import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Package } from "@revenuecat/purchases-js";
import {
  fetchWebPackagesByProductId,
  formatPricePerToken,
  getRevenueCatPurchases,
  isRevenueCatWebConfigured,
  isUserCancelledPurchase,
  matchRcPackage,
} from "../lib/revenuecatWeb";

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
}

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

export default function Settings() {
  const { logout, user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [activeStatusSaving, setActiveStatusSaving] = useState(false);

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);

  // Delete account
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Token purchase: RevenueCat Web when VITE_REVENUECAT_WEB_API_KEY is set; else Authorize.Net Accept Hosted when backend has gateway credentials
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [authorizeNetCheckoutEnabled, setAuthorizeNetCheckoutEnabled] = useState(false);
  const [anetModalOpen, setAnetModalOpen] = useState(false);
  const [anetFormToken, setAnetFormToken] = useState<string | null>(null);
  const [anetHostedUrl, setAnetHostedUrl] = useState<string | null>(null);
  const anetFormSubmittedRef = useRef(false);
  const revenueCatByProductId = useRef<Record<string, Package>>({});

  const fetchSettings = async () => {
    try {
      const data = await api.get<SettingsData>("/settings");
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = useCallback(async () => {
    setLoadingPackages(true);
    try {
      const data = await api.get<{
        packages: TokenPackage[];
        webCheckoutProvider?: string | null;
      }>("/payments/packages");
      setAuthorizeNetCheckoutEnabled(data.webCheckoutProvider === "authorizenet");
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
    } catch (err) {
      setPackages([]);
    } finally {
      setLoadingPackages(false);
    }
  }, [user?.id]);

  const handlePurchase = async (pkg: TokenPackage) => {
    setError("");
    setSuccess("");

    if (!user?.id) {
      setError("You must be logged in to purchase tokens.");
      return;
    }

    if (pkg.available === false) {
      setError("You cannot purchase this package right now.");
      return;
    }
    if (pkg.wouldExceedLimit) {
      setError(
        `This would exceed your 7 token cap. You can buy at most ${pkg.maxTokensCanBuy ?? 0} more token(s).`
      );
      return;
    }

    if (isRevenueCatWebConfigured()) {
      const rcPkg = matchRcPackage(revenueCatByProductId.current, pkg.productId);
      if (!rcPkg) {
        setError(
          "This package has no price from RevenueCat. In the RC dashboard, add Web Billing products whose IDs match your mobile product IDs (e.g. mulligan_tokens_7), attach them to the current offering, then refresh."
        );
        return;
      }

      setPurchasing(pkg.id);
      try {
        const purchases = await getRevenueCatPurchases(user.id);
        await purchases.purchase({
          rcPackage: rcPkg,
          customerEmail: settings?.email ?? undefined,
        });
        setSuccess(
          `${pkg.tokens} token(s) added! If your balance does not update within a minute, pull to refresh or re-open Settings.`
        );
        setTimeout(() => setSuccess(""), 8000);
        await fetchPackages();
        await refreshProfile();
      } catch (err: unknown) {
        if (isUserCancelledPurchase(err)) return;
        const msg = err instanceof Error ? err.message : "Purchase failed. Please try again.";
        setError(msg);
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
        setError(msg);
      } finally {
        setPurchasing(null);
      }
      return;
    }

    setError(
      "Web checkout is not configured. Either set VITE_REVENUECAT_WEB_API_KEY (RevenueCat Web Billing) on the frontend, or set AUTHNET_API_LOGIN + AUTHNET_TRANSACTION_KEY (or AUTHORIZENET_* equivalents) and FRONTEND_URL on the backend for hosted card payments."
    );
  };

  useEffect(() => {
    fetchSettings();
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      setSuccess("Payment successful! Your tokens have been added.");
      setSearchParams({});
    } else if (paymentStatus === "canceled") {
      setError("Payment was canceled.");
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchPackages();
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
          setError("Payment was canceled.");
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
                setError("Payment response did not include a transaction id.");
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
              setSuccess(
                n > 0
                  ? `${n} token(s) added to your account.`
                  : "Payment recorded. You may already be at the token cap."
              );
              setTimeout(() => setSuccess(""), 8000);
              await fetchPackages();
              await refreshProfile();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : "Could not confirm payment.";
              setError(msg);
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

  useEffect(() => {
    if (!profile) {
      setDisplayNameDraft("");
      return;
    }
    setDisplayNameDraft((profile.displayName ?? "").trim());
  }, [profile]);

  const saveDisplayName = async () => {
    setError("");
    setSuccess("");
    const name = displayNameDraft.trim();
    if (name.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setDisplayNameSaving(true);
    try {
      await api.put("/profile/basics", { displayName: name });
      setSuccess("Display name saved.");
      setTimeout(() => setSuccess(""), 4000);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save name");
    } finally {
      setDisplayNameSaving(false);
    }
  };

  const toggleActiveStatusSetting = async () => {
    if (!settings || activeStatusSaving) return;
    const next = !(settings.showActiveStatus !== false);
    setActiveStatusSaving(true);
    setError("");
    try {
      await api.put("/settings/active-status", { showActiveStatus: next });
      setSettings((prev) => (prev ? { ...prev, showActiveStatus: next } : null));
      setSuccess(next ? "Matches can see your last active time." : "Last active hidden from matches.");
      setTimeout(() => setSuccess(""), 5000);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setActiveStatusSaving(false);
    }
  };

  const handleChangeEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    setChangingEmail(true);
    try {
      await api.put("/settings/email", {
        email: newEmail,
      });
      setSuccess("Email changed successfully!");
      setNewEmail("");
      await fetchSettings(); // Refresh settings
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change email");
    } finally {
      setChangingEmail(false);
    }
  };

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setError("Type DELETE to confirm permanent account deletion.");
      return;
    }

    setDeleting(true);
    try {
      await api.post("/settings/delete-account", {});
      logout();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading settings...</div>;
  }

  return (
    <div className="settings-page native-app-screen">
      <div className="settings-container">
        <div className="settings-header">
          <h1 className="page-title"><span>⚙️</span> Settings</h1>
          <p className="page-subtitle">Manage your account preferences</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {/* Account — layout aligned with mobile Settings (stats + profile shortcuts) */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>👤</span> Account
          </h2>
          {settings && (
            <div className="settings-stats-row">
              <div className="settings-stat-card settings-stat-card--member">
                <span className="settings-stat-emoji">🎉</span>
                <span className="settings-stat-label">Member Since</span>
                <span className="settings-stat-value">
                  {settings.createdAt
                    ? new Date(settings.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              <div className="settings-stat-card settings-stat-card--active">
                <span className="settings-stat-emoji">🟢</span>
                <span className="settings-stat-label">Last Active</span>
                <span className="settings-stat-value">
                  {settings.lastActiveAt
                    ? new Date(settings.lastActiveAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "Just now"}
                </span>
              </div>
            </div>
          )}

          <div className="settings-active-toggle-row">
            <div>
              <strong>Show last active to matches</strong>
              <p className="settings-hint">
                When off, others won&apos;t see your last active time in Matches (same as Profile tab toggle).
              </p>
            </div>
            <button
              type="button"
              className={`settings-toggle-btn ${settings?.showActiveStatus !== false ? "is-on" : "is-off"}`}
              onClick={() => void toggleActiveStatusSetting()}
              disabled={!settings || activeStatusSaving}
            >
              {activeStatusSaving ? "…" : settings?.showActiveStatus !== false ? "On" : "Off"}
            </button>
          </div>

          <div className="settings-info" style={{ marginTop: "var(--space-4)" }}>
            <div className="info-item">
              <label data-emoji="📧">📧 Email</label>
              <span>{settings?.email || "—"}</span>
            </div>
          </div>

          <div className="settings-subsection">
            <label className="settings-field-label" htmlFor="displayNameSettings">
              Display name
            </label>
            <p className="settings-hint">
              Shown to people you connect with. Edit location, distance, and who you want to meet on the{" "}
              <Link to="/profile">Profile</Link> tab.
            </p>
            <input
              id="displayNameSettings"
              className="form-input"
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              maxLength={50}
              placeholder="Your first name or nickname"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginTop: "var(--space-2)" }}
              onClick={() => void saveDisplayName()}
              disabled={displayNameSaving}
            >
              {displayNameSaving ? "Saving…" : "Save name"}
            </button>
          </div>

          <div className="settings-quick-links">
            <Link className="settings-quick-link" to="/profile">
              <span>📍</span> Location, bio &amp; preferences
            </Link>
            <Link className="settings-quick-link" to="/profile#my-photos">
              <span>📷</span> Photos (need 3 to Connect)
            </Link>
          </div>
        </div>

        {/* Tokens — same flow as mobile; web lists packages inline when RC key is set */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>💳</span> Tokens
          </h2>
          <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
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
              Secure card checkout opens in a frame from your payment provider. After paying, wait for confirmation
              before closing the window.
            </p>
          )}

          {loadingPackages ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>Loading packages...</div>
          ) : packages.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  style={{
                    border: '2px solid var(--border-medium)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)',
                    textAlign: 'center',
                    background: pkg.id === 3 || pkg.id === 4 ? 'rgba(244, 63, 94, 0.05)' : 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
                    {pkg.tokens} {pkg.tokens === 1 ? 'Token' : 'Tokens'}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--color-rose-600)', marginBottom: 'var(--space-2)' }}>
                    {pkg.priceFormatted}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                    {pkg.pricePerToken && pkg.pricePerToken !== "—"
                      ? `${pkg.pricePerToken} per token`
                      : "—"}
                  </div>
                  {(pkg.id === 3 || pkg.id === 4) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-rose-600)', fontWeight: '600', marginBottom: 'var(--space-2)' }}>
                      ⭐ Best Value
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void handlePurchase(pkg)}
                    disabled={
                      purchasing === pkg.id ||
                      pkg.available === false ||
                      pkg.wouldExceedLimit === true ||
                      pkg.priceFormatted === "—" ||
                      pkg.priceFormatted === "Web setup required" ||
                      (!isRevenueCatWebConfigured() &&
                        !authorizeNetCheckoutEnabled)
                    }
                    style={{ width: '100%', marginTop: 'var(--space-2)' }}
                  >
                    {purchasing === pkg.id ? "Processing..." : "Buy Now"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>In-app purchases coming soon</p>
              <p>We're switching to a new provider. Stay tuned!</p>
            </div>
          )}
        </div>

        {/* Change Email */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>📬</span> Change Email
          </h2>
          <form onSubmit={handleChangeEmail} className="settings-form">
            <div className="form-group">
              <label htmlFor="newEmail">New Email</label>
              <input
                type="email"
                id="newEmail"
                className="form-input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={changingEmail}
            >
              {changingEmail ? "Changing..." : "Change Email"}
            </button>
          </form>
        </div>

        {/* Delete Account */}
        <div className="settings-section danger-zone">
          <h2 className="settings-section-title">
            <span>⚠️</span> Danger Zone
          </h2>
          {!showDeleteConfirm ? (
            <div>
              <p className="danger-warning">
                Deleting your account will permanently remove all your data,
                chats, and messages. This cannot be undone.
              </p>
              <button
                className="btn btn-danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </button>
            </div>
          ) : (
            <form onSubmit={handleDeleteAccount} className="settings-form">
              <p className="danger-warning">
                This cannot be undone. Type <strong>DELETE</strong> below to confirm.
              </p>
              <div className="form-group">
                <label htmlFor="deleteConfirmText">Confirmation</label>
                <input
                  type="text"
                  id="deleteConfirmText"
                  className="form-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Yes, Delete My Account"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

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
    </div>
  );
}

