# Writing Warmup design prototype — October 25, 2026

## Owner-approved interaction

The owner requested question-by-question design and rule review. Seven choices are settled:

1. Hear the word, write the whole word from memory, reveal and compare.
2. An incorrect whole word enters guided correction, followed by another whole-word memory attempt. Repeat until correct.
3. Correction is **one guided tracing trial per character**, in word order, with immediate order/direction feedback. It is not the acquisition five-step backward chain.
4. Use the approved Slay background, large centered boxes and compact controls.
5. Each memory attempt has **10 seconds after the complete prompt audio finishes**, with Skip Timer to open comparison early. Guided tracing is untimed.
6. Cover Kindergarten, Grade 2 and Grade 5 in the integrated-app workstream; keep the standalone fifth-grade presentation frozen.
7. Only the first independent answer counts toward mastery. Guided correction and successful retries are practice, and cannot turn the first incorrect response into mastery success.

## Isolation boundary

`warmup-design-preview.html?grade=kindergarten|grade2|grade5` is a new, isolated route on the existing combined preview origin. It demonstrates the interaction before modifying grade-owned Warmup engines. It is not the normal scheduled Warmup launcher or an activated canonical feature.

The package retains every byte of the existing combined Prototype 6 application (`89bc62cc262cc28dc2e914c4d02775b7f9e96292`), including its original manifest. Only the new page, its two bundled assets and its own manifest are added. No existing application module is edited. `scripts/package-warmup-design.ts` verifies the retained baseline and refuses mismatched asset overwrites or an existing output directory.

Explicit samples use original retained teacher-source targets and complete guides:

| Grade | Samples |
| --- | --- |
| Kindergarten | 人、牛 |
| Grade 2 | 走、哪里、有爱心 |
| Grade 5 | 盐、用处、神奇的、各种各样 |

They cover one through four characters; they do **not** claim to be a child's current scheduled review set. Kindergarten uses its existing recordings/context catalog and repaired full-recording loader. Other grades retain their existing speech profile and retry path. The approved brush, stroke geometry, grade-specific tolerances, shared activity clock and Report component are reused.

## Checkpoint and scoring behavior

Only `ninja-warmup-design-v1:<grade>` test keys are written. The record contains the sample signature, phase, word/character position, revision and first-attempt booleans. It contains no handwriting, typing, recording, child identity or family score. A first wrong answer is stored before opening the guide. All characters must complete before memory retry; further wrong answers restart the same all-character correction. One success then advances to the next word without changing the first answer.

Closing/reopening preserves the reviewed result and completed character position. Unfinished ink is temporary; an unscored comparison reopens as a fresh memory attempt. A storage failure prevents advancement. The existing exclusive `withScrollsWrite` lock serializes each compare/checkpoint write; its expected-record check rejects stale tabs. Exit/reopen loads the current checkpoint. Reports pause the shared activity clock and cancel active pen gestures. Only the prototype's explicit completed-session “Practice these samples again” action starts its samples over.

The native grade schedulers, required/optional Warmup policies, word-selection rules, mastery thresholds, acquisition sequences, reading and cloud records are unchanged. Their eventual integration needs this working interaction's approval and existing compatibility/release gates. No separate-agent review or model switch is claimed. The work proceeds under the owner's standing autonomous W-repair authorization and recorded Astra · Extra High behavior-stage assignment.

## Verification record

Working evidence: `/tmp/ninja-warmup-design.YORuxh`.

- Initial implementation: **1,265 unit tests pass**. Focused contract tests cover repeated wrong/retry sequences, multi-character completion, first-attempt-only scoring, reload, malformed checkpoints and all sample guides.
- Initial browser matrix: **9/21 pass, 12 fail** on WebKit's clipped SVG geometry. Actual inspection measured a 371×375 SVG inside a 371×371 content box; the final four pixels were clipped. The isolated CSS now uses square intrinsic SVG height. The tests retain full-viewport and square-surface requirements; thresholds were not weakened.
- Review also connected Kindergarten's recorded audio, keyed readiness to the exact current trial so a previous prompt cannot enable the timer, and kept storage-error messages clear of Exit.
- The next browser run passed **27/30**. Three fractional-pixel SVG clipping cases remained; a one-pixel inset fixes them without weakening viewport assertions. The following **33-case** run covers all four-character correction and natural timer completion as well.
- Source review found that a synchronous expected-record check alone did not serialize two simultaneous tabs. The candidate now uses the same exclusive write lock as existing saved practice. A new lock-hold/duplicate-click test fails against the unlocked `e898e06` package, establishing that the test detects the missing fence. This is independent of the earlier sequential stale-tab test, which already passed.
- After the clipping fix, the 33-case run exposed the previously unreachable four-character portrait size check: four boxes in one row were only 166.5px wide. The isolated portrait layout now uses two rows of two; the comparison also uses two columns for the child's four characters. The >180px writing-box requirement is retained. Twelve existing-app reading/writing entrance checks pass; its original 193 packaged files (192 public) are byte-identical.
- That run finished **31/33**: the second failure was tracing geometry moving between strokes. Fixed feedback-row space, an explicit full-width grid column and removing only the interactive card's entrance transform keep the pen surface still. New bounding-box assertions retain a <1px movement limit. The correct four-character model now wraps intentionally into two rows as well.
- The first locked-store run was stopped after **5 passes, 6 failures, 1 interrupted case and 24 not run**. It exposed immediate-read assumptions in the old synchronous driver and a UI publication gap before the lock promise settled. The next screen now appears only after release; the driver waits for committed visible stages instead of assuming a click is a synchronous save. A focused follow-up passed 2/3 and caught the remaining entrance animation; after removing that transform, **4/4 focused portrait/lock/failure cases pass**. Failed and interrupted runs are retained, not counted as successes.
- Final application revision **`9a0cce38eea05690ac7bb51ce9968d658b0e0b49`** passes **1,265/1,265 units**, **36/36 local packaged browser cases**, typecheck, scoped formatting/lint and its isolated production build. The original app's **12/12 reading/writing entrance cases** pass. Original package preservation is exact: **193 original records unchanged (192 public), four added files**.

## Publication and hosted acceptance

The page is added to the existing `w-repairs-oct23-v1` channel, with all original combined-app bytes retained. The new Warmup page identifies **Warmup prototype 1 / `9a0cce3`**; ordinary `family-beta-preview.html` remains **Prototype 6 / `89bc62c`**. These are different routes, not a claim that scheduled Warmup integration has shipped.

- Hosting version: **`e28106816f1faef7`**.
- Combined package tree: **`2b75e97ca8556a57bc706c971b05f6ce3e28cd79f9577952aac493973bab10c9`**.
- Expiry: **November 1, 2026 at 6:29 AM Pacific** (`2026-11-01T14:29:48.620724286Z`, after the daylight-saving change).
- Verified exact hosted content: **196 files / 1,176 headers**. Frozen Grade 5: **183 files / 1,098 headers**. Canonical identity, the original combined manifest and all **18 other hosting releases/expiries** remain unchanged.
- [Kindergarten](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/warmup-design-preview.html?grade=kindergarten) · [Grade 2](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/warmup-design-preview.html?grade=grade2) · [Grade 5](https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/warmup-design-preview.html?grade=grade5).

The final hosted matrix passes **36/36 in one clean run**, matching the **36/36 local** run. Coverage spans laptop Chromium and landscape/portrait WebKit: repeated wrong/correct cycles in all grades, one- through four-character layout/controls, every-character completion, first-attempt-only results, reload, Report pause, failed-save retry, exclusive lock/duplicate clicks, stale-tab fencing, blocked-speech recovery and actual Kindergarten recorded-media completion before timer activation. Most interaction cases use controlled audio; the native-media case does not fake playback or completion. Source/automated review is bounded, not an independent-agent audit or physical-device acceptance.

**Email confirmed SENT by metadata readback: `1a1737babe68e831`**, October 25 at 7:34 AM Pacific. It includes all three exact links, grade names, build/expiry, sample/browser-only limits and the 5–8 minute iPad checklist. No child records or credentials are included.

Final package and retained evidence: `/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/family-beta-artifacts/prototypes/warmup-design-9a0cce3/`. The `evidence/` directory contains final local/hosted logs and screenshots, unit/quality/build results, original-byte preservation, failed/development/negative-control runs, channel/manifest snapshots, publication and exact-verification receipts, and email/readback receipts. No failed runs were discarded or counted as passes.

## Device handoff and remaining scope

Allow **5–8 minutes on an iPad**. Check portrait/landscape, automatic audio and Hear, a wrong answer followed by every character's guide, a reversed stroke, whole-word retry, Report/return and Exit/reopen. Use the existing Report a problem button. A corrected word must still count as initially incorrect in the final first-try total.

Browser automation does not prove physical speaker output, Pencil behavior or native keyboard fit. This sample prototype has no family account, scheduled word selection, cloud synchronization, real mastery writes or offline installation. Canonical Ninja Dojo and the frozen `5th grade Dojo / 1a9db3e` remain excluded.
