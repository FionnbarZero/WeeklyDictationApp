# Report repairs 2 — audit findings, October 26, 2026

Audited application source: b3cfd1edc12ca060d14fc3984ba74ec2659fe9e1. Audit started at repository head 7627dc6 (handoff documentation and test observer only). Application code and websites remain unchanged.

## 1. Grade 5 Ninja Skills reading test cannot retry a failed final save (P1)

Reproduction: Practice your Ninja Skills → Reading Test → collect all nine responses → assess them → Submit final review while the result-ledger write fails once → restore storage (automatic after the one injected failure) → Submit again. On both the immutable local package and the hosted preview, laptop Chromium and landscape WebKit still have zero confirmed result records after the second submission. A pending result exists, so this is not evidence of irrecoverable deletion. The owner-facing notice promises retry, but the component's submitted guard has already been set and the retry does nothing.

Cause: the Grade 5 native test route explicitly sets retrySaveFailures to grade5PresentationPreview, which is false in this integrated build. Its finishReading callback also catches the save exception and rethrows only in that presentation mode. DeferredTestReview therefore treats the failed save as a completed submission and releases temporary captures before confirmation. The newer shared Final Boss route uses a different adapter with confirmed-save retry; its positive regression checks pass. Source inspection finds the corresponding writing-route guard is also presentation-only; the executable failure reproduction here is reading, not a claim of a completed writing failure reproduction.

Relevant source: src/grade5LearningHubHarness.tsx:550–583; src/testReview/DeferredTestReview.tsx:137–160; writing analogue src/grade5LearningHubHarness.tsx:410–416,466.

The presentation-only guards already exist in b36f736. This is a remaining integration gap, not proof that b3cfd1e introduced the failure.

Recommended repair: use confirmed-save/retry semantics across both Grade 5 Ninja Skills test entry paths, propagate failure to the review owner, retain captures until successful confirmation, and prove exactly-once retries. Do not reset child records or change assessment rules.

## 2. Grade 5 native reading review becomes narrower on a larger desktop (P2)

Observed in the same nine-response review: each row is only 176 pixels wide at a 1280-pixel desktop viewport, versus 376 pixels at a 1080-pixel landscape viewport. The hosted screenshot before submitting shows wrapped control labels and an answer control extending beyond the card. This happens before submitting, so it is not caused by the simulated storage failure.

Measured hosted ancestors show a 720-pixel practice stage with 272 pixels of padding on each side, leaving 176 pixels for the review. The embedded native Grade 5 practice stage retains viewport-derived horizontal padding inside an already constrained parent. src/grade5Lab/learningHub.css:32–40 leaves that padding on the static embedded stage; the new full-width Final Boss writing rules do not cover this legacy reading route. Preserve the approved design while giving the embedded reading review one usable width constraint.

Recommended verification: desktop, iPad landscape and portrait; every review row and Yes/Not yet/Hear/Submit control must fit and remain reachable. Check both Final Boss and Ninja Skills routes, since the previous positive tests covered completion and saving but did not assert reading-review geometry.

## Boundaries

The audit does not modify either preview release, the live/canonical app, the frozen fifth-grade website, shared curriculum service or family records. Browser tests use disposable synthetic profiles. Actual iPad/iMac speaker output, microphone permission/quality and Pencil feel remain physical-device checks. Authenticated/offline/cross-device acceptance remains separate from these browser-only previews. No new website or email was created.

## Verification record

Evidence directory: `family-beta-artifacts/report-repairs-audit-2026-10-26/`.

- Application source and published package: **b3cfd1e / Combined Dojo / Report repairs 2**. Repository audit base: **7627dc6**, whose changes after the application commit are handoff documentation and an audio test observer.
- All **1,299 unit tests** pass. Type checking, lint, required formatting and production performance budgets pass. Initial JS is **549,992 / 550,000 bytes**; CSS is **46,342 / 60,000 bytes**. The JS budget has only eight bytes of headroom; subsequent code repairs must respect that existing gate.
- Fresh hosted verification passes for **1,419 public files and 8,514 security/cache header values**. The earlier preview's **1,161 listed files** plus its manifest remain identical. Canonical manifest, frozen fifth-grade manifest and **182 files**, all existing Hosting release identities/expiries and **18 retired URLs** remain unchanged.
- Test-only improvements update older helpers for the restored Wetland guides, compare the reviewed recovery's curriculum identity when explicitly auditing this preview, and preserve previously stored records while allowing normal first-load bootstrap additions. Application behavior is not changed by these helpers.

**219 distinct local browser cases have passing executions, two additional Grade 5 save-retry cases fail, and three touch-injection cases are explicitly skipped.** The two failure cases also reproduce on the hosted preview. These are not all-green results, and the corrected-driver reruns must not be described as a uniformly clean first pass.

| Matrix | Result | Evidence |
| --- | --- | --- |
| Report repairs: complete games, wrong-answer recovery, Final Boss, reentry and changed audio | 87/87 pass | `browser.log` |
| Startup, failed stylesheet recovery, kept-alive writing/reload | 16 distinct pass after test-helper corrections | `startup.log`, `startup-corrected.log`, `startup-final.log` |
| Curriculum refresh, failure/retry, Report pause, unavailable source, active-game preservation | 36 distinct pass; first run 27/36, corrected Grade 2 expectations 9/9 | `curriculum.log`, `curriculum-corrected.log` |
| Scheduled activation and unchanged-lesson writing resume, all grades | 3/3 pass | `scheduled.log` |
| Drawing/scroll containment and Report/return | 9 pass, 3 unsupported WebKit touch-injection cases skipped | `scrolling.log` |
| Remaining Grade 2/Grade 5 native Warmup: concurrent tabs, failed saves and Report pause | 18/18 pass | `warmup.log` |
| Actual Kore audio decoding/completion, games, reading, guided writing, Report/Exit | 50/50 pass | `native-kore.log` |
| Additional Grade 5 Ninja Skills failed-save reproduction | 2/2 **fail locally** and 2/2 **fail hosted** | `recovery-confirmed.log`, `hosted-recovery.log` |

The main repair, startup, curriculum and Warmup checks cover laptop Chromium and/or landscape/portrait WebKit as recorded by their configurations; the 50-case independent Kore matrix uses laptop Chromium and landscape WebKit. The main repair matrix also covers portrait audio. Native media tests confirm browser decoding and playback events, not perceived physical speaker volume or pronunciation acceptance.

## Scope and recommended next step

The confirmed failure reproductions cover Grade 5 → Practice your Ninja Skills → Reading Test. They are not failures of the new shared Final Boss adapter, which is independently exercised for all grades. The report repair suite covers complete game rounds, incorrect answers, repeated entrance, report/return, Final Boss writing/reading collection and confirmed-save retry, all characters in guided reentry, twelve-stroke 最 and native slowed/gapped audio. Broader suites cover ordinary writing resume, startup stylesheet failure, curriculum refresh/outage handling, gesture containment and native Warmup storage/concurrency.

Fix the Grade 5 legacy test-saving handoff and reading-review width before promoting this build or inviting the next general smoke test. Preserve existing records, voice, teaching rules and both preview release identities. Physical-device acceptance, authenticated cloud/offline/cross-device acceptance, main reconciliation and unseen future curriculum audio/content remain separate roadmap items. Passing emulation is not physical iPad acceptance.

No changes were deployed or emailed during this audit. The existing Report repairs 2 links still expire **November 2, 2026 at 1:47 PM Pacific**; the previous Device repairs 1 links remain static with their original expiry.

## Failed-run accounting

The audit is not a clean all-green run. Preserve failures and their classification:

1. `startup.log`: 13/16 pass. Two Node-side trace helpers lack the preview-only Wetland medians; a WebKit assertion also treated an empty workspace's legitimate first-load additions as data loss. The trace confirms the former workspace had no progress records. `startup-corrected.log` passes the two CSS-recovery cases but still fails the two guide helpers because importing the app helper in Node leaves its build flag off. The final driver imports the reviewed guide data explicitly; `startup-final.log` passes both retained-writing cases. Every previously existing record remains byte-identical; no application change or checkpoint reset was used to obtain these results.
2. `curriculum.log`: 27/36 pass. All nine failing cases expect Grade 2's original truncated-source hash; the approved recovery changes the validated displayed identity. `REPORT_REPAIRS_AUDIT=1` opts the test expectation into that recovery. `curriculum-corrected.log` passes all nine cases, with the same application files. The additional scheduled-date checks pass 3/3, including unchanged-progress resume and new teaching only after the scheduled date at a safe menu boundary.
3. `additional.log` first exposes the Grade 5 save failure but expects the warning inside the child frame; the warning is in the outer page. `recovery-repro.log` contains an invalid test locator union across frames. `recovery-confirmed.log` corrects those observers and proves the actual defect: zero confirmed records after retry in both Chromium and WebKit. `hosted-recovery.log` repeats that exact failure on the published website. The original failed submissions still have pending result records; none were reset or erased.
4. The scrolling matrix explicitly skips three WebKit touch-injection cases because the native touch-move test uses Chromium CDP. This is a tooling limitation, not a passing physical-iPad test. The wheel-containment and outside-scroll checks run in both engines.

The new failure reproduction is retained in `tests/report-repairs/audit.spec.ts` and intentionally remains failing until the product defect is repaired. The audit's source edits are confined to test drivers and documentation.
