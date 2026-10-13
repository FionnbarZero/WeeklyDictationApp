# Stroke Order Slay acquisition

## D2 readiness baseline

D1 is published as `092c57f`. D2 starts from that application source and its two local release-documentation commits. The owner confirmed **GPT-6 Astra · Extra High** for D2 on October 12. D2 is not published or ready for owner testing.

The existing `StrokeOrderActivity` is a session-only copy/review/memory/review loop. Grade 2 and Kindergarten launch it from their ordinary hubs; the family wrapper separately adds it for Grade 5. Its fixed 10/20-second rounds do not execute the approved acquisition engine. Replacing those family launches with a presentation over the existing engine is the shortest coherent path. Development-only prototypes remain unchanged.

The family acquisition store already supplies pinned curriculum/strategy snapshots, reviewed facts, separate activity identity, compare-and-swap updates, retirement, and cross-device completion identities. D1's completion lock protects pending and confirmed scores across mounted tabs. D2 must reuse these boundaries, with a separate writing module and score label, and restore its own saved route. Raw handwriting and typed provisional responses remain in memory only.

Baseline guide inventory against the bundled authoritative sources: Kindergarten has every writing target in its five available cohorts; Grade 5 has every writing target in its five available cohorts; Grade 2 has only its September 21 cohort. All 16 familiar-DT seed characters have guides. Add the missing Grade 2 geometry from the same licensed, revision-pinned upstream used by Grade 5. Invalid/missing geometry must prevent unsupported targets from launching. Do not guess paths, substitute vocabulary, or imply incomplete coverage is complete.

The requested half-width marker was already implemented in `ce92956`: Sky Writing ink is 9px (5px in its smaller review view), previously 18/10px; the standalone stroke pad is 2.4 units, previously 4.8. Reuse the shared writing pad without halving it again or altering printed guides.

## Teaching contract and acceptance

[ADR 0007](decisions/0007-parallel-stroke-order-acquisition-comparison.md) requires exact writing-acquisition parity with separate progress. [ADR 0008](decisions/0008-family-beta-product-and-release-policy.md) removes experimental labels and preserves grade-owned teaching rules. [ADR 0009](decisions/0009-activity-reliability-and-staged-delivery.md) adds durable per-trial resume, temporary-only drawings, report pause and scored-attempt protection.

F means familiar DT, T the current target, M model/copy, and D the engine-selected familiar or earned DT.

| Rule | Kindergarten writing | Grade 2 writing | Grade 5 writing |
| --- | --- | --- | --- |
| Strategy | `kindergarten-acquisition-v2` | `grade2-acquisition-v4` | `grade5-acquisition-v2` |
| Introduction | F F M T | F F M T | F F M T |
| Expanded trials | T T D T D D T D D D T | T T D T D D T D D D T | T T D T D D T D D D T |
| Expanded target seconds | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 |
| Familiar / earned DT seconds | 5 / 5 | 5 / 5 | 5 / 5 |
| Introduction / correction model and target seconds | 10 | 10 | 10 |
| Correction | M M M T F T; existing writing scoring | Same | Same |
| Target reveal | Model visible for M; hidden on independent trials until review | Same | Same |
| Three consecutive errors | Existing engine reacquisition; earned-DT demotion preserves interrupted target | Same | Same |
| Completion | Engine earns the target; ongoing DT on subsequent visits; Done for today saves scored facts separately | Same | Same |

Sources: `src/acquisition/strategies/{kindergarten,grade2,grade5}.ts`, `src/acquisition/engine.ts`, `src/acquisition/transition.ts`. Kindergarten **reading** has different spacing and correction behavior; do not apply it to writing. The ordinary `PracticeView` starts its response timer at confirmed audio start, supports timer skip and +10 seconds, and plays word → available context → word → word using the grade audio profile. D2 follows those timing/prompt semantics; audio failure requires retry before an independent response. Guides show ordered strokes during teaching and comparison, never reveal an independent answer early. The existing family hub's warmup and Spirit Realm policy remain unchanged.

Required evidence: all-grade teaching/correction/earned-DT parity, complete geometry validation, separate ordinary/D2 progress, retained-source resume and explicit discard, offline saving and fresh-device recovery, failed-save exact retry, pending/confirmed cross-tab completion, timer/audio/guide pause during reports, temporary drawing privacy, desktop/tablet layout, and compatible guarded D1 recovery. Physical iMac/iPad audio/touch acceptance follows reviewed publication. No production records, policies or authentication changes are part of this stage.

## Local implementation

D2 replaces the family-wrapper session-only launches for all three grades with the separate `stroke-order-slay` acquisition module. Ordinary writing, the grade-owned strategies, and development-only prototypes remain independent. The new controller reuses the existing acquisition store and D1's scoped completion lock; it does not add a parallel persistence format or a new mastery threshold.

- **Teaching:** The response panel uses the cited writing sequence, hides independent answers until comparison, animates ordered model strokes, and starts the existing countdown only after confirmed audio start. Model and comparison use the grade's word → available context → word → word cadence. Audio failure offers retry; timer skip, pause and +10 seconds retain the ordinary writing semantics.
- **Saving:** Only reviewed correctness and reveal reason become durable facts. Failed reviewed saves hold the original self-assessment for exact retry. Pending and confirmed scores prevent a second mounted tab from appending answers to that completed attempt. Done for today uses the same session ID and confirmed-result ledger, under the separate writing activity label.
- **Resume and identity:** Saved lessons retain their curriculum and strategy snapshot. Grade 2's ordinary AppState launcher no longer attempts to find a separate game checkpoint in ordinary writing state. A fresh device recovers reviewed facts and acquires its own continuation/completion identity. The selected subset must remain an exact ordered subset of the pinned teacher targets.
- **Temporary responses:** Drawings and fallback typing remain only in the mounted response. A problem report or navigation pause preserves them; reloading repeats the unfinished response with a blank pad. Opening a report pauses the timer, guide animation and audio. A held pen stroke is finalized before pause so the next stroke cannot replace it.
- **Guides:** An additional 37 Grade 2 characters come from the same revision-pinned, licensed upstream as Grade 5. Every target and familiar-DT seed is validated before use. Square writing cells preserve stroke proportions; the existing thinner marker is reused without changing ordinary printed tracing guides. The source license is copied byte-for-byte into the public artifact with attribution.

Geometry coverage tests cover every bundled writing target in all three grades and all 16 familiar-DT seed characters. Future Google-source targets without valid geometry remain excluded with a visible supported-target count; no supported targets means Coming soon. D2 rejects words longer than the shared pad's six-character limit rather than clipping them. This is validated guide coverage, not invented teacher vocabulary or a claim that future curriculum needs no updates.

## Remaining boundaries

D2 is local and unpublished. It has not changed production records, database rules, authentication, teacher documents or batched problem reports. Full Spirit Realm integration and broader supporting content remain separate unfinished work. Recordings are not part of this writing activity. Physical sound, handwriting/touch and real-device interruption acceptance cannot be established by synthetic browser tests; request only a short D2-specific check after reviewed publication, not a new full-app audit.

The initial JavaScript performance budget remains unchanged at 550,000 bytes. The Warmup-repaired `36b0f48` build uses 546,027 bytes after deferring practice startup; the earlier candidate used 549,944 bytes. Keep acquisition UI deferred. Publishing, merging, pushing and any later production-data or security changes retain their separate approval gates.

## Local verification and retained packages

The functional candidate is `f0abee254daea0f127e54223f3cebaeb8c0b9ae6`. Successor `cc28b06a3bd876d0f663ca73c71523c3010b4221` only formats the Grade 2 coordinate asset and shared WritingPad. The exact coordinate data and compiled WritingPad syntax tree were compared before/after formatting; behavior is unchanged (import order normalized for the comparison). Documentation commits do not alter those retained packages or their embedded build identities.

Confirmed local evidence:

- **74/74 final exact-package browser cases pass** on `f0abee2` in 8.9 minutes, with no retries or skips: 36 Stroke Order cases and 38 Whispering Scrolls regressions across desktop/tablet layouts. D2 verifies each grade's eligible targets and hidden independent answers, square guides, reviewed checkpoints, pinned resume, exact score retry, pending/confirmed cross-tab protection, fresh-device recovery and guarded D1 rollback/return. Dedicated cases exercise delayed/failed audio, report pause, held-pen preservation, provisional-response privacy and failed-answer exact retry. The Scrolls matrix verifies shared completion-lock behavior and recording/pause regressions.
- **927 unit tests** on both the functional candidate and formatting-only successor; typecheck, lint, standard format check, explicit changed-file/family checks and the unchanged build/performance budgets pass. The wider explicit check caught and then resolved the two-file formatting issue; the initial failed check is retained.
- **58 general browser cases** on `61447fa`, including ordinary grade flows and unchanged prototype visual references. That source predates the D2-only square-guide/placeholder repair and license-copy test. Ordinary writing behavior is unchanged afterward.
- **62 ordinary curriculum-pinning desktop/tablet cases** passed within the mixed `61447fa` run. That entire run was not green; the separate failures are recorded below.
- **19 emulator cases pass, one intentionally skipped**, including the family production-intended policy cases. No policy file or persistence schema changed. Production dependency audit reports zero vulnerabilities; the existing 11-finding firebase-tools-only development exception expires November 4.
- All three grades' D2 model-stage screenshots were visually inspected at desktop and tablet layouts. The guide cells retain square proportions and no longer show the ordinary “Write here” placeholder through the teaching model. Emulated input does not establish physical iPad acceptance.

Packages were independently rehashed against their complete inventories after copying:

| Local package | Source | Files | SHA-256 tree |
| --- | --- | --- | --- |
| `releases/d2-f0abee2/candidate` | `f0abee2` | 153 | `de5e41dd1e94c91d03c1608a6d7bbfbbf90900b62c46f510460ad238578da935` |
| `releases/d2-f0abee2/guarded-recovery` | D1 `092c57f`, compatibility `f0abee2` | 149 | `2f68512bb293f3754942452c00978b8690a2d5b1ad6a7ef2d7a1b883e59dfe7e` |
| `releases/d2-cc28b06/candidate` | `cc28b06` | 153 | `9612d84c653843745983b5328c959a1f449b1b5f57c908e6b839e5b69f2e3359` |
| `releases/d2-cc28b06/guarded-recovery` | D1 `092c57f`, compatibility `cc28b06` | 149 | `3e0513332f86316ac67fd1d237ef177f242a2d716c172fb7dce18cb9ff2db33c` |

Paths are under ignored `family-beta-artifacts/`. Test output, screenshots and original failures are retained under `reviews/d2-f0abee2/`, `reviews/d2-61447fa/` and the earlier D2 review directories. Named `ninja-d2-*.log` evidence is retained with the packages. None of these packages has been uploaded or activated.

### Failed and superseded checks

The first D2 browser run reproduced a Grade 2 saved-game route hanging because ordinary AppState was asked to resume the separate game checkpoint. `61447fa` repairs that boundary; cross-grade saved-lesson coverage exercises the corrected route. Concurrent early general/family runs also used overlapping default output directories, which removed traces during execution. Those runs were interrupted and are not passing evidence; subsequent outputs are isolated outside `test-results`.

The mixed `61447fa` browser run ended with 102 passing cases, three failures and 23 not run. The held-pen report fixture tried to draw above the visible iframe on both layouts; it now waits for the response controls and scrolls the real pad into view before using its coordinates. Its assertion that ink exists before report interruption is retained. The third failure was D1's obsolete “saved reading” error expectation after the shared completion helper adopted “saved practice”; the same lock-failure and exact-retry assertions remain. All four focused corrected desktop/tablet cases and the subsequent full 74-case matrix pass on `f0abee2` without changing save behavior. The earlier failures are not relabeled as successes.

The original unit fixture for a reversed/foreign subset failed an earlier validation boundary rather than its intended route assertion. The corrected fixture uses a forged target from the same dataset to exercise that boundary meaningfully. The source license was also restored to an exact byte-for-byte copy; its new regression is part of the 927-test suite.

### Independent-review handoff

After those local checks finished, the owner-authorized separate **GPT-6 Astra · Extra High** read-only reviewer was launched against the full D1-to-D2 diff and the retained evidence. Local passes are not a substitute for that review. No push, PR, merge, publication or owner smoke-test handoff is authorized by launching it.

### Independent review outcome — October 12, 2026

This finding describes the historical `cc28b06` review. The repair and successful independent re-review are recorded below; do not promote the superseded packages.

**One actionable introduced P2; D2 is not ready for release.** `StrokeOrderSlay.tsx` initializes and presents acquisition directly, bypassing the configured pre-activity Warmup offer. An isolated synthetic comparison on the exact hash-verified `cc28b06` package confirmed that ordinary Grade 2 and Grade 5 writing each present **Begin Warmup / Skip Warmup**, while D2 presents neither and has already reached introduction/familiar DT at revision 0. Grade 2 explicitly configures optional Adaptive Warmup: optional permits a child to skip it, not the implementation to remove the choice. ADR 0007 requires configured Warmup parity and shared Warmup mastery. Grade 5's required-versus-optional policy remains undecided; the repair must preserve its existing offered flow without inventing a new requirement. The baseline statement that the shared Warmup/Spirit Realm policy was unchanged did not establish D2 pre-activity parity; full Spirit Realm deferral is not an exemption.

The independent reviewer ran **146 targeted unit cases**, four exact-package browser comparisons and complete hash/inventory verification for all four retained candidate/recovery packages. These passed. The reviewer inspected, but did not rerun, the retained 74-case matrix and formatting-equivalence receipt. No other actionable introduced defect was confirmed in this bounded review. No tracked files or external state were changed by the reviewer; its temporary server stopped.

The receipt is retained at `family-beta-artifacts/releases/d2-cc28b06/evidence/ninja-d2-independent-review-cc28b06.log` (original `/tmp/ninja-d2-independent-review-cc28b06.log`). **Next: GPT-6 Astra · Extra High Warmup repair, verification and independent re-review of the resulting package.** Do not push, merge, publish, start E1 or ask for owner D2 smoke testing from the current candidate. D1 remains the last verified live application. Physical iMac/iPad sound, touch and handwriting acceptance remain future post-publication checks.

### Warmup repair and independent re-review — October 12, 2026

**The P2 is resolved at `36b0f48e05faf4a9104aa7a49282fdae3bbfd5f1`.** The confirmed D2 Astra Extra High assignment covers this repair; the owner-authorized separate Astra Extra High reviewer independently re-reviewed it. No additional actionable introduced defect was confirmed. Earlier D2 packages are superseded, not release candidates.

The family hub now delegates the pre-activity offer to each grade's existing writing host before mounting D2 teaching. Grade 2 uses the existing Adaptive Warmup coordinator and shared mastery, saves the selected queue, preserves its authoritative order and restores actual reviewed answers on reload. Skipping a reviewed remainder finalizes the partial visit without erasing or inventing answers. Missing or unsavable facts block safely. The external-primary handoff does not create an ordinary Acquisition envelope or score. Grade 5 reuses its existing offered writing-Warmup preview, including its presentation/review order; it does not gain a required or durable Warmup policy. Kindergarten's ordinary writing path has no pre-activity offer and is unchanged. D2's separate durable teaching checkpoint begins after this handoff.

Exiting and resuming a paused Warmup retains the pending D2 destination. Confirmed cancellation removes that continuation, so a subsequent ordinary writing session cannot accidentally enter D2. Complete Warmup, skip and partial-skip all return to D2 revision 0 without ordinary acquisition/score changes. The practice-start operation is deferred to preserve the existing loading-size budget; its failure path clears the pending launch and reports the error.

Final local evidence on the application candidate:

- **930 unit tests**, **58 general browser cases** and **78/78 exact-package desktop/tablet cases** pass. The 78-case run took 9.9 minutes with no retries or skips: 40 Stroke Order cases, including the new offer/reload/partial-skip regressions, and 38 shared Whispering Scrolls regressions. All-grade D2 reviewed facts, pinned resume, fresh-device recovery, immutable completion and guarded D1 recovery remain covered.
- Exact-head typecheck, lint, standard format and build/performance checks pass. The explicit 49-file family/changed-file check passes. Initial JavaScript is **546,027/550,000 bytes**; CSS is **42,745/60,000 bytes**. No budget was raised.
- **19 emulator cases pass with one intentional skip**. Production audit reports zero vulnerabilities; the existing 11-finding firebase-tools-only development exception remains limited through November 4. No production policy/schema changes are included.
- Fresh independent verification passes **121 targeted unit tests**, three additional coordinator scenarios and **seven exact-package browser checks**. The browser checks cover Grade 2 and Grade 5 offer → pause → resume → skip on desktop/tablet, full Grade 2 six-answer completion, and both grades' confirmed cancellation followed by ordinary writing. The reviewer inspected, rather than independently reran, the full root matrices. Synthetic Chromium/touch checks do not establish physical iPad or Safari acceptance.
- The reviewer independently rehashed every file and both tree inventories. Candidate and guarded recovery were served/retained locally only; neither was uploaded or activated.

| Retained local package | Source | Files | SHA-256 tree |
| --- | --- | --- | --- |
| `releases/d2-warmup-36b0f48/candidate` | `36b0f48` | 155 | `75c5b130e50cd0be47aba554d38599f8e074880d88a408ca22b40dce44ed7adc` |
| `releases/d2-warmup-36b0f48/guarded-recovery` | D1 `092c57f`, compatibility `36b0f48` | 149 | `eeb6b207943ea42b716339543962209772a2a7de13bf6fcab72d9eaf078ac8a2` |

Paths are under ignored `family-beta-artifacts/`. Completed gate logs, the independent receipt `ninja-d2-warmup-independent-review-36b0f48.log` and its reproducible browser script are retained in `releases/d2-warmup-36b0f48/evidence/`. The 78-case browser output is under `reviews/d2-warmup-final/browser/`; general browser output is under `reviews/d2-warmup-36b0f48/general-browser/`.

Earlier failed and superseded checks remain evidence, not passes: initial loading-size checks exceeded the unchanged budget until the startup operation was genuinely deferred; two architecture assertions caught a renamed delegation alias, restored without weakening the checks; an explicit format check found and then resolved import ordering. The intermediate `2ce93d7` browser run was deliberately interrupted for the reload/partial-skip and queue-order repair: 10 passed, one interrupted, 67 not run. The final 78-case matrix supersedes that incomplete run. Initial fixture corrections and earlier D2 failures remain historical; no failed run was relabeled green.

**Next: GPT-6.1 Sol · High for separately authorized push/PR/CI and release preparation**, followed by owner merge approval and separate publication approvals for each grade. These local checks and the independent review authorize none of those external actions. D2 remains unpublished; D1 `092c57f` remains the last verified live application. Grade 5's session-only Warmup preview, undecided required-versus-optional policy, full Spirit Realm integration and physical sound/handwriting/touch acceptance remain limitations. No E1 work or owner D2 smoke-test handoff yet; request only a bounded D2 check after reviewed publication and exact served-build verification.

### Pull request preparation — October 12, 2026

The owner authorized the next push/PR step. The clean reviewed branch was pushed as `990b363f05878d24a36f0912c65c28f7ffab930e`, and [PR #66](https://github.com/FionnbarZero/WeeklyDictationApp/pull/66) is open against `main`. At preparation, `origin/main` remained D1 `092c57f`; the branch was 12 commits ahead and zero behind, and GitHub reported no conflicts. The prior independent application candidate remains `36b0f48`; later preparation commits modify documentation only. No application code was changed in this step.

The GitHub connector lacked PR-create permission, so creation used the owner's existing signed-in GitHub browser without changing permissions. The created PR was verified open, attached to this chat, and its initial five-job quality run `38336869784` started. This is pending evidence, not a passing CI claim. The documentation handoff triggers a new final-head run; the actual final head must pass all five checks before asking for merge approval. Retained candidate/recovery packages and local/reviewer evidence remain those recorded above; actual merged-source packaging follows a separately approved merge.

**Next: GPT-6.1 Sol · High for final-head CI verification and owner merge approval.** No merge or auto-merge was enabled, no hosting action occurred, and no production records/security/authentication changed. Per-grade publication approvals and exact served-build verification remain separate gates. D2 remains unpublished with no owner smoke-test handoff; D1 `092c57f` remains the last verified live release.

### Final-head CI test race — October 12, 2026

Final-head run `38336980383` for PR head `7268f505f0073eb8512a4b9121e9271dbf435178` completed with four successful jobs and one failing family job. The family browser matrix ran for 59.3 minutes: **441 passed, 16 skipped, one failed**. The 16 skips require explicit retained-predecessor recovery fixtures; earlier opted-in local recovery evidence remains separate. The family-policy emulator, explicit family formatting and offline-format steps after the failed browser command were skipped, not passed. No merge occurred; the package identity visible in this CI trace (`16d213c`) is GitHub's synthetic PR merge checkout, not a published or approved merge.

The failure is `tests/family-sync/shadowStrike.spec.ts`, tablet-touch, “explicit discard retires only its owned unfinished round.” Its assertion required the local retirement outbox to contain the discarded run immediately after its iframe closed. That is not the online contract: `progressSync.ts` confirms the remote retirement before `progressStore.ts` acknowledges and removes the local marker. The trace contains exact remote readback for run `b570686e-7ff6-403c-bb8c-a09bfccc45e4` at 03:20:33.629 UTC. The local-record inspection begins 10.341 ms after the corresponding response-fulfilment call, and finds the already-acknowledged empty outbox. The checkpoint is absent and the paused activity is gone. This confirms a test assertion race, not lost discard data.

The bounded **GPT-6.1 Sol · High** repair changes only that test and these status documents. It runs two explicit cases on both layouts: online discard, and offline discard followed by reconnection. The offline case must retain exactly the original run's local marker with no remote retirement. Both cases then require the exact online run/scope, removal of the acknowledged local marker, no remaining checkpoint or score, and a fresh run starting at the first strike. No assertion is replaced with a sleep or blanket retry; no application, policy, schema, teacher data or build budget changes.

Completed local verification:

- **40/40 repeated discard cases pass** (10 repeats × two connectivity paths × two layouts; 2.2 minutes, no retries/skips). All **18 full-file Shadow Strike desktop/tablet cases pass** separately (2.3 minutes, no retries/skips).
- **930 unit cases pass**; **19 emulator cases pass with one intentional skip** against the existing family policy.
- Typecheck, lint, standard format, the explicit family check and the offline-boundary format check pass. Build/performance remains **546,027/550,000 JavaScript bytes** and **42,745/60,000 CSS bytes**.
- Production dependencies report zero vulnerabilities; the existing 11-finding firebase-tools-only development exception still expires November 4.
- The standard family test server packaged clean `7268f50` before the test-only edit. Browser verification uses that unchanged package (`a9bfd46b339a43c90cd04870aa4c81acb85a212ba6481326175ccfa9880e361d`) with the standard desktop/tablet settings and synthetic request interception. The local configuration only reuses this server and isolates evidence output; it does not relax assertions, retries or timeouts.

Evidence is retained under ignored `family-beta-artifacts/reviews/d2-ci-repair/`: the complete failed CI job log, original 22-file CI evidence ZIP (SHA-256 `c48d8bed18eea21987d6b09bbbe03dc3777af46efbcba6c17fe9b0746e1279af`), and separate repeat/full-file browser outputs. The original failed run remains failed; it is not superseded by an identical rerun or represented as green.

**Next: obtain authorization to push the test-only repair, then verify all five jobs on the new final PR head.** Ask for merge approval only after that gate passes; merged-source packaging and separate per-grade publication approvals remain afterward. No remote write, merge, hosting action, real-child-record or authentication/security change occurred in this repair. No owner smoke testing yet; D1 `092c57f` remains the last verified live release.
