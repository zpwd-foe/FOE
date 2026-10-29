import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../core.js',import.meta.url),'utf8'),context);
const core=context.window.PrestigeCore;
const data=JSON.parse(await readFile(new URL('../data/guide-data.json',import.meta.url),'utf8'));
const building=sheet=>data.buildings.find(b=>b.sourceSheet===sheet);

test('upgrade costs include the destination and exclude completed levels',()=>{
  const zeus=building('SoZ');
  assert.equal(core.upgrade(zeus,100,150).fp,2060800);
  assert.equal(core.upgrade(zeus,100,137).fp,1167609);
  assert.equal(core.upgrade(zeus,149,150).fp,77623);
  assert.equal(core.upgrade(zeus,0,1).fp,44);
  assert.equal(core.upgrade(zeus,100,100).valid,false);
  assert.equal(core.upgrade(zeus,150,100).fp,null);
});

test('per-level funding rounds each position at 1.9x before subtracting contributions',()=>{
  const funding=core.levelFunding(building('SoZ'),50);
  assert.equal(funding.total,1410);
  assert.equal(funding.multiplier,1.9);
  assert.equal(funding.positions,5);
  assert.deepEqual(Array.from(funding.contributions),[627,314,105,29,10]);
  assert.equal(funding.contributionTotal,1085);
  assert.equal(funding.priming,325);
});

test('Gold funding switches at 101 while Copper-only funding remains 1.9x through 200',()=>{
  const gold=building('SoZ'),copper=building('ToB');
  assert.equal(core.levelFunding(gold,100).priming,2403);
  const firstGold=core.levelFunding(gold,101);
  assert.equal(firstGold.multiplier,1);
  assert.equal(firstGold.positions,7);
  assert.equal(firstGold.contributionTotal,720);
  assert.equal(firstGold.priming,4089);
  assert.equal(core.levelFunding(copper,101).multiplier,1.9);
  assert.equal(core.levelFunding(copper,101).positions,5);
  assert.equal(core.levelFunding(copper,101).priming,3440);
  assert.equal(core.levelFunding(copper,200).priming,70710);
  assert.equal(core.levelFunding(building('SHS'),100).multiplier,1.9);
  assert.equal(core.levelFunding(building('SHS'),101).multiplier,1);
});

test('per-level funding includes all seven Gold positions and preserves missing data',()=>{
  const gold=structuredClone(building('SoZ'));
  gold.levelData[100]=[1000,1000,0,0,0,0,0,100,50,20,10,5,3,2];
  assert.equal(core.levelFunding(gold,101).contributionTotal,190);
  assert.equal(core.levelFunding(gold,101).priming,810);
  gold.levelData[100][13]=null;
  assert.equal(core.levelFunding(gold,101).total,1000);
  assert.equal(core.levelFunding(gold,101).priming,null);
  gold.levelData[100][13]=0;
  assert.equal(core.levelFunding(gold,101).priming,812);
  gold.levelData[100][0]=null;
  assert.equal(core.levelFunding(gold,101).priming,null);
  assert.equal(core.levelFunding(gold,101).contributionTotal,188);
  gold.levelData[100][0]=100;
  assert.equal(core.levelFunding(gold,101).priming,0);
  for(const level of [0,-1,1.5,301])assert.equal(core.levelFunding(gold,level).priming,null);
});

test('funding covers every supplied level with the correct building-specific tier rule',()=>{
  let count=0;
  for(const b of data.buildings){
    for(const level of b.levels){
      const result=core.levelFunding(b,level);
      const gold=b.gold&&level>=101;
      assert.equal(result.total,b.levelData[level-1][0],`${b.name}, ${level}`);
      assert.equal(result.positions,gold?7:5);
      assert.equal(result.multiplier,gold?1:1.9);
      assert.ok(Number.isInteger(result.priming)&&result.priming>=0&&result.priming<=result.total);
      assert.equal(result.total-result.priming,result.contributionTotal);
      count++;
    }
  }
  assert.equal(count,11900);
});

test('required missing resources block only their total; valid zero stays zero',()=>{
  const fake={gold:true,levelData:Array.from({length:102},()=>[1,1,2,null,null,null,null])};
  assert.equal(core.rangeSum(fake,3,0,100),0);
  assert.equal(core.rangeSum(fake,3,100,102),null);
  assert.equal(core.rangeSum(fake,2,100,102),4);
  fake.levelData[100][3]=0;fake.levelData[101][3]=2;
  assert.equal(core.rangeSum(fake,3,100,102),2);
  assert.equal(core.rangeSum({gold:false,levelData:[[1,1,1,null]]},3,0,1),0);
});

test('20 Gold buildings start coin, supply and medal unlock costs at level 101',()=>{
  const affected=data.buildings.filter(b=>b.gold&&b.sourceSheet!=='SHS');
  assert.equal(affected.length,20);
  for(const b of affected){
    for(const field of ['coinsSupplies','medals']){
      for(const [from,to] of [[0,9],[9,10],[10,11],[99,100],[0,100],[50,100]]){
        assert.equal(core.upgrade(b,from,to)[field],0,`${b.name}, ${from} → ${to}, ${field}`);
      }
      const firstGoldCost=core.upgrade(b,100,101)[field];
      assert.ok(firstGoldCost>0,`${b.name}: ${field} resumes at 101`);
      assert.equal(core.upgrade(b,99,101)[field],firstGoldCost);
      assert.equal(core.upgrade(b,50,150)[field],core.upgrade(b,100,150)[field]);
    }
  }
  assert.equal(core.upgrade(building('SoZ'),100,101).coinsSupplies,2253489);
  assert.equal(core.upgrade(building('SoZ'),100,101).medals,1126744);
});

test('SHS retains its Copper unlock costs and includes the destination level',()=>{
  const shs=building('SHS');
  assert.equal(core.upgrade(shs,0,10).goodsEach,0);
  assert.equal(core.upgrade(shs,10,11).goodsEach,275);
  assert.equal(core.upgrade(shs,50,100).goodsEach,900625);
  assert.equal(core.upgrade(shs,100,101).goodsEach,25025);
  assert.equal(core.upgrade(shs,101,102).goodsEach,138);
  assert.equal(core.upgrade(shs,50,150).goodsEach,986508);
  assert.equal(core.upgrade(shs,100,150).goodsEach,85883);
  assert.equal(core.upgrade(shs,50,150).coinsSupplies,444499036);
  assert.equal(core.upgrade(shs,50,150).medals,385836481);
  assert.equal(core.upgrade(shs,99,100).coinsSupplies,8748000);
  assert.equal(core.upgrade(shs,99,100).medals,8748000);
  assert.equal(core.upgrade(shs,100,101).coinsSupplies,8845200);
  assert.equal(core.upgrade(shs,100,101).medals,8845200);
  assert.equal(core.upgrade(building('SoZ'),50,100).goodsEach,0);
});

test('missing Copper unlock resources are not skipped after their first required level',()=>{
  const shs=structuredClone(building('SHS'));
  shs.levelData[74][6]=null;
  assert.equal(core.upgrade(shs,50,100).goodsEach,null);
  assert.ok(core.upgrade(shs,50,100).fp>0);
  shs.levelData[74][6]=0;
  assert.equal(core.upgrade(shs,74,75).goodsEach,0);
});

test('unpublished Copper resource costs stay unavailable without hiding confirmed costs',()=>{
  for(const sheet of ['CENT','HYD','PEG','Cat','SW']){
    const b=building(sheet);
    for(const field of [4,5,6]){
      assert.equal(core.rangeSum(b,field,0,10),0,`${sheet}: no level unlock before 11`);
      for(const [from,to] of [[10,11],[50,100],[50,150],[199,200]]){
        assert.equal(core.rangeSum(b,field,from,to),null,`${sheet}: unknown resource ${field}`);
      }
    }
    const cost=core.upgrade(b,50,150);
    assert.ok(cost.fp>0);
    assert.ok(cost.copperSets>0);
    assert.equal(cost.goldSets,0);
  }
  for(const b of data.buildings.filter(b=>!b.gold&&!b.pendingUnlockCosts)){
    for(const field of [4,5,6])assert.equal(core.rangeSum(b,field,50,150),0,b.name);
  }
});

test('newly supplied resource values override TBA while missing levels still block a total',()=>{
  const b=structuredClone(building('Cat'));
  for(const field of [4,5,6]){
    b.levelData[10][field]=0;
    b.levelData[11][field]=125;
    assert.equal(core.rangeSum(b,field,10,11),0);
    assert.equal(core.rangeSum(b,field,10,12),125);
    assert.equal(core.rangeSum(b,field,10,13),null);
  }
});

test('every supplied unlocking cost is counted at its level across all 49 buildings',()=>{
  for(const b of data.buildings){
    for(const [index,record] of b.levelData.entries()){
      for(let field=2;field<=6;field++){
        if(record[field]===null)continue;
        assert.equal(core.rangeSum(b,field,index,index+1),record[field],`${b.name}, level ${index+1}, ${data.levelFields[field]}`);
      }
    }
    for(const [from,to] of [[10,50],[50,100],[50,150],[100,101],[100,150],[150,200]]){
      for(let field=2;field<=6;field++){
        const values=b.levelData.slice(from,to).map(record=>record[field]);
        if(values.some(value=>value===null))continue;
        assert.equal(core.rangeSum(b,field,from,to),values.reduce((total,value)=>total+value,0),`${b.name}, ${from} → ${to}, ${data.levelFields[field]}`);
      }
    }
  }
});

test('locked, missing, flat increases and multiplier inputs stay distinct',()=>{
  const [copper,gold]=building('SoZ').rows;
  assert.equal(core.status(gold,100),'locked');
  assert.equal(core.status(gold,225),'retained');
  assert.equal(core.difference(gold,100,150).kind,'unlock');
  assert.equal(core.difference(copper,100,150).delta,41);
  assert.equal(core.difference(gold,137,150).start,2);
  assert.equal(core.difference(gold,137,150).value,3);
  assert.equal(core.difference(gold,224,250).delta,0);
  assert.deepEqual(Array.from(core.difference(gold,224,250).retainedLevels),[224]);
  assert.equal(core.status({tier:'Copper',values:[0]},1),'available');
});

test('gaps break lines rather than interpolating or carrying values',()=>{
  const result=JSON.parse(JSON.stringify(core.segments([null,1,1,null,0,2,null])));
  assert.deepEqual(result,[[[2,1],[3,1]],[[5,0],[6,2]]]);
  assert.equal(core.segments(building('SoZ').rows[1].values)[0].length,124);
});

test('attempt-weighted chance is separate from collection bonuses',()=>{
  const bg=building('BG').rows[0],aic=building('AIC').rows[0];
  assert.ok(Math.abs(core.expected(bg,101,data.boosts[bg.boost])-8.45)<1e-10);
  assert.equal(core.expected(aic,101,data.boosts[aic.boost]),null);
  assert.equal(core.expected(building('BG').rows[2],250,data.boosts['16']),1.98);
});

test('only trailing boost gaps retain the last observation, including genuine zero',()=>{
  const row={tier:'Copper',values:[5,null,3,0,null,null]};
  const snapshot=JSON.stringify(row);
  assert.equal(core.sample(row,2).kind,'missing');
  assert.equal(core.sample(row,4).kind,'available');
  assert.equal(core.sample(row,5).kind,'retained');
  assert.equal(core.sample(row,5).value,0);
  assert.equal(core.sample(row,6).sourceLevel,4);
  assert.equal(core.sample({tier:'Copper',values:[null,null]},2).kind,'missing');
  assert.equal(core.sample({tier:'Gold',values:[1]},100).kind,'locked');
  assert.equal(JSON.stringify(row),snapshot,'Raw observations must stay untouched');
});

test('SHS is confirmed through 108 and retains 4% with provenance above 108',()=>{
  const row=building('SHS').rows.find(row=>row.boost==='58');
  assert.equal(core.sample(row,108).kind,'available');
  assert.equal(core.sample(row,108).value,4);
  for(const level of [109,150,300]){
    const observation=core.sample(row,level);
    assert.equal(observation.kind,'retained');
    assert.equal(observation.value,4);
    assert.equal(observation.sourceLevel,108);
  }
  assert.deepEqual(Array.from(core.difference(row,100,150).retainedLevels),[108]);
  assert.equal(core.difference(row,100,150).delta,0);
  assert.equal(core.multiplierSteps(row).at(-1).level,66);
});

test('boost and attempt-limit retention have independent source levels',()=>{
  const row={tier:'Copper',values:[10,20,null,null],charges:[1,2,3,null]};
  assert.equal(core.sample(row,4).sourceLevel,2);
  assert.equal(core.sample(row,4,'charges').sourceLevel,3);
  assert.ok(Math.abs(core.expected(row,4,{mechanic:'Chance'})-0.6)<1e-10);
  assert.deepEqual(Array.from(core.difference(row,1,4).retainedLevels),[2,3]);
});

test('multiplicative goal includes Copper multipliers and excludes additive boosts',()=>{
  const matches=data.buildings.filter(b=>core.matchesGoal(b,'Multiplicative',data.boosts));
  assert.equal(matches.length,13);
  assert.ok(matches.some(b=>b.name==='Shattered Horizon Siphon'));
  assert.ok(matches.some(b=>b.name==='Statue of Zeus'));
  assert.ok(!matches.some(b=>b.name==='The Arc'));
  assert.equal(core.matchesGoal(building('SoZ'),'All goals',data.boosts),true);
  assert.equal(core.matchesGoal(building('SoZ'),'GE',data.boosts),true);
  assert.equal(core.matchesGoal(building('SoZ'),'Quests',data.boosts),false);
});

test('multiplier step levels preserve exact workbook thresholds',()=>{
  const pairs=row=>Array.from(core.multiplierSteps(row),step=>[step.level,step.value]);
  assert.deepEqual(pairs(building('SoZ').rows[1]),[[101,1],[118,2],[149,3],[181,4],[221,5]]);
  const siphon=data.buildings.find(b=>b.name==='Shattered Horizon Siphon');
  assert.deepEqual(pairs(siphon.rows[0]),[[1,1],[13,2],[37,3],[66,4]]);
});

test('multiplier milestones do not infer a step across missing levels or count a decrease',()=>{
  const row={tier:'Copper',values:[0,0,1,null,3,3,4,2,2]};
  const steps=JSON.parse(JSON.stringify(core.multiplierSteps(row)));
  assert.deepEqual(steps,[{level:1,value:0,kind:'start'},{level:3,value:1,kind:'increase'},{level:7,value:4,kind:'increase'}]);
  assert.equal(core.multiplierSteps({tier:'Gold',values:Array(101).fill(null)}).length,0);
  const gold={tier:'Gold',values:[...Array(100).fill(0),1,1,2]};
  assert.deepEqual(Array.from(core.multiplierSteps(gold),step=>[step.level,step.kind]),[[101,'unlock'],[103,'increase']]);
});
