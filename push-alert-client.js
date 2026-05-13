(function () {
  const BACKEND_URL_STORAGE_KEY = "tankzeit_alert_backend_url";
  const CLIENT_ID_STORAGE_KEY = "tankzeit_alert_client_id";

  function backendUrl() {
    return String(
      window.TANKZEIT_ALERT_BACKEND_URL ||
        localStorage.getItem(BACKEND_URL_STORAGE_KEY) ||
        "",
    ).replace(/\/$/, "");
  }

  function clientId() {
    let value = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    }
    return value;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  async function getPublicKey(baseUrl) {
    const response = await fetch(`${baseUrl}/api/push/public-key`);
    if (!response.ok) throw new Error("Push public key could not be loaded");
    const payload = await response.json();
    if (!payload.publicKey) throw new Error("Push public key is missing");
    return payload.publicKey;
  }

  async function getSubscription(baseUrl) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Push notifications are not supported by this browser");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Notification permission was not granted");
    }

    const registration = await navigator.serviceWorker.register("service-worker.js");
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    const publicKey = await getPublicKey(baseUrl);
    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  async function syncAlert({ enabled, fuel, limit, favorites }) {
    const baseUrl = backendUrl();
    if (!baseUrl) return { skipped: "missing_backend_url" };

    const subscription = enabled ? await getSubscription(baseUrl) : null;
    const response = await fetch(`${baseUrl}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId(),
        enabled,
        fuel,
        limit,
        favorites,
        subscription,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Alert could not be synced");
    }
    return response.json();
  }

  async function deleteAlert() {
    const baseUrl = backendUrl();
    if (!baseUrl) return { skipped: "missing_backend_url" };
    await fetch(`${baseUrl}/api/alerts/${encodeURIComponent(clientId())}`, {
      method: "DELETE",
    });
    return { ok: true };
  }

  window.TankzeitPushAlerts = {
    backendUrl,
    deleteAlert,
    syncAlert,
  };
})();
