#!/usr/bin/env python3
"""Prepare an opt-in automation clone; never install a schedule or start Chrome."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from automation.build_pair import save_state, safe_error
from automation.run_daily_refresh import (
    AutomationError, ensure_clean_start, ensure_remote_is_current, git_output, run,
)


def prepare_checkout(source: Path, destination: Path) -> Path:
    source = source.resolve()
    # Do not resolve away a destination symlink or overwrite any existing folder.
    if destination.exists() or destination.is_symlink():
        raise AutomationError("Automation checkout destination must not exist.")
    destination = destination.resolve()
    root = Path(git_output(source, "rev-parse", "--show-toplevel")).resolve()
    if destination.is_relative_to(root):
        raise AutomationError("Use a separate directory outside the development repository.")
    # Clone committed remote code, never the development worktree or index.
    # Unrelated local work is precisely why an isolated checkout is needed.
    ensure_remote_is_current(source, "origin", "main")
    checkpoint = source / ".foe-daily-refresh.json"
    if checkpoint.is_file():
        state = json.loads(checkpoint.read_text())
        if not isinstance(state, dict) or state.get("stage") != "complete":
            raise AutomationError("Resolve the pending daily checkpoint before moving automation.")
    hook = Path(git_output(source, "rev-parse", "--git-path", "hooks/pre-push"))
    if not hook.is_absolute():
        hook = source / hook
    if not hook.is_file() or not os.access(hook, os.X_OK):
        raise AutomationError("Install the existing privacy guard before preparing a clone.")
    if "jira-commit-push privacy guard" not in hook.read_text():
        raise AutomationError("Source pre-push hook is not the expected privacy guard; review manually.")
    remote = git_output(source, "remote", "get-url", "origin")
    # Capture Git output so an embedded credential in a remote URL is not logged.
    run(["git", "clone", "--single-branch", "--branch", "main", "--", remote, str(destination)],
        cwd=root, capture_output=True)
    project = destination / source.relative_to(root)
    if not (project / "automation/build_pair.py").is_file():
        raise AutomationError("Remote does not contain the recovery safeguards yet. Commit and push them first.")
    cloned_hook = destination / ".git/hooks/pre-push"
    shutil.copy2(hook, cloned_hook)
    os.chmod(cloned_hook, 0o700)
    for key in ("user.name", "user.email"):
        result = run(["git", "config", "--get", key], cwd=source, capture_output=True, check=False)
        if result.returncode == 0:
            run(["git", "config", "--local", key, result.stdout.strip()], cwd=project, capture_output=True)
    # Only the private inputs and browser-attempt guard move, never public data
    # from an uncommitted development worktree or cookies/browser profile files.
    files = [*source.glob("input/*.csv"), *source.glob("input/guild-goods-contribution/*.csv")]
    files += [source / name for name in (".env.foe", ".foe-forge-hammer-state.json", ".foe-daily-refresh.json") if (source / name).is_file()]
    for path in files:
        if path.is_symlink():
            raise AutomationError("Private input symlinks require manual migration.")
        target = project / path.relative_to(source)
        ignored = run(["git", "check-ignore", "--quiet", "--", str(target)], cwd=project, check=False, capture_output=True)
        if ignored.returncode:
            raise AutomationError("A private input is not Git-ignored in the clone; migration stopped.")
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with target.open("xb") as output, path.open("rb") as original:
            os.fchmod(output.fileno(), 0o600)
            shutil.copyfileobj(original, output)
        metadata = path.stat()
        os.utime(target, ns=(metadata.st_atime_ns, metadata.st_mtime_ns))
    save_state(project / ".foe-isolated-checkout.json", {"version": 1, "branch": "main"})
    ensure_clean_start(project)
    return project


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        prepare_checkout(args.source.expanduser(), args.destination.expanduser())
        print("Automation clone prepared with ignored private inputs and the existing privacy hook.")
        print("No job was installed or started. Reload the companion extension from this clone, validate, then install the schedule explicitly.")
        return 0
    except subprocess.CalledProcessError:
        print("Checkout preparation failed at a Git operation; any partial clone was preserved for review.", file=sys.stderr)
        return 1
    except (AutomationError, OSError, ValueError) as error:
        print(f"Checkout preparation stopped: {safe_error(error)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
