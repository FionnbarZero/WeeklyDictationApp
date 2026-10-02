# Weekly Dictation status

Last verified: 2026-10-02; Program B1 staging foundation complete; controlled family beta safety is the current planning priority

This is the authoritative capability matrix for what exists today. A visible UI is not evidence that a capability is durable or eligible for production. Product direction and sequencing live in [ROADMAP.md](./ROADMAP.md); durable architecture decisions live in [docs/decisions](./docs/decisions/README.md).

## Current operating posture

The product owner reports that one child currently uses each of the Kindergarten, Grade 2, and Grade 5 applications. This is treated as a closed, adult-supervised family beta rather than a public production launch. The immediate priority is Program C0: preserve one known-good release per grade and add safe preview, backup, promotion, bug-response, and rollback controls before resuming B2 migration rehearsal or broadening activation.

The synthetic staging project remains separate from the family beta. Real child data, email addresses, recordings, authentication state, and copied family documents are still prohibited in synthetic staging. See [Controlled family beta operations](./docs/family-beta-operations.md).

## Repository health

| Gate | Current result | Notes |
| --- | --- | --- |
| Unit tests | 508 passing | Node test runner, including workspace synchronization, practice-coordinator characterization, and staging completion safeguards |
| Production build | Passing | TypeScript/Vite build plus deterministic performance-budget check |
| Initial asset budgets | Passing | Staging: 547,261/550,000 JavaScript bytes and 37,076/60,000 CSS bytes |
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

| Grade / capability | Availability | Results | Recording | Family beta posture | Production eligibility | Principal blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Grade 2 Tier 1 writing | `main-app` | `durable` | N/A | Used in closed beta; known-good release and child-scoped backup/restore controls must be documented | `blocked` | C0 safeguards, migration rehearsal, full rollback drill, operations acceptance, and authorized cross-device pilot |
| Grade 2 Tier 2 reading | `main-app` | `session-only` | `prompt-local` | Experimental only; must not imply retained progress | `blocked` | Approved behavior contract, versioned Tier 2 persistence, and reference-audio/privacy gates |
| Kindergarten Tier 1 writing | `development` | `session-only` | N/A | Used in closed beta; stable release and explicit session-only status required | `blocked` | C0 safeguards, trusted importer deployment, source activation review, staging recovery, and release relationship with Tier 2 |
| Kindergarten Tier 2 reading | `development` | `session-only` | `prompt-local` | Experimental only; no retained result or audio | `blocked` | Explicit writing-only/session-only/durable decision plus Tier 2 persistence if durable results are promised |
| Grade 5 Tier 1 writing | `development` | `session-only` | N/A | Used in closed beta; stable release and unresolved-policy notice required | `blocked` | C0 safeguards, approved behavior contract, importer activation, Warmup policy, and durable two-review-cycle persistence |
| Grade 5 Tier 2 reading | `development` | `session-only` | `prompt-local` | Experimental only; no retained result or audio | `blocked` | Grade 5 gates plus separate Tier 2 persistence/privacy approval |
| Trusted curriculum importer | `development` | N/A | N/A | Not part of the current child beta delivery path | `blocked` | Shadow comparison, idempotency evidence, IAM, importer monitoring, and rollback |

## Frozen contracts during Program A

Unless a separately reviewed behavior change explicitly authorizes a difference, cleanup must preserve:

- stored schemas and migration compatibility;
- progression, visit, session, attempt, result, score, and receipt identities;
- journal-before-state and atomic cloud write semantics;
- revision checks, exact retries, and idempotent recovery;
- grade-owned lifecycle and practice policies;
- child-facing behavior represented by the frozen prototype routes and tests.

## Program A closeout

Program A is complete and merged through pull request 39 at `10d44ccd7c006d02c73e7accb11fb29bff54caf6`. The remote quality, build, browser, frozen-prototype, public-preview, and Firestore Emulator jobs passed before merge.

- Workspace reads, assembly, open-session reconciliation, and pending-transition recovery are explicit application operations. Synchronization is ordered, abortable, and covered for stale results, retry, acknowledgement failure, and idempotence.
- Practice start, answer, exit, experience-specific skip/discard, interstitial advancement, and completion are behind capability-based application operations. React does not import raw Firestore or recovery-journal operations.
- Initial cloud hydration performs 15 fixed operations. Dataset words and child attempts each use one bounded collection-group query, so there are no per-dataset word or per-history-session attempt fetches.
- Firestore query durations are exposed as browser Performance entries prefixed `weekly-dictation:firestore-query:`. Latency remains a recorded diagnostic rather than a hard CI gate.
- Practice, Tier 2 reading, and Progress/History are lazy chunks. The build gate also rejects prototype/development modules in the initial dependency graph.
- Active practice and reading are represented by one discriminated state, preventing invalid simultaneous experiences.
- Tier 2 capabilities use centrally validated constrained values. Kindergarten remains fail-closed and writing-only in the integrated application unless a separate Tier 2 release change is approved.

## Known active risks

- The three child-facing beta deployments, exact build identities, persistence notices, and rollback targets are not yet recorded in one verified release inventory.
- Grade 2 durable state needs a rehearsed child-scoped export, checksum, preview restore, and lossless restore before persistence-affecting beta updates.
- Kindergarten and Grade 5 are session-only development experiences; beta availability must not be presented as saved progress or production eligibility.
- Current activity tests largely characterize the implemented activity models rather than independently proving that every child-facing activity is product-correct. Activity corrections remain grade-specific behavior changes.
- Program B1 is complete. B2 synthetic migration rehearsal, backup/restore, failure injection, and the full rollback drill wait until C0 beta safety controls pass.
- The authorized cross-device Grade 2 pilot with real profile data remains B3 work and cannot begin until B2 passes.
- The initial JavaScript budget passes with limited headroom. Dependency updates must run the complete build budget before merge.
- The bounded word and attempt queries intentionally load continuation-critical records during synchronization. Their 10,000-word and 5,000-attempt safety limits need production-shaped validation before pilot or production acceptance.
- Browser latency is environment-sensitive and remains telemetry rather than a hard gate.
- Kindergarten and Grade 5 source activation, durable Tier 2 results, and Grade 5 multi-review persistence remain separate Program C decisions and implementations.

## Program B1 staging foundation

Program B1 is complete on `ops/staging-foundation`. The isolated `weekly-dictation-staging` Firebase project has its own web app, Hosting site, native Firestore database in `nam5`, Email/Password Authentication, reCAPTCHA Enterprise App Check registration, deletion protection, synthetic-only build gates, and guarded deploy command. It remains on the no-billing plan; App Check enforcement remains disabled for monitoring.

Commit `29e0f972f7ec` is live at `https://weekly-dictation-staging.web.app`. A synthetic Grade 2 lifecycle verified exact Acquisition resume, atomic scored completion, immediate reload, and second-browser visibility. All 104 observed protected requests carried App Check, and the run produced no page errors, failed responses, or unexpected console errors. Temporary accounts and family data were deleted afterward; the Auth inventory is empty. Detailed release, rollback, retention, and test evidence is in [docs/staging-foundation.md](./docs/staging-foundation.md).

## Documentation authority

1. [STATUS.md](./STATUS.md) states current capability.
2. [ROADMAP.md](./ROADMAP.md) states approved execution order and exit gates.
3. [docs/decisions](./docs/decisions/README.md) records durable decisions and their consequences.
4. [docs/prototype-baseline.md](./docs/prototype-baseline.md) records the immutable and living prototype references.
5. [docs/family-beta-operations.md](./docs/family-beta-operations.md) defines the closed beta release, backup, bug-response, and rollback procedure.
6. [PROJECT_PLAN.md](./PROJECT_PLAN.md) is a preserved historical archive and is not an active status source.
