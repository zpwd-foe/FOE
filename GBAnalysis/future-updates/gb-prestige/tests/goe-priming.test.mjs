import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const data = JSON.parse(readFileSync(new URL('../data/guide-data.json', import.meta.url), 'utf8'));
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../goe-priming.js', import.meta.url), 'utf8'), context);
const { calculate, baseRewards, promotion, producesGuildGoods, postingThread } = context.window.GOEPriming;
const building = name => data.buildings.find(item => item.name === name);
const at = (name, level) => calculate(building(name), level, data.boosts);

test('all four GOE rates use the target tier and correct position count', () => {
  for (const [name, level, rate, tier, positions] of [
    ['Statue of Zeus', 100, 1.9, 'Copper', 5],
    ['The Arc', 100, 2, 'Copper', 5],
    ['Statue of Zeus', 101, 1.1, 'Gold', 7],
    ['The Arc', 101, 1.2, 'Gold', 7],
    ['Atomium', 150, 2, 'Copper', 5],
    ['Cape Canaveral', 200, 1.9, 'Copper', 5],
  ]) {
    const result = at(name, level);
    assert.equal(result.status, 'ready');
    assert.equal(result.rate, rate, `${name} ${level}`);
    assert.equal(result.tier, tier);
    assert.equal(result.positions, positions);
    assert.equal(result.contributions.length, positions);
  }
});

test('guild goods are identified by bonus metadata, including adjacent eras', () => {
  const guildBuildings = data.buildings.filter(item => producesGuildGoods(item, 150, data.boosts)).map(item => item.name).sort();
  assert.deepEqual(guildBuildings, ['A.I. Core', 'Atomium', 'Cosmic Catalyst', 'Observatory', 'Saturn VI Gate HYDRA', 'The Arc']);
  const adjacentOnly = structuredClone(building('Observatory'));
  adjacentOnly.rows = adjacentOnly.rows.filter(row => row.tier === 'Gold');
  assert.equal(producesGuildGoods(adjacentOnly, 100, data.boosts), false);
  assert.equal(producesGuildGoods(adjacentOnly, 101, data.boosts), true);
  assert.equal(producesGuildGoods(building("St. Mark's Basilica"), 150, data.boosts), false);
});

test('user-confirmed CF, Observatory and Siphon posts and priming totals match exactly', () => {
  for (const [name, level, contributions, priming, message] of [
    ['Château Frontenac', 102, [887, 443, 147, 37, 8, 2, 1], 7711,
      'player Château Frontenac P7(1) P6(2) P5(8) P4(37) P3(147) P2(443) P1(887)'],
    ['Observatory', 106, [1414, 707, 235, 59, 12, 2, 1], 11061,
      'player Observatory P7(1) P6(2) P5(12) P4(59) P3(235) P2(707) P1(1414)'],
    ['Shattered Horizon Siphon', 3, [3445, 1723, 574, 144, 29], 6506,
      'player Shattered Horizon Siphon P5(29) P4(144) P3(574) P2(1723) P1(3445)'],
  ]) {
    const result = at(name, level);
    assert.deepEqual(Array.from(result.contributions), contributions, name);
    assert.equal(result.priming, priming, name);
    assert.equal(result.finalFP, contributions.at(-1));
    assert.equal(promotion('player', building(name), result), message);
  }
});

test('reward pools change at exact target levels and base rewards round before the rate', () => {
  for (const [level, percent] of [[1,25],[9,25],[10,30],[39,30],[40,40],[69,40],[70,25],[100,25],[101,15],[200,15]]) {
    assert.equal(baseRewards(20600, level, false)[0], 120 * percent, `Copper ${level}`);
  }
  for (const [level, percent] of [[101,15],[200,15],[201,10],[300,10]]) {
    assert.equal(baseRewards(866000, level, true)[0], 5040 * percent, `Gold ${level}`);
  }
  assert.deepEqual(Array.from(at('Château Frontenac', 102).rewards), [806,403,134,34,7,1,0]);
  assert.deepEqual(Array.from(at('Observatory', 106).rewards), [1178,589,196,49,10,2,0]);
  assert.deepEqual(Array.from(at('Shattered Horizon Siphon', 3).rewards), [1813,907,302,76,15]);
  assert.equal(at('Château Frontenac', 102).contributions[5], 2, 'FP-paying P6 minimum');
  assert.equal(at('Château Frontenac', 102).contributions[6], 1, 'zero-reward P7');
});

test('additional guild posts match every position and preserve the styled player name', () => {
  for (const [name, level, rate, priming, finalFP, positions] of [
    ['Arctic Orangery', 204, 1.1, 140275, 2,
      'P7(2) P6(14) P5(84) P4(420) P3(1682) P2(5045) P1(10090)'],
    ['The Kraken', 187, 1.1, 111365, 2,
      'P7(2) P6(18) P5(107) P4(534) P3(2135) P2(6404) P1(12807)'],
    ['Shattered Horizon Siphon', 22, 1.9, 39005, 253,
      'P5(253) P4(1264) P3(5052) P2(15158) P1(30315)'],
    ['The Arc', 205, 1.2, 140073, 2,
      'P7(2) P6(16) P5(92) P4(463) P3(1853) P2(5558) P1(11117)'],
    ['A.I. Core', 128, 2, 34217, 72,
      'P5(72) P4(356) P3(1426) P2(4280) P1(8560)'],
  ]) {
    const result = at(name, level);
    assert.equal(result.status, 'ready', name);
    assert.equal(result.rate, rate, name);
    assert.equal(result.priming, priming, name);
    assert.equal(result.finalFP, finalFP, name);
    // AO is the user's abbreviation; the tool deliberately posts the full name.
    assert.equal(promotion('𝘻𝘱𝘸𝘥', building(name), result), `𝘻𝘱𝘸𝘥 ${name} ${positions}`);
  }
});

test('known Copper and Gold examples exclude the final flip and price zero rewards at 1 FP', () => {
  const arc = at('The Arc', 101);
  assert.deepEqual(Array.from(arc.contributions), [954, 476, 158, 40, 8, 2, 1]);
  assert.equal(arc.total, 9104);
  assert.equal(arc.contributionTotal, 1639);
  assert.equal(arc.priming, 7464);
  assert.equal(arc.finalFP, 1);
  const zeus = at('Statue of Zeus', 1);
  assert.deepEqual(Array.from(zeus.contributions), [11, 6, 2, 1, 1]);
  assert.equal(zeus.priming, 22);
  const goldZeus = at('Statue of Zeus', 101);
  assert.deepEqual(Array.from(goldZeus.contributions), [462, 231, 77, 19, 3, 2, 1]);
  assert.equal(goldZeus.priming, 4013);
});

test('the final flip reserves the rounded contribution for P5 or P7', () => {
  for (const [name, level, positions, finalFP, priming] of [
    ['Statue of Zeus', 100, 5, 11, 2394],
    ['Atomium', 150, 5, 92, 43766],
    ['The Arc', 200, 7, 4, 124602],
    ['The Arc', 101, 7, 1, 7464],
  ]) {
    const result = at(name, level);
    assert.equal(result.positions, positions);
    assert.equal(result.finalFP, finalFP);
    assert.equal(result.priming, priming);
  }
  const zeus = structuredClone(building('Statue of Zeus'));
  zeus.levelData[99][0] = 8;
  assert.equal(calculate(zeus, 100, data.boosts).priming, 0);
  zeus.levelData[99][0] = 7;
  assert.equal(calculate(zeus, 100, data.boosts).status, 'overfunded');
});

test('Treasury GBs always use the in-guild thread; others follow the target tier', () => {
  for (const name of ['A.I. Core', 'Atomium', 'Cosmic Catalyst', 'Observatory', 'Saturn VI Gate HYDRA', 'The Arc']) {
    for (const level of [1, 100, 101, 200]) {
      const thread = postingThread(at(name, level));
      assert.equal(thread.name, '✨Treasury Bldg, 2.0 Copper /1.2 Gold', `${name} ${level}`);
      assert.equal(thread.location, 'Guild tab');
    }
  }
  assert.equal(postingThread(at('Statue of Zeus', 100)).name, '⚔️GoE & Friends Copper Tier 190 🟠');
  assert.equal(postingThread(at('Statue of Zeus', 101)).name, '⚔️GoE & Friends Gold Tier 110 🟡');
  assert.equal(postingThread(at('Cape Canaveral', 200)).name, '⚔️GoE & Friends Copper Tier 190 🟠');
  for (const [name, level] of [['Statue of Zeus',100], ['Statue of Zeus',101], ['Cape Canaveral',200]]) {
    assert.equal(postingThread(at(name, level)).location, 'Social tab');
  }
  assert.equal(postingThread(at('The Arc', 301)), null);
  assert.equal(postingThread({ status: 'missing-data' }), null);
});

test('promotion uses full names, descending positions and plain integer amounts', () => {
  assert.equal(promotion('  Guild Mate  ', building('The Arc'), at('The Arc', 101)),
    'Guild Mate The Arc P7(1) P6(2) P5(8) P4(40) P3(158) P2(476) P1(954)');
  assert.equal(promotion('Player', building('Statue of Zeus'), at('Statue of Zeus', 1)),
    'Player Statue of Zeus P5(1) P4(1) P3(2) P2(6) P1(11)');
  assert.match(promotion('Player', building('The Arc'), at('The Arc', 150)), /P1\(8360\)$/);
  assert.equal(promotion(' \n ', building('The Arc'), at('The Arc', 101)), '');
  assert.equal(promotion('Player', building('The Arc'), at('The Arc', 0)), '');
});

test('invalid levels and unknown costs cannot produce a misleading post', () => {
  for (const level of [NaN, Infinity, -1, 0, 1.5, 301]) assert.equal(at('The Arc', level).status, 'invalid-level');
  assert.equal(at('Atomium', 201).status, 'invalid-level');
  for (const invalidCost of [null, undefined, NaN, -1, 1.5]) {
    const arc = structuredClone(building('The Arc'));
    arc.levelData[100][0] = invalidCost;
    const result = calculate(arc, 101, data.boosts);
    assert.equal(result.status, 'missing-data');
    assert.equal(promotion('Player', arc, result), '');
  }
  const arc = structuredClone(building('The Arc'));
  arc.levelData[100][0] = 9;
  assert.equal(calculate(arc, 101, data.boosts).priming, 0);
  arc.levelData[100][0] = 8;
  assert.equal(calculate(arc, 101, data.boosts).status, 'overfunded');
});

test('obsolete workbook reward cells do not affect GOE rewards', () => {
  const cf = structuredClone(building('Château Frontenac'));
  cf.levelData[101].fill(null, 7, 14);
  const result = calculate(cf, 102, data.boosts);
  assert.deepEqual(Array.from(result.contributions), [887,443,147,37,8,2,1]);
  assert.equal(result.priming, 7711);
});

test('every supported level balances priming + contributions + final flip exactly', () => {
  let checked = 0;
  for (const item of data.buildings) {
    for (let level = 1; level <= item.levelData.length; level++) {
      const result = calculate(item, level, data.boosts);
      assert.equal(result.status, 'ready', `${item.name} ${level}`);
      assert.deepEqual(item.levelData[level - 1].slice(7, 14),
        [...result.rewards, ...Array(7 - result.positions).fill(null)],
        `${item.name} ${level}: explorer base rewards must match Prime & Post`);
      assert.ok(Number.isSafeInteger(result.priming) && result.priming >= 0);
      assert.ok(result.contributions.every(value => Number.isSafeInteger(value) && value >= 1));
      assert.equal(result.finalFP, result.contributions[result.positions - 1]);
      assert.equal(result.priming + result.contributionTotal + result.finalFP, item.levelData[level - 1][0]);
      checked++;
    }
  }
  assert.equal(checked, 11900);
});
