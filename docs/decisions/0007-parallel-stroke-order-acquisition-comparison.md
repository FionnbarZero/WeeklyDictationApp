# ADR 0007: Run Stroke Order as a parallel Acquisition comparison

Status: Accepted — 2026-10-04

## Context

The Phase 1 Stroke Order activity is a shared, session-only learning game with grade-owned adapters. Its standalone watch-copy-memory sequence does not run the existing writing Acquisition engine. The product owner wants to evaluate whether Stroke Order should eventually replace the current writing Acquisition experience. A meaningful comparison requires both interfaces to receive the same cohort and execute the same grade-owned rules without allowing one interface to advance the other.

## Decision

The Dojo presents the existing Writing Acquisition and an experimental Stroke Order Acquisition side by side for the same cohort.

Stroke Order uses the exact Acquisition strategy owned by the selected grade, including Introduction, Expanded Trials, Correction, Familiar-DT trials, earned-DT behavior, ongoing DT practice, grade-owned timers, audio cadence, repetition, timer-start rules, and the configured pre-activity Adaptive Warmup policy. Introduction and Correction expose the model; timed Expanded Trials preserve the existing hidden-target behavior. Correctness remains child self-assessment during the comparison.

The two interfaces have separate versioned Acquisition progression identities and separate scores and reports. Completing or advancing one interface never advances the other. Adaptive Warmup mastery state remains shared because it represents longitudinal word knowledge rather than interface-specific Acquisition progress. The existing Writing Acquisition remains the official result; Stroke Order uses the same score calculation but is labeled experimental and is not merged into the official Writing Acquisition score or progression.

Stroke Order persistence checkpoints after completed Acquisition transitions. Resume restores the latest completed checkpoint, discards any unfinished drawing, and restarts the same prompt with a blank pad. An unfinished older cohort remains resumable after a later cohort becomes active. Durable records include source and target-set identity, activity and schema versions, prompt state, self-assessment, retries, active time, exit/resume evidence, mode order, revision, and completion timestamps. Raw handwriting coordinates and images are never persisted. Existing Phase 1 visits are not migrated because they were session-only.

The current standalone three-step Stroke Order prototype remains available only as a development reference and rollback aid. The Dojo card launches the Acquisition-driven variant.

Weekly source activation and Stroke Order eligibility are separate gates. Missing stroke geometry disables only Stroke Order for that cohort and identifies the unsupported characters; canonical import and the existing Writing Acquisition continue. Grade 2 is exercised in isolated synthetic staging. Kindergarten is integrated into the authenticated application behind a beta/release flag rather than gaining persistence inside the standalone lab. Initial rollout uses Grade 2 staging and a Kindergarten beta candidate; stable promotion requires a separate explicit approval.

## Consequences

- The comparison changes the Stroke Order controller from a standalone game loop into a presentation adapter over the existing grade-owned Acquisition engine.
- Acquisition persistence identities, cloud paths, rules, backup/restore validation, and history projections must distinguish the two activity modules.
- Shared Warmup evidence can affect later visits in either interface, but interface-specific Acquisition progress and scores cannot cross-contaminate.
- Reports can compare completion, first-try accuracy, retries, active time, exits/resumes, and mode order without retaining child handwriting traces.
- Asset coverage is a pre-launch capability check, not a reason to reject an otherwise valid weekly curriculum import.
- Tests for transitions, crash recovery, idempotency, multi-device conflict, cohort rollover, security rules, accessibility, and hosted browser behavior are phase exit gates rather than deferred cleanup.
- No stable production activation follows automatically from implementing or deploying the experiment.
