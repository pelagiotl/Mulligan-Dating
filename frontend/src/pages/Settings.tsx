import { useState, useEffect, useRef, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useConnectShellTheme } from "../context/ConnectShellThemeContext";
import { connectShellDisplayLabel } from "../lib/connectShellTheme";
import { api } from "../utils/api";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import WebTokenPurchase from "../components/WebTokenPurchase";
import SettingsSectionCard from "../components/SettingsSectionCard";
import UnblockConfirmModal from "../components/UnblockConfirmModal";
import NotificationPreferencesPanel from "../components/NotificationPreferencesPanel";
import {
  browserSupportsWebPush,
  getVapidPublicKey,
  registerWebPush,
  syncWebPushSubscription,
} from "../lib/webPush";

interface SettingsData {
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  showActiveStatus?: boolean;
  requiresPasswordForEmailChange?: boolean;
}

interface BlockedUser {
  id: string;
  displayName: string | null;
  email: string;
  phoneDisplay: string | null;
  phoneNational10: string | null;
  blockedAt: string;
}

interface BlockedPhone {
  id: string;
  phoneNational10: string;
  phoneDisplay: string;
  blockedAt: string;
}

type UnblockPending =
  | { variant: "user"; user: BlockedUser; label: string }
  | { variant: "phone"; entry: BlockedPhone; label: string };

export default function Settings() {
  const { logout, profile, refreshProfile, user, refreshSession, updateUserEmail } = useAuth();
  const { mode: connectShellMode, toggleMode: toggleConnectShellMode } = useConnectShellTheme();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [emailPassword, setEmailPassword] = useState("");
  const [emailNeedsPassword, setEmailNeedsPassword] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  /** Shown in the read-only Email row above Change email — not cleared by background refetches. */
  const [accountEmail, setAccountEmail] = useState("");
  const settingsFetchGen = useRef(0);

  // Delete account
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [webPushBusy, setWebPushBusy] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedPhoneNumbers, setBlockedPhoneNumbers] = useState<BlockedPhone[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blockPhoneInput, setBlockPhoneInput] = useState("");
  const [blockingPhone, setBlockingPhone] = useState(false);
  const [unblockingKey, setUnblockingKey] = useState<string | null>(null);
  const [unblockPending, setUnblockPending] = useState<UnblockPending | null>(null);

  const fetchBlockList = async () => {
    try {
      const data = await api.get<{
        blockedUsers: BlockedUser[];
        blockedPhoneNumbers: BlockedPhone[];
      }>("/blocks");
      setBlockedUsers(data?.blockedUsers ?? []);
      setBlockedPhoneNumbers(data?.blockedPhoneNumbers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load block list");
    } finally {
      setBlocksLoading(false);
    }
  };

  const fetchSettings = async (opts?: { silent?: boolean }) => {
    const gen = ++settingsFetchGen.current;
    try {
      if (!opts?.silent) setLoading(true);
      const data = await api.get<SettingsData>(`/settings?_=${Date.now()}`);
      if (gen !== settingsFetchGen.current) return;
      const loadedEmail = data.email?.trim() || "";
      setSettings((prev) => ({
        ...data,
        email: loadedEmail || prev?.email?.trim() || null,
      }));
      if (loadedEmail) {
        setAccountEmail(loadedEmail);
        setNewEmail(loadedEmail);
      }
      if (data.requiresPasswordForEmailChange) {
        setEmailNeedsPassword(true);
      }
    } catch (err) {
      if (gen !== settingsFetchGen.current) return;
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      if (!opts?.silent && gen === settingsFetchGen.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (loading) return;
    if (location.hash === "#tokens") {
      requestAnimationFrame(() => {
        document.getElementById("tokens")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [loading, location.hash]);

  useEffect(() => {
    fetchSettings();
    void fetchBlockList();
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
    if (!profile) {
      setDisplayNameDraft("");
      return;
    }
    setDisplayNameDraft((profile.displayName ?? "").trim());
  }, [profile]);

  useEffect(() => {
    if (!user?.webPushConfigured || !getVapidPublicKey() || !browserSupportsWebPush()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if ((user.webPushSubscriptionCount ?? 0) > 0) return;
    void syncWebPushSubscription().then((ok) => {
      if (ok) void refreshSession({ silent: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.webPushConfigured, user?.webPushSubscriptionCount]);

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

  const handleBlockPhone = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const trimmed = blockPhoneInput.trim();
    if (!trimmed) {
      setError("Enter a phone number to block.");
      return;
    }
    setBlockingPhone(true);
    try {
      const result = await api.post<{ message: string }>("/blocks/by-phone", {
        phoneNumber: trimmed,
      });
      setSuccess(result.message || "Number blocked.");
      setBlockPhoneInput("");
      await fetchBlockList();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to block phone number");
    } finally {
      setBlockingPhone(false);
    }
  };

  const handleUnblockUser = (user: BlockedUser) => {
    const label = user.displayName || user.phoneDisplay || user.email || "this person";
    setUnblockPending({ variant: "user", user, label });
  };

  const handleUnblockPhone = (entry: BlockedPhone) => {
    setUnblockPending({ variant: "phone", entry, label: entry.phoneDisplay });
  };

  const confirmUnblock = async () => {
    if (!unblockPending || unblockingKey) return;
    setError("");
    try {
      if (unblockPending.variant === "user") {
        const { user } = unblockPending;
        setUnblockingKey(user.id);
        if (user.phoneNational10) {
          await api.delete(`/blocks/by-phone/${encodeURIComponent(user.phoneNational10)}`);
        } else {
          await api.delete(`/blocks/${user.id}`);
        }
        setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
        setBlockedPhoneNumbers((prev) =>
          prev.filter((p) => p.phoneNational10 !== user.phoneNational10)
        );
        setSuccess("Unblocked.");
      } else {
        const { entry } = unblockPending;
        setUnblockingKey(entry.id);
        await api.delete(`/blocks/by-phone/${encodeURIComponent(entry.phoneNational10)}`);
        setBlockedPhoneNumbers((prev) => prev.filter((p) => p.id !== entry.id));
        setSuccess("Number unblocked.");
      }
      setUnblockPending(null);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unblock");
    } finally {
      setUnblockingKey(null);
    }
  };

  const handleChangeEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required");
      return;
    }

    setChangingEmail(true);
    try {
      const mustSendPassword =
        settings?.requiresPasswordForEmailChange || emailNeedsPassword;
      const res = await api.put<{ message?: string; email?: string }>("/settings/email", {
        email: normalizedEmail,
        ...(mustSendPassword && emailPassword.trim() ? { password: emailPassword } : {}),
      });
      const savedEmail = (res?.email ?? normalizedEmail).trim();
      setAccountEmail(savedEmail);
      updateUserEmail(savedEmail);
      setSettings((prev) =>
        prev
          ? { ...prev, email: savedEmail }
          : { email: savedEmail, createdAt: "", lastActiveAt: null, showActiveStatus: true },
      );
      setSuccess("Email changed successfully!");
      setNewEmail(savedEmail);
      setEmailNeedsPassword(false);
      setEmailPassword("");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change email";
      if (msg.toLowerCase().includes("password required")) {
        setEmailNeedsPassword(true);
        setError("Enter your account password below to change your email.");
      } else {
        setError(msg);
      }
    } finally {
      setChangingEmail(false);
    }
  };

  const handleEnableBrowserPush = async () => {
    setError("");
    setSuccess("");
    if (!browserSupportsWebPush()) {
      setError("This browser does not support push notifications.");
      return;
    }
    setWebPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked. Turn them on in your browser or site settings for this page."
            : "Notifications were not enabled."
        );
        return;
      }
      await registerWebPush();
      await refreshSession();
      setSuccess("Browser notifications enabled on this device.");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not enable browser notifications."
      );
    } finally {
      setWebPushBusy(false);
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

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
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

        {/* Browser push (web / PWA) — high on the page so users see it; permission must be requested from a tap (especially iOS). */}
        <SettingsSectionCard variant="notifications" delay={0}>
          <h2 className="settings-section-title">
            <span>🔔</span> Browser notifications
          </h2>
          {!browserSupportsWebPush() ? (
            <p className="settings-hint">
              Your browser does not support Web Push. Use a recent version of Chrome, Safari (16.4+), Edge, or Firefox,
              or add the app to your home screen on iPhone for PWA notifications.
            </p>
          ) : !user?.webPushConfigured ? (
            <p className="settings-hint">
              This server has not configured Web Push yet (VAPID keys). Native app notifications may still work.
            </p>
          ) : !getVapidPublicKey() ? (
            <p className="settings-hint">
              This site build is missing <code>VITE_VAPID_PUBLIC_KEY</code> (must match the server&apos;s public key).
            </p>
          ) : (
            <>
              <p className="settings-hint">
                Get notified about new messages and matches when Mulligan is in the background. On iPhone, add Mulligan
                to your Home Screen first, then enable notifications here.
              </p>
              {Notification.permission === "granted" &&
              (user.webPushSubscriptionCount ?? 0) > 0 ? (
                <p className="auth-success" style={{ marginTop: "var(--space-2)" }}>
                  You&apos;re subscribed on this device.
                </p>
              ) : Notification.permission === "denied" ? (
                <p className="settings-hint" style={{ marginTop: "var(--space-2)" }}>
                  Notifications are blocked for this site. Open browser settings and allow notifications for this page,
                  then try again.
                </p>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: "var(--space-3)" }}
                  onClick={() => void handleEnableBrowserPush()}
                  disabled={webPushBusy}
                >
                  {webPushBusy
                    ? "Working…"
                    : Notification.permission === "granted"
                      ? "Register this device"
                      : "Turn on browser notifications"}
                </button>
              )}
            </>
          )}
          <NotificationPreferencesPanel />
        </SettingsSectionCard>

        <SettingsSectionCard variant="appearance" delay={140}>
          <h2 className="settings-section-title">
            <span>🎨</span> Connect tab appearance
          </h2>
          <div className="settings-active-toggle-row">
            <div>
              <strong>Hero card &amp; chrome</strong>
              <p className="settings-hint">
                Cycle through Midnight (dark graphite), Sunny (warm sunrise), and Soft (pastel purple) Connect chrome.
                The Mulligan tokens strip, tab bar, and launch countdown follow this choice. Saved on this device only.
              </p>
            </div>
            <button
              type="button"
              className={`settings-toggle-btn settings-shell-toggle--${connectShellMode}`}
              onClick={toggleConnectShellMode}
            >
              {connectShellDisplayLabel(connectShellMode)}
            </button>
          </div>
        </SettingsSectionCard>

        {/* Account — layout aligned with mobile Settings (stats + profile shortcuts) */}
        <SettingsSectionCard variant="account" delay={280}>
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
              <span id="settings-account-email">{accountEmail || "—"}</span>
            </div>
          </div>

          <div className="settings-subsection">
            <h3 className="settings-inline-section-title">
              <span aria-hidden>📬</span> Change email
            </h3>
            <form onSubmit={handleChangeEmail} className="settings-form">
              <div className="form-group">
                <label htmlFor="newEmail">New email</label>
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
              {emailNeedsPassword && (
                <div className="form-group">
                  <label htmlFor="emailPassword">Password</label>
                  <input
                    type="password"
                    id="emailPassword"
                    className="form-input"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Your account password"
                    required
                    autoComplete="current-password"
                  />
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={changingEmail}>
                {changingEmail ? "Changing…" : "Change email"}
              </button>
            </form>
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
        </SettingsSectionCard>

        <SettingsSectionCard variant="blocks" delay={420}>
          <h2 className="settings-section-title">
            <span>🚫</span> Block list
          </h2>
          <p className="settings-hint">
            Add phone numbers of people you do not want to match with. They will not appear in browse and
            you cannot Connect with them. Works even if they have not signed up yet.
          </p>
          <form onSubmit={(e) => void handleBlockPhone(e)} className="settings-form">
            <div className="form-group">
              <label htmlFor="blockPhone">Phone number</label>
              <input
                id="blockPhone"
                type="tel"
                className="form-input"
                value={blockPhoneInput}
                onChange={(e) => setBlockPhoneInput(e.target.value)}
                placeholder="e.g. 541-555-1234"
                autoComplete="tel"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={blockingPhone}>
              {blockingPhone ? "Blocking…" : "Block number"}
            </button>
          </form>
          {blocksLoading ? (
            <p className="settings-hint" style={{ marginTop: "var(--space-3)" }}>
              Loading block list…
            </p>
          ) : blockedUsers.length === 0 && blockedPhoneNumbers.length === 0 ? (
            <p className="settings-hint" style={{ marginTop: "var(--space-3)" }}>
              No blocked numbers yet.
            </p>
          ) : (
            <ul className="settings-block-list" style={{ marginTop: "var(--space-4)" }}>
              {blockedUsers.map((user) => (
                <li key={`user-${user.id}`} className="settings-block-list-item">
                  <div>
                    <strong>{user.displayName || user.phoneDisplay || user.email}</strong>
                    {user.phoneDisplay && user.displayName ? (
                      <span className="settings-hint" style={{ display: "block" }}>
                        {user.phoneDisplay}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={unblockingKey === user.id}
                    onClick={() => handleUnblockUser(user)}
                  >
                    {unblockingKey === user.id ? "…" : "Unblock"}
                  </button>
                </li>
              ))}
              {blockedPhoneNumbers.map((entry) => (
                <li key={`phone-${entry.id}`} className="settings-block-list-item">
                  <div>
                    <strong>{entry.phoneDisplay}</strong>
                    <span className="settings-hint" style={{ display: "block" }}>
                      Not on Mulligan yet
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={unblockingKey === entry.id}
                    onClick={() => handleUnblockPhone(entry)}
                  >
                    {unblockingKey === entry.id ? "…" : "Unblock"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SettingsSectionCard>

        {/* Tokens — shared with landing page (WebTokenPurchase) */}
        <SettingsSectionCard id="tokens" variant="tokens" delay={560}>
          <h2 className="settings-section-title">
            <span>💳</span> Tokens
          </h2>
          <WebTokenPurchase variant="settings" customerEmail={accountEmail || undefined} />
        </SettingsSectionCard>

        <SettingsSectionCard variant="session" delay={700}>
          <h2 className="settings-section-title">
            <span>🚪</span> Session
          </h2>
          <p className="settings-hint">
            Log out of this browser and return to the phone number login screen.
          </p>
          <button
            type="button"
            className="btn btn-secondary settings-logout-btn"
            onClick={handleLogout}
          >
            Log out
          </button>
        </SettingsSectionCard>

        {/* Delete Account */}
        <SettingsSectionCard variant="danger" delay={840}>
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
        </SettingsSectionCard>
      </div>

      <UnblockConfirmModal
        isOpen={unblockPending != null}
        label={unblockPending?.label ?? ""}
        variant={unblockPending?.variant ?? "user"}
        confirming={unblockingKey != null}
        onCancel={() => {
          if (!unblockingKey) setUnblockPending(null);
        }}
        onConfirm={() => void confirmUnblock()}
      />
    </div>
  );
}

