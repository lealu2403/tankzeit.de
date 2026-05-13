const fs = require("fs");
const path = require("path");
const { config } = require("./config");

const storePath = path.join(process.cwd(), config.dataDir, "alerts.json");

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}

function readStore() {
  ensureStoreDir();
  if (!fs.existsSync(storePath)) {
    return { alerts: [] };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return { alerts: Array.isArray(payload.alerts) ? payload.alerts : [] };
  } catch (err) {
    console.warn("Alert store could not be read, starting with an empty store", err);
    return { alerts: [] };
  }
}

function writeStore(store) {
  ensureStoreDir();
  const tmpPath = `${storePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2));
  fs.renameSync(tmpPath, storePath);
}

function listAlerts() {
  return readStore().alerts;
}

function upsertAlert(alert) {
  const store = readStore();
  const now = new Date().toISOString();
  const existingIndex = store.alerts.findIndex((item) => item.clientId === alert.clientId);
  const nextAlert = {
    ...alert,
    updatedAt: now,
    createdAt: existingIndex >= 0 ? store.alerts[existingIndex].createdAt : now,
    lastSentKey: existingIndex >= 0 ? store.alerts[existingIndex].lastSentKey || "" : "",
    lastSentAt: existingIndex >= 0 ? store.alerts[existingIndex].lastSentAt || "" : "",
  };

  if (existingIndex >= 0) {
    store.alerts[existingIndex] = nextAlert;
  } else {
    store.alerts.push(nextAlert);
  }
  writeStore(store);
  return nextAlert;
}

function removeAlert(clientId) {
  const store = readStore();
  const before = store.alerts.length;
  store.alerts = store.alerts.filter((alert) => alert.clientId !== clientId);
  writeStore(store);
  return store.alerts.length !== before;
}

function updateAlertDelivery(clientId, delivery) {
  const store = readStore();
  const index = store.alerts.findIndex((alert) => alert.clientId === clientId);
  if (index < 0) return null;
  store.alerts[index] = {
    ...store.alerts[index],
    ...delivery,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.alerts[index];
}

module.exports = {
  listAlerts,
  removeAlert,
  upsertAlert,
  updateAlertDelivery,
};
