# A2 activity continuity and review

A2 implements the in-session interruption requirements in [ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md). It preserves an open activity through family navigation, reporting, and failed syncing. It does not implement A3's curriculum migrations, automatic conflict selection, or new result graphs. Publication requires the roadmap's GPT-6 Astra High release review; the live app remains A1.

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

The legacy Grade 2 storage wrapper detects a stale checkpoint write rather than overwriting a newer document's record. Existing acquisition compare-and-write guards remain. Automatic resolution of competing unfinished copies belongs to A3; A2 does not claim to resolve those conflicts.

## Verification

The regression suite covers timer pauses, actual handwriting retention, offline reviewed work and successful retry, nested/manual pause, explicit discard, fixed child ownership, game feedback delays, and recording interruption in all three grades' acquisition and Boss activities. It also checks that completed temporary recording data remains playable without entering browser storage.

Local acceptance passed on October 6, 2026:

- 645 unit tests; type checking, lint, repository formatting, and the additional family reliability formatting gate.
- 78 exact-package checks: 39 each on Chromium desktop and touch-tablet profiles, running in isolation.
- All 44 reconciliation regressions, including both Grade 5 reading Boss rounds and reviewed acquisition recovery after reload.
- All 32 prototype/visual checks; standalone navigation and the existing visual references remain intact.
- Two production-intended family-policy emulator tests covering confirmed result retries, practice sync, conflicts, and denied cross-family/anonymous access.
- Production performance budgets: 540,990 of 550,000 initial JavaScript bytes and 42,745 of 60,000 initial CSS bytes.

The tested package is source `e5efedb858a66eb458b821edd581c46d568c17a5`, containing the application changes through `961c35c` plus documentation and CI configuration. Its 131-file tree digest is `7b66387e4d959aabc86953f86474a1b1aff3ded2b66f1e384e899ce4e0b3e539`. The local package is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-4gvDUH`; its `family-beta-manifest.json` records individual file hashes. This evidence update changes documentation only.

An earlier concurrent prototype run removed the package runner's temporary trace files and interrupted one tablet test. The final isolated package run passed all 78 checks; the interrupted run is not counted as a pass. The initial reconciliation run also caught a missing Kindergarten Exit integration and an outdated Grade 5 navigation expectation; both were corrected before the final 44-check pass.

All family-package network requests use synthetic fixtures. Emulator checks use disposable local records. Physical iMac/iPad microphone and sound quality, Safari, long-session memory pressure from retained documents, and game-specific movement quality remain release-review/device-testing concerns.

## Compatibility and release handoff

No storage schema, grade engine, teacher vocabulary, scoring rule, authentication configuration, security rule, or production record was changed. There is no migration or destructive cleanup. Review retained-document ownership, duplicate unfinished checkpoint handling, audio interruption races, and navigation/recording tests before publication. GitHub push and PR creation await explicit permission after the publishing permission check blocked the remote write; no branch push, PR, merge, deployment, or GitHub CI result is claimed.

After Astra review and CI pass, merge through repository protections, package the merge commit, rerun the exact-package checks, and publish that exact artifact using the established canonical release process. Retain the currently published A1 Cloudflare version `2e0cb204-5e1f-4483-bafa-4f28911718d7` and its [release record](./a1-release-2026-10-06.md) as the immediate rollback target. Verify all three canonical grade links and synthetic saving after release; do not label this branch or its merge as live before that happens.
