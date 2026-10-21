# Repository Guidelines

## Project Structure & Module Organization
All automation lives in `script/`. `city_analysis.py` ingests the latest `city_*.json` from `~/Documents/FOE/CityAnalysis/input`, prints the map/troop breakdown, and drops `output/city_summary_<YYYY-MM-DD_HH-MM-SS>.txt`. `kit_producer_report.py` scans `CityEntities` for kit-producing buildings, emitting two ranked text reports plus `output/kit_buildings_<ERA>.xlsx`. Clipboard helpers (`save_city_json.sh`, `display_top_attribute.sh`) sit alongside the age lookup in `script/script_config`. Only commit sanitized fixtures in `input/`; generated outputs stay ignored, so stash any samples under a dedicated branch if they must be shared.

## Build, Test, and Development Commands
- `bash script/save_city_json.sh` — dump the FOE clipboard export into `~/Documents/FOE/CityAnalysis/input/city_<date>.json` and prettify via `jq`.
- `python3 script/city_analysis.py` — produce the daily city summary; redirect stdout if you need a diffable artifact.
- `python3 script/kit_producer_report.py --era VirtualFuture` — rebuild `one_up_kit_buildings_<ERA>.txt`, `renovation_kit_buildings_<ERA>.txt`, and the Excel workbook in `output/`.
- `bash script/display_top_attribute.sh | less` — survey the JSON topography before touching new keys.

## Coding Style & Naming Conventions
Python uses 4-space indent, explicit type hints, and module-level constants (`UPPER_SNAKE_CASE`). Favor small, pure helpers over inlined logic so they can be reused across analyzers (e.g., `format_probability`, `extract_size`). Bash scripts must start with `#!/usr/bin/env bash`, use `set -euo pipefail`, quote paths, and stick to `snake_case`. Filenames, branches, and exported assets should carry ISO timestamps for traceability.

## Testing Guidelines
For the building-ranking dashboard, run `python3 -B -m unittest discover -s building-ranking-webapp/tests -p 'test_*.py'` and `node --test building-ranking-webapp/tests/test_*.js` from this directory. When altering the older city/kit parsers, run `python3 script/city_analysis.py` plus `python3 script/kit_producer_report.py --era <TargetEra>` against at least two archived inputs. Compare the resulting `output/` artifacts (text + Excel) with prior runs and call out intentional diffs in the PR. Add a new JSON fixture any time you rely on previously unseen keys or eras and note which scripts were exercised.

## Commit & Pull Request Guidelines
Use Conventional Commit prefixes (`feat`, `fix`, `docs`, `chore`) and keep commits focused (config changes separate from data updates). PRs must include: summary, linked ticket or FOE patch note, exact commands executed, and snippets or attachments from updated outputs (including the Excel diff when relevant). If a workflow change impacts other agents (e.g., new input paths), highlight it in the PR body and ping reviewers.

## Data & Configuration Notes
Never push raw exports from `~/Documents/FOE/city`. Continue to store sanitized snapshots under `CityAnalysis/input/` but keep them out of Git unless required for reproducibility. Extend `script/script_config` whenever Inno adds an era, and update helper constants (e.g., `TARGET_KIT_SUBTYPES`) in tandem. Developers with different directory layouts should override the path constants locally rather than editing them in commits.

## Required Event Audit for Every Reference Refresh
Every building-ranking reference refresh must include an event-version audit, even when the request only says to update the data. Inno often reuses an older event's entity ID for a newly released version. Assign each version to the event that introduced that version, including silver, gold, platinum, ascended, and other time-limited upgrades. Never infer the release event solely from the entity ID, a name prefix such as `Ascended`, or the current calendar year.

1. Preserve the previous reference and exported dashboard as the comparison baseline. Compare new/renamed entities and upgrade families with the newest reference, paying particular attention to legacy event IDs, new levels, renamed placeholders, and changed upgrade/decay targets.
2. Verify the introducing event/year from InnoGames event reward announcements where available. Add exact-version overrides in `script/building_ranking_model.py`; do not move an entire family to the new event. Record the verified entity ID, name, category, and supporting URL in `building-ranking-webapp/config/event-category-reviews.json`. Include original-version regression cases. A version that correctly keeps its ID-derived event still needs a sourced review when newly added or renamed.
3. Run `python3 -B building-ranking-webapp/scripts/export_data.py --check-event-categories`. This checks the new data against the prior all-level exports and blocks unreviewed new, renamed, or reclassified event versions. Resolve every finding using evidence; do not bypass it by rewriting the baseline or adding blanket approvals. If evidence is unavailable, report the unresolved mapping rather than guessing an event or publishing it as verified.
4. Run the full export, then the Python and JavaScript suites in `building-ranking-webapp/tests`. Confirm corrected variants in both ranking and all-level city datasets across every age, and confirm original versions retain their original events. Summarize the source reference, corrections, and validation with the refresh.

The exporter also enforces this review before writing refreshed assets. `--compress-existing` only recompresses data whose source, model, exporter, and review registry still match its export state; it is not a reference-refresh shortcut. Existing category regression cases cover Elysian Whisperwood Watermill and its ascended version (Fellowship 2026), and Eerie Delirium Coaster and its ascended version (Halloween 2026).
