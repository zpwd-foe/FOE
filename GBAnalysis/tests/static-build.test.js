import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const DIST = new URL("../dist/", import.meta.url);

function contentHash(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

test("static build fingerprints every cacheable resource and rewrites dependencies", async () => {
  const [index, manifestSource, assetNames] = await Promise.all([
    readFile(new URL("index.html", DIST), "utf8"),
    readFile(new URL("asset-manifest.json", DIST), "utf8"),
    readdir(new URL("assets/", DIST)),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal(manifest.algorithm, "sha256");
  assert.equal(manifest.hashLength, 12);
  assert.equal(manifest.version, "1.1.0");
  assert.match(index, /<title>FoE GB Planner<\/title>/);
  assert.match(index, /<span>FoE GB Planner<\/span>/);
  assert.match(index, /<footer>\s*<span>Another zpwd dashboard\.<\/span>\s*<\/footer>/);
  assert.doesNotMatch(index, /This is getting out of hand\./);
  assert.equal(Object.keys(manifest.assets).length, 7);
  assert.equal(assetNames.length, 7);
  assert.match(index, /rel="icon" type="image\/png" sizes="32x32" href="assets\/favicon\.[0-9a-f]{12}\.png"/);
  assert.match(index, /class="brand-mark" src="assets\/gb-icon\.[0-9a-f]{12}\.png"/);
  assert.doesNotMatch(index, /image1\.png/);
  assert.doesNotMatch(index, /(?:href|src)="(?:assets\/styles\.css|src\/app\.js)"/);
  assert.match(index, /href="assets\/styles\.[0-9a-f]{12}\.css"/);
  assert.match(index, /src="assets\/app\.[0-9a-f]{12}\.js"/);
  assert.match(index, /id="rage-target-level"[^>]+value="101"/);
  assert.match(index, /id="level-input"[^>]+max="301"/);
  assert.match(index, /id="rage-target-level"[^>]+max="301"/);
  assert.match(index, /Dashboard v1\.1\.0/);
  assert.doesNotMatch(index, /FoE Helper 4\.8\.1\.0 · exact FP \+ medal data/);
  assert.match(index, /id="rage-arc-p1"[^>]+max="180"[^>]+value="180"/);
  assert.match(index, /id="rage-arc-p5"[^>]+max="180"[^>]+value="80"/);
  assert.match(index, /id="rage-unlock-toggle"[^>]+role="switch"[^>]+aria-checked="true"/);
  assert.match(index, /id="rage-unlock-toggle-label">Unlock costs</);
  assert.doesNotMatch(index, /(?:metric-grid|metric-level|metric-cumulative|metric-coverage)/);
  assert.doesNotMatch(index, /class="method-note"/);
  assert.match(index, /id="building-benefit"/);
  assert.match(index, /data-reward-view="base"[^>]+aria-pressed="true"/);
  assert.match(index, /data-reward-view="boosted"[^>]+aria-pressed="false"/);
  assert.match(index, /id="owner-cost"/);
  assert.doesNotMatch(index, /chart-reward-max/);
  assert.match(index, /href="#unlock-costs">Unlock costs</);
  assert.match(index, /href="#contributor-rewards">FP &amp; rewards</);
  assert.match(index, /href="#curve-preview">Preview chart</);
  assert.match(index, /<h3>Preview chart<\/h3>/);
  assert.match(index, /href="#pre-rage-analysis">Rage planner</);
  assert.doesNotMatch(index, /owner-priming-cost/);
  assert.match(index, /id="selected-total-fp-cost"/);
  assert.match(index, /id="selected-level-benefits"/);
  assert.match(index, /id="rage-benefit-toggle"[^>]+role="switch"[^>]+aria-checked="true"/);
  assert.match(index, /id="rage-benefit-toggle-label">Benefits</);
  assert.doesNotMatch(index, /rage-toggle-chevron/);
  assert.ok(
    index.indexOf('id="curve-preview"') < index.indexOf('id="foundation-goods"'),
    "The preview chart precedes the foundation cost",
  );
  assert.ok(
    index.indexOf('id="foundation-goods"') < index.indexOf('id="unlock-costs"'),
    "The foundation cost precedes level unlock costs",
  );
  assert.ok(
    index.indexOf('id="unlock-costs"') < index.indexOf('id="contributor-rewards"'),
    "Unlocking the selected level precedes Forge Point contributions",
  );
  assert.ok(
    index.indexOf('id="contributor-rewards"') < index.indexOf('id="pre-rage-analysis"'),
    "The multi-level planner follows selected-level contributions",
  );

  for (const outputPath of Object.values(manifest.assets)) {
    const expectedHash = outputPath.match(/\.([0-9a-f]{12})\.[^.]+$/)?.[1];
    assert.ok(expectedHash, `${outputPath} includes a content fingerprint`);
    const contents = await readFile(new URL(outputPath, DIST));
    assert.equal(contentHash(contents), expectedHash, `${outputPath} fingerprint matches its bytes`);
  }

  const [app, styles] = await Promise.all([
    readFile(new URL(manifest.assets["src/app.js"], DIST), "utf8"),
    readFile(new URL(manifest.assets["assets/styles.css"], DIST), "utf8"),
  ]);
  assert.match(app, /from "\.\/core\.[0-9a-f]{12}\.js"/);
  assert.match(app, /fetch\("assets\/gb-analysis\.[0-9a-f]{12}\.json"\)/);
  assert.match(app, /fetch\("assets\/gb-benefits-source\.[0-9a-f]{12}\.json"\)/);
  assert.doesNotMatch(
    app,
    /(?:\.\/core\.js|data\/gb-analysis\.json|data\/gb-benefits-source\.json)/,
  );
  assert.doesNotMatch(app, /Estimated from known reward patterns\./);
  assert.doesNotMatch(app, /Medal reward confirmed\./);
  assert.match(styles, /--range-progress/);
  assert.match(styles, /var\(--heading-gradient\).*var\(--range-progress\)/s);
});
