#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

function dashboardVersion(projectRoot) {
  try {
    const packageManifest = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    if (!/^\d+\.\d+\.\d+$/.test(packageManifest.version)) {
      throw new Error("Dashboard version must use semantic versioning");
    }
    return packageManifest.version;
  } catch {
    return "1.0.0";
  }
}

function fingerprint(contents) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 12);
}

function fingerprintedName(sourceName, contents) {
  const extension = path.extname(sourceName);
  const basename = path.basename(sourceName, extension);
  return `${basename}.${fingerprint(contents)}${extension}`;
}

function replaceExactlyOnce(source, search, replacement, sourceName) {
  const first = source.indexOf(search);
  const last = source.lastIndexOf(search);
  if (first < 0 || first !== last) {
    throw new Error(`Expected exactly one ${JSON.stringify(search)} in ${sourceName}`);
  }
  return source.replace(search, replacement);
}

export async function buildStatic({ projectRoot = PROJECT_ROOT, outputRoot } = {}) {
  const destination = outputRoot ?? path.join(projectRoot, "dist");
  const assetsDestination = path.join(destination, "assets");

  const [indexSource, stylesSource, appSource, coreSource, datasetSource, benefitSource, iconSource, faviconSource] = await Promise.all([
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "assets/styles.css")),
    readFile(path.join(projectRoot, "src/app.js"), "utf8"),
    readFile(path.join(projectRoot, "src/core.js")),
    readFile(path.join(projectRoot, "data/gb-analysis.json")),
    readFile(path.join(projectRoot, "data/gb-benefits-source.json")),
    readFile(path.join(projectRoot, "assets/gb-icon.png")),
    readFile(path.join(projectRoot, "assets/favicon.png")),
  ]);

  const stylesName = fingerprintedName("styles.css", stylesSource);
  const coreName = fingerprintedName("core.js", coreSource);
  const datasetName = fingerprintedName("gb-analysis.json", datasetSource);
  const benefitName = fingerprintedName("gb-benefits-source.json", benefitSource);
  const iconName = fingerprintedName("gb-icon.png", iconSource);
  const faviconName = fingerprintedName("favicon.png", faviconSource);

  let builtApp = replaceExactlyOnce(
    appSource,
    'from "./core.js"',
    `from "./${coreName}"`,
    "src/app.js",
  );
  builtApp = replaceExactlyOnce(
    builtApp,
    'fetch("data/gb-analysis.json")',
    `fetch("assets/${datasetName}")`,
    "src/app.js",
  );
  builtApp = replaceExactlyOnce(
    builtApp,
    'fetch("data/gb-benefits-source.json")',
    `fetch("assets/${benefitName}")`,
    "src/app.js",
  );
  const appName = fingerprintedName("app.js", builtApp);

  let builtIndex = replaceExactlyOnce(
    indexSource,
    'href="assets/styles.css"',
    `href="assets/${stylesName}"`,
    "index.html",
  );
  builtIndex = replaceExactlyOnce(
    builtIndex,
    'src="src/app.js"',
    `src="assets/${appName}"`,
    "index.html",
  );
  const version = dashboardVersion(projectRoot);
  builtIndex = replaceExactlyOnce(builtIndex, 'src="assets/gb-icon.png"', `src="assets/${iconName}"`, "index.html");
  builtIndex = replaceExactlyOnce(builtIndex, 'href="assets/favicon.png"', `href="assets/${faviconName}"`, "index.html");
  builtIndex = replaceExactlyOnce(
    builtIndex,
    "Dashboard v0.0.0-dev",
    `Dashboard v${version}`,
    "index.html",
  );

  const manifest = {
    schemaVersion: 1,
    algorithm: "sha256",
    hashLength: 12,
    version,
    assets: {
      "assets/styles.css": `assets/${stylesName}`,
      "src/app.js": `assets/${appName}`,
      "src/core.js": `assets/${coreName}`,
      "data/gb-analysis.json": `assets/${datasetName}`,
      "data/gb-benefits-source.json": `assets/${benefitName}`,
      "assets/gb-icon.png": `assets/${iconName}`,
      "assets/favicon.png": `assets/${faviconName}`,
    },
  };

  await rm(destination, { recursive: true, force: true });
  await mkdir(assetsDestination, { recursive: true });
  await Promise.all([
    writeFile(path.join(destination, "index.html"), builtIndex),
    writeFile(path.join(destination, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(assetsDestination, stylesName), stylesSource),
    writeFile(path.join(assetsDestination, appName), builtApp),
    writeFile(path.join(assetsDestination, coreName), coreSource),
    writeFile(path.join(assetsDestination, datasetName), datasetSource),
    writeFile(path.join(assetsDestination, benefitName), benefitSource),
    writeFile(path.join(assetsDestination, iconName), iconSource),
    writeFile(path.join(assetsDestination, faviconName), faviconSource),
  ]);

  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await buildStatic();
  console.log(`Built dist with ${Object.keys(manifest.assets).length} fingerprinted resources.`);
}
