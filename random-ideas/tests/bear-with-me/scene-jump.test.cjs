const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scenes = require('../../projects/bear-with-me/scenes.js');
const progress = require('../../projects/bear-with-me/progress.js');

function setup(answers = []) {
  const nodes = new Map(), played = [], prompts = [];
  const getNode = id => {
    if (!nodes.has(id)) nodes.set(id, {
      style: {}, dataset: {}, classList: { toggle() {} }, handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn; }, setAttribute() {},
    });
    return nodes.get(id);
  };
  const sandbox = {
    AbortController, setTimeout, clearTimeout, performance, console,
    document: { getElementById: getNode, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    window: {
      matchMedia: () => ({ matches: true, addEventListener() {} }), BearProgress: progress,
      BearScenes: scenes.map(scene => ({ ...scene, play: async () => { played.push(scene.id); } })),
      BearArtwork: { preload: async () => {} },
      prompt(message, value) { prompts.push({ message, value }); return answers.length ? answers.shift() : null; },
      BearRenderer: class {
        constructor() { this.state = {}; this.assetsReady = Promise.resolve(); }
        switch() {} reset() {} prop() {} clearProps() {} wear() {} outfit() {} expression() {} render() {}
        async move(values) { Object.assign(this.state, values); }
        async retractHands() {}
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../projects/bear-with-me/machine.js'), 'utf8'), sandbox);
  const machine = sandbox.window.bearMachine;
  machine.context = () => ({ closeSpeed: 400, off: async () => machine.setSwitch(false), open: async () => {}, move: async () => {}, stow: async () => {}, wait: async () => {} });
  const click = (type, detail = 1) => getNode('scene-jump').handlers[type]({ detail, preventDefault() {}, stopPropagation() {} });
  return { machine, sandbox, played, prompts, click, nodes };
}

test('double-click queues the stable scene ID once and records discovery only after it plays', async () => {
  const s = setup([' 42 ']);
  s.click('click', 1);
  assert.equal(s.prompts.length, 0, 'A single pointer click must do nothing');
  s.click('dblclick', 2);
  assert.equal(s.machine.nextSceneId, 42);
  assert.deepEqual(s.played, []);
  assert.equal(s.machine.progress.counts.reduce((a, b) => a + b, 0), 0);
  assert.equal(await s.machine.play(), true);
  assert.deepEqual(s.played, [42]);
  const index = scenes.findIndex(scene => scene.id === 42);
  assert.equal(s.machine.progress.last, index);
  assert.equal(s.machine.progress.counts[index], 1);
  assert.equal(s.machine.nextSceneId, null);
  await s.machine.play();
  assert.deepEqual(s.played, [42, 1], 'Normal story selection resumes after the one-time override');
});

test('invalid or cancelled input preserves an existing choice and accepts a corrected scene', () => {
  for (const answer of [null, '', ' ', '4', '19', '0', '51', '-1', '1.5', '42x', '4e1', '0x2a']) {
    const s = setup([answer, null]);
    s.machine.nextSceneId = 7;
    s.click('dblclick', 2);
    assert.equal(s.machine.nextSceneId, 7, `Input changed the queued scene: ${answer}`);
    assert.deepEqual(s.played, []);
  }
  const corrected = setup(['19', '50']);
  corrected.click('dblclick', 2);
  assert.equal(corrected.prompts.length, 2);
  assert.match(corrected.prompts[1].message, /isn't available/);
  assert.equal(corrected.machine.nextSceneId, 50);
});

test('a choice made during a running scene waits for the next switch press', async () => {
  const s = setup(['42']);
  let finish;
  s.sandbox.window.BearScenes[0].play = () => {
    s.played.push(1);
    return new Promise(resolve => { finish = resolve; });
  };
  const running = s.machine.play();
  await new Promise(resolve => setImmediate(resolve));
  s.click('dblclick', 2);
  assert.equal(await s.machine.play(), false, 'Queue selection must not interrupt the active scene');
  assert.equal(s.machine.nextSceneId, 42);
  assert.deepEqual(s.played, [1]);
  finish();
  await running;
  assert.deepEqual(s.played, [1], 'Finishing a scene must not start the queued scene automatically');
  await s.machine.play();
  assert.deepEqual(s.played, [1, 42]);
});

test('the override works in random order and retirement still follows scene 50', async () => {
  const s = setup(['50', '42']);
  s.machine.progress.mode = 'shuffle';
  s.click('dblclick', 2);
  await s.machine.play();
  assert.deepEqual(s.played, [50]);
  assert.equal(s.machine.progress.retired, true);
  assert.equal(s.machine.progress.mode, 'shuffle');
  s.click('dblclick', 2);
  await s.machine.play();
  assert.deepEqual(s.played, [50, 42]);
  assert.equal(s.machine.progress.retired, false);
});

test('keyboard activation opens the picker, and start over clears the pending choice', () => {
  const s = setup(['7']);
  s.click('click', 0);
  assert.equal(s.machine.nextSceneId, 7);
  assert.equal(s.prompts.length, 1);
  s.machine.reset();
  assert.equal(s.machine.nextSceneId, null);
  assert.deepEqual(s.played, []);
});
