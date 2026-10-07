from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from .html_report import DASHBOARD_ASSETS, write_html
from .models import ParsedReport
from .refresh import run_refresh


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="foe-cdn-inspector", description="Discover beta assets directly from ForgeHX and compare saved snapshots.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    refresh = subparsers.add_parser("refresh", aliases=["scan"], help="read the current beta client and rebuild the GB dashboard")
    source = refresh.add_mutually_exclusive_group(required=True)
    source.add_argument("--forge-hx-url", help="public ForgeHX URL copied from a freshly loaded beta game")
    source.add_argument("--client-html", type=Path, help="fresh local game HTML containing its ForgeHX script tag; never uploaded or saved")
    refresh.add_argument("--window-days", type=int, default=60)
    refresh.add_argument("--output", type=Path, default=Path("snapshots"))
    refresh.add_argument("--results", type=Path, default=Path("results"))
    refresh.add_argument("--cache", type=Path, default=Path(".cache/forge-hx"))
    refresh.add_argument("--dashboard-dir", type=Path, default=Path("dashboard"))
    refresh.add_argument("--building-metadata", type=Path,
                         help="saved beta metadata capture directory; retains its own capture date")
    refresh.add_argument("--timeout", type=float, default=60)
    refresh.add_argument("--dry-run", action="store_true", help="download, parse and compare without writing files")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return run_refresh(args)
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _publish_dashboard(source: Path, destination: Path) -> None:
    if source.name == "index.html":
        for filename in DASHBOARD_ASSETS:
            asset = source.parent / "assets" / filename
            if asset.is_file():
                _publish_dashboard(asset, destination.parent / "assets" / filename)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=".dashboard-", suffix=source.suffix, dir=destination.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        shutil.copyfile(source, temporary_path)
        shutil.copymode(source, temporary_path)
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)


def render_dashboard(
    destination: Path,
    string_results_path: Path | None = None,
    history_results_path: Path | None = None,
    *,
    checked_at: str | None = None,
) -> Path:
    inventory_path = destination / "inventory.json"
    if not inventory_path.is_file():
        raise ValueError(f"dashboard inventory not found: {inventory_path}")
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    state_path = destination / "dashboard-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}
    if string_results_path:
        state["string_results"] = json.loads(string_results_path.read_text(encoding="utf-8"))
    if history_results_path:
        state["history_results"] = json.loads(history_results_path.read_text(encoding="utf-8"))
    if checked_at is not None:
        state["checked_at"] = checked_at
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report = ParsedReport.from_dict(inventory)
    metadata = {
        key: inventory[key]
        for key in ("generated_at", "bootstrap", "cdn_host", "report_url", "source", "source_sha256", "coverage", "baseline_at", "asset_count")
        if key in inventory
    }
    if state.get("checked_at"):
        metadata["checked_at"] = state["checked_at"]
    write_html(
        report,
        destination,
        metadata,
        string_results=state.get("string_results"),
        history_results=state.get("history_results"),
    )
    return destination / "index.html"



if __name__ == "__main__":
    raise SystemExit(main())
