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

## Acceptance

Verify all three grade sequences, timers and correction/earned-DT behavior against the existing engine; separate ordinary-reading state; frozen curriculum on resume; failed-save retry; completed score idempotence; fresh-browser practice synchronization; pause/resume and microphone cleanup; and absence of recording material in storage. Browser checks cover desktop and touch layouts. Physical microphone, sound and iPad behavior remain owner acceptance after reviewed publication.

## Local candidate and review handoff

Application candidate **`f38e085dea915740b86da980b99b5ee557316479`** is local on `codex/d1-whispering-scrolls`, based on published C2 `d62a427`. It has not been pushed, independently reviewed, merged or published. The next gate is **independent GPT-6 Astra · Extra High release review** of the complete D1 diff, with special attention to shared recorder behavior, paused media, grade-engine parity, checkpoint routing and immutable score finalization. D2 and full Spirit Realm integration remain out of scope. No D1 owner smoke testing yet.

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
