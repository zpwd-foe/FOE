const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../projects/bear-with-me/renderer.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const Renderer = sandbox.window.BearRenderer;

test('every movement style reaches its target without overshoot or a backwards jump', () => {
  for (const style of ['smooth', 'linear', 'heavy', 'gentle', 'hesitant', 'weary', 'snap', 'commit', 'fall']) {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const progress = Renderer.motionProgress(i / 1000, style);
      assert.ok(progress >= previous && progress <= 1, `${style} must keep the original safe path`);
      previous = progress;
    }
    assert.equal(Renderer.motionProgress(0, style), 0);
    assert.equal(Renderer.motionProgress(1, style), 1);
  }
});

test('emotional gestures have distinct effort, rest and acceleration phases', () => {
  const at = (style, t) => Renderer.motionProgress(t, style);
  assert.ok(at('heavy', .25) < .05, 'heavy gestures take time to get moving');
  assert.ok(at('snap', .25) > .65, 'a startled reaction moves immediately');
  assert.ok(at('commit', .5) < .15, 'a committed tap accelerates toward contact');
  assert.equal(at('hesitant', .4), at('hesitant', .6), 'the approaching paw visibly hesitates');
  assert.equal(at('weary', .25), at('weary', .4), 'first exhausted rest');
  assert.equal(at('weary', .7), at('weary', .8), 'second exhausted rest');
  assert.ok(at('weary', .6) > at('weary', .4), 'effort resumes between rests');
  assert.ok(at('fall', .75) - at('fall', .5) > at('fall', .5) - at('fall', .25));
});

test('the actual arm arc and wrist stop together during hesitation and finish at the target', async () => {
  let clock = 0;
  const environment = { window: {}, requestAnimationFrame: callback => {
    queueMicrotask(() => callback(clock += 10));
    return clock;
  } };
  vm.runInNewContext(source, environment);
  const renderer = Object.create(environment.window.BearRenderer.prototype);
  renderer.state = { rx: 451, ry: 280, rr: 0, rise: 0, rightInside: 0, leftInside: 1 };
  renderer.speed = 1;
  renderer.reduced = false;
  const frames = [];
  renderer.render = () => frames.push({ t: (clock - 10) / 1000, ...renderer.state });
  await renderer.move({ rx: 431, ry: 312, rr: 30 }, 1000, undefined, 'hesitant');
  const resting = frames.filter(f => f.t >= .35 && f.t <= .65);
  assert.ok(resting.length >= 25);
  for (const frame of resting) {
    assert.equal(frame.rx, resting[0].rx);
    assert.equal(frame.ry, resting[0].ry, 'the reaching arc must not keep moving during the rest');
    assert.equal(frame.rr, resting[0].rr, 'the wrist must not rotate independently during the rest');
  }
  assert.equal(renderer.state.rx, 431);
  assert.equal(renderer.state.ry, 312);
  assert.equal(renderer.state.rr, 30);
});
