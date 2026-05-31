import { useCallback, useEffect, useState } from "react";
import { api } from "../utils/api";

export default function NotificationPreferencesPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushNotifyMatches, setPushNotifyMatches] = useState(true);
  const [pushNotifyMessages, setPushNotifyMessages] = useState(true);
  const [error, setError] = useState("");
  const [savedFeedback, setSavedFeedback] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      setError("");
      const data = await api.get<{ pushNotifyMatches: boolean; pushNotifyMessages: boolean }>(
        "/settings/notification-preferences",
        false
      );
      setPushNotifyMatches(data?.pushNotifyMatches ?? true);
      setPushNotifyMessages(data?.pushNotifyMessages ?? true);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : "";
      if (status === 404 || /route not found|not found/i.test(msg)) {
        setError("This feature requires a backend update. Deploy the backend and try again.");
      } else {
        setError(msg || "Failed to load notification preferences");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const savePrefs = useCallback(async (matches: boolean, messages: boolean) => {
    try {
      setSaving(true);
      setError("");
      setSavedFeedback(false);
      await api.put("/settings/notification-preferences", {
        pushNotifyMatches: matches,
        pushNotifyMessages: messages,
      });
      setSavedFeedback(true);
      window.setTimeout(() => setSavedFeedback(false), 2000);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : "";
      if (status === 404 || /route not found|not found/i.test(msg)) {
        setError("Backend not updated. Deploy the backend to save preferences.");
      } else {
        setError(msg || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const handleMatchesToggle = () => {
    const next = !pushNotifyMatches;
    setPushNotifyMatches(next);
    void savePrefs(next, pushNotifyMessages);
  };

  const handleMessagesToggle = () => {
    const next = !pushNotifyMessages;
    setPushNotifyMessages(next);
    void savePrefs(pushNotifyMatches, next);
  };

  if (loading) {
    return (
      <div className="settings-notification-prefs">
        <p className="settings-hint">Loading notification preferences…</p>
      </div>
    );
  }

  return (
    <div className="settings-notification-prefs">
      <h3 className="settings-inline-section-title">Choose when to get notified</h3>
      <p className="settings-hint">
        Applies to browser and app notifications when Mulligan is in the background.
      </p>
      {error ? (
        <p className="auth-error" style={{ marginTop: "var(--space-2)" }}>
          {error}
        </p>
      ) : null}
      {savedFeedback ? (
        <p className="auth-success settings-notification-prefs-saved">
          Saved — applies to outside-app notifications immediately
        </p>
      ) : null}
      <div className="settings-notification-prefs-card" aria-busy={saving}>
        <div className="settings-notification-pref-row">
          <div className="settings-notification-pref-copy">
            <strong>New matches</strong>
            <p className="settings-hint">When someone likes you back</p>
          </div>
          <button
            type="button"
            className={`settings-toggle-btn ${pushNotifyMatches ? "is-on" : "is-off"}`}
            onClick={handleMatchesToggle}
            disabled={saving}
            aria-pressed={pushNotifyMatches}
          >
            {saving ? "…" : pushNotifyMatches ? "On" : "Off"}
          </button>
        </div>
        <div className="settings-notification-pref-divider" role="presentation" />
        <div className="settings-notification-pref-row">
          <div className="settings-notification-pref-copy">
            <strong>New messages</strong>
            <p className="settings-hint">When you receive a chat message</p>
          </div>
          <button
            type="button"
            className={`settings-toggle-btn ${pushNotifyMessages ? "is-on" : "is-off"}`}
            onClick={handleMessagesToggle}
            disabled={saving}
            aria-pressed={pushNotifyMessages}
          >
            {saving ? "…" : pushNotifyMessages ? "On" : "Off"}
          </button>
        </div>
      </div>
    </div>
  );
}
