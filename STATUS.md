# Weekly Dictation status

Updated October 5, 2026 against the [verified live release](./docs/family-beta-live-2026-10-05.md) and the owner's [clarified product policy](./docs/decisions/0008-family-beta-product-and-release-policy.md).

This is the current capability summary. [ROADMAP.md](./ROADMAP.md) defines priorities and required behavior; planned requirements are not evidence that a feature is implemented.

## Live family beta

| Grade | Permanent app | Verified release |
| --- | --- | --- |
| Kindergarten | [Open Kindergarten](https://weeklydictation-k-beta.web.app/) | Source `f4ef04f1e9898a21553ade00db425bcd8d897bc0`; Firebase `08c2e412a3095227` |
| Grade 2 | [Open Grade 2](https://fionnbarzero.github.io/WeeklyDictationApp/) | Same application source; Pages deployment `0b499f86676dcffe4a62fcf4173a8a32402d039a` |
| Grade 5 | [Open Grade 5](https://weeklydictation-g5-beta.web.app/) | Same application source; Firebase `424b6a63322ed355` |

These are live one-device family beta apps, not expiring review links. The existing header says “Review build f4ef04f”; that label does not mean an older live release is intended. All three use the family wrapper. Local addresses and historical standalone routes are not the canonical beta entry points.

## Current capability matrix

| Capability | Verified state | Remaining work or limit |
| --- | --- | --- |
| Completed writing and reading scores | Browser-local completed-result ledger in all three grades; hosted writing/reading and reload checks passed | No cross-device synchronization; full continuity with older standalone mastery histories is not promised |
| Game results | Hosted Memory Lanterns completion and score/reload checks passed for each grade | Per-game weekly progress and detailed coverage for every game are requirements, not verified complete |
| Exact acquisition resume | Required after each completed trial for each separately tracked activity | Audit and repair the live family integration; legacy persistence tests alone do not prove every new path resumes correctly |
| Curriculum | Automatic read-only Google source service is live; all three apps use the validated endpoint | Request-driven refresh, no mid-activity replacement; an outage retains the last validated snapshot |
| Problem reports | Reports save locally and survive reload; end-of-session batch sharing and cancellation checks passed | Email/share needs a user action; pause-and-preserve behavior across every game is required and still needs verification |
| Audio and microphone | Hosted tests cover browser playback, synthetic recording/comparison, denial handling, and cleanup | Physical iMac/iPad sound and microphone testing remains necessary; no retained recordings |
| Writing and Stroke Order | Both retained in product direction with separate acquisition progress and identical grade-owned teaching rules | Full live compliance and removal of experimental labels must be checked; neither is replaced |
| Reading and Whispering Scrolls | Both retained with separate acquisition progress; Whispering Scrolls must follow reading acquisition rules, including comparison before self-assessment | Verify complete integration against those rules; no automatic pronunciation grading |
| Other EduGames | Grade-specific game library and some integrated activities exist | Apply the owner's exact tier, sentence, pinyin, and reinforcement rules; do not assume generic game availability means integration is finished |
| Generated supplemental content | Owner authorizes generated meanings, contexts, and pinyin without manual preapproval | Existing approval-only catalog implementation must be changed and validated before claiming automatic content generation is live |
| Cross-device accounts and storage | Deferred for the approved one-device beta | Production sign-in, security, migration, and actual multi-device acceptance remain separate work |

The teacher documents remain authoritative for target vocabulary, tiers, dates, and units. Generated supporting content must be distinguished from teacher-authored material. Future Kindergarten unit boundaries come from those materials, not an inferred calendar.

## Data and privacy

Completed scores and reports persist only in the same browser profile and origin. Clearing site data removes local records. Preview and live origins do not share storage. Existing legacy Grade 2 keys remain separate from the family wrapper's records; do not erase, silently migrate, or assume complete historical continuity.

Recordings are temporary comparison data, not stored audio. Synthetic tests do not access real child records. The separate synthetic staging environment remains prohibited from receiving real child data, recordings, credentials, or copied family state.

Rollback releases are retained for both Firebase sites and in Grade 2 deployment history. Restoring code is not a substitute for data recovery. Legacy Grade 2 backup/restore evidence does not establish coverage of every new ledger, report, or mastery key; verify that before a storage migration.

## Verification evidence

These are recorded October 5 release results, not a new test run for this documentation update:

- 625 unit tests plus type checking, lint, and repository formatting passed for the reviewed release.
- 39 hosted acceptance checks passed against the exact candidate, including curriculum, Boss scoring, persistence, report batching, recording lifecycle, and failure handling.
- Every declared live file matched its checksum: Kindergarten 121, Grade 2 122, Grade 5 121.
- Fresh browser checks passed on all three permanent roots for grade selection, curriculum, game completion, score/reload, report/reload, and batch dialog, with zero page errors.
- The [release review](./docs/grade5-review-2026-10-05.md) records physical-device and source-history limitations. No claim is made that all screens or activities are bug-free.

## Next work and release policy

Work Grade 5 first: fix daily-learning and Boss bugs, then integrate the games, then improve the UI. Target iMac and iPad. Keep activity choice free and Done for today as the session endpoint. Do not introduce a required daily path.

The owner gives standing approval to publish tested fixes to the affected permanent live grade. Do not ask for another routine preview/deployment approval. Keep regression checks, storage compatibility, exact-artifact publication, rollback, and post-release verification. Stop before separately unauthorized production data resets, authentication/security changes, or destructive migrations.

Main was not merged by the October 5 release operation. Application source and release records remain on `codex/family-beta-reconciliation`; live artifacts identify their exact source. Future source integration must respect repository protections and be verified, not inferred from a successful deployment. Documentation-only commits do not change application assets.

## Completed engineering foundations

Program A cleanup was merged through PR 39 at `10d44ccd7c006d02c73e7accb11fb29bff54caf6`. It established explicit workspace/practice operations, bounded reads, lazy history/activity loading, and persistence boundaries. Those contracts remain protected; product behavior changes are deliberate changes rather than incidental refactoring.

Program B1 established isolated synthetic staging. Its recorded deployment `29e0f972f7ec` passed synthetic Grade 2 acquisition resume, atomic completion, reload, second-browser visibility, App Check observation, and cleanup. See [staging evidence](./docs/staging-foundation.md). This is not evidence of real-family cross-device synchronization in the live beta.

Broader B2 migration/restore rehearsal, B3 cross-device pilot, and B4 operations acceptance remain deferred. Dependency advisories, declared Node 24 versus local runtime differences, bundle budgets, and physical-device performance remain engineering risks; retain their checks without using obsolete prototype activation gates to block compatible beta bug fixes.

## Documentation authority

1. This file states verified current capability and explicit gaps.
2. [ROADMAP.md](./ROADMAP.md) states approved priorities and product requirements.
3. [ADR 0008](./docs/decisions/0008-family-beta-product-and-release-policy.md) records the latest owner decisions and superseded restrictions.
4. [Release inventory](./docs/family-beta-release-inventory.md) and [live release record](./docs/family-beta-live-2026-10-05.md) identify permanent URLs and rollback artifacts.
5. [Family beta operations](./docs/family-beta-operations.md) defines testing, publication, containment, and data protection.
6. [PROJECT_PLAN.md](./PROJECT_PLAN.md) and dated earlier reports preserve history; their superseded implementation status is not an execution instruction.
