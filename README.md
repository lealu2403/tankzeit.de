# [Untertägige Preisveränderungen für Treibstoffe](https://tankzeit.de) - test

[Finden Sie die beste Zeit zum Tanken](https://tankzeit.de)

Dieses Repository beobachtet die Preisveränderungen innerhalb eines Tages für Diesel, E10 und E5 an allen deutschen Tankstellen.

Datenquelle: MTS-K via [Tankerkönig](https://www.tankerkoenig.de/).

![Marktübersicht](img/marketview.png)

Die berechneten Preisunterschiede und stündlichen Mittelwerte der Preise für *jede Tankstelle* werden per GitHub Actions erzeugt und in diesem Repository gespeichert.

## Datenpipeline (Python)

Die tägliche Aktualisierung läuft via GitHub Actions und schreibt die Ergebnisse in dieses Repository.

Erforderlich:
- GitHub Secrets `TK_USER` und `TK_PASS` (Zugang zum Tankerkönig Data Repository)

Abbildung der MTS-K Tankstellen ID auf Ordnerstrukur aus

Beispiel OMV Bad Herrenalb (ID b4ed695f-2cfc-4688-8ecf-268b10cdb93e)

wird

[/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/tree/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/) 

mit Daten der jeweiligen Tankstelle


* [Diesel](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/diesel.csv)
* [E10](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/e10.csv)
* [E5](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/e5.csv)

In jedem Ordner finden sich auch JSON Dateien für 

* [Diesel](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/diesel.json)
* [E10](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/e10.json)
* [E5](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data2/b4ed695f/2cfc/4688/8ecf/268b10cdb93e/e5.json)
CSV und JSON sind inhaltlich gleich, aber unterschiedlich formatiert.

Jeweils gleichartiger Aufbau dieser Dateien für alle Tankstellen

* 2 Spalten: Uhrzeit, Preisdifferenz in Euro
* 25 Zeilen, Header, dann Stunde, Preisdifferenz

Die Dateien `diesel.csv`, `e10.csv` und `e5.csv` bleiben die untertägigen Preisdifferenzen.

Für die Mittags-Historie seit dem 1. April 2026 gibt es zusätzlich pro Tankstelle und Kraftstoff:

* `data2/<station>/<fuel>/history.csv`

Aufbau von `history.csv`:

* 3 Spalten: `date`, `price`, `last_update`
* eine Zeile pro lokalem Tag mit dem in `noon.csv` etablierten Mittagspreis

## Website Build

SEO-Landingpages pro Tankstelle sowie `sitemap.xml` werden mit folgendem Skript erzeugt:

```bash
python scripts/build_site.py
```

Das Skript aktualisiert:

- `station/*.html`
- `sitemap.xml`
- `robots.txt`

## Android Play Store Assets

Metadaten und Basisgrafiken für den bestehenden Google-Play-Draft lassen sich so erzeugen:

```bash
python scripts/generate_android_play_store_assets.py
```

# Frequently Asked Questions (FAQ)

## Wozu? Weshalb? Warum?

Wer sparen will tankt zum richtigen Zeitpunkt. Siehe [Untertägige Preisveränderungen für Treibstoffe](https://tankzeit.de).

## Wie funktioniert das ?

Tankstellen sind gesetzlich verpflichtet ihre Preise an das Bundeskartellamt zu melden. Dieses Amt publiziert den Datensatz MTS-K auf umständlicher Weise. Tankerkönig veröffentlicht und archiviert diese Preise. Die Preise des letzten Tages werden von uns aufbereitet, um die Preisveränderungen nach Stunde darzustellen. Das macht das Script `scripts/generate_data.py`, welches Sie mit Python auf einem System Ihrer Wahl selbst ausführen und den eigenen Bedürfnissen anpassen können.

## Wer hat das gemacht ?

Bei Fragen kontaktieren Sie bitte Raphael Volz (raphael.volz@hs-pforzheim.de). Alle Anregungen sind willkommen.

## Welche Tankstellen gibt es denn in Deutschland und was ist deren MTS-K ID ?

[Eine Liste der Tankstellen und deren ID im Format JSON finden Sie hier](https://huggingface.co/datasets/loffenauer/fuel-prices-germany/resolve/main/data/stations.json), diese Liste entspricht meist der letzten [CSV Datei, die Tankerkönig in ihrem Repository publizieren](https://dev.azure.com/tankerkoenig/_git/tankerkoenig-data). [Sie können die Tankstellen auch alle auf einer Karte betrachten (ACHTUNG: Rechner wird schwitzen...)](https://rpubs.com/loffenauer/mts-k)




# Neue Funktionen und Prognosemodell

Dieser Abschnitt beschreibt die neuen Auswertungsfunktionen, die Stationsdetailseite und die Logik hinter der Preisprognose.

## Zeitraum auswählen

In der Statistikansicht kann nicht mehr nur ein einzelner Tag betrachtet werden. Über die Funktion **„Zeitraum wählen“** lassen sich ein Start- und Enddatum auswählen. Die Charts werden dann über alle verfügbaren Tage in diesem Zeitraum berechnet.

Die Auswertung arbeitet weiterhin im **12:00-Uhr-bis-12:00-Uhr-Zyklus**. Das bedeutet: Ein Auswertungstag startet um 12:00 Uhr und läuft bis 12:00 Uhr des Folgetages. Bei mehreren Tagen werden die Tagesprofile aneinandergehängt bzw. aggregiert, sodass typische Preisbewegungen über den gewählten Zeitraum sichtbar werden.

Je nach Chart unterscheidet sich die Aggregation:

- Die Preisänderung zur 12:00-Uhr-Referenz nutzt die Stundenwerte aller ausgewählten Tage.
- Der Durchschnittspreis-Chart bildet aus den verfügbaren Tagesdaten ein Preisniveau je Stunde.
- Die Marken- und Referenzpreis-Auswertungen verwenden die im Zeitraum vorhandenen Noon- bzw. Tagesdaten.
- Fehlen für einzelne Tage Daten, werden nur die verfügbaren Tage berücksichtigt.

Dadurch lassen sich einzelne Tage, kurze Phasen oder längere Marktzeiträume miteinander vergleichen.

## Stationsdetailseite

Wenn eine Tankstelle ausgewählt wird, öffnet sich eine eigene Detailseite für diese Station. Diese Seite zeigt stationsbezogene Daten statt nur aggregierter Marktwerte.

Die Seite enthält:

- Name der Tankstelle
- Kraftstoffart
- Link zu Google Maps, sofern Koordinaten vorhanden sind
- Zeitraum-Auswahl
- Preisniveau im 12:00-Uhr-bis-12:00-Uhr-Zyklus
- stationsbezogene Prognose

Die Datenbasis kommt aus dem jeweiligen Stationsordner unter `data2/<station-id>/`. Für die historische 12:00-Uhr-Basis wird pro Kraftstoff `history.csv` verwendet. Diese Datei enthält pro Tag den etablierten 12:00-Uhr-Referenzpreis der Tankstelle.

Der Preisniveau-Chart rekonstruiert daraus den erwarteten Preisverlauf eines 12:00-Uhr-bis-12:00-Uhr-Zyklus. Wenn eine vollständige Tageshistorie vorhanden ist, wird der reale 12:00-Uhr-Referenzpreis je Tag verwendet. Falls für eine Station noch keine vollständige Historie vorhanden ist, nutzt die Seite als Fallback das verfügbare Stundenprofil der Station.

Die Stationsdetailseite verbindet damit die allgemeine Marktstatistik mit der konkreten Tankstelle, die ein Nutzer tatsächlich anfährt.

## Prognosefunktion

Die Preisprognose besteht aus mehreren Bausteinen. Es gibt eine allgemeine Marktprognose und eine stationsbezogene Prognose. Beide nutzen historische Preisbewegungen, unterscheiden sich aber in Datenbasis und Kalibrierung.

### Allgemeine Marktprognose

Die allgemeine Prognose auf der Seite `preisprognose.html` betrachtet den Gesamtmarkt für den ausgewählten Kraftstoff.

Die Berechnung läuft vereinfacht so:

- Es werden historische Tageszusammenfassungen ab dem Prognose-Startdatum geladen.
- Für jeden Tag werden die stündlichen Preisänderungen im 12:00-Uhr-bis-12:00-Uhr-Zyklus betrachtet.
- Als Basispreis dient der letzte verfügbare Gesamtmarktwert, also der aktuelle Markt-Durchschnitt bzw. Markt-Median.
- Für jede Stunde wird die typische historische Preisänderung berechnet.
- Diese typische Änderung wird auf den aktuellen Basispreis addiert.
- Daraus entsteht ein erwarteter Preisverlauf für den nächsten 12:00-Uhr-bis-12:00-Uhr-Zyklus.

Die Prognose verwendet gewichtete Median- und Quartilswerte. Dadurch wird sie robuster gegen einzelne extreme Preisbewegungen. Der Bereich zwischen unterem und oberem Quartil beschreibt die typische Streuung der historischen Daten.

Die historischen Tage werden nach Aktualität gewichtet. Neuere Tage zählen stärker, ältere Tage bleiben aber weiterhin im Modell enthalten.

- Gewichtung: `0,35 + 0,65 * exp(-Alter_in_Tagen / 7)`
- Letzter verfügbarer Tag: Gewicht ca. `1,00`
- 7 Tage alt: Gewicht ca. `0,59`
- 14 Tage alt: Gewicht ca. `0,44`
- 30 Tage alt: Gewicht ca. `0,36`

So reagiert die Prognose stärker auf aktuelle Marktphasen, verliert aber nicht das langfristige Tagesmuster.

### Stationsbezogene Prognose

Die Prognose auf der Stationsdetailseite bezieht sich auf eine einzelne Tankstelle.

Die Berechnung nutzt:

- die 12:00-Uhr-Historie der Station aus `history.csv`
- das historische Stundenprofil der Station
- optional Markendaten aus der allgemeinen Statistik
- den gewählten Zeitraum

Die Logik:

- Für die Station werden die verfügbaren 12:00-Uhr-Referenzpreise geladen.
- Aus dem ausgewählten Zeitraum werden gültige historische Tage bestimmt.
- Für diese Tage wird das stationsbezogene Stundenprofil angewendet.
- Die historischen Tage werden mit derselben Aktualitätsformel gewichtet: `0,35 + 0,65 * exp(-Alter_in_Tagen / 7)`.
- Die stündlichen Werte werden als gewichteter Median sowie gewichtetes unteres und oberes Quartil berechnet.
- Die Prognose wird auf den letzten verfügbaren 12:00-Uhr-Preis der Station kalibriert.
- Die Kurve wird regelkonform geglättet, damit unrealistische Sprünge vermieden werden.

So bleibt das historische Muster der Station erhalten, aber die Prognose startet nicht auf einem veralteten Preisniveau.

### Marken-, Preisführer- und Follower-Logik

Die Stationsprognose kann zusätzlich die Marktposition der Marke einbeziehen. Dabei wird geprüft, wie die Marke der Station im Vergleich zum Gesamtmarkt liegt und ob sie sich eher wie eine Hochpreis- oder Niedrigpreisgruppe verhält.

- **High** = Median der 3 teuersten Marken-Mediane
- **Low** = Median der 3 günstigsten Marken-Mediane
- Wenn sich der Gesamtmarkt stark bewegt, also mindestens um `0,03 EUR/l`, wird geprüft, ob die Marke eher wie High oder Low läuft.
- Diese Orientierung fließt mit dem Faktor `0,08` in die Prognose ein.
- Die komplette Markenkorrektur ist auf `±0,025 EUR/l` gedeckelt.

Die Preiszonen sind aktuell keine geografischen Zonen, sondern relative Marken-Preisgruppen aus den Tages-Medianen.

Zusätzlich gibt es eine Leader/Follower-Analyse als Erweiterungsbaustein. Sie untersucht, ob eine Tankstelle bei Preisänderungen häufig zuerst reagiert oder ob sie eher anderen Stationen folgt.

- Ein **Preisführer** setzt Preisänderungen häufig früher als nahegelegene Stationen.
- Ein **Follower** übernimmt Preisänderungen häufiger nach anderen Stationen.
- Bewertet werden Nähe, Richtung der Preisänderung, Häufigkeit, Reaktionszeit und Asymmetrie.
- Daraus entsteht ein Leader-Score bzw. eine Netto-Rolle der Station.

Die Leader/Follower-Analyse beschreibt wiederkehrende zeitliche Muster, ist aber kein kausaler Beweis. Gemeinsame Kostenimpulse, Markenstrategie oder regionale Marktbedingungen können ähnliche Muster erzeugen.

### Brent-Funktion

Zusätzlich zur eigentlichen Preisprognose wird der Brent-Ölpreis als Marktsignal angezeigt.

Die Brent-Daten werden aus `data/brent.json` bzw. `data/brent_history.json` gelesen. Angezeigt werden unter anderem:

- aktueller Brent-Wert
- Veränderung über 7 Tage
- Veränderung über 14, 30 oder 90 Tage
- Darstellung als USD pro Barrel oder umgerechnet als EUR pro Rohöl-Liter

Aus der Veränderung wird ein einfaches Signal berechnet:

- Brent steigt deutlich: eher preistreibend
- Brent fällt deutlich: eher entlastend
- keine klare Bewegung: neutral

Das Brent-Signal ersetzt nicht die eigentliche Tankstellenprognose. Es ist ein zusätzlicher Marktindikator. Zwischen Rohölpreis und Tankstellenpreis liegen Raffinerie, Großhandel, Steuern, Margen, lokaler Wettbewerb und Zeitverzug. Deshalb wird Brent bewusst nur als Richtungssignal genutzt.

Zusätzlich gibt es ein Brent-Szenario. Dort kann simuliert werden, wie sich eine Veränderung des Brent-Preises grob auf den Literpreis auswirken würde. Die Umrechnung erfolgt vereinfacht über:

- USD-Veränderung pro Barrel
- Wechselkurs USD/EUR
- Barrelgröße von ca. 158,99 Litern

Das Ergebnis wird als grober Cent-pro-Liter-Effekt angezeigt. Es ist keine exakte Preisvorhersage, sondern eine Orientierung, wie stark ein Ölpreisimpuls theoretisch wirken könnte.

## Tankplan - Bestimmung optimaler individueller Tankzeitpunkt

### Datenbasis:

Für die Fahrzeugdaten nutzt das Formular die Datei: `data/adac_models_by_make.csv`
Die Datei `data/adac_models_by_make.csv` wurde aus öffentlich verfügbaren ADAC-Fahrzeugdaten aufgebaut. Grundlage ist eine modell- und herstellerbezogene Fahrzeugliste, die anschließend um Detaildaten je Fahrzeug ergänzt wurde.

Im Erstellungsprozess wurden insbesondere folgende Schritte durchgeführt:

1. Hersteller und Modelle wurden aus der ADAC-Datenbasis ausgelesen.
2. Zu den einzelnen Fahrzeugvarianten wurden Detailseiten bzw. Detailinformationen abgefragt.
3. Die relevanten technischen Daten wurden extrahiert und in einen einheitlichen CSV-Spaltenaufbau überführt.
4. Fehlende oder nachträglich verfügbare Detaildaten, insbesondere Verbrauchs- und Tankdaten, wurden über Nachladeskripte ergänzt.
5. Die Daten wurden anschließend im Formular über Hersteller, Modell, Fahrzeugbezeichnung, Generation, Baujahr und Kraftstoffart durchsuchbar gemacht.

Die Datei dient damit als lokale Fahrzeug-Stammdatenbasis für das Tankplan-Formular. Sie enthält nicht nur Hersteller- und Modellnamen, sondern auch die für die Berechnung notwendigen technischen Felder wie `tankgroesse_1`, `verbrauch_l_pro_100_km` und `kraftstoffart`.

Aus dieser Datei werden insbesondere folgende Felder verwendet:
- `tankgroesse_1`
- `verbrauch_l_pro_100_km`
- `kraftstoffart`
- `Fahrzeugbezeichnung`, `Hersteller`, `Modell` und `Generation` für die Auswahl

Für die Preisstatistik nutzt das Formular die täglichen Auswertungsdateien:
`data2/YYYY/MM/DD/management_boxplots.json`

Dabei wird standardmäßig ein Zeitraum der letzten 14 Tage herangezogen. Aus diesen Tagesdateien wird die Preisstruktur je Kraftstoffart ausgewertet.
Berechnung der Restreichweite:

Wenn der Nutzer keine Restreichweite eingibt, wird sie aus Fahrzeugdaten und gefahrenen Kilometern berechnet:
- theoretische `Volltank-Reichweite = tankgroesse_1 / verbrauch_l_pro_100_km * 100`
- berechnete Restreichweite = theoretische Volltank-Reichweite - gefahrene Kilometer seit letzter Tankfüllung

Wenn der Nutzer eine Restreichweite eingibt, wird dieser Wert direkt als Ausgangswert verwendet.
Unterschied Wochenkilometer und Tageskilometer: 

Bei Eingabe einer Wochenkilometerleistung wird die Fahrleistung gleichmäßig auf sieben Tage verteilt:
    - `Tagesfahrleistung = Wochenkilometer / 7`

Bei Eingabe der Tageskilometer wird dagegen ein konkretes Wochenprofil verwendet. Für jedes zukünftige Datum wird anhand des Wochentags der passende  Tageswert abgezogen. Sobald Tageskilometer eingetragen sind, haben sie Vorrang vor der pauschalen Wochenkilometerleistung.

### Berücksichtigung der Preisstatistik

Die Preisstatistik wird aus den management_boxplots.json-Dateien der letzten 14 Tage geladen. Für Diesel, Super E5 und Super E10 werden die Medianwerte aus der Statistik verwendet.
Daraus berechnet das Formular:
durchschnittliche Preise je Uhrzeit im 24-Stunden-Zyklus
durchschnittliche Preise je Wochentag
günstigste Uhrzeiten je Tag
günstige und teure Tage im Vergleich
Für die Tankempfehlung wird zunächst bestimmt, bis zu welchem Tag getankt werden muss, damit die Restreichweite von 50 km nicht unterschritten wird. Innerhalb dieses zulässigen Zeitfensters wird anhand der 14-Tage-Preisstatistik der günstigste geeignete Tag und die passende günstige Uhrzeit ausgewählt.

### Manuelle Kraftstoffauswahl und Sonderfälle

Die Kraftstoffart des Fahrzeugs wird grundsätzlich aus dem Feld `kraftstoffart` der Datei `data/adac_models_by_make.csv` übernommen.

Wenn ein Fahrzeug mit einer Super-Kraftstoffart ausgewählt wird, kann der Nutzer die für die Berechnung verwendete Kraftstoffart manuell präzisieren. Zur Auswahl stehen:

- Super E5
- Super E10
- Super Plus

Die Tankzeitpunktvorhersage wird anschließend auf Basis der vom Nutzer gewählten Kraftstoffart berechnet.

Wenn für die gewählte oder abgeleitete Kraftstoffart keine Preisstatistik verfügbar ist, wird keine Tankempfehlung berechnet. Stattdessen erhält der Nutzer den Hinweis:

`Ups, leider ist die Kraftstoffsorte des gewählten Fahrzeugs nicht verfügbar ☹️.`

Wenn für das gewählte Fahrzeug notwendige Stammdaten fehlen, insbesondere `tankgroesse_1` oder `verbrauch_l_pro_100_km`, kann die Restreichweite nicht zuverlässig berechnet werden. In diesem Fall erhält der Nutzer den Hinweis, dass für das gewählte Fahrzeug Verbrauch oder Tankgröße fehlen und ein Fahrzeug mit vollständigen ADAC-Detaildaten ausgewählt werden soll.

Wenn ein Fahrzeug mit der Kraftstoffart `Strom` ausgewählt wird, wird keine Tankzeitpunktvorhersage auf Basis der Kraftstoffpreise erstellt. Stattdessen erhält der Nutzer einen gesonderten Hinweis für E-Fahrzeuge mit Verweis auf Woladen:

`Ups. Leider ist die Kraftstoffsorte des gewählten Fahrzeugs nicht verfügbar ☹️. Du fährst ein E-Auto! Kennst Du schon Woladen? Hier findest Du Schnellladesäulen mit der besten Aufenthaltsqualität. Woladen zeigt dir die nächstgelegenen Stationen in Deutschland übersichtlich in Liste und Karte und kennt Angebote vor Ort wie Supermarkt, Bäckerei oder Restaurant in der direkten Umgebung. Ohne Ladeweile.`

## Merge Workflow und Stationssuche

### Merge Workflow mit Volzinnovation

Für die Synchronisierung mit `volzinnovation/tankzeit.de` wurde der Upstream-Stand nicht direkt auf `master` überschrieben. Stattdessen wurde ein prüfbarer Merge Workflow verwendet, damit die bestehende Arbeit in `lealu2403/tankzeit.de` erhalten bleibt.

Dieser Merge Workflow läuft täglich, damit neue Updates aus `volzinnovation/tankzeit.de` regelmäßig mitgenommen werden und als reviewbare Änderungen im Fork landen, ohne die eigene Arbeit auf `master` direkt zu überschreiben.

Der Ablauf war:

1. Vor dem Sync wurde eine Sicherheitsbranch `backup-before-upstream-sync-2026-05-09` vom damaligen `master` angelegt.
2. Die fehlenden Upstream-Commits aus `volzinnovation/tankzeit.de:master` wurden über Sync-Branches und Pull Requests in den Fork geholt.
3. Die finale Zusammenführung lief über den Branch `codex/merge-volzinnovation-master` und den Pull Request `#14`.
4. Konflikte wurden bewusst im Pull Request gelöst, nicht per Force-Push oder Reset auf `master`.

Die echten Inhaltskonflikte lagen in `index.html`, `e10.html`, `favoriten.html` und `styles.css`. Beibehalten wurden die fork-seitigen Erweiterungen für Stationsdetail-URLs mit Brand-Übergabe und die Favoriten-Benachrichtigungen. Gleichzeitig wurden die upstream-seitigen Tabellen-, Favoriten-, Rabatt- und Datenupdates übernommen. Geprüft wurde danach, dass keine Git-Konfliktmarker mehr vorhanden sind, `git diff --check --cached` sauber läuft und die Inline-Skripte aus `index.html`, `e10.html` und `favoriten.html` syntaktisch parsebar bleiben.

### Standortwahl auf Diesel und E10

Die Diesel-Seite (`index.html`) und die E10-Seite (`e10.html`) nutzen denselben Ablauf. Ein Standort wird erst nach einer aktiven Nutzerentscheidung bestimmt. Beim Laden der Seite wird also nicht automatisch nach der Browser-Position gefragt.

Es gibt zwei Wege:

- Über **Ort oder PLZ**: Das Formular ruft `searchManualLocation()` auf. Die Eingabe wird an `TankzeitStationCatalog.geocodeLocationQuery()` übergeben. Diese Funktion fragt OpenStreetMap/Nominatim mit `countrycodes=de` ab, nimmt den ersten Treffer mit gültigen Koordinaten und speichert die Eingabe pro Kraftstoff in `localStorage` unter `tankzeit_location_query_${FUEL}`. Danach lädt `loadStations(lat, lng)` die Stationen für diese Koordinaten.
- Über **Standort abrufen**: Der Button ruft `requestLocation()` auf. Diese Funktion nutzt `navigator.geolocation.watchPosition()`, zeigt währenddessen Statusmeldungen an und bricht nach `LOCATION_DEADLINE_MS` ab, wenn keine Position kommt. Bei Erfolg werden die Browser-Koordinaten ebenfalls an `loadStations(lat, lng)` übergeben. Bei verweigerter, nicht verfügbarer oder abgelaufener Standortabfrage erscheint eine passende Fehlermeldung.

`loadStations()` setzt zuerst `currentCenter` und übergibt den Mittelpunkt an `TankzeitStationCatalog.setDistanceCenter()`. Danach wird die Tankerkönig-Live-API mit einem Radius von 10 km abgefragt. Es werden nur geöffnete Stationen berücksichtigt, die für den gewählten Kraftstoff einen Preis liefern. Ist die Live-API nicht erreichbar, fällt die Seite auf das lokale `data/stations.json` zurück, sucht dort nahe Stationen im gleichen Radius und deaktiviert die Preissortierung, weil dann keine Livepreise verfügbar sind.

### Distanzspalte

Die Distanz wird in `station-catalog.js` berechnet. Grundlage ist die Haversine-Formel zwischen dem gewählten Mittelpunkt und den Koordinaten der jeweiligen Tankstelle. Die Ausgabe erfolgt als Kilometerwert, bei kurzen Distanzen mit einer Nachkommastelle.

Die Tabellen auf Diesel und E10 haben jetzt die Spalten `Favorit`, `Name`, `Distanz`, `Tankzeit` und `Preis`. Beim Rendern bekommt jede Zeile `data-lat`, `data-lng` und `data-dist`. Die Distanzzelle wird direkt nach dem Namen eingefügt und mit `data-distance-column="true"` markiert. Zusätzlich sorgt `installDistanceColumn()` dafür, dass Header und Zellen auch dann vorhanden bleiben, wenn die Tabelle später neu gerendert wird. Ein `MutationObserver` aktualisiert die Distanzspalte nach Änderungen im Tabellenkörper.

Die Standardsortierung ist `Distanz`. Wird auf `Preis` sortiert, dient die Distanz als zweite Sortierung. Wenn Livepreise fehlen, wird automatisch wieder auf Distanzsortierung gewechselt.

### Entfernen der Spalte Preisverlauf

Die Spalte `Preisverlauf` wurde aus `index.html` und `e10.html` entfernt. Damit sind auch die früheren `Details`-Links auf `chart.html` weggefallen. Die Tabelle besteht seitdem nur noch aus Favorit, Name, Distanz, Tankzeit und Preis; die Status- und Leerzeilen verwenden entsprechend `colspan="5"`.

Die Statistikabfrage bleibt erhalten, wird aber nur noch genutzt, um die Spalte `Tankzeit` mit dem günstigsten Zeitfenster zu füllen und Zeilen im aktuellen günstigen Zeitfenster hervorzuheben. Die separate Preisverlauf-Detailseite ist nicht mehr Teil des Diesel/E10-Flows; `chart.html` wurde im zugehörigen Cleanup entfernt.
