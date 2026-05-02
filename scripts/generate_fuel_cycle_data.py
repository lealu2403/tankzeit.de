import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path


DATA2_DIR = Path(r"C:\Users\flori\Documents\GitHub\tankzeit.de\data2")
TARGET_JS = Path(r"C:\Users\flori\Documents\New project 2\fuel-cycle-data.js")
FUELS = ("diesel", "e5", "e10")
FUEL_LABELS = {"diesel": "Diesel", "e5": "Super E5", "e10": "Super E10"}
LOOKBACK_DAYS = 14


def date_from_management_path(path: Path):
    parts = path.parts
    try:
        data2_index = parts.index("data2")
        year = int(parts[data2_index + 1])
        month = int(parts[data2_index + 2])
        day = int(parts[data2_index + 3])
        return datetime(year, month, day).date()
    except (ValueError, IndexError):
        return None


def find_latest_management_files():
    dated_files = []
    for path in DATA2_DIR.glob("*/*/*/management_boxplots.json"):
        day = date_from_management_path(path)
        if day:
            dated_files.append((day, path))

    if not dated_files:
        return []

    latest_day = max(day for day, _ in dated_files)
    earliest_day = latest_day - timedelta(days=LOOKBACK_DAYS - 1)
    return [
        (day, path)
        for day, path in sorted(dated_files)
        if earliest_day <= day <= latest_day
    ]


def overall_median(summary, fuel):
    for row in summary.get("brand_distributions", {}).get(fuel, []):
        if row.get("brand") == "Gesamtmarkt":
            value = row.get("median")
            return float(value) if isinstance(value, (int, float)) else None
    return None


def collect_management_data(groups, reference_values):
    files = find_latest_management_files()
    newest_seen = None

    for _, path in files:
        summary = json.loads(path.read_text(encoding="utf-8"))
        generated_at = summary.get("generated_at")
        if generated_at:
            try:
                parsed = datetime.fromisoformat(generated_at)
                if newest_seen is None or parsed > newest_seen:
                    newest_seen = parsed
            except ValueError:
                pass

        for fuel in FUELS:
            base_median = overall_median(summary, fuel)
            if base_median is None:
                continue
            reference_values[fuel].append(base_median)
            for row in summary.get("fuels", {}).get(fuel, []):
                cycle_hour = row.get("cycle_hour")
                clock_hour = row.get("clock_hour")
                delta_median = row.get("median")
                count = row.get("count") or 0
                if not isinstance(cycle_hour, int) or not isinstance(clock_hour, int):
                    continue
                if not isinstance(delta_median, (int, float)):
                    continue
                if not isinstance(count, int) or count <= 0:
                    continue
                groups[fuel][cycle_hour]["clock_hour"] = clock_hour
                groups[fuel][cycle_hour]["weighted_sum"] += (base_median + delta_median) * count
                groups[fuel][cycle_hour]["weight"] += count

    return newest_seen, files


def build_series(groups, reference_values):
    labels = [f"{hour:02d}" for hour in list(range(12, 24)) + list(range(0, 13))]
    series = {}
    for fuel in FUELS:
        reference = (
            sum(reference_values[fuel]) / len(reference_values[fuel])
            if reference_values[fuel]
            else None
        )
        points = []
        for index, label in enumerate(labels):
            item = groups[fuel].get(index, {})
            weight = item.get("weight", 0)
            if weight <= 0:
                points.append({"x": index, "hour": label, "value": None, "count": 0})
                continue
            points.append(
                {
                    "x": index,
                    "hour": label,
                    "clockHour": item.get("clock_hour"),
                    "value": round(item["weighted_sum"] / weight, 3),
                    "count": weight,
                }
            )
        series[fuel] = {
            "label": FUEL_LABELS[fuel],
            "referencePrice": round(reference, 3) if reference is not None else None,
            "points": points,
        }
    return labels, series


def main() -> None:
    groups = {fuel: defaultdict(lambda: {"weighted_sum": 0.0, "weight": 0}) for fuel in FUELS}
    reference_values = {fuel: [] for fuel in FUELS}
    newest_seen, files = collect_management_data(groups, reference_values)
    labels, series = build_series(groups, reference_values)
    data = {
        "generatedAt": newest_seen.isoformat() if newest_seen else "",
        "lookbackDays": LOOKBACK_DAYS,
        "labels": labels,
        "series": series,
        "sourceRoot": str(DATA2_DIR),
        "sourceDates": [day.isoformat() for day, _ in files],
        "sourceFiles": [f"{day.isoformat()}/management_boxplots.json" for day, _ in files],
        "method": "Absoluter Medianpreis je Kraftstoffart und Stunde aus data2/YYYY/MM/DD/management_boxplots.json: Gesamtmarkt-12:00-Median plus stündliche Median-Preisänderung, gewichtet nach Bucket-Anzahl.",
    }
    TARGET_JS.write_text(
        "window.FUEL_CYCLE_ANALYSIS = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Saved fuel cycle data to {TARGET_JS}")
    for fuel, item in series.items():
        valid = [point for point in item["points"] if point["value"] is not None]
        print(fuel, len(valid), "points", "reference", item["referencePrice"])


if __name__ == "__main__":
    main()
