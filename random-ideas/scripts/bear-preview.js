/* Run in Chrome through browser-runner.cjs --preview. Exports the actual rig. */
(async () => {
  const machine = window.bearMachine, r = machine.renderer;
  await r.assetsReady;
  machine.cancelIdle();
  machine.busy = true;
  r.reset();
  // A shy peek for the collection card: the forehead and paws stay below
  // the front rim, leaving only the tips of the original small ears visible.
  Object.assign(r.state, { lid: .2, rise: 180 });
  r.switch(false);
  r.render();
  document.getElementById('invitation').setAttribute('opacity', '0');

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('machine-art').cloneNode(true);
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', '200 242.5 450 262.5');
  svg.setAttribute('width', '1080');
  svg.setAttribute('height', '630');
  svg.removeAttribute('id');

  // Standalone SVG images cannot fetch their own PNGs. Embed one copy of
  // each source atlas and reuse it, preserving all production masks/filters.
  const sources = new Map(), defs = svg.querySelector('defs');
  for (const image of [...svg.querySelectorAll('image')]) {
    const href = image.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('data:')) continue;
    const key = [href, image.getAttribute('width'), image.getAttribute('height'), image.getAttribute('preserveAspectRatio')].join('|');
    if (!sources.has(key)) {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`Missing preview texture: ${href}`);
      const blob = await response.blob();
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const asset = document.createElementNS(NS, 'image');
      asset.id = `preview-asset-${sources.size}`;
      asset.setAttribute('href', data);
      asset.setAttribute('width', image.getAttribute('width'));
      asset.setAttribute('height', image.getAttribute('height'));
      asset.setAttribute('preserveAspectRatio', image.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
      defs.append(asset);
      sources.set(key, asset.id);
    }
    const use = document.createElementNS(NS, 'use');
    for (const attribute of image.attributes) if (attribute.name !== 'href') use.setAttribute(attribute.name, attribute.value);
    use.setAttribute('href', '#' + sources.get(key));
    image.replaceWith(use);
  }

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ebe2cf';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
})();
