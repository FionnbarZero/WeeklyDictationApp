# Whispering Scrolls acquisition

D1 adds a separately saved Tier 2 reading choice inside the Dojo for all three grades. Its controller uses the existing acquisition engine and each grade's reading strategy. Ordinary reading remains independently selectable. This work is local and unpublished.

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

Application repair `62ecb2fae4e1a657cf85ca435244ba1c6bea3634` resolves the P2 without a storage migration or a change to immutable-result validation. Test-only successor **`c99114895a85ad45d06d327a839fb04434a1b920`** contains the same application source and is the retained packaged candidate.

The shared lock covers completion-check plus checkpoint write, and prepare-result plus score write. If completion wins, the second answer is refused before mutation. If an answer wins, the stale completion fails the existing checkpoint comparison before creating a score. Pending-only and confirmed-only completions both freeze the old attempt. Review callbacks now await the write, retain the exact assessment and temporary recording on failure, and reject duplicate retries while a save is waiting. Pause, profile and retirement checks run after acquiring the lock.

The independent **GPT-6 Astra · Extra High** reviewer found the original issue resolved and no new actionable introduced defects in `f38e085..62ecb2f`. Its fresh focused unit run passed **58/58**. A separate read-only check accepted the `c991148` test-only follow-up: it waits for exactly one durable revision increment and the expected result ID, while retaining the existing equality, score-count, identity and privacy assertions.

Verified local gates on the repaired application pass **912 unit tests**, **58 general browser cases**, and **19 emulator cases with one intentional strict-policy skip**, including all 11 family-policy cases. Typecheck, lint, format, explicit new-file/family-test checks, build/performance and dependency gates pass. The size budgets remain unchanged at **549,884 / 550,000 initial JavaScript bytes** and **42,745 / 60,000 CSS bytes**. Production dependencies report no vulnerabilities; the existing tooling exception remains 11 firebase-tools-only findings, expiring November 4. Checks use Node **24.21.0** without changing project dependencies.

Retained packages in `family-beta-artifacts/releases/d1-c991148/` have verified full inventories and hashes:

| Package | Source / compatibility | Files | SHA-256 file tree |
| --- | --- | --- | --- |
| `candidate` | `c99114895a85ad45d06d327a839fb04434a1b920` | 148 | `c7f1575181b8c958422ac89a0eb12ed34a6982a7d77ab3133175a90e3490274d` |
| `guarded-c2-recovery` | C2 `d62a427`, guarded for `c991148` | 146 | `042b77437ebd6afd06080e970267923189595e92f0e3f5af011e38be1c3c2d4d` |

The regression first failed against test-only `f4eac83`, whose application source still matched the defective candidate. The first repaired packaged run passed 24 cases, then stopped at two premature test reads: a fresh-device baseline was captured at revision 0 before revision 1 committed, and a queued-score baseline at revision 3 before revision 4 committed. The readback waits in `c991148` correct those assumptions; they do not relax the assertions. Original failure logs and traces remain under the retained candidate's `evidence/` directory alongside unit, quality, build, dependency, general-browser and emulator logs.

This is local implementation and review evidence, not remote CI or publication. D1 has not been pushed, merged or deployed; C2 `d62a427` remains the recorded live release. No real child records, production authentication/security settings or problem reports changed. Physical iMac/iPad sound, microphone and touch acceptance remains after reviewed publication. D2 remains pending.
