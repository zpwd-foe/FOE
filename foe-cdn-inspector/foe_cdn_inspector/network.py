from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse


USER_AGENT = "Mozilla/5.0 (compatible; foe-cdn-inspector/0.1; public-CDN-research)"
ALLOWED_DOWNLOAD_HOST = "foezz.innogamescdn.com"


@dataclass
class Response:
    body: bytes
    content_type: str
    final_url: str
    content_length: int | None


def fetch(
    url: str,
    timeout: float = 60,
    max_bytes: int | None = None,
    allowed_host: str | None = None,
) -> Response:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Accept-Encoding": "identity",
        },
    )
    try:
        opener = (
            urllib.request.build_opener(_SameHostRedirectHandler(allowed_host))
            if allowed_host
            else urllib.request.build_opener()
        )
        with opener.open(request, timeout=timeout) as response:
            length_header = response.headers.get("Content-Length")
            content_length = int(length_header) if length_header and length_header.isdigit() else None
            if max_bytes is not None and content_length is not None and content_length > max_bytes:
                raise ValueError(f"response is {content_length} bytes; limit is {max_bytes}")
            body = response.read(None if max_bytes is None else max_bytes + 1)
            if max_bytes is not None and len(body) > max_bytes:
                raise ValueError(f"response exceeds {max_bytes} bytes")
            return Response(
                body=body,
                content_type=response.headers.get_content_type(),
                final_url=response.geturl(),
                content_length=content_length,
            )
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"could not fetch {url}: {exc.reason}") from exc


def fetch_text(url: str, timeout: float = 60, max_bytes: int | None = None) -> str:
    response = fetch(url, timeout=timeout, max_bytes=max_bytes)
    return response.body.decode("utf-8", errors="replace")


def fetch_text_until(
    url: str,
    marker: bytes,
    timeout: float = 60,
    max_bytes: int = 20_000_000,
) -> str:
    """Read a text response only through a marker, avoiding large report tails."""
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,*/*;q=0.8",
            "Accept-Encoding": "identity",
        },
    )
    try:
        with urllib.request.build_opener().open(request, timeout=timeout) as response:
            body = bytearray()
            while len(body) <= max_bytes:
                chunk = response.read(min(64 * 1024, max_bytes + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                position = body.find(marker)
                if position >= 0:
                    body = body[:position]
                    break
            if len(body) > max_bytes:
                raise ValueError(f"report prefix exceeds {max_bytes} bytes")
            return bytes(body).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"could not fetch {url}: {exc.reason}") from exc


def validate_cdn_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != ALLOWED_DOWNLOAD_HOST:
        raise ValueError(f"refusing non-{ALLOWED_DOWNLOAD_HOST} URL: {url}")


class _SameHostRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_host: str) -> None:
        super().__init__()
        self.allowed_host = allowed_host

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        if urlparse(new_url).hostname != self.allowed_host:
            raise RuntimeError(f"refusing redirect away from {self.allowed_host}: {new_url}")
        return super().redirect_request(request, file_pointer, code, message, headers, new_url)


def probe_bootstrap(html_text: str, source_url: str) -> dict[str, Any]:
    """Extract the small public runtime config embedded by the zz1 landing page."""
    marker = "var ONELPS_RUNTIME_CONFIG = "
    start = html_text.find(marker)
    if start < 0:
        return {"source_url": source_url, "warning": "runtime config not found"}
    start += len(marker)
    try:
        # The config contains JavaScript snippets with semicolons inside JSON
        # strings, so looking for the first semicolon would truncate it.
        payload, _ = json.JSONDecoder().raw_decode(html_text[start:])
    except json.JSONDecodeError as exc:
        return {"source_url": source_url, "warning": f"runtime config was invalid JSON: {exc}"}
    config = payload.get("config", {})
    return {
        "source_url": source_url,
        "market_id": config.get("marketId"),
        "language": config.get("lang"),
        "game_url": config.get("gameUrl"),
        "landing_page": config.get("landingPageId"),
    }


def clean_error(error: Exception) -> str:
    return re.sub(r"\s+", " ", str(error)).strip()
