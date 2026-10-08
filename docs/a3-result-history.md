# A3.1 — bounded result history and attempt graphs

Status: October 7 review findings repaired, merged in PR #58 as `55e9189`, and published/live-verified October 7 on all three canonical grades. See the [A3.1 release record](./a3-release-2026-10-07.md) for its historical artifact and acceptance. A3.2 subsequently merged in PR #60 as `490fe41` and was [published/live-verified](./a32-release-2026-10-07.md). A3.3's score-safety prerequisite is implemented and tested locally, pending independent review; automatic checkpoint selection and bounded history storage remain unfinished. Nothing in A3.3 is published.

The October 8 local continuation is now at `0e0b501` (after `94cbd43` and `cecced5`). It characterizes Grade 2's bundled workspace into stable history and mutable checkpoint records, protects the internal partition keys, preserves the existing legacy workspace format, and groups progression-linked envelopes, receipts, and pending checkpoints by activity without selecting or merging a winner. The complete unit suite passes **796 tests**, with type checking and lint passing. This remains preparatory local work: cloud arbitration, full per-activity migration, bounded online history, and independent Astra review are still pending.

## Scope and sequence

A3 is split at three architectural boundaries so a persistence migration is not hidden inside a display change:

1. **A3.1, this change:** bounded online result-history reads and one graph point per distinct completed attempt.
2. **A3.2, published as `490fe41`:** durable validated curriculum/strategy pinning, prompt-resume compatibility, corrected Grade 2 editions, confirmed discard, and an offline-aware preservation rollback. Independent review, final-head checks, exact merge-package checks, and live acceptance passed; [implementation evidence](./a3-curriculum-pinning.md) retains the staged history.
3. **A3.3, in progress:** whole-activity unfinished-checkpoint reconciliation, deterministic reviewed-answer time/skew/tie handling, separation of checkpoint data from accumulated history, and bounded durable storage. Completed attempts from either device must remain immutable and independent. The prerequisite below must not be reported as completion of A3.3.

Detailed per-target provenance and storage/retention integration still require their appropriate schema and compatibility work. E2's destructive historical cleanup remains separately authorized. This PR does not complete A3.

## A3.3 score-safety prerequisite — October 7, unpublished

Branch: `codex/a33-checkpoint-reconciliation`, based on `b4056d6`. Latest tested code/test revision: `0d9f83db286d80e020ed00ddf95fd7b18dc01177`; subsequent changes to this acceptance record are documentation only. The branch is local, not pushed, merged or published. This is the existing A3.3 workstream, not a new product plan or smoke-test milestone. The owner accepted the bounded A3.2 smoke check in chat; do not repeat it for these unpublished changes. Implementation and independent review remain assigned to **GPT-6 Astra · Extra High**.

### Reproduced defects and repair

- At regression-only commit `cf5722b`, all three desktop grade checks reproduced completed scores remaining in the device outbox because unfinished-practice sync failed first. `syncCompletedBeforePractice` now validates, uploads, reads back and acknowledges completed results before attempting mutable practice sync. Account/child changes stop stale acknowledgement and subsequent work. Failed upload/readback keeps the retry record; HTTP access-denial versus temporary-outage classifications remain available to the established offline-access policy.
- Per-key results previously hid different legacy copies of the same ID. A shared ledger validator now rejects contradictory copies before uploading or acknowledging them. Exact duplicates remain idempotent; separate IDs remain separate points, even with identical completion times. A confirmed upload repairs an interrupted local result-ledger write before removing its outbox copy. No completed result is pruned.
- Two installations could continue one saved ordinary acquisition session and later submit different completed scores under the same ID. An optional `writerId` on the saved ordinary acquisition record now distinguishes device continuations. Its random browser installation key is never synced; the checkpoint carries the writer ID. Merely opening a saved lesson leaves it unchanged. A different writer claims a new session ID atomically with its first reviewed answer, or before explicitly completing inherited scored work. Same-writer reloads and failed score retries retain that claimed ID; a stale same-device view cannot submit a conflicting score under the live attempt ID. Kindergarten/Grade 5 writing and all three ordinary reading paths consume the claimed identity. Grade 2 writing uses its existing engine session identities and is not converted by this change.
- A verified practice upload no longer retains an unnecessary full-size `:pending` duplicate. The exact baseline is written and read back first; only a matching acknowledged retry copy is removed. A lost response or a different uploader's newer pending payload remains recoverable. Actual checkpoints, completed results, teacher sources and reports are not deleted.

No production records, rules, authentication, hosting, teacher sources, curriculum behavior or game availability have changed. The result document schema and immutable cloud write/readback contract are unchanged. The existing opaque-practice conflict guard is deliberately still in place.

### Required continuation within A3.3

1. Separate each activity checkpoint from accumulated history before enabling newest-reviewed-checkpoint arbitration. Grade 2's `lesson-workspace-v1` currently bundles multiple progressions, immutable score/history facts, mastery projections and recovery journals; selecting one whole workspace is not an acceptable per-activity winner.
2. Define and test deterministic reviewed-answer ordering, clock-skew handling and ties. Opening a lesson, starting a visit, syncing, or rotating an attempt ID must not count as a newer reviewed answer. Never combine phase/timer/queue fields from competing checkpoints.
3. Preserve completed facts independently of whichever unfinished checkpoint wins. Grade 2 transition/fact identities also require compatibility analysis: two branches can share a progression/revision-derived transition ID. Do not silently relabel or overwrite older history to make a merge pass.
4. Bound the active working set and history cache with verified archive/readback and bounded online reads. `reviewedTrials`, Grade 2 embedded state/journals, the result ledger, the 700,000-byte practice ceiling and the 500-record hydration ceiling are still outstanding. Removing a redundant acknowledged retry copy does not solve these limits. Pending offline work must not be silently evicted.
5. Add all-grade, real two-context conflict, storage-growth, migration, older-client and guarded-rollback coverage before independent review and publication. No new owner smoke test until a coherent reviewed build is served and verified.

### Local verification and review handoff

- **777 unit tests and seven production-intended family-policy emulator checks passed.** Type/lint/repository-format/focused-format and production build budgets passed (549,840/550,000 initial JS bytes; 42,745/60,000 initial CSS bytes). JavaScript budget headroom is only 160 bytes; further work must preserve the existing budget, not quietly raise it.
- **All 210 desktop/tablet package checks passed at `18b8014`**, including the existing controlled offline/rollback rehearsals. Its 138 manifest-listed files match tree `c0d7703f18fbf44b30002c367ac66cd63a5095446bd1413f15e8721c33076be9` in local artifact `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-nCCDcB`.
- **All 26 final focused desktop/tablet package checks passed at `0d9f83d`**, covering score delivery despite practice conflict in all grades, Kindergarten/Grade 5 writing, and all three ordinary reading paths. Each two-context case shares an intercepted synthetic backend, verifies two distinct immutable result IDs, and verifies both outboxes are acknowledged. Both another reviewed response and immediate completion of inherited scored work are covered. This package includes the final same-tab completion guard and formatting changes. All 138 files match tree `baffbda284251a98a8f62d4bdaebdea2088bd24f160a15219f2b2660d14c25f3` at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-cmBdOK`.
- The expanded reading test initially ended after an unscored familiar-DT response and incorrectly expected a score. That run was stopped after four fixture failures; the corrected fixture follows the actual teaching sequence until a scored target response exists. No teaching or scoring rule was changed to satisfy it. The full suite now contains 222 cases, but only the 26 focused cases have run on the final source; do not describe the earlier 210-case run as a final-head full-suite pass.

The controlled upgrade/rollback browser rehearsal above is explicitly based on retained A3.1 source `55e9189`, not an A3.2-to-A3.3 migration claim. Attempting to use the A3.2 package as that fixture was rejected by the rollback packager's older-script guard before tests ran; no hosting was changed. Current-A3.2 compatibility/guarded-rollback evidence and the remaining A3.3 acceptance gates are still required before a release. Older clients do not implement the new writer-claim behavior; the optional field alone is not proof of old-client conflict safety.

Next: independent **GPT-6 Astra · Extra High** review of the score-safety prerequisite against `b4056d6`, then continue the same A3.3 checkpoint/history separation and conflict/storage queue above. Do not mark A3.3 complete, merge or publish this as the finished stage, start game/UI work, or ask for owner smoke testing from these local-only checks.

## Reproduced issue

Regression-only commit `d2c2b46` failed before implementation: ordinary refresh followed older result pages even without opening Progress. The browser reproduction also failed its zero-older-requests assertion. The prior Progress view offered daily totals and a list, but no per-attempt graph.

## Contract

- A routine refresh makes one child-scoped query, ordered by completion time and document identity descending. It reads at most 51 documents: 50 visible results and one lookahead to determine whether older history exists.
- Explicit **Older attempts** loads one additional page. **Latest attempts** returns to the refreshed recent page. Only one older page is held by the view; older pages are not copied into the durable browser result ledger.
- The cursor contains only family, child, completion time, and attempt identity. It is validated before use and becomes a strict start-after boundary, never an offset. New scores inserted before that boundary do not move older attempts between pages.
- Child/account navigation cancels pending history loads. A late response cannot appear under another child. A failed page fetch keeps the current page and allows retry. Background sync does not replace an older page being read.
- A failed routine sync switches the latest view to preserved device records without reusing its online cursor. An already-open remote page retains its own loader and boundary. Offline display is explicitly labelled; more records may remain online.
- Local older-page browsing keeps its own continuation flag and reads the device ledger after the last displayed time/identity boundary. Reconnecting does not substitute the online first page as its data source, and new arrivals do not shift an offset. A failed local read leaves the current page and retry available. This does not introduce a second full-history snapshot in view state; bounding the existing local ledger reads remains A3.3 work.
- Both recent and older online pages are checked against existing per-attempt and legacy local copies before adoption. Disagreement or unreadable stored data rejects the page, preserving the current display and both records; a matching per-attempt key cannot hide a conflicting legacy copy. Older pages remain read-only and are not added to the device ledger.
- Each distinct completed attempt has one graph point, including multiple attempts on one day or at the same timestamp. Exact retries deduplicate by attempt identity; conflicting payloads fail closed. Graphs separate grade, channel, and activity; they do not change mastery.
- Graphs use chronological attempt order, with ID tie-breaking, and score percentage. Exact times and numerator/denominator scores are available as text. Times and daily summaries use America/Los_Angeles. Page-only totals are labelled; they are not presented as full-day or lifetime totals.
- The existing immutable save/readback/outbox contract is unchanged. Recent confirmed results retain the existing local-copy behavior. Existing browser records are not pruned, migrated, or deleted. This bounds new history reads and the visible page, not all historical local storage or practice syncing.

The query uses the documented [Firestore structured query](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery) and [runQuery endpoint](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/runQuery). The initial list-documents prototype was replaced after emulator testing exposed unsupported ordered page-token pagination; it is not the implemented transport. No database rule, index configuration, record schema, or authentication configuration changes are included. Production verification of the new query is a release gate, not claimed by local emulator success.

## Verification and release boundary

Focused checks cover pagination limits/cursors, malformed or cross-child data, cancelled/failed reads, duplicate/conflicting attempts, same-time graph points, and channel isolation. The production-intended family-rule emulator exercises 55 same-time attempts across pages, insertion of a new result between pages, and denial to another family.

Packaged desktop/tablet tests cover delayed old-history responses across child switches, retry after history failure, background refresh preserving an older page, online-to-local fallback, separate same-day graph points, and no copying of older pages into device storage.

October 6 local acceptance used clean source `309c5656df838c0be78381998adf1ab9a62dcf08`, including the offline boundary repair in `5986755`. The subsequent acceptance-record update changes documentation only.

| Check | Result |
| --- | --- |
| Unit suite | 671 passed |
| Canonical family package, desktop and tablet-touch | 92 passed; clean package produced by the publication packager |
| Three-grade reconciliation | 44 passed against the rebuilt final source |
| Production-intended family policy, local emulator | 3 passed, including stable cursor pagination and cross-family denial |
| Type checking, lint, repository formatting, focused Biome | Passed |
| Production build and performance budgets | Passed; initial JS 542,574/550,000 bytes and CSS 42,745/60,000 bytes |
| Artifact verification | All 131 files matched their recorded hashes |

The canonical test artifact's file-tree SHA-256 is `95c7444b0f1a4f81e095827bfda1aa6ac681350f419d7960e3e8e9408e5bbccf`. It remains local at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-D8iSN9`; temporary artifacts are not permanent release storage. Desktop and tablet screenshots were inspected for layout and reporting controls. These are Chromium and tablet-emulation checks, not physical iMac/iPad, Safari, or real microphone/speaker-quality acceptance.

## October 7 review repairs

Review of PR #58 at `958c494` found three problems. GitHub's Ubuntu runner could not write the Mac-only screenshot path, so two tests stopped before their recovery assertions. A local older page lost its continuation button after a successful background reconnect. Older online pages also bypassed the existing local-copy integrity check.

Regression-first commit `de7333d` uses Playwright's per-test output directory and adds packaged reproductions for reconnecting, keyed-copy conflicts, and legacy-copy conflicts. All three new desktop cases failed against the unrepaired implementation. Repair `ec32d33` implements the two history boundaries above; it changes no stored schema, immutable-write/outbox policy, authentication, database rules, or production records.

Local repair checks on `ec32d33` passed all 675 unit tests and all 10 focused packaged desktop/tablet history checks, plus type checking, lint, repository formatting, and focused Biome. Additional coverage includes a new result arriving between local pages, a failed local read followed by retry, matching-copy key-order independence, malformed/unreadable storage, and unchanged ledgers after a rejected page. The full canonical suite now contains 98 checks. Final-head integration results are tracked on [PR #58](https://github.com/FionnbarZero/WeeklyDictationApp/pull/58); the earlier acceptance table describes its recorded pre-review source, not a substitute for the repaired head's CI or re-review.

The review repairs did not touch a live site or real family data. Final-head CI subsequently passed all five jobs, and the tree-identical merge passed release review, all 98 canonical package checks, 675 unit tests, and three production-intended family-policy emulator checks. The [October 7 release](./a3-release-2026-10-07.md) records publication, synthetic backend acceptance before and after deployment, and A2 rollback. Stop for approval before any newly required production migration or security change. Do not start A3.2 by treating these history tests as curriculum-resume acceptance.
