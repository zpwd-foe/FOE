"""Publish the tested Prime & Post build inside the guild portal."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

PRIME_POST_DIST = Path(__file__).resolve().parent.parent / "GBAnalysis/future-updates/gb-prestige/dist"
PRIME_POST_ROUTE = "/tools/gb-prime-post/"


def publish_prime_post(
    output_dir: Path,
    icon_asset: Path,
    source_dir: Path = PRIME_POST_DIST,
    *,
    portal_header: str,
) -> dict[str, Path]:
    """Copy only calculator dependencies; retain one source of truth for its math."""
    manifest = json.loads((source_dir / "asset-manifest.json").read_text())
    allowed_assets = set(manifest["assets"].values())
    source = (source_dir / "goe.html").read_text()
    if re.search(r"<script(?![^>]*\bsrc=)[^>]*>", source):
        raise ValueError("Prime & Post must use external scripts for the portal CSP")
    targets: dict[str, Path] = {}

    def reference(match: re.Match[str]) -> str:
        attribute, value = match.groups()
        if value.startswith(("#", "https://", "http://")):
            return match.group(0)
        if value in {"goe.html", "index.html"}:
            target = "/" if value == "goe.html" else "/tools/"
        elif value == manifest["assets"]["assets/goe-guild.png"]:
            target = f"/{icon_asset.name}"
        else:
            if value not in allowed_assets or Path(value).parent != Path("assets"):
                raise ValueError(f"Unexpected Prime & Post dependency: {value}")
            payload = (source_dir / value).read_bytes()
            digest = hashlib.sha256(payload).hexdigest()[:12]
            if f".{digest}." not in Path(value).name:
                raise ValueError(f"Stale Prime & Post fingerprint: {value}")
            published = output_dir / Path(value).name
            published.write_bytes(payload)
            targets[f"prime_post_{Path(value).stem}"] = published
            target = f"/{published.name}"
        return f'{attribute}="{target}"'

    source = re.sub(r'\b(src|href)="([^"]+)"', reference, source)
    source, header_count = re.subn(
        r'<header class="site-header">.*?</header>',
        lambda match: portal_header, source, count=1, flags=re.DOTALL,
    )
    if header_count != 1:
        raise ValueError("Prime & Post is missing its header")
    target = output_dir / PRIME_POST_ROUTE.strip("/") / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(source)
    return targets
