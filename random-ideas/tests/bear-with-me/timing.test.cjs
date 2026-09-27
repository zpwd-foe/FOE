const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production director without constructing its page UI.
const sandbox = { window: {
  matchMedia: () => ({}),
  BearSound: { material: () => 'cloth' }
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../projects/bear-with-me/renderer.js'), 'utf8'), sandbox);
const source = fs.readFileSync(path.join(__dirname, '../../projects/bear-with-me/machine.js'), 'utf8');
vm.runInNewContext(source.replace('window.bearMachine = new BearMachine();', 'window.BearMachine = BearMachine;'), sandbox);

function director(reduced = false) {
  const machine = Object.create(sandbox.window.BearMachine.prototype), events = [];
  machine.interruptions = 0;
  machine.sound = () => {};
  machine.renderer = {
    reduced, layout: { offsetX: 0 }, props: new Map(),
    state: { x: 0, rise: 0, rx: 451, ry: 314, eye: 1, lid: 0 },
    async move(values, ms, signal, motion) { Object.assign(this.state, values); events.push({ kind: 'move', values, ms, motion }); },
    async moveProp(id, values, ms, signal, motion) { events.push({ kind: 'prop', id, values, ms, motion }); },
    anchorProp() {},
    async wait(ms) { events.push({ kind: 'wait', ms }); },
    expression() {}, wear() {}
  };
  machine.setSwitch = on => events.push({ kind: 'switch', on, rx: machine.renderer.state.rx, ry: machine.renderer.state.ry });
  return { machine, c: machine.context(), events };
}

test('fast and slow gestures diverge while body and prop timing stays consistent', async () => {
  const { c, events } = director();
  for (const ms of [100, 200, 400, 650, 1050]) {
    await c.move({ tilt: 5 }, ms);
    await c.pmove('test-prop', { r: 5 }, ms);
  }
  const moves = events.filter(e => e.kind === 'move').map(e => e.ms);
  assert.deepEqual(moves, events.filter(e => e.kind === 'prop').map(e => e.ms));
  assert.ok(moves[0] >= 80, 'quick gestures must remain visible');
  assert.ok(moves[1] <= 120, 'short reactions should take roughly half as long');
  assert.equal(moves[2], 400, 'ordinary gestures retain their baseline');
  assert.ok(moves[3] >= 950 && moves[3] < 1100, 'careful movement is stretched once');
  assert.ok(moves[4] >= 2800 && moves[4] <= 3000, 'long movements linger even without an added emotional style');
});

test('heavy switch contact and recovery stay slow while preserving physical contact', async () => {
  const fast = director(), slow = director();
  slow.c.motion = 'heavy';
  await fast.c.off({ ms: 100 });
  await slow.c.off({ ms: 1050 });
  const fastMoves = fast.events.filter(e => e.kind === 'move');
  const slowMoves = slow.events.filter(e => e.kind === 'move');
  assert.equal(fastMoves.length, 3);
  assert.equal(slowMoves.length, 3);
  for (let i = 0; i < 3; i++) assert.ok(slowMoves[i].ms / fastMoves[i].ms > 8);
  assert.ok(fastMoves[1].ms >= 60, 'switch contact must remain legible');
  for (const run of [fast, slow]) {
    const contact = run.events.findIndex(e => e.kind === 'switch');
    const touch = sandbox.window.BearRenderer.hardwareGeometry().contact;
    assert.deepEqual(run.events[contact], { kind: 'switch', on: false, rx: touch.x, ry: touch.y });
    assert.equal(run.events[contact - 1].kind, 'move');
    assert.deepEqual(run.events[contact + 1], { kind: 'wait', ms: 90 });
    assert.equal(run.machine.renderer.state.rx, 451);
  }
});

test('emergence shares one tempo across lid and body; blinks and pauses remain unscaled', async () => {
  const { c, events } = director();
  c.motion = 'heavy';
  await c.open(1, 0, 700);
  const moves = events.filter(e => e.kind === 'move');
  assert.ok(moves[1].ms > 1950 && moves[1].ms < 2200);
  assert.equal(moves[0].ms, moves[1].ms * .65);
  assert.deepEqual(moves.slice(0, 2).map(e => e.motion), ['heavy', 'heavy']);
  assert.deepEqual(moves.slice(2).map(e => e.ms), [140, 220]);
  assert.deepEqual(events.filter(e => e.kind === 'wait').map(e => e.ms), [660, 45, 440]);
  const start = events.length;
  await c.beat(250);
  assert.deepEqual(events.slice(start), [{ kind: 'wait', ms: 250 }]);
});

test('reduced-motion story beats bypass the timing exaggeration', async () => {
  const { c, events } = director(true);
  c.motion = 'heavy';
  await c.move({ tilt: 5 }, 200);
  await c.pmove('test-prop', { r: 5 }, 650);
  await c.open(1, 0, 700);
  assert.deepEqual(events.filter(e => e.kind !== 'wait').map(e => e.ms), [200, 650, 455, 700]);
});

test('hesitation has a long approach, a decisive contact and a relieved withdrawal', async () => {
  const { c, events } = director();
  await c.off({ ms: 1050, motion: 'hesitant' });
  const moves = events.filter(e => e.kind === 'move');
  assert.deepEqual(moves.map(e => e.motion), ['hesitant', 'commit', 'snap']);
  assert.ok(moves[0].ms > 4200 && moves[0].ms < 4500);
  assert.ok(moves[1].ms <= 150, 'the final tap commits after the hesitation');
  assert.ok(moves[2].ms < moves[0].ms / 8, 'relief releases the slow approach tempo');
  const switched = events.findIndex(e => e.kind === 'switch');
  assert.equal(events[switched - 1], moves[1]);
});

test('a tired body does not slow eye movements or the fall of a released prop', async () => {
  const { c, events } = director();
  c.motion = 'heavy';
  await c.move({ gazeX: 6, eye: .5 }, 200);
  await c.move({ rx: 430, ry: 300 }, 650);
  await c.drop('spoon', { y: 460 }, 450);
  assert.equal(events[0].motion, 'smooth');
  assert.ok(events[0].ms <= 120);
  assert.equal(events[1].motion, 'heavy');
  assert.ok(events[1].ms > 1700);
  assert.equal(events[2].motion, 'fall');
  assert.equal(events[2].ms, 450);
});
