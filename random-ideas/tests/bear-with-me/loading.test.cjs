const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const requests = [], pending = new Map();
  const node = attributes => ({ getAttribute: key => attributes[key], setAttribute: (key, value) => { attributes[key] = value; }, attributes });
  const wood = node({ href: 'data:image/webp;base64,preview', 'data-full-texture': 'assets/hinoki-grain-v1.png' });
  const bear = node({ 'data-bear-src': 'assets/plush-atlas-v2.png' });
  const prop = node({ 'data-prop-src': 'assets/mahogany-grain-v1.png' });
  const sandbox = { window: {}, document: { querySelectorAll: selector => ({ '[data-full-texture]': [wood], '[data-bear-src]': [bear], '[data-prop-src]': [prop] })[selector] || [] },
    Image: class {
      decode() { requests.push({ file: this.src, priority: this.fetchPriority }); return new Promise((resolve, reject) => pending.set(this.src, { resolve, reject })); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../projects/bear-with-me/props.js'), 'utf8'), sandbox);
  return { artwork: sandbox.window.BearArtwork, requests, pending, wood, bear, prop };
}

test('wood loads first at high priority while its inline preview remains visible', async () => {
  const s = setup();
  const ready = s.artwork.preloadCore();
  assert.deepEqual(s.requests, [{ file: 'assets/hinoki-grain-v1.png', priority: 'high' }]);
  assert.match(s.wood.attributes.href, /^data:/);
  assert.equal(s.bear.attributes.href, undefined);
  s.pending.get('assets/hinoki-grain-v1.png').resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.wood.attributes.href, 'assets/hinoki-grain-v1.png');
  assert.equal(s.bear.attributes.href, 'assets/plush-atlas-v2.png');
  assert.equal(s.requests.length, 2);
  s.pending.get('assets/plush-atlas-v2.png').resolve();
  await ready;
  assert.equal(s.prop.attributes.href, undefined);
});

test('selected props share one request and unused prop sheets are not fetched', async () => {
  const s = setup();
  const first = s.artwork.preload(['nightcap', 'blanket']);
  const repeated = s.artwork.preload(['nightcap']);
  assert.deepEqual(s.requests, [{ file: 'assets/props-costumes-v2.png', priority: 'low' }]);
  s.pending.get('assets/props-costumes-v2.png').resolve();
  await Promise.all([first, repeated]);
});

test('a failed texture keeps its inline preview and can be retried', async () => {
  const s = setup();
  const first = s.artwork.preloadCore();
  s.pending.get('assets/hinoki-grain-v1.png').reject(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(s.wood.attributes.href, /^data:/);
  s.pending.get('assets/plush-atlas-v2.png').resolve();
  await first;
  const retry = s.artwork.preloadCore();
  assert.equal(s.requests.filter(r => r.file.includes('hinoki')).length, 2);
  s.pending.get('assets/hinoki-grain-v1.png').resolve();
  await retry;
  assert.equal(s.wood.attributes.href, 'assets/hinoki-grain-v1.png');
});
