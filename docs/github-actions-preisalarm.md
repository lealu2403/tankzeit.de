# GitHub-Actions-Preisalarm

Diese Variante ist fuer eine kleine Testgruppe gedacht. Die Webseite bleibt auf GitHub Pages, und GitHub Actions prueft alle 30 Minuten die Preise.

## Ablauf fuer Nutzer

1. Favoriten in der Webseite speichern.
2. Auf `Favoriten` ein Preislimit setzen und `Meldung` aktivieren.
3. Browser-Benachrichtigungen erlauben.
4. Die geoeffnete GitHub-Registrierung als Issue erstellen.
5. Das Issue offen lassen. Wenn der Alarm nicht mehr gebraucht wird, das Issue schliessen.

Danach muss die Webseite nicht offen bleiben. Die Action liest offene Issues mit dem Titel `[Tankzeit Preisalarm]` und sendet Push-Nachrichten, wenn der Preis unter dem Limit liegt.

## Einmalige Repo-Einstellung

Damit die Action Push senden kann, muss im Repository unter `Settings -> Secrets and variables -> Actions -> New repository secret` dieses Secret gesetzt werden:

- `VAPID_PRIVATE_KEY`

Der Public Key ist bereits in `alert-backend-config.js` und im Workflow eingetragen. Der passende Private Key darf nicht in den normalen Quellcode committed werden.

Optional kann auch dieses Secret gesetzt werden:

- `TANKERKOENIG_API_KEY`

Wenn es fehlt, nutzt die Action den bereits im Projekt vorhandenen Tankerkoenig-Key.

## Zeitplan

Die Action liegt in `.github/workflows/tankzeit-price-alerts.yml` und laeuft mit:

```yaml
cron: "*/30 * * * *"
```

Also ungefaehr alle 30 Minuten. GitHub kann geplante Workflows manchmal ein paar Minuten spaeter starten.
