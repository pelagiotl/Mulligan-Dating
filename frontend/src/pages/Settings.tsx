import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { useNavigate, useSearchParams } from "react-router-dom";

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
}

interface TokenPackage {
  id: number;
  tokens: number;
  price: number;
  priceFormatted: string;
  pricePerToken: string;
}


export default function Settings() {
  const { logout } = useAuth();
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

  // Token purchase
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [purchasing, setPurchasing] = useState<number | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchPackages();
    
    // Check for payment success/cancel in URL
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      setSuccess("Payment successful! Your tokens have been added.");
      setSearchParams({}); // Clear URL params
    } else if (paymentStatus === "canceled") {
      setError("Payment was canceled.");
      setSearchParams({}); // Clear URL params
    }
  }, [searchParams, setSearchParams]);

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

  const fetchPackages = async () => {
    setLoadingPackages(true);
    try {
      const data = await api.get<{ packages: TokenPackage[] }>("/payments/packages");
      setPackages(data.packages);
    } catch (err) {
      console.error("Failed to load token packages:", err);
    } finally {
      setLoadingPackages(false);
    }
  };

  const handlePurchase = async (packageId: number) => {
    setPurchasing(packageId);
    setError("");
    setSuccess("");
    
    try {
      const data = await api.post<{ url: string }>("/payments/create-checkout", { packageId });
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Failed to initiate payment. Please try again.");
        setPurchasing(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate payment");
      setPurchasing(null);
    }
  };


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
    <div className="settings-page">
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
                    background: pkg.id === 3 || pkg.id === 10 ? 'rgba(244, 63, 94, 0.05)' : 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
                    {pkg.tokens} {pkg.tokens === 1 ? 'Token' : 'Tokens'}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--color-rose-600)', marginBottom: 'var(--space-2)' }}>
                    {pkg.priceFormatted}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                    ${pkg.pricePerToken} per token
                  </div>
                  {(pkg.id === 3 || pkg.id === 10) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-rose-600)', fontWeight: '600', marginBottom: 'var(--space-2)' }}>
                      ⭐ Best Value
                    </div>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={() => handlePurchase(pkg.id)}
                    disabled={purchasing === pkg.id}
                    style={{ width: '100%', marginTop: 'var(--space-2)' }}
                  >
                    {purchasing === pkg.id ? "Processing..." : "Buy Now"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
              Failed to load token packages. Please try again later.
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
                matches, and messages. This cannot be undone.
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

