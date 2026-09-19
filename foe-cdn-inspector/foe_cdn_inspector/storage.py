from __future__ import annotations

import csv
import hashlib
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .models import FileRecord, ParsedReport
from .network import clean_error, fetch, validate_cdn_url


def download_files(
    report: ParsedReport,
    destination: Path,
    mode: str,
    timeout: float,
    max_bytes: int,
    workers: int,
    limit: int | None = None,
) -> None:
    if mode == "none":
        return
    candidates = [
        record
        for record in report.files
        if record.change != "removed" and (mode == "all" or record.kind in {"text", "metadata"})
    ]
    if limit:
        candidates = candidates[:limit]
    if not candidates:
        return

    destination.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        jobs = {
            executor.submit(_download_one, record, destination, timeout, max_bytes): record
            for record in candidates
        }
        for future in as_completed(jobs):
            record = jobs[future]
            try:
                future.result()
            except Exception as exc:  # keep the rest of a batch useful
                record.error = clean_error(exc)


def _download_one(record: FileRecord, destination: Path, timeout: float, max_bytes: int) -> None:
    validate_cdn_url(record.url)
    relative = safe_relative_path(record.url)
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    response = fetch(
        record.url,
        timeout=timeout,
        max_bytes=max_bytes,
        allowed_host="foezz.innogamescdn.com",
    )
    target.write_bytes(response.body)
    record.local_path = (Path("downloads") / relative).as_posix()
    record.content_type = response.content_type
    record.size = len(response.body)
    record.sha256 = hashlib.sha256(response.body).hexdigest()
    record.summary = summarize_content(response.body, response.content_type, record.extension)


def safe_relative_path(url: str) -> Path:
    parsed = urlparse(url)
    parts = [safe_segment(unquote(part)) for part in parsed.path.split("/") if part]
    if parsed.path == "/start/metadata":
        identifier = parse_qs(parsed.query).get("id", ["metadata"])[0]
        parts = ["start", "metadata", f"{safe_segment(identifier)}.json"]
    if not parts:
        parts = ["index.bin"]
    return Path(*parts)


def safe_segment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return cleaned or "unnamed"


def summarize_content(body: bytes, content_type: str, extension: str) -> str | None:
    if content_type == "application/json" or extension == ".json":
        try:
            value = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return "invalid JSON"
        if isinstance(value, dict):
            identity = value.get("name") or value.get("id") or value.get("identifier")
            keys = list(value)[:8]
            result = f"JSON object · {len(value)} keys: {', '.join(keys)}"
            return f"{identity} · {result}" if identity else result
        if isinstance(value, list):
            return f"JSON array · {len(value)} items"
        return f"JSON {type(value).__name__}"
    if content_type.startswith("text/") or extension in {".css", ".csv", ".js", ".svg", ".txt", ".xml"}:
        text = body[:500].decode("utf-8", errors="replace")
        return re.sub(r"\s+", " ", text).strip()[:240]
    return None


def write_inventory(report: ParsedReport, destination: Path, metadata: dict) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    payload = {**metadata, **report.to_dict()}
    (destination / "inventory.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    with (destination / "inventory.csv").open("w", newline="", encoding="utf-8") as handle:
        fieldnames = [
            "change",
            "kind",
            "extension",
            "size",
            "content_type",
            "sha256",
            "local_path",
            "summary",
            "error",
            "url",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in report.files:
            writer.writerow({key: record.to_dict().get(key) for key in fieldnames})


def update_latest_pointer(root: Path, report_id: str) -> None:
    (root / "latest.txt").write_text(report_id + os.linesep, encoding="utf-8")
