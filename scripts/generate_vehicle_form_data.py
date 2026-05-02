import csv
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


MODEL_SERIES_CSV = Path(r"C:\Users\flori\Documents\New project 2\adac_models_by_make.csv")
DETAIL_CSV = Path(r"C:\Users\flori\Documents\GitHub\tankzeit.de\data\adac_models_by_make.csv")
TARGET_JS = Path(r"C:\Users\flori\Documents\New project 2\vehicles-data-full.js")


def model_slug(url: str) -> str:
    parts = urlsplit(url).path.strip("/").split("/")
    return parts[-1].casefold() if parts else ""


def slugify_model(value: str) -> str:
    text = value.casefold().strip()
    text = (
        text.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def read_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    vehicles = []
    seen = set()

    for row in read_rows(DETAIL_CSV):
        hersteller = row.get("hersteller", "").strip()
        modell = row.get("modell", "").strip()
        name = row.get("fahrzeugbezeichnung", "").strip()
        generation = row.get("generation", "").strip()
        if not hersteller or not modell or not name:
            continue
        key = ("detail", hersteller.casefold(), modell.casefold(), name.casefold(), generation.casefold())
        if key in seen:
            continue
        seen.add(key)
        vehicles.append(
            {
                "hersteller": hersteller,
                "modell": modell,
                "generation": generation or "Generation nicht angegeben",
                "fahrzeugbezeichnung": name,
                "baujahr": row.get("baujahr", "").strip(),
                "kraftstoffart": row.get("kraftstoffart", "").strip(),
                "verbrauch_l_pro_100_km": row.get("verbrauch_l_pro_100_km", "").strip(),
                "tankgroesse_1": row.get("tankgroesse_1", "").strip(),
                "adac_url": row.get("adac_url", "").strip(),
                "source": "detail",
            }
        )

    detail_pairs = {
        (item["hersteller"].casefold(), item["modell"].casefold())
        for item in vehicles
        if item["source"] == "detail"
    }

    for row in read_rows(MODEL_SERIES_CSV):
        hersteller = row.get("manufacturer", "").strip()
        modell = row.get("model_series", "").strip()
        url = row.get("adac_url", "").strip()
        if not hersteller or not modell:
            continue
        if modell.isdigit() and model_slug(url) != slugify_model(modell):
            continue
        if (hersteller.casefold(), modell.casefold()) in detail_pairs:
            continue
        key = ("series", hersteller.casefold(), modell.casefold(), url)
        if key in seen:
            continue
        seen.add(key)
        vehicles.append(
            {
                "hersteller": hersteller,
                "modell": modell,
                "generation": "Modellreihe (ADAC)",
                "fahrzeugbezeichnung": f"{hersteller} {modell}",
                "baujahr": "",
                "kraftstoffart": "",
                "verbrauch_l_pro_100_km": "",
                "tankgroesse_1": "",
                "adac_url": url,
                "source": "model_series",
            }
        )

    TARGET_JS.write_text(
        "window.ADAC_VEHICLES = "
        + json.dumps(vehicles, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Saved {len(vehicles)} vehicles to {TARGET_JS}")


if __name__ == "__main__":
    main()
