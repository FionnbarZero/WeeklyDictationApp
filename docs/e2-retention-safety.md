# E2 retention preview and safety gates

## Current scope

E2.1 and E2.2 are implemented locally on `codex/e2-retention-preview`, based on published E1 source `b4c838d7a96967bf6ac90d6e531b1cbb45ac9061`. The owner confirmed **GPT-6 Astra · Extra High** for E2. The offline summary preview and supplied game-detail inventory preserve all records and cannot delete, update, fetch or export cloud records. Both owner-authorized [independent reviews](./e2-retention-independent-review.md) passed with no actionable introduced defects. E2 security proposals and broader retention coverage remain incomplete and unpublished.

The recorded live baseline is E1 `b4c838d`, Cloudflare version `d92835c9-bbab-4115-8d24-7c0ffe60830b` at 100%, with guarded D2 `a7e55e94-71f0-4dd7-a157-dc10193d3fe0` retained inactive. E1 publication and retirement were completed before E2 began. The primary checkout retains the E1 acceptance document and receipts under `family-beta-artifacts/releases/e1-controller-b4c838d/`, including `closure.json`. E2 has performed no new hosting, authentication, security or family-record operation.

## Retention behavior

[ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md#results-and-retention) retains the current and previous school years in detail and older totals. Completed attempts remain separate graph points; an older attempt is not an obsolete score.

The earlier [retention helper](../src/familyBeta/resultRetention.ts) accepted year substrings: `2024oops` and `2024-99` classified as old, while numeric metadata could throw. Regression tests reproduced both failures before repair. The helper was not called by application runtime or a cleanup executor, so these findings do not establish past data loss.

The repaired classifier requires a complete consecutive range, such as `2026-27` or `2026–2027`. It does not infer a year from completion time, dataset names or the computer clock.

| Supplied metadata | Preview treatment | Completed score |
| --- | --- | --- |
| Current or previous school year | Retain detail | Preserve |
| Valid older school year | Review linked detail in a later inventory | Preserve |
| Missing, malformed or future school year | Hold; do not infer eligibility | Preserve |
| Conflicting copies of the same attempt | Refuse the entire preview | Neither copy changed |
| Invalid score or different child scope | Refuse the entire preview | No changes |

Identical retries deduplicate only by the same stable attempt identity and exact immutable content. Distinct attempts, including matching scores completed at the same time or in different grades, remain distinct. Metadata normalization affects preview output only; original records are never rewritten. The existing application validator and curriculum identity rules are unchanged.

## Offline command

The [preview command](../scripts/preview-family-retention.ts) reads an explicitly supplied JSON array of completed `BetaResult` totals:

```sh
npm run --silent preview:family-retention -- --input completed-scores.json --child exact-child-id --school-year 2026-27
```

Use synthetic fixtures for development. The command does not retrieve a family export, discover credentials or select a child automatically. Any real supplied snapshot and resulting stdout still contain child/attempt identifiers and results; do not commit them or include them in public logs.

Input is bounded to 2,000,000 bytes and 500 supplied score copies. Oversized batches fail rather than truncate. Only a regular UTF-8 JSON file is accepted; symlinks, directories and named pipes are refused. Unknown, duplicate and mutation flags are rejected. Errors do not echo file contents or private paths.

Output is deterministic JSON on stdout with:

- `mode: "read-only"` and `source: "supplied-completed-scores-only"`;
- `completeInventory: false`, even for an empty snapshot;
- `deletionAuthorized: false` and an empty `plannedDeletes` list;
- an explicit `preserveCompletedScore: true` for every distinct attempt.

`olderDetailReview` counts scores whose associated detail needs investigation, not records ready for deletion. A 500-score device-sized snapshot is not an exhaustive family or cloud inventory.

## Why cleanup cannot use this preview alone

| Storage surface | Code evidence | Required protection |
| --- | --- | --- |
| Completed totals | [model](../src/familyBeta/model.ts), [ledger](../src/familyBeta/resultLedger.ts), [cloud results](../src/familyBeta/cloud.ts) | Keep every immutable total and graph point; preserve pending retries and conflicting copies |
| Game completion detail | [game cloud adapter](../src/ninjaSkills/gameCloud.ts), [game progress](../src/ninjaSkills/progress.ts) | Validate complete payload and exact summary/attempt linkage before considering any detail-only action |
| Ordinary acquisition, activity and mastery | [family practice sync](../src/familyBeta/deviceSync.ts) | Separate historical detail from active continuation and mastery; never delete a mixed payload merely because one result is old |
| Game checkpoints and retirement markers | [game cloud adapter](../src/ninjaSkills/gameCloud.ts) | Preserve resumable work and markers that prevent an old device from resurrecting a completed/discarded attempt |
| Legacy sessions and other histories | [production-intended rules](../deployment/firestore-family-sync.rules) | Inventory separately; do not assume these share the family-beta summary schema |
| Problem reports and temporary responses | [ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md#pause-navigation-and-reporting) | Reports are outside retention cleanup; never store recordings or handwriting images to support an inventory |

The production-intended rules deny deletion of `betaResults`, `betaPractice`, `betaGameCheckpoints`, `betaGameRetirements` and `betaGameCompletions`. They also keep completed totals and game completions immutable. This preview neither changes those rules nor proposes bypassing them with an administrator job or TTL.

The next retention slice must establish bounded, fully scoped summary/detail linkage, pagination completeness, active/pending-work exclusions and compatibility with older clients. Any later destructive proposal additionally needs exact targets, summary preservation, backups, restoration rehearsal, concurrency preconditions, failure/retry handling and separate owner authorization. Unknown, orphaned, conflicting or incomplete records remain on hold.

## Game detail inventory

E2.2 is locally implemented in [gameRetentionInventory.ts](../src/familyBeta/gameRetentionInventory.ts), with [33 synthetic regression cases](../tests/gameRetentionInventory.test.ts). It is a pure library function, not an extension of the summary-only CLI and not a cloud exporter or cleanup executor. Independent **GPT-6 Astra · Extra High** review passed with no actionable introduced defect: all 121 focused cases and additional cap, scope and protection probes pass. Exact hashes and acceptance limits are [recorded separately](./e2-retention-independent-review.md#e22-game-inventory-review).

The explicit family/child snapshot contains page chains for results, game completions, pending results, pending game completions, checkpoints and retirement markers. It validates records with the existing application validators, matches each completion against its exact immutable total, and rejects conflicting copies without partial output. Complete supplied page chains are reported separately from actual cloud completeness and family ownership, which remain unverified.

Current and previous school-year detail is retained. Older detail is held when a confirmed supplied total is absent, any supplied collection is incomplete, either outbox is pending, a saved checkpoint depends on the attempt or run, or a retirement marker matches. Malformed or future school years stay on hold. Even an older linked detail with no listed protection is only flagged for review: every detail and total remains preserved, all checkpoints and retirements remain preserved, and `plannedDeletes` is empty.

The snapshot is limited to 5,000,000 UTF-8 JSON bytes, 100 pages, 50 records per page and 500 total record copies across collections. Overflow, duplicate cursors, cycles, detached pages, scope mismatches and immutable conflicts refuse the snapshot; a missing collection or truncated chain is disclosed and protects otherwise reviewable detail. Output excludes teaching packs, raw per-target records and cursors, but still includes scoped identifiers and totals and must remain private.

Fresh local evidence: **1,019/1,019 unit tests**, including all **33 new inventory cases**, pass. Typecheck, lint, standard format, retention/release tooling, build and unchanged performance budgets pass (546,027 initial JavaScript bytes; 42,745 CSS bytes). Production audit reports zero findings; the existing 11-finding Firebase-toolchain exception remains bounded to November 4. An initial typecheck rejected `Object.hasOwn` under the existing target; the implementation now uses compatible `hasOwnProperty.call` without changing compiler targets. Logs remain in `family-beta-artifacts/e2-retention-preview/e2-inventory-{unit,build}.log`.

No application UI, provider adapter, stored schema or database rule changed. Browser, emulator, provider acceptance and owner smoke testing are not new gates for this offline library. Mixed acquisition/mastery/activity records and other histories still need separate inventory designs; this slice does not establish deletion compatibility with older or disconnected clients.

### Inventory design constraints

E2.2 remains an offline inventory/protection step, using synthetic or explicitly supplied snapshots. It must not call the existing synchronization methods as a shortcut: [game history reconciliation](../src/ninjaSkills/gameHistory.ts) saves received completions to device storage, and [practice synchronization](../src/familyBeta/deviceSync.ts) can write both local and remote state. A read-only inventory needs a separate read-only boundary.

The initial game-detail inventory should validate each completion with the existing [completion validator](../src/ninjaSkills/progress.ts), then compare its embedded immutable result with the exact separately supplied total. It must keep distinct attempts separate, reject scope/conflict problems, expose incomplete pages, and avoid claiming supplied data proves current cloud coverage or family ownership. Older unlinked detail stays on hold.

Additional protections follow directly from current readers:

- [Game session recovery](../src/ninjaSkills/gameSession.ts) uses the matching completion to recover an interrupted final-checkpoint write. A saved checkpoint can therefore depend on detail even after the score completed; age alone is insufficient.
- [Game storage](../src/ninjaSkills/progressStore.ts) retains independently queued detail and confirmed completions. Inventory both copies and preserve pending writes; do not interpret a missing summary in a partial snapshot as absence from the backend.
- [Acquisition storage](../src/familyBeta/acquisitionStore.ts) retains reviewed trials across partial score sessions. Its completed lesson archive is created only after teaching completion and a changed lesson. Do not treat a score's completion date or an archive-like key as proof that the whole payload can be removed.
- [Game target selection](../src/familyBeta/PreviewLearningHub.tsx) consumes completed totals separately. Preserve those totals and their identities while assessing detail; no graph or coverage reset is part of retention work.

Required synthetic cases include matching and conflicting summary/detail copies, two distinct same-time attempts, missing summaries, current/previous/unknown years, incomplete/repeated pages, cross-child/family scope, pending detail, checkpoint-dependent completions, and bounded overflow without partial output. E2.2 must still emit no executable delete plan. Security proposals remain a separate E2 slice.

## Security assessment to complete

The [source and public-response assessment](./e2-security-assessment.md) is complete: live `b4c838d` confirms absent CSP/frame-protection headers and the conflicting asset cache directives. Fresh 30 focused tests and 11 family-policy emulator cases pass. Active Firebase rules and App Check enforcement remain unverified. The following boundaries inform the scoped proposals, not approved policy changes:

1. **Canonical hosting headers.** [Canonical packaging](../scripts/package-family-sync.ts) emits no-store, nosniff, referrer and microphone permissions headers. The CSP and frame-denial settings in [Firebase hosting configuration](../firebase.json) are not copied by that canonical packager. A proposal must account for same-origin grade frames, inline bootstrap scripts, temporary audio and existing sign-in before any enforcement change.
2. **Caching.** The canonical header template applies both a catch-all no-store directive and an asset immutable directive. Establish the intended effective policy and exact served headers in a bounded review; do not assume the asset directive alone wins.
3. **App Check.** [Runtime configuration](../src/firebaseSdkRuntime.ts) requires a key in staging but allows an absent key outside staging. That is not evidence of current production enforcement. Verify deployment configuration and provider metadata before proposing enforcement, while preserving offline and older-client behavior.
4. **Database policy.** Compare the reviewed production-intended rules with the active ruleset in a separately scoped read-only assessment. Preserve family isolation and immutable results. Prepare emulator regressions and recovery before requesting any policy change.

No authentication, database rule, hosting security header, App Check enforcement or retention deletion has been changed in E2. Production changes remain separately gated.

## Verification and next handoff

October 13 local validation:

- **986/986 unit tests**, including **17 new retention/CLI cases**, pass. A focused score/reconciliation/retention run passes **47/47**.
- Typecheck, lint, standard format, targeted `check:retention-tools`, existing release-tool checks and production build pass.
- Performance budgets pass: **546,027 / 550,000 initial JavaScript bytes** and **42,745 / 60,000 initial CSS bytes**. The existing lazy game-chunk warning remains.
- Production dependency audit has zero findings. The tooling check passes its existing bounded exception: 11 Firebase-toolchain findings, expiry November 4, 2026; these are not zero vulnerabilities.
- An initial typecheck attempt placed the CLI in the node-tool composite project and failed its explicit file-list boundary. The CLI is now checked in the existing backend/domain project with its dependencies; typecheck and build subsequently pass.
- Tests use only synthetic records. The CLI test demonstrates unchanged input bytes, no output file creation and no credential requirement. Unit/build logs are retained locally in `family-beta-artifacts/e2-retention-preview/`.

Browser, real-backend and new emulator runs are not acceptance evidence for this slice: no UI, provider adapter, stored schema or rules changed, and the retention helper is not imported by application runtime. No package was published and no owner smoke test is requested.

**Independent review passed:** The owner-authorized **GPT-6 Astra · Extra High** reviewer independently passed 47 focused cases and additional synthetic boundary probes, with no blocking findings or actionable introduced defects. Exact source hashes and acceptance limits are in the [review record](./e2-retention-independent-review.md).

**Next: exact committed candidate/recovery compatibility with actual provider-applied headers — GPT-6 Astra · Extra High**, already confirmed for E2. Local header/cache implementation, metadata inspection and independent security review are complete, and the owner approved the local E2 commit. The [review and remaining gates](./e2-security-assessment.md#independent-local-security-review) exclude deployment, account operations, real family records, provider setting changes and deletion. Push, merge, publication and production deletion/security operations remain unperformed. No new smoke test is requested.
