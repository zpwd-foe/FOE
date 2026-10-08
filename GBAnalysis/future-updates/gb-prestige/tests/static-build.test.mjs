import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { buildStatic } from '../scripts/build_static.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const read = (file, root = DIST) => readFile(path.join(root, file), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);

async function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(file, base));
    else files.push(path.relative(base, file).split(path.sep).join('/'));
  }
  return files.sort();
}

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gb-prestige-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function runtimeData(script) {
  const context = vm.createContext({ window: {} });
  vm.runInContext(script, context);
  return JSON.parse(JSON.stringify(context.window.GB_PRESTIGE_DATA));
}

test('deployment is reproducible and publishes only runtime files', async t => {
  const fresh = await temporary(t);
  await writeFile(path.join(fresh, 'stale-private.txt'), 'Must not survive a rebuild');
  const manifest = await buildStatic({ outputRoot: fresh });
  const expected = ['index.html', '404.html', '_headers', 'asset-manifest.json', ...Object.values(manifest.assets)].sort();
  assert.deepEqual(await listFiles(fresh), expected);
  assert.deepEqual(await listFiles(DIST), expected);
  assert.equal(manifest.version, '1.0.0');
  for (const file of expected) {
    assert.deepEqual(await readFile(path.join(fresh, file)), await readFile(path.join(DIST, file)), `Rebuild dist: ${file}`);
  }
  assert.ok(expected.every(file => !/(?:^|\/)(?:input|scripts|tests|data|node_modules)\/|\.(?:py|md|txt)$/.test(file)));
  await assert.rejects(buildStatic({ outputRoot: ROOT }), /outside source/);
});

test('all assets have correct hashes, cache policies and resolvable page references', async () => {
  const manifest = JSON.parse(await read('asset-manifest.json'));
  const files = new Set(await listFiles(DIST));
  for (const file of Object.values(manifest.assets)) {
    assert.match(file, new RegExp(`\\.${digest(await readFile(path.join(DIST, file)))}\\.[^.]+$`));
    assert.ok(file.startsWith('assets/'));
  }
  for (const page of ['index.html', '404.html']) {
    const html = await read(page);
    for (const [, reference] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      if (reference === '/' || /^(?:#|https?:\/\/)/.test(reference)) continue;
      assert.ok(files.has(reference.replace(/^\//, '')), `Missing ${reference} from ${page}`);
    }
    assert.doesNotMatch(html, /Download boost data|data\/guide-data\.json/i);
  }
  const headers = await read('_headers');
  const rules = [...headers.matchAll(/^(\/[^\n]*)\n\s+Cache-Control: ([^\n]+)/gm)];
  const policy = file => rules.filter(([, pattern]) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*')}$`).test(`/${file}`)).map(([, , value]) => value);
  for (const file of Object.values(manifest.assets)) assert.deepEqual(policy(file), ['public, max-age=31536000, immutable']);
  for (const file of ['', 'index.html', '404', '404.html', 'asset-manifest.json']) assert.deepEqual(policy(file), ['no-cache']);
});

test('packaged data preserves all 49 buildings and points to exact source images', async () => {
  const manifest = JSON.parse(await read('asset-manifest.json'));
  const built = runtimeData(await read(manifest.assets['data/guide-data.js']));
  const source = JSON.parse(await read('data/guide-data.json', ROOT));
  assert.deepEqual(runtimeData(await read('data/guide-data.js', ROOT)), source);
  const expected = structuredClone(source);
  for (const building of expected.buildings) building.screenshot = manifest.assets[building.screenshot];
  for (const boost of Object.values(expected.boosts)) boost.icon = manifest.assets[boost.icon];
  assert.deepEqual(built, expected);
  for (const [sourceFile, publicFile] of Object.entries(manifest.assets).filter(([file]) => file.endsWith('.png'))) {
    assert.deepEqual(await readFile(path.join(DIST, publicFile)), await readFile(path.join(ROOT, sourceFile)));
  }
});

test('changing an icon updates its URL, dependent data and the entry page', async t => {
  const fixture = path.join(await temporary(t), 'project');
  await cp(ROOT, fixture, { recursive: true, filter: file => !['dist', 'node_modules', '__pycache__'].includes(path.basename(file)) });
  const before = await buildStatic({ projectRoot: fixture });
  const beforePage = await read('dist/index.html', fixture);
  const icon = Object.keys(before.assets).find(file => file.startsWith('assets/icons/'));
  const changed = Buffer.concat([await readFile(path.join(fixture, icon)), Buffer.from('changed')]);
  await writeFile(path.join(fixture, icon), changed);
  const after = await buildStatic({ projectRoot: fixture });
  assert.notEqual(after.assets[icon], before.assets[icon]);
  assert.notEqual(after.assets['data/guide-data.js'], before.assets['data/guide-data.js']);
  assert.notEqual(await read('dist/index.html', fixture), beforePage);
  assert.equal(after.assets['app.js'], before.assets['app.js']);
  assert.ok(!(await listFiles(path.join(fixture, 'dist'))).includes(before.assets[icon]));
});
