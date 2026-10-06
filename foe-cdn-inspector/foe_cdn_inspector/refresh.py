"""Direct client snapshot collection and dashboard publication."""
from __future__ import annotations

import csv
import json
import os
import re
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .direct import asset_record, compare, discover_forge_url, history_entry, parse_forge, validate_forge_url
from .history import write_history_results
from .html_report import _current_great_building_bonus_images, write_html
from .models import ParsedReport
from .network import fetch, probe_bootstrap
from .storage import write_inventory

BETA = "https://zz1.forgeofempires.com/"
COVERAGE = ("Direct scans compare the asset list and text embedded in ForgeHX. "
            "They do not check separate building values, level costs, or server rules. "
            "Presence in the client does not confirm that a feature is available in the game.")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def previous_snapshot(root: Path) -> tuple[str | None, dict, dict | None]:
    pointer = root / "latest.txt"
    if not pointer.exists():
        return None, {}, None
    name = pointer.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[0-9A-Za-z_-]+", name):
        raise ValueError("invalid latest snapshot pointer")
    folder = root / name
    state = read_json(folder / "dashboard-state.json")
    direct = read_json(folder / "direct.json") if (folder / "direct.json").is_file() else None
    if direct and direct.get("schema_version") != 1:
        raise ValueError("unsupported direct snapshot format; preserve it and update the reader")
    return name, state, direct


def current_strings(current: dict, previous: dict | None, old_state: dict, checked_at: str, report_id: str) -> dict:
    old = old_state.get("string_results", {})
    by_text = {item["text"]: item for item in old.get("active_strings", [])}
    before = set(previous["gbp_strings"]) if previous else set()
    records = []
    for value in current["gbp_strings"]:
        if value in by_text:
            record = {**by_text[value]}
        elif previous and value not in before:
            record = {"text": value, "first_added_date": checked_at[:10], "last_added_date": checked_at[:10],
                      "first_added_report": report_id, "last_added_report": report_id,
                      "addition_reports": [report_id], "source": "forge_hx", "report_url": current["source_url"]}
        else:
            record = {"text": value, "last_added_date": "", "first_added_date": None,
                      "first_seen_date": checked_at[:10], "source": "baseline", "report_url": current["source_url"]}
        record.setdefault("source", "legacy")
        records.append(record)
    removals = list(old.get("removal_events", []))
    if previous:
        for value in sorted(before - set(current["gbp_strings"])):
            removals.append({"text": value, "removed_date": checked_at[:10], "removed_report": report_id,
                             "source": "forge_hx", "report_url": current["source_url"]})
    return {"source": "forge_hx", "active_strings": records, "active_count": len(records),
            "prefix": "GBP|", "removal_events": removals, "failures": [], "generated_at": checked_at}


def bonus_reports(current: dict, previous: dict | None, old_history: list[dict], checked_at: str) -> list[dict]:
    # Only dates supported by saved evidence are assigned to the initial baseline.
    old_urls = {}
    for report in reversed(old_history):
        for record in report.get("files", []):
            if record.get("change") != "removed":
                old_urls[record["url"]] = report.get("date", "")
    old_dates = previous.get("bonus_dates", {}) if previous else {}
    dates, groups = {}, {}
    for path, fingerprint in current["assets"].items():
        if "bonus" not in path.lower():
            continue
        record = asset_record(path, fingerprint, "current")
        if record.kind != "image":
            continue
        if previous and previous["assets"].get(path) != fingerprint:
            observed = checked_at[:10]
        else:
            observed = old_dates.get(path, old_urls.get(record.url, ""))
        dates[path] = observed
        groups.setdefault(observed, []).append(record.to_dict())
    current["bonus_dates"] = dates
    return [{"date": day, "files": records, "source": "forge_hx"} for day, records in sorted(groups.items(), reverse=True)]


def run_refresh(args) -> int:
    # Import shared render/publish helpers lazily to keep the CLI module small.
    from .cli import _publish_dashboard

    if args.window_days < 1 or args.timeout <= 0:
        raise ValueError("--window-days and --timeout must be positive")
    explicit_url = validate_forge_url(args.forge_hx_url) if args.forge_hx_url else None
    previous_id, old_state, previous = previous_snapshot(args.output)
    print(f"Verifying beta market: {BETA}")
    landing = fetch(BETA, timeout=args.timeout, max_bytes=2_000_000,
                    allowed_host=("zz1.forgeofempires.com", "zz0.forgeofempires.com",
                                  "zz.forgeofempires.com", "zz-play.forgeofempires.com"))
    bootstrap = probe_bootstrap(landing.body.decode("utf-8"), landing.final_url)
    if bootstrap.get("market_id") != "zz":
        raise ValueError(f"bootstrap market was {bootstrap.get('market_id')!r}, expected 'zz'")
    source_url = explicit_url or discover_forge_url(args.client_html.read_text(encoding="utf-8"), BETA)
    print(f"Reading client: {source_url}")
    response = fetch(source_url, timeout=args.timeout, max_bytes=100_000_000, allowed_host="foezz.innogamescdn.com")
    validate_forge_url(response.final_url)
    if response.content_length is not None and response.content_length != len(response.body):
        raise ValueError("incomplete ForgeHX download; dashboard was not updated")
    current = parse_forge(response.body, response.final_url)
    now = datetime.now(timezone.utc)
    checked_at = now.isoformat()
    changed = previous is None or previous["sha256"] != current["sha256"]
    report_id = now.strftime("%Y-%m-%d_%H-%M-%S-%f") + "-" + current["sha256"][:8] if changed else previous_id
    current.update({"report_id": report_id, "baseline_at": previous["baseline_at"] if previous else checked_at,
                    "observed_at": checked_at if changed else previous["observed_at"]})
    report = compare(previous, current, report_id)
    old_history = previous.get("all_reports", []) if previous else old_state.get("history_results", {}).get("reports", [])
    history = [{**item, "source": item.get("source", "legacy")} for item in old_history]
    if changed and previous is not None:
        history.insert(0, history_entry(report, current["source_url"], checked_at))
    current["all_reports"] = history
    string_data = current_strings(current, previous, old_state, checked_at, report_id)
    gallery = bonus_reports(current, previous, history, checked_at)
    since = now.date() - timedelta(days=args.window_days - 1)
    window = [item for item in history if since.isoformat() <= item["date"] <= now.date().isoformat()]
    plan = {"status": "baseline_saved" if previous is None else "refreshed" if changed else "up_to_date",
            "checked_at": checked_at, "source_url": current["source_url"], "source_sha256": current["sha256"],
            "snapshot_id": report_id, "previous_snapshot": previous_id,
            "asset_references": len(current["assets"]), "embedded_texts": len(current["strings"]),
            "bonus_descriptions": len(current["gbp_strings"]), "bonus_icons": len(_current_great_building_bonus_images(gallery)),
            "asset_changes": len([f for f in report.files if f.url != current["source_url"]]),
            "texts_added": len(report.added_strings), "texts_removed": len(report.removed_strings),
            "history_since": since.isoformat(), "history_until": now.date().isoformat(), "coverage": COVERAGE}
    if args.dry_run:
        print(json.dumps({**plan, "status": "would_" + plan["status"]}, indent=2))
        return 0
    metadata = {"generated_at": checked_at, "checked_at": checked_at, "bootstrap": bootstrap,
                "cdn_host": "foezz.innogamescdn.com", "report_url": current["source_url"],
                "source": "forge_hx", "source_sha256": current["sha256"], "coverage": COVERAGE,
                "baseline_at": current["baseline_at"], "asset_count": len(current["assets"])}
    args.output.mkdir(parents=True, exist_ok=True)
    target = args.output / report_id
    with tempfile.TemporaryDirectory(prefix=".refresh-", dir=args.output) as temporary:
        staged = Path(temporary) / report_id
        staged.mkdir()
        history_path = write_history_results(window, [], staged / "history", since, now.date(), full_details=False)
        history_data = read_json(history_path)
        history_data.update({"source": "forge_hx", "current_bonus_reports": gallery, "coverage": COVERAGE,
                             "baseline_at": current["baseline_at"]})
        write_json(history_path, history_data)
        write_json(staged / "direct.json", current)
        write_json(staged / "gbp-current.json", string_data)
        with (staged / "gbp-current.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["text", "last_observed_change", "source"])
            writer.writerows((r["text"], r["last_added_date"], r["source"]) for r in string_data["active_strings"])
        # Keep the last actual changeset on unchanged checks.
        if not changed:
            report = ParsedReport.from_dict(read_json(target / "inventory.json"))
        write_inventory(report, staged, metadata)
        write_json(staged / "dashboard-state.json", {"checked_at": checked_at, "string_results": string_data,
                                                     "history_results": history_data})
        write_html(report, staged, metadata, string_results=string_data, history_results=history_data)
        if target.exists():
            for path in staged.rglob("*"):
                if path.is_file():
                    dest = target / path.relative_to(staged)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(path, dest)
        else:
            os.replace(staged, target)
    args.cache.mkdir(parents=True, exist_ok=True)
    source_file = args.cache / f"ForgeHX-{current['sha256']}.js"
    if not source_file.exists():
        source_file.write_bytes(response.body)
    args.results.mkdir(parents=True, exist_ok=True)
    for filename in ("gbp-current.json", "gbp-current.csv"):
        _publish_dashboard(target / filename, args.results / filename)
    _publish_dashboard(target / "history.json", args.results / f"history-last-{args.window_days}-days.json")
    _publish_dashboard(target / "history.html", args.dashboard_dir / "history.html")
    _publish_dashboard(target / "index.html", args.dashboard_dir / "index.html")
    pointer = args.output / ".latest.tmp"
    pointer.write_text(report_id + "\n", encoding="utf-8")
    os.replace(pointer, args.output / "latest.txt")
    print(json.dumps({**plan, "snapshot": str(target), "dashboard": str(args.dashboard_dir / "index.html")}, indent=2))
    return 0
