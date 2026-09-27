const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../projects/bear-with-me/renderer.js"), "utf8"), sandbox);

function puppet(overrides = {}) {
  const renderer = Object.create(sandbox.window.BearRenderer.prototype);
  const frames = [];
  renderer.state = { rise: 0, x: 0, lx: 366, ly: 313, rx: 409, ry: 325, lr: 0, rr: 30, leftInside: 0, rightInside: 0, ...overrides };
  renderer.render = () => frames.push({ ...renderer.state });
  renderer.tween = async (target, values) => { Object.assign(target, values); renderer.render(); };
  return { renderer, frames };
}

test("both paws clear the rim before going behind the box, including a leaning bear", async () => {
  const { renderer, frames } = puppet({ x: 32, rise: 24 });
  await renderer.retractHands();
  const tucked = frames.find(frame => frame.leftInside && frame.rightInside);
  assert.ok(tucked);
  for (const prefix of ["l", "r"]) {
    assert.ok(tucked[`${prefix}y`] + tucked.rise + 31 < 333, "entire plush paw must clear the rim before the layer changes");
    assert.ok(tucked[`${prefix}x`] + tucked.x > 248 && tucked[`${prefix}x`] + tucked.x < 610);
  }
  assert.equal(tucked.rise, 24, "body must not descend before the paws retract");
});

test("final and temporary retreats descend with both hands behind the wooden front", async () => {
  for (const rise of [60, 130, 180, 225, 260]) {
    const { renderer, frames } = puppet();
    await renderer.move({ rise, lid: .35 });
    for (const frame of frames.filter(frame => frame.rise > 0)) {
      assert.equal(frame.leftInside, 1);
      assert.equal(frame.rightInside, 1);
    }
    assert.equal(renderer.state.rise, rise);
  }
});

test("a low-peeking bear puts a returning paw behind the box before lowering it", async () => {
  const { renderer, frames } = puppet({ rise: 90, rx: 409, ry: 235 });
  await renderer.move({ rx: 451, ry: 314 });
  assert.ok(frames.some(frame => frame.rightInside === 0 && frame.ry + frame.rise === 286));
  for (const frame of frames.filter(frame => frame.ry + frame.rise > 353)) assert.equal(frame.rightInside, 1);
});

test("an explicit inward move clears the rim before changing the paw's layer", async () => {
  const { renderer, frames } = puppet({ ry: 338 });
  await renderer.move({ ry: 366, rightInside: 1 });
  assert.equal(frames[0].rightInside, 0);
  assert.equal(frames[0].ry, 286);
  assert.equal(frames.at(-1).rightInside, 1);
  assert.equal(frames.at(-1).ry, 366);
});

test("explicit forward placement can carry a prop onto the front of the box", async () => {
  const { renderer, frames } = puppet();
  await renderer.move({ ly: 377, leftInside: 0 });
  assert.equal(frames.at(-1).leftInside, 0);
  assert.equal(frames.at(-1).ly, 377);
});

test("a hidden bear's paw emerges through the opening before reaching over the ledge", async () => {
  const { renderer, frames } = puppet({ rise: 130, leftInside: 1, rightInside: 1 });
  await renderer.move({ rx: 409, ry: 195 });
  const inside = frames.find(frame => frame.rightInside === 1);
  assert.ok(inside.ry + inside.rise + 31 < 333);
  const last = frames.at(-1);
  assert.equal(last.rightInside, 0);
  assert.equal(last.leftInside, 1);
  assert.equal(last.rx + last.x, 409);
  assert.equal(last.ry + last.rise, 325);
});
