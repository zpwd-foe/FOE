GB Prestige Update — Ubernerd workbook edition

The dashboard covers 49 buildings and 123 boost series. Boosts cover levels
1–500 for Gold buildings and 1–200 for Copper-only buildings. Interactive plots
zoom to each GB's current → target range, including separate attempt-limit graphs.
Every supplied level in that interval is plotted. Click/tap a graph
or enter any current/target level to update boost gains and upgrade planning.
Each GB remembers its current and target levels in this browser. New GBs default
to level 50 → 150. Valid typed levels save immediately; chart selections,
multiplier-step buttons and comparison edits share the same saved target.
The browser keeps one small localStorage record per GB, keyed by its stable ID
(gb-prestige-levels-v1:<building ID>), replacing it on edits rather than keeping
history. Opening, filtering and resetting filters do not write or clear levels.
Different GBs remain independent across tabs; for the same GB, the most recently
saved pair is restored on refresh. Invalid stored fields use the default, and
blocked storage still allows calculations for the current visit.
The shortlist supports arbitrary levels
for up to three buildings. The Multiplicative goal finds buildings with multiplier
effects; their charts list clickable step levels. Each chart title has an info
button for its boost description and multiplier example.
Boosts show multipliers first, then other Gold boosts, followed by Copper boosts.
Graph ticks adapt to the selected range and label both endpoints. Reversed levels
still display both endpoints; equal levels show neighboring levels. Level 0 has no
boost or cost observation, so graphs begin at level 1. The selected range is used
on initial load, refresh, field edits, chart clicks and multiplier-step selections.

Each building also has a two-line FP chart comparing total leveling cost with
priming cost for every supplied level: 1–200 for Copper-only and 1–300 for Gold
buildings. These are individual level costs, not cumulative costs. The FP axis
uses a base-10 logarithmic scale with powers-of-ten ticks so early levels remain
readable. Zero FP, when present, uses a separate baseline below positive costs.
Hover and selected-level values remain exact FP amounts. Priming means
the owner's net FP cost after all expected position contributions, floored at 0;
it does not calculate when a donor position is secure. P1–P5 contribute 1.9 times
base FP rewards at every Copper-only level and Gold-building levels below 101.
Gold-building levels 101 and above use 1.2x base rewards for P1–P7. Each position
is rounded to whole FP before summing. Missing costs or required rewards remain
gaps, never retained values. Click/tap a cost chart, use its arrow/Home/End keys,
or change Target level to view exact totals, contributions and priming FP. Gold
charts mark the contribution-rate change at 101. Unlocking resources are separate.

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
  Dropdown (all levels 1–500) and slider target controls stay in sync.
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

The read-only cost source is ../../input/GB Update - Ubernerd.xlsx. The importer
uses saved values from the XLSX ZIP/XML, without recalculating formulas or
modifying the workbook. Its SHA-256 remains recorded in data/guide-data.json.

Boosts and attempt limits use the newer Google Sheets export:
  https://docs.google.com/spreadsheets/d/1Y4nFA5R8MLuWI1ACUHK9AfpWOYAGN3M_1Q5kCdYKDmA/edit?gid=528779517#gid=528779517
Download its XLSX export, then run:
  python3 -B refresh_boosts.py /path/to/export.xlsx
  GB_BOOST_WORKBOOK=/path/to/export.xlsx npm test
The refresh validates all 49 building mappings and saves the supplied boost
series in data/boost-snapshot.json, including the source URL, export SHA-256,
retrieval time and cell columns. build_data.py reapplies this snapshot on every
rebuild, so the older cost workbook cannot restore old boost gaps. Raw XLSX
exports stay outside the published site. The optional GB_BOOST_WORKBOOK check
independently reconciles every boost and variable attempt limit against the export.
FP, unlock costs, base rewards and GOE priming rules are not refreshed by this
command. Costs beyond level 300 remain unavailable, even when boost data exists.

Authoring files:
  import_workbook.py: workbook reader, cost reconciliation and source coverage.
  refresh_boosts.py: boost-only Google Sheets export import and snapshot overlay.
  data/boost-snapshot.json: recorded boost values and attempt limits through 500.
  data/workbook_mapping.py: reviewed boost columns, units, attempt limits and
    qualitative play-style advice.
  build_data.py: established building/icon metadata plus the workbook import.
  data/tracker-catalog.json: existing icon and mechanic definitions.
  data/guide-data.json and .js: generated runtime data, schema version 2.
  core.js: missing-data-safe upgrade and per-level funding calculations.
  charts.js: local SVG boost and cost comparisons, preserving all points and gaps.
  combat-ranking.js: combat scope, multiplier estimates, ranking and icon gesture.
  simple-view.js: hidden leaderboard controls and building breakdowns.

The historical transcription, guidance, source manifest and screenshots remain
as authoring references. Their numerical checkpoints do not enter the runtime
dataset. Screenshots are no longer included in the published dist directory.

Source interpretation:
  - Detail sheets take priority over overview ranges. Latest boost rows extend
    through 500 for Gold buildings and 200 for Copper-only. Blue Galaxy Copper
    boosts and collection limits are blank above 200 in the latest source. The
    user confirmed these stay at their level-200 values: 75% double-collection
    chance, 15 collections, and 300,032 medals. Derived data fills levels 201–500
    as confirmed capped values, without retention warnings; the raw snapshot
    keeps its blanks and each Copper row records confirmedCap provenance. Cost rows
    still end at 300 for Gold and 200 for Copper-only. These cost coverage limits
    are not game caps.
  - Gold effects are locked below 101, including zero placeholders in the source.
    Above a series' highest known level, its last known boost or attempt limit
    is retained for display and calculations, with a warning and originating
    level. Charts distinguish this with dashed lines. Internal gaps remain
    Not supplied. Costs and contributor rewards are never carried forward.
    Raw observations remain unchanged except explicit user confirmations:
    SHS's Copper fighting multiplier is confirmed as 4% through level 108.
    Levels 102–108 and their provenance are recorded in confirmedRanges. The
    latest source agrees and supplies the next increase, 5% at level 119.
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
    User-confirmed rule (2026-10-28): all 20 Gold-tier buildings other than
    Shattered Horizon Siphon have zero coin, supply and medal unlocking costs
    at levels 10–100. These costs start at level 101. The importer applies this
    override and records it in each building's costSource.confirmedUnlockRanges.
    The original workbook is unchanged. SHS, Copper-only buildings, costs at
    101 and above, goods, blueprints, FP and contributor rewards are unchanged.
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
    level against the source and recorded confirmations, then check individual
    costs, the level 100/101 boundary and upgrade ranges.
  - Multiplier step levels include the known starting/unlock value and increases
    confirmed by consecutive supplied levels. Missing spans are never bridged.
  - P1–P7 values are base FP rewards, not assumed donations or secure amounts.
    These use the same whole-FP calculation as GOE Prime & Post, replacing the
    workbook's obsolete rounding to multiples of 5. Tests compare all 11,900
    supported level records against Prime & Post. Personal boosts are not applied
    to the base-reward table. The cost comparison separately
    applies the user-specified 1.9x / 1.2x contribution assumptions above.
  - Himeji Castle's Gold scope is user-confirmed as the blue attack multiplier
    in GBG (pairing 75). Its corrected icon and wording are separate from Seed
    Vault's attack-and-defense multiplier (pairing 63).
    Qualitative ratings are not calculated efficiency/payback rankings.

GOE Prime & Post:
  Open /goe.html on the built preview, also linked from the explorer. This guild tool uses
  the prestige costs, with current reward calculations and GOE contribution rules.
  It lists all 49 GBs alphabetically and calculates one TARGET level at a time.
  Each tab stores its player name, GB and level together in sessionStorage
  (goe-gb-selection), including unfinished edits, so refreshing preserves that
  tab's setup. New tabs and later visits fall back to the last completed setup
  with a nonblank name and valid level in localStorage under the same key.
  GB changes, completed name/level edits, Enter and
  Copy update that shared default; opening or refreshing a tab never does.
  Existing tabs stay independent. Each storage entry is overwritten, not appended.
  Names saved by the original tool (goe-gb-player-name) are preserved during
  migration; that old key is removed after a complete setup is saved successfully.
  Unknown saved GBs or malformed records fall back safely; blocked storage does
  not prevent calculation or copying.
  Copper: five slots, 1.9x without guild goods or 2.0x with guild goods.
  Gold: seven slots, 1.1x without guild goods or 1.2x with guild goods.
  Gold-capable buildings switch at target 101. Copper-only buildings keep Copper
  rates through 200. Gold data extends through 300. Active clan_goods and
  clan_goods_extended bonuses identify guild-goods buildings from source data.
  Base FP rewards are derived from each level's cost, not the workbook's obsolete
  MROUND(..., 5) reward cells. Current reward pool shares by target level:
  1–9: 25%; 10–39: 30%; 40–69: 40%; 70–100: 25%; 101–200: 15%; 201–300: 10%.
  Exact rank weights are Copper [120,60,20,5,1] / 206 and
  Gold [5040,2520,840,210,42,7,1] / 8660, as in the source workbook formulas.
  First round each base reward to a whole FP, then apply the GOE rate and round
  again (halves up). An FP-paying slot contributes at least 2 FP, as confirmed
  by the user's CF 102 P6 example; a zero-FP reward requires 1 FP. Missing level
  costs remain unavailable. Official pool shares and removal of rounding to 5:
  https://support.innogames.com/kb/ForgeOfEmpires/en_DK/7011/Great-Buildings-Prestige-Contribution
  User-confirmed regression cases: CF target 102 at 1.1 (priming 7711), Observatory
  target 106 at 1.2 (priming 11061), SHS target 3 at 1.9 (priming 6535 - 29 = 6506).
  Priming = target level FP cost - all contributions - the owner's final flip.
  Reserve exactly the last position's rounded contribution for that flip:
  P5 for Copper, P7 for Gold (including the 1 FP minimum for zero rewards).
  This total does not subtract existing investments or test position security.
  Copy creates: <player> <full GB name> P7(amount) ... P1(amount), starting at
  P5 for Copper. Values have no thousands separators in the copied message.
  Invalid levels, missing source data and overfunded totals cannot be copied.
  Clipboard fallback selects the message for manual copying if access is denied.
  Six numbered steps guide members: enter name, select GB, enter TARGET level,
  prime, copy message, and post. Treasury GBs are marked beside the priming rate.
  The destination is selected automatically:
    Treasury (both tiers), Guild tab: ✨Treasury Bldg, 2.0 Copper /1.2 Gold
    Other Copper, Social tab: ⚔️GoE & Friends Copper Tier 190 🟠
    Other Gold, Social tab: ⚔️GoE & Friends Gold Tier 110 🟡
  A bold tab badge appears above the thread name in step 6.
  The Rates & calculation section warns that this simplified method primes all positions at
  once, increasing the chance of being sniped. Rates and the cost breakdown
  stay in a collapsed details section to keep the main workflow simple.
  GOE rules are isolated in goe-priming.js; general explorer charts are unchanged.
  The build emits data/goe-data.js as a fingerprinted asset containing only
  level costs and treasury metadata; the GOE page never loads the full explorer
  dataset. All levels are checked against the full source in build tests.
  The page uses local system fonts, native controls, and no external libraries.
  Light/dark mode follows the device by default. The theme toggle remembers
  an explicit choice in localStorage (goe-color-theme), applied before first
  paint. Theme switching also works when storage is blocked. The header and
  favicon reuse the guild management page's GOE.png emblem. The portal build
  reuses its shared navigation header; the theme toggle sits beside the title.
  The tool matches the portal's forest-and-gold palette, Inter/system body
  font stack, and Georgia headings while preserving its larger font sizes.
  The lower-right footer displays the package.json version, inserted at build time.
  Name input updates the message and small tab record immediately. Cost
  calculations only run on GB/level changes.

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
