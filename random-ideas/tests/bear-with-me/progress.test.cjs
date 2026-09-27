const test = require("node:test");
const assert = require("node:assert/strict");
const progress = require("../../projects/bear-with-me/progress.js");

test("story discovers all remaining scenes, resumes gaps, and loops after retirement", () => {
  const state = progress.fresh();
  for (let i = 0; i < progress.count; i++) {
    assert.equal(progress.choose(state), i);
    state.counts[i]++; state.last = i;
  }
  assert.equal(progress.choose(state), 0);
  state.counts[17] = 0;
  assert.equal(progress.choose(state), 17);
});

test("shuffle prioritizes unseen scenes without immediately repeating", () => {
  const state = progress.fresh(); state.mode = "shuffle";
  const visited = new Set();
  for (let i = 0; i < progress.count; i++) {
    const next = progress.choose(state, () => .42);
    assert.notEqual(next, state.last);
    assert.equal(state.counts[next], 0);
    visited.add(next); state.counts[next]++; state.last = next;
  }
  assert.equal(visited.size, progress.count);
  const next = progress.choose(state, () => 0);
  assert.notEqual(next, state.last);
  state.counts[next] = 10;
  assert.notEqual(progress.choose(state, () => 0), next);
});

test("malformed stored progress cannot skip scenes or enable a fake retirement", () => {
  for (const input of [null, false, [], "oops", { version: 4 }]) assert.deepEqual(progress.read(input), progress.fresh());
  const cleaned = progress.read({ version: 1, counts: [-2, Infinity, "2", 3, 1e12], last: 999, mode: "bad", sound: "yes", retired: true });
  assert.equal(cleaned.counts.length, 48);
  assert.deepEqual(cleaned.counts.slice(0, 5), [0, 0, 0, 1000000, 0]);
  assert.equal(cleaned.last, -1);
  assert.equal(cleaned.mode, "story");
  assert.equal(cleaned.sound, false);
  assert.equal(cleaned.retired, false);
});

test("completed progress, preferences, and retirement survive serialization", () => {
  const state = progress.fresh();
  const retirement = state.sceneIds.indexOf(50);
  state.counts[retirement] = 1; state.last = retirement; state.retired = true;
  state.mode = "shuffle"; state.sound = true; state.motion = true;
  assert.deepEqual(progress.read(JSON.parse(JSON.stringify(state))), state);
});

test("legacy discoveries and retirement survive removal without shifting onto other scenes", () => {
  const old = { version: 1, counts: Array.from({ length: 50 }, (_, i) => i + 1), last: 49, retired: true, mode: 'shuffle', sound: true, motion: true };
  const migrated = progress.read(old);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.counts.length, 48);
  assert.ok(!migrated.sceneIds.includes(4) && !migrated.sceneIds.includes(19));
  assert.deepEqual(migrated.counts, migrated.sceneIds);
  assert.equal(migrated.sceneIds[migrated.last], 50);
  assert.equal(migrated.retired, true);
  assert.equal(migrated.mode, 'shuffle');
  assert.equal(migrated.sound, true);
  assert.equal(migrated.motion, true);
});

test("story resumes after a removed last scene and ignores discoveries of removed scenes", () => {
  for (const removed of [4, 19]) {
    const state = progress.read({ version: 1, counts: Array(50).fill(1), last: removed - 1 });
    assert.equal(state.sceneIds[progress.choose(state)], removed + 1);
  }
  const counts = Array(50).fill(0); counts[3] = 12; counts[18] = 7;
  const state = progress.read({ version: 1, counts, last: 18 });
  assert.equal(state.counts.filter(Boolean).length, 0);
  assert.equal(progress.choose(state), 0);
});

test("version 2 matches saved counts by scene ID rather than array position", () => {
  const state = progress.fresh();
  state.sceneIds.reverse();
  state.counts = state.sceneIds.map(id => id * 2);
  state.last = 0; state.retired = true;
  const loaded = progress.read(state);
  assert.deepEqual(loaded.counts, loaded.sceneIds.map(id => id * 2));
  assert.equal(loaded.sceneIds[loaded.last], 50);
  assert.equal(loaded.retired, true);
});
