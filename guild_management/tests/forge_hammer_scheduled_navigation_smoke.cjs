'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../chrome');
const driver = readFileSync(path.join(directory, 'launch-forge-hammer.cjs'), 'utf8');

async function check(market, blank) {
  const selector = `https://${market}0.forgeofempires.com/page/`;
  const world = `https://${market}24.forgeofempires.com/game/index`;
  const browser = new EventEmitter();
  const commands = new PassThrough();
  const responses = new PassThrough();
  browser.stdio = [null, null, null, commands, responses];
  const closed = new Promise(resolve => { browser.unref = resolve; });
  const stdin = new PassThrough();
  const processStub = { argv: ['node', 'driver', 'chrome', 'profile', 'Default', world + '#example=1'], stdin };
  const errors = [];
  const navigations = [];
  const send = message => responses.write(JSON.stringify(message) + '\0');
  const frame = fields => send({ method: 'Page.frameNavigated', sessionId: 'session', params: { frame: fields } });
  commands.on('data', packet => {
    const { id, method, params } = JSON.parse(packet.toString().slice(0, -1));
    if (method === 'Target.createTarget') return send({ id, result: { targetId: 'tab' } });
    if (method === 'Target.attachToTarget') return send({ id, result: { sessionId: 'session' } });
    if (method !== 'Page.navigate') return send({ id, result: {} });
    navigations.push(params.url);
    if (params.url === world) {
      for (const url of [`https://${market}0.forgeofempires.com/start`, `https://${market}.forgeofempires.com/`]) {
        send({ sessionId: 'session', method: 'Network.requestWillBeSent',
          params: { type: 'Document', request: { url }, redirectResponse: { status: 302 } } });
      }
      return; // No document commits on the stalled redirect.
    }
    assert.equal(params.url, selector);
    send({ id, result: { frameId: 'top' } });
    frame({ id: 'child', parentId: 'top', url: selector });
    frame({ id: 'top', url: selector, unreachableUrl: selector });
    frame({ id: 'top', url: 'about:blank' });
    if (!blank) {
      frame({ id: 'top', url: selector });
      setImmediate(() => stdin.end()); // The exporter closes the pipe after its downloads.
    }
  });
  vm.runInNewContext(driver, {
    __dirname: directory, URL, clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 80)),
    process: processStub,
    console: { error: message => errors.push(message) },
    require: name => name === 'node:child_process' ? { spawn: () => browser } : require(name),
  });
  const watchdog = setTimeout(() => stdin.end(), 500);
  try {
    await closed;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(navigations, [selector], 'The scheduled driver must use the direct world selector.');
    if (blank) {
      assert.equal(processStub.exitCode, 1, 'A blank tab must fail before the CSV timeout.');
      assert.match(errors.join(' '), /world selector.*did not load/i);
      assert.match(errors.join(' '), /about:blank/);
    } else {
      assert.deepEqual(errors, []);
      assert.equal(processStub.exitCode || 0, 0);
    }
  } finally {
    clearTimeout(watchdog);
  }
}

(async () => {
  await check('us', false);
  await check('en', true);
})().catch(error => { console.error(error); process.exitCode = 1; });
