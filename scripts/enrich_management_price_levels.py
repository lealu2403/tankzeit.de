#!/usr/bin/env python3
"""Add absolute hourly price aggregates to synced management summaries.

The upstream ``management_boxplots.json`` files stay authoritative for the
existing delta boxplot statistics. This script only appends ``price_sum``,
``price_count`` and ``price_avg`` so the frontend can draw price-level charts
without loading station-level data.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

import pandas as pd

try:
    from .generate_data import DateRange, TZ, _load_prices, _local_dt
except ImportError:  # pragma: no cover
    from generate_data import DateRange, TZ, _load_prices, _local_dt


FUELS: tuple[str, ...] = ("diesel", "e10", "e5")


def _parse_date(raw: str) -> date:
    return date.fromisoformat(raw)


def _date_range(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _management_path(root: Path, day: date) -> Path:
    return root / "data2" / f"{day:%Y}" / f"{day:%m}" / f"{day:%d}" / "management_boxplots.json"


def _noon_path(root: Path, day: date) -> Path:
    return root / "data2" / f"{day:%Y}" / f"{day:%m}" / f"{day:%d}" / "noon.csv"


def _noon_aggregate(root: Path, day: date, fuel: str) -> tuple[float, int] | None:
    path = _noon_path(root, day)
    if not path.exists():
        return None
    try:
        frame = pd.read_csv(path, dtype={"station_uuid": "string"})
    except Exception:
        return None
    if fuel not in frame.columns:
        return None
    values = pd.to_numeric(frame[fuel], errors="coerce").dropna()
    count = int(values.count())
    if count <= 0:
        return None
    return float(values.sum()), count


def _hourly_price_aggregates(
    prices: pd.DataFrame,
    root: Path,
    target_day: date,
    fuel: str,
) -> dict[int, tuple[float, int]]:
    if fuel not in prices.columns:
        return {}

    cycle_start_day = target_day - timedelta(days=1)
    timestamps = [_local_dt(cycle_start_day, 12, 0) + timedelta(hours=offset) for offset in range(25)]
    timestamps_utc = [pd.Timestamp(ts).tz_convert("UTC") for ts in timestamps]

    fuel_prices = prices[["station_uuid", "date", fuel]].copy()
    fuel_prices[fuel] = pd.to_numeric(fuel_prices[fuel], errors="coerce")
    fuel_prices["station_uuid"] = fuel_prices["station_uuid"].astype("string")
    fuel_prices = fuel_prices.dropna(subset=["station_uuid", "date", fuel])
    if fuel_prices.empty:
        return {}

    station_ids = fuel_prices["station_uuid"].dropna().drop_duplicates().sort_values()
    left = pd.MultiIndex.from_product(
        [timestamps_utc, station_ids],
        names=["date", "station_uuid"],
    ).to_frame(index=False)
    left = left.sort_values(["date", "station_uuid"]).reset_index(drop=True)
    right = fuel_prices.sort_values(["date", "station_uuid"]).reset_index(drop=True)

    merged = pd.merge_asof(
        left,
        right,
        on="date",
        by="station_uuid",
        direction="backward",
        allow_exact_matches=True,
    )
    merged["cycle_hour"] = merged["date"].map({timestamp: offset for offset, timestamp in enumerate(timestamps_utc)})
    grouped = merged.dropna(subset=[fuel]).groupby("cycle_hour")[fuel].agg(["sum", "count"])

    aggregates: dict[int, tuple[float, int]] = {
        int(hour): (float(row["sum"]), int(row["count"]))
        for hour, row in grouped.iterrows()
        if int(row["count"]) > 0
    }

    opening = _noon_aggregate(root, cycle_start_day, fuel)
    if opening is not None:
        aggregates[0] = opening
    closing = _noon_aggregate(root, target_day, fuel)
    if closing is not None:
        aggregates[24] = closing

    return aggregates


def _add_price_fields(summary: dict[str, object], aggregates_by_fuel: dict[str, dict[int, tuple[float, int]]]) -> bool:
    changed = False
    fuels = summary.get("fuels")
    if not isinstance(fuels, dict):
        return False

    for fuel, rows in fuels.items():
        if not isinstance(rows, list):
            continue
        aggregates = aggregates_by_fuel.get(str(fuel), {})
        for row in rows:
            if not isinstance(row, dict):
                continue
            raw_hour = row.get("cycle_hour", row.get("hour"))
            try:
                hour = int(raw_hour)
            except (TypeError, ValueError):
                continue
            aggregate = aggregates.get(hour)
            if aggregate is None:
                continue
            price_sum, price_count = aggregate
            if price_count <= 0:
                continue

            next_values = {
                "price_count": int(price_count),
                "price_sum": round(float(price_sum), 6),
                "price_avg": round(float(price_sum / price_count), 6),
            }
            for key, value in next_values.items():
                if row.get(key) != value:
                    row[key] = value
                    changed = True

    if changed:
        summary["price_level_enriched_at"] = datetime.now(TZ).isoformat(timespec="seconds")
    return changed


def enrich_range(root: Path, start: date, end: date, changed_paths_file: Path | None = None) -> list[Path]:
    prices = _load_prices(DateRange(start - timedelta(days=1), end))
    changed_paths: list[Path] = []

    for target_day in _date_range(start, end):
        path = _management_path(root, target_day)
        if not path.exists():
            continue
        summary = json.loads(path.read_text(encoding="utf-8"))
        aggregates_by_fuel = {
            fuel: _hourly_price_aggregates(prices, root, target_day, fuel)
            for fuel in FUELS
        }
        if _add_price_fields(summary, aggregates_by_fuel):
            path.write_text(json.dumps(summary, ensure_ascii=False), encoding="utf-8")
            changed_paths.append(path)
            print(f"Enriched {path.relative_to(root)}")

    if changed_paths_file is not None:
        changed_paths_file.parent.mkdir(parents=True, exist_ok=True)
        changed_paths_file.write_text(
            "".join(f"{path.relative_to(root).as_posix()}\n" for path in changed_paths),
            encoding="utf-8",
        )

    print(f"Enriched {len(changed_paths)} management summary file(s).")
    return changed_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-date", type=_parse_date)
    parser.add_argument("--end-date", type=_parse_date)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--changed-paths-file", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    today = datetime.now(TZ).date()
    end = args.end_date or today - timedelta(days=1)
    start = args.start_date or end - timedelta(days=args.days - 1)
    if start > end:
        raise SystemExit("--start-date must be on or before --end-date")
    enrich_range(args.output_root, start, end, args.changed_paths_file)


if __name__ == "__main__":
    main()
