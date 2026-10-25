GB Prestige Update — Ubernerd workbook edition

The dashboard covers 49 buildings and 123 boost series. Interactive plots show
every supplied level, including separate attempt-limit graphs. Click/tap a graph
or enter any current/target level to update boost gains and upgrade planning.
Comparisons default to level 50 → 150. The shortlist supports arbitrary levels
for up to three buildings. The Multiplicative goal finds buildings with multiplier
effects; their charts list clickable step levels. Each chart title has an info
button for its boost description and multiplier example.
Boosts show multipliers first, then other Gold boosts, followed by Copper boosts.
Graph ticks mark 100-level boundaries at 1, 101, 201 and 301 (201 for Copper-only).

Unlocking details include blueprint sets, coins, supplies, medals, goods and
base contributor FP rewards. The sidebar shows total upgrade FP and compares the
same level range on the live server, using the workbook's pre-update costs. Detailed source
coverage and full level tables are kept in the data, outside the dashboard UI.
Existing boost names, icons, red/blue army terminology and Planner themes remain.

Hidden feature: simple dude's view
  Click or tap the site icon seven times within three seconds. The view has no
  public navigation link or URL shortcut, and reloading requires the gesture
  again. Back to dashboard restores the explorer and its previous scroll position.
  Defaults: regular base 10,000%, GBG 20,000%, GE 20,000%, target level 150.
  Dropdown (all levels 1–300) and slider target controls stay in sync.
  Mode priority keeps regular weight at 1 and splits 1 between GBG and GE.
  Stat priority splits 2 between attack and defense. Army priority splits 2
  between red and blue; effects benefiting both armies use both weights.
  Defaults: GBG ×0.75, GE ×0.25, attack ×1.5, defense ×0.5, red ×1 and blue ×1.
  All three priority sliders use five stops (0/25/50/75/100%). Attack/defense
  and red/blue use individual weights of 0, 0.5, 1, 1.5 or 2.
  Rank by weighted percentage points per building tile; mode
  totals and boost breakdowns use the same weights. Zero-weight bonuses do not
  block scores or trigger warnings. Retained values have a prominent rank badge.
  Count each affected red/blue stat and each listed
  effect once; all-mode effects use the regular base without being repeated in
  GBG/GE. Multipliers use the entered mode base independently (no compounding).
  QI and special battle mechanics, including critical-hit chances, are excluded.
  Copper-only targets cap at 200. Trailing missing boosts retain the last known
  value with a warning in scores and breakdowns. Internal gaps make a building
  unranked. Gold effects below 101 contribute zero.

Data refresh, from this directory:
  python3 -B build_data.py
  npm test

The read-only source is ../../input/GB Update - Ubernerd.xlsx. The importer uses
saved values from the XLSX ZIP/XML, without recalculating formulas or modifying
the workbook. The source SHA-256 is recorded in data/guide-data.json.

Authoring files:
  import_workbook.py: workbook reader, cost reconciliation and source coverage.
  data/workbook_mapping.py: reviewed boost columns, units, attempt limits and
    qualitative play-style advice.
  build_data.py: established building/icon metadata plus the workbook import.
  data/tracker-catalog.json: existing icon and mechanic definitions.
  data/guide-data.json and .js: generated runtime data, schema version 2.
  core.js: missing-data-safe upgrade calculations.
  charts.js: local SVG rendering, preserving all points and gaps.
  combat-ranking.js: combat scope, multiplier estimates, ranking and icon gesture.
  simple-view.js: hidden leaderboard controls and building breakdowns.

The historical transcription, guidance, source manifest and screenshots remain
as authoring references. Their numerical checkpoints do not enter the runtime
dataset. Screenshots are no longer included in the published dist directory.

Source interpretation:
  - Detail sheets take priority over overview ranges. Gold buildings have rows
    through 300 and Copper-only buildings through 200. Some boosts end earlier.
    These are source coverage limits, not new game caps.
  - Gold effects are locked below 101, including zero placeholders in the source.
    Above a series' highest known level, its last known boost or attempt limit
    is retained for display and calculations, with a warning and originating
    level. Charts distinguish this with dashed lines. Internal gaps remain
    Not supplied. Costs and contributor rewards are never carried forward.
    Raw observations remain unchanged except explicit user confirmations:
    SHS's Copper fighting multiplier is confirmed as 4% through level 108.
    Levels 102–108 and their provenance are recorded in confirmedRanges.
  - Percent fractions are scaled by 100. CF Gold values are already whole
    percentages. TT Aid Goods uses the displayed number from its percent-formatted
    detail column as a count, consistent with Main (New)!D83.
  - Fixed collection limits are taken from Main (New)!D23, D38, D56 and D86.
    Other attempt limits come from explicit per-level columns. Daily refresh
    rates are not inferred. Rare percentages remain separate from trigger rates.
  - Per-level FP and cumulative totals are reconciled against the post-update
    Costs sheet for every building and level. Upgrade sums exclude the completed
    current level and include the target. They are before contributor funding.
  - The Coins / Supplies column is the amount required of each resource.
    Goods are shown per type.
    Supplied Copper-level unlock resources are included, including SHS goods
    from level 11. Gold blueprint rows appear only for Gold-capable buildings
    when the selected upgrade reaches level 101 or higher.
    Missing required resource cells make that resource total unavailable.
    CENTAURUS, HYDRA, PEGASUS, Cosmic Catalyst and Stellar Warship have
    unpublished resource costs. Their missing coins, supplies, medals and goods
    totals show TBA from level 11, as listed in the official Prestige overview:
    https://support.innogames.com/kb/ForgeOfEmpires/en_DK/6992/Great-Buildings-Prestige-redesigned-the-feature-overview
    Confirmed values (including zero) take precedence; old live costs are not used.
    Tests reconcile all five unlocking-resource fields for every building and
    level against the source, then check individual costs and upgrade ranges.
  - Multiplier step levels include the known starting/unlock value and increases
    confirmed by consecutive supplied levels. Missing spans are never bridged.
  - P1–P7 values are base FP rewards, not assumed donations or secure amounts.
    Personal contribution boosts are not applied.
  - Himeji Castle's Gold scope is user-confirmed as the blue attack multiplier
    in GBG (pairing 75). Its corrected icon and wording are separate from Seed
    Vault's attack-and-defense multiplier (pairing 63).
    Qualitative ratings are not calculated efficiency/payback rankings.

Build and preview:
  npm run build
  npm run serve
  Open http://127.0.0.1:8014/

Node 20+ builds with built-in modules and local assets; no npm installation or
network is needed. Deployment uses checked-in generated data, so the original
XLSX and Python data rebuild are not required for hosting. npm test checks source
coverage, workbook fidelity when the XLSX is present, upgrade calculations,
missing-data boundaries, image integrity, cache invalidation and reproducibility.
Commit source and regenerated dist together, as in GBAnalysis.

Only dist is published. It contains HTML, cache rules, the asset manifest,
fingerprinted scripts/styles, generated data and local icons. Raw workbooks,
tests and authoring files stay outside it. All content hashes use SHA-256 with
12 hexadecimal characters; HTML revalidates and assets cache immutably.

Cloudflare Pages configuration:
  Repository: zpwd-foe/FOE
  Production branch: main
  Root: GBAnalysis/future-updates/gb-prestige
  Framework: None
  Build command: leave blank for prepared dist, or npm run build
  Output directory: dist

This dashboard is separate from the main GB planner and its data. Styling uses
assets/planner-theme.css, including the shared gb-analysis-theme preference.
