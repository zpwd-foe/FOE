from __future__ import annotations

import csv
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from .network import clean_error, fetch_text_until
from .tracker import parse_string_changes


REPORT_TAIL_MARKER = b"<h3 id='added-buildings'>"


@dataclass
class StringEntry:
    text: str
    first_added_report: str
    last_added_report: str
    addition_reports: list[str] = field(default_factory=list)

    def to_dict(self, tracker: str) -> dict:
        return {
            "text": self.text,
            "first_added_date": self.first_added_report[:10],
            "first_added_report": self.first_added_report,
            "last_added_date": self.last_added_report[:10],
            "last_added_report": self.last_added_report,
            "addition_reports": self.addition_reports,
            "report_url": f"{tracker.rstrip('/')}/reports/{self.last_added_report}",
        }


def select_report_ids(ids: list[str], since: date, until: date | None = None) -> list[str]:
    result = []
    for report_id in ids:
        try:
            report_date = datetime.strptime(report_id[:10], "%Y-%m-%d").date()
        except ValueError:
            continue
        if report_date >= since and (until is None or report_date <= until):
            result.append(report_id)
    return result


def collect_active_strings(
    report_ids: list[str],
    tracker: str,
    prefix: str,
    timeout: float,
    workers: int,
    cache: Path,
) -> tuple[list[StringEntry], list[dict], list[dict]]:
    cache.mkdir(parents=True, exist_ok=True)
    changes: dict[str, tuple[list[str], list[str]]] = {}
    failures: list[dict] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        jobs = {
            executor.submit(_load_changes, report_id, tracker, timeout, cache): report_id
            for report_id in report_ids
        }
        for future in as_completed(jobs):
            report_id = jobs[future]
            try:
                changes[report_id] = future.result()
            except Exception as exc:
                failures.append({"report_id": report_id, "error": clean_error(exc)})

    if failures:
        return [], [], sorted(failures, key=lambda item: item["report_id"])

    entries, removal_events = reduce_string_changes(report_ids, changes, prefix)
    return entries, removal_events, failures


def reduce_string_changes(
    report_ids: list[str],
    changes: dict[str, tuple[list[str], list[str]]],
    prefix: str,
) -> tuple[list[StringEntry], list[dict]]:
    """Apply exact additions/removals in chronological order."""
    active: dict[str, StringEntry] = {}
    removal_events: list[dict] = []
    for report_id in sorted(report_ids):
        added, removed = changes[report_id]
        for text in added:
            if not text.startswith(prefix):
                continue
            existing = active.get(text)
            if existing:
                existing.last_added_report = report_id
                existing.addition_reports.append(report_id)
            else:
                active[text] = StringEntry(
                    text=text,
                    first_added_report=report_id,
                    last_added_report=report_id,
                    addition_reports=[report_id],
                )
        for text in removed:
            if not text.startswith(prefix):
                continue
            matched = active.pop(text, None)
            removal_events.append(
                {
                    "text": text,
                    "removed_report": report_id,
                    "removed_date": report_id[:10],
                    "matched_window_addition": matched is not None,
                    "last_added_report": matched.last_added_report if matched else None,
                }
            )

    entries = sorted(active.values(), key=lambda item: (item.last_added_report, item.text), reverse=True)
    return entries, removal_events


def write_string_results(
    entries: list[StringEntry],
    removal_events: list[dict],
    failures: list[dict],
    destination: Path,
    tracker: str,
    prefix: str,
    since: date,
    until: date | None,
    scanned_reports: list[str],
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    records = [entry.to_dict(tracker) for entry in entries]
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "prefix": prefix,
        "since": since.isoformat(),
        "until": until.isoformat() if until else None,
        "reports_scanned": len(scanned_reports),
        "oldest_report": min(scanned_reports) if scanned_reports else None,
        "newest_report": max(scanned_reports) if scanned_reports else None,
        "active_count": len(records),
        "active_strings": records,
        "removal_events": removal_events,
        "failures": failures,
    }
    destination.with_suffix(".json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    with destination.with_suffix(".csv").open("w", newline="", encoding="utf-8") as handle:
        fields = ["last_added_date", "last_added_report", "first_added_date", "text", "report_url"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow({key: record[key] for key in fields})

    rows = "\n".join(
        f"| {record['last_added_date']} | {record['text'].replace('|', '&#124;')} |"
        for record in records
    )
    markdown = f"""# Active `{prefix}` strings since {since.isoformat()}

Scanned {len(scanned_reports)} reports from `{min(scanned_reports) if scanned_reports else 'n/a'}` through `{max(scanned_reports) if scanned_reports else 'n/a'}`. Exact-string removals were applied chronologically. {len(records)} strings remain active.

| Last added | String |
|---|---|
{rows or '| — | None |'}
"""
    destination.with_suffix(".md").write_text(markdown, encoding="utf-8")


def _load_changes(
    report_id: str,
    tracker: str,
    timeout: float,
    cache: Path,
) -> tuple[list[str], list[str]]:
    cache_file = cache / f"{report_id}.json"
    if cache_file.exists():
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
        return payload["added"], payload["removed"]
    url = f"{tracker.rstrip('/')}/reports/{report_id}"
    prefix_html = fetch_text_until(url, REPORT_TAIL_MARKER, timeout=timeout)
    added, removed = parse_string_changes(prefix_html)
    cache_file.write_text(
        json.dumps({"report_id": report_id, "added": added, "removed": removed}, ensure_ascii=False),
        encoding="utf-8",
    )
    return added, removed
