#!/usr/bin/env python3
"""Preview the deployment build with the GB Planner's cache policy."""

import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        filename = urlsplit(self.path).path
        fingerprinted = re.search(r"\.[0-9a-f]{12}\.(?:css|js|png)$", filename)
        cacheable = fingerprinted and self.command in ("GET", "HEAD") and self.path_exists()
        policy = "public, max-age=31536000, immutable" if cacheable else "no-cache"
        self.send_header("Cache-Control", policy)
        super().end_headers()

    def path_exists(self):
        return Path(self.translate_path(self.path)).is_file()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--port", type=int, default=8014)
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not (directory / "asset-manifest.json").is_file():
        parser.error("Run npm run build before starting the preview.")
    handler = partial(PreviewHandler, directory=str(directory))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Serving {directory} at http://127.0.0.1:{args.port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
