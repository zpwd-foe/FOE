import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const context = vm.createContext({ window: {} });
for (const file of ['core.js', 'combat-ranking.js']) {
  vm.runInContext(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const combat = context.window.PrestigeCombat;
const data = JSON.parse(await readFile(new URL('../data/guide-data.json', import.meta.url), 'utf8'));
const bases = { regular: 10000, gbg: 20000, ge: 20000 };
const ranking = (level = 150, values = bases, priorities) => combat.rank(data.buildings, data.boosts, level, values, { ge: 0.5, attack: 0.5, red: 0.5, ...priorities });
const result = (sheet, level = 150, values = bases, priorities) => ranking(level, values, priorities).find(row => row.building.sourceSheet === sheet);

test('default ranking favors attack and GBG while keeping both armies equal', () => {
  const zeus = combat.rank(data.buildings, data.boosts, 150, bases).find(row => row.building.sourceSheet === 'SoZ');
  assert.deepEqual({ ...zeus.weights }, { regular: 1, gbg: 0.75, ge: 0.25, attack: 1.5, defense: 0.5, red: 1, blue: 1 });
  assert.equal(zeus.modes.regular, 456);
  assert.equal(zeus.modes.ge, 300);
  assert.equal(zeus.perTile, 126);
});

test('balanced scores weight stats, armies and modes before dividing by tiles', () => {
  const zeus = result('SoZ'), terracotta = result('TA'), cathedral = result('CoA');
  assert.equal(zeus.weights.attack, 1);
  assert.equal(zeus.weights.defense, 1);
  assert.equal(zeus.weights.red, 1);
  assert.equal(zeus.weights.blue, 1);
  assert.equal(zeus.modes.regular, 304);
  assert.equal(zeus.modes.ge, 600);
  assert.equal(zeus.perTile, 904 / 6);
  assert.equal(terracotta.modes.regular, 2656);
  assert.equal(terracotta.modes.ge, 1600);
  assert.equal(terracotta.perTile, 4256 / 24);
  assert.equal(cathedral.total, 2274 + 400);
});

test('each multiplier uses its own mode base without duplicating regular bonuses', () => {
  const custom = { regular: 5000, gbg: 30000, ge: 40000 };
  assert.equal(result('SoZ', 150, custom).total, 304 + 1200);
  assert.equal(result('CoA', 150, custom).total, 2274 + 600);
  assert.equal(result('SHS', 100, custom).total, 5000 * 0.04 * 4);
  assert.equal(result('SHS', 100, custom).modes.gbg, 0);
  assert.equal(result('SHS', 100, custom).modes.ge, 0);
  assert.equal(result('HC', 150, custom).total, 300);
});

test('QI-only buildings and non-stat fighting effects are excluded', () => {
  const ranks = ranking();
  assert.equal(ranks.length, 17);
  assert.ok(!ranks.some(row => ['VP', 'Cat', 'AO', 'Kraken'].includes(row.building.sourceSheet)));
  assert.equal(result('CdM').total, 1708);
  assert.equal(result('DC').total, 3790);
  assert.ok(result('DC').complete, 'Missing QI data must not invalidate included regular bonuses');
  assert.equal(combat.effect(data.boosts['69']), null);
});

test('retained boosts are ranked with source levels; locked Gold and genuine zero are valid', () => {
  const shs = result('SHS');
  assert.equal(shs.complete, true);
  assert.equal(shs.retained, true);
  assert.equal(shs.perTile, 100);
  assert.equal(shs.modes.regular, 1600);
  assert.equal(shs.parts[0].sourceLevel, 108);
  assert.equal(result('SHS',108).retained, false);
  assert.equal(result('SHS',109).retained, true);
  assert.equal(result('SV', 100).total, 0);
  assert.ok(result('SV', 100).complete);
  assert.equal(result('SV', 150, { regular: 0, gbg: 0, ge: 0 }).perTile, 0);
  const ranks = ranking();
  assert.ok(ranks.every(row=>row.complete));
  assert.ok(ranks.slice(1).every((row, i) => row.perTile <= ranks[i].perTile));
});

test('internal combat gaps remain unranked after all complete or retained scores',()=>{
  const buildings=structuredClone(data.buildings);
  buildings.find(b=>b.sourceSheet==='SoZ').rows[0].values[149]=null;
  const ranks=combat.rank(buildings,data.boosts,150,bases),firstMissing=ranks.findIndex(row=>!row.complete);
  assert.ok(firstMissing > 0);
  assert.ok(ranks.slice(firstMissing).every(row => !row.complete));
  assert.equal(ranks[firstMissing].building.sourceSheet,'SoZ');
  assert.equal(ranks[firstMissing].perTile,null);
  assert.ok(ranks.slice(1, firstMissing).every((row, i) => row.perTile <= ranks[i].perTile));
});

test('global targets retain Copper-only cap and warn on retained Gold values', () => {
  assert.equal(result('SBC', 300).level, 200);
  assert.equal(result('SBC', 300).perTile, result('SBC', 200).perTile);
  assert.equal(result('SoZ', 300).level, 300);
  assert.equal(result('SoZ', 300).perTile, (320+1000)/6);
  assert.equal(result('SoZ', 300).retained,true);
  assert.equal(result('SoZ', 300).parts.find(part=>part.retained).sourceLevel,224);
  assert.ok(result('SoZ', 300).modes.regular > 0);
});

test('invalid target or base does not silently produce a zero-base ranking', () => {
  for (const level of [0, 301, 150.5, NaN]) assert.equal(ranking(level), null);
  for (const value of [-1, NaN, Infinity]) assert.equal(ranking(150, { ...bases, ge: value }), null);
  for (const value of [-0.1, 1.1, NaN, Infinity]) {
    assert.equal(ranking(150,bases,{ge:value,attack:0.5}),null);
    assert.equal(ranking(150,bases,{ge:0.5,attack:value}),null);
    assert.equal(ranking(150,bases,{red:value}),null);
  }
});

test('GBG and GE share exactly one weight while regular stays at one',()=>{
  for(const ge of [0,0.25,0.5,0.73,1]){
    const zeus=result('SoZ',150,bases,{ge,attack:0.5});
    assert.equal(zeus.weights.regular,1);
    assert.equal(zeus.weights.gbg+zeus.weights.ge,1);
    assert.equal(zeus.modes.regular,304);
    assert.ok(Math.abs(zeus.total-(304+1200*ge))<1e-9);
  }
  assert.equal(result('CoA',150,bases,{ge:0,attack:1}).total,3874);
  assert.equal(result('CoA',150,bases,{ge:1,attack:1}).total,2274);
});

test('attack/defense weights distinguish single stats and both armies',()=>{
  assert.equal(result('SoZ',150,bases,{ge:0.5,attack:1}).total,1208);
  assert.equal(result('SoZ',150,bases,{ge:0.5,attack:0}).total,600);
  assert.equal(result('HC',150,bases,{ge:0,attack:1}).total,800);
  assert.equal(result('HC',150,bases,{ge:0,attack:0}).total,0);
  assert.equal(result('Obs',150,bases,{ge:1,attack:0}).total,1276);
  assert.equal(result('Obs',150,bases,{ge:1,attack:1}).total,476);
  for(const attack of [0,0.2,0.5,1]){
    const shs=result('SHS',150,bases,{ge:0.5,attack});
    assert.equal(shs.weights.attack+shs.weights.defense,2);
    assert.equal(shs.total,1600,'Both red/blue attack and defense remain balanced in total');
  }
});

test('zero-weight missing or retained bonuses cannot invalidate a score or warning',()=>{
  const lotus=result('LT',150,bases,{ge:0,attack:0.5});
  assert.equal(lotus.total,0);
  assert.equal(lotus.retained,false);
  assert.equal(result('LT',150,bases,{ge:1,attack:0.5}).retained,true);
  const buildings=structuredClone(data.buildings);
  buildings.find(b=>b.sourceSheet==='SoZ').rows[0].values[149]=null;
  const find=attack=>combat.rank(buildings,data.boosts,150,bases,{ge:0.5,attack}).find(row=>row.building.sourceSheet==='SoZ');
  assert.equal(find(0).complete,true);
  assert.equal(find(0).total,600);
  assert.equal(find(1).complete,false);
});

test('army priority distinguishes red, blue and boosts affecting both armies',()=>{
  assert.equal(result('SoZ',150,bases,{red:1}).total,1808);
  assert.equal(result('SoZ',150,bases,{red:0}).total,0);
  assert.equal(result('HC',150,bases,{red:1}).total,0);
  assert.equal(result('HC',150,bases,{red:0}).total,400);
  assert.equal(result('Obs',150,bases,{red:0}).total,1352);
  assert.equal(result('Obs',150,bases,{red:1}).total,0);
  for(const red of [0,0.25,0.5,0.75,1]){
    const shs=result('SHS',150,bases,{red});
    assert.equal(shs.weights.red+shs.weights.blue,2);
    assert.equal(shs.total,1600);
    assert.equal(result('TA',150,bases,{red}).total,4256);
  }
  assert.equal(result('LT',150,bases,{red:1}).retained,false);
  assert.equal(result('LT',150,bases,{red:0}).retained,true);
});

test('all 125 five-stop priority combinations preserve weight totals and sorted finite scores',()=>{
  const stops=[0,0.25,0.5,0.75,1];
  for(const ge of stops)for(const attack of stops)for(const red of stops){
    const rows=ranking(150,bases,{ge,attack,red});
    assert.equal(rows.length,17);
    for(const row of rows){
      assert.ok(Number.isFinite(row.perTile)&&row.perTile>=0);
      assert.equal(row.weights.regular,1);
      assert.equal(row.weights.gbg+row.weights.ge,1);
      assert.equal(row.weights.attack+row.weights.defense,2);
      assert.equal(row.weights.red+row.weights.blue,2);
      assert.ok(Math.abs(row.total-Object.values(row.modes).reduce((a,b)=>a+b,0))<1e-9);
    }
    assert.ok(rows.slice(1).every((row,i)=>row.perTile<=rows[i].perTile));
  }
});

test('hidden view requires seven clicks inside three seconds and resets after opening', () => {
  const click = combat.rapidClicks();
  for (let i = 0; i < 6; i++) assert.equal(click(i * 300), false);
  assert.equal(click(1800), true);
  assert.equal(click(1900), false);
  const slow = combat.rapidClicks();
  for (let i = 0; i < 14; i++) assert.equal(slow(i * 600), false);
  const reset = combat.rapidClicks();
  for (let i = 0; i < 6; i++) assert.equal(reset(i * 100), false);
  assert.equal(reset(4000), false);
  for (let i = 1; i < 6; i++) assert.equal(reset(4000 + i * 100), false);
  assert.equal(reset(4600), true);
});
