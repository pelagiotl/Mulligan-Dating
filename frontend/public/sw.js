/* global self, clients */
// Mulligan Web Push — keep payload shape in sync with backend webPushDelivery JSON body.

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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || "/matches";
  const path = url.startsWith("http") ? url : new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const c = clientList[i];
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
