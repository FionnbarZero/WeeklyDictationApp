# Kindergarten and Grade 5 writing extension

## Scope and checkpoint — October 15, 2026

The owner approved the Slay appearance and asked to extend the writing integration to the other grades, then confirmed **GPT-6 Astra · Extra High** for this stage. The approved five-step sequence is retained; the earlier redundant third tracing trial is not restored.

This checkpoint is an **isolated working cross-grade prototype and shared controller foundation**, not completed family-app integration or publication. The actual Kindergarten and Grade 5 launchers, existing family records, cloud sync and canonical Ninja Dojo have not changed. The older hosted Grade 2 comparison is not this build. The primary checkout's unrelated owner changes are untouched; implementation is in `codex/grand-scroll-integration`.

### Included

- The approved Slay teacher and acquisition writing boxes, with whole-word handoff only after every character finishes all five steps.
- The four-character portrait tablet preview uses two rows of two, because the inherited four-column row measured only 172.5px per box at 768px width. This is scoped to the isolated prototype, not the approved Grade 2 reference or whole app. Other layouts retain the approved styling.
- Teaching again before each next new target; same-word correction retains the grade's existing correction sequence without restarting the teacher.
- Original EduGames grade settings: Kindergarten's wider tracing tolerance, slower demonstration and final-step guide; Grade 5's stricter tolerance and hidden final guide. Grade 2 defaults and existing saved lesson policies are unchanged.
- Native Kindergarten/Grade 5 acquisition strategies, including their two initial familiar distractor trials before copy/target. This stage does **not** silently apply Grade 2's refined trace → independent → distractors policy to the other grades.
- Full retained teacher-source snapshots: five Kindergarten cohorts (16 word occurrences), five Grade 5 cohorts (25 word occurrences). All 41 occurrences validate without target filtering, truncation or substitutions, including Grade 5 three/four-character words. These samples do not claim to be today's live curriculum.
- Synthetic browser-only checkpoints by grade and source lesson; grade/week survives reload, confirmed steps/answers resume, and unfinished learner ink is never saved. Exit and Done return to the menu; **Done does not create a family score/history result in this prototype**.
- Existing report controls and pause behavior, whole-word audio and the seven-second clue. Browser speech is mocked in automated checks; physical iPad audio/Pencil/keyboard acceptance remains unverified.

### Deliberate boundaries

The family-grade launchers use `familyAcquisitionStore` / `writing-dojo`, unlike Grade 2's atomic app-state writing pilot. The new cross-grade preview contract uses only its synthetic `ninja-cross-grade-writing-preview-v1:*` keys. It is not a migration or a cloud schema change, and its new policies are not activated by the production launchers.

Before real integration, the grade-native adapter must preserve checkpoint + teacher position + reviewed trials + result ownership together, existing immutable completed results, writer claims, old-client/recovery protections and cross-device identity. Two unrelated saving keys are not a safe substitute. Existing started targets must finish under their pinned rules before the next target starts teaching.

Warmup, family history, authentication, cloud upload/recovery, target overrides and the separately requested correction redesign are not included in this isolated preview. Existing Grade 2 review/cloud evidence is historical evidence for its exact frozen package, not acceptance of this new cross-grade source.

## Verification

Frozen prototype source: **`33298205acd1d9d0179d547e0c4ac92feacc8381`**. The retained output is `cross-grade-writing-preview-dist`; its local server is port **5235**. All six served files (HTML, manifest, JS, CSS and both guide-license files) were independently compared byte-for-byte with the retained output. Canonical sorted receipt hash: `baa0ef4136332dc6a1aeb910c9857d1d04bc5dd13e86f94770655b25b45d7e87`. JavaScript SHA-256: `7366a2e425ff0af06291c4b72e76f8e99fa7a1084c6c7df63b7996fb52d1442a`; CSS SHA-256: `235779e1f8dcda6792af70a5d22ef42b4088cabe9251fc37731cfff0b67d5c28`. This is not a hosted release; the primary code checkout and older local reference packages were not replaced.

Local-only entries, usable on this computer while its preview server runs:

- [Kindergarten](http://127.0.0.1:5235/cross-grade-writing-preview.html?grade=kindergarten)
- [Grade 5](http://127.0.0.1:5235/cross-grade-writing-preview.html?grade=grade5)

Do not offer those localhost URLs as cross-device/iPad access. Do not substitute the older hosted Slay comparison.

Initial checks: 1,134 unit tests pass, including new all-cohort native-flow parity, every-character gates, correction and old-target boundaries, failed-readback exact retry, stale/wrong-owner rejection and Grade 2 policy/contract preservation. Typecheck and lint pass. Production performance remains within the unchanged limits: 549,823 / 550,000 initial JavaScript bytes and 46,288 / 60,000 CSS bytes.

Final exact-source acceptance on `3329820`: **1,134/1,134 units, typecheck, lint and production build/performance pass. All 15 cross-grade browser cases pass**: five Chromium landscape, five WebKit landscape and five WebKit portrait. The checks cover complete five-step teaching of all characters, exact step resume after reload, grade-specific final guide visibility, native acquisition prompts, next-word teacher entry, Exit/resume, grade checkpoint isolation, seven-second clue/report pause and three/four-character box size/viewport plus report/Done/resume controls. Synthetic speech and blocked external requests mean these are not physical iPad audio/touch or cloud tests. Final screenshots were visually inspected for the frozen identity, usable writing areas and reachable controls.

Retained exact-source logs:

- `/tmp/ninja-cross-grade-units-3329820.log`, `/tmp/ninja-cross-grade-typecheck-3329820.log`, `/tmp/ninja-cross-grade-lint-3329820.log`, `/tmp/ninja-cross-grade-performance-3329820.log`.
- `/tmp/ninja-cross-grade-3329820-chromium.log` and output folder of the same stem.
- `/tmp/ninja-cross-grade-3329820-webkit-landscape.log` and output folder of the same stem.
- `/tmp/ninja-cross-grade-3329820-webkit-portrait.log` and output folder of the same stem.

**Grade 2 regression: 4/4 actual-app pilot browser cases pass on the same `3329820` source.** These verify Done versus Exit completion semantics, all-character five-step teaching → acquisition → next-word teacher with saved-step resume, and preservation of a pinned older six-step lesson. Retained local package: `/tmp/ninja-cross-grade-grade2-3329820`; log and screenshots: `/tmp/ninja-cross-grade-grade2-regression-3329820.log` and the same-named output directory. This is a narrow shared-component regression, not a new real-backend acceptance or re-publication of Grade 2. Total final browser acceptance for this stage is **19 passed** (15 cross-grade + 4 Grade 2 regression).

Early browser attempts are retained rather than counted as passes:

- The first driver could not resolve the wrapped grade-select label; the preview now provides explicit accessible names.
- An immediate persisted-flow assertion sampled before the asynchronous locked save finished; the test now waits for the next visible prompt.
- The prototype header was behind the teacher shell, blocking Report; scoped stacking fixed it without changing the approved shared appearance.
- Initial portrait checks detected a partially scrolled report control. Scoped preview header padding and acquisition minimum-height were corrected; final portrait acceptance is recorded separately.
- The initial longer-word driver measured the model text rather than its writing box; it now measures actual cells. That confirmed a genuine 172.5px four-character portrait box. The isolated two-by-two treatment passes the unchanged minimum-size and in-viewport checks, including report pause, Done and resume. Failed-run traces are retained in `/tmp/ninja-cross-grade-webkit-portrait-v2` and `/tmp/ninja-cross-grade-long-words-initial`; they are not acceptance passes.

### Prospective owner check

After the separate test website is authorized and exact-file verified, provide its precise links and **Prototype 1 / `3329820`**, clearly marked isolated and not live Ninja Dojo. Allow about **8–12 minutes total** for Kindergarten and Grade 5. On iPad, check automatic audio after tapping Start, finger/Pencil strokes, landscape/portrait (especially Grade 5 four-character boxes), report pause, Exit/reload/resume and return to the teacher for the next new word. On iMac, check pointer strokes, Type/Hear/Skip Timer and visible completion controls. Report findings through the existing report button; no child names or saved recordings are needed. Remind the owner that this prototype has local-only progress, no Warmup/family score/cloud integration and unchanged correction rules. Whole-app smoke testing remains premature.

## Remaining order

1. Verify and freeze this exact isolated cross-grade build; obtain working-interaction approval where the new grade-specific behavior differs. A separately hosted preview requires publication authorization and the deployment skill; localhost does not provide iPad/other-computer access.
2. Integrate the approved flow through each native grade's launcher and atomic saving/completion adapter using **GPT-6 Astra · Extra High**. Do not reopen the approved visual design or change unrelated activities.
3. Obtain the narrow cross-grade independent review with explicit authorization, then exact-candidate compatibility, cloud/offline/second-device and guarded-recovery checks. Retain valid unchanged evidence; do not repeat unrelated broad programs.
4. Complete the existing protected release gates. Bounded reviewed publication is **GPT-6.1 Sol · High**. Verify exact served source/assets before a physical-device handoff; use canonical links for ordinary beta testing and identify any isolated pre-release link explicitly.

No PR, merge, deployment, real-family access, account/security changes, data reset or email occurred in this stage.
