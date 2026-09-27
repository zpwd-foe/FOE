# Current artwork and generation prompts

The current mahogany finish and realistic prop atlases are documented in [PROPS.md](PROPS.md). The oak below is retained as the source for the mahogany edit.

Generated using the built-in ImageGen tool. Original PNGs and their alpha channels are preserved.

- [Expressive eye atlas](plush-atlas-v3.png): current head, with larger photographic eyes. The socket stays fixed while the iris moves over a shaded cream eyeball. The upper lid lowers over the round lower socket. See [approved design, eye rig and edit prompt](EYES.md).
- [Closed eyelids](plush-eyelids-v1.png): matching fur and closed creases, with the original muzzle preserved above the animated eye layers. The [prompt and box/switch reference](EYES.md) document the update.
- [Furry plush atlas](plush-atlas-v2.png): the original body, ears, arms and paws remain in use, preserving the smaller ear size.
- [Oak grain](oak-grain-v1.png): local wood texture mapped onto the lid, ledge, front, sides, and joinery.
- The earlier [atlas](plush-atlas-v1.png) remains as the edit source.

## Plush edit prompt

Use case: precise-object-edit
Edit target: the attached transparent teddy puppet sprite atlas.
Keep the exact 1536x1024 canvas, all five separate components in their current positions and matching sizes, the cream muzzle, belly, inner ear and paw pads. Preserve real alpha transparency between the pieces.
Change the golden fur to visibly longer, shaggy, luxurious mohair with irregular soft tufts, curls and flyaway fibers, including the silhouette. Make it wonderfully soft and lovable, with natural clumping and realistic fabric depth. Keep it honey-golden and gently lit from the upper left.
On the head only, ADD TWO realistic dark brown-black glass teddy eyes, embedded deeply into the plush face, surrounded by compressed fur and tiny fibers overlapping the eye edges. The eyes must look sewn into the stuffing, never pasted on. Put their centers at approximately x=301,y=338 and x=554,y=338 on this canvas, with each visible glass eye about 76 pixels wide and 84 pixels high. Small soft natural window reflections, not big cartoon sparkle dots. No colored iris or white sclera. Fur wraps around the recessed dark rims naturally. Keep the expression gentle and adorable.
The cream muzzle must remain blank: NO nose and NO mouth, since these are animated separately. Absolutely NO eyebrows or eyebrow-like tufts. The head still has no attached ears. No new components, objects, labels or background. Keep the pieces separated and the original composition invariant. Premium realistic plush toy product photography, not illustration.

## Oak generation prompt

Use case: product-mockup
Asset type: photorealistic seamless wood surface texture for mapping onto an animated wooden box.
Create a 1536 by 1024 image completely filled edge to edge by a single smoothly sanded, lightly oiled honey oak board photographed orthographically, straight down, evenly lit. Fine natural horizontal grain, flowing growth rings, subtle pores and tiny realistic grain ridges, occasional small quiet knot detail. Warm medium honey-brown with pale golden variations and understated satin sheen. Tactile real wood, well made but plain. Rich microscopic detail without dramatic contrast.
No perspective, no board edges, no seams between planks, no gaps, no objects, no box, no border, no typography, no cast shadows or vignette. Even diffuse lighting so this can be mapped onto different 3D faces. The wood should feel like a small handcrafted oak toy box, not orange laminate or a rustic floor.
