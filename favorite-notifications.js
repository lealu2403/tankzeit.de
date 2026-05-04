(function () {
  const STORAGE_KEY = "tankzeit_favorite_price_alerts";
  const LAST_HIT_STORAGE_KEY = "tankzeit_favorite_price_alert_hits";
  const FUELS = ["e10", "diesel"];

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === "object" ? value : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadSettings() {
    return loadJson(STORAGE_KEY, {});
  }

  function saveSettings(settings) {
    saveJson(STORAGE_KEY, settings);
  }

  function loadLastHits() {
    return loadJson(LAST_HIT_STORAGE_KEY, {});
  }

  function saveLastHits(hits) {
    saveJson(LAST_HIT_STORAGE_KEY, hits);
  }

  function normalizeFuel(value) {
    return FUELS.includes(value) ? value : "e10";
  }

  function parseLimit(value) {
    const numeric = Number(String(value || "").replace(",", "."));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function formatPrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "-";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(numeric);
  }

  function stationLabel(station) {
    return station?.name || station?.brand || "Favoritentankstelle";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderControls(station) {
    const stationId = station?.id || "";
    const settings = loadSettings();
    const setting = settings[stationId] || {};
    const fuel = normalizeFuel(setting.fuel);
    const limit = Number.isFinite(Number(setting.limit)) ? String(setting.limit).replace(".", ",") : "";
    const checked = setting.enabled ? "checked" : "";

    return `
      <div class="favorite-alert-control" data-alert-station="${escapeHtml(stationId)}">
        <label class="favorite-alert-toggle">
          <input type="checkbox" data-alert-enabled ${checked} />
          <span>Meldung</span>
        </label>
        <div class="favorite-alert-fields">
          <select data-alert-fuel aria-label="Kraftstoff fuer Preislimit">
            <option value="e10" ${fuel === "e10" ? "selected" : ""}>E10</option>
            <option value="diesel" ${fuel === "diesel" ? "selected" : ""}>Diesel</option>
          </select>
          <input data-alert-limit type="number" min="0" step="0.001" inputmode="decimal" value="${escapeHtml(limit)}" placeholder="1,699" aria-label="Preislimit in Euro pro Liter" />
          <button class="favorite-alert-save" type="button" data-alert-save>OK</button>
          <button class="favorite-alert-clear" type="button" data-alert-clear aria-label="Preislimit loeschen">x</button>
        </div>
      </div>
    `;
  }

  async function ensureNotificationPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;
    return Notification.requestPermission();
  }

  function showBrowserNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        body,
        tag: "tankzeit-favorite-price-alert",
        icon: "/favicon-192.png",
      });
    } catch (err) {
      console.warn("Notification could not be shown", err);
    }
  }

  function saveControl(control, setStatus) {
    const stationId = control?.dataset?.alertStation;
    if (!stationId) return;

    const enabled = Boolean(control.querySelector("[data-alert-enabled]")?.checked);
    const fuel = normalizeFuel(control.querySelector("[data-alert-fuel]")?.value);
    const limitInput = control.querySelector("[data-alert-limit]");
    const limit = parseLimit(limitInput?.value);

    if (enabled && limit === null) {
      setStatus?.("Bitte ein gueltiges Preislimit eingeben, z. B. 1,699.", "error");
      return;
    }

    const settings = loadSettings();
    if (!enabled && limit === null) {
      delete settings[stationId];
    } else {
      settings[stationId] = { enabled, fuel, limit };
    }
    saveSettings(settings);

    if (enabled) {
      ensureNotificationPermission().then((permission) => {
        if (permission === "denied") {
          setStatus?.("Preislimit gespeichert. Browser-Benachrichtigungen sind jedoch blockiert.");
          return;
        }
        if (permission === "unsupported") {
          setStatus?.("Preislimit gespeichert. Dein Browser unterstuetzt keine Web-Benachrichtigungen.");
          return;
        }
        setStatus?.(`Preislimit gespeichert: ${fuel.toUpperCase()} bis ${formatPrice(limit)} EUR/l.`);
      });
      return;
    }

    setStatus?.("Preislimit gespeichert.");
  }

  function clearControl(control, setStatus) {
    const stationId = control?.dataset?.alertStation;
    if (!stationId) return;
    const settings = loadSettings();
    delete settings[stationId];
    saveSettings(settings);
    control.querySelector("[data-alert-enabled]").checked = false;
    control.querySelector("[data-alert-limit]").value = "";
    setStatus?.("Preislimit geloescht.");
  }

  function bindControls({ setStatus } = {}) {
    document.querySelectorAll("[data-alert-station]").forEach((control) => {
      control.querySelector("[data-alert-save]")?.addEventListener("click", () => {
        saveControl(control, setStatus);
      });
      control.querySelector("[data-alert-clear]")?.addEventListener("click", () => {
        clearControl(control, setStatus);
      });
      control.querySelector("[data-alert-enabled]")?.addEventListener("change", () => {
        saveControl(control, setStatus);
      });
    });
  }

  function removeStation(stationId) {
    const settings = loadSettings();
    delete settings[stationId];
    saveSettings(settings);

    const hits = loadLastHits();
    Object.keys(hits).forEach((key) => {
      if (key.startsWith(`${stationId}:`)) delete hits[key];
    });
    saveLastHits(hits);
  }

  function evaluatePrices({ prices, ids, favorites, setStatus }) {
    const settings = loadSettings();
    const lastHits = loadLastHits();
    const nowBucket = new Date().toISOString().slice(0, 13);
    const hits = [];

    (ids || []).forEach((stationId) => {
      const setting = settings[stationId];
      if (!setting?.enabled) return;
      const limit = parseLimit(setting.limit);
      if (limit === null) return;
      const fuel = normalizeFuel(setting.fuel);
      const priceEntry = prices?.[stationId];
      const currentPrice = Number(priceEntry?.[fuel]);
      if (!Number.isFinite(currentPrice) || currentPrice > limit) return;

      const station = (favorites || []).find((entry) => entry.id === stationId) || {};
      const hitKey = `${stationId}:${fuel}:${formatPrice(limit)}`;
      const message = `${fuel.toUpperCase()} bei ${formatPrice(currentPrice)} EUR/l, Limit ${formatPrice(limit)} EUR/l.`;
      hits.push({ station, fuel, currentPrice, limit, message });

      if (lastHits[hitKey] !== nowBucket) {
        showBrowserNotification(`Tankzeit: ${stationLabel(station)}`, message);
        lastHits[hitKey] = nowBucket;
      }
    });

    saveLastHits(lastHits);
    if (hits.length) {
      const first = hits[0];
      const suffix = hits.length > 1 ? ` und ${hits.length - 1} weitere Treffer` : "";
      setStatus?.(`Preislimit erreicht: ${stationLabel(first.station)} - ${first.message}${suffix}`);
    }
    return hits;
  }

  function injectStyles() {
    if (document.getElementById("favorite-alert-styles")) return;
    const style = document.createElement("style");
    style.id = "favorite-alert-styles";
    style.textContent = `
      .favorite-alert-control { display: grid; gap: 8px; min-width: 230px; }
      .favorite-alert-toggle { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--ink); }
      .favorite-alert-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
      .favorite-alert-fields { display: grid; grid-template-columns: 76px minmax(84px, 1fr) auto auto; gap: 6px; align-items: center; }
      .favorite-alert-fields select, .favorite-alert-fields input { min-height: 36px; border: 1px solid rgba(128, 128, 128, 0.28); border-radius: 8px; background: var(--card); color: var(--ink); padding: 7px 8px; font: inherit; font-size: 0.84rem; }
      .favorite-alert-fields button { min-height: 36px; border: 0; border-radius: 8px; background: rgba(128, 128, 128, 0.12); color: var(--ink); cursor: pointer; font: inherit; font-size: 0.82rem; font-weight: 800; padding: 0 9px; }
      .favorite-alert-fields button:hover { background: rgba(128, 128, 128, 0.2); }
      .favorite-alert-save { color: var(--accent) !important; }
      @media (max-width: 600px) { .favorite-alert-control { width: min(100%, 320px); } .favorite-alert-fields { grid-template-columns: 1fr 1fr auto auto; } }
    `;
    document.head.appendChild(style);
  }

  injectStyles();

  window.TankzeitFavoriteNotifications = {
    bindControls,
    evaluatePrices,
    removeStation,
    renderControls,
  };
})();
