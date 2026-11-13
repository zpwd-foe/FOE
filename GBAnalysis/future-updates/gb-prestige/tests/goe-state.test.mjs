import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const data = JSON.parse(read('data/guide-data.json'));
const markup = read('goe.html');
const calculationScript = read('goe-priming.js'), pageScript = read('goe.js');
const selectionKey = 'goe-gb-selection';
const nameKey = 'goe-gb-player-name';
const id = name => data.buildings.find(building => building.name === name).id;
const pair = (name, level, playerName = 'Player') => ({ playerName, buildingId: id(name), level: String(level) });
const storage = (entries = []) => {
  const values = new Map(entries);
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const selected = store => JSON.parse(store.getItem(selectionKey));

// Run the real controller and calculation code with separate per-tab DOM/storage.
// Browser checks additionally cover native input events and actual tab lifetimes.
function openTab(localStorage, sessionStorage = storage()) {
  const nodes = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(([, name]) => {
    const events = new Map();
    return [`#${name}`, {
      value: name === 'target-level' ? '101' : '', textContent: '', hidden: false,
      get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
      addEventListener: (type, callback) => events.set(type, callback),
      setAttribute() {}, toggleAttribute() {}, replaceChildren() {},
      dispatch: type => events.get(type)?.({ preventDefault() {} }),
    }];
  }));
  const copied = [];
  const context = vm.createContext({
    GB_PRESTIGE_DATA: data, localStorage, sessionStorage,
    document: { querySelector: selector => {
      assert.ok(nodes.has(selector), `Unknown control: ${selector}`);
      return nodes.get(selector);
    } },
    navigator: { clipboard: { writeText: async text => { copied.push(text); } } },
    Option: function(text, value) { this.text = text; this.value = value; },
    Intl, setTimeout, clearTimeout, addEventListener() {},
  });
  context.window = context;
  vm.runInContext(calculationScript, context);
  vm.runInContext(pageScript, context);
  const node = name => nodes.get(`#${name}`);
  return {
    sessionStorage, copied, node,
    current: () => ({ playerName: node('player-name').value, buildingId: node('building').value, level: node('target-level').value }),
    name(value, completed = false) { node('player-name').value = value; node('player-name').dispatch('input'); if (completed) node('player-name').dispatch('change'); },
    building(name) { node('building').value = id(name); node('building').dispatch('change'); },
    type(value) { node('target-level').value = String(value); node('target-level').dispatch('input'); },
    finish() { node('target-level').dispatch('change'); },
    reload() { return openTab(localStorage, sessionStorage); },
  };
}

test('refresh restores each tab’s name, GB and level; new visits use the latest complete setup', () => {
  const shared = storage([[nameKey, 'Player']]);
  let a = openTab(shared), untouched = openTab(shared);
  a.building('Château Frontenac'); a.type(102); a.finish();
  assert.deepEqual(untouched.reload().current(), pair('The Arc', 101));
  const b = openTab(shared);
  assert.deepEqual(b.current(), pair('Château Frontenac', 102));
  b.name('Second Player', true);
  b.building('Observatory'); b.type(106); b.finish();
  a = a.reload();
  assert.deepEqual(a.current(), pair('Château Frontenac', 102));
  assert.deepEqual(b.reload().current(), pair('Observatory', 106, 'Second Player'));
  assert.deepEqual(selected(shared), pair('Observatory', 106, 'Second Player'), 'refresh must not replace the shared default');
  assert.deepEqual(openTab(shared).current(), pair('Observatory', 106, 'Second Player'));
  assert.equal(a.node('player-name').value, 'Player');
  assert.match(a.node('promotion-message').textContent, /^Player Château Frontenac /);
  assert.match(b.node('promotion-message').textContent, /^Second Player Observatory /);
  assert.equal(a.node('priming-cost').textContent, '7,711');
});

test('unfinished and invalid levels survive refresh only in their own tab', () => {
  const shared = storage([[selectionKey, JSON.stringify(pair('Observatory', 106))]]);
  let a = openTab(shared);
  for (const draft of ['1', '10', '', '301', '1.5']) {
    a.type(draft);
    a = a.reload();
    assert.deepEqual(a.current(), pair('Observatory', draft));
    assert.deepEqual(openTab(shared).current(), pair('Observatory', 106));
  }
  a.finish();
  assert.deepEqual(selected(shared), pair('Observatory', 106));
  a.type(107); a.finish();
  assert.deepEqual(openTab(shared).current(), pair('Observatory', 107));
  a.type(250); a.building('A.I. Core');
  assert.deepEqual(a.reload().current(), pair('A.I. Core', 250));
  assert.deepEqual(selected(shared), pair('Observatory', 107), 'invalid building/level pairs are not shared');
});

test('a duplicated tab starts from its copy and then becomes independent', () => {
  const shared = storage([[selectionKey, JSON.stringify(pair('Château Frontenac', 102))]]);
  const original = openTab(shared);
  const duplicate = openTab(shared, storage(original.sessionStorage.values));
  duplicate.name('Duplicate Player', true);
  duplicate.building('Observatory'); duplicate.type(106); duplicate.finish();
  assert.deepEqual(original.reload().current(), pair('Château Frontenac', 102));
  assert.deepEqual(duplicate.reload().current(), pair('Observatory', 106, 'Duplicate Player'));
});

test('unfinished or blank names remain local to their tab, including after refresh', () => {
  const shared = storage([[selectionKey, JSON.stringify(pair('Observatory', 106))]]);
  let a = openTab(shared);
  for (const draft of ['Al', '', '   ']) {
    a.name(draft);
    a = a.reload();
    assert.deepEqual(a.current(), pair('Observatory', 106, draft));
    assert.deepEqual(openTab(shared).current(), pair('Observatory', 106));
  }
  a.node('player-name').dispatch('change');
  assert.deepEqual(selected(shared), pair('Observatory', 106));
  a.name('Alice', true);
  assert.deepEqual(openTab(shared).current(), pair('Observatory', 106, 'Alice'));
  a.type(301); a.name('Bob', true);
  assert.deepEqual(a.reload().current(), pair('Observatory', 301, 'Bob'));
  assert.deepEqual(selected(shared), pair('Observatory', 106, 'Alice'), 'the full setup must be valid before sharing');
});

test('legacy names and GB/level pairs migrate without changing the shared default on refresh', () => {
  const legacyPair = JSON.stringify({ buildingId: id('Château Frontenac'), level: '102' });
  const shared = storage([[nameKey, 'Original Player'], [selectionKey, legacyPair]]);
  const oldTab = storage([[selectionKey, legacyPair]]);
  const a = openTab(shared, oldTab);
  assert.deepEqual(a.current(), pair('Château Frontenac', 102, 'Original Player'));
  assert.equal(shared.getItem(selectionKey), legacyPair, 'restoring must not publish a default');
  a.name('New Player', true);
  assert.equal(shared.getItem(nameKey), null, 'the legacy key is removed only after saving a complete setup');
  assert.deepEqual(openTab(shared).current(), pair('Château Frontenac', 102, 'New Player'));
  assert.deepEqual(openTab(shared, storage([[selectionKey, legacyPair]])).current(), pair('Château Frontenac', 102, 'New Player'));
});

test('Enter and Copy complete a selection; storage size stays fixed', async () => {
  const shared = storage([[nameKey, 'Player']]);
  const a = openTab(shared);
  a.building('Observatory'); a.type(106);
  a.node('priming-form').dispatch('submit');
  assert.deepEqual(selected(shared), pair('Observatory', 106));
  a.type(107);
  await a.node('copy-message').dispatch('click');
  assert.deepEqual(selected(shared), pair('Observatory', 107));
  assert.match(a.copied[0], /^Player Observatory P7\(/);
  for (let level = 108; level <= 200; level++) { a.name(`Player ${level}`, true); a.type(level); a.finish(); }
  assert.equal(shared.values.size, 1, 'one complete setup replaces the legacy name and previous setup');
  assert.equal(a.sessionStorage.values.size, 1);
});

test('corrupt or obsolete records fall back without breaking the page', () => {
  const valid = JSON.stringify(pair('Observatory', 106));
  for (const bad of ['{broken', 'null', JSON.stringify({ buildingId: 'deleted', level: '102' }),
    JSON.stringify({ buildingId: id('The Arc'), level: {} }),
    JSON.stringify(pair('The Arc', '0x10')), JSON.stringify(pair('The Arc', 101, {})),
    JSON.stringify(pair('The Arc', 101, 'x'.repeat(101)))]) {
    const shared = storage([[selectionKey, valid]]);
    assert.deepEqual(openTab(shared, storage([[selectionKey, bad]])).current(), pair('Observatory', 106));
    assert.deepEqual(openTab(storage([[selectionKey, bad]])).current(), pair('The Arc', 101, ''));
  }
  assert.deepEqual(openTab(storage([[selectionKey, JSON.stringify(pair('The Arc', 301))]])).current(), pair('The Arc', 101, ''));
});

test('blocked storage does not stop calculating or copying', async () => {
  const blocked = new Proxy({}, { get() { throw new Error('Storage unavailable'); } });
  const a = openTab(blocked, blocked);
  a.node('player-name').value = 'Player';
  a.building('Château Frontenac'); a.type(102); a.finish();
  assert.equal(a.node('priming-cost').textContent, '7,711');
  await a.node('copy-message').dispatch('click');
  assert.equal(a.copied[0], 'Player Château Frontenac P7(1) P6(2) P5(8) P4(37) P3(147) P2(443) P1(887)');
});
