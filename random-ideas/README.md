# Z's Random Realm

A personal collection of little things with questionable usefulness, intended for **random.z301.uk**. Plain HTML, CSS, and JavaScript; no build step, backend, dependencies, or external asset requests.

## Preview

Run from this directory:

```sh
python3 -m http.server 8017 --bind 127.0.0.1
```

Open <http://127.0.0.1:8017>. The page also works by opening `index.html` directly.

## Add an idea

Edit `src/ideas.js`. The first entry is **Bear with me**, an interactive teddy bear useless machine. Search, filters, and the random button appear automatically when entries are added. Six optional sample entries are kept separately in `examples/ideas.sample.js` as references; they are not shown on the site.

```js
{
  id: "my-first-idea", // Unique, permanent URL: #idea/my-first-idea
  title: "My first idea",
  category: "Experiments", // Experiments or Notes
  description: "A short description for the collection.",
  tags: ["Useful", "Weekend project"],
  artwork: "palette", // palette, map, note, prompt, shapes, or list
  status: "In progress",
  sample: false,
  body: ["The story behind the idea.", "A second paragraph, if needed."],
  url: "projects/my-first-idea/" // Optional project URL, relative or https://
}
```

Cards open a shareable detail view. Entries with `url` also show an **Open project** link. Set `direct: true` to open the project directly from its card. Drop standalone projects into their own folders, or link to projects hosted elsewhere. Search covers titles, descriptions, categories, and tags. **Surprise me** selects from the whole collection and avoids repeating the last idea.

Change the header, introduction, and About copy in `index.html`. Both pages use a traditional Japanese stitched notebook theme: ivory paper with a subtle local SVG fibre texture, an inset frame, right-hand cream stitching and indigo cover edge, charcoal ink, and a vermilion seal. The binding narrows on mobile to leave room for readable entries.

`src/theme.css` owns the shared fonts, colours, notebook frame, header, controls, and fine underlines revealed by hover or keyboard focus. Titles use Shippori Mincho B1; body text and controls use Noto Sans. Fonts are served locally from `assets/fonts/`, with their SIL Open Font Licences and source URLs included. Underline transitions respect reduced-motion preferences. Page-specific layouts remain in `src/styles.css` and `projects/bear-with-me/bear.css`; illustrations and index interactions are in `src/app.js`.

Entries can include an optional `caption` below their illustration and an `actionLabel` for their link. Entry numbers follow their position in `src/ideas.js` and stay the same when filtered.

## Hosting

The header and favicon use the approved ZPWD vermilion seal, arranged W/Z above D/P. The original image and generation prompts are documented in [assets/ZPWD-SEAL.md](assets/ZPWD-SEAL.md).

Upload `index.html`, `src/`, `assets/`, and `projects/` to any static web host. Keep their relative paths intact. The site can live at a domain root or beneath a subdirectory; no server-side routing is needed.

When a host is selected, add `random.z301.uk` as its custom domain, then configure the DNS records and HTTPS settings it provides. DNS and deployment have not been configured by this project. The README and any local validation artifacts do not need to be published.

## Browser checks

Check the layout on desktop and mobile, the category filters, search and its empty state, random selection, and the idea detail view. The view should open from a `#idea/...` URL, close with Escape or the close button, restore focus, and work with browser Back/Forward. Keyboard focus is visible, modal focus is contained by a native dialog, and reduced-motion preferences are respected.

## Bear with me

Open `projects/bear-with-me/`. The switch on the front ledge works with mouse, touch, Enter, or Space. The fluffy teddy performs 48 distinct scenes using a locally rendered SVG puppet, animated paws and expressions, and scene-specific props. Deliberate pauses hold for roughly one to two seconds, with a slow blink when the eyes are open. The first pass progresses in order; **At random** favors unseen and then least-seen scenes, avoiding immediate repeats.

- Repeated clicking during a performance earns up to two pauses without queueing or skipping scenes.
- Movement has emotional rhythms: sleepy gestures start heavily, reluctant reaches hesitate before a decisive tap, exhausted paws rest between efforts, and mindfulness has long, even breaths with a longer exhale. Startled reactions stay sharp; released props accelerate as they fall. Retreats match the bear's mood, while blinks and optional interaction windows retain their own timing.
- Hovering lifts the lid just a crack, keeping the bear hidden; leaving closes it. Clicking begins the full performance.
- Scenes 21 and 41 offer an optional cookie or handshake; both finish if no answer arrives. Accepting the cookie removes it from the paw immediately; an unanswered offer lets the bear keep it.
- Scene 49 switches itself back on and off. Scene 50 leaves a retirement sign that is retrieved on the next interruption.
- The compact Japanese hinoki box follows the approved v7 reference: fine walnut asanoha inlay, six matching end-grain fingers at each front corner, and dark iron hardware. The small toggle mounts directly into the continuous front ledge; the green indicator is inset to its right. Shared hardware geometry keeps the paw contact and accessible hit target aligned. The perspective lid seats over the full opening without touching either fitting, and its hinge leaves rotate with it. Arms have limited reach, soft elbow bends, forearm-led wrist movement, and gentle reaching arcs. The bear leans when needed to reach the switch.
- Scene IDs remain stable when reactions are removed; saved discoveries migrate automatically to the remaining 48 scenes.
- Discovery counts, order, sound preference, motion preference, and retirement are saved only in this browser under `random.bear-with-me.v1`. Blocked or invalid storage falls back safely.
- Sound starts muted. Turn it on for mechanical toggle clicks, hinge friction, wooden knocks, soft plush movement, paper rustles, cloth swishes, metal clinks, and stopwatch ticks. These are synthesized locally; lid and prop impacts play when they land. Muting stops active sounds immediately. **Less motion** preserves the scenes with static story beats instead of interpolated travel; it follows the system preference until overridden.
- **Start over** resets discoveries while retaining preferences. The reset and order controls are unavailable during a scene.

`props.js` assembles photographic miniature props and costumes, `renderer.js` draws and moves the puppet, `scenes.js` contains the 48 performances, `progress.js` handles validated persistence and selection, `sound.js` provides local foley, and `machine.js` coordinates interaction and scene cleanup. The SVG rig uses a bundled shaggy plush sprite atlas with larger recessed photographic eyes, fur-covered animated eyelids, expressive glances and articulated arms. The ears keep their original smaller proportions. A pale hinoki texture follows the box lid and its other wooden surfaces; the inlay and joints are native SVG geometry. Box material provenance is in [JAPANESE-BOX.md](projects/bear-with-me/assets/JAPANESE-BOX.md). Artwork provenance and the generation prompt are in [`projects/bear-with-me/assets/PROMPTS.md`](projects/bear-with-me/assets/PROMPTS.md). All assets are local, with no runtime dependencies. The book uses an SVG cloth-cover reverse so its pages face the bear; the photograph album turns toward the visitor only when the bear shows it. The scene-by-scene staging notes are in [`SCENES.md`](projects/bear-with-me/SCENES.md).

Run the deterministic checks:

```sh
node --test tests/bear-with-me/*.test.cjs
```

Run the real Chrome scene and pixel audit (Node 22+ and Chrome required):

```sh
node tests/bear-with-me/browser-runner.cjs /private/tmp/bear-audit
```

This runs all 48 scenes with normal and reduced motion, both optional interactions, and the interruption after retirement. It writes a JSON report, scene contact sheets, and desktop/mobile screenshots. Use `--no-gallery` to skip screenshots. Set `CHROME_PATH` when Chrome is outside the standard macOS application path. The runner starts its own loopback server and isolated browser profile; it does not use or change your browsing profile. See [rendering checks and fixes](projects/bear-with-me/RENDERING.md).

The index card uses an export of the current renderer. Refresh it after changing the bear or box:

```sh
node tests/bear-with-me/browser-runner.cjs assets --preview
```

Browser verification can use `window.bearMachine.play(index)` (zero-based) and temporarily set `window.bearMachine.renderer.speed` to accelerate the actual animation engine. These hooks are for development; the visitor interface keeps emotional labels and scene names hidden.
