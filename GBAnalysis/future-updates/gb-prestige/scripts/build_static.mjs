#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC_ASSETS = [
  'assets/favicon.png', 'assets/gb-icon.png',
  'assets/planner-theme.css', 'styles.css', 'app.js',
];

function fingerprint(file, contents) {
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 12);
  const extension = path.posix.extname(file);
  const output = file.startsWith('assets/') ? file
    : file.startsWith('screenshots/') ? `assets/${file}`
      : `assets/${path.posix.basename(file)}`;
  return `${output.slice(0, -extension.length)}.${hash}${extension}`;
}

function rewritePage(source, assets) {
  return source.replace(/\b(src|href)="([^"]+)"/g, (match, attribute, reference) => {
    if (reference === '/' || /^(?:#|https?:\/\/)/.test(reference)) return match;
    const relative = reference.replace(/^\//, '');
    if (!assets[relative]) throw new Error(`Page references an unpublished asset: ${reference}`);
    return `${attribute}="${reference.startsWith('/') ? '/' : ''}${assets[relative]}"`;
  });
}

export async function buildStatic({ projectRoot = PROJECT_ROOT, outputRoot } = {}) {
  const root = path.resolve(projectRoot);
  const destination = path.resolve(outputRoot ?? path.join(root, 'dist'));
  if (destination === root || root.startsWith(`${destination}${path.sep}`)
      || (destination.startsWith(`${root}${path.sep}`) && destination !== path.join(root, 'dist'))) {
    throw new Error('Build output must be dist/ or a separate directory outside source.');
  }

  const dataset = JSON.parse(await readFile(path.join(root, 'data/guide-data.json'), 'utf8'));
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const images = [...new Set([
    ...dataset.buildings.map(building => building.screenshot),
    ...Object.values(dataset.boosts).map(boost => boost.icon),
  ])].sort();
  const assets = {}, output = new Map();
  const addAsset = (file, contents) => {
    const target = fingerprint(file, contents);
    assets[file] = target;
    output.set(target, contents);
  };

  // Publish only the runtime files and images actually referenced by the guide.
  for (const file of images) {
    if (!/^(?:screenshots|assets\/icons)\/[a-zA-Z0-9_-]+\.png$/.test(file)) {
      throw new Error(`Invalid guide image path: ${file}`);
    }
  }
  for (const file of [...STATIC_ASSETS, ...images]) {
    const source = path.join(root, file);
    if (!(await lstat(source)).isFile()) throw new Error(`Not a regular file: ${file}`);
    addAsset(file, await readFile(source));
  }

  // Image changes also change the dataset URL and the page that loads it.
  for (const building of dataset.buildings) building.screenshot = assets[building.screenshot];
  for (const boost of Object.values(dataset.boosts)) boost.icon = assets[boost.icon];
  const runtime = `window.GB_PRESTIGE_DATA = ${JSON.stringify(dataset).replaceAll('</', '<\\/')};\n`;
  addAsset('data/guide-data.js', Buffer.from(runtime));

  for (const page of ['index.html', '404.html']) {
    output.set(page, rewritePage(await readFile(path.join(root, page), 'utf8'), assets));
  }
  output.set('_headers', await readFile(path.join(root, '_headers')));
  const manifest = { schemaVersion: 1, algorithm: 'sha256', hashLength: 12, version, assets };
  output.set('asset-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  // All inputs are validated before replacing the generated directory.
  await rm(destination, { recursive: true, force: true });
  for (const [file, contents] of output) {
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildStatic();
  console.log(`Built dist with ${Object.keys(manifest.assets).length} fingerprinted resources.`);
}
