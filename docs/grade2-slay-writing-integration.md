# Grade 2 approved Slay writing integration

## Owner decision — October 15, 2026

Owner selected the working Slay-style comparison B (`33a6191`, hosting version `fc74ec248116afbb`) over Grand Scrolls and explicitly requested embedding that appearance with guided stroke-order teaching and acquisition in Grade 2. The frozen comparison remains unchanged at https://weekly-dictation-staging--slay-acquisition-compare-reevz808.web.app/. It intentionally omits teaching; it is not the integrated build.

## Implementation boundary

- Actual Grade 2 Enter the Dojo → Learn to Write now combines the existing original StrokeTeacher and its per-character saved five-step chain with the approved Slay-style acquisition surface. Every character of a new word finishes teaching before its whole-word acquisition; the next new word opens teaching again.
- New Grade 2 writing-pilot attempts pin the already-approved v7 strategy: one trace, one independent, then the existing expanding distractors/target pattern. The exact policy identity remains pinned. Existing five/six-step and ordinary legacy lessons are not reinterpreted or reset; an already-started ordinary target finishes under its original rules.
- The acquisition surface reuses the comparison CSS verbatim and the existing PracticeView/WritingPad. The teacher source/UI, brush, 25/10-second response windows, audio/replay rules, whole-word scoring and existing correction procedure are unchanged. The existing silent gesture primer runs synchronously on Learn to Write for the pilot, before async loading.
- The owned Grade 2 writing frame occupies the viewport beneath the existing report controls. Exit restores family navigation; Warmup/other grades are not marked. This avoids family navigation shrinking the approved layout. Report pause and frame ownership remain in the existing lifecycle mechanism.
- Initial launch, teaching milestones and answers continue through the existing confirmed atomic writing/workspace path. No new storage schema, cloud adapter, permissions, production feature activation, real-family changes or deployment is included.

This is an actual-app **local pilot integration**, still behind `VITE_GRADE2_WRITING_PILOT`; it is not yet enabled on canonical Ninja Dojo. The old pilot and all hosted reference packages remain separate. New retained output: `writing-slay-integration-dist`; testing uses `playwright.writing-slay.config.ts`, not the older port-5210 reference.

## Verification

Supported Node 24.22: 1,126/1,126 units, typecheck, full lint, production build/performance pass. Initial JS budget 549,823/550,000 bytes, CSS 46,288/60,000; the JS budget has little spare capacity and must remain a release gate.

Six actual-app Chromium cases pass. Two WebKit cases each pass at 1024×768 and 768×1024. Coverage: failed initial save/readback retry; pending-launch alternate-activity guard; both characters of 英雄 through five steps; reload resuming the exact teaching step; one trace → independent → familiar DT with 25/25/10-second displays; repeated trials to 每个 teacher step 1; control/box viewport bounds; Exit restoring the family selector; failed teaching save retaining ink; original six-step saved-policy recovery; report pause preserving the seven-second clue.

The existing old-save fixture initially paired a new v7 envelope with a six-step lesson and correctly failed validation. The fixture now represents a genuine old strategy; no validator was relaxed. Added unit coverage preserves both existing five/six-step lessons and confines new-policy selection to Grade 2/new attempts, including a fresh restart while old records remain unchanged.

Visual inspection caught family-host navigation consuming vertical room; the writing-only viewport host fixes it. Desktop and both WebKit orientation screenshots were inspected. Speech is mocked, and automated pointer drawing is not physical iPad/Pencil acceptance.

## Independent review — October 15, 2026

The owner authorized a separate GPT-6 Astra · Extra High reviewer. Review of `9f0eaca` → application `232be87` found one introduced P2 and no other actionable issues in the bounded integration review. Documentation HEAD `b9ae51f` did not change application source.

**P2 — missing visit-completion control.** `SlayWritingAcquisition.tsx:20` supplies ordinary `onExit` to the replacement shell. Imported comparison CSS (`slayAcquisitionMockup.css:58–60`) hides `.practice-top`, including the existing “Done for today” button. Exit preserves the reviewed response but does not finalize the visit's score or family-history result; the outer report-email action is not a learning-completion substitute. This also affects ongoing earned-DT practice, which has no terminal teaching screen offering another completion action.

Independent synthetic reproduction completes the first word's teaching, trace and independent response, then stops. Candidate Exit retains one reviewed answer but creates zero session scores, completed sessions or family result records. Earlier actual-app pilot `2fcd7e2` exposes “Done for today” and creates one of each; its relevant application files are byte-identical through baseline `9f0eaca`. Evidence is retained at `/tmp/ninja-slay-independent-finish-session.mjs`, `/tmp/ninja-slay-independent-candidate-done-control.png`, and `/tmp/ninja-slay-independent-prechange-done-control.png`.

Reviewer independently passed 116 focused units, six Chromium and four WebKit portrait/landscape cases, and checked curriculum pinning, restart history and earned-DT correction/resume. All 119 checked HTML/manifest files matched the retained package at served revision `232be87`. Original teacher, drawing component and approved comparison CSS remain unchanged. Existing passing browser cases did not assert visit finalization; the repair needs a dedicated regression covering completed scores/history as well as preserved answers.

No application edits, publication, real-family access or owner-tab reload occurred. Physical iPad audio/Pencil/software-keyboard behavior and this candidate's real-cloud acceptance remain unverified. Owner smoke testing remains premature. Next is owner authorization for a narrow completion-control repair using GPT-6 Astra · Extra High, then focused verification and review closure; the approved presentation and lesson rules must remain intact.

## Completion-control repair — October 15, 2026

The owner approved the narrow repair with GPT-6 Astra · Extra High. Application candidate **`5a7314efe161d99635ccbbc19a23c274aa07689d`** changes only the integration stylesheet: the original PracticeView “Done for today” control and its unchanged handler are visible at the top right, with a 44px minimum target, reserved header space and layering above the header. Duplicate navigation/count remains hidden. No JavaScript application logic, teacher source, approved comparison styling, timing, drawing, scoring or storage behavior changed; the writing boxes retain their available space.

Two new actual-app regressions distinguish Done from Exit after an unscored trace and one scored independent whole-word response. Done creates exactly one score, completed session and writing family-history result; Exit creates none while retaining the reviewed response. Both paths preserve their exact saved facts across reload and resume at Familiar DT without repeating teaching. The tests use real browser clicks and assert header bounds/non-overlap, review-state visibility and restored family navigation. Their teaching-completed setup is a disposable synthetic fixture; the separate full-flow test still performs every actual teaching step.

The new regression fails on frozen `232be87` because Done is missing. During repair verification, the test helper was corrected to ignore plain-string profile-selection records, and a real pointer-blocking header layer was fixed with integration-scoped stacking. Neither failure was bypassed; the final tests pass without forced clicks.

Supported Node 24.22: **1,126 units, typecheck, full lint, production build/performance, eight Chromium cases and four WebKit portrait/landscape cases pass.** Performance remains 549,823/550,000 initial JS bytes and 46,288/60,000 initial CSS bytes. Final desktop and tablet screenshots were inspected. Evidence: `/tmp/ninja-slay-finish-red`, `/tmp/ninja-slay-finish-desktop-final`, `/tmp/ninja-slay-finish-portrait-final`, `/tmp/ninja-slay-finish-landscape-final`, `/tmp/ninja-slay-finish-units.log`, and `/tmp/ninja-slay-finish-production.log`.

The dedicated package `writing-slay-finish-dist` was rebuilt from committed `5a7314e`; its exact revision and 114 served entry/manifest assets match http://127.0.0.1:5230/family-beta-preview.html?grade=grade2. This is a local synthetic/browser-only verification server, not a hosted release or owner smoke-test handoff. The earlier integration package/5218, all approved comparison sites and canonical Ninja Dojo remain unchanged. New-candidate backend/current-main/release and physical-device gates remain separate.

**Independent closure:** The same owner-authorized GPT-6 Astra · Extra High reviewer independently closes the P2 on exact committed `5a7314e`, with no remaining actionable findings in the narrow re-review. Four completion-versus-Exit cases pass in Chromium and portrait WebKit, including saved scores, completed sessions, family history, reload and resume. A landscape WebKit diagnostic verifies Done during writing, review and correction, report-modal blocking/timer pause without workspace changes, restored access after closing the report, and exactly one result/score/completed session/family-history entry when finishing during correction review. Teacher and Warmup remain isolated. The reviewer inspected portrait, report-overlay and correction-review screenshots and verified all 119 checked served HTML/manifest files against the retained candidate and exact revision. The Done target measures 160×44px.

Independent evidence: `/tmp/ninja-slay-finish-independent-chromium`, `/tmp/ninja-slay-finish-independent-webkit-portrait`, `/tmp/ninja-slay-finish-independent-report-layer.png`, and `/tmp/ninja-slay-finish-independent-correction-review.png`. No reviewer edits or deployment occurred. This closes the specific review finding, not the remaining backend, protected integration, release or physical-device gates.

## Current-main and packaged acceptance — October 15, 2026

The owner authorized continuation and confirmed **GPT-6 Astra · Extra High** for integration/saving. A fresh fetch finds `origin/main` at `af679289f56789c57379e007241976e6d02165b1`, already an ancestor of this branch (zero incoming commits). No merge or reconciliation edit was necessary. Read-only canonical manifest verification still identifies source `39715499b964d012cfb4a79925990fc0d20a271e` and tree `885482abc4f93b4ac3c0f982c9b72d0059890dce8ec2fae5103a1cc790853fdf`; the public app has not changed.

The new pilot-enabled family package is built from documentation source **`5d19f9588aee419fc06b719eb240c9205f9a2394`**, with application/build/dependency files unchanged from independently reviewed `5a7314e`. Its **153 retained files / 94 header rules** remain within the existing 100-rule limit. The guard/recovery package is a separate copy; the original predecessor is preserved.

| Package | Retained location | Exact file-tree SHA-256 |
| --- | --- | --- |
| Candidate | `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-8KYRqp` | `887827259ef05352397921a3023020b2edc8f6dbf2baffa967a37eb6e997dd83` |
| Canonical predecessor | `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-4WIn2G` | `885482abc4f93b4ac3c0f982c9b72d0059890dce8ec2fae5103a1cc790853fdf` |
| Guarded recovery | `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-offline-rollback-tzok2s/artifact` | `221192a4d5f732cc02bfafdc4b365921e9e2c5e0251a2ad614d1e42cf07f8121` |

All **four packaged writing cases** pass in desktop/tablet profiles: second-browser teaching resume, offline step/reconnect, refusal of an older client's incompatible overwrite, and exact checkpoint preservation through guarded recovery and return. All **12 local provider-applied compatibility/header cases** pass across Kindergarten, Grade 2 and Grade 5 in desktop/tablet profiles. Startup verifies candidate/predecessor/recovery public files **151/153/154** and header responses **178/180/181**, respectively. These exercise the real local hosting runtime with synthetic service responses, not a production deployment or physical iPad.

Fresh supported-Node-24 checks pass **1,126 units, typecheck and full lint**. The cloud test's scope/cleanup safety tests also pass 4/4. No application source, security rules or authentication configuration was changed in this stage. Evidence: `/tmp/ninja-slay-packaged-checks.log`, `/tmp/ninja-slay-provider-checks.log`, `/tmp/ninja-slay-provider-checks`, `/tmp/ninja-slay-final-units.log`, `/tmp/ninja-slay-final-typecheck.log`, `/tmp/ninja-slay-final-lint.log`, and `/tmp/ninja-slay-cloud-safety.log`.

## Real-cloud acceptance — October 15, 2026

The updated checker pins the exact candidate source/tree above and independently verifies all **151 served public files** before creating a unique disposable parent and synthetic Grade 2 child. Browser requests and administrative confirmation/cleanup remain restricted to that new family's subtree and user document. No existing family session or learner records are used. Existing real authentication and Firestore protections are exercised without changing their configuration.

Final checker **`e33d89c`** passes against the unchanged package, with exit status 0 and a complete cleanup receipt:

- First confirmed teaching step is in real cloud without an acquisition answer. A fresh browser resumes step 2 with no learner ink.
- A completed offline teaching step is retained locally; reconnect/reload confirms that exact step and resumes step 4.
- Both characters' five teaching steps finish before the Slay acquisition UI. One whole-word trace is unscored; a fresh browser resumes the independent trial, then one correct independent response enters Familiar DT.
- Actual “Done for today” saves exactly one writing result with one correct / one attempted response. Another fresh browser restores that result and Familiar DT position, without duplicating or changing the completed result.
- Nine further reviewed prompts advance confirmed writing revisions 13–21. The next word, **每个**, opens guided teaching at character 1 / step 1. A fifth fresh browser resumes exactly that teaching position, with the earlier completed result unchanged.
- Every asserted checkpoint equals its local and remote copy. Browser errors and out-of-scope Firestore requests are absent. Speech is intentionally simulated; this is not audible iPad or physical Pencil acceptance.

The initial checker `49513e8` run reached cloud-saved completion but timed out during repeated practice while requiring “Skip Timer.” It is retained as a **failed run** at `/tmp/ninja-slay-cloud-acceptance.log`. Real readback can outlast the ten-second Familiar DT response window. The bounded driver repair accepts the actual normal review screen after natural expiry, while retaining every checkpoint, scoring, result-immutability and next-teacher assertion; it does not alter application timers, force a hidden click, fabricate a response checkpoint or modify application code. The rerun explicitly observes normal review after expiry on trials 3, 4, 6, 7 and 8, and completes successfully. Failure-state diagnostic flags were added to the test driver. Typecheck, focused formatting/lint and all four synthetic-scope/cleanup tests pass after that change.

Accepted log: `/tmp/ninja-slay-cloud-acceptance-timer-aware.log`. Failed-run receipt: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-writing-cloud-UgnYrV/receipt.json` (`acceptancePassed: false`, `cleanupComplete: true`). Accepted receipt: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-writing-cloud-jODhaA/receipt.json` (`acceptancePassed: true`, `cleanupComplete: true`). Both disposable auth accounts and **10 documents per run / 20 total** were deleted and verified within their exact synthetic scope; these disposable records were intentionally not retained for recovery. No real-family records were touched. The real-backend local test server on port 5198 was stopped after verified cleanup; it is not an owner handoff URL.

## Remaining gates

Independent completion-control review, current-main reconciliation, retained-package compatibility and isolated real-backend acceptance are now closed for the exact candidate above. Do not repeat them without changed relevant inputs. **Next: request authorization for a separately hosted synthetic Grade 2 integrated pilot**, then verify its exact served build before an 8–12 minute owner iPad/iMac check of all-character teaching → acquisition → next word, automatic/manual audio, touch/Pencil or trackpad, orientation, report pause, Done/Exit and reload. The older hosted Slay comparison intentionally omits teaching and is not a substitute for this integrated test. A synthetic/browser-only hosted pilot must not be described as cross-device cloud saving; the real-backend acceptance above is separate engineering evidence.

Bounded publication/verification routing is **GPT-6.1 Sol · High**; any new persistence/curriculum behavior uses **GPT-6 Astra · Extra High**. Normal protected integration, canonical pilot activation, exact publication verification and physical-device acceptance remain. The separate correction protocol and target-override prototype requirements recorded in the primary checkout are neither implemented nor waived by this narrow integration. No PR, merge, publication, owner-tab reload, real-family edit or email occurred in this stage.

## Original integration candidate identity — before completion repair

Application commit `232be873f1a6a8fe79e3804f977f704a13942f4c`. Dedicated rebuilt package: `writing-slay-integration-dist`. Exact HTML revision plus 115 served entry/manifest files verified at http://127.0.0.1:5218/family-beta-preview.html?grade=grade2. This URL works only on this computer, uses synthetic profiles and browser-only saving, and is **not an owner smoke-test recommendation before independent review**. Existing 5210/5213/5214 and hosted comparison/v8/v7/v4 outputs remain unchanged. No claim of audible real-device sound, physical Pencil acceptance, or new-candidate real-cloud verification follows from the automated checks.

Five additional post-commit retained-package Chromium cases pass on Node 24: launch/readback retries, alternate-activity guard, failed teaching-save retry, pinned six-step recovery and report pause. An earlier post-commit command with a mistyped runtime path was stopped and is not acceptance evidence. Final output is `/tmp/ninja-slay-final-identity-tests-node24`; the full desktop run is `writing-slay-test-results`, and WebKit evidence is `/tmp/ninja-slay-integrated-landscape` and `/tmp/ninja-slay-integrated-portrait`.
