# Head fur refinement

Current asset: [plush-head-fur-v1.png](plush-head-fur-v1.png), generated with built-in ImageGen as a 1536 × 1024 RGBA PNG and copied unchanged into the project.

The edit used [plush-eyelids-v1.png](plush-eyelids-v1.png) as its target and [box-switch-reference.png](box-switch-reference.png) as the fur reference. The head and closed lids share this texture. The approved glass eyes and cream muzzle still come from v3; the original smaller ears, torso and paws remain from v2.

A shared SVG color matrix applies RGB multipliers (0.98, 1.02, 0.96) in sRGB, bringing the cheek fur closer to the existing body's honey tone. A following alpha transfer multiplies alpha by 1.04 and clamps to 1, sealing slightly translucent interior pixels while retaining transparent gaps and a soft fur fringe. The original PNG is unchanged. The SVG head-atlas clip follows the transparent gutter between the head and neighbouring parts: the original rectangular crop admitted the top of a separate paw, causing the floating fur reported in the September 26 screenshot. This clip also excludes the neighbouring ear tips and is shared by every head source. At alpha ≥ 100, the complete 354,537-pixel head component is preserved while the three lower neighbouring components are excluded.

## Generation prompt

Use case: precise-object-edit.
Asset type: photographic RGBA sprite texture atlas for an existing animated teddy bear.
Input images: Image 1 is the EDIT TARGET, the existing closed-eyelid atlas. Image 2 is the visual reference for HEAD FUR ONLY.

Refine ONLY the honey-golden fur on the upper-left earless head in Image 1 to resemble the very soft fine plush fur in Image 2. Replace the current coarse, wiry, crinkled fibres with finer soft matte strands, loose wispy tufts and gently overlapping layers. The crown should be lightly tousled with fine flyaways, not a stiff central ridge. Forehead fibres should sweep naturally outward and downward around the eye sockets, with fine shorter fibres on the closed lids. Cheek strands should drape in soft, airy, irregular tufts around the cream muzzle. Keep natural shadow between tufts, warm caramel roots and delicate pale honey tips; avoid crunchy white highlights, rope-like curls, combed grooves or a uniformly blurred texture. This is a tangible photographic plush toy, not painted, plastic or cartoon.

Preserve the EXACT 1536x1024 atlas layout, all component positions, overall head dimensions and straight-on camera. The head remains entirely within its existing x=0..825, y=0..660 region. Keep both eyes CLOSED with their subtle crease centres at approximately (286,347) and (575,347), same size and position. Keep the exact cream muzzle position, size, blank surface and boundary. NO NOSE, NO MOUTH, NO EYEBROWS or eyebrow-shaped fur ridges. NO ears attached to the head. Do not copy the reference's oversized ears, facial proportions, poses, box, background or typography. The existing separate ear, torso, paw and arm elsewhere in Image 1 remain unchanged. Retain the existing honey-gold hue so the head matches these body parts. Preserve genuinely transparent alpha between components and fine semi-transparent fur edges. No scene, checkerboard, cast shadow on a backdrop, new parts, labels or watermark. Return only the edited atlas with real RGBA transparency.
