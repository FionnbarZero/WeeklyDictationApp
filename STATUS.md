# Weekly Dictation status

Last verified: 2026-10-03; Program B1 is complete; C0 controlled-family-beta safety is partially operational

This is the authoritative capability matrix for what exists today. A visible UI is not evidence that a capability is durable or eligible for production. Product direction and sequencing live in [ROADMAP.md](./ROADMAP.md); durable architecture decisions live in [docs/decisions](./docs/decisions/README.md).

## Current operating posture

The product owner reports that one child currently uses each of the Kindergarten, Grade 2, and Grade 5 applications. This is treated as a closed, adult-supervised family beta rather than a public production launch. Kindergarten and Grade 5 now have independent Firebase Hosting destinations with visible release identity. Grade 2 remains on its existing GitHub Pages origin so browser-local progress is not stranded. The immediate priority is to complete the remaining C0 operational evidence: retained rollback targets, Grade 2 backup/restore rehearsal, adult activity acceptance, and recorded observation.

The synthetic staging project remains separate from the family beta. Real child data, email addresses, recordings, authentication state, and copied family documents are still prohibited in synthetic staging. See [Controlled family beta operations](./docs/family-beta-operations.md).

## Repository health

| Gate | Current result | Notes |
| --- | --- | --- |
| Unit tests | 536 passing | Node test runner, including selected-child restore, crash recovery, workspace synchronization, practice coordination, and staging safeguards |
| Production build | Passing | TypeScript/Vite build plus deterministic performance-budget check |
| Initial asset budgets | Passing | Production: 549,530/550,000 JavaScript bytes and 41,725/60,000 CSS bytes; only 470 JavaScript bytes remain |
| Browser suite | 44 passing | Includes selected-profile backup/restore, prototype parity, persistence recovery, keyboard focus, and unexpected console/page-error enforcement |
| Frozen static prototype suite | 23 tests | Includes five selected visual references |
| Public preview suite | 3 passing | Grade 5 Acquisition and both reentry pathways in the built preview artifact |
| Firestore Emulator | 8 passing | Includes scoped collection-group reads; expected permission-denied output is produced by rejection tests |
| Frozen reference | `prototype-baseline-2026-10` | Commit `104ca427c743c5e4d00fb9e995c06e1a06874649` |

The results above passed locally on merged source revision `69777c703bb16c8af6d8a70857f002693019bd18`. The quality, build, browser, and Emulator jobs also passed for pull request 44 and post-merge `main` revision `73f664626602ba83b880d75a9d598d74bcf97136`. `main` now requires a pull request, a current branch, all four checks, resolved conversations, and administrator compliance; force pushes and deletion are disabled.

## Capability vocabulary

- **Availability:** `none`, `development`, or `main-app`.
- **Results:** `session-only` or `durable`.
- **Recording:** `prompt-local` or `retained`. This applies only where audio recording exists.
- **Production eligibility:** `blocked` or `eligible`. Eligibility is fail-closed and does not itself deploy or activate a source.

Combinations must be validated centrally before the planned capability registry can activate them. For example, `main-app` plus `session-only` must not be presented as durable progress, and `retained` recording cannot become eligible without an approved privacy and deletion policy.

## Current capability matrix

| Grade / capability | Availability | Results | Recording | Family beta posture | Production eligibility | Principal blocker |
| --- | --- | --- | --- | --- | --- | --- |
| Grade 2 Tier 1 writing | `main-app` | `durable` | N/A | Used in closed beta with browser-local persistence; selected-child verified restore is merged but not live or operationally rehearsed | `blocked` | Real-browser backup/restore rehearsal, release promotion, migration rehearsal, full rollback drill, operations acceptance, and authorized cross-device pilot |
| Grade 2 Tier 2 reading | `main-app` | `session-only` | `prompt-local` | Experimental only; must not imply retained progress | `blocked` | Approved behavior contract, versioned Tier 2 persistence, and reference-audio/privacy gates |
| Kindergarten Tier 1 writing | `development` | `session-only` | N/A | Independent stable destination is live with explicit session-only status; activity defects are under adult review | `blocked` | Approved activity contract and bug fixes, retained rollback, trusted importer deployment, source activation review, and release relationship with Tier 2 |
| Kindergarten Tier 2 reading | `development` | `session-only` | `prompt-local` | Experimental only; no retained result or audio | `blocked` | Explicit writing-only/session-only/durable decision plus Tier 2 persistence if durable results are promised |
| Grade 5 Tier 1 writing | `development` | `session-only` | N/A | Independent stable destination is live with explicit experimental and session-only status | `blocked` | Recorded adult activity acceptance, retained rollback, approved behavior contract, importer activation, Warmup policy, and durable two-review-cycle persistence |
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

- Kindergarten and Grade 5 have independent Hosting sites and exact-artifact release tooling. Their initial promotions have no retained `rollback-*` channel yet, and detailed adult acceptance/observation remains unrecorded.
- Kindergarten live source revision `250d348f52792235ce72b7157b26e7cd0ad7f0bb` predates the rewritten-root no-cache fix. Root requests can remain cached for one hour until an approved replacement artifact is promoted.
- Grade 2 progress remains tied to the current browser profile and GitHub Pages origin. A checksum-verified whole-local-state backup, deep scope-aware preview, selected-child transactional apply, automatic pre-restore backup, and startup recovery are merged, but the live artifact does not contain them and no real family-beta restore rehearsal has passed.
- Grade 2's live artifact still lacks visible release and persistence identity. Kindergarten and Grade 5 display those fields consistently.
- Kindergarten and Grade 5 are session-only development experiences; beta availability must not be presented as saved progress or production eligibility.
- Current activity tests largely characterize the implemented activity models rather than independently proving that every child-facing activity is product-correct. Activity corrections remain grade-specific behavior changes.
- Program B1 is complete. B2 synthetic migration rehearsal, backup/restore, failure injection, and the full rollback drill wait until C0 beta safety controls pass.
- The authorized cross-device Grade 2 pilot with real profile data remains B3 work and cannot begin until B2 passes.
- The initial JavaScript budget passes with only 470 bytes of headroom. New initial-path UI or dependency work requires measurable bundle reduction first.
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
6. [docs/family-beta-release-inventory.md](./docs/family-beta-release-inventory.md) records the verified child-facing URLs, deployment artifact, persistence locations, and unresolved release protections without child-identifying data.
7. [PROJECT_PLAN.md](./PROJECT_PLAN.md) is a preserved historical archive and is not an active status source.
