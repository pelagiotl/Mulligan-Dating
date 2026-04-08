import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { useNavigate, useSearchParams } from "react-router-dom";
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


export default function Settings() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");


  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);

  // Delete account
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Token purchase (prices + checkout via RevenueCat Web Billing when VITE_REVENUECAT_WEB_API_KEY is set)
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);
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
      const data = await api.get<{ packages: TokenPackage[] }>("/payments/packages");
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
          pricePerToken: "—",
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

    if (!isRevenueCatWebConfigured()) {
      setError(
        "Web purchases need RevenueCat Web Billing. Set VITE_REVENUECAT_WEB_API_KEY in your frontend build (Render) to your Web Billing public API key. See RevenueCat → Web Billing app."
      );
      return;
    }

    const rcPkg = matchRcPackage(revenueCatByProductId.current, pkg.productId);
    if (!rcPkg) {
      setError(
        "This package has no price from RevenueCat. In the RC dashboard, add Web Billing products whose IDs match your mobile product IDs (e.g. mulligan_tokens_7), attach them to the current offering, then refresh."
      );
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

    setPurchasing(pkg.id);
    try {
      const purchases = await getRevenueCatPurchases(user.id);
      await purchases.purchase({
        rcPackage: rcPkg,
        customerEmail: settings?.email ?? undefined,
      });
      setSuccess(`${pkg.tokens} token(s) added! If your balance does not update within a minute, pull to refresh or re-open Settings.`);
      setTimeout(() => setSuccess(""), 8000);
      await fetchPackages();
    } catch (err: unknown) {
      if (isUserCancelledPurchase(err)) return;
      const msg =
        err instanceof Error ? err.message : "Purchase failed. Please try again.";
      setError(msg);
    } finally {
      setPurchasing(null);
    }
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

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New passwords don't match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setChangingPassword(true);
    try {
      await api.post("/settings/change-password", {
        currentPassword,
        newPassword,
      });
      setSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
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
        password: emailPassword,
      });
      setSuccess("Email changed successfully!");
      setNewEmail("");
      setEmailPassword("");
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

    if (!deletePassword) {
      setError("Password required to delete account");
      return;
    }

    setDeleting(true);
    try {
      await api.post("/settings/delete-account", { password: deletePassword });
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
          <p className="page-subtitle">Manage your account preferences and security</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {/* Account Info */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>👤</span> Account Information
          </h2>
          <div className="settings-info">
            <div className="info-item">
              <label data-emoji="📧">📧 Email</label>
              <span>{settings?.email}</span>
            </div>
            <div className="info-item">
              <label data-emoji="🎉">🎉 Member Since</label>
              <span>
                {settings?.createdAt
                  ? new Date(settings.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : "N/A"}
              </span>
            </div>
            <div className="info-item">
              <label data-emoji="🟢">🟢 Last Active</label>
              <span>
                {settings?.lastActiveAt
                  ? new Date(settings.lastActiveAt).toLocaleString()
                  : "Just now"}
              </span>
            </div>
          </div>
        </div>

        {/* Buy Tokens */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>💳</span> Buy Tokens
          </h2>
          <p className="settings-description" style={{ marginBottom: 'var(--space-4)' }}>
            Purchase tokens to connect with more people. Tokens don't expire!
          </p>
          {!isRevenueCatWebConfigured() && (
            <p className="settings-description" style={{ marginBottom: "var(--space-3)", fontSize: "0.9rem" }}>
              To enable checkout on the web, add{" "}
              <code style={{ fontSize: "0.85em" }}>VITE_REVENUECAT_WEB_API_KEY</code> in Render (Web Billing public key)
              and configure Web Billing products in RevenueCat. See <code>frontend/src/lib/revenuecatWeb.ts</code> for a short checklist.
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
                    {pkg.pricePerToken !== "—" ? `${pkg.pricePerToken} per token` : "—"}
                  </div>
                  {(pkg.id === 3 || pkg.id === 4) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-rose-600)', fontWeight: '600', marginBottom: 'var(--space-2)' }}>
                      ⭐ Best Value
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => handlePurchase(pkg)}
                    disabled={
                      purchasing === pkg.id ||
                      pkg.available === false ||
                      pkg.wouldExceedLimit === true ||
                      pkg.priceFormatted === "—" ||
                      pkg.priceFormatted === "Web setup required"
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

        {/* Change Password */}
        <div className="settings-section">
          <h2 className="settings-section-title">
            <span>🔐</span> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="settings-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={changingPassword}
            >
              {changingPassword ? "Changing..." : "Change Password"}
            </button>
          </form>
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
                onChange={(e) => {
                  console.log('Email input onChange:', e.target.value);
                  setNewEmail(e.target.value);
                }}
                onFocus={(e) => console.log('Email input focused')}
                onClick={(e) => console.log('Email input clicked')}
                placeholder="you@example.com"
                required
                autoComplete="email"
                style={{ pointerEvents: 'auto', zIndex: 1, position: 'relative' }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="emailPassword">Current Password</label>
              <input
                type="password"
                id="emailPassword"
                className="form-input"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                required
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
                Are you absolutely sure? Type your password to confirm.
              </p>
              <div className="form-group">
                <label htmlFor="deletePassword">Password</label>
                <input
                  type="password"
                  id="deletePassword"
                  className="form-input"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword("");
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
    </div>
  );
}

