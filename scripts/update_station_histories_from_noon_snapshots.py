#!/usr/bin/env python3
"""Update per-station fuel histories from dated noon.csv snapshots."""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

try:
    from .noon_reference import FUELS
    from .noon_outputs import collect_history_rows, write_history_files
except ImportError:  # pragma: no cover
    from noon_reference import FUELS
    from noon_outputs import collect_history_rows, write_history_files


DEFAULT_HISTORY_START_DATE = date(2026, 4, 1)


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def _dated_noon_path(root: Path, target_day: date) -> Path:
    return root / "data2" / f"{target_day:%Y}" / f"{target_day:%m}" / f"{target_day:%d}" / "noon.csv"


def _iter_days(start_day: date, end_day: date) -> list[date]:
    days: list[date] = []
    current = start_day
    while current <= end_day:
        days.append(current)
        current += timedelta(days=1)
    return days


def update_station_histories(
    root: Path,
    start_day: date,
    end_day: date,
    changed_paths_file: Path | None = None,
    history_start_date: date = DEFAULT_HISTORY_START_DATE,
) -> list[Path]:
    rows_by_file: dict[tuple[str, str], list[dict[str, object]]] = {}
    used_snapshots = 0

    for target_day in _iter_days(start_day, end_day):
        noon_path = _dated_noon_path(root, target_day)
        if not noon_path.exists():
            print(f"Skip missing noon snapshot: {noon_path}")
            continue

        snapshot = pd.read_csv(noon_path, dtype={"station_uuid": "string"})
        collect_history_rows(
            rows_by_file,
            snapshot,
            target_day=target_day,
            history_start_date=history_start_date,
            fuels=FUELS,
        )
        used_snapshots += 1

    written_paths = write_history_files(root, rows_by_file)
    print(
        f"Updated {len(written_paths):,} station fuel history file(s) "
        f"from {used_snapshots:,} noon snapshot(s)."
    )

    if changed_paths_file is not None:
        changed_paths_file.parent.mkdir(parents=True, exist_ok=True)
        changed_paths_file.write_text(
            "".join(f"{path.relative_to(root).as_posix()}\n" for path in written_paths),
            encoding="utf-8",
        )

    return written_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--start-date", type=_parse_date, required=True)
    parser.add_argument("--end-date", type=_parse_date, required=True)
    parser.add_argument("--changed-paths-file", type=Path)
    args = parser.parse_args()
    if args.end_date < args.start_date:
        parser.error("--end-date must be on or after --start-date.")
    return args


def main() -> None:
    args = parse_args()
    update_station_histories(
        root=args.root,
        start_day=args.start_date,
        end_day=args.end_date,
        changed_paths_file=args.changed_paths_file,
    )


if __name__ == "__main__":
    main()
