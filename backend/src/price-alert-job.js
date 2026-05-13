const webpush = require("web-push");
const { config, missingPushConfig } = require("./config");
const { fetchPrices } = require("./tankerkoenig");
const { listAlerts, removeAlert, updateAlertDelivery } = require("./store");

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function stationLabel(station) {
  return station?.name || station?.brand || "Favoritentankstelle";
}

function activeAlerts() {
  return listAlerts().filter(
    (alert) =>
      alert.enabled &&
      alert.subscription?.endpoint &&
      Number.isFinite(Number(alert.limit)) &&
      Array.isArray(alert.favorites) &&
      alert.favorites.length,
  );
}

function uniqueStationIds(alerts) {
  return [
    ...new Set(
      alerts.flatMap((alert) => alert.favorites.map((favorite) => favorite.id)).filter(Boolean),
    ),
  ];
}

async function sendPush(alert, hit) {
  const payload = JSON.stringify({
    title: `Tankzeit: ${stationLabel(hit.station)}`,
    body: `${alert.fuel.toUpperCase()} bei ${formatPrice(hit.price)} EUR/l, Limit ${formatPrice(alert.limit)} EUR/l.`,
    url: "/favoriten.html",
  });

  await webpush.sendNotification(alert.subscription, payload);
}

function findHit(alert, prices) {
  for (const station of alert.favorites) {
    const entry = prices[station.id];
    if (!entry || entry.status === "closed") continue;
    const price = Number(entry[alert.fuel]);
    if (Number.isFinite(price) && price <= Number(alert.limit)) {
      return { station, price };
    }
  }
  return null;
}

async function checkPriceAlerts() {
  if (missingPushConfig()) {
    console.warn("Skipping alert check: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.");
    return { checked: 0, sent: 0, skipped: "missing_vapid" };
  }

  const alerts = activeAlerts();
  if (!alerts.length) return { checked: 0, sent: 0 };

  const stationIds = uniqueStationIds(alerts);
  const prices = await fetchPrices(stationIds);
  const currentWindow = new Date().toISOString().slice(0, 13);
  let sent = 0;

  for (const alert of alerts) {
    const hit = findHit(alert, prices);
    if (!hit) continue;

    const sentKey = `${hit.station.id}:${alert.fuel}:${formatPrice(alert.limit)}:${currentWindow}`;
    if (alert.lastSentKey === sentKey) continue;

    try {
      await sendPush(alert, hit);
      updateAlertDelivery(alert.clientId, {
        lastSentKey: sentKey,
        lastSentAt: new Date().toISOString(),
      });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        removeAlert(alert.clientId);
        continue;
      }
      console.warn(`Push notification failed for ${alert.clientId}`, err);
    }
  }

  return { checked: alerts.length, sent };
}

function configureWebPush() {
  if (missingPushConfig()) return;
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey,
  );
}

module.exports = { checkPriceAlerts, configureWebPush };
