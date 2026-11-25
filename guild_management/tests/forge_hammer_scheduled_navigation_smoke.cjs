'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../chrome');
const driver = readFileSync(path.join(directory, 'launch-forge-hammer.cjs'), 'utf8');

async function check(market, attempts, expectedError) {
  const selector = `https://${market}0.forgeofempires.com/page/`;
  const world = `https://${market}24.forgeofempires.com/game/index`;
  const browser = new EventEmitter();
  const commands = new PassThrough();
  const responses = new PassThrough();
  browser.stdio = [null, null, null, commands, responses];
  let closed = false;
  browser.unref = () => { closed = true; };
  const stdin = new PassThrough();
  const processStub = { argv: ['node', 'driver', 'chrome', 'profile', 'Default', world + '#example=1'], stdin };
  const errors = [];
  const navigations = [];
  let tabsCreated = 0;
  let now = 0;
  const timers = new Set();
  function schedule(callback, delay) {
    const timer = { at: now + delay, callback, unref() {} };
    timers.add(timer);
    return timer;
  }
  const send = message => responses.write(JSON.stringify(message) + '\0');
  const frame = fields => send({ method: 'Page.frameNavigated', sessionId: 'session', params: { frame: fields } });
  commands.on('data', packet => {
    const { id, method, params, sessionId } = JSON.parse(packet.toString().slice(0, -1));
    if (method === 'Target.createTarget') {
      tabsCreated++;
      return send({ id, result: { targetId: 'tab' } });
    }
    if (method === 'Target.attachToTarget') return send({ id, result: { sessionId: 'session' } });
    if (method !== 'Page.navigate') return send({ id, result: {} });
    navigations.push({ url: params.url, at: now });
    if (params.url === world) {
      for (const url of [`https://${market}0.forgeofempires.com/start`, `https://${market}.forgeofempires.com/`]) {
        send({ sessionId: 'session', method: 'Network.requestWillBeSent',
          params: { type: 'Document', request: { url }, redirectResponse: { status: 302 } } });
      }
      return; // No document commits on the stalled redirect.
    }
    assert.equal(params.url, selector);
    assert.equal(sessionId, 'session');
    const attempt = attempts[navigations.length - 1];
    assert.ok(attempt, 'The driver repeated a navigation unexpectedly.');
    function reply() {
      send({ id, result: { frameId: 'top', errorText: attempt.errorText, isDownload: attempt.isDownload } });
      frame({ id: 'child', parentId: 'top', url: selector });
      frame({ id: 'top', url: selector, unreachableUrl: selector });
      frame({ id: 'top', url: 'about:blank' });
      if (attempt.loads) {
        schedule(() => frame({ id: 'top', url: selector }), 1);
        schedule(() => stdin.end(), 30_000); // Keep the tab open past the retry delay.
      }
    }
    if (attempt.replyDelayMs) schedule(reply, attempt.replyDelayMs);
    else reply();
  });
  vm.runInNewContext(driver, {
    __dirname: directory, URL,
    setTimeout: schedule, clearTimeout: timer => timers.delete(timer),
    performance: { now: () => now },
    process: processStub,
    console: { error: message => errors.push(message) },
    require: name => name === 'node:child_process' ? { spawn: () => browser } : require(name),
  });
  while (!closed) {
    // Let the driver process pipe replies before advancing the simulated clock.
    await new Promise(resolve => setImmediate(resolve));
    if (closed) break;
    const [next] = [...timers].sort((a, b) => a.at - b.at);
    assert.ok(next && next.at < 500_000, 'The driver stalled.');
    timers.delete(next);
    now = next.at;
    next.callback();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tabsCreated, 1);
  assert.deepEqual(navigations.map(n => n.url), attempts.map(() => selector));
  for (let i = 1; i < navigations.length; i++) {
    const previousReplyAt = navigations[i - 1].at + (attempts[i - 1].replyDelayMs || 0);
    assert.equal(navigations[i].at - previousReplyAt, 5_000);
  }
  if (expectedError) {
    assert.equal(processStub.exitCode, 1);
    assert.match(errors.join(' '), expectedError);
  } else {
    assert.deepEqual(errors, []);
    assert.equal(processStub.exitCode || 0, 0);
  }
  return now;
}

(async () => {
  const networkChange = { errorText: 'net::ERR_NETWORK_CHANGED' };
  const certificateError = { errorText: 'net::ERR_CERT_AUTHORITY_INVALID' };
  await check('us', [{ loads: true }]);
  await check('en', [{}], /world selector.*did not load.*about:blank/i);
  await check('us', [networkChange, { loads: true }]);
  await check('us', [...Array(5).fill(networkChange), { loads: true }]);
  const exhaustedAt = await check('us', Array(6).fill(networkChange), /attempt 6.*ERR_NETWORK_CHANGED/);
  assert.equal(exhaustedAt, 25_000);
  await check('us', [networkChange, { ...networkChange, loads: true }]);
  const slowAttempt = { ...networkChange, replyDelayMs: 113_000 };
  const timedOutAt = await check('us', [networkChange, slowAttempt], /within 120 seconds/);
  assert.equal(timedOutAt, 120_000);
  await check('us', [certificateError], /ERR_CERT_AUTHORITY_INVALID/);
  await check('us', [networkChange, certificateError], /ERR_CERT_AUTHORITY_INVALID/);
  await check('us', [{ isDownload: true }], /received a download/);
})().catch(error => { console.error(error); process.exitCode = 1; });
