self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { body: event.data ? event.data.text() : "Preislimit erreicht." };
  }

  const title = payload.title || "Tankzeit";
  const options = {
    body: payload.body || "Ein gespeichertes Preislimit wurde erreicht.",
    icon: "favicon-192.png",
    badge: "favicon-192.png",
    data: { url: payload.url || "favoriten.html" },
    tag: "tankzeit-price-alert",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "favoriten.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
