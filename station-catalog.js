(function () {
  const STATIONS_URL = "data/stations.json";
  const DISTANCE_COLUMN_LABEL = "Distanz";
  const DISTANCE_LOCATION_OPTIONS = {
    enableHighAccuracy: false,
    maximumAge: 300000,
    timeout: 25000,
  };
  let stationCatalogPromise = null;
  let distanceCenter = null;
  let distanceRequestStarted = false;
  let distanceColumnObserver = null;

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function haversineDistanceKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const toRadians = (value) => (value * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function formatDistanceKm(value) {
    const distance = toFiniteNumber(value);
    if (distance === null) return "-";
    const digits = distance < 10 ? 1 : 0;
    return `${new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(distance)} km`;
  }

  function stationTableBody() {
    return document.getElementById("stations");
  }

  function ensureDistanceHeader(table) {
    const headerRow = table?.querySelector("thead tr");
    if (!headerRow) return;

    const hasDistanceHeader = Array.from(headerRow.children).some(
      (cell) =>
        cell.dataset.distanceColumn === "true" ||
        cell.textContent.trim() === DISTANCE_COLUMN_LABEL,
    );
    if (hasDistanceHeader) return;

    const header = document.createElement("th");
    header.dataset.distanceColumn = "true";
    header.textContent = DISTANCE_COLUMN_LABEL;

    const nameHeader = headerRow.querySelector("th");
    if (nameHeader) {
      nameHeader.after(header);
      return;
    }
    headerRow.prepend(header);
  }

  function expandStatusRow(row, table) {
    if (row.children.length !== 1) return false;

    const cell = row.querySelector("td[colspan]");
    if (!cell) return false;

    const columnCount = table?.querySelectorAll("thead th").length || 6;
    cell.setAttribute("colspan", String(Math.max(columnCount, 6)));
    return true;
  }

  function stationCoordinatesFromRow(row) {
    const link = row.querySelector('td[data-label="Name"] a[href*="query="]');
    if (!link) return null;

    try {
      const url = new URL(link.getAttribute("href"), window.location.href);
      const [latValue, lngValue] = (url.searchParams.get("query") || "").split(
        ",",
      );
      const lat = toFiniteNumber(latValue);
      const lng = toFiniteNumber(lngValue);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch (err) {
      return null;
    }
  }

  function ensureDistanceCell(row) {
    let distanceCell = row.querySelector("td[data-distance-column]");
    if (distanceCell) return distanceCell;

    const nameCell = row.querySelector('td[data-label="Name"]');
    if (!nameCell) return null;

    distanceCell = document.createElement("td");
    distanceCell.className = "station-distance";
    distanceCell.dataset.distanceColumn = "true";
    distanceCell.dataset.label = DISTANCE_COLUMN_LABEL;
    distanceCell.textContent = "-";
    nameCell.after(distanceCell);
    return distanceCell;
  }

  function updateDistanceCell(row) {
    const distanceCell = ensureDistanceCell(row);
    if (!distanceCell) return;

    const stationCoordinates = stationCoordinatesFromRow(row);
    if (!stationCoordinates || !distanceCenter) {
      distanceCell.textContent = "-";
      return;
    }

    distanceCell.textContent = formatDistanceKm(
      haversineDistanceKm(
        distanceCenter.lat,
        distanceCenter.lng,
        stationCoordinates.lat,
        stationCoordinates.lng,
      ),
    );
  }

  function requestDistanceCenter() {
    if (
      distanceRequestStarted ||
      distanceCenter ||
      !navigator.geolocation ||
      !stationTableBody()?.querySelector('td[data-label="Name"]')
    ) {
      return;
    }

    distanceRequestStarted = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        distanceCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        updateDistanceColumn();
      },
      () => {
        distanceRequestStarted = false;
      },
      DISTANCE_LOCATION_OPTIONS,
    );
  }

  function updateDistanceColumn() {
    const tbody = stationTableBody();
    if (!tbody) return;

    const table = tbody.closest("table");
    ensureDistanceHeader(table);
    tbody.querySelectorAll("tr").forEach((row) => {
      if (!expandStatusRow(row, table)) {
        updateDistanceCell(row);
      }
    });
    requestDistanceCenter();
  }

  function installDistanceColumn() {
    const tbody = stationTableBody();
    if (!tbody) return;

    updateDistanceColumn();
    if (distanceColumnObserver || !("MutationObserver" in window)) return;

    distanceColumnObserver = new MutationObserver(updateDistanceColumn);
    distanceColumnObserver.observe(tbody, { childList: true });
  }

  async function loadCatalog() {
    if (!stationCatalogPromise) {
      stationCatalogPromise = fetch(STATIONS_URL).then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
      });
    }
    return stationCatalogPromise;
  }

  function findNearbyStations(stations, lat, lng, options = {}) {
    const limit = Number.isFinite(options.limit) ? options.limit : 10;
    const radiusKm = Number.isFinite(options.radiusKm) ? options.radiusKm : 10;

    return (stations || [])
      .map((station) => {
        const stationLat = toFiniteNumber(station.latitude);
        const stationLng = toFiniteNumber(station.longitude);
        if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) {
          return null;
        }

        return {
          id: station.uuid,
          name: station.name || station.brand || "Tankstelle",
          brand: station.brand || "",
          lat: stationLat,
          lng: stationLng,
          dist: haversineDistanceKm(lat, lng, stationLat, stationLng),
        };
      })
      .filter(Boolean)
      .filter((station) => station.dist <= radiusKm)
      .sort((left, right) => {
        if (left.dist !== right.dist) return left.dist - right.dist;
        return `${left.name} ${left.brand}`.localeCompare(
          `${right.name} ${right.brand}`,
          "de",
          { sensitivity: "base" },
        );
      })
      .slice(0, limit);
  }

  window.TankzeitStationCatalog = {
    findNearbyStations,
    formatDistanceKm,
    loadCatalog,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installDistanceColumn, {
      once: true,
    });
  } else {
    installDistanceColumn();
  }
})();
