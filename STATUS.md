# Weekly Dictation status

Last verified: 2026-10-01

This is the authoritative capability matrix for what exists today. A visible UI is not evidence that a capability is durable or eligible for production. Product direction and sequencing live in [ROADMAP.md](./ROADMAP.md); durable architecture decisions live in [docs/decisions](./docs/decisions/README.md).

## Repository health

| Gate | Current result | Notes |
| --- | --- | --- |
| Unit tests | 503 passing | Node test runner, including workspace synchronization and practice-coordinator characterization |
| Production build | Passing | TypeScript/Vite build plus deterministic performance-budget check |
| Initial asset budgets | Passing | 544,233/550,000 JavaScript bytes and 37,076/60,000 CSS bytes |
| Browser suite | 38 tests | Prototype parity, persistence recovery, keyboard focus, and unexpected console/page-error enforcement |
| Frozen static prototype suite | 23 tests | Includes five selected visual references |
| Public preview suite | 2 tests | Grade 5 and Kindergarten explicit preview entries |
| Firestore Emulator | 8 passing | Includes scoped collection-group reads; expected permission-denied output is produced by rejection tests |
| Frozen reference | `prototype-baseline-2026-10` | Commit `104ca427c743c5e4d00fb9e995c06e1a06874649` |

The baseline results above were established locally. CI is configured as separate quality, build, browser, and Emulator jobs; it is not considered verified until the workflow completes in the remote repository.

## Capability vocabulary

- **Availability:** `none`, `development`, or `main-app`.
- **Results:** `session-only` or `durable`.
- **Recording:** `prompt-local` or `retained`. This applies only where audio recording exists.
- **Production eligibility:** `blocked` or `eligible`. Eligibility is fail-closed and does not itself deploy or activate a source.

Combinations must be validated centrally before the planned capability registry can activate them. For example, `main-app` plus `session-only` must not be presented as durable progress, and `retained` recording cannot become eligible without an approved privacy and deletion policy.

## Current capability matrix

| Grade / capability | Availability | Results | Recording | Production eligibility | Principal blocker |
| --- | --- | --- | --- | --- | --- |
| Grade 2 Tier 1 writing | `main-app` | `durable` | N/A | `blocked` | Separate Firebase environments, migration rehearsal, rollback, observability, and cross-device pilot |
| Grade 2 Tier 2 reading | `main-app` | `session-only` | `prompt-local` | `blocked` | Versioned Tier 2 persistence and approved reference-audio/privacy gates |
| Kindergarten Tier 1 writing | `development` | `session-only` | N/A | `blocked` | Trusted importer deployment, source activation review, staging recovery, and release relationship with Tier 2 |
| Kindergarten Tier 2 reading | `development` | `session-only` | `prompt-local` | `blocked` | Explicit writing-only/session-only/durable decision plus Tier 2 persistence if durable results are promised |
| Grade 5 Tier 1 writing | `development` | `session-only` | N/A | `blocked` | Importer activation, Warmup policy, and durable two-review-cycle persistence |
| Grade 5 Tier 2 reading | `development` | `session-only` | `prompt-local` | `blocked` | Grade 5 gates plus separate Tier 2 persistence/privacy approval |
| Trusted curriculum importer | `development` | N/A | N/A | `blocked` | Staging deployment, shadow comparison, idempotency evidence, IAM, monitoring, and rollback |

## Frozen contracts during Program A

Unless a separately reviewed behavior change explicitly authorizes a difference, cleanup must preserve:

- stored schemas and migration compatibility;
- progression, visit, session, attempt, result, score, and receipt identities;
- journal-before-state and atomic cloud write semantics;
- revision checks, exact retries, and idempotent recovery;
- grade-owned lifecycle and practice policies;
- child-facing behavior represented by the frozen prototype routes and tests.

## Program A closeout

Program A is complete on `refactor/application-orchestration-boundary`, subject to the remote CI workflow confirming the local results above.

- Workspace reads, assembly, open-session reconciliation, and pending-transition recovery are explicit application operations. Synchronization is ordered, abortable, and covered for stale results, retry, acknowledgement failure, and idempotence.
- Practice start, answer, exit, experience-specific skip/discard, interstitial advancement, and completion are behind capability-based application operations. React does not import raw Firestore or recovery-journal operations.
- Initial cloud hydration performs 15 fixed operations. Dataset words and child attempts each use one bounded collection-group query, so there are no per-dataset word or per-history-session attempt fetches.
- Firestore query durations are exposed as browser Performance entries prefixed `weekly-dictation:firestore-query:`. Latency remains a recorded diagnostic rather than a hard CI gate.
- Practice, Tier 2 reading, and Progress/History are lazy chunks. The build gate also rejects prototype/development modules in the initial dependency graph.
- Active practice and reading are represented by one discriminated state, preventing invalid simultaneous experiences.
- Tier 2 capabilities use centrally validated constrained values. Kindergarten remains fail-closed and writing-only in the integrated application unless a separate Tier 2 release change is approved.

## Known active risks

- Production and deployment readiness is still unstarted: Firebase environment separation, synthetic migration rehearsal, backup/restore, rollback, observability, App Check, retention, and a cross-device Grade 2 pilot remain Program B work.
- The initial JavaScript budget passes with limited headroom. Dependency updates must run the complete build budget before merge.
- The bounded word and attempt queries intentionally load continuation-critical records during synchronization. Their 10,000-word and 5,000-attempt safety limits need production-shaped validation before staging acceptance.
- Browser latency is environment-sensitive and remains telemetry rather than a hard gate.
- Kindergarten and Grade 5 source activation, durable Tier 2 results, and Grade 5 multi-review persistence remain separate Program C decisions and implementations.

## Documentation authority

1. [STATUS.md](./STATUS.md) states current capability.
2. [ROADMAP.md](./ROADMAP.md) states approved execution order and exit gates.
3. [docs/decisions](./docs/decisions/README.md) records durable decisions and their consequences.
4. [docs/prototype-baseline.md](./docs/prototype-baseline.md) records the immutable and living prototype references.
5. [PROJECT_PLAN.md](./PROJECT_PLAN.md) is a preserved historical archive and is not an active status source.
