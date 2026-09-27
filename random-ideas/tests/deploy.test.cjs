const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');

async function list(directory, base = directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await list(file, base));
    else files.push(path.relative(base, file).split(path.sep).join('/'));
  }
  return files.sort();
}

test('deployment excludes private inputs and stale output and matches a fresh build', async t => {
  const { buildStatic } = await import('../scripts/build-static.mjs');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'random-realm-build-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await fs.mkdir(path.join(temporary, 'input'));
  await fs.writeFile(path.join(temporary, 'input', 'private.txt'), 'Must never be published');
  const files = await buildStatic(temporary);
  assert.ok(files.includes('404.html'));
  assert.ok(files.includes('_headers'));
  assert.ok(files.every(file => !/(^|\/)(input|previews|tests|scripts|\.git)(\/|$)|\.md$/.test(file)));
  assert.deepEqual(await list(temporary), [...files].sort());
  assert.deepEqual(await list(output), [...files].sort());
  for (const file of files) assert.deepEqual(await fs.readFile(path.join(output, file)), await fs.readFile(path.join(temporary, file)), `Rebuild dist: ${file}`);
});

test('all rewritten page, font, texture and dynamically selected prop references resolve', async () => {
  const published = new Set(await list(output));
  const exists = (reference, base) => {
    const pathname = reference.split(/[?#]/)[0];
    if (!pathname || /^(?:[a-z]+:|\/\/|\$\{)/i.test(pathname)) return;
    let target = path.posix.normalize(pathname.startsWith('/') ? pathname.slice(1) : path.posix.join(base, pathname));
    if (target === '.' || target.endsWith('/')) target = path.posix.join(target, 'index.html');
    assert.ok(published.has(target), `Missing public dependency: ${reference} from ${base}`);
  };
  for (const file of [...published].filter(file => /\.(html|css)$/.test(file))) {
    const source = await fs.readFile(path.join(output, file), 'utf8');
    for (const match of source.matchAll(/(?:src|href|data-full-texture)=["']([^"']+)["']|url\(["']?([^\s)'";]+)["']?\)/g)) exists(match[1] || match[2], path.posix.dirname(file));
  }
  const mapping = JSON.parse(await fs.readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
  const props = await fs.readFile(path.join(output, mapping['projects/bear-with-me/props.js']), 'utf8');
  for (const [, image] of props.matchAll(/["']([a-z0-9.-]+\.(?:png|webp))["']/g)) exists(`assets/${image}`, 'projects/bear-with-me');
  const app = await fs.readFile(path.join(output, mapping['src/app.js']), 'utf8');
  for (const [, image] of app.matchAll(/href="(assets\/[^"$]+)"/g)) exists(image, '.');
});

test('long-lived URLs are content-fingerprinted and the wood paints from an inline preview', async () => {
  const mapping = JSON.parse(await fs.readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
  const published = await list(output);
  const stable = published.filter(file => file.endsWith('.html') || ['_headers', 'asset-manifest.json'].includes(file));
  assert.deepEqual(published.filter(file => !stable.includes(file)), Object.values(mapping).sort(), 'Every published asset must be fingerprinted');
  for (const file of Object.values(mapping)) {
    const digest = createHash('sha256').update(await fs.readFile(path.join(output, file))).digest('hex').slice(0, 12);
    assert.ok(file.includes(`.${digest}.`), `Stale fingerprint: ${file}`);
  }
  const wood = mapping['projects/bear-with-me/assets/hinoki-grain-v1.png'];
  assert.ok((await fs.stat(path.join(output, wood))).size < 100 * 1024, 'Wood texture exceeded 100 KiB');
  assert.ok((await fs.stat(path.join(output, mapping['assets/zpwd-seal.svg']))).size < 150 * 1024, 'Seal exceeded 150 KiB');
  const html = await fs.readFile(path.join(output, 'projects/bear-with-me/index.html'), 'utf8');
  assert.equal([...html.matchAll(/<image[^>]+href="data:image\/webp;base64,[^"]+" data-full-texture=/g)].length, 3);
  assert.match(html, /rel="preload"[^>]+as="image" fetchpriority="high"/);
  assert.equal([...html.matchAll(/data-bear-src=/g)].length, 7);
  const headers = await fs.readFile(path.join(output, '_headers'), 'utf8');
  const rules = [...headers.matchAll(/^(\/[^\n]*)\n\s+Cache-Control: ([^\n]+)/gm)];
  const policies = file => rules.filter(([, pattern]) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*')}$`).test(`/${file}`)).map(([, , policy]) => policy);
  for (const file of Object.values(mapping)) assert.deepEqual(policies(file), ['public, max-age=31536000, immutable'], `Invalid asset cache policy: ${file}`);
  for (const file of ['', '404', 'projects/bear-with-me/', ...stable.filter(file => file !== '_headers')]) {
    assert.deepEqual(policies(file), ['public, max-age=0, must-revalidate'], `Stable URL must revalidate without conflicting cache rules: ${file}`);
  }
  // Include all text assets: this catches references inside JS, SVG, and JSON too.
  for (const file of published.filter(file => /\.(html|css|js|svg)$/.test(file))) {
    const source = await fs.readFile(path.join(output, file), 'utf8');
    for (const original of Object.keys(mapping)) {
      const name = path.posix.basename(original).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.doesNotMatch(source, new RegExp(`(?<![\\w.-])${name}(?=$|[^\\w.-])`), `Unfingerprinted reference to ${original} in ${file}`);
    }
    assert.doesNotMatch(source, /\?v=/, `Manual version strings remain in ${file}`);
  }
});
