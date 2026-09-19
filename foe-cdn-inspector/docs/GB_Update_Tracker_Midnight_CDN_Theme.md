# GB Update Tracker UI Theme Specification

## Theme Name

**Midnight CDN**

A dark technical dashboard theme built around charcoal, slate, and
layered blue tones. The visual direction is inspired by a predominantly
grey/black wardrobe with a preference for all shades of blue.

The theme should feel:

-   Technical and data-focused
-   Dark, polished, and restrained
-   Modern without looking generic
-   Easy to scan during long sessions
-   Blue-forward without making every surface blue
-   Appropriate for a Forge of Empires Beta/CDN tracking tool

------------------------------------------------------------------------

## 1. Core Design Principles

### 1.1 Neutral surfaces first

Use near-black, charcoal, and slate for the majority of the interface.
Blue should communicate interaction, selection, discovery, or importance
rather than functioning as the default background color.

### 1.2 Blue as the visual language

Different blue tones provide hierarchy:

-   Deep blue for selected or primary states
-   Azure for primary actions
-   Cerulean for secondary emphasis
-   Ice blue for discoveries, highlights, and fresh Beta data

### 1.3 Low-noise technical appearance

Avoid heavy gradients, oversized shadows, bright borders, and excessive
glow effects. The dashboard contains dense historical and technical
data, so decoration should never compete with content.

### 1.4 Clear change-state semantics

Asset changes must remain immediately distinguishable. Use
theme-compatible colors for added, changed, removed, and current states.

------------------------------------------------------------------------

## 2. Core Color Palette

  --------------------------------------------------------------------------------
  Token                      Purpose           Color             Hex
  -------------------------- ----------------- ----------------- -----------------
  `--bg-app`                 Application       Near Black        `#090D14`
                             background                          

  `--bg-surface`             Main panels /     Midnight Charcoal `#111827`
                             navigation                          

  `--bg-card`                Cards / raised    Slate Black       `#182235`
                             surfaces                            

  `--border-default`         Borders /         Blue Grey         `#2A3A52`
                             dividers                            

  `--accent-primary`         Primary actions / Azure Blue        `#3B82F6`
                             active states                       

  `--accent-primary-hover`   Hover / focus     Bright Blue       `#60A5FA`
                             emphasis                            

  `--accent-secondary`       Secondary         Cerulean          `#0EA5E9`
                             emphasis                            

  `--accent-highlight`       New discoveries / Ice Blue          `#7DD3FC`
                             special                             
                             highlights                          

  `--text-primary`           Primary text      Cool White        `#F1F5F9`

  `--text-secondary`         Secondary text    Steel Grey        `#94A3B8`

  `--text-muted`             Metadata /        Slate Grey        `#64748B`
                             subdued labels                      
  --------------------------------------------------------------------------------

------------------------------------------------------------------------

## 3. Change-State Colors

These colors are used for the CDN change history, badges, timeline
markers, filters, and asset status indicators.

  -----------------------------------------------------------------------
  State                   Hex                     Usage
  ----------------------- ----------------------- -----------------------
  Added                   `#38BDF8`               Newly discovered files,
                                                  strings, icons,
                                                  buildings, metadata

  Changed                 `#818CF8`               Modified assets or
                                                  values

  Removed                 `#F87171`               Assets or strings
                                                  removed by a later Beta
                                                  update

  Current / Active        `#60A5FA`               Latest surviving value
                                                  or currently active
                                                  Beta asset
  -----------------------------------------------------------------------

### Usage rules

-   Prefer colored indicators, left borders, badges, icons, or small
    status markers over full-card fills.
-   Do not fill large table rows with saturated status colors.
-   Removed content may use reduced opacity in addition to the coral
    status color.
-   The latest/current value should remain visually stronger than
    historical entries.

------------------------------------------------------------------------

## 4. Signature Color

**CDN Discovery Blue:** `#38BDF8`

This is the dashboard's distinctive highlight color.

Use it for:

-   Newly detected Beta assets
-   "New" badges
-   Discovery indicators
-   Timeline points for first appearance
-   Small visual accents associated with CDN monitoring

Do not use it as the dominant background color.

------------------------------------------------------------------------

## 5. Gradient

For occasional high-emphasis elements:

``` css
linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)
```

Recommended uses:

-   Selected navigation indicator
-   Small hero/header accent
-   Primary call-to-action button
-   Active filter indicator

Avoid using the gradient across large dashboard surfaces.

------------------------------------------------------------------------

## 6. Surface Hierarchy

The recommended visual stack is:

``` text
Application Background    #090D14
    └── Main Surface       #111827
          └── Card         #182235
                └── Border #2A3A52
```

This creates depth without relying on strong shadows.

### Suggested CSS

``` css
:root {
  --bg-app: #090D14;
  --bg-surface: #111827;
  --bg-card: #182235;

  --border-default: #2A3A52;

  --accent-primary: #3B82F6;
  --accent-primary-hover: #60A5FA;
  --accent-secondary: #0EA5E9;
  --accent-highlight: #7DD3FC;
  --accent-discovery: #38BDF8;

  --status-added: #38BDF8;
  --status-changed: #818CF8;
  --status-removed: #F87171;
  --status-current: #60A5FA;

  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
}
```

------------------------------------------------------------------------

## 7. Component Guidance

### 7.1 Header / Navigation

-   Background: `#111827`
-   Active item: `#3B82F6`
-   Inactive text: `#94A3B8`
-   Hover text: `#F1F5F9`
-   Divider: `#2A3A52`

Keep the navigation visually quiet so the data remains the focal point.

### 7.2 Cards

Default:

``` css
background: #182235;
border: 1px solid #2A3A52;
```

Use minimal shadowing. If separation is required, prefer border contrast
over a large drop shadow.

### 7.3 Tables

-   Table background: transparent or `#111827`
-   Header background: `#182235`
-   Row divider: `#2A3A52`
-   Primary cell text: `#F1F5F9`
-   Secondary metadata: `#94A3B8`
-   Timestamps / low-priority data: `#64748B`

Hover states should use a subtle blue-grey surface shift rather than a
bright blue fill.

### 7.4 Search

The search field is a primary dashboard interaction.

Suggested states:

``` css
background: #111827;
border: 1px solid #2A3A52;
color: #F1F5F9;
```

Focus:

``` css
border-color: #3B82F6;
```

A restrained focus ring may use `#3B82F6` at low opacity.

### 7.5 Filters

Selected filters:

-   Border/accent: `#3B82F6`
-   Text: `#F1F5F9`
-   Background: low-opacity blue over `#182235`

Status filters should use their corresponding change-state color.

### 7.6 Buttons

Primary:

``` css
background: #3B82F6;
color: #F1F5F9;
```

Hover:

``` css
background: #60A5FA;
```

Secondary buttons should remain charcoal/slate with blue borders or
text.

### 7.7 Links

Default: `#60A5FA`

Hover: `#7DD3FC`

Visited links should not shift to conventional purple unless the
application specifically needs browser-like visited-state behavior.

------------------------------------------------------------------------

## 8. New Beta Asset Treatment

Newly detected assets should receive a subtle discovery treatment.

Recommended:

-   Small `NEW` badge in `#38BDF8`
-   Thin left edge or top accent
-   Optional very subtle ice-blue glow
-   First-seen timestamp
-   Discovery state should disappear or soften once the asset is no
    longer considered new

Example:

``` css
.new-beta-asset {
  border-left: 2px solid #38BDF8;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.08);
}
```

The glow must remain subtle. The goal is "new CDN discovery," not neon
cyberpunk.

------------------------------------------------------------------------

## 9. Great Building Bonus Presentation

Great Building bonus descriptions and icons are a major visual feature.

Recommended structure:

``` text
[GB / Bonus Icon]  Bonus Name
                   Current Beta description

                   First Seen • Last Changed • Status
```

### Styling

-   Bonus name: `#F1F5F9`
-   Description: `#94A3B8`
-   Metadata: `#64748B`
-   New/current indicator: `#38BDF8` or `#60A5FA`
-   Removed bonus: `#F87171`

Preserve the original FoE artwork colors. Do not recolor Great Building
or bonus icons to match the UI theme.

------------------------------------------------------------------------

## 10. 60-Day History / Timeline

The timeline should emphasize chronology and change type.

Suggested mapping:

``` text
● Added       #38BDF8
● Changed     #818CF8
● Removed     #F87171
● Current     #60A5FA
```

Keep connecting timeline lines neutral (`#2A3A52`) so status colors
remain meaningful.

Dates should use secondary or muted text rather than competing with the
change description.

------------------------------------------------------------------------

## 11. Typography

Use a clean UI sans-serif stack.

``` css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Recommended hierarchy:

  Element             Weight
  --------------- ----------
  Page title        650--700
  Section title          600
  Card title             600
  Body                   400
  Metadata          400--500
  Badge                  600

Avoid excessive uppercase text. Uppercase is appropriate for compact
status badges such as `NEW`, `ADDED`, or `REMOVED`.

------------------------------------------------------------------------

## 12. Borders and Radius

Recommended:

``` css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
```

Use:

-   6px for badges and compact controls
-   10px for inputs and standard cards
-   14px sparingly for major panels

Avoid extremely rounded "pill" styling for every element. This is a
technical dashboard, not a consumer social app.

------------------------------------------------------------------------

## 13. Accessibility

The theme should maintain strong readability on dark surfaces.

Requirements:

-   Do not use muted grey for essential information.
-   Never communicate Added / Changed / Removed solely by color; include
    text or an icon.
-   Provide visible keyboard focus states.
-   Maintain sufficient contrast for text, borders, controls, and
    selected states.
-   Avoid blue text directly over similarly saturated blue surfaces.
-   Preserve readable contrast around colorful FoE icons.

------------------------------------------------------------------------

## 14. Visual Personality

The finished interface should feel like:

> A restrained dark technical console built for investigating what Inno
> is quietly changing behind the scenes.

It should **not** feel like:

-   A neon cyberpunk terminal
-   A generic Bootstrap admin panel
-   A solid-blue corporate website
-   A gaming UI overloaded with glow effects
-   A black page with bright blue everywhere

The dominant visual impression should be **black/grey first, blue
second**.

------------------------------------------------------------------------

## 15. Quick Reference

``` text
BACKGROUND
#090D14  Near Black
#111827  Midnight Charcoal
#182235  Slate Black

STRUCTURE
#2A3A52  Blue Grey Border

BLUE SYSTEM
#2563EB  Deep Gradient Blue
#3B82F6  Azure / Primary
#60A5FA  Bright Blue
#0EA5E9  Cerulean
#38BDF8  Discovery Blue
#7DD3FC  Ice Blue

TEXT
#F1F5F9  Cool White
#94A3B8  Steel Grey
#64748B  Slate Grey

CHANGE STATES
#38BDF8  Added
#818CF8  Changed
#F87171  Removed
#60A5FA  Current
```

------------------------------------------------------------------------

## 16. Final Theme Direction

**Midnight CDN** should use charcoal and near-black as its canvas,
layered slate surfaces for structure, and a controlled spectrum of blues
for interaction and discovery.

The most important visual rule is:

> **Blue means something.**

If an element is blue, it should generally be interactive, selected,
newly discovered, currently active, or otherwise worthy of attention.

This keeps the dashboard polished and makes new Beta discoveries
naturally stand out without overwhelming the historical data.
