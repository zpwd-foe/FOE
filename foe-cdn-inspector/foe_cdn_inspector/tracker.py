from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from pathlib import PurePosixPath
from urllib.parse import urlparse

from .models import FileRecord, ParsedReport


DEFAULT_TRACKER = "https://www.linnun.net/foe/asset-tracker"
DEFAULT_CDN_HOST = "foezz.innogamescdn.com"

_REPORT_ID_RE = re.compile(r'reportId\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2})"')
_CDN_URL_RE = re.compile(r"https://foezz\.innogamescdn\.com/[^\s'\"<>}]+")
_TEXT_EXTENSIONS = {
    ".css",
    ".csv",
    ".html",
    ".js",
    ".json",
    ".md",
    ".svg",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
_IMAGE_EXTENSIONS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"}
_AUDIO_EXTENSIONS = {".aac", ".m4a", ".mp3", ".ogg", ".wav"}
_FONT_EXTENSIONS = {".eot", ".otf", ".ttf", ".woff", ".woff2"}


def report_ids(index_html: str) -> list[str]:
    """Return report IDs newest-first, preserving the tracker index order."""
    return list(dict.fromkeys(_REPORT_ID_RE.findall(index_html)))


def parse_index_entries(index_html: str) -> list[dict]:
    """Parse the tracker index's JavaScript object into newest-first reports."""
    match = re.search(r"const entries\s*=\s*(\{.*?\})\s*;", index_html, re.DOTALL)
    if not match:
        return []
    javascript_object = match.group(1)
    normalized = re.sub(
        r"([\{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:",
        r'\1"\2":',
        javascript_object,
    )
    try:
        entries = json.loads(normalized)
    except json.JSONDecodeError as exc:
        raise ValueError(f"tracker index entries were invalid: {exc}") from exc

    flattened = []
    for published_date, reports in entries.items():
        for report in reports:
            flattened.append({"date": published_date, **report})
    return flattened


def classify_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    extension = PurePosixPath(parsed.path).suffix.lower()
    if parsed.path == "/start/metadata":
        return "metadata", ".json"
    if extension in _TEXT_EXTENSIONS:
        return "text", extension
    if extension in _IMAGE_EXTENSIONS:
        return "image", extension
    if extension in _AUDIO_EXTENSIONS:
        return "audio", extension
    if extension in _FONT_EXTENSIONS:
        return "font", extension
    return "binary", extension


class _ReportParser(HTMLParser):
    def __init__(self, report_id: str) -> None:
        super().__init__(convert_charrefs=True)
        self.report = ParsedReport(report_id=report_id)
        self.section: str | None = None
        self._capture_anchor = False
        self._anchor_parts: list[str] = []
        self._capture_summary = False
        self._summary_parts: list[str] = []
        self._capture_pre = False
        self._pre_parts: list[str] = []
        self._pending_summary: str | None = None
        self._urls: dict[str, FileRecord] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        element_id = values.get("id")
        if element_id:
            self.section = element_id

        if tag == "a":
            href = values.get("href") or ""
            if self.section in {"added-assets", "updated-assets", "removed-assets"}:
                if _is_cdn_url(href):
                    change = self.section.removesuffix("-assets")
                    kind, extension = classify_url(href)
                    self._urls[href] = FileRecord(href, change, kind, extension)
            if self.section in {"added-strings", "removed-strings"}:
                self._capture_anchor = True
                self._anchor_parts = []

        if tag == "summary" and self.section in {
            "added-buildings",
            "updated-buildings",
            "removed-buildings",
            "staticdata-changes",
        }:
            self._capture_summary = True
            self._summary_parts = []

        classes = set((values.get("class") or "").split())
        if tag == "pre" and "rawjson" in classes and self.section in {
            "added-buildings",
            "updated-buildings",
        }:
            self._capture_pre = True
            self._pre_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._capture_anchor:
            value = "".join(self._anchor_parts).strip()
            target = self.report.added_strings if self.section == "added-strings" else self.report.removed_strings
            if value and value not in target:
                target.append(value)
            self._capture_anchor = False

        if tag == "summary" and self._capture_summary:
            value = "".join(self._summary_parts).strip()
            self._pending_summary = value
            if self.section == "removed-buildings" and value:
                self.report.removed_buildings.append(value)
            elif self.section == "staticdata-changes" and value:
                self.report.metadata_families.append(value)
            self._capture_summary = False

        if tag == "pre" and self._capture_pre:
            raw = "".join(self._pre_parts).strip()
            try:
                building = json.loads(raw)
            except json.JSONDecodeError:
                building = {"id": self._pending_summary or "unknown", "parse_error": True}
            target = (
                self.report.added_buildings
                if self.section == "added-buildings"
                else self.report.updated_buildings
            )
            target.append(_building_summary(building))
            self._capture_pre = False

    def handle_data(self, data: str) -> None:
        if self._capture_anchor:
            self._anchor_parts.append(data)
        if self._capture_summary:
            self._summary_parts.append(data)
        if self._capture_pre:
            self._pre_parts.append(data)

    def finish(self, source_html: str) -> ParsedReport:
        # Metadata endpoints have no filename extension and can occur inside deep
        # diffs rather than the asset lists. Keep them separately inspectable.
        decoded = html.unescape(source_html)
        for match in _CDN_URL_RE.finditer(decoded):
            url = match.group(0).rstrip(",.)]")
            if urlparse(url).path != "/start/metadata":
                continue
            prefix = decoded[max(0, match.start() - 80) : match.start()]
            if '"old_value"' in prefix:
                change = "removed"
            elif '"new_value"' in prefix:
                change = "updated"
            else:
                change = "referenced"
            existing = self._urls.get(url)
            if not existing:
                self._urls[url] = FileRecord(url, change, "metadata", ".json")

        self.report.files = list(self._urls.values())
        self.report.metadata_families = list(dict.fromkeys(self.report.metadata_families))
        return self.report


def parse_report(report_id: str, source_html: str) -> ParsedReport:
    parser = _ReportParser(report_id)
    parser.feed(source_html)
    parser.close()
    return parser.finish(source_html)


class _StringParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.section: str | None = None
        self.capture = False
        self.parts: list[str] = []
        self.added: list[str] = []
        self.removed: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.section = values["id"]
        if tag == "a" and self.section in {"added-strings", "removed-strings"}:
            self.capture = True
            self.parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or not self.capture:
            return
        value = "".join(self.parts).strip()
        target = self.added if self.section == "added-strings" else self.removed
        if value and value not in target:
            target.append(value)
        self.capture = False

    def handle_data(self, data: str) -> None:
        if self.capture:
            self.parts.append(data)


def parse_string_changes(source_html: str) -> tuple[list[str], list[str]]:
    parser = _StringParser()
    parser.feed(source_html)
    parser.close()
    return parser.added, parser.removed


def _is_cdn_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname == DEFAULT_CDN_HOST


def _building_summary(building: dict) -> dict:
    components = building.get("components", {})
    all_age = components.get("AllAge", {}) if isinstance(components, dict) else {}
    placement = all_age.get("placement", {}) if isinstance(all_age, dict) else {}
    size = placement.get("size", {}) if isinstance(placement, dict) else {}
    return {
        "id": building.get("id"),
        "name": building.get("name"),
        "asset_id": building.get("asset_id"),
        "size": {key: size.get(key) for key in ("x", "y", "z") if key in size},
        "ages": [key for key in components if key != "AllAge"] if isinstance(components, dict) else [],
        "state_definition_hash": building.get("stateDefinitionHash"),
        **({"parse_error": True} if building.get("parse_error") else {}),
    }
