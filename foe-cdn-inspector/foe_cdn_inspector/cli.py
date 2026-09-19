from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .html_report import _current_great_building_bonus_images, write_html
from .history import collect_history, select_index_entries, write_history_results
from .models import ParsedReport
from .network import fetch_text, probe_bootstrap
from .storage import download_files, update_latest_pointer, write_inventory
from .strings import collect_active_strings, select_report_ids, write_string_results
from .tracker import DEFAULT_TRACKER, parse_index_entries, parse_report, report_ids


DEFAULT_BOOTSTRAP = "https://zz1.forgeofempires.com/"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="foe-cdn-inspector",
        description="Inventory and inspect recent public foezz.innogamescdn.com changes.",
    )
    subparsers = parser.add_subparsers(dest="command")
    scan = subparsers.add_parser("scan", help="fetch recent change reports and build local snapshots")
    scan.add_argument("--reports", type=int, default=1, help="number of newest reports (default: 1)")
    scan.add_argument("--report-id", action="append", help="specific report ID; may be repeated")
    scan.add_argument("--download", choices=("none", "text", "all"), default="text")
    scan.add_argument("--output", type=Path, default=Path("snapshots"))
    scan.add_argument("--timeout", type=float, default=60)
    scan.add_argument("--max-file-mb", type=float, default=10)
    scan.add_argument("--workers", type=int, default=6)
    scan.add_argument("--limit", type=int, help="maximum downloads per report; inventory remains complete")
    scan.add_argument("--tracker", default=DEFAULT_TRACKER)
    scan.add_argument("--bootstrap", default=DEFAULT_BOOTSTRAP)
    scan.add_argument("--skip-bootstrap", action="store_true")
    scan.add_argument("--save-source", action="store_true", help="retain the tracker report HTML")
    strings = subparsers.add_parser(
        "strings",
        help="find prefix-matching strings added since a date and not subsequently removed",
    )
    strings.add_argument("--since", type=_date, required=True, help="inclusive date in YYYY-MM-DD form")
    strings.add_argument("--until", type=_date, help="optional inclusive end date")
    strings.add_argument("--prefix", default="GBP|")
    strings.add_argument("--output", type=Path, default=Path("results/active-strings"))
    strings.add_argument("--cache", type=Path, default=Path(".cache/string-reports"))
    strings.add_argument("--timeout", type=float, default=60)
    strings.add_argument("--workers", type=int, default=6)
    strings.add_argument("--tracker", default=DEFAULT_TRACKER)
    strings.add_argument(
        "--dashboard",
        type=Path,
        help="existing snapshot directory whose dashboard should include these results",
    )
    history = subparsers.add_parser(
        "history",
        help="collect date-ranged asset and string changes for the dashboard",
    )
    history.add_argument("--since", type=_date, required=True, help="inclusive date in YYYY-MM-DD form")
    history.add_argument("--until", type=_date, help="optional inclusive end date")
    history.add_argument("--output", type=Path, default=Path("results/history"))
    history.add_argument("--cache", type=Path, default=Path(".cache/history-reports"))
    history.add_argument("--timeout", type=float, default=60)
    history.add_argument("--workers", type=int, default=6)
    history.add_argument("--full", action="store_true", help="include building details and metadata families")
    history.add_argument("--tracker", default=DEFAULT_TRACKER)
    history.add_argument("--dashboard", type=Path)
    history.add_argument("--strings-results", type=Path, help="active-string JSON to preserve in the dashboard")
    refresh = subparsers.add_parser(
        "refresh",
        help="refresh the Great Building dashboard from the newest published beta report",
    )
    refresh.add_argument("--since", type=_date, default=date(2026, 3, 1), help="first date for GBP descriptions (default: 2026-03-01)")
    refresh.add_argument("--window-days", type=int, default=60, help="rolling change-history window (default: 60)")
    refresh.add_argument("--output", type=Path, default=Path("snapshots"), help="snapshot directory")
    refresh.add_argument("--results", type=Path, default=Path("results"), help="result files directory")
    refresh.add_argument("--cache", type=Path, default=Path(".cache"), help="report cache directory")
    refresh.add_argument("--dashboard-dir", type=Path, default=Path("dashboard"), help="stable local dashboard directory")
    refresh.add_argument("--timeout", type=float, default=60)
    refresh.add_argument("--workers", type=int, default=6)
    refresh.add_argument("--tracker", default=DEFAULT_TRACKER)
    refresh.add_argument("--bootstrap", default=DEFAULT_BOOTSTRAP)
    refresh.add_argument("--dry-run", action="store_true", help="show the refresh plan without writing files")
    refresh.add_argument("--force", action="store_true", help="rebuild even when the newest report is unchanged")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        args = parser.parse_args(["scan", *(argv or [])])
    if args.command == "scan":
        try:
            return run_scan(args)
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    if args.command == "strings":
        try:
            return run_strings(args)
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    if args.command == "history":
        try:
            return run_history(args)
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    if args.command == "refresh":
        try:
            return run_refresh(args)
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
    parser.error(f"unknown command: {args.command}")
    return 2


def run_scan(args: argparse.Namespace) -> int:
    if args.reports < 1:
        raise ValueError("--reports must be at least 1")
    if args.max_file_mb <= 0:
        raise ValueError("--max-file-mb must be positive")

    bootstrap = {"source_url": args.bootstrap, "skipped": True}
    if not args.skip_bootstrap:
        print(f"Probing beta bootstrap: {args.bootstrap}")
        bootstrap_html = fetch_text(args.bootstrap, timeout=args.timeout, max_bytes=2_000_000)
        bootstrap = probe_bootstrap(bootstrap_html, args.bootstrap)
        market = bootstrap.get("market_id")
        if market and market != "zz":
            raise ValueError(f"bootstrap market was {market!r}, expected 'zz'")

    tracker = args.tracker.rstrip("/")
    if args.report_id:
        selected_ids = list(dict.fromkeys(args.report_id))
    else:
        print(f"Reading report index: {tracker}/")
        index_html = fetch_text(f"{tracker}/", timeout=args.timeout, max_bytes=10_000_000)
        selected_ids = report_ids(index_html)[: args.reports]
    if not selected_ids:
        raise RuntimeError("no report IDs found")

    args.output.mkdir(parents=True, exist_ok=True)
    for report_id in selected_ids:
        report_url = f"{tracker}/reports/{report_id}"
        print(f"Fetching report {report_id}")
        source = fetch_text(report_url, timeout=args.timeout, max_bytes=100_000_000)
        report = parse_report(report_id, source)
        destination = args.output / report_id
        if args.save_source:
            destination.mkdir(parents=True, exist_ok=True)
            (destination / "source.html").write_text(source, encoding="utf-8")
        download_files(
            report,
            destination / "downloads",
            args.download,
            timeout=args.timeout,
            max_bytes=int(args.max_file_mb * 1024 * 1024),
            workers=args.workers,
            limit=args.limit,
        )
        metadata = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "bootstrap": bootstrap,
            "cdn_host": "foezz.innogamescdn.com",
            "report_url": report_url,
        }
        write_inventory(report, destination, metadata)
        write_html(report, destination, metadata)
        _print_summary(report, destination)

    update_latest_pointer(args.output, selected_ids[0])
    return 0


def run_strings(args: argparse.Namespace) -> int:
    if args.until and args.until < args.since:
        raise ValueError("--until cannot be earlier than --since")
    tracker = args.tracker.rstrip("/")
    print(f"Reading report index: {tracker}/")
    index_html = fetch_text(f"{tracker}/", timeout=args.timeout, max_bytes=10_000_000)
    selected = select_report_ids(report_ids(index_html), args.since, args.until)
    if not selected:
        raise RuntimeError("no reports found in the requested date range")
    print(f"Scanning {len(selected)} string change reports")
    entries, removals, failures = collect_active_strings(
        selected,
        tracker,
        args.prefix,
        args.timeout,
        args.workers,
        args.cache,
    )
    write_string_results(
        entries,
        removals,
        failures,
        args.output,
        tracker,
        args.prefix,
        args.since,
        args.until,
        selected,
    )
    if failures:
        print(f"error: {len(failures)} report(s) failed; partial results were not calculated", file=sys.stderr)
        return 1
    dashboard_file = None
    if args.dashboard:
        dashboard_file = render_dashboard(
            args.dashboard,
            string_results_path=args.output.with_suffix(".json"),
        )
    print(
        json.dumps(
            {
                "reports_scanned": len(selected),
                "active_strings": len(entries),
                "prefix_removal_events": len(removals),
                "json": str(args.output.with_suffix('.json')),
                "csv": str(args.output.with_suffix('.csv')),
                "markdown": str(args.output.with_suffix('.md')),
                "dashboard": str(dashboard_file) if dashboard_file else None,
            },
            indent=2,
        )
    )
    return 0


def run_history(args: argparse.Namespace) -> int:
    if args.until and args.until < args.since:
        raise ValueError("--until cannot be earlier than --since")
    tracker = args.tracker.rstrip("/")
    print(f"Reading report index: {tracker}/")
    index_html = fetch_text(f"{tracker}/", timeout=args.timeout, max_bytes=10_000_000)
    selected = select_index_entries(parse_index_entries(index_html), args.since, args.until)
    if not selected:
        raise RuntimeError("no reports found in the requested date range")
    print(f"Collecting {len(selected)} report histories")
    reports, failures = collect_history(
        selected,
        tracker,
        args.timeout,
        args.workers,
        args.cache,
        full_details=args.full,
    )
    history_path = write_history_results(
        reports,
        failures,
        args.output,
        args.since,
        args.until,
        full_details=args.full,
    )
    if failures:
        print(f"error: {len(failures)} report(s) failed; dashboard was not updated", file=sys.stderr)
        return 1
    dashboard_file = None
    if args.dashboard:
        dashboard_file = render_dashboard(
            args.dashboard,
            string_results_path=args.strings_results,
            history_results_path=history_path,
        )
    print(
        json.dumps(
            {
                "reports_collected": len(reports),
                "full_details": args.full,
                "history": str(history_path),
                "dashboard": str(dashboard_file) if dashboard_file else None,
            },
            indent=2,
        )
    )
    return 0


def run_refresh(args: argparse.Namespace) -> int:
    if args.window_days < 1:
        raise ValueError("--window-days must be at least 1")
    if args.workers < 1:
        raise ValueError("--workers must be at least 1")
    if args.timeout <= 0:
        raise ValueError("--timeout must be positive")

    tracker = args.tracker.rstrip("/")
    print(f"Reading report index: {tracker}/")
    index_html = fetch_text(f"{tracker}/", timeout=args.timeout, max_bytes=10_000_000)
    entries = parse_index_entries(index_html)
    indexed_ids = report_ids(index_html)
    if not entries or not indexed_ids:
        raise RuntimeError("no report IDs found in the tracker index")
    latest_id = max(indexed_ids)
    latest_date = date.fromisoformat(latest_id[:10])
    if latest_date < args.since:
        raise ValueError(f"newest report {latest_id} predates --since {args.since}")
    history_since = latest_date - timedelta(days=args.window_days - 1)
    string_ids = select_report_ids(indexed_ids, args.since, latest_date)
    history_entries = select_index_entries(entries, history_since, latest_date)
    if latest_id not in {entry["reportId"] for entry in history_entries}:
        raise RuntimeError(f"newest report {latest_id} is missing from parsed index entries")

    pointer = args.output / "latest.txt"
    previous_id = pointer.read_text(encoding="utf-8").strip() if pointer.is_file() else None
    if previous_id and latest_id < previous_id:
        raise RuntimeError(f"tracker newest report {latest_id} is older than local latest {previous_id}")
    dashboard_file = args.dashboard_dir / "index.html"
    plan = {
        "newest_report": latest_id,
        "previous_report": previous_id,
        "description_since": args.since.isoformat(),
        "history_since": history_since.isoformat(),
        "history_until": latest_date.isoformat(),
        "string_reports": len(string_ids),
        "history_reports": len(history_entries),
        "dashboard": str(dashboard_file),
    }
    if args.dry_run:
        status = (
            "would_refresh"
            if args.force or latest_id != previous_id
            else "would_publish_saved_snapshot"
            if not dashboard_file.is_file()
            else "up_to_date"
        )
        print(json.dumps({"status": status, **plan}, indent=2))
        return 0
    if latest_id == previous_id and not args.force:
        saved_dashboard = args.output / latest_id / "index.html"
        if not saved_dashboard.is_file():
            raise RuntimeError(f"latest snapshot is missing: {saved_dashboard}; use --force to rebuild")
        _publish_dashboard(saved_dashboard, dashboard_file)
        print(json.dumps({"status": "up_to_date", **plan}, indent=2))
        return 0

    print(f"Probing beta bootstrap: {args.bootstrap}")
    bootstrap_html = fetch_text(args.bootstrap, timeout=args.timeout, max_bytes=2_000_000)
    bootstrap = probe_bootstrap(bootstrap_html, args.bootstrap)
    market = bootstrap.get("market_id")
    if market != "zz":
        raise ValueError(f"bootstrap market was {market!r}, expected 'zz'")

    print(f"Scanning {len(string_ids)} GBP description reports (cached when available)")
    strings, removals, string_failures = collect_active_strings(
        string_ids, tracker, "GBP|", args.timeout, args.workers, args.cache / "string-reports"
    )
    if string_failures:
        raise RuntimeError(f"{len(string_failures)} string report(s) failed; dashboard was not updated")
    print(f"Collecting {len(history_entries)} full history reports (cached when available)")
    history, history_failures = collect_history(
        history_entries, tracker, args.timeout, args.workers, args.cache / "history-reports", full_details=True
    )
    if history_failures:
        raise RuntimeError(f"{len(history_failures)} history report(s) failed; dashboard was not updated")
    latest_history = next((item for item in history if item["report_id"] == latest_id), None)
    if latest_history is None:
        raise RuntimeError(f"newest report {latest_id} was not collected")

    args.results.mkdir(parents=True, exist_ok=True)
    string_base = args.results / f"gbp-active-since-{args.since.isoformat()}"
    history_base = args.results / f"history-last-{args.window_days}-days"
    write_string_results(
        strings, removals, [], string_base, tracker, "GBP|", args.since, latest_date, string_ids
    )
    history_file = write_history_results(
        history, [], history_base, history_since, latest_date, full_details=True
    )
    string_data = json.loads(string_base.with_suffix(".json").read_text(encoding="utf-8"))
    history_data = json.loads(history_file.read_text(encoding="utf-8"))
    latest_report = ParsedReport.from_dict({
        "report_id": latest_id,
        "files": latest_history["files"] + latest_history["metadata_files"],
        "strings": latest_history["strings"],
        "buildings": latest_history["buildings"],
        "metadata_families": latest_history["metadata_families"],
    })
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bootstrap": bootstrap,
        "cdn_host": "foezz.innogamescdn.com",
        "report_url": f"{tracker}/reports/{latest_id}",
    }
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / latest_id
    with tempfile.TemporaryDirectory(prefix=".refresh-", dir=args.output) as temporary:
        staged = Path(temporary) / latest_id
        write_inventory(latest_report, staged, metadata)
        (staged / "dashboard-state.json").write_text(
            json.dumps({"string_results": string_data, "history_results": history_data}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        write_html(latest_report, staged, metadata, string_results=string_data, history_results=history_data)
        if target.exists():
            if not target.is_dir() or not (target / "inventory.json").is_file():
                raise RuntimeError(f"snapshot target exists but is not a valid snapshot: {target}")
            for filename in ("inventory.json", "inventory.csv", "dashboard-state.json", "index.html"):
                os.replace(staged / filename, target / filename)
        else:
            os.replace(staged, target)

    _publish_dashboard(target / "index.html", dashboard_file)
    update_latest_pointer(args.output, latest_id)
    print(json.dumps({
        "status": "refreshed",
        **plan,
        "bonus_descriptions": len(strings),
        "bonus_icons": len(_current_great_building_bonus_images(history)),
        "snapshot": str(target / "index.html"),
    }, indent=2))
    return 0


def _publish_dashboard(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=".dashboard-", suffix=".html", dir=destination.parent, delete=False) as temporary:
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
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report = ParsedReport.from_dict(inventory)
    metadata = {
        key: inventory[key]
        for key in ("generated_at", "bootstrap", "cdn_host", "report_url")
        if key in inventory
    }
    write_html(
        report,
        destination,
        metadata,
        string_results=state.get("string_results"),
        history_results=state.get("history_results"),
    )
    return destination / "index.html"


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from exc


def _print_summary(report, destination: Path) -> None:
    changes = Counter(record.change for record in report.files)
    kinds = Counter(record.kind for record in report.files)
    downloaded = sum(record.local_path is not None for record in report.files)
    errors = sum(record.error is not None for record in report.files)
    print(
        json.dumps(
            {
                "report": report.report_id,
                "changes": dict(changes),
                "kinds": dict(kinds),
                "strings_added": len(report.added_strings),
                "buildings_added": len(report.added_buildings),
                "metadata_families": len(report.metadata_families),
                "downloaded": downloaded,
                "download_errors": errors,
                "output": str(destination / "index.html"),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
