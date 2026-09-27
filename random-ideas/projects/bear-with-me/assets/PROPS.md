# Realistic props and mahogany artwork

Created with the built-in ImageGen tool. Original PNGs are preserved; SVG view boxes and masks assemble them into the animated scene. `props-crops.json` records the source bounds, and `props.js` maps the crops to the bear's existing hand and costume positions.

## Current files

- [Everyday props](props-everyday-v1.png): book, biscuit, flower, cloth, ruler, clipboard, stamp, stool, stopwatch.
- [Theatrical props](props-theatre-v1.png): curtains, cover, paper card, periscope, blocks, cord, spoon, top hat, flag.
- [Keepsakes and accessories](props-keepsakes-v1.png): photo album, chair, cushion, felt heart, scroll, spectacles, headband, detective hat, moustache.
- [Opened spectacles](glasses-open-v1.png): replaces the folded spectacles with outward-splayed temples and transparent lens openings. The original atlas remains unchanged. Lens centres align with the bear's eyes; the arms extend toward the sides of its head. See [GLASSES.md](GLASSES.md) for the edit prompt.
- [Costumes](props-costumes-v2.png): nightcap, blanket, cape.
- [Chocolate cookie](chocolate-cookie-v1.png): replaces the original plain biscuit in both food scenes. Generated with the built-in ImageGen tool; see [COOKIE.md](COOKIE.md) for the exact prompt. The original atlas remains unchanged.
- [Mahogany grain](mahogany-grain-v1.png): the lid, frame, front, side, and joinery all use this finish.

Paper signs retain their live text. The glint uses a soft light effect. The corrected lid geometry, hardware, and soft elbow bends are rendered in SVG.

The nightcap cuff and the tied headband are sized to span the forehead. Their full sprite bounds include the cap's pom-pom and the bandana's knot and tails, which extend beyond the fabric that fits around the head.

## Final prompts

### Everyday props

Use case: product-mockup
Asset type: transparent prop sprite atlas for a realistic plush teddy animation.
Create a 1536x1024 RGBA image with REAL ALPHA TRANSPARENCY. Photograph nine separate miniature objects in a strict 3-column by 3-row grid. Each cell is 512 pixels wide and approximately 341 pixels tall. Every object is entirely within its own cell with at least 30 pixels of clear margin; no touching or overlap across cells. No grid lines, labels, cell backgrounds, checkerboard, floor or cast shadows outside objects.
Premium real miniature props, tactile wood, metal, food, paper and fabric, natural material detail. Gentle warm softbox lighting from upper left, modest depth and soft self-shadowing. Front view with a very slight view of top surfaces where appropriate. Correct real-world proportions. Not icons, drawings, clay, plastic replicas or flat vector graphics. Match a handmade golden plush teddy and warm wooden toy box. Every component isolated on transparent background. Read cells left to right, top to bottom:
1. An OPEN small sage-green clothbound book, cream pages with fine faint printed lines and a center crease, open pages facing camera.
2. A single round golden digestive biscuit, little pinholes, baked rough crumb and browned rim, face toward camera.
3. One fresh pale cream daisy with a golden center, slender green stem and two leaves, upright.
4. A small soft sage linen polishing cloth draped in loose irregular folds, rectangular with stitched hem.
5. A slender horizontal wooden ruler with dark engraved tick marks, realistic worn edges.
6. A small upright brown hardboard clipboard with one cream paper sheet and polished metal spring clip; subtle straight ruled lines, no readable text.
7. A vintage rubber stamp with a dark walnut rounded handle and horizontal wooden base, black rubber stamping surface beneath.
8. A low three-legged wooden stool, plain rounded seat, miniature realistic joinery.
9. A round stainless-steel analog stopwatch with crown and loop at top, ivory dial and two dark hands.
Do not add any other objects.

### Theatrical props

Use case: product-mockup
Asset type: transparent prop sprite atlas for a realistic plush teddy animation.
Create a 1536x1024 RGBA image with REAL ALPHA TRANSPARENCY. Photograph nine separate miniature objects in a strict 3-column by 3-row grid. Each cell is 512 pixels wide and approximately 341 pixels tall. Every object is entirely within its own cell with at least 30 pixels of clear margin; no touching or overlap across cells. No grid lines, labels, cell backgrounds, checkerboard, floor or cast shadows outside objects.
Premium real miniature props, tactile wood, metal, food, paper and fabric, natural material detail. Gentle warm softbox lighting from upper left, modest depth and soft self-shadowing. Front view with a very slight view of top surfaces where appropriate. Correct real-world proportions. Not icons, drawings, clay, plastic replicas or flat vector graphics. Match a handmade golden plush teddy and warm wooden toy box. Every component isolated on transparent background. Read cells left to right, top to bottom:
1. A tiny terracotta velvet theatrical curtain, two long draped panels gathered outward on a horizontal brass rod. A large transparent opening in the middle, no backdrop.
2. A soft muted-blue linen cloth draped over a SMALL invisible rounded dome, like a magician covering a switch; fabric folds and hem, open bottom, no object visible beneath.
3. One plain blank warm ivory thick paper card, horizontal 2.5:1 aspect ratio, subtly curled corners and visible fibers, no lettering or marks.
4. A toy periscope made from worn sage-green painted metal, upright L-shaped tube with a short right-facing horizontal top and small glass viewing window.
5. Three wooden toy cubes stacked into a little pyramid, one above two, muted sage, dusty blue and natural timber paint, real wooden edges.
6. A little coil of natural jute craft string, lying flat in a loose circle with a short free end, individual braided fibers.
7. One polished stainless-steel teaspoon, upright with bowl at the TOP and handle at the bottom.
8. A small dark sage felt magician's top hat, upright, fabric ribbon around the base of its crown.
9. One little white cotton surrender flag on a slender wooden pole, upright, the flag hanging gently to the right.
Do not add any other objects.

### Keepsakes and accessories

Use case: product-mockup
Asset type: transparent prop sprite atlas for a realistic plush teddy animation.
Create a 1536x1024 RGBA image with REAL ALPHA TRANSPARENCY. Photograph nine separate miniature objects in a strict 3-column by 3-row grid. Each cell is 512 pixels wide and approximately 341 pixels tall. Every object is entirely within its own cell with at least 30 pixels of clear margin; no touching or overlap across cells. No grid lines, labels, cell backgrounds, checkerboard, floor or cast shadows outside objects.
Premium real miniature props, tactile wood, metal, food, paper and fabric, natural material detail. Gentle warm softbox lighting from upper left, modest depth and soft self-shadowing. Front view with a very slight view of top surfaces where appropriate. Correct real-world proportions. Not icons, drawings, clay, plastic replicas or flat vector graphics. Match a handmade golden plush teddy and warm wooden toy box. Every component isolated on transparent background. Read cells left to right, top to bottom:
1. An open aged leather photo album facing the camera, cream page with one small vintage photograph of a plain closed reddish-brown mahogany box; no readable text.
2. One little straight-backed walnut wooden chair, warm brown finish, realistic legs, seat and simple back slats.
3. A plump sage-green woven cotton cushion, horizontal, visible soft seams and piped edges.
4. One small dusty-rose heart-shaped stuffed felt ornament, subtle stitches and soft fabric, without a string.
5. One unrolled upright parchment scroll, curled wooden-free paper ends at top and bottom, natural paper fibers; blank interior.
6. A pair of delicate round antique-brass spectacles, front view, two symmetrical round rims, bridge and side arms. Empty lens openings must be fully transparent, no glass tint or background.
7. One olive-green cotton sports headband tied with a small knot and two short tails on the right, front view, gently arched to fit a round teddy forehead.
8. One tan tweed detective hat, front view, a low crown and small brim, believable wool weave and seam.
9. One small dark brown theatrical fake moustache, gently curled tips, real short hair fibers, isolated.
Do not add any other objects.

### Costumes

Use case: product-mockup
Asset type: transparent costume sprite atlas for a realistic plush teddy.
1536x1024 RGBA with real alpha transparency. Exactly THREE isolated garments, in three vertical columns of 512 pixels each, separated by at least 45 pixels of transparent space. One garment centered within each column. No mannequins, bodies, heads, teddy bears, hangers, floor, background, text or grid.
Premium miniature fabric costume product photographs, front facing, tactile weave, soft natural folds and warm upper-left studio light, no cast shadows outside the objects. They will be overlaid on a teddy in code.
LEFT COLUMN: one soft sage-green cotton sleeping nightcap, its wide rounded cuff opening facing the viewer, loosely flopping to the RIGHT with a cream fluffy pom-pom on its tip. Low triangular draped shape, width greater than height.
MIDDLE COLUMN: one soft sage woven blanket wrapped around an invisible small teddy torso, a shallow open curved neckline at top, overlapping front panels, gently widening to a rounded lower hem. No arms, skin or teddy, only blanket.
RIGHT COLUMN: one little terracotta-red velvet superhero cape, front view, wide flowing lower drape and two narrow shoulder ends with a small antique-brass clasp and cord at the upper center. No character.

### Mahogany

Use case: precise-object-edit
Edit target: the attached flat oak texture.
Replace the wood species and color with rich genuine MAHOGANY: deep warm reddish brown, restrained burgundy undertones, fine close pores and long elegant horizontal ribbon grain with subtle chatoyant golden-red bands. Satin hand-rubbed finish and realistic fine wood fibers. Sophisticated handcrafted mahogany toy box material, not orange oak, not purple, not black, not high-gloss plastic.
Keep the image as an edge-to-edge 1536x1024 flat orthographic texture with completely even diffuse lighting. Remove the obvious oak knots and oak growth-ring pattern. No board edges, perspective, seams, objects, engraving, lettering, cast shadows or vignettes. Natural variation but moderate contrast, consistent color across the image.

### Nightcap fit refinement

Use case: precise-object-edit
Edit the attached transparent three-garment atlas. Change ONLY the sleeping nightcap in the left column. Preserve the blanket, cape, their coordinates, lighting, colors, the 1536x1024 canvas and the transparent background.
The nightcap needs to be seen straight from the FRONT at eye level, as if worn on a round teddy's head. Its wide lower cuff must show a continuous solid sage knitted fabric front, with a slightly curved lower edge. The opening is behind the cuff and completely hidden from this camera angle: remove the visible dark hollow oval and underside. Keep the soft folded top flopping right, cream pom-pom, material, color, width and approximate placement. Do not add a head, face, body or mannequin. Photorealistic miniature cotton nightcap cutout, natural folds and fabric fibers, real alpha transparency.

## Reading direction

The animated reading book now uses a code-native SVG reverse cover in `props.js`, with linen texture, a spine and narrow page edges. Its reading surfaces face the bear. The album starts with the same reverse and turns to the existing photographic album sprite only when shown to the visitor. Original atlas PNGs remain unchanged.
