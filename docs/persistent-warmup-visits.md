# Persistent Adaptive Warmup visits

The production Grade 2 Tier 1 writing path activates the approved Adaptive Warmup model through a durable visit boundary.

## One reviewed answer

One reviewed answer produces one deterministic transition containing:

- The next visit revision and exact next queue position.
- The next child mastery revision.
- One immutable attempt with its original scheduling bucket.
- One immutable transition receipt.
- The updated visit graph point.

Local state applies those facts together. Cloud state writes them in one Firestore commit. A browser journal retains the exact base visit and mastery revision until local or cloud persistence succeeds. Exact retries are idempotent; reused IDs with different content and stale revisions fail closed.

## Visit behavior

- Queues are materialized once and never reshuffled while in progress.
- Every unanswered entry is revalidated before presentation. A newly active matching curriculum occurrence marks the entry unavailable without scoring it or reordering completed work.
- Closing or refreshing during an unanswered item restarts only that item.
- Explicit exit after at least one answer finalizes one partial visit and graph point.
- Skipping before any answer creates no graph point.
- A short unique queue completes at its assigned size, not at the configured maximum.
- Standalone Warmup remains independently available when primary activities exist.
- Completing a pre-activity Warmup continues into the originally selected activity.
- Continuing early after at least one pre-activity answer finalizes one partial visit and then enters the selected activity.

## Cloud collections

Under each family-owned child:

- `warmupVisits`
- `warmupQueueEntries`
- `warmupMastery`
- `warmupTransitions`
- `warmupAttempts`
- `warmupGraphPoints`
- `warmupRotations`

Rules enforce family ownership, child identity, allowed statuses, monotonic revisions, immutable receipts and attempts, atomic reciprocal references, and cross-family rejection. Malformed hydrated records are quarantined individually so unrelated valid history remains usable.

Monthly Mastery Rotation accuracy is derived from immutable attempts whose original source bucket is `mastery-rotation`. Attempted responses are the denominator; the derived report does not replace visit or attempt history.

## Verification

- Pure transition and activation tests.
- Application hydration, recovery-journal, and cloud-write construction tests.
- Full unit/integration suite.
- Production build.
- Firestore Emulator tests for owned atomic writes and rejected duplicate, stale, malformed, and cross-family operations.
- Playwright reload test proving exact next-position resume and one retained graph point.

Legacy readers remain during the monitored migration window. `refactor/warmup-facade-cleanup` is blocked until real-data backup, restore, migration telemetry, rollback, and old-client retirement gates pass.
