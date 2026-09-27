import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const hash = data => createHash('sha256').update(data).digest('hex');
const fingerprint = (file, data) => file.replace(/(\.[^.]+)$/, `.${hash(data).slice(0, 12)}$1`);
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const referencePattern = file => new RegExp(`(?<![\\w.-])${escapeRegex(path.posix.basename(file))}(?:\\?v=[^"'\\s<>#)]*)?(?=$|[^\\w.-])`, 'g');

export function rewriteReferences(source, mapping) {
  for (const [from, to] of Object.entries(mapping)) {
    source = source.replace(referencePattern(from), path.posix.basename(to));
  }
  return source;
}

export function fingerprintAssets(contents, optimized = {}) {
  const files = [...contents.keys()].filter(file => !file.endsWith('.html') && file !== '_headers').sort();
  const names = new Set(), mapping = {}, outputs = new Map(), visiting = new Set();
  // Bare filenames also appear in the dynamically assembled sprite URLs.
  // Reject ambiguous names instead of silently rewriting the wrong asset.
  for (const file of files) {
    const name = path.posix.basename(file);
    if (names.has(name)) throw new Error(`Ambiguous asset filename: ${name}`);
    names.add(name);
  }
  function visit(file) {
    if (mapping[file]) return;
    if (visiting.has(file)) throw new Error(`Circular asset reference: ${[...visiting, file].join(' -> ')}`);
    visiting.add(file);
    let data = contents.get(file);
    if (/\.(css|js|svg|json)$/.test(file)) {
      const source = data.toString();
      const dependencies = files.filter(other => referencePattern(other).test(source));
      for (const dependency of dependencies) visit(dependency);
      data = Buffer.from(rewriteReferences(source, mapping));
    }
    const target = optimized[file]?.file.endsWith('.webp') ? file.replace(/\.png$/, '.webp') : file;
    mapping[file] = fingerprint(target, data);
    outputs.set(mapping[file], data);
    visiting.delete(file);
  }
  for (const file of files) visit(file);
  return { mapping, outputs };
}

// No image library is required in Cloudflare: optimized derivatives are checked in.
export async function buildStatic(output = path.join(root, 'dist')) {
  const destination = path.resolve(output);
  if (destination === root || root.startsWith(destination + path.sep)) throw new Error('Build output must not contain source.');
  const files = JSON.parse(await readFile(path.join(root, 'scripts/public-files.json'), 'utf8'));
  const optimized = JSON.parse(await readFile(path.join(root, 'assets/optimized/manifest.json'), 'utf8'));
  const contents = new Map();
  if (new Set(files).size !== files.length) throw new Error('Duplicate public file.');
  for (const file of files) {
    if (path.isAbsolute(file) || file.split('/').some(part => !part || part === '..' || part === '.')) throw new Error(`Invalid public file: ${file}`);
    if (!(await lstat(path.join(root, file))).isFile()) throw new Error(`Not a regular file: ${file}`);
    let data = await readFile(path.join(root, file));
    if (optimized[file]) {
      const entry = optimized[file];
      if (hash(data) !== entry.sourceHash) throw new Error(`Run npm run optimize:images after changing ${file}`);
      data = await readFile(path.join(root, entry.file));
      if (hash(data) !== entry.outputHash) throw new Error(`Corrupt optimized image: ${entry.file}`);
    }
    contents.set(file, data);
  }
  // Hash dependencies first, regardless of the publication list's order.
  const { mapping, outputs } = fingerprintAssets(contents, optimized);
  const wood = mapping['projects/bear-with-me/assets/hinoki-grain-v1.png'];
  const preview = await readFile(path.join(root, 'assets/optimized/hinoki-preview.webp'));
  for (const file of files.filter(file => file.endsWith('.html'))) {
    let html = rewriteReferences(contents.get(file).toString(), mapping);
    if (file === 'projects/bear-with-me/index.html') {
      html = html.replace(/<image\b[^>]*>/g, tag => {
        const reference = `assets/${path.posix.basename(wood)}`;
        return tag.replace(`href="${reference}"`, `href="data:image/webp;base64,${preview.toString('base64')}" data-full-texture="${reference}"`);
      });
    }
    outputs.set(file, Buffer.from(html));
  }
  outputs.set('_headers', contents.get('_headers'));
  outputs.set('asset-manifest.json', Buffer.from(JSON.stringify(mapping, null, 2) + '\n'));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [file, data] of outputs) {
    await mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    await writeFile(path.join(destination, file), data);
  }
  return [...outputs.keys()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Built dist with ${(await buildStatic()).length} public files.`);
}
