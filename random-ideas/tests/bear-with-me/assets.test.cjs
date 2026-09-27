const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../../projects/bear-with-me");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "props.js"), "utf8"), sandbox);

test("every prop and costume references a shipped transparent atlas with valid source bounds", () => {
  const artwork = sandbox.window.BearArtwork;
  const sources = new Set();
  for (const markup of [...Object.values(artwork.art), ...Object.values(artwork.headwear), ...Object.values(artwork.outfits)]) {
    for (const [, file] of markup.matchAll(/href="(assets\/[^"#]+)"/g)) sources.add(file);
  }
  assert.equal(sources.size, 6);
  const sizes = new Map();
  for (const file of sources) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png[25], 6, `${file} must preserve RGBA transparency`);
    sizes.set(path.basename(file), [png.readUInt32BE(16), png.readUInt32BE(20)]);
  }
  const crops = JSON.parse(fs.readFileSync(path.join(root, "assets/props-crops.json"), "utf8"));
  for (const [name, { file, crop: [x, y, width, height] }] of Object.entries(crops)) {
    const size = sizes.get(file);
    assert.ok(size, `missing atlas for ${name}`);
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= size[0] && y + height <= size[1], `invalid crop for ${name}`);
  }
});
