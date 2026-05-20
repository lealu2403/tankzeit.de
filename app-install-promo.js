(function () {
  const PROMO_ID = "app-install-promo";
  const ANDROID_WEB_LINK = "https://play.google.com/store/apps/details?id=de.tankzeit.android";
  const ANDROID_STORE_LINK = "market://details?id=de.tankzeit.android";
  const IOS_LINK = "https://apps.apple.com/de/app/tankzeit/id6759522835";
  const VEHICLE_DATA_URL = "data/adac_models_by_make.csv?v=20260503-adac-full";
  const FUELS = ["diesel", "e5", "e10"];
  let vehiclePromise = null;
  let chosenVehicle = null;

  function isTankplan() {
    return location.pathname.endsWith("/tankplan.html");
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function rootContainer() {
    return document.querySelector("main.app, .station-shell, .legal-shell");
  }

  function dismissPromo() {
    document.getElementById(PROMO_ID)?.remove();
  }

  function iconTankplan() {
    return '<svg viewBox="0 0 24 24"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" /><path d="M5 21h11" /><path d="M9 7h3" /><path d="M15 8h2.5a2 2 0 0 1 2 2v2.4" /><circle cx="18" cy="17" r="3" /><path d="M18 15.4V17l1.1.8" /></svg>';
  }

  function formatIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseIso(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function recentRange() {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 13);
    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(formatIso(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { start: formatIso(start), end: formatIso(end), dates };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (c !== "\r") cell += c;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    const headers = rows.shift() || [];
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_/]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  function vehicleMeta(vehicle) {
    return [vehicle.fahrzeugbezeichnung, vehicle.generation, vehicle.baujahr, vehicle.kraftstoffart]
      .filter(Boolean)
      .join(" \u00b7 ");
  }

  async function vehicles() {
    if (!vehiclePromise) {
      vehiclePromise = fetch(VEHICLE_DATA_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Fahrzeugdaten konnten nicht geladen werden.");
          return response.text();
        })
        .then((text) => parseCsv(text).filter((item) => item.fahrzeugbezeichnung));
    }
    return vehiclePromise;
  }

  function injectTankplanStyles() {
    if (!isTankplan() || document.getElementById("tankplan-dropdown-style")) return;
    const style = document.createElement("style");
    style.id = "tankplan-dropdown-style";
    style.textContent = `
      .tankplan-model-field{position:relative;z-index:4}
      .tankplan-field{align-self:start;width:100%;box-sizing:border-box}
      .tankplan-field input{width:100%;box-sizing:border-box}
      .tankplan-field:has(#remaining-range){align-self:start}
      .tankplan-field:has(#remaining-range) input{width:100%;min-height:52px}
      .tankplan-suggestions[hidden]{display:none!important}
      .tankplan-suggestions{position:absolute!important;top:calc(100% + 8px);right:0;left:0;z-index:20;display:grid;gap:6px;max-height:380px;overflow:auto;border:1px solid rgba(15,118,110,.16);border-radius:22px;background:#fff;box-shadow:0 22px 44px rgba(18,18,18,.18);padding:8px}
      .tankplan-suggestion:hover,.tankplan-suggestion:focus{background:rgba(15,118,110,.12);outline:0}
      .tankplan-selected{cursor:pointer}
      .tankplan-selected:hover,.tankplan-selected:focus{background:rgba(15,118,110,.12);outline:0}
      .management-chart-card{margin-top:24px}
      .tankplan-tooltip{position:fixed;z-index:80;max-width:280px;border:1px solid rgba(15,118,110,.16);border-radius:14px;background:#fff;color:#121212;box-shadow:0 18px 34px rgba(18,18,18,.18);padding:10px 12px;font-size:.82rem;font-weight:700;pointer-events:none}
      .tankplan-tooltip strong{display:block;margin-bottom:5px;color:#121212}
      .tankplan-tooltip span{display:block;color:#666;line-height:1.35}
      @media(max-width:720px){.tankplan-suggestions{position:static!important;max-height:320px}}
    `;
    document.head.append(style);
  }

  function ensureBuildYearField(modelField) {
    let input = document.getElementById("build-year");
    if (input) return input;
    const field = document.createElement("div");
    field.className = "tankplan-field";
    field.innerHTML = '<label for="build-year">Baujahr</label><input id="build-year" name="buildYear" inputmode="numeric" type="number" min="2000" max="2026" step="1" placeholder="z. B. 2020" />';
    modelField.insertAdjacentElement("afterend", field);
    return field.querySelector("#build-year");
  }

  function closeSuggestions() {
    const suggestions = document.getElementById("suggestions");
    if (!suggestions) return;
    suggestions.hidden = true;
    suggestions.replaceChildren();
  }

  function prepareTankplanLayout() {
    if (!isTankplan()) return null;
    injectTankplanStyles();
    const modelInput = document.getElementById("model");
    const suggestions = document.getElementById("suggestions");
    const modelField = modelInput?.closest(".tankplan-field");
    if (!modelInput || !suggestions || !modelField) return null;
    modelField.classList.add("tankplan-model-field");
    if (suggestions.parentElement !== modelField) modelField.append(suggestions);
    const buildYearInput = ensureBuildYearField(modelField);
    return { modelInput, suggestions, buildYearInput };
  }

  async function renderTankplanSuggestions(options = {}) {
    const prepared = prepareTankplanLayout();
    if (!prepared) return;
    const manufacturerInput = document.getElementById("manufacturer");
    const selectedPreview = document.getElementById("selected-vehicle");
    const { modelInput, suggestions, buildYearInput } = prepared;

    if (!options.keepSelection) {
      chosenVehicle = null;
      if (typeof clearSelection === "function") clearSelection();
      if (selectedPreview) selectedPreview.hidden = true;
    } else if (selectedPreview) selectedPreview.hidden = true;

    const manufacturer = norm(manufacturerInput?.value);
    const model = norm(modelInput.value);
    const year = parseYear(buildYearInput?.value);
    suggestions.replaceChildren();

    if (!manufacturer && !model && year === null) {
      closeSuggestions();
      if (typeof setStatus === "function") setStatus("Vorschl\u00e4ge erscheinen, sobald Hersteller oder Modell eingegeben wird.");
      return;
    }

    let list = [];
    try {
      list = await vehicles();
    } catch (error) {
      if (typeof setStatus === "function") setStatus(error.message);
      return;
    }

    const allMatches = list
      .filter((vehicle) => {
        const vehicleYear = parseYear(vehicle.baujahr);
        return (
          (!manufacturer || norm(vehicle.hersteller).includes(manufacturer)) &&
          (!model || norm(vehicle.modell).includes(model) || norm(vehicle.fahrzeugbezeichnung).includes(model)) &&
          (year === null || vehicleYear === year)
        );
      })
      .sort((a, b) => {
        const byYear = (parseYear(b.baujahr) || 0) - (parseYear(a.baujahr) || 0);
        if (byYear) return byYear;
        return String(a.fahrzeugbezeichnung || "").localeCompare(String(b.fahrzeugbezeichnung || ""), "de");
      });

    const matches = allMatches.slice(0, 250);
    if (!matches.length) {
      closeSuggestions();
      if (typeof setStatus === "function") setStatus("Keine passenden Fahrzeuge gefunden.");
      return;
    }

    const fragment = document.createDocumentFragment();
    matches.forEach((vehicle) => {
      const button = document.createElement("button");
      button.className = "tankplan-suggestion";
      button.type = "button";
      button.innerHTML = `<strong>${vehicle.hersteller} ${vehicle.modell}</strong><span>${vehicleMeta(vehicle)}</span>`;
      button.addEventListener("click", () => {
        chosenVehicle = vehicle;
        if (typeof selectVehicle === "function") selectVehicle(vehicle);
        const selectedYear = parseYear(vehicle.baujahr);
        if (selectedYear && buildYearInput) buildYearInput.value = selectedYear;
        closeSuggestions();
        if (selectedPreview) selectedPreview.hidden = false;
      });
      fragment.append(button);
    });
    suggestions.append(fragment);
    suggestions.hidden = false;
    if (typeof setStatus === "function") setStatus(`${matches.length} von ${allMatches.length} Vorschl\u00e4gen angezeigt.`);
  }

  function enhanceTankplanVehicleSearch() {
    const prepared = prepareTankplanLayout();
    if (!prepared) return;
    const manufacturerInput = document.getElementById("manufacturer");
    const selectedPreview = document.getElementById("selected-vehicle");
    const { modelInput, buildYearInput, suggestions } = prepared;

    try { renderSuggestions = renderTankplanSuggestions; } catch (error) { window.renderSuggestions = renderTankplanSuggestions; }
    window.renderSuggestions = renderTankplanSuggestions;

    const queue = () => {
      chosenVehicle = null;
      window.clearTimeout(queue.timer);
      queue.timer = window.setTimeout(() => renderTankplanSuggestions(), 120);
    };

    manufacturerInput?.addEventListener("input", queue);
    modelInput.addEventListener("input", queue);
    buildYearInput?.addEventListener("input", queue);

    if (selectedPreview && !selectedPreview.dataset.tankplanToggleReady) {
      selectedPreview.dataset.tankplanToggleReady = "true";
      selectedPreview.setAttribute("role", "button");
      selectedPreview.setAttribute("tabindex", "0");
      selectedPreview.setAttribute("title", "Auswahlliste \u00f6ffnen");
      const open = () => {
        if (!chosenVehicle && typeof selectedVehicle !== "undefined") chosenVehicle = selectedVehicle;
        if (!chosenVehicle) return;
        renderTankplanSuggestions({ keepSelection: true });
      };
      selectedPreview.addEventListener("click", open);
      selectedPreview.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    }

    document.addEventListener("click", (event) => {
      if (!suggestions.contains(event.target) && event.target !== modelInput && event.target !== manufacturerInput && event.target !== buildYearInput && event.target !== selectedPreview) {
        closeSuggestions();
        if (selectedPreview && (chosenVehicle || (typeof selectedVehicle !== "undefined" && selectedVehicle))) selectedPreview.hidden = false;
      }
    });
  }

  function fixTankplanCalculator() {
    if (!isTankplan()) return;
    const parseOptionalNumber = (value) => {
      const text = String(value ?? "").replace(",", ".").trim();
      if (!text) return null;
      const number = Number(text);
      return Number.isFinite(number) ? number : null;
    };
    try { num = parseOptionalNumber; } catch (error) { window.num = parseOptionalNumber; }
  }

  function dataPath(date) {
    const [year, month, day] = date.split("-");
    return `data2/${year}/${month}/${day}/management_boxplots.json`;
  }

  function overall(summary, fuel) {
    return Number((summary.brand_distributions?.[fuel] || []).find((item) => item.brand === "Gesamtmarkt")?.median);
  }

  function weekday(date) {
    const parsed = parseIso(date);
    return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][parsed.getDay()];
  }

  async function repairTankplanPriceRange() {
    if (!isTankplan()) return;
    const range = recentRange();
    const summaries = [];
    if (window.location.search) history.replaceState(null, "", location.pathname);
    const statisticsNavLink = document.getElementById("statistics-nav-link");
    if (statisticsNavLink) statisticsNavLink.href = "management.html";

    await Promise.all(range.dates.map(async (date) => {
      try {
        const response = await fetch(dataPath(date), { cache: "no-store" });
        if (response.ok) summaries.push({ date, summary: await response.json() });
      } catch (error) {}
    }));
    if (summaries.length < 2) return;
    summaries.sort((a, b) => a.date.localeCompare(b.date));

    const groups = Object.fromEntries(FUELS.map((fuel) => [fuel, new Map()]));
    const dayStats = Object.fromEntries(FUELS.map((fuel) => [fuel, []]));
    summaries.forEach(({ date, summary }) => FUELS.forEach((fuel) => {
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
      const count = values.reduce((sum, item) => sum + item.count, 0);
      const averagePrice = values.reduce((sum, item) => sum + item.price * item.count, 0) / count;
      const best = values.reduce((current, item) => (item.price < current.price ? item : current));
      dayStats[fuel].push({ date, weekday: weekday(date), averagePrice, bestHour: best.hour, bestPrice: best.price, count });
    }));

    const slots = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const prices = {};
      const counts = {};
      FUELS.forEach((fuel) => {
        const bucket = groups[fuel].get(hour);
        counts[fuel] = bucket?.count || 0;
        if (bucket?.count) prices[fuel] = bucket.sum / bucket.count;
      });
      if (Object.keys(prices).length) slots.push({ hour, label: `${String(hour).padStart(2, "0")}:00`, prices, counts });
    }

    try {
      priceAnalysis = { dates: summaries.map((item) => item.date), slots, dayStats };
      if (typeof renderCharts === "function") renderCharts();
      if (typeof setStatus === "function") setStatus(`Preisanalysen f\u00fcr ${summaries.length} Tage sind geladen.`);
    } catch (error) {}
  }

  function tankplanTooltip() {
    let tooltip = document.getElementById("tankplan-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "tankplan-tooltip";
      tooltip.className = "tankplan-tooltip";
      tooltip.hidden = true;
      document.body.append(tooltip);
    }
    return tooltip;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function showTankplanTooltip(event, title, lines) {
    const tooltip = tankplanTooltip();
    tooltip.innerHTML = `<strong>${escapeHtml(title)}</strong>${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}`;
    tooltip.hidden = false;
    const margin = 16;
    const rect = tooltip.getBoundingClientRect();
    let left = event.clientX + margin;
    let top = event.clientY + margin;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - margin;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - margin;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTankplanTooltip() {
    const tooltip = document.getElementById("tankplan-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function tankplanPriceAnalysis() {
    try { return priceAnalysis || null; } catch (error) { return null; }
  }

  function tankplanActiveFuel() {
    try { return activeFuel || "e5"; } catch (error) { return "e5"; }
  }

  function fuelName(fuel) {
    return { diesel: "Diesel", e5: "Super E5", e10: "Super E10" }[fuel] || fuel;
  }

  function formatPrice(value) {
    return Number(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function chartPoint(event, svg, width, height) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height
    };
  }

  function nearestCycleSlot(event) {
    const analysis = tankplanPriceAnalysis();
    const fuel = tankplanActiveFuel();
    const svg = document.getElementById("cycle-chart");
    const slots = (analysis?.slots || []).filter((slot) => Number.isFinite(slot.prices?.[fuel]));
    if (!svg || !slots.length) return null;

    const W = 1120, H = 340, L = 82, T = 28, B = 56, R = 24;
    const PW = W - L - R, PH = H - T - B;
    const values = slots.map((slot) => slot.prices[fuel]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.01, (max - min) * 0.12);
    const lo = min - pad;
    const hi = max + pad;
    const point = chartPoint(event, svg, W, H);
    const distance = (slot) => {
      const order = slot.hour >= 12 ? slot.hour - 12 : slot.hour + 12;
      const x = L + (order / 23) * PW;
      const y = T + (1 - (slot.prices[fuel] - lo) / (hi - lo)) * PH;
      return Math.hypot(point.x - x, point.y - y);
    };
    const nearest = slots.reduce((best, slot) => {
      const d = distance(slot);
      return !best || d < best.distance ? { slot, distance: d } : best;
    }, null);
    return nearest?.distance <= 26 ? nearest.slot : null;
  }

  function nearestDaySlot(event) {
    const analysis = tankplanPriceAnalysis();
    const fuel = tankplanActiveFuel();
    const svg = document.getElementById("day-chart");
    const days = (analysis?.dayStats?.[fuel] || []).filter((day) => Number.isFinite(day.averagePrice));
    if (!svg || !days.length) return null;

    const W = 1120, H = 340, L = 82, T = 28, B = 62, R = 24;
    const PW = W - L - R, PH = H - T - B;
    const values = days.map((day) => day.averagePrice);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(0.01, (max - min) * 0.2);
    const lo = min - pad;
    const hi = max + pad;
    const point = chartPoint(event, svg, W, H);
    const distance = (day, index) => {
      const x = L + (days.length === 1 ? 0 : (index / (days.length - 1)) * PW);
      const y = T + (1 - (day.averagePrice - lo) / (hi - lo)) * PH;
      return Math.hypot(point.x - x, point.y - y);
    };
    const nearest = days.reduce((best, day, index) => {
      const d = distance(day, index);
      return !best || d < best.distance ? { day, distance: d } : best;
    }, null);
    return nearest?.distance <= 26 ? nearest.day : null;
  }

  function enhanceTankplanChartTooltips() {
    if (!isTankplan()) return;
    const cycleChart = document.getElementById("cycle-chart");
    const dayChart = document.getElementById("day-chart");
    const fuel = () => tankplanActiveFuel();

    if (cycleChart && !cycleChart.dataset.tankplanTooltip) {
      cycleChart.dataset.tankplanTooltip = "true";
      cycleChart.addEventListener("mousemove", (event) => {
        const slot = nearestCycleSlot(event);
        if (!slot) {
          hideTankplanTooltip();
          return;
        }
        const active = fuel();
        showTankplanTooltip(event, "Niedrigste Preise im 24h-Zyklus", [
          `Uhrzeit: ${String(slot.hour).padStart(2, "0")}:00 Uhr`,
          `${fuelName(active)}: ${formatPrice(slot.prices[active])} EUR/l`,
          `Messpunkte: ${Number(slot.counts?.[active] || 0).toLocaleString("de-DE")}`
        ]);
      });
      cycleChart.addEventListener("mouseleave", hideTankplanTooltip);
    }

    if (dayChart && !dayChart.dataset.tankplanTooltip) {
      dayChart.dataset.tankplanTooltip = "true";
      dayChart.addEventListener("mousemove", (event) => {
        const day = nearestDaySlot(event);
        if (!day) {
          hideTankplanTooltip();
          return;
        }
        const active = fuel();
        showTankplanTooltip(event, "G\u00fcnstige Tage im Vergleich", [
          `Tag: ${day.weekday} ${String(day.date || "").slice(8, 10)}.${String(day.date || "").slice(5, 7)}.`,
          `${fuelName(active)}: ${formatPrice(day.averagePrice)} EUR/l`,
          `G\u00fcnstigste Uhrzeit: ${String(day.bestHour).padStart(2, "0")}:00 Uhr`
        ]);
      });
      dayChart.addEventListener("mouseleave", hideTankplanTooltip);
    }
  }

  function syncTankplanNav() {
    const nav = document.querySelector(".nav-bar");
    if (!nav) return;
    const active = isTankplan();
    const existing = Array.from(nav.querySelectorAll(".nav-item")).find((item) => item.textContent.trim() === "Tankplan");
    if (existing) {
      existing.href = "tankplan.html";
      if (active) {
        existing.classList.add("active", "tankplan");
        existing.setAttribute("aria-current", "page");
      }
      return;
    }
    const statistics = Array.from(nav.querySelectorAll(".nav-item")).find((item) => item.textContent.trim() === "Statistik");
    if (!statistics) return;
    const link = document.createElement("a");
    link.href = "tankplan.html";
    link.className = `nav-item${active ? " active tankplan" : ""}`;
    if (active) link.setAttribute("aria-current", "page");
    link.innerHTML = `${iconTankplan()}<span>Tankplan</span>`;
    statistics.insertAdjacentElement("afterend", link);
  }

  function promoMarkup() {
    return `<div class="app-install-head"><div class="app-install-copy"><p class="app-install-kicker">Auch als App</p><h2>Tankzeit immer dabei</h2><p>F\u00fcr <a class="app-install-copy-link" href="${IOS_LINK}">iPhone im App Store</a> und f\u00fcr <a class="app-install-copy-link" href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}">Android bei Google Play</a>.</p></div><div class="app-install-links" aria-label="Store-Links"><a class="app-install-link" href="${IOS_LINK}" aria-label="Tankzeit im App Store \u00f6ffnen" title="Im App Store \u00f6ffnen"><img class="app-install-store-badge app-install-store-badge--apple" src="img/app-store-badge.svg" alt="Laden im App Store" width="250" height="83" decoding="async" /></a><a class="app-install-link" href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}" aria-label="Tankzeit bei Google Play \u00f6ffnen" title="Bei Google Play \u00f6ffnen"><img class="app-install-store-badge app-install-store-badge--google" src="img/google-play-badge.png" alt="Jetzt bei Google Play" width="646" height="250" decoding="async" /></a></div><button class="app-install-dismiss" type="button" aria-label="App-Hinweis ausblenden">\u00d7</button></div>`;
  }

  function buildPromo() {
    fixTankplanCalculator();
    syncTankplanNav();
    enhanceTankplanVehicleSearch();
    enhanceTankplanChartTooltips();
    window.setTimeout(async () => {
      await repairTankplanPriceRange();
      enhanceTankplanChartTooltips();
    }, 450);
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildPromo, { once: true });
  else buildPromo();
})();
