# Weekly Dictation roadmap

This roadmap separates three programs with independent finish lines:

- **Program A — codebase cleanup and refactoring**
- **Program B — production and deployment readiness**
- **Program C — controlled family beta and product rollout**

Program A must not stay open because a curriculum or release decision in Program C is unresolved. The frozen references protect approved behavior while the integrated application is assembled one vertical slice at a time.

As of 2026-10-03, Program A and Program B1 are complete. C0 has independent Kindergarten and Grade 5 sites, visible release identity, exact-artifact delivery tooling, and a merged Grade 2 selected-child restore. C0 remains open for retained rollback targets, real Grade 2 backup/restore rehearsal, adult activity acceptance, observation records, and promotion of the Grade 2 safety release. Program B2 and broader product activation continue to wait for those controls.

## Operating model

```text
frozen tag + archived build ───────────────┐
                                           ├─ parity checks ─► Program A cleanup
living prototype routes + fixtures + tests┘                       │
                                                                 ▼
                                                     integrated application shell
                                                                 │
                           ┌─────────────────────────────────────┴─────────────────────────────────────┐
                           ▼                                                                           ▼
            Program B synthetic staging                                         Program C controlled family beta
                                                                                                  │
                                                                                                  ▼
                                                                                         grade rollout lanes
```

No architecture refactor may alter a frozen contract as an incidental effect. No source gate, persistence schema, or product capability is activated by cleanup.

The controlled family beta is not public production and does not turn the synthetic staging project into a real-data environment. Each child remains on a known-good grade-specific beta release while proposed updates are reproduced with synthetic data, tested at a temporary preview URL, approved by an adult, and promoted with an immediate rollback target.

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

| Stage | Status | Scope | Exit gate |
| --- | --- | --- | --- |
| B1. Staging foundation | Complete | Separate Firebase projects/environments; deploy rules and application; budgets, retention, App Check monitoring, and observability | Isolated synthetic-only staging is live; guarded deploy, App Check traffic, atomic completion, cross-browser visibility, cleanup, and rollback history are verified |
| B2. Migration rehearsal | Waiting for C0 | Synthetic backup/restore and migration; rollback drill; failure injection; support runbook | Migration and rollback are repeatable, checksum-verifiable, and lossless |
| B3. Grade 2 pilot | Blocked by B2 | Migrate one separately authorized Grade 2 profile; exercise local/cloud retry and a second device | Cross-device Grade 2 resume works without loss, duplication, or identity drift |
| B4. Operations acceptance | Blocked by B2–B3 | Restore test, incident response, retention/deletion, performance trend review, and release checklist | Named owner accepts the production runbook and fail-closed gates |

## Program C — controlled family beta and product rollout

Program C begins by protecting the three grade-level applications already used by one child per grade. Current use is a closed family beta, not a public production launch. Kindergarten and Grade 5 remain session-only development experiences; Grade 2 Tier 1 writing has durable state and therefore receives stricter backup, migration, and canary gates.

### C0 controlled family beta safety

| Workstream | Required scope | Exit gate |
| --- | --- | --- |
| Beta inventory | Record each grade's stable URL, build commit, activity surface, persistence promise, child-data location, and known limitations | Every child has one documented known-good release and no beta URL silently tracks an unverified branch |
| Release identity | Display grade, beta status, application version, and Git revision in every app; create one release manifest per promotion | A bug report can identify the exact code, curriculum, schema, and deployment under test without child-identifying data |
| Grade-specific delivery | Maintain stable grade-specific beta destinations and temporary preview deployments; promote the exact reviewed artifact rather than rebuilding it | A change to one grade cannot unintentionally replace another grade's known-good app |
| Data protection | Add a truthfully labelled checksum-verifiable whole-local-state backup and selected-child restore for durable Grade 2 state; keep Kindergarten and Grade 5 explicitly session-only; retain no microphone audio | A pre-release Grade 2 backup can restore the selected profile losslessly without replacing unrelated profiles or current shared curriculum, and session-only apps make no durable-progress promise |
| Safe update workflow | Require synthetic reproduction, regression coverage, complete relevant gates, adult preview approval, one-child canary, observation, and rollback | No update reaches a child directly from an unreviewed development build |
| Bug response | Define privacy-safe intake and critical/high/medium/low response rules; stop and roll back for privacy, identity, loss, duplication, or lifecycle corruption | Every reported defect has an owner, severity, affected build, containment decision, and regression test when reproducible |

The detailed operating procedure is maintained in [`docs/family-beta-operations.md`](./docs/family-beta-operations.md), with a reusable manifest in [`docs/family-beta-release-manifest-template.md`](./docs/family-beta-release-manifest-template.md).

The current deployment inventory is recorded in [`docs/family-beta-release-inventory.md`](./docs/family-beta-release-inventory.md). Kindergarten and Grade 5 now have independently promotable stable destinations; Grade 2 deliberately remains on its browser-storage origin. The inventory exit gate remains open until the exact child bookmarks receive adult confirmation, retained rollback channels exist, and Grade 2 state is backed up and restore-rehearsed.

The Grade 2 safeguard is merged in source: a truthfully labelled whole-local-state SHA-256 backup, selected-child deep zero-write preview and merge, before/after reporting, automatic pre-restore backup, transactional writes across all three local storage keys, startup recovery, and idempotent replay. It is not complete operational protection until a disposable copy of the real family-browser state passes backup, preview, restore, interruption, repeat, and rollback rehearsal and the exact candidate is promoted without changing origin.

### C1 product behavior contracts

The current prototypes and tests are evidence of implementation, not independent proof that every activity is correct. Before changing an activity, record its approved grade, lifecycle stage, vocabulary tier, child-facing label, teaching or assessment behavior, Warmup policy, persistence promise, and availability. Behavior corrections and architectural refactors remain separate changes.

For Kindergarten, the Weekly Focus spreadsheet is the curriculum and lifecycle authority. Unit 1 teaching ends September 27, 2026; the explicit `Week 7 09/28` source tab defines September 28 through October 4 as a cumulative review period ending in the unit assessment. Unit 1 enters Mastery on October 5, after that review week, not immediately after teaching ends. Future unit and review boundaries must be grounded in the same authoritative workbook before they are added to the lifecycle plan.

C1 may proceed one grade at a time without interrupting a child's stable beta release. Its finish line is an adult-approved acceptance matrix and independent tests for every activity being promoted; unresolved activities remain hidden or explicitly experimental rather than appearing as production-ready.

### Product rollout dependencies

These are dependencies, not one universal sequence:

```text
trusted importer deployment ──► Kindergarten source activation
                            └──► Grade 5 source activation

durable Grade 2 Tier 2 ─────────► independent of multi-grade importer

Kindergarten activation ────────► importer + Kindergarten/Tier 2 decision
Grade 5 activation ─────────────► importer + Warmup policy + multi-review persistence
```

Each lane has its own privacy, source, migration, behavior, and operational gates. A writing-only Kindergarten release may proceed without durable Tier 2 only if Tier 2 is hidden. If Tier 2 remains visible, it must either be explicitly session-only/non-progress or move to durable metadata persistence first. Closed beta availability does not waive any production-eligibility gate.

Recommended integration order remains Grade 2 Tier 1 writing, Kindergarten, durable Tier 2 assessment, Grade 5, then optional games/rewards. This is a scheduling preference, not a claim that independent lanes technically block one another.

## Working rules

- One architectural concern per PR.
- Refactors and behavior changes use separate commits or branches.
- Prototype tests remain green throughout cleanup.
- Shared component contracts are characterized before change.
- Each child remains on a documented known-good beta release until the exact replacement artifact is reviewed and promoted.
- A beta update is first reproduced with synthetic data and reviewed at a temporary preview URL; direct deployment from a development branch is prohibited.
- Privacy, family isolation, lost or duplicated durable progress, and lifecycle corruption are immediate stop-and-rollback conditions.
- Bug reports use grade, activity, build identity, device, expected behavior, and observed behavior without full names, recordings, credentials, or response content.
- No persistence schema change ships without migration and rollback tests.
- Production integration uses contracts and adapters rather than copying whole prototype applications.
- A prototype may remain imperfect; known defects are documented instead of silently reinterpreted.
- Direct runtime and build-tool versions are exact. CI uses `npm ci` on Node 24/npm 11. Upgrades occur in separate, fully verified PRs on a documented cadence.
- Hard performance gates use deterministic fixtures. Browser latency is recorded as a trend until CI is stable enough to make it nonflaky.

## Immediate execution order

1. Preserve one retained rollback channel for each independent session-only site and finish the Kindergarten and Grade 5 release records.
2. Rehearse the merged Grade 2 backup and restore against a disposable copy of the real browser state; do not use the only live profile as the first restore target.
3. Promote the exact Grade 2 safety artifact on the existing origin only after backup, preview, rollback, bookmark, and adult-approval evidence is recorded.
4. Complete the Kindergarten defect inventory and grade-specific activity acceptance matrix; keep unapproved behavior experimental or contained.
5. Complete Grade 5 activity acceptance and observation without changing its session-only promise.
6. Close C0 only after every stable destination, manifest, rollback target, and critical/high-severity response rehearsal is recorded.
7. Resume B2 synthetic migration, restore, failure-injection, and full rollback rehearsal after C0 passes.
8. Deploy the trusted importer through shadow, idempotency, IAM, monitoring, and rollback gates.
9. Keep Kindergarten writing-only unless a separately reviewed Tier 2 release decision changes ADR 0005; implement durable Grade 2 Tier 2 independently where useful.
10. Activate Grade 5 for production only after importer, Warmup-policy, and multi-review persistence gates pass.
