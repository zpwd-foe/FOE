# GB Update Tracker

Follow the refresh, validation, coverage, and publishing instructions in [README.md](README.md#refresh-the-great-building-dashboard).

- Discover the current public `ForgeHX…js` URL from a freshly loaded beta game at `https://zz1.forgeofempires.com/`, using an existing browser session when needed. Do not use Linnun's site or a cached URL as the discovery step.
- Run `python3 -B -u -m foe_cdn_inspector refresh --forge-hx-url 'CURRENT_PUBLIC_URL'` from this directory. Fresh local game HTML may be supplied through `--client-html` instead. The public login page alone does not currently expose ForgeHX.
- Preserve caches and dated snapshots. The first direct scan is a baseline, not 51,000 newly released assets. Later scans compare our own inventories. The dashboard shows all current GB bonus text/icons and a rolling 60-day change archive.
- Distinguish client assets/text from separate building values and level costs. ForgeHX-only scans do not verify those values. Preserve the visible coverage note and historical provenance.
- Repair upstream format changes with regression tests. Retain beta-market verification, HTTPS host restrictions, and never evaluate remote JavaScript.
- Verify the source URL/hash, successful status, latest pointer, matching stable/snapshot HTML, empty failure lists, and `git diff --check`. Run the offline test suite after code changes.
- Publish only when requested, using `FOE-51` unless another key is supplied. Stage both dashboard HTML files and related changes explicitly. Leave unrelated work untouched.
