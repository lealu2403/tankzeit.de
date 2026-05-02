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

  function syncTankplanNav() {
    const nav = document.querySelector(".nav-bar");
    if (!nav) return;

    const isTankplan = location.pathname.endsWith("/tankplan.html");
    const existingTankplanLink = Array.from(nav.querySelectorAll(".nav-item")).find(
      (item) => item.textContent.trim() === "Tankplan",
    );

    if (existingTankplanLink) {
      existingTankplanLink.id ||= "tankplan-nav-link";
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
    link.href = `tankplan.html${window.location.search || ""}`;
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
