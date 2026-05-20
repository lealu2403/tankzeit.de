const webpush = require("web-push");

const REPO = process.env.GITHUB_REPOSITORY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TANKERKOENIG_API_KEY =
  process.env.TANKERKOENIG_API_KEY || "fe8673d1-47be-1156-77e4-040e06cb785c";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:tankzeit@example.com";
const ISSUE_TITLE_PREFIX = "[Tankzeit Preisalarm]";
const JSON_BLOCK = /```json tankzeit-price-alert\s*([\s\S]*?)```/;

function requireEnv() {
  const missing = [];
  if (!REPO) missing.push("GITHUB_REPOSITORY");
  if (!GITHUB_TOKEN) missing.push("GITHUB_TOKEN");
  if (!VAPID_PUBLIC_KEY) missing.push("VAPID_PUBLIC_KEY");
  if (!VAPID_PRIVATE_KEY) missing.push("VAPID_PRIVATE_KEY");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function parseAlert(issue) {
  const match = String(issue.body || "").match(JSON_BLOCK);
  if (!match) return null;

  try {
    const alert = JSON.parse(match[1]);
    if (!alert.enabled) return null;
    if (!alert.clientId || !alert.subscription?.endpoint) return null;
    if (!["e10", "diesel"].includes(alert.fuel)) return null;
    if (!Number.isFinite(Number(alert.limit))) return null;
    if (!Array.isArray(alert.favorites) || !alert.favorites.length) return null;
    return { ...alert, issueNumber: issue.number, issueBody: issue.body };
  } catch (error) {
    console.warn(`Issue #${issue.number} could not be parsed`, error);
    return null;
  }
}

async function listAlertIssues() {
  const issues = await github(
    `/repos/${REPO}/issues?state=open&per_page=100&sort=created&direction=desc`,
  );

  const latestByClient = new Map();
  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (!String(issue.title || "").startsWith(ISSUE_TITLE_PREFIX)) continue;
    const alert = parseAlert(issue);
    if (!alert || latestByClient.has(alert.clientId)) continue;
    latestByClient.set(alert.clientId, alert);
  }
  return [...latestByClient.values()];
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchPrices(stationIds) {
  const result = {};
  for (const group of chunk([...new Set(stationIds)].filter(Boolean), 100)) {
    if (!group.length) continue;
    const url = new URL("https://creativecommons.tankerkoenig.de/json/prices.php");
    url.searchParams.set("ids", group.join(","));
    url.searchParams.set("apikey", TANKERKOENIG_API_KEY);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Tankerkönig API ${response.status}`);
    const payload = await response.json();
    if (payload.ok === false) throw new Error(payload.message || "Tankerkönig API error");
    Object.assign(result, payload.prices || {});
  }
  return result;
}

function formatPrice(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function stationLabel(station) {
  return station?.name || station?.brand || "Favoritentankstelle";
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

async function updateAlertInIssue(alert, updates) {
  const nextAlert = { ...alert, ...updates };
  delete nextAlert.issueNumber;
  delete nextAlert.issueBody;

  const nextBody = alert.issueBody.replace(
    JSON_BLOCK,
    `\`\`\`json tankzeit-price-alert\n${JSON.stringify(nextAlert, null, 2)}\n\`\`\``,
  );

  await github(`/repos/${REPO}/issues/${alert.issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ body: nextBody }),
  });
}

async function closeExpiredSubscription(alert) {
  await github(`/repos/${REPO}/issues/${alert.issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({
      state: "closed",
      body: `${alert.issueBody}\n\nAutomatisch geschlossen: Die Browser-Push-Subscription ist nicht mehr gueltig.`,
    }),
  });
}

async function sendPush(alert, hit) {
  const payload = JSON.stringify({
    title: `Tankzeit: ${stationLabel(hit.station)}`,
    body: `${alert.fuel.toUpperCase()} bei ${formatPrice(hit.price)} EUR/l, Limit ${formatPrice(alert.limit)} EUR/l.`,
    url: "favoriten.html",
  });

  await webpush.sendNotification(alert.subscription, payload);
}

async function run() {
  requireEnv();
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const alerts = await listAlertIssues();
  if (!alerts.length) {
    console.log("No active Tankzeit price alert issues found.");
    return;
  }

  const stationIds = alerts.flatMap((alert) => alert.favorites.map((station) => station.id));
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
      await updateAlertInIssue(alert, {
        lastSentKey: sentKey,
        lastSentAt: new Date().toISOString(),
      });
      sent += 1;
      console.log(`Sent alert for issue #${alert.issueNumber}: ${stationLabel(hit.station)}`);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await closeExpiredSubscription(alert);
        continue;
      }
      console.warn(`Could not send alert for issue #${alert.issueNumber}`, error);
    }
  }

  console.log(`Checked ${alerts.length} alert(s), sent ${sent} notification(s).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
