(function () {
  const STORAGE_KEY = "tankzeit_global_favorite_price_alert";
  const LEGACY_STORAGE_KEY = "tankzeit_favorite_price_alerts";
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

  function normalizeFuel(value) {
    return FUELS.includes(value) ? value : "e10";
  }

  function parseLimit(value) {
    const numeric = Number(String(value || "").replace(",", "."));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function formatPrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
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

  function migrateLegacySetting() {
    const existing = loadJson(STORAGE_KEY, null);
    if (existing) return existing;

    const legacy = loadJson(LEGACY_STORAGE_KEY, {});
    const firstEnabled = Object.values(legacy).find((entry) => entry?.enabled);
    if (!firstEnabled) return { enabled: false, fuel: "e10", limit: null };

    const migrated = {
      enabled: true,
      fuel: normalizeFuel(firstEnabled.fuel),
      limit: parseLimit(firstEnabled.limit),
    };
    saveJson(STORAGE_KEY, migrated);
    return migrated;
  }

  function loadSetting() {
    const setting = migrateLegacySetting();
    return {
      enabled: Boolean(setting.enabled),
      fuel: normalizeFuel(setting.fuel),
      limit: parseLimit(setting.limit),
    };
  }

  function saveSetting(setting) {
    saveJson(STORAGE_KEY, {
      enabled: Boolean(setting.enabled),
      fuel: normalizeFuel(setting.fuel),
      limit: parseLimit(setting.limit),
    });
  }

  function loadLastHits() {
    return loadJson(LAST_HIT_STORAGE_KEY, {});
  }

  function saveLastHits(hits) {
    saveJson(LAST_HIT_STORAGE_KEY, hits);
  }

  function renderGlobalControl() {
    const setting = loadSetting();
    const limit = setting.limit !== null ? formatPrice(setting.limit) : "";
    const checked = setting.enabled ? "checked" : "";

    return `
      <section class="favorite-alert-panel" aria-label="Preislimit fuer Favoriten">
        <div class="favorite-alert-panel-head">
          <span>Preislimit</span>
          <label class="favorite-alert-toggle">
            <input type="checkbox" data-alert-enabled ${checked} />
            <span>Meldung</span>
          </label>
        </div>
        <div class="favorite-alert-fields">
          <select data-alert-fuel aria-label="Kraftstoff fuer Preislimit">
            <option value="e10" ${setting.fuel === "e10" ? "selected" : ""}>E10</option>
            <option value="diesel" ${setting.fuel === "diesel" ? "selected" : ""}>Diesel</option>
          </select>
          <input data-alert-limit type="text" inputmode="decimal" value="${escapeHtml(limit)}" placeholder="1,699" aria-label="Preislimit in Euro pro Liter" />
          <button class="favorite-alert-save" type="button" data-alert-save>OK</button>
          <button class="favorite-alert-clear" type="button" data-alert-clear aria-label="Preislimit loeschen">x</button>
        </div>
      </section>
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

  function saveGlobalControl(control, setStatus) {
    const enabled = Boolean(control.querySelector("[data-alert-enabled]")?.checked);
    const fuel = normalizeFuel(control.querySelector("[data-alert-fuel]")?.value);
    const limitInput = control.querySelector("[data-alert-limit]");
    const limit = parseLimit(limitInput?.value);

    if (enabled && limit === null) {
      setStatus?.("Bitte ein gueltiges Preislimit eingeben, z. B. 1,699.", "error");
      return;
    }

    saveSetting({ enabled, fuel, limit });
    if (limitInput && limit !== null) limitInput.value = formatPrice(limit);

    if (enabled) {
      ensureNotificationPermission().then((permission) => {
        if (permission === "denied") {
          setStatus?.("Preislimit fuer alle Favoriten gespeichert. Browser-Benachrichtigungen sind jedoch blockiert.");
          return;
        }
        if (permission === "unsupported") {
          setStatus?.("Preislimit fuer alle Favoriten gespeichert. Dein Browser unterstuetzt keine Web-Benachrichtigungen.");
          return;
        }
        setStatus?.(`Preislimit fuer alle Favoriten gespeichert: ${fuel.toUpperCase()} bis ${formatPrice(limit)} EUR/l.`);
      });
      return;
    }

    setStatus?.("Preislimit gespeichert, Meldung ist deaktiviert.");
  }

  function clearGlobalControl(control, setStatus) {
    saveSetting({ enabled: false, fuel: "e10", limit: null });
    control.querySelector("[data-alert-enabled]").checked = false;
    control.querySelector("[data-alert-fuel]").value = "e10";
    control.querySelector("[data-alert-limit]").value = "";
    setStatus?.("Preislimit geloescht.");
  }

  function bindGlobalControl({ setStatus } = {}) {
    const control = document.querySelector(".favorite-alert-panel");
    if (!control) return;
    control.querySelector("[data-alert-save]")?.addEventListener("click", () => {
      saveGlobalControl(control, setStatus);
    });
    control.querySelector("[data-alert-clear]")?.addEventListener("click", () => {
      clearGlobalControl(control, setStatus);
    });
    control.querySelector("[data-alert-enabled]")?.addEventListener("change", () => {
      saveGlobalControl(control, setStatus);
    });
  }

  function removeStation(stationId) {
    const hits = loadLastHits();
    Object.keys(hits).forEach((key) => {
      if (key.startsWith(`${stationId}:`)) delete hits[key];
    });
    saveLastHits(hits);
  }

  function evaluatePrices({ prices, ids, favorites, setStatus }) {
    const setting = loadSetting();
    const limit = parseLimit(setting.limit);
    if (!setting.enabled || limit === null) return [];

    const fuel = normalizeFuel(setting.fuel);
    const lastHits = loadLastHits();
    const nowBucket = new Date().toISOString().slice(0, 13);
    const hits = [];

    (ids || []).forEach((stationId) => {
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
      const suffix = hits.length > 1 ? ` und ${hits.length - 1} weitere Favoriten` : "";
      setStatus?.(`Preislimit erreicht: ${stationLabel(first.station)} - ${first.message}${suffix}`);
    }
    return hits;
  }

  function injectStyles() {
    if (document.getElementById("favorite-alert-styles")) return;
    const style = document.createElement("style");
    style.id = "favorite-alert-styles";
    style.textContent = `
      .favorite-alert-panel { display: grid; gap: 8px; min-width: min(100%, 430px); padding: 12px 14px; border-radius: 18px; background: var(--card-glass); border: 1px solid rgba(128, 128, 128, 0.14); box-shadow: var(--shadow-sm); justify-self: end; }
      .favorite-alert-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: var(--muted); font-size: 0.82rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
      .favorite-alert-toggle { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 0.9rem; font-weight: 800; letter-spacing: 0; text-transform: none; }
      .favorite-alert-toggle input { width: 16px; height: 16px; accent-color: var(--accent); }
      .favorite-alert-fields { display: grid; grid-template-columns: 86px minmax(110px, 1fr) auto auto; gap: 8px; align-items: center; }
      .favorite-alert-fields select, .favorite-alert-fields input { min-height: 40px; border: 1px solid rgba(128, 128, 128, 0.28); border-radius: 10px; background: var(--card); color: var(--ink); padding: 8px 10px; font: inherit; font-size: 0.9rem; }
      .favorite-alert-fields button { min-height: 40px; border: 0; border-radius: 10px; background: rgba(128, 128, 128, 0.12); color: var(--ink); cursor: pointer; font: inherit; font-size: 0.86rem; font-weight: 800; padding: 0 12px; }
      .favorite-alert-fields button:hover { background: rgba(128, 128, 128, 0.2); }
      .favorite-alert-save { color: var(--accent) !important; }
      @media (max-width: 720px) { .favorite-alert-panel { width: 100%; justify-self: stretch; } .favorite-alert-fields { grid-template-columns: 1fr 1fr auto auto; } }
    `;
    document.head.appendChild(style);
  }

  injectStyles();

  window.TankzeitFavoriteNotifications = {
    bindGlobalControl,
    evaluatePrices,
    removeStation,
    renderGlobalControl,
  };
})();
