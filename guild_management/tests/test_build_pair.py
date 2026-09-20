from __future__ import annotations

import datetime as dt
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from automation.build_pair import (
    AutomationError, build_pair, input_manifest, load_state,
    output_hashes, restore_pair, save_state,
)


class PairedBuildTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name)
        for name, text in {
            "input/stats-2026-09-19.csv": "saved treasury",
            "input/guild-goods-contribution/GuildTreasury-2026-09-19.csv": "saved logs",
            "site/data/treasury-data.js": "old treasury",
            "site/data/contribution-data.js": "old contributions",
            "site/data/resources.json": "required config",
            "dashboard/index.html": "old complete dashboard",
            "generate_treasury_dashboard.py": "# test generator",
            "generate_contribution_dashboard.py": "# test generator",
        }.items():
            path = self.project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        self.treasury = self.project / "input/stats-2026-09-19.csv"
        self.old = output_hashes(self.project)
        self.inputs = input_manifest(self.project)
        self.run_mock = self.start_patch("automation.build_pair.run_step", side_effect=self.generate)
        self.start_patch("automation.build_pair.treasury_snapshot_dates", return_value=(dt.date(2026, 9, 18),))
        self.validation = self.start_patch("automation.build_pair.validate_pair", return_value=(dt.date(2026, 9, 19),) * 2)

    def start_patch(self, *args, **kwargs):
        patch = mock.patch(*args, **kwargs)
        result = patch.start()
        self.addCleanup(patch.stop)
        return result

    def generate(self, command, snapshot, log) -> None:
        self.assertEqual((snapshot / "site/data/resources.json").read_text(), "required config")
        self.assertEqual(output_hashes(self.project), self.old)
        name = "contribution-data.js" if "contribution" in command[2] else "treasury-data.js"
        (snapshot / "site/data" / name).write_text("new " + name)
        (snapshot / "dashboard").mkdir(exist_ok=True)
        (snapshot / "dashboard/index.html").write_text("new complete dashboard")

    def test_failed_second_generator_leaves_both_live_datasets_unchanged(self) -> None:
        def fail(command, snapshot, log):
            self.generate(command, snapshot, log)
            if "treasury" in command[2]:
                raise AutomationError("All-goods audit failed: Pearls (-3)")
        self.run_mock.side_effect = fail
        with self.assertRaisesRegex(AutomationError, "Pearls"):
            build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)
        self.assertEqual(input_manifest(self.project), self.inputs)
        self.assertIn("Pearls", load_state(self.project)["failure"]["message"])

    def test_failed_validation_keeps_last_good_outputs(self) -> None:
        self.validation.side_effect = AutomationError("invalid history")
        with self.assertRaisesRegex(AutomationError, "invalid history"):
            build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)

    def test_mismatched_capture_dates_are_not_promoted(self) -> None:
        self.validation.return_value = (dt.date(2026, 9, 18),) * 2
        with self.assertRaisesRegex(AutomationError, "dates do not match"):
            build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)

    def test_missing_last_good_payload_requires_review(self) -> None:
        (self.project / "site/data/treasury-data.js").unlink()
        with self.assertRaisesRegex(AutomationError, "last-good dashboard pair is incomplete"):
            build_pair(self.project, self.treasury)
        self.run_mock.assert_not_called()

    def test_success_is_repeatable_and_does_not_rewrite_inputs(self) -> None:
        state = build_pair(self.project, self.treasury)
        self.assertEqual(state["phase"], "complete")
        self.assertNotEqual(output_hashes(self.project), self.old)
        self.assertEqual(input_manifest(self.project), self.inputs)
        self.run_mock.reset_mock()
        self.assertEqual(build_pair(self.project, self.treasury), state)
        self.run_mock.assert_not_called()
        self.assertEqual((self.project / ".foe-refresh/pair.json").stat().st_mode & 0o777, 0o600)

    def test_resume_uses_validated_checkpoint_without_rebuilding(self) -> None:
        build_pair(self.project, self.treasury, promote=False)
        self.assertEqual(output_hashes(self.project), self.old)
        self.run_mock.reset_mock()
        state = build_pair(self.project, self.treasury)
        self.assertEqual(state["phase"], "complete")
        self.run_mock.assert_not_called()

    def test_changed_input_or_staging_output_is_not_published(self) -> None:
        def mutate(command, snapshot, log):
            self.generate(command, snapshot, log)
            self.treasury.write_text("changed while generating")
        self.run_mock.side_effect = mutate
        with self.assertRaisesRegex(AutomationError, "Inputs or code changed"):
            build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)

    def test_tampered_validated_snapshot_is_rejected(self) -> None:
        state = build_pair(self.project, self.treasury, promote=False)
        snapshot = self.project / ".foe-refresh" / state["runId"] / "snapshot"
        (snapshot / "dashboard/index.html").write_text("unexpected edit")
        with self.assertRaisesRegex(AutomationError, "staging output was modified"):
            build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)

    def test_missing_contribution_cannot_resume_by_using_yesterdays_logs(self) -> None:
        (self.project / "input/guild-goods-contribution/GuildTreasury-2026-09-19.csv").unlink()
        with self.assertRaisesRegex(AutomationError, "contribution CSV is missing"):
            build_pair(self.project, self.treasury)
        self.run_mock.assert_not_called()

    def test_promotion_error_rolls_back_both_payloads_and_dashboard(self) -> None:
        original_replace = os.replace
        failed = False
        def interrupt(source, destination):
            nonlocal failed
            if not failed and "/ready/" in str(source) and str(destination).endswith("contribution-data.js"):
                failed = True
                raise OSError("simulated disk failure")
            return original_replace(source, destination)
        with mock.patch("automation.build_pair.os.replace", side_effect=interrupt):
            with self.assertRaisesRegex(OSError, "disk failure"):
                build_pair(self.project, self.treasury)
        self.assertEqual(output_hashes(self.project), self.old)
        self.assertEqual(build_pair(self.project, self.treasury)["phase"], "complete")

    def test_crash_checkpoint_restores_before_next_build(self) -> None:
        state = build_pair(self.project, self.treasury, promote=False)
        run = self.project / ".foe-refresh" / state["runId"]
        backup = run / "backup/dashboard"
        backup.parent.mkdir()
        os.replace(self.project / "dashboard", backup)
        state["phase"] = "promoting"
        save_state(self.project / ".foe-refresh/pair.json", state)
        self.assertEqual(build_pair(self.project, self.treasury)["phase"], "complete")

    def test_rollback_does_not_overwrite_unrecognized_user_changes(self) -> None:
        state = build_pair(self.project, self.treasury, promote=False)
        run = self.project / ".foe-refresh" / state["runId"]
        backup = run / "backup/dashboard"
        backup.parent.mkdir()
        os.replace(self.project / "dashboard", backup)
        (self.project / "dashboard").mkdir()
        (self.project / "dashboard/index.html").write_text("user edit")
        with self.assertRaisesRegex(AutomationError, "outside the refresh"):
            restore_pair(self.project, state)
        self.assertEqual((self.project / "dashboard/index.html").read_text(), "user edit")


if __name__ == "__main__":
    unittest.main()
