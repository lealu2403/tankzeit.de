import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import mean


DATA2_DIR = Path(r"C:\Users\flori\Documents\GitHub\tankzeit.de\data2")
TARGET_JS = Path(r"C:\Users\flori\Documents\New project 2\price-data.js")
FUELS = ("diesel", "e5", "e10")
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


def collect_management_prices(groups):
    files = find_latest_management_files()
    newest_seen = None
    daily_stats = {fuel: [] for fuel in FUELS}

    for day, path in files:
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
            day_values = []
            for row in summary.get("fuels", {}).get(fuel, []):
                clock_hour = row.get("clock_hour")
                delta_median = row.get("median")
                count = row.get("count") or 0
                if not isinstance(clock_hour, int) or not isinstance(delta_median, (int, float)):
                    continue
                if not isinstance(count, int) or count <= 0:
                    continue
                absolute_price = base_median + delta_median
                day_values.append(
                    {
                        "hour": clock_hour % 24,
                        "price": absolute_price,
                        "count": count,
                    }
                )
                groups[fuel][clock_hour % 24]["weighted_sum"] += absolute_price * count
                groups[fuel][clock_hour % 24]["weight"] += count

            if day_values:
                weighted_sum = sum(item["price"] * item["count"] for item in day_values)
                weight = sum(item["count"] for item in day_values)
                best = min(day_values, key=lambda item: item["price"])
                daily_stats[fuel].append(
                    {
                        "date": day.isoformat(),
                        "weekday": weekday_label(day.isoformat()),
                        "averagePrice": round(weighted_sum / weight, 3),
                        "medianPrice": round(mean(item["price"] for item in day_values), 3),
                        "bestHour": best["hour"],
                        "bestPrice": round(best["price"], 3),
                        "count": weight,
                    }
                )

    return newest_seen, files, daily_stats


def build_slots(groups):
    slots = []
    for hour in range(24):
        prices = {}
        counts = {}
        for fuel in FUELS:
            item = groups[fuel].get(hour, {})
            weight = item.get("weight", 0)
            counts[fuel] = weight
            if weight > 0:
                prices[fuel] = round(item["weighted_sum"] / weight, 3)
        if prices:
            slots.append(
                {
                    "label": f"{hour:02d}:00",
                    "hour": hour,
                    "prices": prices,
                    "counts": counts,
                }
            )
    return slots


def main() -> None:
    groups = {fuel: defaultdict(lambda: {"weighted_sum": 0.0, "weight": 0}) for fuel in FUELS}
    newest_seen, files, daily_stats = collect_management_prices(groups)
    dates = [day.isoformat() for day, _ in files]

    generated_at = (
        newest_seen.isoformat()
        if newest_seen
        else datetime.now(timezone.utc).isoformat()
    )
    data = {
        "generatedAt": generated_at,
        "lookbackDays": LOOKBACK_DAYS,
        "slots": build_slots(groups),
        "dayStats": daily_stats,
        "sourceRoot": str(DATA2_DIR),
        "sourceDates": dates,
        "sourceFiles": [f"{day.isoformat()}/management_boxplots.json" for day, _ in files],
        "method": "Absoluter Medianpreis je Kraftstoffart und Stunde aus data2/YYYY/MM/DD/management_boxplots.json: Gesamtmarkt-12:00-Median plus stündliche Median-Preisänderung, gewichtet nach Bucket-Anzahl.",
    }
    TARGET_JS.write_text(
        "window.PRICE_ANALYSIS = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Saved price data to {TARGET_JS}")
    print(json.dumps(data, ensure_ascii=False, indent=2))


def weekday_label(iso_date):
    try:
        day = datetime.fromisoformat(iso_date).date()
    except ValueError:
        return ""
    return ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][day.weekday()]


if __name__ == "__main__":
    main()
