import argparse
import contextlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from automation.prepare_checkout import AutomationError, prepare_checkout
from automation.run_daily_refresh import ensure_remote_is_current, is_isolated_checkout, main


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        self.repo = self.root / "development"
        self.project = self.repo / "guild_management"
        (self.project / "automation").mkdir(parents=True)
        (self.project / "automation/build_pair.py").write_text("# test fixture\n")
        (self.project / ".gitignore").write_text("input/\n.env.foe\n.foe-*\n")
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Automation Test")
        self.git("config", "user.email", "automation@example.invalid")
        self.git("add", ".")
        self.git("commit", "-m", "FOE-30: test fixture")
        remote = self.root / "remote.git"
        self.git("init", "--bare", str(remote))
        self.git("remote", "add", "origin", str(remote))
        self.git("push", "-u", "origin", "main")
        hook = self.repo / ".git/hooks/pre-push"
        hook.write_text("#!/bin/sh\n# jira-commit-push privacy guard\nexit 0\n")
        hook.chmod(0o700)
        (self.project / "input/guild-goods-contribution").mkdir(parents=True)
        (self.project / "input/stats-2026-09-19.csv").write_text("saved treasury")
        (self.project / "input/guild-goods-contribution/GuildTreasury-2026-09-19.csv").write_text("saved logs")
        (self.project / ".env.foe").write_text("PRIVATE_TEST_VALUE=not-for-git\n")
        (self.project / ".foe-forge-hammer-state.json").write_text('{"status":"failed"}')

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, capture_output=True,
                              text=True, check=True).stdout.strip()

    def test_prepares_clean_clone_with_private_inputs_and_guard(self):
        destination = self.root / "automation"
        project = prepare_checkout(self.project, destination)
        self.assertEqual(project, destination / "guild_management")
        self.assertEqual((project / ".env.foe").read_text(), (self.project / ".env.foe").read_text())
        self.assertEqual((project / ".env.foe").stat().st_mode & 0o777, 0o600)
        self.assertEqual((project / ".foe-forge-hammer-state.json").read_text(), '{"status":"failed"}')
        self.assertEqual((destination / ".git/hooks/pre-push").read_bytes(), (self.repo / ".git/hooks/pre-push").read_bytes())
        status = subprocess.run(["git", "status", "--porcelain"], cwd=project,
                                capture_output=True, text=True, check=True)
        self.assertEqual(status.stdout, "")

    def test_existing_destination_is_never_overwritten(self):
        with self.assertRaisesRegex(AutomationError, "must not exist"):
            prepare_checkout(self.project, self.root)

    def test_development_edits_and_index_are_preserved_and_not_deployed(self):
        code = self.project / "automation/build_pair.py"
        code.write_text("# staged development work\n")
        self.git("add", str(code))
        code.write_text("# further unstaged development work\n")
        admin = self.project / "admin/chat_thread/input/private"
        admin.parent.mkdir(parents=True)
        admin.write_text("private unfinished work\n")
        before_status = self.git("status", "--porcelain")
        before_index = self.git("diff", "--cached")
        checkpoint = {"stage": "complete", "lastSuccess": "2026-09-23T22:15:00-04:00"}
        (self.project / ".foe-daily-refresh.json").write_text(json.dumps(checkpoint))

        project = prepare_checkout(self.project, self.root / "automation")

        self.assertEqual((project / "automation/build_pair.py").read_text(), "# test fixture\n")
        self.assertFalse((project / "admin").exists())
        self.assertEqual(json.loads((project / ".foe-daily-refresh.json").read_text()), checkpoint)
        self.assertEqual(self.git("status", "--porcelain"), before_status)
        self.assertEqual(self.git("diff", "--cached"), before_index)
        self.assertEqual(code.read_text(), "# further unstaged development work\n")
        self.assertEqual(admin.read_text(), "private unfinished work\n")

    def advance_remote(self):
        (self.project / "automation/build_pair.py").write_text("# updated remote code\n")
        self.git("add", ".")
        self.git("commit", "-m", "FOE-30: update fixture")
        self.git("push", "origin", "main")

    def test_isolated_checkout_accepts_only_a_clean_fast_forward(self):
        project = prepare_checkout(self.project, self.root / "automation")
        self.advance_remote()
        self.assertTrue(is_isolated_checkout(project, "main"))
        self.assertTrue(ensure_remote_is_current(project, "origin", "main", allow_fast_forward=True))
        self.assertEqual((project / "automation/build_pair.py").read_text(), "# updated remote code\n")
        self.assertFalse(ensure_remote_is_current(project, "origin", "main", allow_fast_forward=True))

    def test_development_checkout_does_not_automatically_fast_forward(self):
        project = prepare_checkout(self.project, self.root / "automation")
        (project / ".foe-isolated-checkout.json").unlink()
        self.advance_remote()
        self.assertFalse(is_isolated_checkout(project, "main"))
        with self.assertRaisesRegex(AutomationError, "branches differ"):
            ensure_remote_is_current(project, "origin", "main")
        self.assertEqual((project / "automation/build_pair.py").read_text(), "# test fixture\n")

    def test_fast_forward_preserves_unrelated_work_in_automation_repository(self):
        project = prepare_checkout(self.project, self.root / "automation")
        self.advance_remote()
        user_file = project.parent / "unfinished-work.txt"
        user_file.write_text("keep this\n")
        with self.assertRaisesRegex(AutomationError, "worktree is not clean"):
            ensure_remote_is_current(project, "origin", "main", allow_fast_forward=True)
        self.assertEqual(user_file.read_text(), "keep this\n")
        self.assertEqual((project / "automation/build_pair.py").read_text(), "# test fixture\n")

    def test_fast_forward_refuses_local_commits_and_divergence(self):
        project = prepare_checkout(self.project, self.root / "automation")
        (project / "local.txt").write_text("local work\n")
        for args in [("add", "."), ("commit", "-m", "FOE-30: local work")]:
            subprocess.run(["git", *args], cwd=project, check=True, capture_output=True)
        for diverged in (False, True):
            with self.subTest(diverged=diverged):
                if diverged:
                    self.advance_remote()
                with self.assertRaisesRegex(AutomationError, "branches differ"):
                    ensure_remote_is_current(project, "origin", "main", allow_fast_forward=True)
                self.assertEqual((project / "local.txt").read_text(), "local work\n")

    def test_preflight_failure_reports_saved_success_without_changing_checkpoint(self):
        checkpoint = {"stage": "complete", "lastSuccess": "2026-09-23T22:15:00-04:00"}
        state = self.project / ".foe-daily-refresh.json"
        state.write_text(json.dumps(checkpoint))
        (self.project / "unfinished.txt").write_text("keep this\n")
        args = argparse.Namespace(project_dir=self.project, resume=False,
                                  validate_only=False, notify=False)
        error = io.StringIO()
        with mock.patch("automation.run_daily_refresh.parse_args", return_value=args), contextlib.redirect_stderr(error):
            self.assertEqual(main(), 1)
        self.assertIn("Stage: preflight", error.getvalue())
        self.assertIn(checkpoint["lastSuccess"], error.getvalue())
        self.assertNotIn("--resume", error.getvalue())
        self.assertEqual(json.loads(state.read_text()), checkpoint)

    def test_pending_checkpoint_must_be_resolved_before_migration(self):
        (self.project / ".foe-daily-refresh.json").write_text('{"stage":"publishing"}')
        with self.assertRaisesRegex(AutomationError, "pending daily checkpoint"):
            prepare_checkout(self.project, self.root / "automation")

    def test_checkout_inside_development_repo_is_refused(self):
        with self.assertRaisesRegex(AutomationError, "outside the development"):
            prepare_checkout(self.project, self.repo / "automation")


if __name__ == "__main__":
    unittest.main()
