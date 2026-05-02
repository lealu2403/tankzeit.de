(function () {
  const PROMO_ID = "app-install-promo";
  const ANDROID_WEB_LINK =
    "https://play.google.com/store/apps/details?id=de.tankzeit.android";
  const ANDROID_STORE_LINK = "market://details?id=de.tankzeit.android";
  const IOS_LINK = "https://apps.apple.com/de/app/tankzeit/id6759522835";

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
    const params = new URLSearchParams(window.location.search);
    let start = params.get("start");
    let end = params.get("end") || start;

    if (!start && !end) {
      start = "2026-04-18";
      end = "2026-05-01";
    }

    let dates = datesBetween(start, end);
    if (dates.length < 2) {
      const endDate = parseIsoDate(end || start) || parseIsoDate("2026-05-01");
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 13);
      start = formatIsoDate(startDate);
      end = formatIsoDate(endDate);
      dates = datesBetween(start, end);
    }

    return {
      start,
      end,
      dates,
      search: `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    };
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

  function dataPath(date) {
    const [year, month, day] = date.split("-");
    return `data2/${year}/${month}/${day}/management_boxplots.json`;
  }

  function overall(summary, fuel) {
    return Number(
      (summary.brand_distributions?.[fuel] || []).find(
        (item) => item.brand === "Gesamtmarkt",
      )?.median,
    );
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

    if (window.location.search !== range.search) {
      history.replaceState(null, "", `${location.pathname}${range.search}`);
    }

    const statisticsNavLink = document.getElementById("statistics-nav-link");
    if (statisticsNavLink) statisticsNavLink.href = `management.html${range.search}`;

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
        dayStats[fuel].push({
          date,
          weekday: weekdayFromIso(date),
          averagePrice,
          bestHour: best.hour,
          bestPrice: best.price,
          count: totalCount,
        });
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
        slots.push({
          hour,
          label: `${String(hour).padStart(2, "0")}:00`,
          prices,
          counts,
        });
      }
    }

    try {
      priceAnalysis = { dates: summaries.map((item) => item.date), slots, dayStats };
      if (typeof renderCharts === "function") renderCharts();
      if (typeof setStatus === "function") {
        setStatus(`Preisanalysen für ${summaries.length} Tage sind geladen.`);
      }
    } catch (error) {
      // The Tankplan page owns the chart state; if it is not present, do nothing.
    }
  }

  function syncTankplanNav() {
    const nav = document.querySelector(".nav-bar");
    if (!nav) return;

    const isTankplan = location.pathname.endsWith("/tankplan.html");
    const range = tankplanSearch();
    const existingTankplanLink = Array.from(nav.querySelectorAll(".nav-item")).find(
      (item) => item.textContent.trim() === "Tankplan",
    );

    if (existingTankplanLink) {
      existingTankplanLink.id ||= "tankplan-nav-link";
      existingTankplanLink.href = `tankplan.html${range.search}`;
      if (isTankplan) {
        existingTankplanLink.classList.add("active", "tankplan");
        existingTankplanLink.setAttribute("aria-current", "page");
      }
      return;
    }

    const statisticsLink = Array.from(nav.querySelectorAll(".nav-item")).find(
      (item) => item.textContent.trim() === "Statistik",
    );
    if (!statisticsLink) return;

    const link = document.createElement("a");
    link.id = "tankplan-nav-link";
    link.href = `tankplan.html${range.search}`;
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
            <a
              class="app-install-copy-link"
              href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}"
              >Android bei Google Play</a
            >.
          </p>
        </div>
        <div class="app-install-links" aria-label="Store-Links">
          <a
            class="app-install-link"
            href="${IOS_LINK}"
            aria-label="Tankzeit im App Store öffnen"
            title="Im App Store öffnen"
          >
            <img
              class="app-install-store-badge app-install-store-badge--apple"
              src="img/app-store-badge.svg"
              alt="Laden im App Store"
              width="250"
              height="83"
              decoding="async"
            />
          </a>
          <a
            class="app-install-link"
            href="${isAndroid() ? ANDROID_STORE_LINK : ANDROID_WEB_LINK}"
            aria-label="Tankzeit bei Google Play öffnen"
            title="Bei Google Play öffnen"
          >
            <img
              class="app-install-store-badge app-install-store-badge--google"
              src="img/google-play-badge.png"
              alt="Jetzt bei Google Play"
              width="646"
              height="250"
              decoding="async"
            />
          </a>
        </div>
        <button
          class="app-install-dismiss"
          type="button"
          aria-label="App-Hinweis ausblenden"
        >
          ×
        </button>
      </div>
    `;
  }

  function buildPromo() {
    fixTankplanCalculator();
    syncTankplanNav();
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

    promo
      .querySelector(".app-install-dismiss")
      ?.addEventListener("click", dismissPromo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPromo, { once: true });
  }
  buildPromo();
})();
