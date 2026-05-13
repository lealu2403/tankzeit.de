require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || "data",
  tankerkoenigApiKey: process.env.TANKERKOENIG_API_KEY || "",
  checkSchedule: process.env.CHECK_SCHEDULE || "*/30 * * * *",
  checkOnStart: process.env.CHECK_ON_START === "true",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "https://lealu2403.github.io,https://tankzeit.de")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    subject: process.env.VAPID_SUBJECT || "mailto:admin@tankzeit.de",
  },
};

function missingPushConfig() {
  return !config.vapid.publicKey || !config.vapid.privateKey;
}

module.exports = { config, missingPushConfig };
