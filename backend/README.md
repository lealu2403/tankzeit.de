# Tankzeit Price Alert Backend

Dieses Backend speichert Preislimit-Einstellungen und prüft alle 30 Minuten die Livepreise der gespeicherten Favoriten. Wenn der aktuelle Preis kleiner oder gleich dem Limit ist, sendet es eine Web-Push-Benachrichtigung.

## Start lokal

```bash
cd backend
npm install
npm run generate-vapid-keys
cp .env.example .env
npm start
```

Trage in `.env` ein:

- `TANKERKOENIG_API_KEY`: API-Key fuer Livepreise
- `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY`: Ausgabe von `npm run generate-vapid-keys`
- `VAPID_SUBJECT`: Kontakt, z. B. `mailto:deine-mail@example.com`

## 30-Minuten-Pruefung

Das Intervall steht in `CHECK_SCHEDULE`:

```text
*/30 * * * *
```

Das bedeutet: alle 30 Minuten. Dabei wird nichts neu angelegt oder geloescht. Das Backend liest nur gespeicherte Alerts, ruft Preise ab und sendet bei Treffer eine Push-Nachricht.

## API

### `GET /health`

Prueft, ob das Backend laeuft.

### `GET /api/push/public-key`

Gibt den VAPID Public Key fuer den Browser zurueck.

### `POST /api/alerts`

Speichert oder aktualisiert einen Alert.

```json
{
  "clientId": "browser-id",
  "enabled": true,
  "fuel": "e10",
  "limit": 1.699,
  "favorites": [
    { "id": "station-id", "name": "Access", "brand": "Access", "lat": "...", "lng": "..." }
  ],
  "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
}
```

### `DELETE /api/alerts/:clientId`

Loescht den Alert fuer dieses Browser-Geraet.

## Deployment

Das Backend ist getrennt von GitHub Pages. Es kann z. B. auf Render, Railway, Fly.io oder einem kleinen VPS laufen. Wichtig ist, dass der Ordner `DATA_DIR` dauerhaft gespeichert wird, sonst gehen die gespeicherten Alerts beim Neustart verloren.

Nach dem Deployment muss die Webseite die Backend-URL kennen. Dafuer wird im Browser spaeter `localStorage.tankzeit_alert_backend_url` oder eine globale Konfiguration gesetzt.
