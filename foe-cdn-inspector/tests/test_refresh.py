import contextlib
import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from foe_cdn_inspector.cli import build_parser, run_refresh
from foe_cdn_inspector.strings import StringEntry


INDEX_HTML = '''<script>const entries = {
  "2026-09-18": [{reportId: "2026-09-18_11-16-22"}],
  "2026-09-17": [{reportId: "2026-09-17_11-16-22"}]
};</script>'''


def refresh_args(folder: Path, *extra: str):
    return build_parser().parse_args([
        "refresh",
        "--output", str(folder / "snapshots"),
        "--results", str(folder / "results"),
        "--cache", str(folder / "cache"),
        "--dashboard-dir", str(folder / "dashboard"),
        *extra,
    ])


def history_report(report_id: str) -> dict:
    return {
        "date": report_id[:10],
        "report_id": report_id,
        "counts": {
            "assets": {"added": 0, "updated": 0, "removed": 0},
            "strings": {"added": 0, "removed": 0},
            "buildings": {"added": 0, "updated": 0, "removed": 0},
            "meta": {"staticdata": 0},
        },
        "files": [],
        "metadata_files": [],
        "strings": {"added": [], "removed": []},
        "buildings": {"added": [], "updated": [], "removed": []},
        "metadata_families": [],
    }


class RefreshTests(unittest.TestCase):
    def test_dry_run_plans_rolling_window_without_writing(self):
        with TemporaryDirectory() as folder_name:
            folder = Path(folder_name)
            args = refresh_args(folder, "--dry-run")
            output = io.StringIO()
            with patch("foe_cdn_inspector.cli.fetch_text", return_value=INDEX_HTML), contextlib.redirect_stdout(output):
                self.assertEqual(run_refresh(args), 0)
            plan = json.loads(output.getvalue().split("\n", 1)[1])
            self.assertEqual(plan["status"], "would_refresh")
            self.assertEqual(plan["history_since"], "2026-07-21")
            self.assertEqual(plan["history_until"], "2026-09-18")
            self.assertEqual(plan["string_reports"], 2)
            self.assertFalse((folder / "snapshots").exists())

    def test_failed_collection_keeps_current_dashboard(self):
        with TemporaryDirectory() as folder_name:
            folder = Path(folder_name)
            snapshots = folder / "snapshots"
            snapshots.mkdir()
            (snapshots / "latest.txt").write_text("2026-09-17_11-16-22\n", encoding="utf-8")
            dashboard = folder / "dashboard"
            dashboard.mkdir()
            (dashboard / "index.html").write_text("original", encoding="utf-8")
            (dashboard / "history.html").write_text("original archive", encoding="utf-8")
            args = refresh_args(folder)
            with (
                patch("foe_cdn_inspector.cli.fetch_text", side_effect=[INDEX_HTML, "bootstrap"]),
                patch("foe_cdn_inspector.cli.probe_bootstrap", return_value={"market_id": "zz"}),
                patch("foe_cdn_inspector.cli.collect_active_strings", return_value=([], [], [{"report_id": "failed"}])),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                with self.assertRaisesRegex(RuntimeError, "dashboard was not updated"):
                    run_refresh(args)
            self.assertEqual((dashboard / "index.html").read_text(encoding="utf-8"), "original")
            self.assertEqual((dashboard / "history.html").read_text(encoding="utf-8"), "original archive")
            self.assertEqual((snapshots / "latest.txt").read_text(encoding="utf-8").strip(), "2026-09-17_11-16-22")
            self.assertFalse((snapshots / "2026-09-18_11-16-22").exists())

    def test_unchanged_report_publishes_saved_snapshot_without_collecting(self):
        with TemporaryDirectory() as folder_name:
            folder = Path(folder_name)
            snapshots = folder / "snapshots"
            saved = snapshots / "2026-09-18_11-16-22" / "index.html"
            saved.parent.mkdir(parents=True)
            saved.write_text("saved dashboard", encoding="utf-8")
            saved.with_name("history.html").write_text("saved archive", encoding="utf-8")
            (snapshots / "latest.txt").write_text("2026-09-18_11-16-22\n", encoding="utf-8")
            args = refresh_args(folder)
            with (
                patch("foe_cdn_inspector.cli.fetch_text", return_value=INDEX_HTML),
                patch("foe_cdn_inspector.cli.collect_history") as collect,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(run_refresh(args), 0)
            collect.assert_not_called()
            self.assertEqual((folder / "dashboard" / "index.html").read_text(encoding="utf-8"), "saved dashboard")
            self.assertEqual((folder / "dashboard" / "history.html").read_text(encoding="utf-8"), "saved archive")

    def test_success_writes_snapshot_and_stable_dashboard(self):
        with TemporaryDirectory() as folder_name:
            folder = Path(folder_name)
            args = refresh_args(folder)
            reports = [history_report("2026-09-18_11-16-22"), history_report("2026-09-17_11-16-22")]
            strings = [StringEntry("GBP|Example", "2026-09-18_11-16-22", "2026-09-18_11-16-22")]
            with (
                patch("foe_cdn_inspector.cli.fetch_text", side_effect=[INDEX_HTML, "bootstrap"]),
                patch("foe_cdn_inspector.cli.probe_bootstrap", return_value={"market_id": "zz"}),
                patch("foe_cdn_inspector.cli.collect_active_strings", return_value=(strings, [], [])),
                patch("foe_cdn_inspector.cli.collect_history", return_value=(reports, [])) as collect,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(run_refresh(args), 0)
            collect.assert_called_once()
            self.assertTrue(collect.call_args.kwargs["full_details"])
            saved = folder / "snapshots" / "2026-09-18_11-16-22" / "index.html"
            stable = folder / "dashboard" / "index.html"
            self.assertEqual(stable.read_bytes(), saved.read_bytes())
            self.assertEqual(
                (folder / "dashboard" / "history.html").read_bytes(),
                saved.with_name("history.html").read_bytes(),
            )
            self.assertIn("GBP|Example", stable.read_text(encoding="utf-8"))
            self.assertEqual((folder / "snapshots" / "latest.txt").read_text(encoding="utf-8").strip(), "2026-09-18_11-16-22")
            result = json.loads((folder / "results" / "history-last-60-days.json").read_text(encoding="utf-8"))
            self.assertEqual(result["since"], "2026-07-21")
            self.assertEqual(result["until"], "2026-09-18")


if __name__ == "__main__":
    unittest.main()
