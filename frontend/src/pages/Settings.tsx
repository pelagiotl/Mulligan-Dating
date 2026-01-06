import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { useNavigate } from "react-router-dom";

interface SettingsData {
  email: string;
  createdAt: string;
  lastActiveAt: string | null;
}


export default function Settings() {
  const { logout } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchSettings();
  }, []);

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
          <h1 className="page-title">⚙️ Settings</h1>
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
              <label>📧 Email</label>
              <span>{settings?.email}</span>
            </div>
            <div className="info-item">
              <label>🎉 Member Since</label>
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
              <label>🟢 Last Active</label>
              <span>
                {settings?.lastActiveAt
                  ? new Date(settings.lastActiveAt).toLocaleString()
                  : "Just now"}
              </span>
            </div>
          </div>
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
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emailPassword">Current Password</label>
              <input
                type="password"
                id="emailPassword"
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

