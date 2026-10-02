"""Read checksum-bound, private capture evidence without making game requests."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
import re


STATE_NAME = ".foe-forge-hammer-state.json"
EVIDENCE_RE = re.compile(r"foe-contribution-pages-[0-9a-f]{16}\.json")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attempt_chain(project: Path) -> list[dict]:
    path = project / STATE_NAME
    if not path.is_file() or path.is_symlink():
        return []
    state = json.loads(path.read_text())
    attempts = []
    while isinstance(state, dict) and state:
        attempts.append(state)
        state = state.get("previous_attempt")
    return attempts


def evidence_inputs(project: Path) -> list[Path]:
    """Include evidence in the paired builder's immutable input manifest."""
    if not (project / STATE_NAME).is_file():
        return []
    paths = [project / STATE_NAME]
    for attempt in attempt_chain(project):
        name = attempt.get("page_evidence", {}).get("file", "")
        if isinstance(name, str) and EVIDENCE_RE.fullmatch(name):
            path = project / ".foe-refresh/evidence" / name
            if path.is_file():
                paths.append(path)
    return sorted(set(paths))


def local_capture_time(evidence: dict) -> dt.datetime:
    captured = dt.datetime.fromisoformat(evidence["treasuryCapturedAt"].replace("Z", "+00:00"))
    if captured.tzinfo is None:
        raise ValueError("Treasury capture evidence has no timezone")
    offset = evidence.get("treasuryTimezoneOffsetMinutes")
    if isinstance(offset, int) and not isinstance(offset, bool) and -840 <= offset <= 840:
        zone = dt.timezone(dt.timedelta(minutes=-offset))
    else:
        # Legacy companion evidence includes the browser offset in source dates.
        # Require a same-day row; never infer the timezone from the audit machine.
        offsets = set()
        for page in evidence.get("pages", [])[:1]:
            for row in page.get("rows", []):
                text = row.get("timestamp", "")
                match = re.fullmatch(r"\w{3} (\w{3} \d{2} \d{4}) \d{2}:\d{2}:\d{2} GMT([+-]\d{4}) \(.+\)", text)
                if match:
                    parsed = dt.datetime.strptime(f"{match[1]} {match[2]}", "%b %d %Y %z")
                    if parsed.date() == captured.astimezone(parsed.tzinfo).date():
                        offsets.add(parsed.utcoffset())
        if len(offsets) != 1:
            raise ValueError("Treasury capture evidence lacks an unambiguous local timezone")
        zone = dt.timezone(offsets.pop())
    return captured.astimezone(zone).replace(tzinfo=None)


def load_capture_context(project: Path, contribution: Path, treasury: Path) -> dict | None:
    """Bind the current CSV pair to its treasury-response timestamp.

    A contribution-only retry inherits the original treasury observation. Older
    exporters recorded its CSV hash only in the completed retry; accept that
    explicit reuse chain, while new exporters bind the hash at import time.
    """
    attempts = attempt_chain(project)
    if not attempts:
        return None
    date = treasury.stem.removeprefix("stats-")
    current = attempts[0]
    if current.get("date") != date:
        return None
    if current.get("contributions", {}).get("sha256") != sha256(contribution):
        return None
    treasury_hash = sha256(treasury)
    if current.get("treasury", {}).get("sha256") != treasury_hash:
        return None
    for attempt in attempts:
        if attempt.get("date") != date:
            return None
        bound_hash = attempt.get("treasury", {}).get("sha256")
        if bound_hash is not None and bound_hash != treasury_hash:
            raise ValueError("Treasury capture evidence refers to a different CSV")
        if not attempt.get("requested_exports", {}).get("treasury"):
            continue
        reference = attempt.get("page_evidence", {})
        name = reference.get("file", "")
        if reference.get("status") != "saved" or not isinstance(name, str) or not EVIDENCE_RE.fullmatch(name):
            return None
        path = project / ".foe-refresh/evidence" / name
        if not path.is_file() or path.is_symlink() or sha256(path) != reference.get("sha256"):
            raise ValueError("Treasury capture evidence checksum mismatch or missing file")
        evidence = json.loads(path.read_text())
        if not evidence.get("treasuryCapturedAt"):
            return None
        captured = local_capture_time(evidence)
        if captured.date().isoformat() != date:
            raise ValueError("Treasury capture evidence date does not match the CSV")
        return {
            "treasuryCapturedAt": captured.isoformat(),
            "evidenceSha256": reference["sha256"],
            "binding": "import-checksum" if bound_hash else "inherited-saved-export",
        }
    return None
