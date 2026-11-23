'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const statusBinding = '__goeForgeHammerScheduleStatus';
const commandTimeoutMs = 20_000;
const navigationTimeoutMs = 120_000;

class ChromePipe extends EventEmitter {
  constructor(chrome) {
    super();
    this.input = chrome.stdio[3];
    this.output = chrome.stdio[4];
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = '';

    this.output.setEncoding('utf8');
    this.output.on('data', chunk => this.receive(chunk));
    this.output.on('end', () => this.disconnect(new Error('Chrome closed its automation pipe.')));
    this.output.on('error', error => this.disconnect(error));
    this.input.on('error', error => this.disconnect(error));
    chrome.on('error', error => this.disconnect(error));
  }

  receive(chunk) {
    this.buffer += chunk;
    let end;
    while ((end = this.buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end + 1);
      const reply = this.pending.get(message.id);
      if (reply) {
        this.pending.delete(message.id);
        clearTimeout(reply.timeout);
        if (message.error) reply.reject(new Error(`${reply.method}: ${message.error.message}`));
        else reply.resolve(message.result);
      } else {
        this.emit('message', message);
      }
    }
  }

  disconnect(error) {
    if (this.error) return;
    this.error = error;
    for (const { timeout, reject } of this.pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pending.clear();
    this.emit('disconnected', error);
  }

  send(method, params = {}, sessionId, timeoutMs = commandTimeoutMs) {
    if (this.error) return Promise.reject(this.error);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome did not respond to ${method}.`));
      }, timeoutMs);
      this.pending.set(id, { method, timeout, resolve, reject });
      this.input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }

  close() {
    this.disconnect(new Error('The export driver is shutting down.'));
    this.input.destroy();
    this.output.destroy();
  }
}

async function openWorldSelector(pipe, sessionId, selector, hosts) {
  let timer;
  let onFrame;
  let lastPage = 'about:blank';
  const loaded = new Promise((resolve, reject) => {
    onFrame = message => {
      if (message.sessionId !== sessionId || message.method !== 'Page.frameNavigated') return;
      const { frame } = message.params;
      if (frame.parentId) return;
      const page = new URL(frame.url || 'about:blank');
      lastPage = page.href === 'about:blank' ? 'about:blank' : (page.hostname || page.protocol);
      if (page.protocol === 'https:' && hosts.includes(page.hostname) && !frame.unreachableUrl) resolve();
    };
    pipe.on('message', onFrame);
    timer = setTimeout(() => reject(new Error(
      `The world selector at ${selector.hostname} did not load a supported page within `
      + `${navigationTimeoutMs / 1000} seconds. Last page was ${lastPage}.`,
    )), navigationTimeoutMs);
    timer.unref();
  });
  try {
    const navigation = pipe.send('Page.navigate', { url: selector.href }, sessionId, navigationTimeoutMs)
      .then(result => {
        if (result.errorText) throw new Error(`Chrome could not open the world selector (${result.errorText}).`);
        if (result.isDownload) throw new Error('Chrome received a download when opening the world selector.');
      });
    await Promise.all([navigation, loaded]);
  } finally {
    clearTimeout(timer);
    pipe.off('message', onFrame);
  }
}

async function run() {
  const [binary, dataDirectory, profile, triggerUrl] = process.argv.slice(2);
  const url = new URL(triggerUrl);
  const world = url.hostname.match(/^([a-z]{2,4})\d+\.forgeofempires\.com$/);
  if (url.protocol !== 'https:' || !world || !url.hash) {
    throw new Error('Expected a Forge of Empires world and export parameters.');
  }
  const selector = new URL(`https://${world[1]}0.forgeofempires.com/page/`);
  const hosts = [url.hostname, selector.hostname, 'www.forgeofempires.com'];
  const params = url.hash.slice(1);
  const workflow = readFileSync(join(__dirname, 'forge-hammer-treasury-exporter', 'export-treasury.js'), 'utf8');
  const source = `{
    if (window === window.top && location.protocol === 'https:' &&
        ${JSON.stringify(hosts)}.includes(location.hostname)) {
      const goeScheduledExport = {
        params: ${JSON.stringify(params)},
        report: (state, message) => ${statusBinding}(JSON.stringify({state, message})),
      };
      ${workflow}
    }
  }`;

  // The two inherited pipes belong to this Chrome process only. No debugging port is opened.
  const chrome = spawn(binary, [
    `--user-data-dir=${dataDirectory}`, `--profile-directory=${profile}`,
    '--remote-debugging-pipe', '--no-startup-window',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pipe = new ChromePipe(chrome);
  let sessionId;
  const stopped = new Promise((resolve, reject) => {
    process.stdin.once('end', resolve);
    process.stdin.resume();
    pipe.once('disconnected', reject);
    pipe.on('message', message => {
      if (message.sessionId !== sessionId || message.method !== 'Runtime.bindingCalled' ||
          message.params.name !== statusBinding) return;
      const status = JSON.parse(message.params.payload);
      if (status.state === 'error') reject(new Error(status.message));
    });
  });
  const navigate = async () => {
    const { targetId } = await pipe.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId } = await pipe.send('Target.attachToTarget', { targetId, flatten: true }));
    await pipe.send('Page.enable', {}, sessionId);
    await pipe.send('Runtime.enable', {}, sessionId);
    await pipe.send('Runtime.addBinding', { name: statusBinding }, sessionId);
    await pipe.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
    await openWorldSelector(pipe, sessionId, selector, hosts);
  };

  try {
    await Promise.race([navigate(), stopped]);
    await stopped;
  } finally {
    // Closing Chrome's private DevTools pipe also closes the automation instance.
    pipe.close();
    process.stdin.destroy();
    chrome.unref();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
