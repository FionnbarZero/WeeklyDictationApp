# ADR 0003: Explicit application operations and capability ports

Status: Accepted — 2026-10-01

## Context

The current `App.tsx` hydration effect reads collections, replays journals, commits recovered transitions, and reconciles open sessions. A single generic load hook would hide those side effects. Local journals/snapshots and cloud revisions/receipts/atomic plans are not interchangeable CRUD repositories.

## Decision

Extract explicit operations: `readChildWorkspace`, `assembleChildWorkspace`, `recoverPendingTransitions`, `reconcileOpenSessions`, `synchronizeChildWorkspace`, `startPractice`, `recordPracticeAnswer`, `leavePractice`, and `completePractice`. React hooks remain thin adapters.

Persistence boundaries are capability-based around domain operations such as Acquisition checkpoint and Warmup transition commits. `synchronizeChildWorkspace` documents operation order, distinguishes reads from writes, accepts cancellation/generation context, rejects stale UI application, and is idempotent when repeated.

## Consequences

Tests can characterize each side effect and failure independently. Local and cloud implementations may remain structurally different while honoring the same domain outcome. A broad `PracticeRepository` or side-effect-hiding `loadChildWorkspace` abstraction is not introduced.
