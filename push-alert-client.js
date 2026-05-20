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

  function githubAlertsConfig() {
    const config = window.TANKZEIT_GITHUB_ALERTS || {};
    if (!config.enabled || !config.owner || !config.repo || !config.publicKey) return null;
    return config;
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
    const githubConfig = githubAlertsConfig();
    if (!baseUrl && githubConfig) return githubConfig.publicKey;

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

  function registrationPayload({ enabled, fuel, limit, favorites, subscription }) {
    return {
      clientId: clientId(),
      enabled: Boolean(enabled),
      fuel,
      limit: Number(limit),
      favorites: (favorites || []).map((station) => ({
        id: station.id,
        name: station.name || station.brand || "Tankstelle",
        brand: station.brand || "",
      })),
      subscription: subscription ? subscription.toJSON() : null,
      lastSentKey: "",
      updatedAt: new Date().toISOString(),
    };
  }

  function githubIssueUrl(payload) {
    const config = githubAlertsConfig();
    const title = `[Tankzeit Preisalarm] ${payload.clientId}`;
    const body = [
      "Bitte dieses Issue offen lassen, damit GitHub Actions den Preisalarm pruefen kann.",
      "Wenn du den Alarm nicht mehr brauchst, kannst du dieses Issue schliessen.",
      "",
      "```json tankzeit-price-alert",
      JSON.stringify(payload, null, 2),
      "```",
    ].join("\n");
    const params = new URLSearchParams({ title, body });
    return `https://github.com/${config.owner}/${config.repo}/issues/new?${params.toString()}`;
  }

  function showRegistrationLink(issueUrl) {
    let panel = document.getElementById("github-alert-registration");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "github-alert-registration";
      panel.style.cssText = "position:fixed;right:18px;bottom:92px;z-index:9999;max-width:380px;padding:14px 16px;border-radius:14px;background:#ffffff;color:#1f2937;box-shadow:0 18px 45px rgba(15,23,42,.24);font:14px/1.4 Manrope,system-ui,sans-serif;border:1px solid rgba(15,23,42,.1);";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <strong style="display:block;margin-bottom:6px;">Preisalarm fast fertig</strong>
      <span style="display:block;margin-bottom:10px;">Klicke auf den Button und erstelle das GitHub-Issue. Danach prueft GitHub Actions alle 30 Minuten.</span>
      <a href="${issueUrl.replaceAll("&", "&amp;")}" target="_blank" rel="noopener" style="display:inline-flex;padding:9px 12px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800;">GitHub-Registrierung oeffnen</a>
      <button type="button" data-alert-registration-close style="margin-left:8px;padding:9px 10px;border:0;border-radius:10px;background:#eef2f2;color:#111827;font-weight:800;cursor:pointer;">x</button>
    `;
    panel.querySelector("[data-alert-registration-close]")?.addEventListener("click", () => {
      panel.remove();
    });
  }

  async function syncGithubAlert({ enabled, fuel, limit, favorites }) {
    const config = githubAlertsConfig();
    if (!config) return { skipped: "missing_backend_url" };
    if (!enabled) {
      return { skipped: "github_issue_close_required" };
    }

    const subscription = await getSubscription("");
    const payload = registrationPayload({ enabled, fuel, limit, favorites, subscription });
    const issueUrl = githubIssueUrl(payload);
    showRegistrationLink(issueUrl);
    return { ok: true, mode: "github_issue", issueUrl };
  }

  async function syncAlert({ enabled, fuel, limit, favorites }) {
    const baseUrl = backendUrl();
    if (!baseUrl) return syncGithubAlert({ enabled, fuel, limit, favorites });

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
    if (!baseUrl) return { skipped: "github_issue_close_required" };
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
