const FUELS = new Set(["e10", "diesel"]);

function parseLimit(value) {
  const numeric = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeFavorite(favorite) {
  if (!favorite || typeof favorite !== "object" || !favorite.id) return null;
  return {
    id: String(favorite.id),
    name: String(favorite.name || favorite.brand || "Tankstelle"),
    brand: String(favorite.brand || ""),
    lat: favorite.lat == null ? "" : String(favorite.lat),
    lng: favorite.lng == null ? "" : String(favorite.lng),
  };
}

function validateAlertPayload(payload) {
  const clientId = String(payload?.clientId || "").trim();
  if (!clientId) return { error: "clientId is required" };

  const fuel = String(payload?.fuel || "e10").toLowerCase();
  if (!FUELS.has(fuel)) return { error: "fuel must be e10 or diesel" };

  const limit = parseLimit(payload?.limit);
  const enabled = Boolean(payload?.enabled);
  if (enabled && limit === null) return { error: "limit is required when alert is enabled" };

  const favorites = Array.isArray(payload?.favorites)
    ? payload.favorites.map(normalizeFavorite).filter(Boolean)
    : [];
  if (enabled && !favorites.length) return { error: "at least one favorite is required" };

  const subscription = payload?.subscription;
  if (enabled && (!subscription || typeof subscription !== "object" || !subscription.endpoint)) {
    return { error: "push subscription is required when alert is enabled" };
  }

  return {
    alert: {
      clientId,
      enabled,
      fuel,
      limit,
      favorites,
      subscription: subscription || null,
    },
  };
}

module.exports = { validateAlertPayload };
