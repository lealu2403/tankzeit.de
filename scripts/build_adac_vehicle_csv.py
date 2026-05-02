import csv
import html
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


INPUT_CSV = Path(r"C:\Users\flori\Documents\New project 2\adac_models_by_make.csv")
OUTPUT_CSV = Path(
    r"C:\Users\flori\Documents\GitHub\tankzeit.de\data\adac_models_by_make.csv"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
MODEL_WORKERS = 10
GENERATION_WORKERS = 10
DETAIL_WORKERS = 40
REQUEST_TIMEOUT = 30
REQUEST_RETRIES = 3
FLUSH_EVERY = 250
OUTPUT_FIELDS = [
    "hersteller",
    "modell",
    "generation",
    "fahrzeugbezeichnung",
    "baujahr",
    "kraftstoffart",
    "verbrauch_l_pro_100_km",
    "tankgroesse_1",
    "adac_url",
    "adac_modell_url",
    "adac_generation_url",
]


def fetch_text(url: str) -> str:
    last_error: Optional[Exception] = None
    for attempt in range(REQUEST_RETRIES):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=REQUEST_TIMEOUT) as response:
                return response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def extract_apollo_state(html_text: str) -> Dict:
    match = re.search(
        r"window\.__APOLLO_STATE__=(\{.*?\});</script>", html_text, flags=re.S
    )
    if not match:
        raise ValueError("Apollo state not found")
    return json.loads(match.group(1))


def clean_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    return html.unescape(str(value)).strip()


def normalize_generation_name(name: str, facelift: Optional[int]) -> str:
    base = clean_text(name)
    if facelift:
        if "facelift" not in base.lower():
            return f"{base} Facelift"
    return base


def build_generation_url(model_url: str, generation_slug: str) -> str:
    return model_url.rstrip("/") + "/" + generation_slug.strip("/") + "/"


def strip_query(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def extract_canonical_url(html_text: str, fallback_url: str) -> str:
    match = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html_text, re.I)
    if match:
        return strip_query(clean_text(match.group(1))).rstrip("/")
    return strip_query(fallback_url).rstrip("/")


def parse_model_page(model_url: str) -> List[Dict[str, object]]:
    html_text = fetch_text(model_url)
    state = extract_apollo_state(html_text)
    canonical_model_url = extract_canonical_url(html_text, model_url)
    range_keys = [key for key in state if key.startswith("ApilRange:")]
    if not range_keys:
        return []
    range_data = state[range_keys[0]]
    brand = clean_text(range_data.get("brand", {}).get("name"))
    model = clean_text(range_data.get("name"))
    generations = []
    for generation_ref in range_data.get("generations", []):
        generation = state.get(generation_ref.get("__ref", ""))
        if not generation:
            continue
        generations.append(
            {
                "manufacturer": brand,
                "model": model,
                "generation": normalize_generation_name(
                    generation.get("name"), generation.get("facelift")
                ),
                "generation_from": generation.get("manufacturedFrom"),
                "generation_until": generation.get("manufacturedUntil"),
                "model_url": canonical_model_url + "/",
                "generation_url": build_generation_url(
                    canonical_model_url, generation["slug"]
                ),
            }
        )
    return generations


def parse_generation_page(generation_meta: Dict[str, object]) -> List[Dict[str, object]]:
    html_text = fetch_text(str(generation_meta["generation_url"]))
    state = extract_apollo_state(html_text)
    root_query = state.get("ROOT_QUERY", {})
    rows = []
    seen_car_urls = set()
    for key, value in root_query.items():
        if not key.startswith("cars(") or not isinstance(value, dict):
            continue
        for ref in value.get("result", []):
            car = state.get(ref.get("__ref", ""))
            if not car:
                continue
            car_id = clean_text(car.get("id"))
            car_url = str(generation_meta["generation_url"]).rstrip("/") + f"/{car_id}/"
            if car_url in seen_car_urls:
                continue
            seen_car_urls.add(car_url)
            rows.append(
                {
                    "hersteller": generation_meta["manufacturer"],
                    "modell": generation_meta["model"],
                    "generation": generation_meta["generation"],
                    "fahrzeugbezeichnung": clean_text(car.get("name")),
                    "baujahr": "",
                    "kraftstoffart": clean_text(car.get("fuelType")),
                    "verbrauch_l_pro_100_km": "",
                    "adac_url": car_url,
                    "adac_modell_url": generation_meta["model_url"],
                    "adac_generation_url": generation_meta["generation_url"],
                    "generation_from": generation_meta.get("generation_from"),
                    "generation_until": generation_meta.get("generation_until"),
                }
            )
    return rows


def parse_year_fragment(value: str) -> str:
    match = re.search(r"(\d{2})/(\d{2})", value)
    if not match:
        return ""
    year = int(match.group(2))
    century = 1900 if year >= 30 else 2000
    return str(century + year)


def extract_consumption_liters(html_text: str) -> str:
    patterns = [
        r">Verbrauch</p><p[^>]*>([^<]+)</p>",
        r">Verbrauch</[^>]*>\s*<[^>]*>([^<]+)</",
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text, flags=re.I)
        if not match:
            continue
        value = clean_text(match.group(1))
        if "l/100 km" not in value.lower():
            return ""
        number = re.search(r"(\d+(?:,\d+)?)", value)
        return number.group(1).replace(",", ".") if number else ""
    return ""


def extract_build_year(html_text: str, vehicle_name: str, fallback_year: object) -> str:
    detail_patterns = [
        r">Erstzulassung</td><td[^>]*>([^<]+)</td>",
        r">Baujahr</td><td[^>]*>([^<]+)</td>",
    ]
    for pattern in detail_patterns:
        match = re.search(pattern, html_text, flags=re.I)
        if match:
            parsed = parse_year_fragment(clean_text(match.group(1)))
            if parsed:
                return parsed

    date_match = re.search(r"\((?:ab\s+)?(\d{2}/\d{2})", vehicle_name)
    if date_match:
        parsed = parse_year_fragment(date_match.group(1))
        if parsed:
            return parsed

    if fallback_year:
        return str(fallback_year)
    return ""


def extract_tank_size_liters(html_text: str) -> str:
    rows = re.findall(r"<tr[^>]*>.*?</tr>", html_text, flags=re.S | re.I)
    for row in rows:
        plain = html.unescape(re.sub(r"<[^>]+>", " ", row))
        plain = " ".join(plain.replace("\x00", "").split())
        if not plain:
            continue
        label = (
            plain.split(maxsplit=1)[0]
            .lower()
            .replace("\u00f6", "oe")
            .replace("\u00df", "ss")
            .replace("Ã¶", "oe")
            .replace("ÃŸ", "ss")
            .replace("ã¶", "oe")
            .replace("ãÿ", "ss")
        )
        if label in {"tankgroesse", "tankinhalt"}:
            match = re.search(r"(\d+(?:,\d+)?)\s*l\b", plain, flags=re.I)
            if match:
                return match.group(1).replace(",", ".")
    return ""


def enrich_car_detail(row: Dict[str, object]) -> Dict[str, object]:
    html_text = fetch_text(str(row["adac_url"]))
    row["verbrauch_l_pro_100_km"] = extract_consumption_liters(html_text)
    row["tankgroesse_1"] = extract_tank_size_liters(html_text)
    row["baujahr"] = extract_build_year(
        html_text, str(row["fahrzeugbezeichnung"]), row.get("generation_from")
    )
    return row


def fallback_row(row: Dict[str, object]) -> Dict[str, object]:
    row["baujahr"] = extract_build_year(
        "", str(row["fahrzeugbezeichnung"]), row.get("generation_from")
    )
    row["tankgroesse_1"] = row.get("tankgroesse_1", "")
    return row


def parse_year_number(value: object) -> Optional[int]:
    if value is None:
        return None
    text = clean_text(value)
    if not text:
        return None
    match = re.fullmatch(r"\d{4}", text)
    if match:
        return int(text)
    return None


def generation_is_relevant(row: Dict[str, object]) -> bool:
    generation_until = parse_year_number(row.get("generation_until"))
    return generation_until is None or generation_until >= 2000


def row_is_relevant(row: Dict[str, object]) -> bool:
    year = parse_year_number(row.get("baujahr"))
    if year is not None:
        return year >= 2000
    generation_until = parse_year_number(row.get("generation_until"))
    if generation_until is not None and generation_until < 2000:
        return False
    generation_from = parse_year_number(row.get("generation_from"))
    if generation_from is not None:
        return generation_from >= 2000
    return False


def unique_model_urls() -> List[str]:
    with INPUT_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        urls = {clean_text(row["adac_url"]) for row in reader if clean_text(row["adac_url"])}
    return sorted(urls)


def run_parallel(
    items: Iterable, worker_fn, max_workers: int, label: str
) -> List[Dict[str, object]]:
    items = list(items)
    results: List[Dict[str, object]] = []
    failures = []
    total = len(items)
    if total == 0:
        return results

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(worker_fn, item): item for item in items}
        for idx, future in enumerate(as_completed(futures), start=1):
            item = futures[future]
            try:
                value = future.result()
                if isinstance(value, list):
                    results.extend(value)
                else:
                    results.append(value)
            except Exception as exc:  # noqa: BLE001
                failures.append({"item": item, "error": str(exc)})
            if idx % 50 == 0 or idx == total:
                print(f"{label}: {idx}/{total}")

    if failures:
        print(f"{label} failures: {len(failures)}")
        for failure in failures[:20]:
            print(f"  - {failure['item']}: {failure['error']}")
    return results


def load_existing_rows(path: Path) -> List[Dict[str, object]]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_header(path: Path) -> List[str]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        return next(reader, [])


def append_rows(path: Path, rows: List[Dict[str, object]]) -> None:
    if not rows:
        return
    file_exists = path.exists() and path.stat().st_size > 0
    with path.open("a", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(
            [{field: row.get(field, "") for field in OUTPUT_FIELDS} for row in rows]
        )


def main() -> None:
    existing_header = read_header(OUTPUT_CSV)
    existing_rows = load_existing_rows(OUTPUT_CSV)
    old_schema = bool(existing_rows) and "tankgroesse_1" not in existing_header
    if old_schema:
        backup_path = OUTPUT_CSV.with_name(OUTPUT_CSV.stem + "_backup_without_tank.csv")
        if not backup_path.exists():
            OUTPUT_CSV.replace(backup_path)
            print(f"Backup created: {backup_path}")
        else:
            print(f"Backup already present: {backup_path}")

    model_urls = unique_model_urls()
    print(f"Unique model URLs: {len(model_urls)}")

    generations = run_parallel(model_urls, parse_model_page, MODEL_WORKERS, "Modelle")
    generation_map = {row["generation_url"]: row for row in generations}
    generations = [row for row in generation_map.values() if generation_is_relevant(row)]
    print(f"Generationen: {len(generations)}")

    car_rows = run_parallel(
        generations, parse_generation_page, GENERATION_WORKERS, "Generationen"
    )
    car_map = {row["adac_url"]: row for row in car_rows}
    car_rows = list(car_map.values())
    print(f"Fahrzeuge: {len(car_rows)}")
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    existing_header = read_header(OUTPUT_CSV)
    existing_rows = load_existing_rows(OUTPUT_CSV)
    old_schema = bool(existing_rows) and "tankgroesse_1" not in existing_header

    seed_rows = {row["adac_url"]: row for row in car_rows}
    for row in existing_rows:
        if row.get("adac_url"):
            merged = seed_rows.get(row["adac_url"], {}).copy()
            merged.update(row)
            seed_rows[row["adac_url"]] = merged
    seed_rows = {
        url: row for url, row in seed_rows.items() if row_is_relevant(row)
    }

    if old_schema:
        existing_rows = []
        existing_urls = set()
        remaining_rows = list(seed_rows.values())
        if OUTPUT_CSV.exists():
            OUTPUT_CSV.unlink()
    else:
        existing_urls = {
            row["adac_url"]
            for row in existing_rows
            if row.get("adac_url") and row.get("tankgroesse_1", "") != ""
        }
        remaining_rows = [
            seed_rows[url] for url in seed_rows if url not in existing_urls
        ]

    print(f"Bereits vollständig vorhanden: {len(existing_urls)}")
    print(f"Noch offen: {len(remaining_rows)}")

    completed = len(existing_urls)
    batch: List[Dict[str, object]] = []
    total = len(seed_rows)
    failures = 0
    written = len(existing_urls)
    with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as executor:
        futures = {executor.submit(enrich_car_detail, row): row for row in remaining_rows}
        for idx, future in enumerate(as_completed(futures), start=1):
            seed_row = futures[future]
            try:
                row = future.result()
            except Exception:
                failures += 1
                row = fallback_row(seed_row)
            row.pop("generation_from", None)
            row.pop("generation_until", None)
            if not row_is_relevant(row):
                if idx % 250 == 0 or idx == len(remaining_rows):
                    print(f"Fahrzeugdetails: {completed}/{total}")
                continue
            batch.append(row)
            completed += 1
            written += 1
            if len(batch) >= FLUSH_EVERY:
                append_rows(OUTPUT_CSV, batch)
                batch.clear()
            if idx % 250 == 0 or idx == len(remaining_rows):
                print(f"Fahrzeugdetails: {completed}/{total}")

    append_rows(OUTPUT_CSV, batch)
    print(f"Saved: {OUTPUT_CSV}")
    print(f"Rows written total: {written}")
    print(f"Detail failures with fallback: {failures}")


if __name__ == "__main__":
    main()
