from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

from portal_tools import PRIME_POST_DIST, publish_prime_post
from build_dashboard import SITE_DIR, navigation, render


class PrimePostPortalTests(unittest.TestCase):
    def test_portal_tool_resolves_assets_and_keeps_the_existing_security_policy(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            header_template = re.search(r'<header class="site-header">.*?</header>',
                (SITE_DIR / "templates/base.html").read_text(), re.DOTALL).group(0)
            header = render(header_template, {"icon_asset": "/GOE.test.png", "navigation": navigation("tools")})
            assets = publish_prime_post(output, Path("GOE.test.png"), portal_header=header)
            page = (output / "tools/gb-prime-post/index.html").read_text()
            self.assertIn('href="/tools/"', page)
            self.assertIn('href="/"', page)
            self.assertIn('href="/GOE.test.png"', page)
            self.assertIn(header, page)
            self.assertIn('href="/tools/" aria-current="page"', page)
            self.assertNotIn('id="theme-toggle"', header)
            self.assertIn('id="theme-toggle"', page)
            self.assertNotRegex(page, r"<script(?![^>]*\bsrc=)[^>]*>")
            self.assertNotIn("guide-data", page)
            self.assertEqual(len(assets), 5)
            for asset in assets.values():
                self.assertIn(f'/{asset.name}', page)
                self.assertEqual(asset.read_bytes(), (PRIME_POST_DIST / "assets" / asset.name).read_bytes())
            self.assertLess(sum(p.stat().st_size for p in assets.values() if p.suffix == ".js"), 140_000)
            theme = re.search(r'<script src="([^"]*goe-theme[^\"]*)"', page)
            self.assertIsNotNone(theme)
            self.assertLess(theme.start(), page.index('rel="stylesheet"'))

    def test_inline_script_is_rejected_before_publishing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "asset-manifest.json").write_text((PRIME_POST_DIST / "asset-manifest.json").read_text())
            (root / "goe.html").write_text('<script>alert("blocked")</script>')
            with self.assertRaisesRegex(ValueError, "external scripts"):
                publish_prime_post(root, Path("GOE.test.png"), root, portal_header="")


if __name__ == "__main__":
    unittest.main()
