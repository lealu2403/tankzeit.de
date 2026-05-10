(function () {
  const PROMO_ID = "app-install-promo";
  const ANDROID_WEB_LINK = "https://play.google.com/store/apps/details?id=de.tankzeit.android";
  const ANDROID_STORE_LINK = "market://details?id=de.tankzeit.android";
  const IOS_LINK = "https://apps.apple.com/de/app/tankzeit/id6759522835";
  const VEHICLE_DATA_URL = "data/adac_models_by_make.csv?v=20260503-adac-full";
  let tankplanVehiclesPromise = null;
  let tankplanSelectedVehicle = null;

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function dismissPromo() {
    document.getElementById(PROMO_ID)?.remove();
  }

  function rootContainer() {
    return document.querySelector("main.app, .station-shell, .legal-shell");
  }

  function tankplanIcon() {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
        <path d="M5 21h11" />
        <path d="M9 7h3" />
        <path d="M15 8h2.5a2 2 0 0 1 2 2v2.4" />
        <circle cx="18" cy="17" r="3" />
        <path d="M18 15.4V17l1.1.8" />
      </svg>
    `;
  }

  function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseIsoDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function datesBetween(startValue, endValue) {
    const start = parseIsoDate(startValue);
    const end = parseIsoDate(endValue);
    const dates = [];
    if (!start || !end || start > end) return dates;
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(formatIsoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  function tankplanSearch() {
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 13);
    const start = formatIsoDate(startDate);
    const end = formatIsoDate(endDate);
    return { start, end, dates: datesBetween(start, end), search: "" };
  }

  function fixTankplanCalculator() {
    if (!location.pathname.endsWith("/tankplan.html")) return;
    const parseOptionalNumber = function (value) {
      const text = String(value ?? "").replace(",", ".").trim();
      if (!text) return null;
      const number = Number(text);
      return Number.isFinite(number) ? number : null;
    };
    try {
      num = parseOptionalNumber;
    } catch (error) {
      window.num = parseOptionalNumber;
    }
  }

  function parseVehicleCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows
      .filter((item) => item.length > 1)
      .map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] || ""])));
  }

  function normalizeVehicleText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseBuildYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  function tankplanVehicleMeta(vehicle) {
    return [vehicle.fahrzeugbezeichnung, vehicle.generation, vehicle.baujahr, vehicle.kraftstoffart]
      .filter(Boolean)
      .join(" · ");
  }

  async function loadTankplanVehicles() {
    if (!tankplanVehiclesPromise) {
      tankplanVehiclesPromise = fetch(VEHICLE_DATA_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Fahrzeugdaten konnten nicht geladen werden.");
          return response.text();
        })
        .then((text) => parseVehicleCsv(text).filter((vehicle) => vehicle.fahrzeugbezeichnung));
    }
    return tankplanVehiclesPromise;
  }

  function ensureBuildYearField() {
    if (!location.pathname.endsWith("/tankplan.html")) return null;
    let input = document.getElementById("build-year");
    if (input) return input;
    const modelInput = document.getElementById("model");
    const modelField = modelInput?.closest(".tankplan-field");
    if (!modelField) return null;
    const field = document.createElement("div");
    field.className = "tankplan-field";
    field.innerHTML = `
      <label for="build-year">Baujahr</label>
      <input id="build-year" name="buildYear" inputmode="numeric" min="2000" max="2026" step="1" placeholder="z. B. 2020" />
    `;
    modelField.insertAdjacentElement("afterend", field);
    return field.querySelector("#build-year");
  }

  function selectedPreview() {
    return document.getElementById("selected-vehicle");
  }

  function prepareSelectedPreview() {
    const preview = selectedPreview();
    if (!preview || preview.dataset.tankplanToggleReady) return;
    preview.dataset.tankplanToggleReady = "true";
    preview.setAttribute("role", "button");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("title", "Auswahlliste öffnen");
    preview.style.cursor = "pointer";
    const openList = () => {
      if (!tankplanSelectedVehicle) return;
      preview.hidden = true;
      renderTankplanSuggestionsWithYear({ keepSelection: true });
    };
    preview.addEventListener("click", openList);
    preview.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList();
      }
    });
    document.addEventListener("click", (event) => {
      const suggestionsEl = document.getElementById("suggestions");
      if (!tankplanSelectedVehicle || !preview.hidden) return;
      if (preview.contains(event.target) || suggestionsEl?.contains(event.target)) return;
      preview.hidden = false;
    });
  }

  async function renderTankplanSuggestionsWithYear(options = {}) {
    const manufacturerInput = document.getElementById("manufacturer");
    const modelInput = document.getElementById("model");
    const buildYearInput = document.getElementById("build-year");
    const suggestionsEl = document.getElementById("suggestions");
    const preview = selectedPreview();
    if (!manufacturerInput || !modelInput || !suggestionsEl) return;

    if (!options.keepSelection) {
      tankplanSelectedVehicle = null;
      if (preview) preview.hidden = true;
    }

    const manufacturer = normalizeVehicleText(manufacturerInput.value);
    const model = normalizeVehicleText(modelInput.value);
    const buildYear = parseBuildYear(buildYearInput?.value);

    suggestionsEl.replaceChildren();
    if (!manufacturer && !model && buildYear === null) {
      suggestionsEl.hidden = true;
      return;
    }

    let vehicles = [];
    try {
      vehicles = await loadTankplanVehicles();
    } catch (error) {
      if (typeof setStatus === "function") setStatus(error.message);
      return;
    }

    const allMatches = vehicles
      .filter((vehicle) => {
        const vehicleManufacturer = normalizeVehicleText(vehicle.hersteller);
        const vehicleModel = normalizeVehicleText(vehicle.modell);
        const vehicleName = normalizeVehicleText(vehicle.fahrzeugbezeichnung);
        const vehicleYear = parseBuildYear(vehicle.baujahr);
        return (
          (!manufacturer || vehicleManufacturer.includes(manufacturer)) &&
          (!model || vehicleModel.includes(model) || vehicleName.includes(model)) &&
          (buildYear === null || vehicleYear === buildYear)
        );
      })
      .sort((a, b) => {
        const yearDifference = (parseBuildYear(b.baujahr) || 0) - (parseBuildYear(a.baujahr) || 0);
        if (yearDifference !== 0) return yearDifference;
        return String(a.fahrzeugbezeichnung || "").localeCompare(String(b.fahrzeugbezeichnung || ""), "de");
      });

    const matches = allMatches.slice(0, 250);
    if (!matches.length) {
      suggestionsEl.hidden = true;
      if (typeof setStatus === "function") setStatus("Keine passenden Fahrzeuge gefunden.");
      return;
    }

    matches.forEach((vehicle) => {
      const button = document.createElement("button");
      button.className = "tankplan-suggestion";
      button.type = "button";
      button.innerHTML = `<strong>${vehicle.hersteller} ${vehicle.modell}</strong><span>${tankplanVehicleMeta(vehicle)}</span>`;
      button.addEventListener("click", () => {
        tankplanSelectedVehicle = vehicle;
        if (typeof selectVehicle === "function") selectVehicle(vehicle);
        suggestionsEl.hidden = true;
        if (preview) preview.hidden = false;
      });
      suggestionsEl.append(button);
    });
    suggestionsEl.hidden = false;
    if (typeof setStatus === "function") {
      setStatus(`${matches.length} von ${allMatches.length} Vorschlägen angezeigt.`);
    }
  }

  function enhanceTankplanVehicleSearch() {
    if (!location.pathname.endsWith("/tankplan.html")) return;
    const buildYearInput = ensureBuildYearField();
    if (!buildYearInput) return;
    prepareSelectedPreview();

    try {
      renderSuggestions = renderTankplanSuggestionsWithYear;
    } catch (error) {
      window.renderSuggestions = renderTankplanSuggestionsWithYear;
    }
    window.renderSuggestions = renderTankplanSuggestionsWithYear;

    const queueRender = () => {
      tankplanSelectedVehicle = null;
      window.clearTimeout(buildYearInput.dataset.timerId);
      const timerId = window.setTimeout(renderTankplanSuggestionsWithYear, 120);
      buildYearInput.dataset.timerId = String(timerId);
    };
    buildYearInput.addEventListener("input", queueRender);
    document.getElementById("manufacturer")?.addEventListener("input", queueRender);
    document.getElementById("model")?.addEventListener("input", queueRender);
  }

  function dataPath(date) {
    const [year, month, day] = date.split("-");
    return `data2/${year}/${month}/${day}/management_boxplots.json`;
  }

  function overall(summary, fuel) {
    return Number((summary.brand_distributions?.[fuel] || []).find((item) => item.brand === "Gesamtmarkt")?.median);
  }

  function weekdayFromIso(date) {
    const parsed = parseIsoDate(date);
    return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][parsed.getDay()];
  }

  async function repairTankplanPriceRange() {
    if (!location.pathname.endsWith("/tankplan.html")) return;
    const range = tankplanSearch();
    const fuels = ["diesel", "e5", "e10"];
    const summaries = [];

    if (window.location.search) {
      history.replaceState(null, "", location.pathname);
    }

    const statisticsNavLink = document.getElementById("statistics-nav-link");
    if (statisticsNavLink) statisticsNavLink.href = "management.html";

    await Promise.all(
      range.dates.map(async (date) => {
        try {
          const response = await fetch(dataPath(date), { cache: "no-store" });
          if (response.ok) summaries.push({ date, summary: await response.json() });
        } catch (error) {
          // Missing daily files are skipped; the chart uses the files that exist.
        }
      }),
    );

    if (summaries.length < 2) return;
    summaries.sort((a, b) => a.date.localeCompare(b.date));

    const groups = Object.fromEntries(fuels.map((fuel) => [fuel, new Map()]));
    const dayStats = Object.fromEntries(fuels.map((fuel) => [fuel, []]));

    summaries.forEach(({ date, summary }) => {
      fuels.forEach((fuel) => {
        const base = overall(summary, fuel);
        if (!Number.isFinite(base)) return;
        const values = [];
        (summary.fuels?.[fuel] || []).forEach((row) => {
          const hour = Number(row.clock_hour) % 24;
          const count = Number(row.count);
          const delta = Number(row.median);
          if (!Number.isFinite(hour) || !Number.isFinite(count) || !Number.isFinite(delta) || count <= 0) return;
          const price = base + delta;
          const bucket = groups[fuel].get(hour) || { sum: 0, count: 0 };
          bucket.sum += price * count;
          bucket.count += count;
          groups[fuel].set(hour, bucket);
          values.push({ hour, price, count });
        });
        if (!values.length) return;
        const totalCount = values.reduce((sum, item) => sum + item.count, 0);
        const averagePrice = values.reduce((sum, item) => sum + item.price * item.count, 0) / totalCount;
        const best = values.reduce((currentBest, item) => (item.price < currentBest.price ? item : currentBest));
        dayStats[fuel].push({ date, weekday: weekdayFromIso(date), averagePrice, bestHour: best.hour, bestPrice: best.price, count: totalCount });
      });
    });

    const slots = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const prices = {};
      const counts = {};
      fuels.forEach((fuel) => {
        const bucket = groups[fuel].get(hour);
        counts[fuel] = bucket?.count || 0;
        if (bucket?.count) prices[fuel] = bucket.sum / bucket.count;
      });
      if (Object.keys(prices).length) {
        slots.push({ hour, label: `${String(hour).padStart(2, "0")}:00`, prices, counts });
      }
    }

    try {
      priceAnalysis = { dates: summaries.map((item) => item.date), slots, dayStats };
      if (typeof renderCharts === "function") renderCharts();
      if (typeof setStatus === "function") setStatus(`Preisanalysen für ${summaries.length} Tage sind geladen.`);
    } catch (error) {
      // The Tankplan page owns the chart state; if it is not present, do nothing.
    }
  }

  function syncTankplanNav() {
    const nav = document.querySelector(".nav-bar");
    if (!nav) return;
    const isTankplan = location.pathname.endsWith("/tankplan.html");
    const existingTankplanLink = Array.from(nav.querySelectorAll(".nav-item")).find((item) => item.textContent.trim() === "Tankplan");
    if (existingTankplanLink) {
      existingTankplanLink.id ||= "tankplan-nav-link";
      existingTankplanLink.href = "tankplan.html";
      if (isTankplan) {
        existingTankplanLink.classList.add("active", "tankplan");
        existingTankplanLink.setAttribute("aria-current", "page");
      }
      return;
    }
    const statisticsLink = Array.from(nav.querySelectorAll(".nav-item")).find((item) => item.textContent.trim() === "Statistik");
    if (!statisticsLink) return;
    const link = document.createElement("a");
    link.id = "tankplan-nav-link";
    link.href = "tankplan.html";
    link.className = `nav-item${isTankplan ? " active tankplan" : ""}`;
    if (isTankplan) link.setAttribute("aria-current", "page");
    link.innerHTML = `${tankplanIcon()}<span>Tankplan</span>`;
    statisticsLink.insertAdjacentElement("afterend", link);
  }

  function promoMarkup() {
    return `
      <div class="app-install-head">
        <div class="app-install-copy">
          <p class="app-install-kicker">Auch als App</p>
          <h2>Tankzeit immer dabei</h2>
          <p>
            Für
            <a class="app-install-copy-link" href="${IOS_LINK}">iPhone im App Store</a>
            und für
            <a class="app-install-copy-link" href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}">Android bei Google Play</a>.
          </p>
        </div>
        <div class="app-install-links" aria-label="Store-Links">
          <a class="app-install-link" href="${IOS_LINK}" aria-label="Tankzeit im App Store öffnen" title="Im App Store öffnen">
            <img class="app-install-store-badge app-install-store-badge--apple" src="img/app-store-badge.svg" alt="Laden im App Store" width="250" height="83" decoding="async" />
          </a>
          <a class="app-install-link" href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}" aria-label="Tankzeit bei Google Play öffnen" title="Bei Google Play öffnen">
            <img class="app-install-store-badge app-install-store-badge--google" src="img/google-play-badge.png" alt="Jetzt bei Google Play" width="646" height="250" decoding="async" />
          </a>
        </div>
        <button class="app-install-dismiss" type="button" aria-label="App-Hinweis ausblenden">×</button>
      </div>
    `;
  }

  function buildPromo() {
    fixTankplanCalculator();
    syncTankplanNav();
    enhanceTankplanVehicleSearch();
    window.setTimeout(repairTankplanPriceRange, 450);
    if (document.getElementById(PROMO_ID)) return;
    const container = rootContainer();
    if (!container) return;
    const promo = document.createElement("section");
    promo.id = PROMO_ID;
    promo.className = "app-install-promo";
    promo.setAttribute("aria-label", "Tankzeit als App");
    promo.innerHTML = promoMarkup();
    container.prepend(promo);
    promo.querySelector(".app-install-dismiss")?.addEventListener("click", dismissPromo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPromo, { once: true });
  }
  buildPromo();
})();
