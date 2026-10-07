# A2 activity continuity and review

A2 implements the in-session interruption requirements in [ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md). It preserves an open activity through family navigation, reporting, and failed syncing. It does not implement A3's curriculum migrations, automatic conflict selection, or new result graphs. It is now merged as `b72ed85` and published; see the [A2 release record](./a2-release-2026-10-06.md). The verification stages below preserve their original provenance.

## Reproduced baseline

On A1 source with regression-only commit `c4ef932`, the exact family package failed three Grade 5 checks: reporting let the teaching timer expire, returning from Progress created a fresh activity, and a simulated Firestore outage removed the activity. The regression tests preceded implementation.

## Shared activity contract

The family wrapper owns one in-session slot per selected child, grade, resolved practice week, and activity entry. Each slot retains its own document and activity clock. Grade engines still own prompts, teaching phases, scoring, and reviewed checkpoints. Outer Ninja Skills games now use the same document boundary through `family-game.html`.

| Contract field or operation | Owner and behavior |
| --- | --- |
| Child and grade | Fixed profile on the slot; embedded saving does not follow the mutable parent selector. A missing slot profile fails closed. |
| Week and content | Resolved week, loaded curriculum hash, and build revision are recorded on the slot. A game retains its validated pack and target provenance. These are in-session values, not A3's durable version migration. |
| Attempt identity | Existing grade session IDs remain unchanged; an outer game keeps its generated attempt ID through pausing and save retries. |
| Prompt and phase | Existing engine state stays mounted. Switching tabs, weeks, or children hides and pauses the original document without resetting it. |
| Timer and animation | A document-owned clock preserves the remaining delay and excludes paused time. Overlapping reporting, navigation, visibility, and manual pauses do not accidentally resume one another. Phaser scenes and CSS animations pause too. |
| Audio | Prompt playback stops at interruption and repeats the interrupted cue on return; it does not complete a teaching sequence while paused. Existing recorded-comparison playback retains its position. Transient game sounds stop. |
| Recording | An active recording or pending permission request is cancelled; late permission releases the microphone without starting a recorder. Return offers the same recording prompt. A completed temporary clip remains available during the visit. |
| Exit and discard | Activity Exit pauses to the family hub. Resume restores the same document. Explicit discard and parent sign-out require confirmation. Done for today and confirmed completion keep their existing scoring behavior. |
| Durable save | Existing reviewed checkpoints and immutable completed-result records are unchanged. Games only close after local read-back confirmation; upload confirmation remains separate. No recording or handwriting enters storage. |
| Sync failure | A child whose account and lessons already loaded can keep working. Readiness is not revoked, the local outbox remains available, and online events, periodic retry, or Retry saving can acknowledge it later. First-time loading still requires safe initialization. |
| Reload | Existing reviewed checkpoint recovery applies. Temporary handwriting, clips, and unreviewed game state are not durable; their provisional work must be repeated. |

Messages from embedded activities require both the same origin and the actual registered source window. Completion also checks the slot's attempt, child, grade, and saved ledger record. Late account/child requests cannot change another selected child's displayed sync state. Remote hydration is disabled for children with a retained activity document.

Retained Grade 2 documents for one child now share a single parent-owned reviewed-state store. Each engine operation starts from that store's current state, so saving one week does not leave another retained week with an obsolete child-wide snapshot. Subscribers receive state updates without replacing their document or provisional activity. Saves still compare the expected state and the last confirmed storage value; stale asynchronous or external-tab writes fail closed rather than merging arbitrary snapshots. Closing the final slot or changing accounts closes its owner and blocks delayed writes. Existing acquisition journals and compare-and-write guards remain. Automatic resolution of competing unfinished copies across devices belongs to A3.

## PR #56 review repairs

The three reported failures were reproduced before implementation in regression-only commit `0854222`: a failed expired-token renewal removed the active document; returning to a loaded grade offline lost the selected workspace; and two retained Grade 2 weeks could not both continue saving. All three original checks failed, then passed on repair commit `604cd4a`.

- **Token renewal:** transient network, timeout, throttling, and server failures retain the initialized local family session without returning an expired token for cloud access. Confirmed invalid credentials still sign out. Renewal requests are coalesced; late success cannot undo sign-out and late failure cannot clear a replacement account.
- **Offline grade return:** the wrapper retains each grade's validated curriculum during the visit, so a failed refresh does not replace an existing workspace with an empty week. This is an in-session cache, not A3's durable curriculum pinning.
- **Retained Grade 2 weeks:** the shared store described above preserves both weeks' checkpoints and separate completed results. Regression coverage finishes both visits and checks both results and checkpoints after reload. External conflicts are still detected, not silently resolved.

The original PR's GitHub browser job also failed because a scoring test depended on the host's speech service. The same failure was reproduced locally: prompt audio failed, so Skip Timer correctly remained disabled. The test now supplies explicit speech success/error events while using the real prompt sequencing and audio gate. A separate regression verifies that audio failure prevents collection and a successful retry re-enables it; this does not establish physical-device audio quality.

The subsequent re-review found a delayed-download race: discarding the last retained Grade 2 slot allowed a download to start, then the replacement activity opened before that download finished. The stale permission could replace its stored checkpoint underneath its initialized state owner, blocking the next answer. Regression-only commit `79de436` reproduced the failure. Repair `b7e6061` checks the current account scope and retained slots immediately before each downloaded record is adopted, with no asynchronous gap before writing. A newly opened activity keeps its checkpoint and sync baseline, warns that newer online practice exists, and continues accepting answers. Initial hydration remains allowed when no activity owns the child. This is an ownership guard, not A3 conflict resolution; neither competing copy is silently discarded.

## Verification

The regression suite covers timer pauses, actual handwriting retention, offline reviewed work and successful retry, nested/manual pause, explicit discard, fixed child ownership, game feedback delays, and recording interruption in all three grades' acquisition and Boss activities. It also checks that completed temporary recording data remains playable without entering browser storage.

Latest delayed-download repair verification on October 6, 2026:

- 664 unit tests passed, including three live download-permission tests: revocation while pending, allowed initial hydration, and permission checked separately for each record.
- 88 exact-package checks passed: 44 each on Chromium desktop and touch-tablet profiles. The new delayed-response regression preserves the replacement Grade 2 activity's checkpoint and sync baseline, then successfully records its next answer without a reload.
- Two production-intended family-policy emulator checks passed with disposable records.
- Type checking, lint, repository formatting, targeted family reliability formatting, and production build budgets passed. Initial JavaScript remains 542,574 / 550,000 bytes; CSS remains 42,745 / 60,000 bytes.

The latest tested family package is source `b7e6061c394da080ec96415a9c1dc61e167eeac3`, tree digest `362a794850bcebd8f78431e8fad9dc395754710bab5e3a3ea95d0b93d8d0be5f`, retained at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-M7yVoX`. Subsequent changes record documentation only. All five CI jobs passed on prior head `8fecff2`; the new final head must pass its own CI. The standalone/reconciliation results below are earlier evidence, not newly rerun checks for this narrow repair.

Earlier post-review verification on October 6, 2026:

- 661 unit tests, including renewal invalidation/races and shared-store stale-write protection.
- 86 exact-package checks: 43 each on Chromium desktop and touch-tablet profiles, including all four new review regressions on both profiles.
- 58 standalone browser checks, including the deterministic scoring check and explicit audio-failure/retry regression.
- 44 reconciliation checks across all three grades, including both Grade 5 reading Boss rounds, temporary recording cleanup, reporting, and reviewed progress after reload.
- Two production-intended family-policy emulator checks with disposable records.
- Type checking, lint, repository formatting, and the expanded family reliability formatting/import-order gate passed.
- Final production build budgets passed: 542,574 of 550,000 initial JavaScript bytes and 42,745 of 60,000 initial CSS bytes.

The post-review family package is source `575a4fc6941d45c9213bfad5546e1e6612afb662`, with 131 files and tree digest `cff3a9295bfe5c22e70493bd311a8093a4fee399521a6de812a65eb113bb2740`. It is retained locally at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-7Ls4B2`. Subsequent application cleanup only sorts imports and removes an unused state reference; subsequent tests make standalone audio outcomes deterministic. Final-head CI must rebuild and retest its own package; this is not a published artifact.

Original pre-review local acceptance passed on October 6, 2026:

- 645 unit tests; type checking, lint, repository formatting, and the additional family reliability formatting gate.
- 78 exact-package checks: 39 each on Chromium desktop and touch-tablet profiles, running in isolation.
- All 44 reconciliation regressions, including both Grade 5 reading Boss rounds and reviewed acquisition recovery after reload.
- All 32 prototype/visual checks; standalone navigation and the existing visual references remain intact.
- Two production-intended family-policy emulator tests covering confirmed result retries, practice sync, conflicts, and denied cross-family/anonymous access.
- Production performance budgets: 540,990 of 550,000 initial JavaScript bytes and 42,745 of 60,000 initial CSS bytes.

That pre-review package is source `e5efedb858a66eb458b821edd581c46d568c17a5`, containing the application changes through `961c35c` plus documentation and CI configuration. Its 131-file tree digest is `7b66387e4d959aabc86953f86474a1b1aff3ded2b66f1e384e899ce4e0b3e539`. The local package is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-4gvDUH`; its `family-beta-manifest.json` records individual file hashes. These older results did not cover the three subsequently identified review failures.

An earlier concurrent prototype run removed the package runner's temporary trace files and interrupted one tablet test. The final isolated package run passed all 78 checks; the interrupted run is not counted as a pass. The initial reconciliation run also caught a missing Kindergarten Exit integration and an outdated Grade 5 navigation expectation; both were corrected before the final 44-check pass.

All family-package network requests use synthetic fixtures. Emulator checks use disposable local records. Physical iMac/iPad microphone and sound quality, Safari, long-session memory pressure from retained documents, and game-specific movement quality remain release-review/device-testing concerns.

## Compatibility and release handoff

No storage schema, teacher vocabulary, scoring rule, authentication configuration, security rule, or production record was changed. Client-side token renewal and Grade 2's reviewed-state ownership were repaired; there is no migration or destructive cleanup. [PR #56](https://github.com/FionnbarZero/WeeklyDictationApp/pull/56) merged as `b72ed85`. Final focused release review checked renewal, shared ownership, live hydration guards and interruption behavior; all five final-head CI jobs passed.

The owner authorized publication after merging. The merge artifact passed all 88 package checks and real-backend synthetic acceptance, was published once, and passed live verification. [Release evidence](./a2-release-2026-10-06.md) identifies the exact artifact, current Cloudflare version, live checks and limitations. A1 version `2e0cb204-5e1f-4483-bafa-4f28911718d7` is the immediate rollback target. A3 remains separate.
