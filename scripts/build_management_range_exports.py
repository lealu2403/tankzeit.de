#!/usr/bin/env python3
"""Build range-ready management exports from dated daily snapshots."""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import pandas as pd


TZ = ZoneInfo("Europe/Berlin")
FUELS: tuple[str, ...] = ("diesel", "e10", "e5")
DEFAULT_START_DATE = date(2026, 4, 2)

OVERVIEW_COLUMNS: tuple[str, ...] = (
    "date",
    "fuel",
    "station_count",
    "view_mode",
    "bucket_count",
    "market_count",
    "market_min",
    "market_q1",
    "market_median",
    "market_avg",
    "market_q3",
    "market_max",
    "peak_bucket_label",
    "peak_bucket_count",
    "peak_bucket_share",
    "increase_stations",
    "fallback_stations",
    "delayed_increase_stations",
)
BRAND_COLUMNS: tuple[str, ...] = (
    "date",
    "fuel",
    "brand",
    "count",
    "min",
    "q1",
    "median",
    "avg",
    "q3",
    "max",
)
HOURLY_COLUMNS: tuple[str, ...] = (
    "date",
    "fuel",
    "view_mode",
    "bucket_index",
    "clock_hour",
    "label",
    "count",
    "min",
    "q1",
    "median",
    "q3",
    "max",
)
HISTOGRAM_COLUMNS: tuple[str, ...] = (
    "date",
    "fuel",
    "bucket_minutes",
    "bucket_minute",
    "bucket_label",
    "count",
    "stations",
    "increase_count",
    "fallback_count",
    "share",
)


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def _default_end_date() -> date:
    return date.today() - timedelta(days=1)


def _iter_days(start_date: date, end_date: date) -> Iterable[date]:
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def _snapshot_path(root: Path, day: date) -> Path:
    return root / "data2" / f"{day:%Y}" / f"{day:%m}" / f"{day:%d}" / "management_boxplots.json"


def _default_output_dir(root: Path) -> Path:
    return root / "data2" / "ranges" / "management"


def _load_snapshot(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _market_row(payload: dict[str, Any], fuel: str) -> dict[str, Any]:
    brands = payload.get("brand_distributions", {}).get(fuel) or []
    return next((row for row in brands if str(row.get("brand")) == "Gesamtmarkt"), {})


def _overview_row(snapshot_date: str, payload: dict[str, Any], fuel: str) -> dict[str, Any]:
    market = _market_row(payload, fuel)
    summary = payload.get("noon_reference_summaries", {}).get(fuel) or {}
    return {
        "date": snapshot_date,
        "fuel": fuel,
        "station_count": int((payload.get("station_counts", {}) or {}).get(fuel, 0) or 0),
        "view_mode": str((payload.get("view_modes", {}) or {}).get(fuel) or ""),
        "bucket_count": int((payload.get("bucket_counts", {}) or {}).get(fuel, 0) or 0),
        "market_count": int(market.get("count", 0) or 0),
        "market_min": float(market.get("min", 0.0) or 0.0),
        "market_q1": float(market.get("q1", 0.0) or 0.0),
        "market_median": float(market.get("median", 0.0) or 0.0),
        "market_avg": float(market.get("avg", 0.0) or 0.0),
        "market_q3": float(market.get("q3", 0.0) or 0.0),
        "market_max": float(market.get("max", 0.0) or 0.0),
        "peak_bucket_label": str(summary.get("peak_bucket_label") or ""),
        "peak_bucket_count": int(summary.get("peak_bucket_count", 0) or 0),
        "peak_bucket_share": float(summary.get("peak_bucket_share", 0.0) or 0.0),
        "increase_stations": int(summary.get("increase_stations", 0) or 0),
        "fallback_stations": int(summary.get("fallback_stations", 0) or 0),
        "delayed_increase_stations": int(summary.get("delayed_increase_stations", 0) or 0),
    }


def _brand_rows(snapshot_date: str, payload: dict[str, Any], fuel: str) -> list[dict[str, Any]]:
    rows = payload.get("brand_distributions", {}).get(fuel) or []
    return [
        {
            "date": snapshot_date,
            "fuel": fuel,
            "brand": str(row.get("brand") or ""),
            "count": int(row.get("count", 0) or 0),
            "min": float(row.get("min", 0.0) or 0.0),
            "q1": float(row.get("q1", 0.0) or 0.0),
            "median": float(row.get("median", 0.0) or 0.0),
            "avg": float(row.get("avg", 0.0) or 0.0),
            "q3": float(row.get("q3", 0.0) or 0.0),
            "max": float(row.get("max", 0.0) or 0.0),
        }
        for row in rows
    ]


def _hourly_rows(snapshot_date: str, payload: dict[str, Any], fuel: str) -> list[dict[str, Any]]:
    rows = payload.get("fuels", {}).get(fuel) or []
    view_mode = str((payload.get("view_modes", {}) or {}).get(fuel) or "")
    flattened: list[dict[str, Any]] = []
    for row in rows:
        bucket_index = row.get("cycle_hour")
        if bucket_index is None:
            bucket_index = row.get("hour")
        flattened.append(
            {
                "date": snapshot_date,
                "fuel": fuel,
                "view_mode": view_mode,
                "bucket_index": int(bucket_index or 0),
                "clock_hour": int(row.get("clock_hour", row.get("hour", 0)) or 0),
                "label": str(row.get("label") or ""),
                "count": int(row.get("count", 0) or 0),
                "min": float(row.get("min", 0.0) or 0.0),
                "q1": float(row.get("q1", 0.0) or 0.0),
                "median": float(row.get("median", 0.0) or 0.0),
                "q3": float(row.get("q3", 0.0) or 0.0),
                "max": float(row.get("max", 0.0) or 0.0),
            }
        )
    return flattened


def _histogram_rows(snapshot_date: str, payload: dict[str, Any], fuel: str) -> list[dict[str, Any]]:
    bucket_minutes = int(payload.get("noon_reference_bucket_minutes", 0) or 0)
    rows = payload.get("noon_reference_histograms", {}).get(fuel) or []
    return [
        {
            "date": snapshot_date,
            "fuel": fuel,
            "bucket_minutes": bucket_minutes,
            "bucket_minute": int(row.get("bucket_minute", 0) or 0),
            "bucket_label": str(row.get("bucket_label") or ""),
            "count": int(row.get("count", 0) or 0),
            "stations": int(row.get("stations", 0) or 0),
            "increase_count": int(row.get("increase_count", 0) or 0),
            "fallback_count": int(row.get("fallback_count", 0) or 0),
            "share": float(row.get("share", 0.0) or 0.0),
        }
        for row in rows
    ]


def _write_csv(path: Path, rows: list[dict[str, Any]], columns: tuple[str, ...]) -> None:
    frame = pd.DataFrame(rows, columns=columns)
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, float_format="%.6f")


def build_management_range_exports(
    root: Path,
    start_date: date,
    end_date: date,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    export_dir = output_dir or _default_output_dir(root)

    overview_rows: list[dict[str, Any]] = []
    brand_rows: list[dict[str, Any]] = []
    hourly_rows: list[dict[str, Any]] = []
    histogram_rows: list[dict[str, Any]] = []
    available_dates: list[str] = []
    missing_dates: list[str] = []

    for target_day in _iter_days(start_date, end_date):
        snapshot_path = _snapshot_path(root, target_day)
        payload = _load_snapshot(snapshot_path)
        if payload is None:
            missing_dates.append(target_day.isoformat())
            continue

        snapshot_date = str(payload.get("snapshot_date") or target_day.isoformat())
        available_dates.append(snapshot_date)
        for fuel in FUELS:
            overview_rows.append(_overview_row(snapshot_date, payload, fuel))
            brand_rows.extend(_brand_rows(snapshot_date, payload, fuel))
            hourly_rows.extend(_hourly_rows(snapshot_date, payload, fuel))
            histogram_rows.extend(_histogram_rows(snapshot_date, payload, fuel))

    overview_path = export_dir / "overview.csv"
    brand_path = export_dir / "brand_prices.csv"
    hourly_path = export_dir / "hourly_deltas.csv"
    histogram_path = export_dir / "reference_histograms.csv"
    manifest_path = export_dir / "manifest.json"

    _write_csv(overview_path, overview_rows, OVERVIEW_COLUMNS)
    _write_csv(brand_path, brand_rows, BRAND_COLUMNS)
    _write_csv(hourly_path, hourly_rows, HOURLY_COLUMNS)
    _write_csv(histogram_path, histogram_rows, HISTOGRAM_COLUMNS)

    manifest = {
        "dataset": "management-range-v1",
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "requested_start_date": start_date.isoformat(),
        "requested_end_date": end_date.isoformat(),
        "available_start_date": available_dates[0] if available_dates else None,
        "available_end_date": available_dates[-1] if available_dates else None,
        "available_dates": available_dates,
        "missing_dates": missing_dates,
        "files": {
            "overview": overview_path.name,
            "brand_prices": brand_path.name,
            "hourly_deltas": hourly_path.name,
            "reference_histograms": histogram_path.name,
        },
        "row_counts": {
            "overview": len(overview_rows),
            "brand_prices": len(brand_rows),
            "hourly_deltas": len(hourly_rows),
            "reference_histograms": len(histogram_rows),
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return {
        "output_dir": export_dir,
        "manifest_path": manifest_path,
        "manifest": manifest,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root. Defaults to the project root.",
    )
    parser.add_argument(
        "--start-date",
        type=_parse_date,
        default=DEFAULT_START_DATE,
        help=f"First management snapshot date to include. Defaults to {DEFAULT_START_DATE:%Y-%m-%d}.",
    )
    parser.add_argument(
        "--end-date",
        type=_parse_date,
        default=_default_end_date(),
        help="Last management snapshot date to include. Defaults to yesterday.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Optional export directory. Defaults to data2/ranges/management under the repository root.",
    )
    args = parser.parse_args()
    if args.end_date < args.start_date:
        parser.error("--end-date must be on or after --start-date.")
    return args


def main() -> None:
    args = parse_args()
    result = build_management_range_exports(
        root=args.root,
        start_date=args.start_date,
        end_date=args.end_date,
        output_dir=args.output_dir,
    )
    manifest = result["manifest"]
    print(f"Wrote management range exports to {result['output_dir']}")
    print(
        f"Available dates: {len(manifest['available_dates'])}, "
        f"missing dates: {len(manifest['missing_dates'])}"
    )


if __name__ == "__main__":
    main()
