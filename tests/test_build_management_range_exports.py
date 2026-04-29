import json
import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

import pandas as pd

from scripts.build_management_range_exports import build_management_range_exports


def _sample_payload(snapshot_date: str, diesel_market_median: float) -> dict[str, object]:
    return {
        "snapshot_date": snapshot_date,
        "station_counts": {"diesel": 100, "e10": 90, "e5": 80},
        "view_modes": {"diesel": "cycle", "e10": "cycle", "e5": "cycle"},
        "bucket_counts": {"diesel": 2, "e10": 2, "e5": 2},
        "fuels": {
            "diesel": [
                {
                    "cycle_hour": 0,
                    "clock_hour": 12,
                    "label": "12",
                    "count": 100,
                    "min": 0.0,
                    "q1": 0.0,
                    "median": 0.0,
                    "q3": 0.0,
                    "max": 0.0,
                },
                {
                    "cycle_hour": 1,
                    "clock_hour": 13,
                    "label": "13",
                    "count": 100,
                    "min": -0.1,
                    "q1": -0.08,
                    "median": -0.05,
                    "q3": -0.03,
                    "max": 0.01,
                },
            ],
            "e10": [
                {
                    "cycle_hour": 0,
                    "clock_hour": 12,
                    "label": "12",
                    "count": 90,
                    "min": 0.0,
                    "q1": 0.0,
                    "median": 0.0,
                    "q3": 0.0,
                    "max": 0.0,
                }
            ],
            "e5": [
                {
                    "cycle_hour": 0,
                    "clock_hour": 12,
                    "label": "12",
                    "count": 80,
                    "min": 0.0,
                    "q1": 0.0,
                    "median": 0.0,
                    "q3": 0.0,
                    "max": 0.0,
                }
            ],
        },
        "brand_distributions": {
            "diesel": [
                {
                    "brand": "Gesamtmarkt",
                    "count": 150,
                    "min": 1.95,
                    "q1": 2.1,
                    "median": diesel_market_median,
                    "avg": 2.2,
                    "q3": 2.3,
                    "max": 2.8,
                },
                {
                    "brand": "ARAL",
                    "count": 30,
                    "min": 2.0,
                    "q1": 2.15,
                    "median": 2.2,
                    "avg": 2.21,
                    "q3": 2.24,
                    "max": 2.5,
                },
            ],
            "e10": [
                {
                    "brand": "Gesamtmarkt",
                    "count": 150,
                    "min": 1.85,
                    "q1": 2.0,
                    "median": 2.05,
                    "avg": 2.06,
                    "q3": 2.08,
                    "max": 2.6,
                }
            ],
            "e5": [
                {
                    "brand": "Gesamtmarkt",
                    "count": 150,
                    "min": 1.9,
                    "q1": 2.05,
                    "median": 2.1,
                    "avg": 2.11,
                    "q3": 2.13,
                    "max": 2.7,
                }
            ],
        },
        "noon_reference_bucket_minutes": 15,
        "noon_reference_histograms": {
            "diesel": [
                {
                    "bucket_minute": 720,
                    "bucket_label": "12:00",
                    "count": 95,
                    "stations": 100,
                    "increase_count": 93,
                    "fallback_count": 7,
                    "share": 0.95,
                }
            ],
            "e10": [],
            "e5": [],
        },
        "noon_reference_summaries": {
            "diesel": {
                "stations": 100,
                "bucket_minutes": 15,
                "peak_bucket_label": "12:00",
                "peak_bucket_count": 95,
                "peak_bucket_share": 0.95,
                "increase_stations": 93,
                "fallback_stations": 7,
                "delayed_increase_stations": 90,
            },
            "e10": {"stations": 90, "bucket_minutes": 15},
            "e5": {"stations": 80, "bucket_minutes": 15},
        },
    }


class BuildManagementRangeExportsTests(unittest.TestCase):
    def test_build_management_range_exports_writes_flattened_range_files(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            day_1 = root / "data2" / "2026" / "04" / "02"
            day_2 = root / "data2" / "2026" / "04" / "03"
            day_1.mkdir(parents=True, exist_ok=True)
            day_2.mkdir(parents=True, exist_ok=True)
            day_1.joinpath("management_boxplots.json").write_text(
                json.dumps(_sample_payload("2026-04-02", 2.21), ensure_ascii=False),
                encoding="utf-8",
            )
            day_2.joinpath("management_boxplots.json").write_text(
                json.dumps(_sample_payload("2026-04-03", 2.24), ensure_ascii=False),
                encoding="utf-8",
            )

            result = build_management_range_exports(
                root=root,
                start_date=date(2026, 4, 2),
                end_date=date(2026, 4, 4),
            )

            export_dir = result["output_dir"]
            manifest = result["manifest"]
            overview = pd.read_csv(export_dir / "overview.csv")
            brands = pd.read_csv(export_dir / "brand_prices.csv")
            hourly = pd.read_csv(export_dir / "hourly_deltas.csv")
            histograms = pd.read_csv(export_dir / "reference_histograms.csv")

            self.assertEqual(manifest["available_dates"], ["2026-04-02", "2026-04-03"])
            self.assertEqual(manifest["missing_dates"], ["2026-04-04"])
            self.assertEqual(manifest["row_counts"]["overview"], 6)
            self.assertEqual(manifest["row_counts"]["brand_prices"], 8)
            self.assertEqual(manifest["row_counts"]["reference_histograms"], 2)

            diesel_overview = overview[
                (overview["date"] == "2026-04-03") & (overview["fuel"] == "diesel")
            ].iloc[0]
            self.assertEqual(diesel_overview["view_mode"], "cycle")
            self.assertAlmostEqual(diesel_overview["market_median"], 2.24)
            self.assertEqual(diesel_overview["peak_bucket_label"], "12:00")

            aral_row = brands[
                (brands["date"] == "2026-04-02")
                & (brands["fuel"] == "diesel")
                & (brands["brand"] == "ARAL")
            ].iloc[0]
            self.assertAlmostEqual(aral_row["median"], 2.2)

            hourly_row = hourly[
                (hourly["date"] == "2026-04-02")
                & (hourly["fuel"] == "diesel")
                & (hourly["bucket_index"] == 1)
            ].iloc[0]
            self.assertEqual(hourly_row["clock_hour"], 13)
            self.assertAlmostEqual(hourly_row["median"], -0.05)

            histogram_row = histograms[
                (histograms["date"] == "2026-04-03") & (histograms["fuel"] == "diesel")
            ].iloc[0]
            self.assertEqual(histogram_row["bucket_label"], "12:00")
            self.assertEqual(histogram_row["increase_count"], 93)


if __name__ == "__main__":
    unittest.main()
