# Whispering Scrolls acquisition

D1 adds a separately saved Tier 2 reading choice inside the Dojo for all three grades. Its controller uses the existing acquisition engine and each grade's reading strategy. Ordinary reading remains independently selectable. This work is in [PR #65](https://github.com/FionnbarZero/WeeklyDictationApp/pull/65), unmerged and unpublished.

## Teaching contract

[ADR 0008](decisions/0008-family-beta-product-and-release-policy.md) requires separate progress, a checkpoint after each completed trial, and record → child playback → correct model → self-assessment. [ADR 0009](decisions/0009-activity-reliability-and-staged-delivery.md) requires grade-owned timers, expanded trials, correction, earned DT, curriculum pinning, and temporary-only response material. The [reading boundary](tier2-reading-boundary.md) specifies visible reading targets and the Kindergarten correction exception.

In the table, F means familiar DT, T means the current target, M means teaching/model presentation, and D means the engine-selected familiar or earned DT. A teaching presentation plays “Read and record” followed by word → available approved context → word → word. Independent trials show the characters without first playing the model. Every response is compared before self-assessment; there is no automatic pronunciation grading.

| Rule | Kindergarten reading | Grade 2 reading | Grade 5 reading |
| --- | --- | --- | --- |
| Introduction | F F M T | F F M T | F F M T |
| Expanded trials | T D T D D T D D D T D D D T | T T D T D D T D D D T | T T D T D D T D D D T |
| Expanded target seconds | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 | 10, 9, 8, 7, 6 |
| Familiar and earned DT seconds | 5 | 5 | 5 |
| Introduction and correction target/model seconds | 10 | 10 | 10 |
| Correction | M M M T F T; feedback only | M M M T F T; existing engine scoring | M M M T F T; existing engine scoring |
| Incorrect final expanded target | Correction then retry the same six-second scored target; earn only after a correct scored target | Existing grade engine transition | Existing grade engine transition |
| Earned DT | Existing demotion, correction, reacquisition and return position | Same grade-owned engine contract | Same grade-owned engine contract |

Strategy sources: [Kindergarten reading](../src/tier2/profiles/kindergarten.ts), [Grade 2 reading](../src/tier2/profiles/grade2.ts), [Grade 5 reading](../src/tier2/profiles/grade5.ts), and their [grade-owned acquisition strategies](../src/acquisition/strategies). The [engine](../src/acquisition/engine.ts) and [transition boundary](../src/acquisition/transition.ts) remain authoritative for assessment facts and phase changes. D1 does not copy or reinterpret these transitions.

## Readiness and implementation boundary

The implementation reuses the family learning hub's current acquisition cohorts, reading engine, pinned acquisition store, immutable score ledger, and family practice synchronization. It adds a distinct Whispering Scrolls entry and identity, scroll presentation, enforced response timing, failed-save retry, and saved-lesson routing back to this activity.

The response interval starts after microphone permission and recording start, excluding teaching playback and report/navigation pauses. It ends recording at the grade's configured duration; the child may stop once finished. Permission failure offers the existing say-aloud fallback and model comparison. An unfinished response is repeated after reload; no recording, blob URL, or provisional response enters durable storage. Supported native recorder pause/resume preserves an in-session recording while disabling microphone tracks during reporting; unsupported pause is disclosed and repeats only that unfinished response.

The new activity uses `whispering-scrolls` as its acquisition module identity and a distinct completed-score label. Per-target reviewed facts remain in its acquisition checkpoint. Saved routes distinguish it from ordinary reading. No data migration, production security change, or new storage collection is required. Recovery must use the existing guarded predecessor package so an older interface cannot reinterpret the new route.

Once a completion has entered the pending score queue, that attempt is frozen. A failed confirmation, including reopening before confirmation, offers score retry without allowing more answers to change the immutable attempt. A failed reviewed-trial save likewise retains the exact assessment for retry rather than allowing a different answer.

Answer and completion writes share an exclusive browser lock for the saved lesson. After acquiring it, an answer rechecks both pending and confirmed scores before changing the checkpoint. A mounted copy of an already-finished attempt rejects the extra response and offers **Return to Dojo**; its temporary recording stays available until the child leaves. A new visit retains teaching progress but uses a distinct score identity. Browsers without safe cross-tab locking preserve the reviewed response and show a retryable error without writing it.

## Acceptance

Verify all three grade sequences, timers and correction/earned-DT behavior against the existing engine; separate ordinary-reading state; frozen curriculum on resume; failed-save retry; completed score idempotence; fresh-browser practice synchronization; pause/resume and microphone cleanup; and absence of recording material in storage. Browser checks cover desktop and touch layouts. Physical microphone, sound and iPad behavior remain owner acceptance after reviewed publication.

## Local candidate and review handoff

This is the historical **`f38e085dea915740b86da980b99b5ee557316479`** candidate on `codex/d1-whispering-scrolls`, based on published C2 `d62a427`. The independent review below found a cross-tab score-finalization defect. It is superseded by the [October 12 repair](#cross-tab-repair-and-independent-review-october-12-2026); do not promote this older package. D1 remains local and unpublished. D2 and full Spirit Realm integration remain out of scope, with no D1 owner smoke testing yet.

Verified automated evidence:

- **907 unit tests** on the final application candidate, including every grade's acquisition/checkpoint parity, separate ordinary reading, correction and earned-DT behavior, route validation, and recorder lifecycle.
- **58 general browser cases** on the final application candidate.
- **10 exact-final-package desktop/tablet cases** on `f38e085`: all three grade journeys, reopening a queued immutable completion, and guarded C2 recovery. Final desktop and tablet entry screenshots were visually checked for readable layout, report access and touch-sized navigation.
- **54 packaged desktop/tablet cases** on `d401c10`: all 20 Scrolls cases, 26 existing recording-continuity cases, and eight opted-in installed-worker/guarded-recovery cases. Final `f38e085` only deduplicates the three identical deferred HomeViews imports in `App.tsx`; it does not change activity behavior or load those views eagerly.
- Full emulator run: **19 passed, one intentional strict-policy skip**, including all 11 family-policy cases. These are synthetic tests, not evidence of a D1 production backend release.
- Typecheck, lint, format, canonical family-test formatting, build/performance and dependency gates pass. Initial JavaScript is **549,884 / 550,000 bytes** and CSS **42,745 / 60,000 bytes**. The initial-JavaScript budget has only 116 bytes of headroom; the limit was not raised. Production dependencies have no reported vulnerabilities; the tooling gate retains its existing 11 firebase-tools-only findings under the exception expiring November 4, 2026.

Retained packages under `family-beta-artifacts/releases/d1-f38e085/` have independently verified complete inventories and file hashes:

| Package | Source / compatibility | Files | SHA-256 file tree |
| --- | --- | --- | --- |
| `candidate` | `f38e085dea915740b86da980b99b5ee557316479` | 148 | `5f41659762f64de6bdd029581830b42341d1c34c610a3b0cbcf5cc01ae90de7b` |
| `guarded-c2-recovery` | C2 `d62a427`, guarded for `f38e085` | 146 | `92d5cccee897cee8354f9145006a42f7754c30ece4395bf8458b6a57f8db7a17` |

The earlier retained `d1-f4dd797` package is superseded: it predates the queued-score freeze repair. Do not promote it. Documentation-only successor commits do not change the candidate's embedded build identity.

### Failures investigated and remaining limits

Initial browser failures exposed a fixture prompt-kind mismatch and invalid fake recording bytes. The tests now use the real `familiar-dt` prompt kind and valid silent WAV recordings. A separate run lost trace files when another browser run cleared the shared output directory; subsequent runs use isolated output directories. The 52-case `f4dd797` run was deliberately interrupted after 26 passing cases to repair queued-score finalization; it is not reported as a complete pass. The `d401c10` loading-size gate exceeded its unchanged limit by six bytes; the shared deferred loader in `f38e085` restores the budget. Original logs remain retained alongside successful reruns.

Detailed logs and final browser screenshots/traces are retained under `family-beta-artifacts/releases/d1-f38e085/evidence/`, including `ninja-d1-head-unit.log`, `ninja-d1-general-final.log`, `ninja-d1-completion-browser.log`, `ninja-d1-final-head.log`, `ninja-d1-emulator.log`, and `ninja-d1-loader-build.log`. Local logs and ignored packages are not remote CI or publication evidence. Final-head CI and the applicable release approvals remain required before publication.

Synthetic audio and Chromium touch tests do not certify physical iMac/iPad microphone, speaker or touch behavior. A permission failure uses the disclosed say-aloud fallback. Browsers without native recorder pause repeat only the unfinished recording after a report interruption. Recordings never become durable data. D1 uses the selected supported reading cohort; absent usable targets remain unavailable. Existing C2 content-subset and Context startup-timing limitations are unchanged.

## Independent release review October 12 2026

The initial separately authorized read-only **GPT-6 Astra · Extra High** review examined the complete C2-to-D1 diff and found **one actionable P2**, blocking that candidate. No application fix was made during that review. The repair and subsequent independent re-review are recorded below.

### Recheck immutable completion before accepting another answer

In [WhisperingScrolls.tsx](../src/familyBeta/WhisperingScrolls.tsx), `finishing` checks the pending ledger only at mount (lines 31–33), while `answer()` (lines 44–48) writes another checkpoint without rechecking queued or confirmed completion. A score write does not change the acquisition record, so its compare-and-swap guard cannot reject an already-mounted second copy solely because the first copy finalized the score.

The reviewer reproduced this twice against the retained exact `f38e085` package with synthetic Grade 5 data:

1. Open the same lesson in two tabs at session S, checkpoint revision 4, with one scored response.
2. Finish in tab A; immutable result S records one attempted response.
3. Review the next scored target in tab B; its checkpoint advances to revision 5 with two scored responses, still under S.
4. Finish in tab B; saving fails with “This attempt conflicts with an existing result.” Retrying cannot reconcile the counts.

The pending-only variant also reproduces: block cloud result delivery and fail the confirmed-result write after the pending score is queued in tab A. Tab B still adds another response under S, which now conflicts with the immutable pending score. No real family records were used or changed.

The repair must protect finalization across mounted copies before checkpoint mutation. Add separate regressions for pending and confirmed scores, retain the original immutable score, and ensure the second copy cannot accept work that is stranded under that score identity. Reuse the existing acquisition and result boundaries; do not erase records or weaken immutable-result validation. Repair and re-review use **GPT-6 Astra · Extra High**.

No other actionable introduced defect was found. The reviewer ran **53 focused checks**, all passing. Main-review evidence on documentation-only successor `5fcf44b` passes **907 unit tests, 54 packaged desktop/tablet cases**, typecheck, lint, formatting and the explicit new-file checks. Candidate/recovery hashes were reverified October 12. These passing tests do not resolve the reproduced two-tab defect. Main-review logs are retained in `family-beta-artifacts/releases/d1-f38e085/evidence/` as `ninja-d1-review-unit.log`, `ninja-d1-release-review.log`, and `ninja-d1-review-quality.log`. Final-head CI, physical acceptance and release approvals remain separate gates after the repair.

## Cross tab repair and independent review October 12 2026

Application repair `62ecb2fae4e1a657cf85ca435244ba1c6bea3634` resolves the P2 without a storage migration or a change to immutable-result validation. Test/documentation successor **`ab94b93fe7d1598d98a50e57a408408ac508553d`** contains the same application source and is the retained packaged candidate. It supersedes the intermediate `62ecb2f` and `c991148` packages.

The shared lock covers completion-check plus checkpoint write, and prepare-result plus score write. If completion wins, the second answer is refused before mutation. If an answer wins, the stale completion fails the existing checkpoint comparison before creating a score. Pending-only and confirmed-only completions both freeze the old attempt. Review callbacks now await the write, retain the exact assessment and temporary recording on failure, and reject duplicate retries while a save is waiting. Pause, profile and retirement checks run after acquiring the lock.

The independent **GPT-6 Astra · Extra High** reviewer found the original issue resolved and no new actionable introduced defects in `f38e085..62ecb2f`. Its fresh focused unit run passed **58/58**. Separate read-only checks accepted both test-only follow-ups: `c991148` waits for exactly one durable revision increment and the expected result ID, while retaining the existing equality, score-count, identity and privacy assertions; `ab94b93` corrects timer sampling without changing its deadline or assertions.

Verified local gates on the repaired application pass **912 unit tests**, **58 general browser cases**, and **19 emulator cases with one intentional strict-policy skip**, including all 11 family-policy cases. Typecheck, lint, format, explicit new-file/family-test checks, build/performance and dependency gates pass. The size budgets remain unchanged at **549,884 / 550,000 initial JavaScript bytes** and **42,745 / 60,000 CSS bytes**. Production dependencies report no vulnerabilities; the existing tooling exception remains 11 firebase-tools-only findings, expiring November 4. Checks use Node **24.21.0** without changing project dependencies.

The final exact `ab94b93` package passes **38/38 Scrolls cases** across desktop and tablet layouts. They include all-grade lesson/resume, pending-only and confirmed-only cross-tab completion protection, both overlapping write orderings, unavailable-lock retry, recording/report pause, failed-save retry, fresh-device recovery and guarded C2 recovery. Desktop Kindergarten and tablet Grade 2 entry screenshots were visually inspected for readable content, navigation and report access. Synthetic sound and tablet emulation do not replace physical acceptance.

Retained packages in `family-beta-artifacts/releases/d1-ab94b93/` have verified full inventories and hashes:

| Package | Source / compatibility | Files | SHA-256 file tree |
| --- | --- | --- | --- |
| `candidate` | `ab94b93fe7d1598d98a50e57a408408ac508553d` | 148 | `4dc248523ab9eeed928e0e0d02fa577c245185d101a82e8ac210daf159305c10` |
| `guarded-c2-recovery` | C2 `d62a427`, guarded for `ab94b93` | 146 | `9887f5a848215b24ec9f73923cdd179f74e5d26e8a64afc4caf5b32cd88f45e3` |

The regression first failed against test-only `f4eac83`, whose application source still matched the defective candidate. The first repaired packaged run passed 24 cases, then stopped at two premature test reads: a fresh-device baseline was captured at revision 0 before revision 1 committed, and a queued-score baseline at revision 3 before revision 4 committed. The readback waits in `c991148` correct those assumptions; they do not relax the assertions.

The broader `c991148` recording/Scrolls/recovery run passed **71 of 72 cases**, including all 18 new cross-tab/lock executions, all 26 existing recording-continuity cases, and all eight opted-in recovery cases. Its one failure was coarse polling in the tablet report-pause test: the final sample occurred at about 4.934 seconds because the next default one-second interval exceeded the 5.5-second deadline. The failure snapshot already showed completed recording comparison at about 5.431 seconds, within that deadline. The independent reviewer verified the trace. `ab94b93` samples every 100ms; the 5500ms limit, exact stop count, pause/resume counts and assessment checks remain unchanged. This earlier run remains recorded as 71/72, not a full pass. Original failure logs and traces remain under the retained candidate's `evidence/` directory alongside unit, quality, build, dependency, general-browser and emulator logs.

Final evidence is retained under `family-beta-artifacts/releases/d1-ab94b93/evidence/`, including `ninja-d1-final-scrolls.log`, `ninja-d1-final-artifacts.log`, `ninja-d1-final-quality.log` and `final-scrolls/`, alongside the earlier passing and failed runs. Documentation-only successors do not change the retained package's embedded identity.

This is local implementation and review evidence, not remote CI or publication. At this checkpoint D1 had not been pushed, merged or deployed; the next section records the later PR preparation. No real child records, production authentication/security settings or problem reports changed. Physical iMac/iPad sound, microphone and touch acceptance follows reviewed publication; no D1 smoke testing yet. D2 remains pending.

## Pull request and release preparation

On October 12, the owner authorized the next PR/release-preparation step. The branch `codex/d1-whispering-scrolls` was fetched, checked against current `main` (`d62a427`), pushed without force, and opened as [PR #65](https://github.com/FionnbarZero/WeeklyDictationApp/pull/65). It was 13 commits ahead and zero behind when opened. No application code changed: candidate `d5cbb1e79f3e134acf389a76d17333daa27d3768` differs from independently reviewed `ab94b93` only in documentation.

Fresh local checks pass all **912 unit tests**, typecheck, lint, format and the explicit 46-file canonical family reliability check. GitHub checks started on the initial PR head; all five jobs must pass on the final PR head before merge. A superseded run is not final-head acceptance. The previously documented 58 general-browser, 38 final Scrolls and emulator evidence remains applicable to the unchanged application; those suites were not rerun as part of this documentation-only preparation.

Exact packages under `family-beta-artifacts/releases/d1-pr65-d5cbb1e/` were copied from clean-source builds, then independently checked against their complete inventories and SHA-256 hashes:

| Package | Source / compatibility | Files | SHA-256 file tree |
| --- | --- | --- | --- |
| `candidate` | `d5cbb1e79f3e134acf389a76d17333daa27d3768` | 148 | `589df68974ed376748826dc62e7b6ebbf4ea3b04d9db155a73aa4fc5874bf6c4` |
| `guarded-c2-recovery` | C2 `d62a427`, guarded for `d5cbb1e` | 146 | `4a4e29e455b89c4b90abc8e8b2413f2fe53757f2080b06154d0b197bbb3b17d8` |

Packaging and recovery logs and the explicit family-check log are retained in that directory's `evidence/` folder. The canonical manifest returned HTTP 200 and still identifies C2 `d62a427afde15a486c0f5124856ffe88ed6d9360`, with file tree `66a08e0e892e34d030c1666089d5eb67aac9490142dfd756fdc8ba25871bb7b2`; this read-only manifest check is not a new full live acceptance run.

Next is **GPT-6.1 Sol · High** for final-head CI verification and owner merge approval, then packaging the actual merge revision, verifying its recovery contract, and obtaining separate publication approvals for Kindergarten, Grade 2 and Grade 5. No merge or hosting activation occurred during PR preparation. D1 remains unpublished; no owner D1 smoke testing or D2 work yet. Existing records, authentication/security and batched reports are unchanged.

## Merged-source release preparation

All five jobs passed on final PR head `0c47ff8d571f2deb05239c2802701b14df67d658` in [quality run 38311746702](https://github.com/FionnbarZero/WeeklyDictationApp/actions/runs/38311746702). The run includes 912 unit tests, **408 canonical family browser cases with 10 intentional opt-in recovery skips**, all 11 production family-policy emulator cases, 17 root-policy emulator cases with three intentional collection-policy skips, 58 general browser cases, three public-preview cases, 32 prototype cases and three grade-artifact cases. The 46-file canonical and six-file offline formatting checks pass. Production dependencies have no reported vulnerabilities; the existing firebase-tools-only tooling exception remains time-limited to November 4. The opt-in Scrolls recovery cases pass in the separate local run; previously recorded recovery evidence covers the other intentional CI skips.

The owner approved merge after final-head success. [PR #65](https://github.com/FionnbarZero/WeeklyDictationApp/pull/65) merged at `2026-10-12T23:00:02Z` as `092c57f313631e1ddcedbddc4d5f46274249ca90`. Remote and local `main` were fast-forwarded to that revision. Both the merge and reviewed head have Git tree `3a4ab78686d7510d53b8ee5f09ce8d349a13b45f`; no application or test changes were introduced by merging.

Exact clean merged-source packages are retained in ignored `family-beta-artifacts/releases/d1-092c57f/`. Their complete inventories and hashes were independently verified after copying. The browser server's independently built manifest and full inventory exactly match the retained candidate.

| Package | Source / compatibility | Files | SHA-256 file tree |
| --- | --- | --- | --- |
| `candidate` | `092c57f313631e1ddcedbddc4d5f46274249ca90` | 148 | `65b2b8ea7e12053a365fbd1b66e7fc61b11348bcd97a5eb15ef78b30b2dc0c38` |
| `guarded-c2-recovery` | C2 `d62a427`, guarded for `092c57f` | 146 | `eb64e5768f50eb38a3243fd149894197127daa8c5f82615a544784e3c1194cb8` |

Fresh merged-source verification passes all **912 unit tests**, typecheck and production build/performance gates (549,884/550,000 initial JS bytes; 42,745/60,000 CSS bytes). All **38 merged-package Scrolls desktop/tablet cases pass with no skips or failures**, including every grade's pinned lesson/resume, temporary recording/report pause, reviewed-answer retry, fresh-device recovery, pending/confirmed two-tab score protection, both overlapping write orderings, unavailable-lock retry and guarded C2 recovery. Entry screenshots from desktop Kindergarten and tablet Grade 2 were visually inspected for readable layout, touch controls and report access. These synthetic checks do not establish physical sound or microphone acceptance.

The evidence directory retains exact packaging/recovery logs, merged-source verification logs, final-head CI receipt, merge screenshot and release identity. Release-status documentation is kept on `codex/d1-release-092c57f`; it does not change the retained package's embedded merge identity. No hosting upload or activation, authentication/security change, real-child-record change or report deletion occurred. A fresh read-only canonical manifest check still identifies C2 `d62a427`, tree `66a08e0e892e34d030c1666089d5eb67aac9490142dfd756fdc8ba25871bb7b2`.

Next: **GPT-6.1 Sol · High** for the owner's separately required publication approval for each grade, then exact-package publication and served-build verification. D1 is merged but unpublished. Physical iMac/iPad microphone, sound, touch, report-pause and reload acceptance follows verified publication. No D1 smoke-test handoff yet; D2, broader content coverage and full Spirit Realm integration remain unfinished.

## Publication and live acceptance

D1 is published for Kindergarten, Grade 2 and Grade 5 following the owner's three separate approvals for build `092c57f`. Cloudflare Worker `meghangames-ninjadojo`, account `4c11957e0121dba35fe2f16be80526f8`, activated version `d36f6021-0d1c-4a55-8373-da0a237c656f` once at `2026-10-12T23:58:57.709334Z` (October 12, 4:58 p.m. Pacific). Provider readback confirms 100% traffic. Guarded C2 recovery `e4491443-899d-48af-abdf-90f938739626` is retained inactive; unguarded C2 is not the recovery path for devices with newer saved lessons. No routes, security/authentication settings or database policies changed.

The 148-file candidate and 146-file guarded recovery match the inventories and hashes in the preceding section, including an independent check after upload. The exact canonical manifest and all **146 public file sizes/hashes** match the candidate; hosting controls are excluded from public-file verification. All six grade × desktop/tablet canonical entry-and-report checks pass.

Both the retained package against the real backend and canonical HTTPS acceptance pass for every grade. These checks cover four reviewed trials, the child-recording → correct-model comparison order, report interruption of recording, preserved reviewed facts, exact fresh-device checkpoint recovery, pinned lesson resume, completion confirmation, drained score queues and reload recovery in both browsers. A different device submitting inherited reviewed work correctly claims a new immutable attempt ID before scoring. Recordings remain temporary; anonymous family reads are denied. Each successful run removed its disposable parent and 20 test documents. Existing family records and batched on-device reports were preserved.

Three earlier acceptance-driver runs remain recorded as failures. The first used a DOM-locator callback as though its first argument were the grade rather than the element. The next two looked for the inherited attempt's old ID after the second device intentionally claimed a new completion ID. The diagnostic run confirmed that the correct new score existed. The final driver checks the new score, its grade/score facts and its matching checkpoint identity; it does not weaken the scoring assertion. Cleanup removed eight, nine and nine documents respectively, plus each disposable account. No application code or reviewed package changed during these driver repairs.

An existing in-app browser initially showed cached C2 `d62a427`, even though the public files were already D1. Once its **An app update is ready** banner appeared, closing the sole app tab and reopening the canonical link loaded `092c57f` without clearing data. Closing and immediately reopening before that banner had appeared did not establish an update. This is the offline worker's deliberate protection against replacing an active lesson, not evidence of a second production copy.

Provider receipts, approvals, activation logs, original failed/corrected driver logs, live asset checks, synthetic cleanup evidence and all-grade live screenshots are retained under ignored `family-beta-artifacts/releases/d1-092c57f/evidence/`. Release documentation does not change the deployed package's embedded merge identity. The release gate is resolved; physical-device acceptance and the following roadmap stages remain separate.

### Bounded owner Scrolls check

Live canonical links, verified build **092c57f**: [Kindergarten](https://ninjadojo.meghangames.com/?grade=kindergarten), [Grade 2](https://ninjadojo.meghangames.com/?grade=grade2), [Grade 5](https://ninjadojo.meghangames.com/?grade=grade5). Allow **5–8 minutes total**, not a full curriculum journey or a test of every game. Use the matching child profile and open **Enter the Dojo → Whispering Scrolls**. The backend check used Grade 2's validated September 21–25 reading cohort and current teacher lessons for Kindergarten and Grade 5. A week without validated Tier 2 targets can remain unavailable; choose a relevant earlier reading week rather than changing teacher documents.

- **Before testing:** confirm the header says `092c57f`. If it shows an older build, wait for the update-ready banner, close all Ninja Dojo tabs on that device, then reopen the link. Do not clear browser data.
- **iMac:** follow a few Scrolls prompts. Record, hear your recording and then the model, and self-assess. Check that your microphone and both voices are audible; synthetic acceptance cannot establish this.
- **iPad:** check touch controls and microphone permission. Open **Report a problem** during a recording, wait briefly, then close it. Timers/audio must pause. Native pause support resumes the unfinished recording; an explicit repeat prompt is expected when pause is unsupported.
- **Saving:** use **Pause and return**, reload and resume the saved Scrolls lesson. Reviewed teaching progress should return; the unfinished recording is repeated because recordings are not retained. If you reach a scored DT, use **Done for today** and verify its point in family Progress after reload. Introduction-only work need not produce a score.
- **Feedback:** save issues through **Report a problem**, then use **Finish session & email reports** to batch them. No need to test Stroke Order Slay or unrelated screens for this release.

Known unfinished work: physical sound/microphone/touch acceptance, D2 Stroke Order Slay, broader validated content coverage and full Spirit Realm integration. Next engineering is **D2 — GPT-6 Astra · Extra High**, with owner confirmation before application edits; independent release review uses the same assignment.
