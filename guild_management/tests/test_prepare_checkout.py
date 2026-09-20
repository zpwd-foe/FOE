from pathlib import Path
import subprocess
import tempfile
import unittest

from automation.prepare_checkout import AutomationError, prepare_checkout


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

    def test_pending_checkpoint_must_be_resolved_before_migration(self):
        (self.project / ".foe-daily-refresh.json").write_text('{"stage":"publishing"}')
        with self.assertRaisesRegex(AutomationError, "pending daily checkpoint"):
            prepare_checkout(self.project, self.root / "automation")

    def test_checkout_inside_development_repo_is_refused(self):
        with self.assertRaisesRegex(AutomationError, "outside the development"):
            prepare_checkout(self.project, self.repo / "automation")


if __name__ == "__main__":
    unittest.main()
