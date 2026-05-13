const cors = require("cors");
const cron = require("node-cron");
const express = require("express");
const { config, missingPushConfig } = require("./config");
const { checkPriceAlerts, configureWebPush } = require("./price-alert-job");
const { removeAlert, upsertAlert } = require("./store");
const { validateAlertPayload } = require("./validation");

configureWebPush();

const app = express();

app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"));
    },
  }),
);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    schedule: config.checkSchedule,
    pushConfigured: !missingPushConfig(),
  });
});

app.get("/api/push/public-key", (req, res) => {
  if (!config.vapid.publicKey) {
    res.status(503).json({ error: "VAPID public key is not configured" });
    return;
  }
  res.json({ publicKey: config.vapid.publicKey });
});

app.post("/api/alerts", (req, res) => {
  const result = validateAlertPayload(req.body);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }

  const alert = upsertAlert(result.alert);
  res.json({ ok: true, alert: { ...alert, subscription: undefined } });
});

app.delete("/api/alerts/:clientId", (req, res) => {
  removeAlert(req.params.clientId);
  res.json({ ok: true });
});

app.post("/api/alerts/check-now", async (req, res) => {
  try {
    const result = await checkPriceAlerts();
    res.json({ ok: true, result });
  } catch (err) {
    console.error("Manual alert check failed", err);
    res.status(500).json({ error: "alert check failed" });
  }
});

cron.schedule(config.checkSchedule, async () => {
  try {
    const result = await checkPriceAlerts();
    console.log("Scheduled alert check finished", result);
  } catch (err) {
    console.error("Scheduled alert check failed", err);
  }
});

if (config.checkOnStart) {
  checkPriceAlerts()
    .then((result) => console.log("Startup alert check finished", result))
    .catch((err) => console.error("Startup alert check failed", err));
}

app.listen(config.port, () => {
  console.log(`Tankzeit price alert backend listening on port ${config.port}`);
  console.log(`Alert schedule: ${config.checkSchedule}`);
});
