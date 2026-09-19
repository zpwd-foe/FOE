from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path

from .models import ParsedReport
from .network import clean_error, fetch_text, fetch_text_until
from .tracker import parse_report


REPORT_TAIL_MARKER = b"<h3 id='added-buildings'>"


def select_index_entries(entries: list[dict], since: date, until: date | None = None) -> list[dict]:
    selected = []
    for entry in entries:
        try:
            published = date.fromisoformat(entry["date"])
        except (KeyError, ValueError):
            continue
        if published >= since and (until is None or published <= until):
            selected.append(entry)
    return selected


def collect_history(
    entries: list[dict],
    tracker: str,
    timeout: float,
    workers: int,
    cache: Path,
    full_details: bool = False,
) -> tuple[list[dict], list[dict]]:
    cache.mkdir(parents=True, exist_ok=True)
    parsed: dict[str, ParsedReport] = {}
    failures: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        jobs = {
            executor.submit(
                _load_report,
                entry["reportId"],
                tracker,
                timeout,
                cache,
                full_details,
            ): entry["reportId"]
            for entry in entries
        }
        for future in as_completed(jobs):
            report_id = jobs[future]
            try:
                parsed[report_id] = future.result()
            except Exception as exc:
                failures.append({"report_id": report_id, "error": clean_error(exc)})

    reports = []
    for entry in entries:
        report_id = entry["reportId"]
        report = parsed.get(report_id)
        if not report:
            continue
        reports.append(
            {
                "date": entry["date"],
                "report_id": report_id,
                "report_url": f"{tracker.rstrip('/')}/reports/{report_id}",
                "counts": _counts(entry),
                "files": [record.to_dict() for record in report.files if record.kind != "metadata"],
                "metadata_files": [
                    record.to_dict() for record in report.files if record.kind == "metadata"
                ],
                "strings": {
                    "added": report.added_strings,
                    "removed": report.removed_strings,
                },
                "buildings": {
                    "added": report.added_buildings,
                    "updated": report.updated_buildings,
                    "removed": report.removed_buildings,
                },
                "metadata_families": report.metadata_families,
            }
        )
    return reports, sorted(failures, key=lambda item: item["report_id"])


def write_history_results(
    reports: list[dict],
    failures: list[dict],
    destination: Path,
    since: date,
    until: date | None,
    full_details: bool = False,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    totals = {
        group: {
            change: sum(report["counts"][group][change] for report in reports)
            for change in changes
        }
        for group, changes in {
            "assets": ("added", "updated", "removed"),
            "strings": ("added", "removed"),
            "buildings": ("added", "updated", "removed"),
            "meta": ("staticdata",),
        }.items()
    }
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "since": since.isoformat(),
        "until": until.isoformat() if until else None,
        "reports_count": len(reports),
        "full_details": full_details,
        "oldest_report": min((report["report_id"] for report in reports), default=None),
        "newest_report": max((report["report_id"] for report in reports), default=None),
        "totals": totals,
        "reports": reports,
        "failures": failures,
    }
    target = destination.with_suffix(".json")
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def _load_report(
    report_id: str,
    tracker: str,
    timeout: float,
    cache: Path,
    full_details: bool,
) -> ParsedReport:
    cache_file = cache / f"{report_id}.json"
    if cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        if cached.get("_history_cache"):
            if cached.get("full_details") or not full_details:
                return ParsedReport.from_dict(cached["report"])
        elif not full_details:
            return ParsedReport.from_dict(cached)
    url = f"{tracker.rstrip('/')}/reports/{report_id}"
    source = (
        fetch_text(url, timeout=timeout, max_bytes=250_000_000)
        if full_details
        else fetch_text_until(url, REPORT_TAIL_MARKER, timeout=timeout, max_bytes=50_000_000)
    )
    report = parse_report(report_id, source)
    cache_file.write_text(
        json.dumps(
            {
                "_history_cache": True,
                "full_details": full_details,
                "report": report.to_dict(),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return report


def _counts(entry: dict) -> dict:
    return {
        "assets": _with_defaults(entry.get("assets"), ("added", "updated", "removed")),
        "strings": _with_defaults(entry.get("strings"), ("added", "removed")),
        "buildings": _with_defaults(entry.get("buildings"), ("added", "updated", "removed")),
        "meta": _with_defaults(entry.get("meta"), ("staticdata",)),
    }


def _with_defaults(value: dict | None, keys: tuple[str, ...]) -> dict:
    source = value or {}
    return {key: int(source.get(key, 0)) for key in keys}
