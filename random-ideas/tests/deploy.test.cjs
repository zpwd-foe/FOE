const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('deployment contains only public files and discards stale output', async t => {
  const { buildStatic } = await import('../scripts/build-static.mjs');
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'random-realm-build-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  await fs.mkdir(path.join(output, 'input'));
  await fs.writeFile(path.join(output, 'input', 'private.txt'), 'Must never be published');
  const files = await buildStatic(output);
  await assert.rejects(fs.access(path.join(output, 'input')));
  assert.ok(files.includes('404.html'));
  assert.ok(files.includes('_headers'));
  assert.ok(files.every(file => !/(^|\/)(input|previews|tests|scripts|\.git)(\/|$)|\.md$/.test(file)));
  for (const file of files) {
    assert.deepEqual(await fs.readFile(path.join(output, file)), await fs.readFile(path.join(__dirname, '..', file)), file);
  }
});

test('every local page, font, texture, and dynamically selected prop ships', async () => {
  const root = path.join(__dirname, '..');
  const files = JSON.parse(await fs.readFile(path.join(root, 'scripts/public-files.json'), 'utf8'));
  const published = new Set(files);
  const exists = (reference, base) => {
    const pathname = reference.split(/[?#]/)[0];
    if (!pathname || /^(?:[a-z]+:|\/\/|\$\{)/i.test(pathname)) return;
    let target = path.posix.normalize(pathname.startsWith('/') ? pathname.slice(1) : path.posix.join(base, pathname));
    if (target === '.' || target.endsWith('/')) target = path.posix.join(target, 'index.html');
    assert.ok(published.has(target), `Missing public dependency: ${reference} from ${base}`);
  };
  for (const file of files.filter(file => /\.(html|css)$/.test(file))) {
    const source = await fs.readFile(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']|url\(["']?([^\s)'";]+)["']?\)/g)) {
      exists(match[1] || match[2], path.posix.dirname(file));
    }
  }
  const props = await fs.readFile(path.join(root, 'projects/bear-with-me/props.js'), 'utf8');
  for (const [, image] of props.matchAll(/["']([a-z0-9-]+\.png)["']/g)) exists(`assets/${image}`, 'projects/bear-with-me');
  const app = await fs.readFile(path.join(root, 'src/app.js'), 'utf8');
  for (const [, image] of app.matchAll(/href="(assets\/[^"$]+)"/g)) exists(image, '.');
});

test('checked-in dist contains exactly the public files and matches current source', async () => {
  const root = path.join(__dirname, '..');
  const files = JSON.parse(await fs.readFile(path.join(root, 'scripts/public-files.json'), 'utf8'));
  const output = path.join(root, 'dist');
  const actual = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else actual.push(path.relative(output, file).split(path.sep).join('/'));
    }
  }
  await collect(output);
  assert.deepEqual(actual.sort(), [...files].sort());
  for (const file of files) {
    assert.deepEqual(await fs.readFile(path.join(output, file)), await fs.readFile(path.join(root, file)), `Rebuild dist: ${file}`);
  }
});
