const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../projects/bear-with-me/renderer.js'),'utf8'),sandbox);
const Renderer = sandbox.window.BearRenderer;
const parent = () => ({append(node){node.parent=this;}});
function fixture(state) {
  const r=Object.create(Renderer.prototype);
  r.state={rise:0,x:0,lx:376,ly:286,rx:451,ry:314,...state};r.layout=Renderer.stageLayout();
  r.nodes={'front-props':parent(),'held-props':parent()};r.backProps=parent();r.handGroups={left:parent(),right:parent()};
  r.props=new Map();r.render=()=>{};return r;
}
test('prop transfers preserve their rendered position across all depths and box-front projection',()=>{
  let transfers=0;
  for(const state of [{},{rise:90,x:-55,lx:180,ly:100},{rise:-37,x:22,rx:900,ry:600}]) {
    const r=fixture(state);
    for(const from of ['left','right','inside','world'])for(const to of ['left','right','inside','world'])for(const y of [282,353,365,465]){
      const p={id:'prop',node:{},anchor:from,x:24,y,r:71,s:.65,sx:.04,opacity:.45};r.props.set('prop',p);
      const before=r.propPosition(p);r.anchorProp('prop',to);const after=r.propPosition(p);
      assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-8,`${from} to ${to} moved at y=${y}`);
      assert.equal(p.r,71);assert.equal(p.s,.65);assert.equal(p.sx,.04);assert.equal(p.opacity,.45);
      r.anchorProp('prop',from);assert.ok(Math.abs(p.x-24)<1e-8&&Math.abs(p.y-y)<1e-8);transfers++;
    }
  }
  assert.equal(transfers,192);
});
test('furniture uses the rear depth only after being placed inside',()=>{
  const r=fixture({});const p={anchor:'left',depth:'back'};
  assert.equal(r.propLayer(p),r.handGroups.left);
  p.anchor='world';assert.equal(r.propLayer(p),r.nodes['front-props']);
  p.anchor='inside';assert.equal(r.propLayer(p),r.backProps);
  p.depth=undefined;assert.equal(r.propLayer(p),r.nodes['held-props']);
});
