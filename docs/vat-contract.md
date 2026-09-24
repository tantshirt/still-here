# VAT contract (AD-6 production format)

Production figure motion uses schema **`still-here-vat/1`**, documented in [`public/vat/manifest.json`](../public/vat/manifest.json) and validated by `npm run validate:vat`.

## Sources and regeneration

CC0 mannequin and licensed stock clips are tracked under `assets-src/vat/` with provenance in [`docs/figure-provenance.md`](figure-provenance.md). Regenerate with Blender **4.5.14 LTS** via `npm run bake:vat`. Ordinary builds consume checked-in `public/vat/` outputs only.

## Sampling and playback

- Right-handed **Y-up** metres; positions are absolute object-space **RGBA16F** texels (width 1024, frame-major packing).
- **Nearest** texel fetch with **linear interpolation between adjacent integer frames**.
- **Loop** clips wrap over `frameCount - 1`; **event** clips clamp across full `durationMs`.
- **Reduced motion** holds each variant’s documented rest frame; no extra root translation is applied at runtime.

## Runtime capacity

Two `InstancedMesh` variants (**standing**, **wheelchair**) share one GLSL sampler. GPU standing capacity is **1600** bodies regardless of viewport presentation budget **B** (800 compact / 1600 wide).

## Spike vs production

Story 2.2 proved figures, haze tiers, and measurements in [`tools/render-spike/`](../tools/render-spike/). Production rendering lives in `src/render/` and reuses the same manifest contract. Physical iPhone 12 and integrated-GPU timing remains operator acceptance, not implied by automated Chromium runs.
