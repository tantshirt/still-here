# Typeface provenance and delivery

Geist is the delegated Story 1.3 selection, dated 2026-09-24. Actual Chromium renders of exact council threshold copy were compared against the renamed IBM Plex Sans subset at 1440×900 and 375×812. Geist's uniform forms produced the colder, steadier voice; Plex read as more conversational. This is an agent's delegated decision, not direct owner sign-off. Local screenshots and rationale are retained in `_bmad-output/implementation-artifacts/evidence/story-1-3/` and `.tastemaker/decisions.log`; neither is a build input.

## Source and license

Official release: [Geist v1.7.2](https://github.com/vercel/geist-font/releases/tag/v1.7.2), archive `geist-font-v1.7.2.zip`, SHA-256 `7fc800d2ac6b92844895196e5041aca55d814c15db70c44f79b3b83ab82b04e2`. Embedded font version is **1.800**. Sources are `geist-font/Geist/ttf/Geist-Regular.ttf` and `Geist-Medium.ttf`. Copyright 2024 The Geist Project Authors; SIL OFL 1.1, with no reserved font name in the copyright header. The full unmodified license is shipped beside the fonts at `public/fonts/OFL.txt` (SHA-256 `c683bfbcc7e087f5d37a54ef628f10387c451a83ddc459b151403a164ac46c90`). No purchased assets.

| Static asset | Weight | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| geist-400-latin.woff2 | 400 | 27,204 | `7cf62d9cc4a6ac308881809209907914f30f2761e563eaf183742c778b8a70c2` |
| geist-500-latin.woff2 | 500 | 27,992 | `2b8cde7211482aa3b55a022f5a810a1b170d16e6da7433fed09cf6e05b37bd2b` |

Total **55,196 bytes**, below 60,000 bytes. No alternate, italic or variable font ships. WOFF2 files are build inputs; no cache, source TTF, Python tool or planning document is needed to build.

## Subset reproduction and coverage

Source TTF hashes: regular `5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615`; medium `0090e004725f6f64b841715b4167920580f883fcf9b67fc6d744089103fec101`.

Prepared with FontTools 4.59.0 and Brotli 1.2.0, timestamp recalculation disabled; all layout features, name IDs/languages, recommended glyphs and .notdef outlines retained. Requested ranges: `U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+FEFF,U+FFFD`. Each resulting cmap contains 458 supported codepoints; ranges describe a request, not a claim that every codepoint exists. The unsupported source `meta` table was removed. Preflight repeat runs reproduced the recorded hashes.

To reproduce independently of the ignored cache, download the release archive linked above, verify its SHA-256, and extract it. Save the following as `subset-geist.py` in a temporary working directory, then run:

```sh
uv run --with 'fonttools[woff]==4.59.0' --with 'brotli==1.2.0' python subset-geist.py /absolute/path/to/geist-font/Geist/ttf ./reproduced-fonts
```

```python
from pathlib import Path
import hashlib
import sys
from fontTools.ttLib import TTFont
from fontTools import subset

source, output = map(Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
records = [
    (400, "Regular", "5c8968eafb98a4c4f47033daf29e38e284a6f2a82eb017d171ab040fe7c4b615",
     "7cf62d9cc4a6ac308881809209907914f30f2761e563eaf183742c778b8a70c2"),
    (500, "Medium", "0090e004725f6f64b841715b4167920580f883fcf9b67fc6d744089103fec101",
     "2b8cde7211482aa3b55a022f5a810a1b170d16e6da7433fed09cf6e05b37bd2b"),
]
for weight, style, input_sha, output_sha in records:
    path = source / f"Geist-{style}.ttf"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == input_sha
    font = TTFont(path, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=subset.parse_unicodes(
        "U+0000-024F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,"
        "U+2190-2199,U+2212,U+FEFF,U+FFFD"))
    # Pinned FontTools drops unsupported meta with a warning; use its defaults
    # for other table handling. Preserve source naming and timestamps.
    worker.subset(font)
    font.flavor = "woff2"
    dest = output / f"geist-{weight}-latin.woff2"
    font.save(dest)
    actual = hashlib.sha256(dest.read_bytes()).hexdigest()
    assert actual == output_sha, (dest, actual)
    print(dest, dest.stat().st_size, actual)
```

The local coverage audit finds no missing non-whitespace characters in council threshold copy, the complete approved reflection JSON, current controls/caption/disclosure strings, and all names in the official WPP cached source with location types World, SDG region, Geographic region, Subregion and Country/Area. Additional Latin diacritic examples were checked. Curated search aliases are not yet supplied; audit those when Story 2.1 introduces them. Non-Latin visitor content is not supported by these subsets and uses the browser's system fallback. Re-audit new content rather than assuming arbitrary Unicode coverage.

## Fallback and preload

The regular face is preloaded same-origin with anonymous CORS; medium loads only when used. Both use `font-display: swap`. Local Arial is the explicit metric-adjusted fallback. At 100px, browser canvas measurements for the entire threshold corpus give Geist width 6218.998px versus Arial 6129.834px, producing `size-adjust: 101.455%`. Geist x-height measured 53px; Arial's measured 51.855px becomes 52.610px (0.39px difference at 100px, under 0.09px at the 22px quote size). This checks widths and x-height, not just ascent. Geist's 1000-unit em, 1005 ascent, 295 descent and zero line gap yield normalized overrides 99.059%, 29.077%, 0%. Medium can use the same regular local fallback until its real static weight arrives.

Where local Arial is absent, ordinary Arial/system sans/sans-serif fallback remains readable, but platform-specific metric identity is not claimed. Typography tokens have explicit line heights. Chromium held-font and failed-request studies at 1440×900, 375×812 and 320×812 showed visible fallback, identical block positions/sizes and identical line counts after font arrival. Narrow 320px naturally wraps the quote in both faces. Screenshots retain the visible glyph change; metric matching does not mean identical glyph outlines.

`tests/fonts.spec.ts` serves a non-production exact-copy fixture using production CSS, holds/aborts font requests, compares geometry and captures screenshots. It uses CDP for the held-font frame because ordinary Playwright screenshots wait for fonts to load. This is browser viewport evidence, not physical-device or manual VoiceOver evidence. Those acceptance checks remain external where required.
