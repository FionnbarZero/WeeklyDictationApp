# Prototype 6 regression audit — October 25, 2026

## Outcome and scope

**No reproducible application regression found** in this bounded audit of published **Prototype 6 / application `89bc62cc262cc28dc2e914c4d02775b7f9e96292`**. The initial broad game run was **89/90**, not a clean 90/90. The one failure concerned observing a brief Sushi feedback message; its visible rendering and correct advancement were verified in the retained trace, three unchanged repeats passed, and all four related cases passed after a small test-only timing improvement.

The audit changes that test and documentation only. Application logic, layout, curriculum, hosted websites and user progress are unchanged. This is source and automated review, without a separate review agent or claimed model switch. It does not certify every historical roadmap issue or authenticated release gate.

## Fresh checks

| Check | Result |
| --- | --- |
| Units | **1,261 passed**, zero failed/skipped. |
| Hosted compact layouts | **26 passed**: all three grades on laptop Chromium and portrait/landscape WebKit, plus Grade 5 narrow/reduced-height cases. Includes saved resume, guided correction, wrong answers, retry, Report/return, completion and reopening. |
| Hosted writing and reading | **20 passed** across desktop Chromium and landscape WebKit: current default launches, actual teacher/acquisition flow, reporting pause, reopening, reading exit/reopen and repeated Grade 2 copy/memory correction with reload. |
| Hosted games, audio and recovery | **89 passed / 1 failed initially** out of 90, across Chromium/WebKit and all grades. Includes full game completion, denied audio/replay, native Kindergarten recordings, pending audio cancellation, saved-game conflicts/reopening/discard and completed-result preservation. |
| Original failed Sushi case repeated unchanged | **3/3 passed**. |
| Related Sushi cases after test-only adjustment | **4/4 passed**: Grade 2 and Grade 5, both engines, with animations enabled. |
| Type check and changed-test Biome check | Passed. No application build or publication was needed for this test/documentation audit. |
| Exact hosted files/headers and protected releases | Passed; details below. |

The 136 distinct browser cases have passing coverage across these runs. This is not a claim of one clean 136-case execution. The original failure is retained and is not silently counted as passing. Tests use fresh synthetic browser contexts, never the owner's existing profile or real-family records. Some speech/media outcomes are controlled; the native Kindergarten cases use the actual hosted recording responses.

## Investigated failure and test improvement

The Grade 2 desktop animated Sushi check failed at `toBeInViewport` for `.lg-feedback.is-correct`, reporting **element not found**, rather than an off-screen intersection ratio. The preceding visibility assertion succeeded. Extracted trace frames show **Perfect order! fully inside the screen**, followed by **Sentence 2 of 6** with the correct progress count. Three exact repetitions of the unchanged test passed without application modifications.

The evidence supports a timing-sensitive automated observation of the game's existing automatic feedback/advance sequence, not a reproduced app layout or scoring regression. The source change removes the redundant preceding `toBeVisible` wait, retaining the original full-viewport assertion (`ratio: 1`), all layout-stability assertions, screenshots, automatic advance and Exit checks. It changes no animation, feedback duration, scoring, tolerance or application code. All four animated Sushi cases then pass. This avoids spending two polling steps observing the same short-lived message; it is not a guarantee that timing-sensitive browser tests can never fail.

Retained evidence includes the original failed trace, the `sushi-initial-failure-timing.json` extraction, feedback/next-round screenshots, the unchanged-repeat logs and the final focused recheck. Source inspection confirms the application diff from Prototype 5 consists of the previously reviewed two-game preview CSS and version labels; no Sushi behavior changes were introduced by that release.

## Unchanged publication and protection

Hosting version **`eca35a83b4a7af77`**, tree **`31e1633e8290d811ba8ca14174ccf73369a5ca0a4911fd865440ebaf346d977d`**, expiry **November 1, 2026 at 5:20 AM Pacific**. All **192 files / 1,152 headers** still match the retained Prototype 6 package.

Frozen standalone Grade 5 remains `1a9db3e34860fa886afa337ad42028d9bfb69014`, verified across **183 files / 1,098 headers**. Canonical remains `9d06a02f89e0807b202a82316841e25cf8c48c6d`. All **19 hosting releases/expiries**, including the audited preview, are unchanged. No deployment, merge/push, report reset, teacher-document edit, authentication change or delivery email occurred during this audit. The existing Prototype 6 email receipt remains `1a1733b16644abe1`.

## Device check and remaining limits

The same isolated Prototype 6 links remain available: [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=kindergarten) · [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade2) · [Grade 5 — regular curriculum](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=grade5).

The existing **3–5 minute iPad check** remains useful: both orientations, wrong-match retry, Pinyin with the native keyboard, Hear/replay, Report/return and interrupted writing resume. These automated checks do not establish physical speaker output, native keyboard placement, Pencil accuracy or authenticated/offline/cross-device saving. The preview uses synthetic browser-only progress. Parent editing, automatic source refresh, future imported content, unresolved broader policy/voice work and canonical integration retain their existing roadmap status.

Evidence: `/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/family-beta-artifacts/prototypes/w-combined-89bc62c/regression-audit-2026-10-25`. Original working directory: `/tmp/ninja-prototype6-audit.YrAyok`. The application and publication identifiers above remain the authority; later test/documentation commits do not constitute a new hosted build.
