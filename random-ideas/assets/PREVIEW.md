# Bear with me index picture

`bear-with-me-preview.png` is a 1080 × 630 export of the production SVG bear and Japanese hinoki box. It replaces the older, separately maintained thumbnail illustration. The index displays it at the existing 360 × 210 aspect ratio.

To regenerate from the current artwork:

```sh
node tests/bear-with-me/browser-runner.cjs assets --preview
npm run optimize:images
node scripts/build-static.mjs
```

`scripts/bear-preview.js` sets a reproducible shy peek: the lid is slightly ajar and only the bear's ear tips appear above the front rim. The tighter composition centres the box on the collection card. It embeds the local atlases while preserving their dimensions and renders the SVG to a Chrome canvas over the card's warm paper background (`#ebe2cf`). No external artwork or image-generation service is used for this export. The original asset provenance remains in `projects/bear-with-me/assets/`.

The deployment uses a lossless WebP derivative with the same dimensions and decoded RGBA pixels, reducing the thumbnail from 410 KB to 174 KB. The PNG remains the editable source export.
