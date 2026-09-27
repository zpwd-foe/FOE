const test = require('node:test');
const assert = require('node:assert/strict');

test('asset changes propagate through dependent scripts and styles into fresh HTML URLs', async () => {
  const { fingerprintAssets, rewriteReferences } = await import('../scripts/build-static.mjs');
  const files = new Map(Object.entries({
    'src/app.js': 'import "./props.js";',
    'src/props.js': 'const sheet = "wood.png"; const url = `assets/${sheet}`;',
    'src/styles.css': '@import "./theme.css";',
    'src/theme.css': 'body { background: url(../assets/wood.png?v=old); } @font-face { src: url(../assets/font.woff2); }',
    'assets/wood.png': 'original wood',
    'assets/font.woff2': 'original font',
    'assets/unchanged.svg': '<svg/>',
  }).map(([file, text]) => [file, Buffer.from(text)]));
  const optimized = { 'assets/wood.png': { file: 'assets/optimized/wood.webp' } };
  const html = '<script src="src/app.js?v=old"></script><link href="src/styles.css?v=old"><img src="assets/wood.png?v=old">';
  const before = fingerprintAssets(files, optimized);
  const oldHtml = rewriteReferences(html, before.mapping);
  // The source list intentionally places consumers before their dependencies.
  assert.deepEqual(fingerprintAssets(new Map([...files].reverse()), optimized), before);
  for (const [changed, dependants] of [
    ['assets/wood.png', ['src/props.js', 'src/app.js', 'src/theme.css', 'src/styles.css']],
    ['assets/font.woff2', ['src/theme.css', 'src/styles.css']],
    ['src/props.js', ['src/app.js']],
  ]) {
    const modified = new Map(files);
    modified.set(changed, Buffer.concat([files.get(changed), Buffer.from('\n/* changed */')]));
    const after = fingerprintAssets(modified, optimized);
    const newHtml = rewriteReferences(html, after.mapping);
    assert.notEqual(newHtml, oldHtml, `HTML failed to invalidate ${changed}`);
    for (const file of files.keys()) {
      if ([changed, ...dependants].includes(file)) {
        assert.notEqual(after.mapping[file], before.mapping[file], `Stale URL: ${file}`);
        assert.ok(!newHtml.includes(before.mapping[file]), `HTML retains old URL: ${file}`);
      } else assert.equal(after.mapping[file], before.mapping[file], `Unchanged asset lost its cache: ${file}`);
    }
    for (const [file, data] of after.outputs) {
      for (const dependency of [changed, ...dependants]) {
        assert.ok(!data.toString().includes(before.mapping[dependency].split('/').pop()), `Stale dependency in ${file}`);
      }
    }
    assert.ok(after.mapping['assets/wood.png'].endsWith('.webp'));
  }
});

test('rewrites preserve URL fragments and do not corrupt similar asset names', async () => {
  const { rewriteReferences } = await import('../scripts/build-static.mjs');
  assert.equal(
    rewriteReferences('"./app.js?v=old#part" "./myapp.js" "./app.js.map"', { 'src/app.js': 'src/app.123456789abc.js' }),
    '"./app.123456789abc.js#part" "./myapp.js" "./app.js.map"'
  );
});

test('ambiguous names and circular references fail before publishing stale URLs', async () => {
  const { fingerprintAssets } = await import('../scripts/build-static.mjs');
  assert.throws(() => fingerprintAssets(new Map([
    ['src/a.js', Buffer.from('import "./b.js";')],
    ['src/b.js', Buffer.from('import "./a.js";')],
  ])), /Circular asset reference/);
  assert.throws(() => fingerprintAssets(new Map([
    ['a/same.png', Buffer.from('one')], ['b/same.png', Buffer.from('two')],
  ])), /Ambiguous asset filename/);
});
