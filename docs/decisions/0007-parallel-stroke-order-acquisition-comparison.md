# ADR 0007: Run Stroke Order as a parallel Acquisition comparison

Status: Accepted — 2026-10-04

## Context

The Phase 1 Stroke Order activity is a shared, session-only learning game with grade-owned adapters. Its standalone watch-copy-memory sequence does not run the existing writing Acquisition engine. The product owner wants to evaluate whether Stroke Order should eventually replace the current writing Acquisition experience. A meaningful comparison requires both interfaces to receive the same cohort and execute the same grade-owned rules without allowing one interface to advance the other.

## Decision

The Dojo presents three separate Acquisition applications for the same active cohort: Writing, Stroke Order, and Reading. The learner chooses which application to open and in which order to complete them; the product does not assign or alternate that order.

Children may choose any application or complete more than one. Every launch starts a new Adaptive Warmup visit; launching another application does not reuse the earlier application's Warmup visit. The longitudinal Warmup mastery state remains shared as described below.

Stroke Order uses the exact Acquisition strategy owned by the selected grade, including Introduction, Expanded Trials, Correction, Familiar-DT trials, earned-DT behavior, ongoing DT practice, grade-owned timers, audio cadence, repetition, timer-start rules, and the configured pre-activity Adaptive Warmup policy. Introduction and Correction expose the model; timed Expanded Trials preserve the existing hidden-target behavior. Correctness remains child self-assessment during the comparison.

The experimental interface retains the Phase 1 child controls: Review now, Skip timer, replay, undo, and clear. A multi-character target is taught and assessed as one word on one term-level pad; visible stroke numbering restarts for each character.

The three applications have separate versioned Acquisition progression identities, scores, and reports. An explicit `experienceId` distinguishes `writing`, `stroke-order`, and `reading` without splitting their shared curricular scope. Completing or advancing one application never advances either of the others. Existing Acquisition records without an experience identity are interpreted as Writing records, preserving current progress without a destructive bulk migration. Adaptive Warmup mastery state remains shared because it represents longitudinal word knowledge rather than interface-specific Acquisition progress. The existing Writing Acquisition remains the official writing result; Stroke Order uses the same score calculation but is labeled experimental and is not merged into the official Writing Acquisition score or progression. Reading results likewise remain separate. The child sees an application-specific completion result, and the adult can inspect each result in History.

Writing, Stroke Order, and Reading checkpoint after completed Acquisition transitions and resume automatically from the latest completed checkpoint on any authenticated device. Browser-local persistence is an offline fallback. Stroke Order discards any unfinished drawing and restarts the same prompt with a blank pad. Reading discards any unfinished recording and restarts the same prompt without retained audio. An unfinished older cohort remains resumable after a later cohort becomes active. Durable records include source and target-set identity, experience and schema versions, prompt state, self-assessment, retries, active time, exit/resume evidence, revision, and completion timestamps. Raw handwriting coordinates, images, and reading recordings are never persisted. Existing Phase 1 Stroke Order and session-only Reading visits are not migrated.

The Enter the Dojo screen provides a Reenter control with every historical cohort as a dated choice. Each activity is labeled Continue when it has unfinished progress, Practice again when a visit is complete, Start when it has not been attempted, or Unavailable when its curriculum or stroke assets are incomplete. Practice again creates an independent visit and does not reopen or change the lifecycle state of the completed visit.

The current standalone three-step Stroke Order prototype remains available only as a development reference and rollback aid. Its reusable canvas, reference display, and validation primitives move into separate component files; the Dojo card launches the new Acquisition-driven variant rather than the prototype controller.

Weekly source activation and Stroke Order eligibility are separate gates. When canonical stroke geometry is unavailable, the dated Stroke Order action is shown as unavailable with a reason; canonical import and the other Acquisition applications continue independently. A static-character fallback remains a possible later enhancement, not current release behavior.

Stroke Order is intended for every supported grade: Kindergarten, Grade 2, and Grade 5. Each grade retains its own registered Acquisition strategy, source activation, and deployment lifecycle; adding the common activity does not substitute one grade's rules or fixtures for another's. Grade 5 production activation is explicitly deferred while its prototype word set and stroke assets are prepared.

The Progress screen exposes three separate graphs for Writing, Stroke Order, and Reading. It does not combine their scores into one series. The existing shared Adaptive Warmup graph remains separate from all three application graphs.

The first release-acceptance device matrix covers iPad touch input and trackpad input. The comparison retains completion, accuracy, retry count, active time, exits/resumes, child preference, and interface-order evidence rather than selecting a single success metric in advance. Active time counts while the activity is visible and the learner is expected to watch, listen, draw, or self-assess; it pauses when the tab is hidden or the device locks, excludes network-save delays, and starts countdowns only after required audio or model demonstrations finish. Both elapsed time and active visible time are retained.

## Consequences

- The comparison changes the Stroke Order controller from a standalone game loop into a presentation adapter over the existing grade-owned Acquisition engine.
- Acquisition persistence identities, cloud paths, rules, backup/restore validation, and history projections must distinguish the three experience identities while retaining a shared curriculum and Warmup scope.
- Shared Warmup evidence can affect later visits in either interface, but interface-specific Acquisition progress and scores cannot cross-contaminate.
- Reports can compare completion, first-try accuracy, retries, active time, and exits/resumes without retaining child handwriting traces or reading recordings. The learner controls application order, so order is observed rather than assigned.
- Asset coverage is a pre-launch capability check, not a reason to reject an otherwise valid weekly curriculum import.
- Tests for transitions, crash recovery, idempotency, multi-device conflict, cohort rollover, security rules, accessibility, and hosted browser behavior are phase exit gates rather than deferred cleanup.
- No stable production activation follows automatically from implementing or deploying the experiment.
