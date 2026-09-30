# Persistent Warmup modular architecture

This branch activates the approved Adaptive Warmup behavior without making React, Firestore, or the legacy domain facade responsible for the teaching model.

## Dependency direction

```text
src/warmup/adaptive       Pure mastery identity, eligibility, scheduling, and transitions
          ↓
src/warmup/visits         Pure durable visit and assessed-response state machine
          ↓
src/application/warmup    Curriculum activation, application-state reduction, recovery, and hydration
          ↓
src/persistence/warmup    Browser journal and cloud DTO/commit construction
          ↓
src/firestoreClient.ts    Thin authenticated transport adapter
          ↓
src/App.tsx               React navigation and user feedback only
```

Dependencies never point upward. The pure Warmup modules cannot import React, browser storage, Firestore, the application coordinator, or the domain compatibility facade.

## Module ownership

### Pure model

- `warmup/adaptive`: long-term mastery terms, evidence, scheduling buckets, lifecycle suppression, and migration.
- `warmup/visits`: materialized visit contracts, deterministic IDs, transitions, validation, and derived reporting.

### Application boundary

- `application/warmup/activation.ts`: adapts canonical datasets and lifecycle assignments into the mastery model and creates or resumes visits.
- `application/warmup/state.ts`: applies one validated transition to `AppState` atomically.
- `application/warmup/recovery.ts`: replays journaled transitions from their exact base revisions.
- `application/warmup/hydration.ts`: validates and quarantines cloud records independently.
- `application/warmup/selectors.ts`: resolves canonical prompt words and history views without mutating state.
- `application/warmup/index.ts`: the small public application facade used by React.

### Persistence boundary

- `persistence/warmup/pendingJournal.ts`: browser crash-recovery journal.
- `persistence/warmup/cloudContracts.ts`: storage DTOs that are distinct from domain objects.
- `persistence/warmup/cloudCodec.ts`: lossless conversion between one domain visit and its cloud visit plus queue-entry records.
- `persistence/warmup/cloudWrites.ts`: pure atomic-write construction and receipt matching.
- `firestoreClient.ts`: authenticated reads and commits only; it does not decide Warmup behavior.

## Cloud queue design

The domain visit keeps one ordered queue because that is the clearest state-machine representation. Cloud storage separates it into:

- One `warmupVisits` record containing visit metadata, score summary, revision, status, and the immutable ordered `queueEntryIds`.
- One `warmupQueueEntries` record per materialized entry containing its immutable prompt/provenance plus its mutable `pending`, `answered`, or `unavailable` status.

One assessed response atomically updates:

1. The visit revision and next position.
2. Exactly one queue-entry status.
3. The child mastery revision.
4. One immutable transition receipt.
5. One immutable attempt.
6. The visit graph point.

This makes Firestore rules validate a single queue entry instead of iterating over an embedded sixteen-item array. It also lets later grade profiles use different queue sizes without expanding security-rule expressions.

## Compatibility and rollout

- The outer `AppState` remains version 2 during the monitored migration window.
- The current browser representation and child-facing behavior remain unchanged.
- Existing uncommitted embedded-queue cloud records are development data only; this branch has not shipped them and therefore needs no production migration.
- Legacy Warmup readers remain until the separately gated facade-cleanup phase.
- No Grade 5 or Kindergarten source is activated by this redesign.

## Acceptance gates

- The existing pure Adaptive Warmup and visit golden tests remain unchanged.
- Exact local and cloud resume behavior remains unchanged.
- Cloud codecs round-trip visits without changing queue order, prompts, status, IDs, or score summaries.
- Rules reject malformed queue-entry IDs/statuses, queue reordering, stale revisions, detached attempts, and cross-family access.
- `App.tsx` does not import pure Adaptive Warmup internals or construct persistence writes.
- `firestoreClient.ts` does not construct domain transitions or queue state.
- Full unit, production build, rendered-browser, and Firestore Emulator gates pass.
