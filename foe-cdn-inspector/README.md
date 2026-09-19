# FoE CDN Inspector

A small, dependency-free project for examining recent public files on the Forge of Empires beta CDN.

It uses `https://zz1.forgeofempires.com/` to verify the public beta (`zz`) bootstrap, inventories links on `https://foezz.innogamescdn.com/`, downloads JSON and other text-like files, and builds a searchable local HTML report.

## Why discovery uses a change report

The CDN does not expose a browsable directory or a public root manifest. Filenames are content-hashed, so guessing them is neither useful nor reliable. This project discovers recent public URLs through [Linnun's FoE Asset Tracker](https://www.linnun.net/foe/asset-tracker/) and then fetches file content directly from InnoGames' public `foezz.innogamescdn.com` host. The tracker is an independent discovery source, not an InnoGames service.

Only public GET requests are made. The tool does not log in, reuse browser cookies, call game APIs, or attempt to bypass access controls.

## Quick start

Python 3.10 or later is enough:

```bash
cd foe-cdn-inspector
python3 -m foe_cdn_inspector scan
```

The default scan:

- probes `zz1.forgeofempires.com` and verifies market `zz`;
- selects the newest published change report;
- inventories added, updated, removed, and referenced CDN URLs;
- downloads current JSON/text/metadata files, up to 10 MB each;
- writes `snapshots/<report-id>/inventory.json` and `inventory.csv`;
- generates `snapshots/<report-id>/index.html` with image thumbnails and text previews.

Open the result directly, or serve it locally:

```bash
REPORT_ID=$(cat snapshots/latest.txt)
python3 -m http.server 8000 --directory "snapshots/$REPORT_ID"
```

Then visit `http://localhost:8000/`.

## Refresh the Great Building dashboard

From this project directory, run one command whenever a new beta report is available:

```bash
python3 -m foe_cdn_inspector refresh
```

The command checks the newest published report, verifies the `zz1` beta bootstrap, and refreshes the `GBP|` bonus descriptions from 2026-03-01 onward. It also rebuilds the full 60-day change history, ending on the newest report date. Previously parsed reports are read from `.cache/`; only new reports need to be fetched. The current page is written to `dashboard/index.html`, with the large archive in `dashboard/history.html` loaded only when opened. A dated copy of both files remains under `snapshots/<report-id>/`. Both `dashboard/` files are tracked deployment artifacts: after refreshing, commit and push them to update a Git-connected Cloudflare Pages site. Set the Pages project root directory to `foe-cdn-inspector` and the build output directory to `dashboard`; no build command is needed. If a report fails to collect, the current dashboard and `snapshots/latest.txt` are left unchanged.

The header’s **Data through** date records the latest successful update check, even when no new report is available. The check timestamp is saved in `dashboard-state.json` and retained during local UI rebuilds. The archive’s date range still ends on the newest published report, so checking for updates does not imply that new game data was released. Failed refreshes and dry runs do not advance the displayed check date.

To preview what would be refreshed without changing files, or to rebuild after a UI change when no new report has appeared:

```bash
python3 -m foe_cdn_inspector refresh --dry-run
python3 -m foe_cdn_inspector refresh --force
```

Serve the stable dashboard directory once; later refreshes update that same page without restarting the server:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory dashboard
```

Open `http://127.0.0.1:8766/`. You can change the rolling window with `--window-days` or the GBP starting date with `--since YYYY-MM-DD`.

## Useful scans

```bash
# Inventory without downloading file bodies
python3 -m foe_cdn_inspector scan --download none

# Download images/audio/fonts as well as text
python3 -m foe_cdn_inspector scan --download all

# Process the five newest reports
python3 -m foe_cdn_inspector scan --reports 5

# Reproduce one known report and retain its source HTML
python3 -m foe_cdn_inspector scan \
  --report-id 2026-09-17_11-16-22 \
  --save-source

# Limit a trial run to ten downloads (the inventory is still complete)
python3 -m foe_cdn_inspector scan --limit 10
```

## String history

Reconstruct prefix-matching strings added during a date range and remove any exact strings that a later report marks as removed:

```bash
python3 -m foe_cdn_inspector strings \
  --since 2026-03-01 \
  --prefix 'GBP|' \
  --output results/gbp-active-since-2026-03-01 \
  --dashboard snapshots/2026-09-17_11-16-22
```

This strings-only path stops reading each report before the large building-data section and caches the parsed string changes. It writes JSON (including removal history), CSV, and a Markdown table. When `--dashboard` points to an existing snapshot directory, it also adds a searchable active-strings view to that dashboard. Dates are inclusive and always use `YYYY-MM-DD`.

Add a detailed, date-ranged activity history to the same dashboard:

```bash
python3 -m foe_cdn_inspector history \
  --since 2026-07-20 \
  --until 2026-09-17 \
  --full \
  --output results/history-last-60-days \
  --strings-results results/gbp-active-since-2026-03-01.json \
  --dashboard snapshots/2026-09-17_11-16-22
```

History collection records full public asset URLs and string changes. Add `--full` to fetch building summaries and metadata-family names as well; without it, the tracker index still supplies their counts. Report payloads are cached locally.

Install an optional shell command with `python3 -m pip install -e .`; after that, `foe-cdn-inspector scan` is equivalent to the module command.

## Output model

Every file record includes its public URL, change class, media kind, extension, local path, content type, byte size, SHA-256 hash, compact content summary, and any per-file download error. A failed file does not abort the rest of a batch.

Metadata endpoints such as `/start/metadata?id=...` are stored as safe `.json` filenames. Downloads are hard-restricted to HTTPS on `foezz.innogamescdn.com`; tracker content cannot redirect the downloader to another host.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

The tests are offline and use small HTML fixtures.

## Scope and etiquette

This is a read-only research tool for already-public beta assets. Keep concurrency modest, retain the defaults unless there is a reason to change them, and respect InnoGames' terms and infrastructure. "Recent" means recent according to the external tracker's snapshots; CDN response headers do not provide a complete publication history.
