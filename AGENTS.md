# STILL HERE implementation

Build the two-screen artwork described in the approved planning, through all 34 stories. The user has authorized autonomous implementation, bounded parallel agents, reviews, fixes, commits, and publication to Vercel. Keep working through the backlog; do not stop to request routine choices already delegated here.

## Governing documents

Read the active story and its referenced context. Source precedence is:

1. `_bmad-output/design-council/rulings-2026-09-24.md`
2. `.tastemaker/style-lock.md`
3. `_bmad-output/planning-artifacts/ux-designs/ux-STILL-HERE-2026-09-23/DESIGN.md` and `EXPERIENCE.md`
4. `_bmad-output/planning-artifacts/architecture/architecture-STILL HERE-2026-09-23/ARCHITECTURE-SPINE.md`
5. `_bmad-output/planning-artifacts/prds/prd-STILL-HERE-2026-09-23/prd.md`

The complete backlog is `_bmad-output/planning-artifacts/epics.md`; progress is `_bmad-output/implementation-artifacts/sprint-status.yaml`. These process artifacts are intentionally local and Git-ignored. Do not assume ignored means absent. Do not publish the entire process tree.

## Implementation boundaries

- Vite, TypeScript, Three.js WebGLRenderer, XState and plain DOM; no UI framework. Establish the typed ports and single frame loop before parallel implementation.
- Follow the approved tokens, exact visitor copy and timing. Keep the simulation pure and seeded. Views never own simulation or application state.
- Every production build input must be tracked. `docs/DESIGN.md` is the committed build-token source, synchronized with the approved local DESIGN.md when tokens change. Copy the approved reflection content into tracked `content/` as its story requires. A clean checkout must build without `_bmad-output/` or any other ignored planning directory.
- Reference PNGs are art direction, never substitutes for the live 3D scene or its production fallback/share captures.
- Verify package availability and peer compatibility before pinning. Record necessary compatibility adjustments in the architecture memlog; do not silently change the architecture.
- User delegates typeface and figure-quality choices. Compare real renders, select the best compliant option, and record screenshots plus a clearly labeled delegated decision. Do not invent direct user sign-off.
- No paid asset purchases or artist commissions are implied. Source and record compliant licenses for fonts, geometry, clips and sound.

## Coordination and completion

- Stories integrate serially on `build/still-here`. Use subagents for independent bounded work and fresh reviews. The story coordinator owns commits and sprint updates; helpers do not commit or change shared status.
- Run the BMad build-auto workflow, fix validated review findings, and retain evidence. Do not mark work done merely because a session or command finished.
- The owner authorized continuing if real-device or VoiceOver checks cannot be performed. Keep the exact unmet criteria in `operator_actions` and use the loop's `awaiting-operator` state. Browser emulation is not physical-device performance or manual VoiceOver evidence. Independent work may proceed provisionally.
- Keep normal permission boundaries. Never add approval/sandbox bypass flags to make automation work. Surface an actual inaccessible prerequisite with its precise required action and continue independent work.
- Initial deployment target: a new `still-here` project in Vercel scope `dres-projects-71e8c4e5`, connected to `tantshirt/still-here`. Use the assigned `.vercel.app` domain; no domain purchase. No analytics. The root coordinator publishes verified milestones through `main`.
- The root coordinator handles loop lifecycle and production promotion. Story sessions may implement/deploy the deployment stories, but must not launch nested orchestration loops or change Git branches while another session is active.
- Report implementation completion separately from acceptance completion if external checks remain. Never silently omit unfinished stories or deferred required fixes.
