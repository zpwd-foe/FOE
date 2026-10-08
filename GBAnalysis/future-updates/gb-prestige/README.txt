GB Prestige Update - Boost Preview · October 8, 2026

Quick source preview from the GBAnalysis directory:
  python3 -m http.server 8013 --bind 127.0.0.1 --directory future-updates/gb-prestige
  Open http://127.0.0.1:8013/

The standalone guide includes all 49 source screenshots, 121 boost rows,
shown level values, tier explanations, review levels (Gold 201 / Copper-only 101), goal filters,
level-to-level gains, and comparison of up to three buildings.
All images and runtime data are local. The source preview needs no build.
The tier guide starts open above 750px and collapsed on mobile. A direct
#tiers link opens the guide at any screen size; visitors can toggle it.

Deployment preparation (same prebuilt dist approach as the GB Planner):
  cd future-updates/gb-prestige
  npm run build
  npm test
  npm run serve
  Open http://127.0.0.1:8014/ for the packaged preview.

Node 20+ builds the site using built-in modules; no npm installation, network,
or Python data rebuild is needed for deployment. Python 3 serves the local
preview and runs the source-data checks. Commit source and regenerated dist/
together, as in GBAnalysis. The hosting build packages the checked-in data.

Cloudflare Pages settings, using the existing GitHub connection:
  Repository: zpwd-foe/FOE
  Production branch: main
  Suggested project name: foe-gb-prestige
  Root directory: GBAnalysis/future-updates/gb-prestige
  Framework preset: None
  Build command: leave blank (deploy the prepared dist/)
  Build output directory: dist

Optional: set the build command to npm run build to regenerate dist/ on Pages.
Project creation and custom-domain assignment are separate hosting steps;
this preparation does not create or publish a Cloudflare project.

Only dist/ is published. It includes the page, custom 404 page, cache rules,
asset manifest, styles, scripts, icons and 49 source screenshots. Authoring
scripts, tests, the raw tracker catalog and source manifests stay outside it.
The build uses the Planner's SHA-256 filenames (12 hex characters). Images
are fingerprinted first, then their URLs are written into the runtime data.
HTML revalidates on reload; assets can be cached for a year. Changing an icon
or screenshot also changes the dependent data URL, preventing stale images.
The tests check published files, image integrity, data completeness, cache
policies, reproducible output and this cache-invalidation chain.

Cloudflare reference:
  https://developers.cloudflare.com/pages/configuration/build-configuration/
  https://developers.cloudflare.com/pages/configuration/headers/
  https://developers.cloudflare.com/pages/configuration/serving-pages/

Sources and editing:
  data/transcription.py: reviewed screenshot values and icon pairing IDs.
  data/guidance.py: editorial suggestions based on benefits and play style.
  data/tracker-catalog.json: frozen October 7 tracker icon/text cross-reference.
  data/source-manifest.json: original image URLs and hashes.
  screenshots/: all 49 original screenshots.

Rebuild after editing the source data:
  python3 -B future-updates/gb-prestige/build_data.py

Validate the data:
  python3 -B future-updates/gb-prestige/test_data.py

The October 8 redesign has 21 Gold buildings and 28 Copper-only buildings.
Gold starts at 101; Copper growth ends at 200. Gold screenshot checkpoints
are 1, 101, 201, 301, 401 and 500. These values must not be relabeled as
observations of intermediate levels. Gold can continue beyond 500.

Himeji Castle's GBG icon conflicts with the official boost description;
the guide flags the scope as uncertain. Old tracker building/tier assignments
are not reused. Cost or payback rankings are not inferred from these images.

This directory is separate from the existing live GB planner and its data.

Styling matches the FoE GB Planner. assets/planner-theme.css contains its
light/dark palette; favicon.png and gb-icon.png are exact copies of the
Planner assets. The theme toggle uses the same gb-analysis-theme preference.
