import csv
import html
import http.client
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


CSV_PATH = Path(r"C:\Users\flori\Documents\GitHub\tankzeit.de\data\adac_models_by_make.csv")
BACKUP_PATH = Path(
    r"C:\Users\flori\Documents\GitHub\tankzeit.de\data\adac_models_by_make_before_tank_refill.csv"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
REQUEST_TIMEOUT = 30
REQUEST_RETRIES = 3
WORKERS = 8
SAVE_EVERY = 250


def fetch_text(url: str) -> str:
    last_error: Optional[Exception] = None
    for attempt in range(REQUEST_RETRIES):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                return response.read().decode("utf-8", errors="replace")
        except http.client.IncompleteRead as exc:
            if exc.partial:
                return exc.partial.decode("utf-8", errors="replace")
            last_error = exc
            time.sleep(0.6 * (attempt + 1))
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def extract_tank_size_liters(html_text: str) -> str:
    rows = re.findall(r"<tr[^>]*>.*?</tr>", html_text, flags=re.S | re.I)
    for row in rows:
        plain = html.unescape(re.sub(r"<[^>]+>", " ", row))
        plain = " ".join(plain.replace("\x00", "").split())
        if not plain:
            continue
        label = plain.split(maxsplit=1)[0].lower()
        if label in {"tankgröße", "tankgroesse", "tankinhalt"}:
            match = re.search(r"(\d+(?:,\d+)?)\s*l\b", plain, flags=re.I)
            if match:
                return match.group(1).replace(",", ".")
    return ""


def load_rows() -> List[Dict[str, str]]:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def save_rows(rows: List[Dict[str, str]], fieldnames: List[str]) -> None:
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def refill_one(item: Dict[str, str]) -> Dict[str, str]:
    html_text = fetch_text(item["adac_url"])
    item["tankgroesse_1"] = extract_tank_size_liters(html_text)
    return item


def main() -> None:
    rows = load_rows()
    if not rows:
        print("CSV empty")
        return

    fieldnames = list(rows[0].keys())
    if "tankgroesse_1" not in fieldnames:
        raise RuntimeError("Column tankgroesse_1 missing")

    if not BACKUP_PATH.exists():
        BACKUP_PATH.write_bytes(CSV_PATH.read_bytes())
        print(f"Backup created: {BACKUP_PATH}")

    missing = [row for row in rows if not row.get("tankgroesse_1")]
    print(f"Rows total: {len(rows)}")
    print(f"Rows missing tank size: {len(missing)}")

    if not missing:
        print("Nothing to refill")
        return

    row_by_url = {row["adac_url"]: row for row in rows}
    done = 0
    failures = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(refill_one, dict(row)): row["adac_url"] for row in missing}
        for future in as_completed(futures):
            url = futures[future]
            try:
                updated = future.result()
                row_by_url[url]["tankgroesse_1"] = updated.get("tankgroesse_1", "")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"FAIL {url}: {exc}")
            done += 1
            if done % SAVE_EVERY == 0:
                save_rows(rows, fieldnames)
            if done % 100 == 0 or done == len(missing):
                print(f"Processed: {done}/{len(missing)}")

    save_rows(rows, fieldnames)
    filled = sum(1 for row in row_by_url.values() if row.get("tankgroesse_1"))
    print(f"Filled tank size rows: {filled}")
    print(f"Failures: {failures}")


if __name__ == "__main__":
    main()
