# Deployment and visitor privacy

Project `still-here` (`prj_0v92SgemZWOLiy1nYaO8peJSgdR5`) belongs to `dres-projects-71e8c4e5` and is Git-connected to `tantshirt/still-here`. `main` is the production branch; other branches create previews. The assigned production domain is https://still-here-one-eosin.vercel.app.

Use Node 24, `npm ci`, and `npm run build`; Vite emits `dist`. All build sources are tracked, including `docs/DESIGN.md`; local planning documents are excluded by `.vercelignore`. Project settings were inspected and configured on 2026-09-24: Vite, Node 24.x, the commands above, no application environment variables, Web Analytics disabled, preview and production feedback toolbars disabled. Deployment protection is disabled so the artwork and preview audit are public without authentication cookies.

The specified scope already uses Pro. The coordinator authorized using that existing plan instead of the planned Hobby account; no subscription, billing, or paid add-on was changed.

`SITE_URL` is a build constant, resolved from an explicit build-only `SITE_URL`, then `VERCEL_PROJECT_PRODUCTION_URL` for production (falling back to the stable assigned production domain), or `VERCEL_URL` for previews. Local builds default to the assigned production domain. Invalid origins fail the build. It is exposed through `src/site.ts` and the generated canonical link, with no runtime configuration required.

The global Content-Security-Policy permits only same-origin scripts, styles, fonts, images, connections, media and workers. Frames, forms, objects and manifests are prohibited. Referrers are suppressed; geolocation, camera and microphone are disabled. Filesystem routing overrides every missing response, including missing assets and fonts, to `no-cache`; HTML also uses `no-cache`; hashed assets, captured stills under `/stills/`, and licensed self-hosted fonts use immutable one-year caching. Change font filenames when their bytes change. Re-capture stills after render changes (`node tools/capture-still.mjs`).

The Vercel build includes the `api/geo` edge handler from `api/geo.ts` (JSON `{ country }`, `Cache-Control: no-store`). Verify it on preview with `curl -I https://YOUR-PREVIEW.vercel.app/api/geo`.

There is no analytics package or endpoint, cookie, localStorage, IndexedDB, manifest, install prompt, spinner or progress bar. The optional session helper accepts only boolean `sh.sound` and `sh.pausedByUser` values, catches storage getter/read/write failures and rejects invalid runtime keys. Later controls stories own preference wiring.

```sh
npm ci
npm run test
npm run test:e2e
vercel deploy --target preview --scope dres-projects-71e8c4e5
PLAYWRIGHT_BASE_URL=https://YOUR-PREVIEW.vercel.app npx playwright test tests/privacy.spec.ts tests/entry.spec.ts
curl -I https://YOUR-PREVIEW.vercel.app/
```

Use `--target preview` explicitly: Vercel classified the first plain `vercel deploy` as production and assigned the public production alias during story 1.6, despite no `--prod` flag. That deployment was not a reviewed-main promotion. The root coordinator owns subsequent reviewed Git promotion to `main` and the final production audit. Local evidence records the initial deployment and the separate explicit preview. No story helper switches branches or promotes `main`.

Verified 2026-09-24: explicit preview https://still-here-nio8f9mek-dres-projects-71e8c4e5.vercel.app passed all 15 hosted entry/privacy checks, including 200 asset/font responses and 404 missing-route/manifest responses with the required headers. Node 24.21.0 local verification passed 26 unit tests, 117 tooling tests, and 39 browser tests (one hosted-only check intentionally skipped locally). An isolated build using tracked sources plus the new story files, without ignored planning directories, passed. Coordinator staging and reviewed-main promotion remain separate handoff steps.

Review verification: https://still-here-hzzkh0jzp-dres-projects-71e8c4e5.vercel.app passed the two focused hosted privacy checks after the cache-routing fix. These now assert the complete CSP, zero attempted persistent writes and Set-Cookie responses, successful immutable assets, and no-cache 404s under both `/assets/` and `/fonts/`. Seven focused tooling tests passed, including real Vite canonical/runtime constant output and empty/whitespace Playwright target normalization.

Final coordinator verification of the reviewed patch passed 26 unit tests, 122 tooling tests, 39 local browser tests, and all 15 hosted entry/privacy tests on the final preview above. A staged tracked-files-only copy installed offline and built successfully without ignored planning inputs. Git-triggered main production deployment and its public production audit remain root-coordinator acceptance checks; the CLI preview does not establish those outcomes.

Follow-up review verification: https://still-here-4vz17ljlc-dres-projects-71e8c4e5.vercel.app passed all 15 hosted entry/privacy checks after transient session/cache/service-worker write probes, the `nosniff` regression assertion, and hashed-only asset caching were added. Node 24 verification passed 26 unit tests, 122 tooling tests, and 39 local browser tests (one hosted-only check skipped locally).
