from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from automation import run_daily_refresh as runner
from automation.build_pair import save_state
from export_forge_hammer_treasury import import_page_evidence
import test_export_forge_hammer_treasury as exporter_tests


class EvidenceTests(unittest.TestCase):
    def test_private_allowlist_preserves_identical_minute_granular_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            config = exporter_tests.ChromeProfileSafetyTests.config(Path(directory))
            config.download_dir.mkdir()
            tag = "0123456789abcdef"
            row = dict(player=123, resource="tea", amount=3, action="production",
                       timestamp="2026-09-19T17:09:00", cookie="secret", name="Private name")
            source = config.download_dir / f"foe-contribution-pages-{tag}.json"
            source.write_text(json.dumps(dict(version=1, pages=[dict(offset=0, rows=[row, row])], url="private")))
            result = import_page_evidence(config, tag)
            self.assertEqual(result["status"], "saved")
            target = Path(directory) / ".foe-refresh/evidence" / source.name
            text = target.read_text()
            rows = json.loads(text)["pages"][0]["rows"]
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0], rows[1])
            self.assertNotIn("secret", text)
            self.assertNotIn("Private name", text)
            self.assertNotIn("url", text)
            self.assertNotIn("id", rows[0])
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_absent_or_malformed_evidence_does_not_retry_or_block_export(self):
        with tempfile.TemporaryDirectory() as directory:
            config = exporter_tests.ChromeProfileSafetyTests.config(Path(directory))
            tag = "0123456789abcdef"
            self.assertEqual(import_page_evidence(config, tag)["status"], "unavailable")
            config.download_dir.mkdir()
            (config.download_dir / f"foe-contribution-pages-{tag}.json").write_text("[]")
            self.assertEqual(import_page_evidence(config, tag)["status"], "unavailable")


class ResumeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.project = Path(temporary.name).resolve()
        self.args = argparse.Namespace(project_dir=self.project, resume=True,
                                       publish=False, notify=False, validate_only=False,
                                       remote="origin", branch="main", ticket="FOE-30")
        self.path = self.project / ".foe-daily-refresh.json"
        self.checkpoint = dict(date="2026-09-19", baseHead="a" * 40,
                               stage="build and reconciliation", lastSuccess="2026-09-18")
        save_state(self.path, self.checkpoint)
        self.patch("parse_args", return_value=self.args)
        self.patch("git_output", return_value="a" * 40)
        self.patch("ensure_clean_start")
        self.remote = self.patch("ensure_remote_is_current", return_value=False)
        self.patch("project_changes", return_value=set())
        self.patch("ensure_only_generated_changes", return_value=set())
        self.validation = self.patch("run_offline_validation")
        self.run = self.patch("run")
        self.publish = self.patch("publish_generated_changes")
        build = mock.patch("automation.build_pair.build_pair", return_value=dict(outputs={}, throughDate="2026-09-19"))
        self.build = build.start()
        self.addCleanup(build.stop)

    def patch(self, name, **kwargs):
        patcher = mock.patch.object(runner, name, **kwargs)
        value = patcher.start()
        self.addCleanup(patcher.stop)
        return value

    def test_resume_build_never_invokes_exporter(self):
        self.assertEqual(runner.main(), 0)
        self.run.assert_not_called()
        self.build.assert_called_once_with(self.project, self.project / "input/stats-2026-09-19.csv")
        self.assertEqual(json.loads(self.path.read_text())["stage"], "complete")

    def test_failed_reconciliation_records_stage_and_last_success(self):
        self.build.side_effect = runner.AutomationError("ambiguous contribution rows")
        self.assertEqual(runner.main(), 1)
        self.run.assert_not_called()
        self.publish.assert_not_called()
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved["lastSuccess"], "2026-09-18")
        self.assertEqual(saved["stage"], "build and reconciliation")
        self.assertIn("ambiguous", saved["failure"])

    def test_publishing_resume_skips_export_and_rebuild(self):
        self.checkpoint["stage"] = "publishing"
        save_state(self.path, self.checkpoint)
        self.args.publish = True
        with mock.patch.object(runner, "resume_publish") as resume:
            self.assertEqual(runner.main(), 0)
        resume.assert_called_once()
        self.build.assert_not_called()
        self.run.assert_not_called()

    def test_publishing_resume_requires_explicit_publish(self):
        self.checkpoint["stage"] = "publishing"
        save_state(self.path, self.checkpoint)
        self.assertEqual(runner.main(), 1)
        self.build.assert_not_called()
        self.publish.assert_not_called()

    def test_invalid_checkpoint_fails_without_export(self):
        self.path.write_text("[]")
        self.assertEqual(runner.main(), 1)
        self.build.assert_not_called()
        self.run.assert_not_called()

    def test_fresh_run_downloads_once_and_builds_separately(self):
        self.args.resume = False
        self.assertEqual(runner.main(), 0)
        self.run.assert_called_once()
        command = self.run.call_args.args[0]
        self.assertIn("export_forge_hammer_treasury.py", command)
        self.assertIn("--no-refresh", command)
        self.assertEqual(self.validation.call_args_list[0].kwargs, dict(require_current_sources=False))
        self.build.assert_called_once()

    def test_export_failure_is_not_retried(self):
        self.args.resume = False
        self.run.side_effect = subprocess.CalledProcessError(1, "exporter")
        self.assertEqual(runner.main(), 1)
        self.run.assert_called_once()
        self.build.assert_not_called()
        self.assertEqual(json.loads(self.path.read_text())["stage"], "export")

    def test_fast_forward_restarts_before_validation_or_export(self):
        self.args.resume = False
        self.remote.return_value = True
        (self.project / ".foe-isolated-checkout.json").write_text(
            json.dumps({"version": 1, "branch": "main"})
        )
        with mock.patch.object(runner.os, "execv", side_effect=SystemExit(0)) as restart:
            with self.assertRaises(SystemExit):
                runner.main()
        restart.assert_called_once()
        self.assertTrue(self.remote.call_args.kwargs["allow_fast_forward"])
        self.validation.assert_not_called()
        self.run.assert_not_called()
        self.build.assert_not_called()
        self.assertEqual(json.loads(self.path.read_text()), self.checkpoint)

    def test_pending_publish_blocks_checkout_update_and_new_export(self):
        self.args.resume = False
        self.checkpoint["stage"] = "publishing"
        save_state(self.path, self.checkpoint)
        self.assertEqual(runner.main(), 1)
        self.remote.assert_not_called()
        self.run.assert_not_called()
        self.build.assert_not_called()
        self.assertEqual(json.loads(self.path.read_text()), self.checkpoint)


class ResumePublishTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.project = Path(directory.name)
        self.hook = self.project / "pre-push"
        self.hook.write_text("#!/bin/sh\nexit 0\n")
        self.hook.chmod(0o700)
        self.base, self.head = "a" * 40, "b" * 40
        self.remote = self.base
        self.checkpoint = dict(baseHead=self.base, outputs={}, throughDate="2026-09-19")
        self.args = argparse.Namespace(branch="main", remote="origin", ticket="FOE-30")

    def git(self, project, *args):
        responses = {
            ("branch", "--show-current"): "main",
            ("rev-parse", "HEAD"): self.head,
            ("rev-parse", "HEAD^"): self.base,
            ("rev-parse", "origin/main"): self.remote,
            ("rev-parse", "--show-prefix"): "",
            ("rev-parse", "--git-path", "hooks/pre-push"): str(self.hook),
            ("diff", "--name-only", self.base, self.head): "dashboard/index.html",
            ("log", "-1", "--format=%s"): "FOE-30: Refresh treasury and contribution data through September 19",
        }
        return responses[args]

    def resume(self):
        with mock.patch.object(runner, "git_output", side_effect=self.git), \
             mock.patch.object(runner, "ensure_clean_start"), \
             mock.patch("automation.build_pair.output_hashes", return_value={}), \
             mock.patch.object(runner, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            runner.resume_publish(self.project, self.checkpoint, self.args)
            return [call.args[0] for call in run.call_args_list]

    def test_push_failure_reuses_existing_commit(self):
        commands = self.resume()
        self.assertIn(["git", "push", "origin", "main"], commands)
        self.assertFalse(any("commit" in command or "add" in command for command in commands))

    def test_remote_divergence_refuses_merge_and_push(self):
        self.remote = "c" * 40
        with self.assertRaisesRegex(runner.AutomationError, "Remote advanced"):
            self.resume()

    def test_missing_privacy_hook_blocks_resumed_push(self):
        self.hook.unlink()
        with self.assertRaisesRegex(runner.AutomationError, "Privacy pre-push hook"):
            self.resume()


if __name__ == "__main__":
    unittest.main()
