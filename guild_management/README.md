# GoE Guild Portal

This project provides `generate_treasury_report.py`, which creates:
- A guild-member PDF report (polished, visual, 2 pages)
- A technical Markdown report (detailed metrics and tables)

It also includes the no-runtime static GoE Guild Portal in `dashboard/`,
ready for Cloudflare Pages. The portal provides a home page, a treasury module,
an individual goods-contribution module, and a resource library. The library
includes the Official GoE Guild Expedition Lottery Rules and an eight-day GBG
coin-trial field report. Treasury tools include
7/30/90-day period controls, age drill-downs, and a short goods watch list.
Contribution tools rank members using up to 30 days of positive goods records, including
building production and direct treasury contributions, and provide public
member-level aggregates. The most recent 500 contribution records per member and
aggregated guild-goods usage by purpose, good, and era are hidden behind a
client-side assigned-passcode prompt; this is a convenience gate, not secure
authentication, because the static data is delivered to the browser. Keep
Cloudflare Access enabled for real access control. Successful member validation
is remembered in session storage for the current browser tab, including across
period changes and same-tab navigation.
Bronze Age goods are excluded from the treasury balance using the same rule as
the PDF report.

## Prerequisites

- The shared `../CityAnalysis/.venv` environment with the project dependencies installed

## How To Run

From this folder:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_report.py
```

This uses defaults:
- `--guild-name GoE`
- `--days 60`
- `--input-dir input`
- `--output-dir output`
- `--dip-threshold 110000`

## Static Dashboard

### Forge Hammer treasury and contribution export (recommended)

`export_forge_hammer_treasury.py` reuses Forge Hammer's real Chrome storage and
CSV exporters. It never constructs a game request or chooses a request ID. The
command starts Chrome once with `Profile 3` and the installed companion
extension from `chrome/forge-hammer-treasury-exporter/`.

For treasury balances, the companion dispatches the game's own **open Guild
Treasury** action exactly once. Immediately beforehand it dispatches the game's
close-all-windows action once, which clears the visible window stack and queued
popups, then waits for window disposal to settle. It correlates Forge Hammer's
outgoing request and incoming response by the game-assigned request ID, waits
for the matching hourly and daily records, and exports `input/stats-YYYY-MM-DD.csv`. Because a
new Chrome profile begins with no Forge Hammer history, the launcher merges the
download into the longest compatible prior treasury CSV before rebuilding. A
current-day snapshot can therefore extend, but never replace, saved history.
If the browser session opens a pre-game page, the companion clicks the official
**Play** action once and selects the configured world display name (`Yorkton`
for `us24`) once before continuing. Both navigation steps are guarded against
repetition and persist only across that launched tab's redirects.

For contribution logs, the launcher reads the newest record timestamp from the
latest prior `input/guild-goods-contribution/GuildTreasury-*.csv` and subtracts
one hour. The companion opens the game's Message Center once so its contribution
module is initialized, opens the official Guild Contribution window, resets
Forge Hammer's in-memory export log, and advances through 10-row pages in
order. Each page is requested once with the game client's own request ID. It
stops when the first row on the current page is at or before the overlap cutoff,
or when the server reports that no page remains, then invokes Forge Hammer's
Guild Treasury Export Log feature. The launcher validates and imports the file
as `input/guild-goods-contribution/GuildTreasury-YYYY-MM-DD.csv`.

Official Google Chrome builds ignore the `--load-extension` command-line flag.
Install the companion once by opening `chrome://extensions`, enabling Developer
mode, choosing **Load unpacked**, and selecting
`chrome/forge-hammer-treasury-exporter/`. Keep that extension and Forge Hammer
enabled in Profile 3.

Before every run, close Google Chrome completely so the correct profile can be
started. The profile must already be signed in to the configured `FOE_WORLD`.
Then run:

```bash
../CityAnalysis/.venv/bin/python -B export_forge_hammer_treasury.py
```

The command is intentionally fail-closed:

- If both of today's validated CSVs already exist, it skips Chrome and refreshes
  both dashboards from those local inputs. If only one exists, it requests only
  the missing export.
- It launches the browser once, triggers each required game action once, and
  never retries a failed login, page load, treasury refresh, contribution page,
  or export.
- It exports only after Forge Hammer observes the matching response and stores
  its resource map in both the current-hour and current-day records.
- Contribution offsets must be `0, 10, 20, ...` with exactly one matching
  response each. If new records increase the server's total between pages, the
  companion removes only the exact page-boundary overlap proven by that increase.
  Boundary comparison ignores parsing-time milliseconds introduced by Forge
  Hammer's minute-label date parser; differences in seconds still fail the check.
  A shrinking count, a full-page shift, or an overlap mismatch fails closed
  instead of exporting ambiguous rows. Paging stops only at the requested
  overlap or when the response's total count proves that the server has no next
  page.
- It requires the 115-good Stellar Age: Discovery schema and a unique
  current-date row. During the one-age transition, the importer accepts only an
  exact 110-column prefix and appends five zeroes to older history rows.
- It requires Forge Hammer's **Guild Treasury Export Log** setting to be enabled.
- A failed or interrupted attempt is recorded in the Git-ignored, mode-600
  `.foe-forge-hammer-state.json`; another automatic attempt that day is refused.
  A user-authorized diagnostic retry requires the explicit
  `--allow-same-day-retry` flag and retains the previous attempt in the state file.

After saving `stats-YYYY-MM-DD.csv` directly under `input/` and
`GuildTreasury-YYYY-MM-DD.csv` under `input/guild-goods-contribution/`, the
command builds and validates both dashboards in private staging before replacing
the live output pair. Treasury uses the validated
current-date CSV. Contribution refresh merges every CSV in its input directory
because those exports are overlapping partial snapshots. Use `--no-refresh`
only when CSV download and validation are intentionally being separated from
dashboard generation; `--rebuild` remains as a compatibility alias.
Custom export destinations require `--no-refresh`; the paired builder expects
the standard project input directories.

The contribution CSVs do not provide transaction IDs, and observed timestamps
are minute-granular. A visible row signature is **not** a unique transaction
identifier. Identical-looking production rows can be legitimate and must not be
globally deduplicated. The companion now records passive page evidence: page
offsets, response counts, page request IDs, observed source timestamps, and row
order. Page request IDs identify requests, not transactions; local capture times
do not add precision to transaction times. This evidence makes no additional game
requests and does not authorize automatic row removal.

The evidence download is copied to private, Git-ignored `.foe-refresh/evidence/`
with mode 600. It contains player IDs but excludes names, cookies, headers, and
URLs; it is never included in the dashboard or published. The original JSON also
remains in the configured Downloads folder. If evidence cannot be saved, the
exporter records that fact and still requires exact CSV/treasury reconciliation.
Reload the unpacked companion extension after updating its source to enable this.

Contribution generation reconciles signed log changes against treasury changes
for every good before publishing. A legacy export can repeat a same-amount
page fragment even when the server's total row count does not change. The
generator may exclude that fragment only when its exact signatures already
appear in the preceding 10 rows, all rows are positive building production for
one player and timestamp away from either capture boundary, and one unique
correction makes every good balance exactly. It never applies a numerical
tolerance, removes donations or usage, or guesses between different possible
transactions. Genuine repeated production is retained when inventory supports
it. Ambiguous or unexplained differences still stop the update.

The audit records the removed count and zero-based normalized-row indexes in
`inventoryAudit`, along with checksums of the original exports. Source CSVs are
never rewritten. The corrected canonical history is used by later refreshes;
rebuilding the same files reuses its matching audit. If an export succeeds but
generation fails, fix the reported cause and resume from the saved CSVs as
described below. Do not delete the CSVs or bypass the audit to force a retry.

Use `--live-debug` for an explicitly authorized diagnostic attempt. It records
the one-shot navigation, game-assigned request IDs, matching responses, Forge
Hammer storage, pagination, and export milestones to a local
`foe-export-debug-*.json` download. Chrome remains open at the final success or
error state for manual inspection; the mode does not retry any game action.

Use `--dry-run` to validate the Chrome profile, Forge Hammer installation,
existing CSVs, and calculated contribution cutoff without opening the browser
or writing state. Browser paths, the profile directory, download directory, and
timeout can be overridden with the optional settings documented in
`.env.foe.example`.

### Daily automatic refresh and deployment

`automation/run_daily_refresh.py` is the fail-closed orchestration entry point
for unattended updates. A scheduled run requires a clean `main` branch that
exactly matches `origin/main`, runs the offline test suite before touching the
game, invokes the Forge Hammer exporter exactly once in download-only mode, validates both generated
datasets, and permits changes only under `dashboard/` plus the two source data
payloads. When publishing is enabled, it creates a generated-data-only `FOE-30`
commit and pushes it so Cloudflare Pages can deploy the refreshed dashboard.

The runner never retries. Before an export, it gracefully closes a stale Chrome
process only when that process was launched with the configured automation data
directory and profile. It refuses to close Chrome processes that do not match
both settings. A failed login, unresolved Chrome profile conflict, export,
validation, commit, or push ends that day's scheduled run and produces a local
notification. `KeepAlive` and `RunAtLoad` are deliberately disabled in the
LaunchAgent. Before publishing, the runner also compares the rebuilt treasury
dates with the previously published payload and refuses any update that drops a
historical snapshot. Logs and the process lock are local and ignored by Git.

#### Checkpoints and safe recovery

Download, paired build, validation, and publishing are separate stages. Failures
report the stage, reason, and last recorded successful run. A failure before
joint validation leaves the existing dashboard untouched. Promotion uses
recoverable backups; interrupted file moves are rolled back on recovery. This
is not an atomic multi-file filesystem swap, so a local file server could see a
brief gap during promotion. Remote publication happens only after validation,
in one generated-data commit. Unexpected user edits stop automatic recovery.

For a failed scheduled run whose two CSVs were saved:

```bash
../CityAnalysis/.venv/bin/python -B automation/run_daily_refresh.py --resume
```

Add `--publish` when publication is intended. A publishing-stage checkpoint
requires `--resume --publish`; if a commit succeeded but its push failed, this
pushes the same verified commit without rebuilding or exporting again. Diverged
history, unexpected staged changes, and a missing privacy hook require review.
Resume never launches Chrome, downloads missing CSVs, retries game actions, or
force-pushes. Commit a code fix before resuming the strict scheduled workflow.
Preflight accepts a last-good dashboard even when new CSVs are awaiting processing;
post-build validation still requires every available contribution CSV.

For a saved pair without a daily-run checkpoint, or to test a code fix locally:

```bash
../CityAnalysis/.venv/bin/python -B automation/build_pair.py \
  --csv input/stats-YYYY-MM-DD.csv --check-only
```

Remove `--check-only` to promote the validated local result. File checksums bind
recovery to the inputs, build code, and outputs; unchanged verified checkpoints
can be reused. The matching dated contribution CSV must exist. Neither command
edits the source CSVs. `.foe-refresh/` retains snapshots, backups, and build logs;
`.foe-daily-refresh.json` retains the daily checkpoint. Both are local-only and
Git-ignored. Keep these for a failed run until recovery is complete; older run
directories can then be archived manually. They are not automatically deleted.

#### Separate automation checkout (opt-in)

To keep development edits from blocking the scheduled job, first commit and
push the safeguards, then prepare a fresh directory **outside** the development
repository:

```bash
../CityAnalysis/.venv/bin/python -B automation/prepare_checkout.py \
  --destination /absolute/path/to/foe-automation
```

The helper clones `origin/main`, carries over the existing privacy pre-push hook,
and copies only ignored CSV inputs, `.env.foe`, browser-attempt state, and a
completed daily checkpoint with private permissions. It preserves the
no-repeat-game-attempt guard. It does not
copy a browser profile, migrate an unfinished daily checkpoint, install a job,
or launch Chrome. Resolve any pending publish in the original checkout first.
Uncommitted development files and staged changes stay in the source checkout;
the helper never copies them or changes the source index. The source branch
must still match `origin/main` so the deployed code is known.

Only a checkout created with the helper's `.foe-isolated-checkout.json` marker
can automatically fast-forward to newer `origin/main` commits. It requires a
clean repository, refuses local commits or divergence, and restarts the runner
with the updated code before validation or game access. Development checkouts
and saved-checkpoint recovery retain the strict branch-equality check.

Reload the companion extension from the new clone in the dedicated Chrome
profile, validate the clone with `--validate-only`, then explicitly reinstall the
same LaunchAgent label with `--project-dir` pointing to its `guild_management`
folder and an existing Python environment. Preserve your actual current schedule
when setting `--hour`/`--minute`; the example below is not a migration default.
Keep only one scheduled job. The clone deliberately does not auto-merge code:
after future code pushes, update its clean `main` with `git pull --ff-only` before
the next run. Divergence stops the job rather than discarding local work.

For reliable unattended runs, use a Chrome data directory dedicated to this
workflow. Add these local-only settings to `.env.foe`:

```dotenv
FOE_CHROME_USER_DATA_DIR=~/.foe-automation-chrome
FOE_CHROME_PROFILE_DIRECTORY=Default
FOE_WORLD_NAME=Yorkton
```

Open that profile once for setup:

```bash
open -na "Google Chrome" --args \
  --user-data-dir="$HOME/.foe-automation-chrome" \
  --profile-directory=Default
```

Install Forge Hammer and the unpacked companion extension in that profile,
sign in to the configured world, then quit that Chrome instance. A dedicated
data directory allows ordinary Chrome windows to remain open; the preflight
check blocks only another process using the automation directory. If the normal
Chrome data directory remains configured, all Chrome windows must be closed at
the scheduled time.

Validate the complete scheduled path without making a game request:

```bash
../CityAnalysis/.venv/bin/python -B automation/run_daily_refresh.py --validate-only
```

Install the daily 2:15 AM local-time job with automatic generated-data
publishing:

```bash
../CityAnalysis/.venv/bin/python -B automation/install_launch_agent.py \
  --hour 2 --minute 15
```

Installation replaces the same LaunchAgent if it already exists, but never
starts it immediately. Use `--no-publish` for local-only dashboard generation,
or `--uninstall` to unload and remove the job.

### Direct game download

`sync_foe_treasury.py` logs in to Forge of Empires, downloads the current
guild-treasury snapshot and recent overlapping treasury transactions, and then
rebuilds both dashboard datasets. The overlap is intentional: contribution
exports are merged and deduplicated by the existing generator.

The treasury output mirrors Forge Hammer's Statistics export. It takes the
authoritative goods IDs and names from `StartupService.getData.goodsList`,
stores the `ClanMain` treasury resource map as a daily snapshot, fills omitted
resource IDs with zero, and writes `stats-YYYY-MM-DD.csv` in the same
semicolon-delimited format while retaining the existing daily history.

Create the local credential file once:

```bash
cp .env.foe.example .env.foe
chmod 600 .env.foe
```

Fill in `FOE_USERNAME` and `FOE_PASSWORD` in `.env.foe`. `FOE_WORLD` defaults
to `us24`. The credential file is ignored by Git, must not be committed, and is
parsed directly rather than sourced by a shell. Login cookies stay in memory
for the duration of the command.

On every run, the sync reads the exact ForgeHX bundle referenced by the logged-in
game page and extracts its client version and request-signature secret. It does
not use cached or hard-coded fallback values. If the bundle cannot be loaded or
parsed, the command stops before sending any game API request. Optional
`FOE_CLIENT_VERSION` and `FOE_SIGNATURE_SECRET` values are safety assertions:
the command aborts if either one differs from the live bundle.

Validate authentication without writing data:

```bash
../CityAnalysis/.venv/bin/python -B sync_foe_treasury.py --login-only
```

Send exactly one startup gateway request and write a permission-restricted,
Git-ignored diagnostic record containing only redacted protocol metadata:

```bash
../CityAnalysis/.venv/bin/python -B sync_foe_treasury.py --gateway-probe
```

Download only the current treasury snapshot using the startup, clan, and
treasury gateway sequence, then exit before any contribution request:

```bash
../CityAnalysis/.venv/bin/python -B sync_foe_treasury.py --treasury-only
```

Download both CSVs and rebuild the portal:

```bash
../CityAnalysis/.venv/bin/python -B sync_foe_treasury.py
```

Use `--download-only` to stop after writing the input CSVs. The treasury file
keeps the accumulated daily history and replaces today's row when rerun. The
contribution file contains a configurable overlap with existing history so a
rerun remains deterministic. Optional settings are documented in
`.env.foe.example`.

Build the portal from the templates and content in `site/` without changing
treasury data:

```bash
../CityAnalysis/.venv/bin/python build_dashboard.py
```

Refresh the dashboard after adding a treasury export to `input/`:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_dashboard.py
```

Refresh contribution records after adding a `GuildTreasury-*.csv` export to
`input/guild-goods-contribution/`:

```bash
../CityAnalysis/.venv/bin/python generate_contribution_dashboard.py
```

Contribution exports are non-cumulative snapshots and may overlap. The refresh
script merges every CSV in that directory, removes duplicate transactions both
within and across files, and lets the newest overlapping copy supply the current
player display name. Do not remove older exports or select only the newest file
for a normal refresh.

The refresh script selects the newest CSV by modified time, writes
`site/data/treasury-data.js`, and rebuilds every portal page. Source assets stay
under `site/`; the deployable `dashboard/` directory contains only
content-fingerprinted CSS, JavaScript, data, icons, and responsive banner files.
This lets browsers cache assets efficiently without showing an older dashboard
after a deployment.
The Member Contributions page embeds its 30-day overview in the HTML and loads
a compact pre-aggregated summary for range changes and search. Detailed transaction
history is capped to the most recent 500 contributions in each fingerprinted
per-member JSON file and is fetched only after that member's passcode is
accepted, keeping raw history off the initial page-loading path.
The script supports both the older comma-delimited exports and the current
semicolon-delimited FoE export format. The contribution dashboard offers 3-,
7-, and 30-day windows, using the available history when it contains fewer than
30 days.

Treasury data is operational guild information. Protect the deployed dashboard
with a Cloudflare Access policy before adding a public custom domain. Static
headers prevent indexing, but they do not authenticate visitors.

### Cloudflare Pages deployment

The production portal is served from the root of `https://goe.z301.uk/`. Use
these Cloudflare Pages build settings:

```text
Build command: [leave empty]
Build output directory: dashboard
Root directory: guild_management
```

The committed `dashboard/` directory is the complete, deploy-ready site. Portal
links and fingerprinted assets are intentionally rooted at `/`. The included
`dashboard/_redirects` file permanently redirects old `/guild-management/...`
bookmarks to their corresponding root URLs, while `dashboard/_headers` defines
the production security and caching policy. The generated top-level `404.html`
also prevents Cloudflare Pages from treating missing asset paths as SPA routes
and returning the portal HTML with an incorrect MIME type. HTML responses use
`Cache-Control: no-transform` so Cloudflare does not inject an analytics beacon
that conflicts with the portal's strict Content Security Policy. Run the local
build and commit its generated dashboard files before deploying because
Cloudflare does not run a build command in this configuration.

In the Cloudflare dashboard, add `goe.z301.uk` under the Pages project's
**Custom domains** settings. If the `z301.uk` zone is managed by the same
Cloudflare account, Cloudflare creates the required DNS record during setup.

For a local preview:

```bash
../CityAnalysis/.venv/bin/python -m http.server 8001 --directory dashboard
```

Portal routes:

- `/` — Guild Portal home
- `/treasury/` — live treasury dashboard
- `/treasury/contributions/` — individual guild goods contribution rankings and member drill-downs
- `/contributions/` — compatibility redirect to the Treasury contribution section
- `/resources/` — guild resource library
- `/resources/guild-expedition-lottery-rules/` — lottery rules

Resource metadata lives in `site/resources.json`; policy text lives in
`site/content/`. Add a resource entry and an HTML content fragment to extend
the library without changing the shared navigation or page layout.

## Common Examples

Run with a custom guild name:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_report.py --guild-name "GoE"
```

Run a different window:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_report.py --guild-name "GoE" --days 30
```

Run against a specific CSV:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_report.py --csv "input/guild-treasury-daily (6).csv"
```

Use a custom dip threshold:

```bash
../CityAnalysis/.venv/bin/python generate_treasury_report.py --dip-threshold 125000
```

## Input Rules

- The script reads the latest `*.csv` in `input/` by modified time unless `--csv` is provided.
- Bronze Age goods are always excluded from all calculations:
  - `Wine`, `Dye`, `Marble`, `Lumber`, `Stone`
- Goods-level CSV is recommended.
- Optional mapping file for goods-to-age:
  - `input/good-age-map.csv` with headers: `Good,Age`
  - If missing, the script attempts to infer age groups by FoE goods column order.

## Output Files

Files are written to `output/` and include guild name + analysis date range:

- PDF:
  - `<guild-slug>-guild-treasury-report-<YYYYMMDD>-to-<YYYYMMDD>-<days>d.pdf`
- Technical Markdown:
  - `<guild-slug>-guild-treasury-report-<YYYYMMDD>-to-<YYYYMMDD>-<days>d-technical.md`

Example:
- `goe-guild-treasury-report-20251218-to-20260216-60d.pdf`
- `goe-guild-treasury-report-20251218-to-20260216-60d-technical.md`

## Script Options

```text
--guild-name      Guild name shown in report title and filename
--input-dir       Folder containing treasury CSV files
--csv             Specific CSV file to analyze
--days            Analysis window in days (default: 60)
--output-dir      Folder to write reports
--good-age-map    Optional Good->Age mapping CSV
--dip-threshold   Threshold for low-stock goods list (default: 110000)
```
