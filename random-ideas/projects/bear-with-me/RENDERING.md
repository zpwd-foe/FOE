# Rendering audit — September 26, 2026

The audit runs all 48 production performances, then the return after retirement and the accepted cookie/handshake branches, in both normal and reduced motion: 102 performances. Normal motion uses the real interpolation and reaching arcs with deterministic 50 ms animation frames. Audio and storage are disabled for the audit; pauses are shortened. The runner records poses and prop transfers and generates three visual checkpoints for every scene.

## Fixes and regression coverage

| Defect | Correction | Regression |
| --- | --- | --- |
| The foreground head hid inside paws and props during stowing. | Inside hands and held props now paint above the head, retaining the opening clip. | Chrome compares paw and paper pixels with/without the head. |
| A low peek painted fur over the brass switch. | The exposed head stays behind the hardware. | Chrome compares switch pixels during a low peek. |
| A fixed horizontal clip sliced forward paws and cloth at y=353. | Front hands use arm emergence geometry instead of a blanket group clip. | Chrome requires visible paw/cloth pixels below the old boundary. |
| Crossed arms changed paint order according to which arm moved first; a sleeve could cover the opposite paw. | Both sleeves paint before both paws, in a stable left/right order. | Chrome compares identical poses reached in opposite orders and checks a crossed paw pad. |
| The chair, cushion and cape covered the belly. | Placed furniture and the cape have rear layers. Handheld furniture retains hand depth. | Node tests depth routing; Chrome checks belly pixels with and without furniture/cape. |
| Near-opaque atlas interiors exposed the layers behind paws and props. | `solid-material` normalizes source alpha by 1.04, clamping interiors to opaque while preserving transparent holes and a soft fringe. Original PNGs are unchanged. | Chrome checks paw pads and paper, food, fabric and furniture interiors for alpha 255. |
| A low-reaching sleeve could appear over the wooden front from its submerged shoulder. | The arm emergence clip exposes only the portion reaching through the rim. | Chrome requires the submerged shoulder region to remain transparent. Separate tests check opaque exposed forearm material. |
| Returning a paw at low emergence could leave it in front while it descended through the box. | Returning paws clear the rim and switch inside before descending. Explicit box-front placement remains possible. | Node checks clearance, depth and descent order, including both hands and a leaning body. |
| Props jumped when transferred between a hand, the opening and the front of the box (scenes 24, 36 and 50). | Anchor conversion uses actual clamped hand positions and inverts the box-front projection. | 192 Node transfer round trips; Chrome checks the screen position of every actual scene transfer. |
| Tall hats and the nightcap could remain visible as the lid closed. | Fully hidden poses retreat to rise=260 before closing. | Chrome compares all five head costumes at the nearly closed pose; every performance must finish concealed. |
| Scene 29 left an unsupported curtain hanging in space. | The curtain stays attached to the left paw throughout the reveal. | Choreography test requires hand support until stowing. |
| Scene 34 raised the entire periscope above the opening. | A longer shaft remains partly inside the box during both inspection poses. | Geometry test checks the lens above and shaft below the rim. |
| Scene 38 dropped the hat beyond the intended stage. | The hat lands beside the box within the scene area. | Contact sheet visual review. |

Existing regressions also protect the muzzle from the animated eye stack, exclude neighbouring atlas fragments from the head, and check opaque folded/extended forearms. Source texture dimensions and aspect ratios are preserved when embedding them for pixel tests; differently sized uses of the wood image must not share a fixed-size image definition.

## Paint order

From back to front:

1. Opening-clipped cape, shoulder roots, placed furniture and torso.
2. Wooden box front and side walls.
3. Head with its own front-rim reveal clip, allowing sideways leans above the walls.
4. Opening-clipped inside sleeves, then inside paws and held props.
5. Switch and indicator hardware.
6. Exposed sleeves, then exposed paws and their held props.
7. Props placed on the front of the box or dropped outside it.

Arms keep opaque fabric beneath the fur mesh. The shoulder attachment fade must never fade a forearm folded back across it. A head costume follows the head; a cape follows the body behind the torso. Objects transfer layers without changing their rendered position.

## Running the checks

From the repository root:

```sh
node --test tests/bear-with-me/*.test.cjs
node tests/bear-with-me/browser-runner.cjs /private/tmp/bear-audit
node tests/bear-with-me/browser-runner.cjs /private/tmp/bear-dist-audit --dist
```

The bear Node suite contains 46 checks, including saved-progress migration after scene removal, distinct movement rhythms, physical switch timing, unscaled blinks, reduced-motion timing, wood-first loading, and scene-specific prop dependencies. Six additional deployment and cache-invalidation checks run with `npm test`. Motion curves preserve forward progress without overshooting; during an exhausted or hesitant rest, the reaching arc and wrist stop with the paw. Chrome performs 20 targeted pixel regressions and 8 pointer checks in addition to the 102 performances, including unobstructed eyes behind the opened glasses. `report.json` records pass/fail details; `frames.json` stores visual checkpoints; ten contact sheets cover all 48 scenes; `desktop.png` and `mobile.png` check the page layout. A nonzero exit status means a scene, pixel, or pointer check failed.

The automated audit checks rendering and scene completion. Contact sheets complement it with visual inspection; they are selected story beats, not a claim that every possible intermediate pixel has been manually reviewed. Sound and real-time offer-button interaction are outside this rendering audit.

## Japanese box integration — September 27, 2026

The approved v7 proportions are rendered with a pale hinoki texture, a connected triangular asanoha lattice, six mirrored corner fingers with darker diagonal end grain, and independently rendered iron fittings. The ledge has no switch mounting block. Hinges retain the lid's projection; the light remains clear of both the front bevel and the closed lid.

The toggle's pivot, throw and paw contact target share BearRenderer.hardwareGeometry(). The accessible button follows the fitting's actual rendered bounds on resize, switch throw and box movement, with a minimum 44 px target. Switch-adjacent choreography uses the new tip height. The full scene audit checks actual clamped paw contact on every switch-off, including normal and reduced motion, and optional branches. Additional browser checks cover the centred stem, generous click target, indicator inset, mirrored joints, hardware depth during lid movement, and the cloth cover concealing the smaller toggle. Real pointer presses test both switch positions at 320, 390, 768 and 1440 px widths. The browser-runner.cjs --box-review option provides an enlarged comparison against the approved reference.

## Optimized deployment — September 27, 2026

The production derivatives preserve every decoded RGBA pixel of the bear, props, and index thumbnail. Only wood textures and the oversized seal are resized. The hinoki texture is 65,326 bytes, with a 5,278-byte inline preview painted before its replacement is decoded. Hidden bear images are deferred until the detailed wood loads, and props are decoded before their selected scene begins. The deployment audit passed all 102 performances, 20 pixel regressions, and 8 pointer checks using the fingerprinted WebP assets. Desktop and mobile screenshots were also inspected for the box, bear, and seal.
