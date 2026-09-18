// Service worker: background Web Push display + notification click routing.
function samePath(client, url) {
  try {
    return new URL(client.url).pathname === new URL(url, self.location.origin).pathname;
  } catch {
    return false;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const { title, body, url, tag } = payload || {};
  if (!title) return;

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Skip showing an OS notification if the target chat/route is already focused.
    const alreadyFocusedHere = clientsList.some((client) => client.focused && samePath(client, url || "/"));
    if (alreadyFocusedHere) return;
    await self.registration.showNotification(title, {
      body: body || "",
      icon: "/my-agent-air-icon.svg",
      badge: "/my-agent-air-icon.svg",
      tag: tag || undefined,
      data: { url: url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => samePath(client, url));
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
