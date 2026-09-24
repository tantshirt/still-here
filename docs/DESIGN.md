---
name: STILL HERE
description: A monumental browser artwork about finite time and the lives occupying the present.
status: final
updated: 2026-09-24
amended-by:
  - ../../../design-council/rulings-2026-09-24.md
  - ../../../../.tastemaker/style-lock.md
  - ../../../design-council/references/README.md
sources:
  - ../../product-brief.md
  - ../../prds/prd-STILL-HERE-2026-09-23/prd.md
  - ../../prds/prd-STILL-HERE-2026-09-23/addendum.md
  - ../../prds/prd-STILL-HERE-2026-09-23/research-digest.md
  - .working/accepted-plan.md
  - .memlog.md
colors:
  background: '#000000'
  surface: '#101010'
  text-primary: '#F2F2F2'
  text-secondary: '#A8A8A8'
  text-quiet: '#808080'
  focus: '#E6E6E6'
  border: '#333333'
  scene-light: '#FFFFFF'
typography:
  body:
    fontFamily: "'Geist', 'Geist Fallback', Arial, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  reflection:
    fontFamily: "'Geist', 'Geist Fallback', Arial, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 27px
    letterSpacing: '0'
  quote:
    fontFamily: "'Geist', 'Geist Fallback', Arial, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: '-0.01em'
  metadata:
    fontFamily: "'Geist', 'Geist Fallback', Arial, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: '0.16em'
    textTransform: uppercase
  action:
    fontFamily: "'Geist', 'Geist Fallback', Arial, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: '0.04em'
    textTransform: lowercase
rounded:
  DEFAULT: 4px
  none: 0px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  '8': 64px
  gutter-mobile: 20px
  gutter-desktop: 32px
  target: 44px
layout:
  breakpoint: 768px
  overlay-max-vvh: '45%'
motion:
  ui: 200ms
  words: 600ms
  words-gap: 300ms
  quote-hold: 1500ms
  cut: 400ms
  floor-rise: 1600ms
  camera: 1600ms
  caption-delay: 3000ms
  key-change: 4000ms
  event: 2400ms
  birth-light: 600ms
  birth-step: 800ms
  birth-settle: 1000ms
  death-extinguish: 200ms
  death-fall: 1600ms
  death-dissolve: 600ms
  drift: 16000ms
  reduced: 150ms
  ease-out: 'cubic-bezier(0.23, 1, 0.32, 1)'
  ease-fall: 'cubic-bezier(0.55, 0, 1, 0.45)'
render:
  floor-clip: '#FFFFFF'
  grain-start: '2%'
  slab-aspect: '2.4 / 1'
  slab-thickness-ratio: '0.025'
  figure-height-ratio: '0.07'
  drift-tilt-max-deg: '0.5'
  drift-travel-max-ratio: '0.005'
  attention-brightness-max: '1.2'
components:
  threshold:
    maxWidth: 480px
    background: '{colors.background}'
    color: '{colors.text-primary}'
    paragraphGap: '{spacing.5}'
    quoteGap: '{spacing.7}'
  enter:
    typography: '{typography.action}'
    color: '{colors.text-secondary}'
    activeColor: '{colors.text-primary}'
    minHeight: '{spacing.target}'
    minWidth: '{spacing.target}'
  text-action:
    minHeight: '{spacing.target}'
    minWidth: '{spacing.target}'
    typography: '{typography.action}'
    color: '{colors.text-secondary}'
    activeColor: '{colors.text-primary}'
    focusColor: '{colors.focus}'
  slab-scene:
    light: '{colors.scene-light}'
    backdrop: '{colors.background}'
    aspectRatio: '{render.slab-aspect}'
    thicknessRatio: '{render.slab-thickness-ratio}'
  figure:
    color: '{colors.scene-light}'
    heightRatio: '{render.figure-height-ratio}'
  scene-caption:
    color: '{colors.text-secondary}'
    typography: '{typography.metadata}'
  controls-panel:
    background: '{colors.surface}'
    color: '{colors.text-primary}'
    radius: '{rounded.DEFAULT}'
    width: 360px
    padding: '{spacing.5}'
  control-field:
    minHeight: '{spacing.target}'
    color: '{colors.text-primary}'
    border: '{colors.text-quiet}'
  reflection-line:
    color: '{colors.text-primary}'
    typography: '{typography.body}'
    maxWidth: 320px
  reflection-panel:
    background: '{colors.surface}'
    color: '{colors.text-primary}'
    maxWidth: 360px
    radius: '{rounded.DEFAULT}'
    padding: '{spacing.5}'
  colophon:
    background: '{colors.surface}'
    color: '{colors.text-secondary}'
    maxWidth: 480px
  scene-status:
    color: '{colors.text-secondary}'
    background: '{colors.surface}'
    maxWidth: 480px
---

# STILL HERE — Design contract

## Brand & Style

One suspended slab of light in total black. Industrial engineering with the gravity of a sacred place: cold, monumental, silent. The visitor stands beneath it. The living stand on it, and the dead fall past its edge into haze that has no floor. The piece is its own art installation. It is described from first principles, never by comparison to a performance, tour, stage, concert or audience.

The test for every choice: *if it looks like a product, it failed.* STILL HERE is a sentence, not a logo. There is no UI library, no application shell, no boxed buttons and no decoration.

[EXPERIENCE.md](EXPERIENCE.md) owns behavior. This contract owns how things look. The amendment of 2026-09-24 applies the [Design Council ruling sheet](../../../design-council/rulings-2026-09-24.md), the [measured style lock](../../../../.tastemaker/style-lock.md) and the nine [selected reference images](../../../design-council/references/README.md). [Reconciliation](reconciliation.md) records what changed.

## Visual references

The generated images are the visual anchor. They are art direction, never production assets. Files ending `-REJECT.png` show defects and must not be used as anchors.

| Reference | Use |
|---|---|
| [01 — Under](../../../design-council/references/01-poster-under.png) | **Primary anchor.** Palette, steel underside, seam light, bloom, grain, haze falloff |
| [02 — Under, phone](../../../design-council/references/02-poster-under-mobile.png) | Portrait composition; the left corners stay clear for the caption and `controls` |
| [03 — Arrival](../../../design-council/references/03-placement-under.png) | One-step arrival inside a downlight, seen from behind |
| [04 — Fall](../../../design-council/references/04-fall-under.png) | Extinguished, upright figure dissolving into haze below the edge |
| [05 — Level, dense](../../../design-council/references/05-level-island.png) | Dense crowd, wheelchair silhouettes, suspended edge, thickness |
| [06 — Above](../../../design-council/references/06-above-rectangle.png) | Unbroken rectangle of living matter |
| [07 — Level, sparse](../../../design-council/references/07-level-sparse.png) | Nine figures on the same slab and framing as #5: honest emptiness |
| [08 — Figure study](../../../design-council/references/08-figure-study.png) | Body proportions and material for the 3D spike (centre figure), arrival and extinguished states |
| [09 — Threshold](../../../design-council/references/09-threshold-type.png) | Mood of Screen 1 only; does not select a font |

The four HTML files in `mockups/` pre-date the rulings. They still show the old opening copy, boxed controls and teaser cards, so they are superseded for chrome, copy and reflection styling. Use them only for panel geometry (Controls panel, place search, year field).

## Colors

The piece is strictly neutral: black, white and grey, with no accent and no warm or cool tint. The small channel offsets in the generated references are incidental; tokens stay neutral.

| Token | Use and limit |
|---|---|
| `{colors.background}` | Pure `#000000`. Screen 1, the scene void and every page surface. Flat: no CSS gradients anywhere. |
| `{colors.surface}` | Opaque panels only: Controls, expanded reflection, colophon, status. Never place legible text directly over changing glow. |
| `{colors.text-primary}` | Screen 1 text, personal words, active control values. No text glow. |
| `{colors.text-secondary}` | Caption, `controls`, `enter`, `read · ×`, colophon, labels. |
| `{colors.text-quiet}` | Tertiary labels and input boundaries. 4.8:1 on surface, so it stays readable. |
| `{colors.focus}` | Keyboard outline only: 2px, offset 3px. Never a halo around a body. |
| `{colors.border}` | Decorative one-pixel panel edge only. Never the sole input boundary or selected-state cue. |
| `{colors.scene-light}` | Floor, downlights, figures. Pure white, clipping with restrained bloom. Brightness conveys attention, never moral worth. |

Normal text must reach 4.5:1 against its actual backing; large text and meaningful non-text graphics 3:1. Scene imagery may be atmospheric and low-contrast; controls, prose, focus and status may not. Do not lower these ratios with opacity. Errors use clear language, not red. No theme toggle.

## Light, haze and grain

- **Floor:** blown cold white. The floor clips to `{render.floor-clip}` with restrained bloom. The seams leak thin bright lines; the steel ribs stay readable (#1).
- **Floor rise:** the floor fades up from black across `{motion.floor-rise}` after the cut, so leaving the black of Screen 1 is not a glare hit.
- **Haze:** rendered volumetric light in the 3D scene, never a CSS gradient. Downlight shafts are visible; haze falls off into near-black with depth and never reveals a ground (#1, #4, #5, #7).
- **Grain:** fine and subtle on the black. Start at `{render.grain-start}` and tune by comparing matched-camera renders against #1. It must never read as particles.
- **Forbidden:** colored light, a luminous upright wall behind the people, lens flares, stars, landscapes, dawn or sunset, particles, visible pit ground, impact.
- "Cold white" is the perceived result. No light temperature, bloom radius or haze coefficient is claimed from the photographs; the render spike measures against the references.

## Typography

One cold grotesk: open licence, self-hosted, two weights (400 and 500), at most 60KB total. **Geist is locked by the delegated browser comparison on 2026-09-24 (Story 1.3), against IBM Plex Sans.** The two static Latin subsets total 55,196 bytes. Inter is banned. Serif and monospace faces are banned because they split the piece into two voices. The stack uses metric-adjusted local Arial for immediate fallback, then ordinary system sans where Arial is unavailable. See the Story 1.3 evidence and delegated decision; no direct owner visual approval is claimed.

- Screen 1 prose uses `{typography.body}`. The Marcus lines use `{typography.quote}`: they are set apart by size only, never by a second face, italics or quotation marks.
- The caption uses `{typography.metadata}`: capitals with wide tracking.
- `enter`, `controls` and `read · ×` use `{typography.action}`: lowercase, caption-sized.
- Personal words use `{typography.reflection}`.
- Control labels use ordinary sentence case at body size.
- Use rem units so browser text settings work. Load the font without blocking Screen 1 text, and use a metric-matched fallback so text does not shift when the face arrives.

## Layout & Spacing

Use the 4/8/12/16/24/32/48/64px scale. Below `{layout.breakpoint}` use `{spacing.gutter-mobile}`; otherwise `{spacing.gutter-desktop}`. Add safe-area insets to edge text.

**Screen 1.** A left-aligned column of `{components.threshold.maxWidth}`, slightly above centre, on flat black. The prose group, a `{spacing.5}` gap, then the Marcus lines after a larger `{spacing.7}` gap. `enter` sits below the last line in the same column. On short screens only this column scrolls, natively. No scroll engine anywhere.

**Screen 2.** The artwork fills the viewport. Only two things are persistent:

- the caption, top-left;
- the word `controls`, bottom-left.

`Return to now` sits directly under the caption whenever a year is chosen. There are no other edge controls: Sound and Pause live inside the Controls panel. Each text action keeps a 44px target even though it looks small. At narrow widths and 200% text zoom, edge text wraps without overlapping.

**Overlays.** At `{layout.breakpoint}` and above, the Controls panel sits lower-left at `{components.controls-panel.width}`. Below it, the panel spans the width inside the gutters as a bottom sheet. Every overlay (Controls, expanded reflection, colophon) is at most `{layout.overlay-max-vvh}` of the visual viewport height, sits above `controls`, has a persistent heading and Close, and scrolls internally. Only one expanded overlay appears at once.

**Reflection line.** One line of text near the fall, inside the safe frame and clear of the caption and `controls`. It settles within `{motion.words}` and then stays put, even after the body has gone.

## Elevation & Depth

Literal depth, in the artwork only.

- **The slab:** a fixed rectangle, `{render.slab-aspect}`, thickness 2.5% of the short edge. It never becomes a map, chart or country outline.
- **The underside:** steel ribs and a truss visible from Under, with light leaking through the seams.
- **The rig:** vertical suspension cables rising into black.
- **The pit:** haze and darkness below, with no ground ever.
- **Breathing:** the slab moves on its cables over a `{motion.drift}` cycle, with no more than 0.5° tilt and 0.5% of the short edge in vertical travel. The camera never moves on its own.

**Cameras.** Under is home: the slab overhead as a ceiling, with rig and underside visible (#1, #2). Level shows people, the edge and the slab's thickness (#5, #7). Above shows an unbroken rectangle of living matter (#6). Cropping may change with the viewport, but no preset hides the slab. Framing targets are about 70% of width for Level and about 45% for Above; the references land near 64% and 51%, which is accepted.

**Panels** use opaque tonal separation and a one-pixel `{colors.border}` edge. No frosted glass, drop shadows or bloom leaking into text.

**Motion.** UI opacity uses `{motion.ui}` with `{motion.ease-out}`; nothing in the UI moves spatially. Screen 1 groups settle over `{motion.words}` with `{motion.words-gap}` between, and the last Marcus line holds `{motion.quote-hold}` before `enter` fades in. The entry is `{motion.cut}` of true black, not a dissolve. Manual camera presets tween over `{motion.camera}`. The death fall uses `{motion.ease-fall}` (gravity, ease-in); that curve is for physics only, never UI. Reduced motion uses no spatial motion and fades of `{motion.reduced}`, never zero.

## Shapes

**Bodies.** Anonymous adult silhouettes: smooth head, torso and limbs, simplified hands and feet, no face, hair or clothing detail (#8, centre). Flat, unlit, pure scene-light material. They stand still with weight in their stance and a slight sway. There are no props, no pairs and no gestures: from Under props don't read, and a walking crowd is a game. Wheelchair silhouettes are kept, spread through the crowd rather than concentrated at the front. No age caricatures, uniforms or national stereotypes.

- **Arrival:** a downlight punches through, a figure is already standing in it and takes one short, straight step (#3). No exaggerated walk.
- **Fall:** the light goes out and the figure falls upright, calm and not flailing, past the slab's edge. It is silhouetted against haze, never against the white floor, and dissolves before any possible impact (#4).
- **Attention:** a noticed figure may brighten by at most 20% (`{render.attention-brightness-max}`). No rings, labels or new colors.

**Interface.** Text actions are bare text with no box, pill, icon or underline until focus. Panels and fields use `{rounded.DEFAULT}`. No badges, avatar chips or ornate borders.

## Components

| Component | Visual contract |
|---|---|
| Threshold | Flat black, left-aligned 480px column slightly above centre. Prose at body size; Marcus at quote size. No attribution. No logo, heading or chrome. |
| `enter` | Lowercase, caption-sized, `{colors.text-secondary}`; primary on hover or focus. Fades in after the hold. Never a hero CTA or a box. |
| Text action | Bare lowercase text, 44×44px target, secondary color, primary on hover or active, visible focus outline. |
| Slab scene | Fixed proportions, visible rig and ribs, blown white floor, bottomless haze. Density comes from the shared population mapping, never composed per country. |
| Figure | Faceless flat silhouette per Shapes. Wheelchairs kept. No props, pairs or gestures. |
| Scene caption | Top-left, caps with wide tracking: `THE WORLD · NOW`, or place · year. A chosen projected year adds a plain `Projection` label. Once per visit it changes key to `STILL HERE` for `{motion.key-change}`, crossfading at `{motion.ui}`. |
| `controls` | One dim lowercase word bottom-left. Opens the panel. |
| Controls panel | Opaque surface, grouped fields (Place, When, Show, Speed, Camera, Sound, Pause, About this piece), persistent heading and Close, internal scroll. |
| Control field | Body-sized label and value, 44px targets. Search has a visible boundary. Selected choices show a text check and an underline, never color alone. |
| Reflection line | One sentence of at most 16 words near the fall, then `read · ×`. No card, no notification styling, no icon. A backing of `{colors.background}` behind the text only if contrast needs it. |
| Reflection panel | Personal words at 18/27px, then one small `An imagined life.` line in secondary text. 24px padding, persistent Close. No cause of death, avatar, badge, theme tag or score. |
| Colophon | Bounded opaque reading surface, 16/24px text, ordinary links, no large title or branding. |
| Scene status | Small opaque text area for loading, missing data, sound unavailable or the still fallback. Distinguished by message, never by alarm color or counters. |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep one slab, true black, visible steel and cables, and a bottomless pit | Add a map, dashboard, landing-page sections, or a visible impact |
| Let the crowd stand, with weight and slight sway | Make figures walk, wave, carry props or perform |
| Let the words be legible, small and personal | Glow text, show a cause of death, or decorate grief |
| Keep chrome to a caption and one word | Add boxed buttons, icons, badges or a second edge control |
| Show sparse countries with honest empty space | Fill emptiness for composition or invent arrivals and deaths |
| Describe the work as its own installation | Use stage, concert, tour, performance or audience language |
| Preserve the underside as the share image | Add live counters, slogans, logos or demographic charts |
