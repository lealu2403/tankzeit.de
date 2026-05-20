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
