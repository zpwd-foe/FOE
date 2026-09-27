/* Photographic miniatures; crop coordinates reference the untouched PNG atlases. */
(() => {
  "use strict";
  const atlas = {
    "book": ["props-everyday-v1.png",86,43,408,291],
    "cookie": ["chocolate-cookie-v1.png",288,48,960,928],
    "flower": ["props-everyday-v1.png",1189,15,189,327],
    "cloth": ["props-everyday-v1.png",80,375,389,289],
    "ruler": ["props-everyday-v1.png",532,467,473,83],
    "clipboard": ["props-everyday-v1.png",1170,343,232,319],
    "stamp": ["props-everyday-v1.png",110,678,326,309],
    "stool": ["props-everyday-v1.png",607,678,324,323],
    "stopwatch": ["props-everyday-v1.png",1157,665,252,338],
    "curtain": ["props-theatre-v1.png",65,13,455,323],
    "cover": ["props-theatre-v1.png",554,41,429,291],
    "paper": ["props-theatre-v1.png",1051,84,411,198],
    "periscope": ["props-theatre-v1.png",185,343,204,303],
    "blocks": ["props-theatre-v1.png",589,362,320,287],
    "rope": ["props-theatre-v1.png",1062,393,383,239],
    "spoon": ["props-theatre-v1.png",231,660,83,337],
    "hat": ["props-theatre-v1.png",573,679,385,310],
    "flag": ["props-theatre-v1.png",1172,660,250,334],
    "album": ["props-keepsakes-v1.png",39,45,490,286],
    "chair": ["props-keepsakes-v1.png",641,11,236,343],
    "cushion": ["props-keepsakes-v1.png",1036,64,456,271],
    "heart": ["props-keepsakes-v1.png",117,386,300,269],
    "scroll": ["props-keepsakes-v1.png",617,359,293,307],
    "glasses": ["glasses-open-v1.png",0,0,1536,1024],
    "headband": ["props-keepsakes-v1.png",47,725,517,237],
    "disguise": ["props-keepsakes-v1.png",585,693,375,286],
    "moustache": ["props-keepsakes-v1.png",1068,783,426,130],
    "nightcap": ["props-costumes-v2.png",28,284,520,328],
    "blanket": ["props-costumes-v2.png",535,232,459,513],
    "cape": ["props-costumes-v2.png",997,231,535,464],
  };
  const sheets = [...new Set(Object.values(atlas).map(([file]) => file))];
  const escapeText = value => String(value).replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
  function sprite(name, x, y, width, height) {
    const [file, ...crop] = atlas[name];
    const clip = name === "blanket" ? ' clip-path="url(#blanket-atlas-clip)"' : "";
    return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${crop.join(" ")}" preserveAspectRatio="none" overflow="hidden"><image href="assets/${file}" width="1536" height="1024" filter="url(#solid-material)"${clip}/></svg>`;
  }
  function paper(label, width = 102) {
    const fontSize = Math.min(20, width * .78 / (label.length * .62));
    return `${sprite("paper", -width / 2, -25, width, 50)}<text y="${fontSize * .34}" text-anchor="middle" fill="#443b2c" font-family="monospace" font-size="${fontSize.toFixed(1)}" font-weight="600" letter-spacing=".15">${escapeText(label)}</text>`;
  }
  const bounds = {
    book: [-49, -36, 98, 72], cookie: [-24, -23.2, 48, 46.4], flower: [-24, -40, 48, 78],
    cloth: [-33, -25, 66, 50], ruler: [-63, -10, 126, 22], clipboard: [-31, -43, 62, 84],
    stamp: [-26, -27, 52, 49], stool: [-35, -15, 70, 62], stopwatch: [-24, -35, 48, 65],
    curtain: [-88, -66, 176, 140], cover: [-47, -25, 94, 64], periscope: [-17, -38, 51, 81],
    blocks: [-43, -29, 84, 74], rope: [-39, -47, 78, 83], spoon: [-14, -49, 28, 104],
    hat: [-45, -46, 90, 76], flag: [-24, -61, 67, 124], album: [-49, -34, 98, 69],
    chair: [-32, -45, 64, 92], cushion: [-46, -25, 92, 54], heart: [-36, -33, 72, 64], scroll: [-39, -50, 78, 100]
  };
  const art = Object.fromEntries(Object.entries(bounds).map(([name, box]) => [name, sprite(name, ...box)]));
  // The reader is behind the book: we see the two exterior cloth covers.
  // Keep the front-facing album for the later moment when it is shown to us.
  const bookBack = `<defs>
    <linearGradient id="book-cover-light"><stop stop-color="#788163"/><stop offset=".43" stop-color="#58624c"/><stop offset=".5" stop-color="#333e30"/><stop offset=".58" stop-color="#687259"/><stop offset="1" stop-color="#899073"/></linearGradient>
    <pattern id="book-linen" width="1.3" height="1.3" patternUnits="userSpaceOnUse"><path d="M0 .3H1.3M.3 0V1.3" stroke="#d9d5b7" stroke-width=".22" opacity=".22"/><path d="M0 1H1.3M1 0V1.3" stroke="#263728" stroke-width=".2" opacity=".25"/></pattern>
    </defs>
    <path d="M-47-31-2-21 46-33 49 25 2 37-47 27Z" fill="#303c2b" stroke="#34402e" stroke-width="1"/>
    <path d="M-44-31-2-23 43-34 44-29-2-18-44-27Z" fill="#e4d7b5"/>
    <path d="M-43-29-2-21 42-32M-42-27-2-19 42-30" fill="none" stroke="#b4a68b" stroke-width=".5"/>
    <path d="M-46-27-2-18 46-30 47 24 2 35-45 25Z" fill="url(#book-cover-light)"/>
    <path d="M-46-27-2-18 46-30 47 24 2 35-45 25Z" fill="url(#book-linen)"/>
    <path d="M-43-24-5-16-3 31-42 22ZM3-16 43-27 44 21 6 31Z" fill="none" stroke="#a4aa8c" stroke-width=".6" opacity=".65"/>
    <path d="M-2-18 2 35" stroke="#2f392b" stroke-width="3.2"/><path d="M0-18 4 34" stroke="#879071" stroke-width=".7"/>
    <path d="m-1-9 4-.7m-3 8 4-.7m-2 17 4-.7m-3 8 4-.7" stroke="#bbb08a" stroke-width=".65" opacity=".65"/>`;
  art.book = bookBack;
  art["album-back"] = bookBack;
  art.cape = sprite("cape", -55, -35, 110, 74);
  Object.assign(art, {
    sign: paper("DO NOT DISTURB", 134), denied: paper("UNNECESSARY", 116),
    retired: paper("RETIRED", 105), why: paper("WHY.", 65),
    screen: `<path d="M-38 19h7v25h-7Zm69 0h7v25h-7Z" fill="url(#mahogany-end)" stroke="#533029" stroke-width=".7"/>${paper("OFF", 105)}`,
    sparkle: `<circle r="18" fill="url(#prop-glint)"/><path d="M0-19 1.6-2 14 0 1.6 2 0 19-1.6 2-14 0-1.6-2Z" fill="#fff6d4"/><circle r="2.7" fill="white"/>`
  });
  const headwear = {
    hat: sprite("hat", 335, 101, 144, 120),
    // Lens centres remain over the eyes; unfolded temples splay to the sides.
    glasses: sprite("glasses", 309.5, 161.3, 193.5, 129),
    headband: sprite("headband", 311, 174, 244, 94),
    disguise: sprite("disguise", 324, 103, 166, 111) + sprite("moustache", 380, 256, 54, 17),
    nightcap: sprite("nightcap", 318, 111, 232, 100)
  };
  const outfits = {
    blanket: sprite("blanket", 327, 277, 160, 120),
    cape: sprite("cape", 320, 275, 174, 125)
  };
  function preload() {
    // Decode before a performance starts, so an object's first appearance is complete.
    return Promise.allSettled([...sheets, "plush-atlas-v2.png", "plush-atlas-v3.png", "plush-head-fur-v1.png", "hinoki-grain-v1.png"].map(file => {
      const image = new Image();
      image.src = `assets/${file}`;
      return image.decode();
    }));
  }
  window.BearArtwork = { art, headwear, outfits, sheets, preload };
})();
