# Production image derivatives

Generated from the original artwork with `npm run optimize:images` (run `npm ci` once to install Sharp). These files and their manifest are checked in so `node scripts/build-static.mjs` requires only Node built-ins. The build verifies source and output hashes before substituting derivatives and assigning content-based filenames in `dist/`. This directory and its documentation are not published directly.

- Bear atlases, prop sheets, and the index thumbnail use lossless WebP at their original dimensions. The optimizer compares every decoded RGBA byte with the original, including transparent pixels.
- Wood textures use 1024-pixel-wide WebP at quality 90. Hinoki is reduced from 2,063,523 to 65,326 bytes; mahogany, used by a scene prop, is reduced from 2,844,395 to 175,168 bytes.
- `hinoki-preview.webp` is a 96 × 64, 5,278-byte derivative embedded in the three box texture images. It uses the same colour and grain while the detailed wood loads. Normal HTTP compression handles the repeated inline data.
- The seal retains its approved crop, resized to 256 × 256 and stored as lossless WebP inside an SVG. It is 128,054 bytes instead of 3,285,487 bytes. The approved full-size source is unchanged.

The wood request is preloaded at high priority. The three bear atlases load after it. Scene-specific prop sheets load and decode before the selected performance begins; shared sheets are requested once and successful decodes are reused. Every published image, font, stylesheet, script, and font licence has a content fingerprint and a one-year immutable browser cache policy. HTML and the asset manifest have explicit revalidation policies. Imported dependencies are fingerprinted first, ensuring changes propagate through consumer filenames to HTML regardless of file-list order.

## Local measurements, September 27, 2026

Same isolated Chrome browser and local gzip server, simulated 10 Mbps download with 80 ms latency. Cold visits start without cached assets. These are controlled local measurements, not production Cloudflare timings; individual timings vary.

| Measurement | Before | After |
| --- | ---: | ---: |
| Homepage resource transfer | 3.00 MB | 0.39 MB |
| Homepage load event | 2.73 s | 0.50 s |
| Bear page initial resource transfer | 28.90 MB | 6.19 MB |
| Bear page load event | 23.39 s | 5.20 s |
| Detailed wood | Request complete at 10.32 s | Decoded and applied at 0.38 s |
| Warm bear page resource transfer | — | 300 bytes |

Transfer totals come from browser navigation and resource timings and include the main document and simulated response overhead. The optimized box also has an inline preview from its first paint. Initial bear transfer excludes props loaded upon playing a scene. The full bear and prop artwork retains its original pixels, so those assets remain larger than the wood texture.

Validation: 52 Node checks; all 102 Chrome performances; 20 pixel checks; 8 pointer checks; desktop/mobile visual review. Deployment tests enforce a 100 KiB wood budget, verify that references resolve, and reject unfingerprinted assets or conflicting cache rules. Cache-invalidation tests change images, fonts, and scripts to check that their dependent URLs update while unchanged assets retain their cached filenames.
