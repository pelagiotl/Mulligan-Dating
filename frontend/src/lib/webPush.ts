import { api } from "../utils/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getVapidPublicKey(): string | undefined {
  const k = (import.meta.env as { VITE_VAPID_PUBLIC_KEY?: string }).VITE_VAPID_PUBLIC_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : undefined;
}

export function browserSupportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function waitForServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing?.active) return existing;
  const reg = await navigator.serviceWorker.register("/sw.js?v=20260603", { scope: "/" });
  await navigator.serviceWorker.ready;
  await reg.update();
  return reg;
}

/**
 * Subscribe this browser and POST the subscription to the API.
 * Re-uses an existing PushSubscription when present (iOS often keeps one after permission grant).
 * Call after Notification.permission === 'granted'.
 */
export async function registerWebPush(): Promise<boolean> {
  const vapid = getVapidPublicKey();
  if (!vapid || !browserSupportsWebPush()) return false;
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
    return false;
  }

  const reg = await waitForServiceWorkerRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Invalid PushSubscription from browser");
  }

  await api.post("/auth/web-push-subscription", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    expirationTime: json.expirationTime ?? null,
  });
  return true;
}

/** Re-sync push subscription with backend (iOS PWA subscriptions can go stale). */
export async function syncWebPushSubscription(): Promise<boolean> {
  try {
    return await registerWebPush();
  } catch (e) {
    console.warn("[WebPush] sync failed:", e);
    return false;
  }
}
