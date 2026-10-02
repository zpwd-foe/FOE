from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from capture_evidence import load_capture_context, sha256
from automation.build_pair import input_manifest
from generate_contribution_dashboard import (
    audit_inventory_delta, build_payload, main, merge_exports, read_existing_payload,
)
import test_generate_contribution_dashboard as contribution_tests


class CaptureAlignmentTests(unittest.TestCase):
    write_export = contribution_tests.ContributionMergeTests.write_export
    write_treasury = staticmethod(contribution_tests.ContributionMergeTests.write_treasury)
    row = staticmethod(contribution_tests.ContributionMergeTests.row)

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.sources = self.root / "input/guild-goods-contribution"
        self.sources.mkdir(parents=True)
        self.baseline = self.sources / "GuildTreasury-2026-08-26.csv"
        self.current = self.sources / "GuildTreasury-2026-08-27.csv"
        self.before = self.root / "input/stats-2026-08-26.csv"
        self.after = self.root / "input/stats-2026-08-27.csv"
        self.output = self.root / "contribution-data.js"
        self.baseline_row = self.row()
        self.included = self.row(amount=7, timestamp="8/27/2026 9:05:00 PM")
        self.pending = [
            self.row(amount=248, timestamp="8/27/2026 9:13:00 PM"),
            self.row(amount=-20, good="Glyph Circuits", timestamp="8/27/2026 9:14:00 PM"),
        ]
        self.write_export(self.baseline, [self.baseline_row])
        self.write_export(self.current, [*self.pending, self.included, self.baseline_row])
        self.write_treasury(self.before, [100] * 5)
        self.write_treasury(self.after, [107, 100, 100, 100, 100])
        rows, _ = merge_exports([self.baseline])
        payload = build_payload(rows, "Fixture guild", source_files=[self.baseline], inventory_audit={
            "status": "passed", "currentContributionSha256": sha256(self.baseline),
            "currentTreasurySha256": sha256(self.before),
        })
        self.output.write_text("window.CONTRIBUTION_DATA = " + json.dumps(payload) + ";\n")
        self.evidence_dir = self.root / ".foe-refresh/evidence"
        self.evidence_dir.mkdir(parents=True)
        self.evidence = self.evidence_dir / "foe-contribution-pages-0123456789abcdef.json"
        self.evidence.write_text(json.dumps({
            "version": 1, "status": "failed", "treasuryCapturedAt": "2026-08-28T01:11:10.474Z",
            "treasuryTimezoneOffsetMinutes": 240,
            "pages": [{"rows": [{"timestamp": "Thu Aug 27 2026 21:05:00 GMT-0400 (Eastern Daylight Time)"}]}],
        }))
        self.state_path = self.root / ".foe-forge-hammer-state.json"
        self.state = {
            "date": "2026-08-27", "requested_exports": {"treasury": False},
            "treasury": {"sha256": sha256(self.after)},
            "contributions": {"sha256": sha256(self.current)},
            "previous_attempt": {
                "date": "2026-08-27", "requested_exports": {"treasury": True},
                "page_evidence": {"status": "saved", "file": self.evidence.name, "sha256": sha256(self.evidence)},
            },
        }
        self.save_state()

    def save_state(self):
        self.state_path.write_text(json.dumps(self.state))

    def generate(self):
        argv = ["generate_contribution_dashboard.py", "--input-dir", str(self.sources), "--output", str(self.output)]
        with mock.patch("sys.argv", argv), mock.patch("generate_contribution_dashboard.publish_dashboard", return_value={}):
            main()
        return read_existing_payload(self.output)

    def test_recovery_preserves_signed_pending_rows_and_next_day_counts_them_once(self):
        original = {p: p.read_bytes() for p in (self.baseline, self.current, self.before, self.after)}
        payload = self.generate()
        audit = payload["meta"]["inventoryAudit"]
        self.assertEqual(audit["pendingRecordCount"], 2)
        self.assertEqual(audit["pendingSignedAmount"], 228)
        self.assertEqual(payload["meta"]["recordCount"], 4)
        self.assertEqual(payload["meta"]["duplicateRecordCount"], 1)
        first_output = self.output.read_bytes()
        self.generate()
        self.assertEqual(self.output.read_bytes(), first_output)
        for path, content in original.items():
            self.assertEqual(path.read_bytes(), content)

        tomorrow = self.sources / "GuildTreasury-2026-08-28.csv"
        tomorrow_treasury = self.root / "input/stats-2026-08-28.csv"
        fresh = self.row(amount=10, timestamp="8/28/2026 7:00:00 PM")
        self.write_export(tomorrow, [fresh, *self.pending, self.included])
        self.write_treasury(tomorrow_treasury, [365, 80, 100, 100, 100])
        # No current capture evidence is needed when the strict signed audit
        # including the prior pending records balances exactly.
        tomorrow_payload = self.generate()
        tomorrow_audit = tomorrow_payload["meta"]["inventoryAudit"]
        self.assertEqual(tomorrow_audit["carriedPendingRecordCount"], 2)
        self.assertEqual(tomorrow_audit["carriedPendingSignedAmount"], 228)
        self.assertEqual(tomorrow_audit["pendingRecordCount"], 0)
        self.assertEqual(tomorrow_payload["meta"]["recordCount"], 5)
        self.assertEqual(sum(r[5] for r in tomorrow_payload["records"]), 250)
        snapshot = self.output.read_bytes()
        self.generate()
        self.assertEqual(self.output.read_bytes(), snapshot)
        third = self.sources / "GuildTreasury-2026-08-29.csv"
        third_treasury = self.root / "input/stats-2026-08-29.csv"
        self.write_export(third, [self.row(amount=1, timestamp="8/29/2026 7:00:00 PM"), fresh])
        self.write_treasury(third_treasury, [366, 80, 100, 100, 100])
        third_payload = self.generate()
        self.assertEqual(third_payload["meta"]["inventoryAudit"]["carriedPendingRecordCount"], 0)
        self.assertEqual(sum(r[5] for r in third_payload["records"]), 251)

    def test_unexplained_mismatch_is_not_hidden_by_the_capture_cutoff(self):
        self.write_treasury(self.after, [108, 100, 100, 100, 100])
        self.state["treasury"]["sha256"] = sha256(self.after)
        self.save_state()
        with self.assertRaisesRegex(ValueError, "All-goods inventory audit failed"):
            self.generate()

    def test_capture_minute_is_ambiguous_even_if_totals_could_be_made_to_balance(self):
        self.included[6] = "8/27/2026 9:11:00 PM"
        self.write_export(self.current, [*self.pending, self.included, self.baseline_row])
        self.state["contributions"]["sha256"] = sha256(self.current)
        self.save_state()
        with self.assertRaisesRegex(ValueError, "capture minute are ambiguous"):
            self.generate()

    def test_missing_evidence_does_not_enable_arbitrary_row_exclusion(self):
        self.state_path.unlink()
        with self.assertRaisesRegex(ValueError, "All-goods inventory audit failed"):
            self.generate()

    def test_changed_evidence_or_treasury_cannot_reuse_recovery(self):
        self.generate()
        self.evidence.write_text(self.evidence.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "evidence checksum"):
            self.generate()
        self.state["previous_attempt"]["page_evidence"]["sha256"] = sha256(self.evidence)
        self.state["previous_attempt"]["treasury"] = {"sha256": "0" * 64}
        self.save_state()
        with self.assertRaisesRegex(ValueError, "different CSV"):
            self.generate()

    def test_legacy_timezone_is_read_from_source_evidence_and_inputs_are_manifested(self):
        data = json.loads(self.evidence.read_text())
        del data["treasuryTimezoneOffsetMinutes"]
        self.evidence.write_text(json.dumps(data))
        self.state["previous_attempt"]["page_evidence"]["sha256"] = sha256(self.evidence)
        self.save_state()
        context = load_capture_context(self.root, self.current, self.after)
        self.assertEqual(context["treasuryCapturedAt"], "2026-08-27T21:11:10.474000")
        manifest = input_manifest(self.root)
        self.assertIn(".foe-forge-hammer-state.json", manifest)
        self.assertIn(str(self.evidence.relative_to(self.root)), manifest)

    def test_pending_records_with_mixed_production_amounts_are_preserved(self):
        batch = contribution_tests.ContributionMergeTests.production_batch([3, 7, 3, 3, 3])
        for row in batch:
            row[6] = "8/27/2026 9:13:00 PM"
        self.write_export(self.current, [*batch, self.included, self.baseline_row])
        self.state["contributions"]["sha256"] = sha256(self.current)
        self.save_state()
        payload = self.generate()
        self.assertEqual(payload["meta"]["inventoryAudit"]["pendingRecordCount"], 5)
        self.assertEqual(payload["meta"]["recordCount"], 7)
        tomorrow = self.sources / "GuildTreasury-2026-08-28.csv"
        tomorrow_treasury = self.root / "input/stats-2026-08-28.csv"
        self.write_export(tomorrow, [self.row(amount=10, timestamp="8/28/2026 7:00:00 PM"), *batch])
        self.write_treasury(tomorrow_treasury, [120, 103, 107, 103, 103])
        following = self.generate()
        self.assertEqual(following["meta"]["inventoryAudit"]["carriedPendingRecordCount"], 5)
        self.assertEqual(following["meta"]["recordCount"], 8)

    def test_corrupt_pending_history_is_rejected(self):
        payload = self.generate()
        payload["meta"]["inventoryAudit"]["pendingSignedAmount"] += 1
        tomorrow = self.sources / "GuildTreasury-2026-08-28.csv"
        self.write_export(tomorrow, [self.row(amount=10, timestamp="8/28/2026 7:00:00 PM")])
        with self.assertRaisesRegex(ValueError, "Pending contribution history is inconsistent"):
            audit_inventory_delta(self.current, tomorrow, self.after, self.after, baseline_payload=payload)


if __name__ == "__main__":
    unittest.main()
