import { copyFile, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = new URL('./public-files.json', import.meta.url);

// Explicit public files keep inputs, design drafts, tests, and tooling off the site.
export async function buildStatic(output = path.join(root, 'dist')) {
  const destination = path.resolve(output);
  if (destination === root || root.startsWith(destination + path.sep)) {
    throw new Error('The build output must not contain the source directory.');
  }
  const files = JSON.parse(await readFile(manifest, 'utf8'));
  if (new Set(files).size !== files.length) throw new Error('Duplicate public file.');
  for (const file of files) {
    if (path.isAbsolute(file) || file.split('/').some(part => !part || part === '..' || part === '.')) {
      throw new Error(`Invalid public file: ${file}`);
    }
    if (!(await lstat(path.join(root, file))).isFile()) {
      throw new Error(`Public file must be a regular file: ${file}`);
    }
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await buildStatic();
  console.log(`Built dist with ${files.length} public files.`);
}
