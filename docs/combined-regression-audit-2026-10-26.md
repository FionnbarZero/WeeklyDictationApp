# Combined Dojo — audit and regression analysis, October 26, 2026

Audited application: **b36e8982ffd9d26845bfc8e5fabc28747f58a5c4**, Combined Dojo / Grade 5 recognition review 1. Audit began at documentation/test head **3c96dad**. This audit changes tests and documentation only. No deployment, application repair, record reset, canonical update or change to the frozen standalone fifth-grade website occurred.

## Findings and cause analysis

**Two inherited Grade 5 native-reading-test defects remain open.** Neither is a failure of the new 50-word assessment adapter. To reach the retained route, open Parent controls, choose Practice week **2026-10-13**, then Practice your Ninja Skills → Reading Test. This explicit week selection is necessary because the current owner-approved review intentionally replaces that route for the active assessment.

1. **P1 — retry after a failed final save does nothing.** Collect nine responses, assess them, inject a single failed result-ledger write, then press Submit final review again. Both local and hosted laptop Chromium and landscape WebKit retain nine review rows but still have **zero confirmed results and one pending result**. Storage works again after the first injected failure. The pending result is preserved; this is not proof of irreversible data deletion. `src/grade5LearningHubHarness.tsx:550–583` makes error propagation/retry conditional on the presentation-only flag, which is false here. `src/testReview/DeferredTestReview.tsx:137–160` therefore treats the callback as successful and keeps its submitted guard set. The writing analogue has the same conditional pattern; this audit does not claim an executable writing failure reproduction.
2. **P2 — the retained reading review wastes desktop width.** Hosted review rows measure **176 px at 1280 × 720**, versus **376 px at 1080 × 670**. `src/grade5Lab/learningHub.css:32–40` retains viewport-derived horizontal padding inside an already constrained 720 px embedded parent. This occurs before the simulated save failure. The newer full-width review uses a different adapter and passes its layout checks.

The three relevant source files are identical between the earlier audited **b3cfd1e** and current **b36e898**. These are remaining native-route integration gaps, not evidence that the Wetland book or manual 50-word review introduced them. The current Grade 5 shared assessment verifies successful exactly-once retry from both Ninja Skills and Final Boss. Do not generalize those safe-adapter passes into a claim that every older native route is repaired.

**Next repair boundary:** propagate confirmed save failure through the native Grade 5 completion callback, retain review/captures until confirmation, allow exactly-once retry, inspect both native test entries, and remove the duplicate width constraint without changing the approved presentation or assessment rules. Provide a separate working prototype before whole-app integration. Current links remain static.

## Fresh verification

Evidence directory: `family-beta-artifacts/combined-regression-audit-2026-10-26/`.

- **1,303 unit tests pass.** Type checking, lint, required formatting and production build/performance gates pass. Initial JavaScript is **549,992 / 550,000 bytes**; CSS **46,342 / 60,000 bytes**. The eight-byte JS headroom remains a constraint for future repairs.
- **All 30 hosted current-review checks pass**, across laptop Chromium and portrait/landscape WebKit: the same 50 ordered words in all three lifecycle sections, writing disabled, original mastered pool preserved, all 50 responses collected before final scoring, retry after failed final save, checkpoint resume, all three available reading games, and native Kore recordings/automatic playback. All 50 review recordings decode. Kindergarten and Grade 2 menu guards pass.
- **Six additional local source-refresh checks pass:** the manual Grade 5 review survives updated teacher snapshots, an active reading attempt is not replaced during refresh, and its checkpoint resumes after Exit/reload. This covers a transition missed by a static word-count check.
- **228 local browser cases pass; two retained native reading-save cases fail, and three unsupported gesture cases are skipped.** Older Grade 5 native save-retry checks intentionally remain failing assertions against the expected correct behavior; they were not weakened to obtain a green report.

## Suite accounting

| Suite | Passing cases | Failing cases | Explicit skips |
| --- | ---: | ---: | ---: |
| Manual review source-refresh/resume, local | 6 | 0 | 0 |
| Cross-grade game/correction/saving/audio repairs, local | 63 | 0 | 0 |
| Wetland teaching, reading, game recovery and recordings, local | 15 | 0 | 0 |
| First-click and lazy-stylesheet startup, local | 16 | 0 | 0 |
| Curriculum refresh/scheduled activation/launch protection, local | 51 | 0 | 0 |
| Native Warmup conflicts/save retry/Report pause, local | 18 | 0 | 0 |
| Handwriting/scrolling, local | 9 | 0 | 3 |
| Native Kore playback/Report/Exit, local | 50 | 0 | 0 |
| Retained native Grade 5 reading-save reproduction, local | 0 | 2 | 0 |
| Current Grade 5 review and other-grade guards, hosted | 30 | 0 | 0 |
| Retained native Grade 5 reading-save reproduction, hosted | 0 | 2 | 0 |

The completed local matrix totals **228 passes, two failures and three skips**; hosted current-review verification adds **30 passes**, with the same **two native-route failures** reproduced separately on the hosted site. `audit-summary.json`, `suite-results.json` and each suite log retain exact counts and completion receipts. Each of the two native reading test failures is a browser project, rather than a separate new product defect; their traces also supply the width measurements.

## Coverage boundaries

The local suites serve the immutable published package, rather than an unrelated development build. The generic curriculum, native Warmup and Kore matrices use their recorded historical dates to exercise ordinary grade routes; current Grade 5 review coverage uses the assessment-specific suite. The deliberately removed Kindergarten Spirit Warmup is excluded, rather than restored for an obsolete test. Game tests use disposable synthetic profiles and include wrong-answer recovery, complete rounds, save refusal/retry, writing checkpoint resume and Report/return. Browser media tests validate native playback/decoding events; they do not establish audible iPad speaker output, microphone quality or Pencil feel. Three WebKit native touch-injection checks are unsupported by the driver and explicitly skipped; wheel checks and Chromium touch checks remain executable.

The hosted native-route negative control reproduces the two retained Grade 5 issues described above. Ordinary local test passes are not proof of authenticated cloud/offline/cross-device persistence. This preview intentionally stores progress only in its browser origin; recordings remain temporary. Future unseen teacher text still requires reviewed supporting content/recordings; English Niamh and main/canonical reconciliation remain separate.

## Exact hosting verification and failed-run accounting

All **1,420 public files** match the immutable package, with **8,520 security/cache header values** verified. The canonical manifest, frozen standalone fifth-grade manifest and **182 files**, earlier preview manifests, all provider release identities/configurations/expiries and **18 retired URLs** remain unchanged. Current Hosting version: **91c38f0b34ec8daf**; tree **d3e72931af01de6d675177a9daa048002b43c0b2ca9682f63762a37c6381a8e8**.

The initial verifier completed all file/header checks, then failed an overly broad provider-response equality assertion because Hosting had populated optional `fileCount`/`versionBytes` statistics. The corrected comparison ignores only those two aggregate counters; it still compares release/version/configuration/expiry exactly. The final receipt reuses the already successful file checks and records this distinction. No republish or file change occurred. This is not described as an all-green first-pass audit.

The native-test driver was adjusted to select the retained historical week explicitly; otherwise the owner-approved 50-word override would audit a different adapter. A new source-refresh/resume test was added. No application code was changed to satisfy any checks. No independent-agent review or model switch is claimed.

## Current test links and device check

All three links use the same verified combined build:

- [Kindergarten](https://weekly-dictation-staging--grade5-recognition-nov6-v1-yvx9mrv0.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--grade5-recognition-nov6-v1-yvx9mrv0.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5](https://weekly-dictation-staging--grade5-recognition-nov6-v1-yvx9mrv0.web.app/family-beta-preview.html?grade=grade5)

**Isolated preview, not live/canonical. Expires November 9, 2026 at 4:05 PM Pacific** (provider expiry November 10, 00:05 UTC). Existing older preview links remain static and may have earlier expiry. Keep the same browser/grade link for test progress; no data reset is required.

A bounded **3–5 minute iPad check per grade** is useful, with the retained Grade 5 caveats disclosed: listen automatically and with Hear; draw/scroll/rotate and use Report/return; Exit/reopen unfinished work. Grade 2: open Read the book. Grade 5: confirm the 50-word reading review, Writing Coming soon and unchanged Spirit Realm mastered words. Current-review smoke testing does not close the older native-test defects or the separate physical/cloud acceptance gates.

## Resend and repository receipt

All three verified current links and the two open findings were emailed to the owner’s confirmed address. Gmail returned **SENT**, message **1a17ba7c35cd3333**; receipt: `email-receipt.json`. The email includes exact build, preview status, expiry, device checklist and unfinished physical/cloud acceptance. No delivery claim is based on a draft. Repository changes for this audit are tests and documentation only.
