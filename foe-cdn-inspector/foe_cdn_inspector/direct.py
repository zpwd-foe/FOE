"""Discover public beta assets from the client, without executing JavaScript."""
from __future__ import annotations

import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import PurePosixPath
from urllib.parse import quote, urljoin, urlparse

from .models import FileRecord, ParsedReport
from .network import validate_cdn_url
from .tracker import classify_url

CDN = "https://foezz.innogamescdn.com"
JS_STRING = r'"(?:[^"\\]|\\.)*"'


def validate_forge_url(url: str) -> str:
    validate_cdn_url(url)
    parsed = urlparse(url)
    if not re.fullmatch(r"/cache/ForgeHX[^/]*-[a-fA-F0-9]+\.js", parsed.path) or parsed.query or parsed.fragment:
        raise ValueError("expected the public /cache/ForgeHX…-hash.js URL from the current beta game")
    return url


def discover_forge_url(source: str, page_url: str) -> str:
    class Scripts(HTMLParser):
        def __init__(self):
            super().__init__()
            self.urls = set()

        def handle_starttag(self, tag, attrs):
            if tag == "script":
                src = dict(attrs).get("src", "")
                if "ForgeHX" in src:
                    self.urls.add(validate_forge_url(urljoin(page_url, src)))

    parser = Scripts()
    parser.feed(source)
    if len(parser.urls) != 1:
        raise ValueError("no unique ForgeHX script found; supply --forge-hx-url from a freshly loaded beta game")
    return parser.urls.pop()


def asset_url(path: str, fingerprint: str) -> str:
    if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
        raise ValueError("invalid asset path in ForgeHX")
    if any(part in (".", "..") for part in path.split("/")) or re.search(r'[?#%\\<>\x00-\x1f]', path):
        raise ValueError("unsafe asset path in ForgeHX")
    if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-fA-F0-9]{6,64}", fingerprint):
        raise ValueError("invalid asset fingerprint in ForgeHX")
    suffix = PurePosixPath(path).suffix
    if not suffix:
        raise ValueError("asset path has no extension")
    return f"{CDN}/assets{quote(path[:-len(suffix)])}-{fingerprint}{quote(suffix)}"


def parse_forge(body: bytes, source_url: str) -> dict:
    validate_forge_url(source_url)
    source = body.decode("utf-8")
    # Detect incomplete downloads and changed client formats before calculating removals.
    if not source.rstrip().endswith("typeof self?self:this);"):
        raise ValueError("ForgeHX is incomplete or its wrapper changed; dashboard was not updated")
    candidates = []
    for match in re.finditer(r"\bbaseUrl\s*,\s*(?=\{)", source):
        try:
            value, _ = json.JSONDecoder().raw_decode(source[match.end():])
        except ValueError:
            continue
        if isinstance(value, dict) and len(value) >= 1000:
            candidates.append(value)
    if len(candidates) != 1:
        raise ValueError("no unique complete ForgeHX asset map found; dashboard was not updated")
    assets = candidates[0]
    for path, fingerprint in assets.items():
        asset_url(path, fingerprint)
    literals = re.findall(r"\.gettext\(\s*(" + JS_STRING + ")", source)
    # Include GBP literals even when a call is not a simple gettext invocation.
    literals += re.findall(r'"GBP\|(?:[^"\\]|\\.)*"', source)
    strings = sorted({json.loads(value) for value in literals})
    gbp = [value for value in strings if value.startswith("GBP|")]
    if len(strings) < 1000 or len(gbp) < 10:
        raise ValueError("ForgeHX text extraction is unexpectedly small; dashboard was not updated")
    return {
        "schema_version": 1,
        "source_url": source_url,
        "sha256": hashlib.sha256(body).hexdigest(),
        "byte_size": len(body),
        "assets": assets,
        "strings": strings,
        "gbp_strings": gbp,
        "metadata_references": sorted(set(re.findall(r'_staticDataLoader\.load\("([a-z_]+)"', source))),
    }


def asset_record(path: str, fingerprint: str, change: str) -> FileRecord:
    url = asset_url(path, fingerprint)
    kind, extension = classify_url(url)
    return FileRecord(url=url, change=change, kind=kind, extension=extension)


def compare(previous: dict | None, current: dict, report_id: str) -> ParsedReport:
    report = ParsedReport(report_id)
    if previous is None:
        return report  # A baseline establishes presence, not publication dates.
    before, after = previous["assets"], current["assets"]
    for path in sorted(before.keys() | after.keys()):
        if path not in before:
            report.files.append(asset_record(path, after[path], "added"))
        elif path not in after:
            report.files.append(asset_record(path, before[path], "removed"))
        elif before[path] != after[path]:
            report.files.append(asset_record(path, after[path], "updated"))
    report.added_strings = sorted(set(current["strings"]) - set(previous["strings"]))
    report.removed_strings = sorted(set(previous["strings"]) - set(current["strings"]))
    if previous["sha256"] != current["sha256"]:
        report.files.append(FileRecord(current["source_url"], "updated", "text", ".js",
                                       size=current["byte_size"], sha256=current["sha256"],
                                       summary="Client code changed; this alone does not confirm a gameplay change."))
    return report


def history_entry(report: ParsedReport, source_url: str, checked_at: str) -> dict:
    data = report.to_dict()
    return {
        **data, "date": checked_at[:10], "observed_at": checked_at,
        "report_url": source_url, "source": "forge_hx",
        "counts": {
            "assets": {change: sum(f.change == change for f in report.files) for change in ("added", "updated", "removed")},
            "strings": {"added": len(report.added_strings), "removed": len(report.removed_strings)},
            "buildings": dict.fromkeys(("added", "updated", "removed"), 0),
            "meta": {"staticdata": 0},
        },
        "metadata_files": [],
        "coverage": "Asset references and embedded text checked. Separate building values not checked.",
    }
