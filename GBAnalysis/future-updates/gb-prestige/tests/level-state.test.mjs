import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const data = JSON.parse(read('data/guide-data.json'));
const context = vm.createContext({ window: {} });
vm.runInContext(read('level-state.js'), context);
const { create } = context.window.PrestigeLevelState;
const building = sheet => data.buildings.find(b => b.sourceSheet === sheet);
const arc = building('Arc'), galaxy = building('BG'), copper = building('ToB');
const key = b => `gb-prestige-levels-v1:${b.id}`;
function memory(entries = []) {
  const values = new Map(entries);
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value) };
}
const open = store => create(data.buildings, () => store);
const pair = (state, b) => ({ ...state.get(b) });

test('each GB restores its own current and target level without writes on load', () => {
  const store = memory(), first = open(store);
  for (const b of data.buildings) assert.deepEqual(pair(first, b), { from: 50, to: 150 });
  assert.equal(store.values.size, 0);
  first.set(arc, 'from', 203); first.set(arc, 'to', 207);
  first.set(galaxy, 'from', 200); first.set(galaxy, 'to', 500);
  const before = [...store.values];
  const next = open(store);
  assert.deepEqual(pair(next, arc), { from: 203, to: 207 });
  assert.deepEqual(pair(next, galaxy), { from: 200, to: 500 });
  assert.deepEqual(pair(next, copper), { from: 50, to: 150 });
  assert.deepEqual([...store.values], before);
});

test('tabs editing different GBs never overwrite one another’s stored pair', () => {
  const store = memory(), a = open(store), b = open(store);
  a.get(arc); a.get(galaxy); b.get(arc); b.get(galaxy);
  a.set(arc, 'from', 203); a.set(arc, 'to', 214);
  b.set(galaxy, 'from', 200); b.set(galaxy, 'to', 250);
  assert.deepEqual(pair(open(store), arc), { from: 203, to: 214 });
  assert.deepEqual(pair(open(store), galaxy), { from: 200, to: 250 });
  assert.equal(store.values.size, 2);
  // Existing views stay stable; refreshing reads the latest saved pair.
  assert.deepEqual(pair(b, arc), { from: 50, to: 150 });
  b.set(arc, 'to', 300);
  assert.deepEqual(pair(a, arc), { from: 203, to: 214 });
  assert.deepEqual(pair(open(store), arc), { from: 50, to: 300 });
});

test('corrupt records and invalid fields fall back without affecting other GBs', () => {
  for (const value of ['broken', 'null', '[]', '{}', '{"from":"203","to":999}', '{"from":-1,"to":1.5}']) {
    const store = memory([[key(arc), value], [key(galaxy), '{"from":200,"to":250}']]);
    assert.deepEqual(pair(open(store), arc), { from: 50, to: 150 });
    assert.deepEqual(pair(open(store), galaxy), { from: 200, to: 250 });
  }
  assert.deepEqual(pair(open(memory([[key(arc), '{"from":203,"to":null}']])), arc), { from: 203, to: 150 });
});

test('invalid drafts do not replace saved numbers; level boundaries remain building-specific', () => {
  const store = memory(), state = open(store);
  state.set(arc, 'from', 0); state.set(arc, 'to', 500);
  for (const value of [NaN, Infinity, null, '', '207', -1, 1.5, 501]) {
    assert.equal(state.set(arc, 'to', value), false);
  }
  assert.equal(state.set(arc, 'from', 500), false);
  assert.equal(state.set(copper, 'to', 201), false);
  assert.equal(state.set(copper, 'to', 200), true);
  assert.equal(state.set(copper, 'from', 199), true);
  assert.deepEqual(pair(open(store), arc), { from: 0, to: 500 });
  assert.deepEqual(pair(open(store), copper), { from: 199, to: 200 });
});

test('repeated edits keep at most one small record for each known GB', () => {
  const store = memory(), state = open(store);
  for (const b of data.buildings) {
    for (let level = 1; level <= b.levels.length; level++) state.set(b, 'to', level);
  }
  assert.equal(store.values.size, data.buildings.length);
  assert.ok([...store.values.values()].every(value => value.length < 32));
  assert.equal(state.set({ id: 'unknown', levels: [1] }, 'to', 1), false);
  assert.equal(store.values.size, data.buildings.length);
});

test('blocked storage and failed writes preserve working in-memory calculations', () => {
  const providers = [() => { throw new Error('Blocked'); }, () => ({
    getItem: () => '{"from":203,"to":207}',
    setItem: () => { throw new Error('Quota exceeded'); },
  })];
  for (const provider of providers) {
    const state = create(data.buildings, provider);
    state.set(arc, 'from', 203); state.set(arc, 'to', 214);
    assert.deepEqual(pair(state, arc), { from: 203, to: 214 });
  }
});
