#!/usr/bin/env python3
"""Checkpointed, offline build of a validated treasury/contribution pair.

Neither this module nor its recovery path opens Chrome or requests game data.
All inputs are copied before generation. The live outputs change only after
both datasets pass validation; an interrupted promotion is rolled back before
another build. Recovery files are private, local, and excluded from Git.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from automation.run_daily_refresh import (
    AutomationError, ensure_privacy, ensure_treasury_history_preserved,
    exclusive_lock, treasury_snapshot_dates, validate_compatibility_page,
    validate_generated_metadata,
)

OUTPUTS = ("dashboard", "site/data/treasury-data.js", "site/data/contribution-data.js")


def digest(path: Path) -> str | None:
    if not path.exists():
        return None
    if path.is_symlink():
        raise AutomationError("Refresh paths must not be symbolic links.")
    result = hashlib.sha256()
    files = sorted(path.rglob("*")) if path.is_dir() else [path]
    for child in files:
        if child.is_symlink():
            raise AutomationError("Refresh paths must not contain symbolic links.")
        if child.is_file():
            result.update(str(child.relative_to(path) if path.is_dir() else "file").encode())
            result.update(b"\0")
            with child.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    result.update(chunk)
    return result.hexdigest()


def output_hashes(project: Path) -> dict[str, str | None]:
    return {name: digest(project / name) for name in OUTPUTS}


def save_state(path: Path, state: dict) -> None:
    if path.is_symlink() or path.parent.is_symlink():
        raise AutomationError("Refresh state must not use symbolic links.")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temporary.open("x", encoding="utf-8") as handle:
        os.chmod(temporary, 0o600)
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)


def load_state(project: Path) -> dict:
    path = project / ".foe-refresh/pair.json"
    if not path.exists():
        return {}
    if path.is_symlink():
        raise AutomationError("Refresh checkpoint must not be a symbolic link.")
    state = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(state, dict) or not re.fullmatch(r"[0-9a-f]{32}", str(state.get("runId", ""))):
        raise AutomationError("Invalid local refresh checkpoint; manual review required.")
    return state


def input_manifest(project: Path) -> dict[str, str | None]:
    paths = [*project.glob("input/*.csv"), *project.glob("input/guild-goods-contribution/*.csv")]
    return {path.relative_to(project).as_posix(): digest(path) for path in sorted(paths)}


def code_manifest(project: Path) -> dict[str, str | None]:
    paths = [*project.glob("*.py"), *project.glob("automation/*.py")]
    paths += [path for path in (project / "site").rglob("*") if path.is_file() and path.relative_to(project).as_posix() not in OUTPUTS[1:]]
    return {path.relative_to(project).as_posix(): digest(path) for path in sorted(paths)}


def safe_error(error: BaseException) -> str:
    text = str(error).replace(str(Path.home()), "<local-user>")
    return re.sub(r"/(?:Users|home)/[^/\s]+", "<local-user>", text)[-800:]


def run_step(command: list[str], snapshot: Path, log: Path) -> None:
    result = subprocess.run(command, cwd=snapshot, text=True, capture_output=True)
    with log.open("a", encoding="utf-8") as handle:
        os.chmod(log, 0o600)
        handle.write(result.stdout + result.stderr)
    if result.returncode:
        lines = (result.stderr or result.stdout).strip().splitlines()
        detail = next((line for line in reversed(lines) if "Error:" in line), lines[-1] if lines else "No error detail")
        raise AutomationError(f"{Path(command[2]).name}: {detail}")


def validate_pair(snapshot: Path, previous_dates: tuple) -> tuple:
    node = shutil.which("node")
    if not node:
        raise AutomationError("Node.js is required for dashboard validation.")
    for script in ("site/data/treasury-data.js", "site/data/contribution-data.js"):
        subprocess.run([node, "--check", str(snapshot / script)], check=True, capture_output=True)
    dates = validate_generated_metadata(snapshot)
    validate_compatibility_page(snapshot)
    ensure_treasury_history_preserved(previous_dates, treasury_snapshot_dates(snapshot))
    paths = {path.relative_to(snapshot).as_posix() for path in (snapshot / "dashboard").rglob("*") if path.is_file()}
    ensure_privacy(snapshot, paths | set(OUTPUTS[1:]))
    return dates


def restore_pair(project: Path, state: dict) -> None:
    """Restore only recognized old/new outputs; preserve unexpected user edits."""
    run_dir = project / ".foe-refresh" / state["runId"]
    for name in OUTPUTS:
        active, backup = project / name, run_dir / "backup" / name
        if not backup.exists():
            continue
        if digest(backup) != state["before"][name]:
            raise AutomationError("Refresh backup changed; refusing automatic recovery.")
        if digest(active) not in (None, state["before"][name], state["outputs"][name]):
            raise AutomationError("Live output changed outside the refresh; preserve it and recover manually.")
    for name in reversed(OUTPUTS):
        active, backup = project / name, run_dir / "backup" / name
        if backup.exists():
            if active.exists():
                displaced = run_dir / f"interrupted-{uuid.uuid4().hex}" / name
                displaced.parent.mkdir(parents=True, exist_ok=True)
                os.replace(active, displaced)
            active.parent.mkdir(parents=True, exist_ok=True)
            os.replace(backup, active)
    state["phase"] = "validated"
    save_state(project / ".foe-refresh/pair.json", state)


def promote_pair(project: Path, snapshot: Path, state: dict) -> None:
    if output_hashes(project) != state["before"]:
        raise AutomationError("Live outputs changed during the build; no files promoted.")
    state["phase"] = "promoting"
    save_state(project / ".foe-refresh/pair.json", state)
    run_dir = snapshot.parent
    try:
        for name in OUTPUTS:
            active, backup, ready = project / name, run_dir / "backup" / name, run_dir / "ready" / name
            ready.parent.mkdir(parents=True, exist_ok=True)
            backup.parent.mkdir(parents=True, exist_ok=True)
            if (snapshot / name).is_dir():
                shutil.copytree(snapshot / name, ready, dirs_exist_ok=True)
            else:
                shutil.copy2(snapshot / name, ready)
            if active.exists():
                os.replace(active, backup)
            os.replace(ready, active)
        if output_hashes(project) != state["outputs"]:
            raise AutomationError("Promoted output checksums do not match the validated pair.")
    except BaseException:
        restore_pair(project, state)
        raise
    state["phase"] = "complete"
    state.pop("failure", None)
    state["lastSuccess"] = dt.datetime.now().astimezone().isoformat()
    save_state(project / ".foe-refresh/pair.json", state)


def build_pair(project: Path, treasury: Path, *, promote: bool = True) -> dict:
    project, treasury = project.resolve(), treasury.resolve()
    relative_treasury = treasury.relative_to(project).as_posix()
    if not re.fullmatch(r"input/stats-\d{4}-\d{2}-\d{2}\.csv", relative_treasury):
        raise AutomationError("A dated treasury CSV under input/ is required.")
    if not treasury.is_file():
        raise AutomationError("The saved treasury CSV is missing; offline recovery cannot download it.")
    date_text = treasury.stem.removeprefix("stats-")
    contributions = project / f"input/guild-goods-contribution/GuildTreasury-{date_text}.csv"
    if not contributions.is_file():
        raise AutomationError("The matching saved contribution CSV is missing; offline recovery cannot download it.")
    dated_exports = sorted(project.glob("input/guild-goods-contribution/GuildTreasury-????-??-??.csv"))
    if not dated_exports or dated_exports[-1] != contributions:
        raise AutomationError("Saved contributions extend beyond the selected treasury capture; select a matching pair.")
    recovery = project / ".foe-refresh"
    if recovery.is_symlink():
        raise AutomationError("Refresh directory must not be a symbolic link.")
    recovery.mkdir(mode=0o700, exist_ok=True)
    os.chmod(recovery, 0o700)
    with exclusive_lock(recovery / "pair.lock"):
        state = load_state(project)
        if state.get("phase") == "promoting":
            restore_pair(project, state)
        inputs, code = input_manifest(project), code_manifest(project)
        before = output_hashes(project)
        if any(value is None for value in before.values()):
            raise AutomationError("The last-good dashboard pair is incomplete; restore it before refreshing.")
        same_inputs = state.get("inputs") == inputs and state.get("code") == code and state.get("treasury") == relative_treasury
        if same_inputs and state.get("phase") == "complete" and before == state.get("outputs"):
            print("Both dashboards already match the verified input checkpoint; no rebuild needed.")
            return state
        if not (same_inputs and state.get("phase") == "validated" and before == state.get("before")):
            state = {"runId": uuid.uuid4().hex, "phase": "building", "stage": "copying inputs", "inputs": inputs, "code": code, "before": before, "treasury": relative_treasury, "lastSuccess": state.get("lastSuccess")}
        run_dir = recovery / state["runId"]
        snapshot = run_dir / "snapshot"
        save_state(recovery / "pair.json", state)
        try:
            if state["phase"] != "validated":
                snapshot.mkdir(parents=True, mode=0o700)
                for name in sorted(set(inputs) | set(code) | set(OUTPUTS[1:])):
                    source, target = project / name, snapshot / name
                    if source.is_file():
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, target)
                for script, args in (
                    ("generate_contribution_dashboard.py", []),
                    ("generate_treasury_dashboard.py", ["--csv", relative_treasury]),
                ):
                    state["stage"] = script
                    save_state(recovery / "pair.json", state)
                    run_step([sys.executable, "-B", script, *args], snapshot, run_dir / "build.log")
                state["stage"] = "joint validation"
                dates = validate_pair(snapshot, treasury_snapshot_dates(project))
                if dates[0].isoformat() != date_text or dates[1] > dates[0]:
                    raise AutomationError("Generated dates do not match the selected treasury capture.")
                state.update(phase="validated", outputs=output_hashes(snapshot), throughDate=min(dates).isoformat())
                save_state(recovery / "pair.json", state)
            if input_manifest(project) != inputs or code_manifest(project) != code:
                raise AutomationError("Inputs or code changed during the build; no files promoted.")
            if output_hashes(snapshot) != state["outputs"]:
                raise AutomationError("Validated staging output was modified; refusing promotion.")
            if promote:
                state["stage"] = "promoting validated pair"
                promote_pair(project, snapshot, state)
            return state
        except BaseException as error:
            # Keep a promoting checkpoint intact if rollback itself needs help.
            state["failure"] = {"stage": state["stage"], "message": safe_error(error)}
            save_state(recovery / "pair.json", state)
            raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-dir", type=Path, default=ROOT)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--check-only", action="store_true", help="Build and validate in private staging without changing live outputs.")
    args = parser.parse_args()
    try:
        csv_path = args.csv if args.csv.is_absolute() else args.project_dir / args.csv
        state = build_pair(args.project_dir, csv_path, promote=not args.check_only)
        print(f"Paired refresh {state['phase']}; data through {state['throughDate']}. No game requests were made.")
        return 0
    except (AutomationError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Paired refresh stopped: {safe_error(error)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
