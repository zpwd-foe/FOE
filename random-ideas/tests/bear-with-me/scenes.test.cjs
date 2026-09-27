const test = require("node:test");
const assert = require("node:assert/strict");
const scenes = require("../../projects/bear-with-me/scenes.js");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../projects/bear-with-me/props.js"), "utf8"), sandbox);
const artwork = sandbox.window.BearArtwork;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../projects/bear-with-me/renderer.js"), "utf8"), sandbox);

function rehearsal(accepted) {
  const log = [], props = new Set();
  let on = true, opened = false, clicks = 0;
  const record = (name, ...args) => log.push([name, ...args]);
  const c = {
    toggle: sandbox.window.BearRenderer.hardwareGeometry().tip,
    async open(...args) { opened = true; record("open", ...args); },
    async move(values, ms) { for (const value of Object.values(values)) assert.ok(Number.isFinite(value)); record("move", values, ms); },
    async atSwitch(values, ms) { return c.move(values, ms); },
    async wait(ms) { assert.ok(ms >= 0); record("wait", ms); },
    async beat(ms = 250) { assert.ok(ms >= 0); record("beat", ms); },
    async off(options) { assert.ok(opened, "bear must emerge before reaching"); on = false; clicks++; record("off", options); },
    on() { on = true; record("on"); },
    sound(kind, volume) { record("sound", kind, volume); },
    anchor(id, anchor) { assert.ok(props.has(id)); record("anchor", id, anchor); },
    async turn(id, type) { assert.ok(props.has(id)); assert.ok(artwork.art[type]); record("turn", id, type); },
    async drop(id, values, ms) { assert.ok(props.has(id)); record("drop", id, values, ms); },
    async place(id, x, y, ms) { assert.ok(props.has(id)); record("place", id, x, y, ms); },
    async stow(id, hand) { assert.ok(props.has(id)); props.delete(id); record("stow", id, hand); },
    wear(type) { if (type) assert.ok(artwork.headwear[type], `missing headwear ${type}`); record("wear", type); },
    outfit(type) { if (type) assert.ok(artwork.outfits[type], `missing costume ${type}`); record("outfit", type); }, face(type) { record("face", type); },
    prop(id, type, options) { assert.ok(artwork.art[type], `missing prop ${type}`); props.add(id); record("prop", id, type, options); },
    async pmove(id, values, ms) { assert.ok(props.has(id), `moving nonexistent prop ${id}`); record("pmove", id, values, ms); },
    remove(id) { assert.ok(props.has(id), `removing nonexistent prop ${id}`); props.delete(id); record("remove", id); },
    async repeat(times, fn) { for (let i = 0; i < times; i++) await fn(i); },
    async offer(type) { record("offer", type, accepted); return accepted; }
  };
  return { c, log, state: () => ({ on, clicks, props: [...props] }) };
}

test("the 48 remaining performances exclude anger and caution and finish with the switch off", async () => {
  assert.equal(scenes.length, 48);
  assert.deepEqual(scenes.map(s => s.id), Array.from({ length: 50 }, (_, i) => i + 1).filter(id => ![4, 19].includes(id)));
  assert.ok(!scenes.some(s => ['Anger', 'Caution'].includes(s.emotion)));
  assert.equal(new Set(scenes.map(s => s.emotion)).size, scenes.length);
  const signatures = new Set();
  for (const scene of scenes) {
    const run = rehearsal(false);
    await scene.play(run.c);
    assert.equal(run.state().on, false, `${scene.emotion} left the switch on`);
    assert.ok(run.state().clicks > 0);
    signatures.add(JSON.stringify(run.log));
  }
  assert.equal(signatures.size, scenes.length);
});

test("optional handshake and cookie interactions both complete", async () => {
  for (const id of [21, 41]) {
    const scene = scenes.find(s => s.id === id);
    const declined = rehearsal(false), accepted = rehearsal(true);
    await scene.play(declined.c); await scene.play(accepted.c);
    assert.notDeepEqual(accepted.log, declined.log);
    assert.equal(accepted.state().on, false);
    assert.equal(declined.state().on, false);
  }
});

test("accepting a cookie removes it before the paw moves; an unanswered offer keeps it", async () => {
  const accepted = rehearsal(true), declined = rehearsal(false);
  const scene = scenes.find(s => s.id === 21);
  await scene.play(accepted.c); await scene.play(declined.c);
  const offer = accepted.log.findIndex(row => row[0] === 'offer');
  assert.deepEqual(accepted.log[offer + 1], ['remove', 'offer']);
  assert.ok(!accepted.state().props.includes('offer'));
  assert.ok(declined.state().props.includes('offer'));
  assert.equal(accepted.c.caption, 'One cookie poorer. Still switching it off.');
  assert.equal(declined.c.caption, undefined);
});

test("mischief switches itself on again, then actually switches back off", async () => {
  const run = rehearsal(false); await scenes.find(s => s.id === 49).play(run.c);
  assert.equal(run.state().clicks, 2);
  assert.deepEqual(run.log.filter(row => ["on", "off"].includes(row[0])).map(row => row[0]), ["off", "on", "off"]);
});

test("the theatre curtain remains supported by a paw until it is stowed", async () => {
  const run = rehearsal(false); await scenes.find(s => s.id === 29).play(run.c);
  let anchor;
  for (const [action, id, type, options] of run.log) {
    if (id !== 'curtain') continue;
    if (action === 'prop') anchor = options.anchor;
    if (action === 'anchor') anchor = type;
    assert.notEqual(action, 'place', 'a freestanding cloth curtain has no support');
    if (action !== 'stow') assert.equal(anchor, 'left');
  }
});

test("the raised periscope shaft extends into the box instead of floating above it", async () => {
  const run = rehearsal(false); await scenes.find(s => s.id === 34).play(run.c);
  const rim = sandbox.window.BearRenderer.stageLayout().rimY;
  const svg = artwork.art.periscope.match(/^<svg[^>]+>/)[0];
  const top = Number(svg.match(/ y="([^"]+)"/)[1]);
  const bottom = top + Number(svg.match(/ height="([^"]+)"/)[1]);
  const state = {}; let inspections = 0;
  for (const [action, id, value, options] of run.log) {
    if (id !== 'scope') continue;
    if (action === 'prop') Object.assign(state, { r: 0 }, options);
    if (action === 'pmove') Object.assign(state, value);
    if (action !== 'pmove' || state.y > rim) continue;
    const verticalScale = state.s * Math.cos(state.r * Math.PI / 180);
    assert.ok(state.y + bottom * verticalScale >= rim, 'the shaft must reach below the rim');
    assert.ok(state.y + top * verticalScale < rim - 30, 'the lens must remain visible');
    inspections++;
  }
  assert.equal(inspections, 2);
});
