const { config } = require("./config");

const PRICE_ENDPOINT = "https://creativecommons.tankerkoenig.de/json/prices.php";
const MAX_IDS_PER_REQUEST = 100;

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchPriceChunk(ids) {
  const url = new URL(PRICE_ENDPOINT);
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("apikey", config.tankerkoenigApiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Tankerkoenig request failed: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || payload.ok === false) {
    throw new Error(payload?.message || "Tankerkoenig returned an error");
  }
  return payload.prices || {};
}

async function fetchPrices(stationIds) {
  if (!config.tankerkoenigApiKey) {
    throw new Error("TANKERKOENIG_API_KEY is missing");
  }

  const uniqueIds = [...new Set(stationIds.filter(Boolean))];
  const result = {};
  for (const ids of chunk(uniqueIds, MAX_IDS_PER_REQUEST)) {
    Object.assign(result, await fetchPriceChunk(ids));
  }
  return result;
}

module.exports = { fetchPrices };
