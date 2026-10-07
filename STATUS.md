# Weekly Dictation status

Updated October 7, 2026. A3.1 bounded result history and separate completed-attempt graphs are merged as `55e9189`, published, and live-verified on all three canonical grades. The [A3.1 release record](./docs/a3-release-2026-10-07.md) records exact artifact, checks, limitations, and retained A2 rollback. A3.2's [pinning, saved-source and offline-reopening increments](./docs/a3-curriculum-pinning.md) are in draft PR #60, not released or complete. Grade 2 corrected-week adoption, durable discard, and offline-aware upgrade/rollback rehearsal remain open. A3.3 conflict/storage work remains pending. [ADR 0009](./docs/decisions/0009-activity-reliability-and-staged-delivery.md) remains the architectural baseline.

This is the current capability summary. [ROADMAP.md](./ROADMAP.md) defines priorities and required behavior; planned requirements are not evidence that a feature is implemented.

## Live family beta

| Grade | Permanent app | Verified release |
| --- | --- | --- |
| Kindergarten | [Open Kindergarten](https://ninjadojo.meghangames.com/?grade=kindergarten) | Shared source `55e9189c7f38f6d6436a6e3b5acd7f115d5964a8` |
| Grade 2 | [Open Grade 2](https://ninjadojo.meghangames.com/?grade=grade2) | Same application source |
| Grade 5 | [Open Grade 5](https://ninjadojo.meghangames.com/?grade=grade5) | Same application source |

These are permanent, parent-authenticated family beta links on one origin, not expiring previews. Cloudflare version `9284d0af-7088-4aea-a34f-f86bc3f78665` serves all three, with A2 version `09948689-ea48-4ff6-a9a2-798a6c6114fb` retained for rollback. Existing Firebase and Pages aliases remain on October 5 source `ef9d1f75df7046152c4829e8f7cfca635f303461`, preserving their local records; A3.1 did not update them. The canonical deployment matches [PR #58](https://github.com/FionnbarZero/WeeklyDictationApp/pull/58) merge `55e9189`.

## Current capability matrix

| Capability | Verified state | Remaining work or limit |
| --- | --- | --- |
| Completed writing and reading scores | Immutable family-owned online results with local retry records; second-browser score recovery passed | Older device-only histories are preserved but not automatically mapped to online children |
| Game results | A3.1 live: all three canonical grades completed Memory Lanterns, uploaded, survived reload, and recovered each attempt once in a fresh browser; 98 exact-package continuity/saving/history checks passed | Per-target results and all-game policy coverage remain incomplete; device save confirmation alone is not cloud confirmation |
| Completed-attempt history | A3.1 live: recent 50 results, bounded explicit older pages, and a separate point per distinct completed attempt; same-time attempts and insertion between pages passed live verification | Page totals are not lifetime totals; durable ledger growth and per-target provenance remain later work |
| Exact acquisition resume | Kindergarten/Grade 5 writing and all three ordinary reading Dojos checkpoint reviewed trials; Grade 2's existing activity state syncs too | Stroke Order, Whispering Scrolls and explicit reentry integration remain unfinished; simultaneous conflicting device edits pause rather than merge |
| Curriculum | Automatic read-only Google source service is live; all three apps use the validated endpoint | Request-driven refresh, no mid-activity replacement; an outage retains the last validated snapshot |
| Problem reports | Reports save locally and survive reload; session-end batching retained; shared pause/resume passed packaged three-grade tests and live Grade 5 timer/navigation checks | Email/share needs user action; physical-device and broader game-specific quality still require testing |
| Audio and microphone | Hosted tests cover browser playback, synthetic recording/comparison, denial handling, and cleanup | Physical iMac/iPad sound and microphone testing remains necessary; no retained recordings |
| Writing and Stroke Order | Both retained in product direction with separate acquisition progress and identical grade-owned teaching rules | Full live compliance and removal of experimental labels must be checked; neither is replaced |
| Reading and Whispering Scrolls | Both retained with separate acquisition progress; Whispering Scrolls must follow reading acquisition rules, including comparison before self-assessment | Verify complete integration against those rules; no automatic pronunciation grading |
| Other EduGames | Grade-specific game library and some integrated activities exist | Apply the owner's exact tier, sentence, pinyin, and reinforcement rules; do not assume generic game availability means integration is finished |
| Generated supplemental content | Owner authorizes generated meanings, contexts, and pinyin without manual preapproval | Existing approval-only catalog implementation must be changed and validated before claiming automatic content generation is live |
| Cross-device accounts and storage | Owner-authorized parent sign-in and family syncing live; two independent browser contexts recovered the score and next prompt | Use the same parent account sequentially across devices; children never sign in; historical data migration remains separate |

The teacher documents remain authoritative for target vocabulary, tiers, dates, and units. Generated supporting content must be distinguished from teacher-authored material. Future Kindergarten unit boundaries come from those materials, not an inferred calendar.

## Data and privacy

Confirmed scores and saved practice sync through the parent's private family account. Reports, pending/offline writes and older device-only histories still depend on their browser and origin. Do not clear site data to fix a version problem. Parent controls can export scoped device records without authentication tokens. Existing legacy Grade 2 keys remain separate; do not silently migrate or assume complete historical continuity.

Recordings are temporary comparison data, not stored audio. Synthetic tests do not access real child records. The separate synthetic staging environment remains prohibited from receiving real child data, recordings, credentials, or copied family state.

Rollback releases are retained for both Firebase sites and in Grade 2 deployment history. Restoring code is not a substitute for data recovery. Legacy Grade 2 backup/restore evidence does not establish coverage of every new ledger, report, or mastery key; verify that before a storage migration.

## Verification evidence

A3.1 is published at merge `55e9189`. Final-head CI passed all five jobs; the tree-identical merge passed 675 unit tests, 98 exact-package desktop/tablet checks, and 3 production-intended family-policy emulator checks, plus type/lint/format/build gates. The repaired head passed 44 three-grade reconciliation checks before merge. Live manifest and 129 public files matched; six public-entry/report checks and real-backend three-grade saving/reload/fresh-browser recovery passed. The new query and stable pagination preserved 55 same-time synthetic attempts as separate graph points without caching older pages, even with a newer score inserted between pages. All disposable accounts and scoped records were cleaned up; real records and security configuration were untouched. See [release evidence](./docs/a3-release-2026-10-07.md) and [review repair provenance](./docs/a3-result-history.md). Curriculum pinning, automatic unfinished-conflict resolution, and bounded durable storage remain pending; A3 is not complete.

October 6 A2 release at merge `b72ed85` is now the immediate rollback. Final-head CI passed all five jobs; the tree-identical merge passed all 88 exact-package desktop/tablet checks. Live manifest and 129 public files matched; six public-entry/report checks and real-backend three-grade saving/reload/fresh-browser recovery passed. Reporting paused the live Grade 5 timer and navigation retained its document. Synthetic records were removed; real data and security configuration were untouched. See [release evidence](./docs/a2-release-2026-10-06.md) and [repair provenance](./docs/a2-preserve-active-work.md).

October 6 A1 release: all five final-head CI jobs passed; the tree-identical merge separately passed 28 exact-package checks on Node 24.21.0. All 120 public canonical files matched the tested artifact. Live three-grade game saving/reload/cross-browser recovery, Grade 5 reviewed-practice recovery, anonymous denial, and six desktop/tablet-touch public-route/report checks passed. Disposable accounts and records were removed; real records and security settings were untouched. See the [release evidence](./docs/a1-release-2026-10-06.md). Physical-device audio, Safari, and broader roadmap work remain outstanding.

October 5 family-sync release checks:

- 635 unit tests plus type checking, lint, and repository formatting passed.
- All 44 grade browser regressions passed, including both Grade 5 Boss rounds, Kindergarten's 14 Unit 1 targets, saved acquisition, curriculum, scores, reporting and recording cleanup.
- The exact additive production policy passed five scoped emulator checks, including interrupted uploads, conflicts and family isolation. Stricter legacy root-policy tests are not represented as production passes.
- Two independent browser contexts passed parent sign-up/sign-in, score and next-prompt recovery, all three grade hubs and denied anonymous access on the packaged build and again on the published canonical origin. Synthetic accounts/records were cleaned up without touching real records.
- All 120 public application files matched their recorded hashes at all four live origins. Desktop and iPad-style entry/report controls and homepage links passed.
- Physical iMac/iPad sound and microphone quality and remaining activity integration still need family testing; no claim is made that all screens or activities are bug-free.

## Next work and release policy

Follow the [roadmap execution queue](./ROADMAP.md#immediate-execution-order): shared reliability first, then Grade 5-specific issues, Kindergarten, and Grade 2, with incremental game releases. Target iMac and iPad; preserve free activity choice and Done for today. A2 active-work continuity and A3.1 distinct attempt graphs are published. Offline reopening is implemented locally, subject to release review and offline-aware rollback rehearsal. Continue A3.2 with Grade 2 corrected-week adoption and durable discard. Automatic unfinished conflict resolution, complete game-subset coverage, and retention policy remain pending; no A3.2 increment is a completed release.

### October 6 architecture audit baseline

Audit source: Main at `6832900e5638cefc1264adddc7d83df85ae3ddba`. All 635 unit tests passed during the read-only audit; this did not establish browser or physical-device coverage for the findings below. No production records were changed.

| Finding | Evidence / current limitation | Queue |
| --- | --- | --- |
| Canonical game saving | Public `.html` URL redirects to extensionless path; `src/familyBeta/runtime.ts` uses the suffix to enable family mode, and outer game completion ignores a null saved result | A1 |
| Active work can disappear | `src/familyBeta/main.tsx` clears readiness after sync failure and conditionally unmounts the activity; outer tabs bypass activity exit confirmation | A2 |
| Reporting lacks lifecycle pause | `src/familyBeta/ProblemReporter.tsx` opens the dialog without a shared activity pause operation | A2 |
| Curriculum edits block acquisition | `src/familyBeta/acquisitionStore.ts` rejects mismatched target fingerprints; the changed-curriculum unit test confirms preservation plus blocking, without recovery | A3 |
| Sync conflicts and growth | `src/familyBeta/deviceSync.ts` blocks conflicting whole records; practice/result histories are reread and accumulated checkpoints grow | A3 |
| Curriculum refresh latency | `backend/curriculumServer.ts` waits for refresh across grades before serving retained data; health returns 200 even when refresh fails | A3 |
| Game policy drift | `src/ninjaSkills/content.ts` and `src/familyBeta/PreviewLearningHub.tsx` contain tier/routing rules that conflict with approved game policy | B–D |
| Release/test drift | Main quality workflow does not exercise the exact family-sync packaging path; emulator defaults to root policy rather than the deployed additive policy | A1, E |
| Hosting and legacy tools | Historical fixed-artifact packagers remain; canonical public response lacks CSP/framing restrictions while root hosting configuration has them | E |

Reproduce these findings against the current revision before repairing them. The roadmap tracks implementation; this table preserves audit evidence and does not turn architectural risks into claims of observed data loss or compromise.

The owner gives standing approval to publish tested fixes to the affected permanent live grade. Keep regression checks, storage compatibility, exact-artifact publication, rollback, and post-release verification. Stop before separately unauthorized production data resets, authentication/security changes, or destructive migrations. The owner merged PR #58 and authorized its verified A3.1 canonical release, recorded in the A3.1 release report. A3 remains underway; A3.2 and A3.3 require their own implementation and review. The roadmap's task-specific model and review gates remain applicable.

Main was not merged by the October 5 release operation. The owner authorized source reconciliation on October 6 through [PR 53](https://github.com/FionnbarZero/WeeklyDictationApp/pull/53). Live artifacts retain their exact published source identity even after source integration; a merge is not a deployment. Documentation, tests and development-only dependency fixes do not by themselves update the live application.

## Completed engineering foundations

Program A cleanup was merged through PR 39 at `10d44ccd7c006d02c73e7accb11fb29bff54caf6`. It established explicit workspace/practice operations, bounded reads, lazy history/activity loading, and persistence boundaries. Those contracts remain protected; product behavior changes are deliberate changes rather than incidental refactoring.

Program B1 established isolated synthetic staging. Its recorded deployment `29e0f972f7ec` passed synthetic Grade 2 acquisition resume, atomic completion, reload, second-browser visibility, App Check observation, and cleanup. See [staging evidence](./docs/staging-foundation.md). This is not evidence of real-family cross-device synchronization in the live beta.

The family-sync release now supplies its own live two-browser acceptance; broader legacy B2 migration/restore and B4 operations acceptance remain unfinished. Dependency advisories, declared Node 24 versus local runtime differences, bundle budgets, and physical-device performance remain engineering risks. Production's unchanged legacy rules also differ from the stricter root repository policy; this release adds only the separately tested family collections.

## Documentation authority

1. This file states verified current capability and explicit gaps.
2. [ROADMAP.md](./ROADMAP.md) states approved priorities and product requirements.
3. [ADR 0009](./docs/decisions/0009-activity-reliability-and-staged-delivery.md) records the latest reliability and staged-delivery decisions; [ADR 0008](./docs/decisions/0008-family-beta-product-and-release-policy.md) retains unaffected teaching and release policy.
4. [Release inventory](./docs/family-beta-release-inventory.md) and [A3.1 live release record](./docs/a3-release-2026-10-07.md) identify permanent URLs and rollback artifacts.
5. [Family beta operations](./docs/family-beta-operations.md) defines testing, publication, containment, and data protection.
6. [PROJECT_PLAN.md](./PROJECT_PLAN.md) and dated earlier reports preserve history; their superseded implementation status is not an execution instruction.
