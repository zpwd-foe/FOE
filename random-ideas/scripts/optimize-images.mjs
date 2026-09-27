import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const files = JSON.parse(await readFile(new URL('./public-files.json', import.meta.url), 'utf8'));
const result = {};
const output = path.join(root, 'assets/optimized');
await mkdir(output, { recursive: true });

for (const file of files.filter(file => file.endsWith('.png'))) {
  const source = await readFile(path.join(root, file));
  const woodTexture = /-grain-v1\.png$/.test(file);
  const encoded = woodTexture
    ? await sharp(source).resize({ width: 1024 }).webp({ quality: 90, effort: 6 }).toBuffer()
    : await sharp(source).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
  const before = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!woodTexture && (before.info.width !== after.info.width || before.info.height !== after.info.height || !before.data.equals(after.data))) {
    throw new Error(`Lossless pixel verification failed: ${file}`);
  }
  const optimized = `assets/optimized/${path.basename(file, '.png')}.webp`;
  await writeFile(path.join(root, optimized), encoded);
  result[file] = { file: optimized, sourceHash: hash(source), outputHash: hash(encoded), sourceBytes: source.length, bytes: encoded.length, pixels: woodTexture ? '1024px wood texture, quality 90' : 'identical' };
  console.log(`${file}: ${source.length} → ${encoded.length} bytes; ${result[file].pixels}`);
}

// Same approved crop, sized at 4x the largest 64px header display.
const sealSource = await readFile(path.join(root, 'assets/zpwd-seal-approved.png'));
const seal = await sharp(sealSource).extract({ left: 191, top: 170, width: 880, height: 880 }).resize(256, 256).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="128" height="128"><image width="256" height="256" href="data:image/webp;base64,${seal.toString('base64')}"/></svg>\n`);
await writeFile(path.join(output, 'zpwd-seal.svg'), svg);
const originalSeal = await readFile(path.join(root, 'assets/zpwd-seal.svg'));
result['assets/zpwd-seal.svg'] = { file: 'assets/optimized/zpwd-seal.svg', sourceHash: hash(originalSeal), outputHash: hash(svg), sourceBytes: originalSeal.length, bytes: svg.length, approvedSourceHash: hash(sealSource) };

// This tiny same-texture preview paints with the HTML while the full wood loads.
const wood = await sharp(path.join(root, 'projects/bear-with-me/assets/hinoki-grain-v1.png')).resize(96, 64).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
await writeFile(path.join(output, 'hinoki-preview.webp'), wood);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Seal: ${originalSeal.length} → ${svg.length} bytes; inline wood preview: ${wood.length} bytes.`);
