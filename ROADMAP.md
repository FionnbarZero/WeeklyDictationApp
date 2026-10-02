# Weekly Dictation roadmap

This roadmap separates three programs with independent finish lines:

- **Program A — codebase cleanup and refactoring**
- **Program B — production and deployment readiness**
- **Program C — product expansion and activation**

Program A must not stay open because a curriculum or release decision in Program C is unresolved. The frozen references protect approved behavior while the integrated application is assembled one vertical slice at a time.

As of 2026-10-01, Program A is complete locally on `refactor/application-orchestration-boundary`; remote CI confirmation is the remaining merge gate. Programs B and C have not been activated by that work.

## Operating model

```text
frozen tag + archived build ───────────────┐
                                           ├─ parity checks ─► Program A cleanup
living prototype routes + fixtures + tests┘                       │
                                                                 ▼
                                                     integrated application shell
                                                                 │
                                       ┌─────────────────────────┴─────────────────────────┐
                                       ▼                                                   ▼
                             Program B staging                                  Program C rollout lanes
```

No architecture refactor may alter a frozen contract as an incidental effect. No source gate, persistence schema, or product capability is activated by cleanup.

## Program A — cleanup and refactoring

Program A is complete when `App.tsx` is UI composition rather than persistence orchestration, React does not directly depend on Firestore or recovery journals, initial hydration is bounded, deterministic performance budgets pass, all gates pass from a fresh checkout, and active documentation reflects the result.

| Stage | Status | Scope | Exit gate |
| --- | --- | --- | --- |
| A0. Finish and freeze | Complete | Record untouched browser/Emulator baseline; merge Grade 5 work; fix only the confirmed Sky Writing exit crash; inventory routes/fixtures/limitations; add smoke, exit, and selected visual references; tag and package exact build | Every valued prototype has a stable route, fixture, regression test, immutable tag, and checksum-verified archive |
| A1. Engineering guardrails | Complete | Exact dependency policy; Node/npm contract; typecheck, lint, and format checks; separate CI jobs; render failure boundary; modal focus/Escape/restoration; global browser console/page-error rejection | Fresh checkout can run every automated gate; structural changes cannot silently create browser errors or change prototype references |
| A2. Documentation clarification | Complete | Authoritative status matrix, roadmap, documentation index, ADRs; classify the historical plan as archived; correct Tier 2 and Kindergarten drift | Active documents have no contradictory capability or release claims |
| A3. Read-side extraction | Complete | Characterize current orchestration; add explicit `readChildWorkspace`, `assembleChildWorkspace`, `recoverPendingTransitions`, `reconcileOpenSessions`, and `synchronizeChildWorkspace`; inject capability ports; define order, failure, cancellation, and idempotency | `App.tsx` performs no raw collection loading or migration; stale child/auth results cannot replace the active workspace |
| A4. Write-side extraction | Complete | Move start, answer, exit, experience-specific skip/discard, and completion workflows one vertical slice at a time; retain journal-before-state and receipt semantics; make active-experience state coherent; make Tier 2 audio ownership safe | `App.tsx` imports neither Firestore operations nor recovery-journal functions; local/cloud behavioral parity passes |
| A5. Performance and containment | Complete | Classify continuation-critical, summary, and detail records; add scoped reads, bounded hydration, lazy history/detail loading, request timing, and route/activity splitting | No per-history-session initial fetch; fixed-fixture request/record budgets, main-entry size, and development-module-exclusion gates pass |

### A3 characterization matrix

Tests must exist before extraction for:

- child switching during an outstanding load;
- authentication changes during hydration;
- interrupted Acquisition and Warmup recovery;
- partially completed versus abandoned sessions;
- failed journal acknowledgement;
- failed cloud commits followed by retry;
- duplicate recovery execution;
- local and cloud start, exit, and completion;
- failure-boundary recovery without deletion of pending journals.

`synchronizeChildWorkspace()` composes the smaller operations. Reads do not mutate. The extraction preserves and tests the existing order: read, reconcile open sessions, assemble, recover pending transitions, then publish state. An `AbortSignal` crosses the boundary so stale reads cannot update the UI, while cancellation does not undo legitimate writes already initiated for the previous child. Repeated synchronization is idempotent.

Tier 2 lifecycle projection changes are controlled behavior changes, not mechanical extraction. Old and proposed projections must be compared across every Grade 2, Kindergarten, and Grade 5 fixture before switching.

### A4 required versus optional scope

Required: extracted application workflows, no infrastructure in `App.tsx`, coherent active-experience state, safe Tier 2 audio ownership, and demonstrated parity.

Optional follow-ups do not block Program A: renaming the Sky Writing component family, replacing bespoke Kindergarten games, or general game-component consolidation. Use experience-specific operations such as `skipWarmup()` and `discardTestReview()` where their semantics differ.

### Architecture-test policy

Preserve forbidden-import and approved-consumer checks. Keep exact file inventories only for genuinely closed safety boundaries; use dependency-direction and public-contract tests elsewhere so harmless moves do not create artificial churn.

## Program B — production and deployment readiness

Program B begins with synthetic, production-shaped data. Real child data requires explicit authorization, minimal identifying information, access controls, and a documented deletion date/procedure.

| Stage | Scope | Exit gate |
| --- | --- | --- |
| B1. Staging foundation (in progress) | Separate Firebase projects/environments; deploy rules and application; budgets, retention, App Check monitoring, and observability | Staging has no production credentials or data and emits actionable operational signals |
| B2. Migration rehearsal | Synthetic backup/restore and migration; rollback drill; failure injection; support runbook | Migration and rollback are repeatable, checksum-verifiable, and lossless |
| B3. Grade 2 pilot | Migrate one authorized Grade 2 profile; exercise local/cloud retry and a second device | Cross-device Grade 2 resume works without loss, duplication, or identity drift |
| B4. Operations acceptance | Restore test, incident response, retention/deletion, performance trend review, and release checklist | Named owner accepts the production runbook and fail-closed gates |

## Program C — product rollout lanes

These are dependencies, not one universal sequence:

```text
trusted importer deployment ──► Kindergarten source activation
                            └──► Grade 5 source activation

durable Grade 2 Tier 2 ─────────► independent of multi-grade importer

Kindergarten activation ────────► importer + Kindergarten/Tier 2 decision
Grade 5 activation ─────────────► importer + Warmup policy + multi-review persistence
```

Each lane has its own privacy, source, migration, behavior, and operational gates. A writing-only Kindergarten release may proceed without durable Tier 2 only if Tier 2 is hidden. If Tier 2 remains visible, it must either be explicitly session-only/non-progress or move to durable metadata persistence first.

Recommended integration order remains Grade 2 Tier 1 writing, Kindergarten, durable Tier 2 assessment, Grade 5, then optional games/rewards. This is a scheduling preference, not a claim that independent lanes technically block one another.

## Working rules

- One architectural concern per PR.
- Refactors and behavior changes use separate commits or branches.
- Prototype tests remain green throughout cleanup.
- Shared component contracts are characterized before change.
- No persistence schema change ships without migration and rollback tests.
- Production integration uses contracts and adapters rather than copying whole prototype applications.
- A prototype may remain imperfect; known defects are documented instead of silently reinterpreted.
- Direct runtime and build-tool versions are exact. CI uses `npm ci` on Node 24/npm 11. Upgrades occur in separate, fully verified PRs on a documented cadence.
- Hard performance gates use deterministic fixtures. Browser latency is recorded as a trend until CI is stable enough to make it nonflaky.

## Immediate execution order

1. Merge Program A only after the remote quality, build, browser, frozen-prototype, public-preview, and Emulator gates pass.
2. Create isolated staging Firebase resources and operational ownership for B1; use synthetic production-shaped data only.
3. Rehearse backup, migration, restore, and rollback before requesting authorization for any real child data.
4. Run the authorized Grade 2 cross-device pilot after B1 and B2 pass.
5. Deploy the trusted importer through shadow, idempotency, IAM, monitoring, and rollback gates.
6. Keep Kindergarten writing-only unless a separately reviewed Tier 2 release decision changes ADR 0005.
7. Implement durable Grade 2 Tier 2 independently where useful.
8. Activate Grade 5 last, after importer and multi-review persistence gates pass.
