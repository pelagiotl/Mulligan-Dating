/* global self, clients */
// Mulligan Web Push — keep payload shape in sync with backend webPushDelivery JSON body.

const FALLBACK_PATH = "/matches";
const NAV_MSG = "MULLIGAN_NOTIFICATION_NAVIGATE";
const PLAY_MATCH_SOUND = "MULLIGAN_PLAY_MATCH_SOUND";
const PLAY_MESSAGE_SOUND = "MULLIGAN_PLAY_MESSAGE_SOUND";

const MESSAGE_PUSH_TYPES = new Set([
  "new_message",
  "message_liked",
  "message_laughed",
  "message_heart_eyes",
]);

function parseClickUrlFromNotificationData(data) {
  if (data == null) return FALLBACK_PATH;
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === "object" && typeof parsed.url === "string" && parsed.url.trim()) {
        return parsed.url.trim();
      }
    } catch (_) {
      const t = data.trim();
      if (t.startsWith("/") || t.startsWith("http")) return t;
    }
    return FALLBACK_PATH;
  }
  if (typeof data === "object" && typeof data.url === "string" && data.url.trim()) {
    return data.url.trim();
  }
  return FALLBACK_PATH;
}

/** Resolve to an absolute same-origin URL safe for openWindow / navigate / location.assign */
function normalizeOpenUrl(raw, origin) {
  try {
    const abs = raw.startsWith("http") ? new URL(raw) : new URL(raw, origin);
    const root = new URL(origin);
    if (abs.origin !== root.origin) {
      return new URL(FALLBACK_PATH, origin).href;
    }
    let pathname = abs.pathname || "/";
    if (!pathname.startsWith("/")) pathname = "/" + pathname;
    return `${root.origin}${pathname}${abs.search}${abs.hash}`;
  } catch (_) {
    return new URL(FALLBACK_PATH, origin).href;
  }
}

/**
 * Cold-open via root + query so index.html always loads (some iOS / CDN setups mishandle deep paths on cold start).
 * App reads ?pwaOpen= and client-navigates (see App.tsx).
 */
function buildPwaLaunchPageUrl(origin, absoluteTargetHref) {
  try {
    let href = absoluteTargetHref;
    const u = new URL(href);
    if (u.origin !== new URL(origin).origin) {
      href = new URL(FALLBACK_PATH, origin).href;
    }
    const t = new URL(href);
    const pathQsHash = t.pathname + t.search + t.hash;
    if (!pathQsHash.startsWith("/")) {
      return `${origin}/?pwaOpen=${encodeURIComponent(FALLBACK_PATH)}`;
    }
    return `${origin}/?pwaOpen=${encodeURIComponent(pathQsHash)}`;
  } catch (_) {
    return `${origin}/?pwaOpen=${encodeURIComponent(FALLBACK_PATH)}`;
  }
}

function pushTypeFromData(data) {
  if (!data || typeof data !== "object") return "";
  const t = data.type;
  return typeof t === "string" ? t : "";
}

async function notifyOpenClients(payload, openUrl, data) {
  const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const origin = self.location.origin;
  const pushType = pushTypeFromData(data);

  for (const client of clientList) {
    if (typeof client.url !== "string" || !client.url.startsWith(origin)) continue;
    try {
      if (pushType === "new_match") {
        client.postMessage({
          type: PLAY_MATCH_SOUND,
          matchId: typeof data.matchId === "string" ? data.matchId : undefined,
          pushType,
        });
      } else if (MESSAGE_PUSH_TYPES.has(pushType)) {
        client.postMessage({ type: PLAY_MESSAGE_SOUND, pushType });
      }
    } catch (_) {
      /* ignore */
    }
  }
}

self.addEventListener("push", (event) => {
  let payload = {
    title: "Mulligan",
    body: "You have a new notification",
    tag: "mulligan",
    url: "/matches",
    data: {},
  };
  try {
    if (event.data) {
      const j = event.data.json();
      if (j && typeof j === "object") {
        if (j.title) payload.title = String(j.title);
        if (j.body) payload.body = String(j.body);
        if (j.tag) payload.tag = String(j.tag);
        if (j.url) payload.url = String(j.url);
        if (j.data && typeof j.data === "object") payload.data = j.data;
      }
    }
  } catch (_) {
    /* use defaults */
  }

  const openUrl = payload.url || "/matches";
  const data = { url: openUrl, ...payload.data };

  event.waitUntil(
    (async () => {
      await notifyOpenClients(payload, openUrl, data);
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        renotify: true,
        data,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        silent: false,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = parseClickUrlFromNotificationData(event.notification && event.notification.data);
  const targetHref = normalizeOpenUrl(rawUrl, self.location.origin);
  const launchHref = buildPwaLaunchPageUrl(self.location.origin, targetHref);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      const origin = self.location.origin;
      const sameOrigin = clientList.filter((c) => typeof c.url === "string" && c.url.startsWith(origin));

      for (const client of sameOrigin) {
        if ("navigate" in client && typeof client.navigate === "function") {
          try {
            const navigated = await client.navigate(launchHref);
            if (navigated && "focus" in navigated) {
              return navigated.focus();
            }
          } catch (_) {
            /* fall through to postMessage + focus */
          }
        }
      }

      for (const client of sameOrigin) {
        try {
          client.postMessage({ type: NAV_MSG, url: launchHref });
        } catch (_) {
          /* ignore */
        }
      }

      const focusTarget = sameOrigin.find((c) => "focus" in c);
      if (focusTarget) {
        return focusTarget.focus();
      }

      if (clients.openWindow) {
        return clients.openWindow(launchHref);
      }
    })
  );
});
