# One-page Grade 2 scroll layout mockup 9

October 15 owner request: v8 scrolls still too small. Relocate Hear and Skip Timer, remove “Listen, then write what you hear,” and provide one page directly testable on iPad. Owner also requested email delivery on completion.

This is a separate layout-only entry (`scroll-layout.html`), not an acquisition-controller change. It opens immediately with 英雄 on two Grand Scrolls, using the existing WritingPad/brush. A single bottom bar contains Hear, Skip Timer, Type and Clear. There is no instruction heading or teaching sequence. Landscape uses side-by-side scrolls; portrait stacks them to gain size. Report/exit remain reachable in the small header. The report component mounts after its header host exists, avoiding its default floating controls covering Type/Clear.

The 25-second display is explicitly a demo: no countdown or automatic progression. Skip Timer removes the tracing guide while retaining ink; Try again clears the temporary response and restores the guide. Hear plays 英雄 on tap. These mock interactions do not establish approved timing, scoring, correction, automatic speech, lesson progression, or cloud saving. No family account or learner data is read. Drawing/typing stay in memory; only owner-submitted problem reports can persist through the existing report mechanism.

## Verification

Dedicated Vite config uses no public directory and emits only entry HTML, CSS and JS (plus a hidden manifest, excluded from hosting). Application entries/configuration and v7/v8 retained artifacts are unchanged. Node 24 typecheck, full lint, dedicated build, and four Chromium responsive cases pass. Cases cover 1024×768, 768×1024, 1180×720 and 390×844: visible/unobstructed controls including Clear/report/exit, no instruction heading, drawing, typing, rotation preserving ink, Hear, repeated Skip/Try again, report modal and exit/return, and absence of writing/family storage keys. Speech is mocked; actual iPad sound and Pencil feel require owner feedback.

Chromium drawable widths: 469px at 1024×768 (v8: 390), 518px at 1180×720 (v8: 342), 388px in stacked 768×1024 portrait (v8: 321). These are viewport measurements, not a claim about every physical iPad. Inspect screenshots in `scroll-layout-test-results/`. The initial inspection caught floating report controls; fixed by delaying report mounting, and Clear hit-testing now guards against recurrence.

## Owner check

Allow 2–3 minutes on iPad. Open directly; draw in both scrolls, rotate between landscape and portrait, tap Hear, type, and try Skip Timer/Try again. Check that no controls cover the paper or input. Use Report a problem for feedback without child-identifying information. This is only a layout mockup; existing hosted lesson previews and canonical Ninja Dojo are unchanged. Working-layout approval is required before integrating this arrangement into acquisition.

## Hosted comparison A — October 15

Verified website: https://weekly-dictation-staging--scroll-layout-v9-atczruk5.web.app/

Source `115eab03f3c61fffc7ee06352e2e47a700072b62`; hosting version `ea4a527be5ea37c5`, release `1792094008347000`, expires November 14, 2026 19:53 UTC. Exact hosted root plus all three public files and all six headers match the retained artifact. Four local Chromium, four final local WebKit, four hosted Chromium and four hosted WebKit cases pass. These checks use simulated viewports and mocked speech, not a physical iPad. The new channel is separate from v8/v7/v4 and staging live; prior identifiers remain unchanged.

JS SHA-256 `52bd7f9f1e879655b854d530ab24cb53233ca03011804f953e1b8c3a7cdc2e8c`; CSS `7ee05020d3538c1cae31066d092b094ce4a6fa644cd860dc287612f340b8262d`.
