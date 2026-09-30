# Pure Adaptive Warmup model

This document originally accompanied the pure, inactive Adaptive Warmup model. The model is now activated for Grade 2 Tier 1 writing through the modular application boundary in `src/application/warmup/` and the visit boundary in `src/warmup/visits/`. The mechanically extracted compatibility engine remains only for migration-era compatibility. The outer application state remains version 2 while the new mastery and visit records use their own explicit versioned contracts.

## Boundary

The pure model lives under `src/warmup/adaptive/`:

- `contracts.ts` keeps immutable curriculum occurrences, mutable lifecycle assignments, mastery evidence, scheduling buckets, rotation state, and queue selections separate.
- `identity.ts` owns `mastery-normalizer-v1`, deterministic path-safe term IDs, identity validation, collision detection, and immutable occurrence provenance.
- `eligibility.ts` owns final-review evidence selection, mastery eligibility, active-occurrence suppression, and exactly-once occurrence integration.
- `lifecycleReconciliation.ts` refreshes lifecycle projections from authoritative assignments after migration without remigrating child mastery state.
- `profileValidation.ts` validates retained profile definitions, the one active profile per grade/module scope, and explicit upgrade paths.
- `profileUpgrade.ts` performs declared profile-version upgrades and cross-grade rebinds before scheduling.
- `migrationReplay.ts` reconstructs child state in curriculum/event order after inventory, evidence, lifecycle, and rotation inputs have been canonicalized.
- `transitions.ts` owns child mastery evidence and bucket transitions after a Warmup assessment.
- `scheduler.ts` owns Grade/profile-driven allocation, shortage filling, duplicate policy, and Mastery Rotation behavior.
- `profiles/grade2.ts` is the only owner of the new Grade 2 allocation, Recent Entry threshold, duplicate and rotation policies, and the current development policy that pre-activity Warmup is optional.
- `migration.ts` provides a pure, reported v2-to-v3 projection for testing. It does not read or write storage.
- `validation.ts` validates the complete projected graph before an already-migrated record is accepted.

The adaptive modules do not import React, the domain façade, lifecycle registries, practice registries, local storage, Firebase, or Firestore. `App.tsx`, `domain.ts`, local hydration, cloud hydration, and Firestore do not import the adaptive modules.

## Identity and eligibility

A mastery identity contains:

```text
normalizer version + activity module + vocabulary tier + language + normalized term
```

`mastery-normalizer-v1` applies Unicode NFC, trims outer whitespace, and collapses internal whitespace. It preserves case and character form. The stored ID is a deterministic path-safe digest; each term also retains the full tuple so a collision or mismatch can be rejected.

Weekly occurrences remain distinct, immutable provenance records. Repeated occurrences with the same identity share one term definition, but no term-level display string is selected from input order; each occurrence retains its own display text. Lifecycle assignments are separate, mutable projections supplied by a trusted caller. Child state never supplies or changes curriculum stage. When an occurrence first integrates, its child record retains the trusted lifecycle profile and final-review-cycle basis that established historical mastery eligibility. Later lifecycle reconciliation can suppress the term without erasing or invalidating that historical integration.

A term is Warmup-eligible when its authorized longitudinal history contains a resolved mastery-stage occurrence and it has no matching active occurrence in the selected child's current grade and school year. Previously earned mastery therefore remains available across school years. A current-scope Acquisition, Test Review, no-instruction, malformed, legacy-active, missing, invalid, conflicting, or otherwise unresolved occurrence fails closed and suppresses the term. An occurrence from another grade or school year does not suppress the current scope, and a term in another module does not suppress it. The application layer remains responsible for supplying only the child's authorized historical curriculum; the pure scheduler does not infer whether an unrelated or future grade belongs to that child.

The final configured Test Review cycle is recognized explicitly, but the occurrence becomes eligible only after lifecycle resolution moves it to mastery. Completed final-review attempts must match the child, occurrence, and final cycle and contain a scored right/wrong outcome. A skipped, unanswered, or abandoned final review supplies no correctness evidence but still initializes that child's term as unassessed Recent Entry. Provisional evidence is ignored. A reused attempt ID with conflicting payloads is excluded at the evidence-selection boundary, so reversing input order cannot select a different result. Latest timestamp and then stable attempt ID break ties within the remaining usable evidence class, while a completed scored result takes precedence over a noncompleted outcome.

## Child state transitions

Initial placement after final review is:

- correct: `demonstrated` + `recent-entry`;
- incorrect: `support-needed` + `needs-attention`;
- no valid evidence: `unassessed` + `recent-entry`.

Final Test Review initializes evidence only. It never increments the consecutive-correct Warmup streak; a newly initialized Recent Entry streak is zero. A valid later Warmup assessment may supply later progress. An already-existing Needs Attention recovery requirement remains intact after a correct or noncompleted repeated final review, but a new incorrect final review resets that recovery streak.

Each occurrence is integrated once. A later incorrect result moves the shared term to Needs Attention and resets its streak. A later correct or missing result normally returns it to Recent Entry, but it cannot erase an existing Needs Attention recovery requirement.

Every child mastery state stores the exact scheduling-profile ID, version, and source occurrence that most recently established its scheduling policy. The registry retains historical definitions while naming exactly one active definition for each grade/module scope. Validation can therefore read older state without pretending its profile is still active. A declared, acyclic upgrade or grade-rebind operation must update state before scheduling; the scheduler refuses a stale profile instead of creating a queue that the transition reducer cannot answer. A materialized selection captures the exact profile ID and version used by its transitions.

Grade 2 promotes Recent Entry after two consecutive correct Warmup assessments. Every grade recovers Needs Attention after three consecutive correct Warmup assessments. Incorrect answers move any term to Needs Attention and reset its streak. The Grade 2 profile makes promotion into Mastery Rotation start with the next rotation cycle.

## Scheduling

The Grade 2 pure profile defines:

- standalone maximum 16: 8 Mastery Rotation, 4 Recent Entry, 4 Needs Attention;
- pre-activity maximum 6: 3 Mastery Rotation, 2 Recent Entry, 1 Needs Attention;
- shortage priority: Needs Attention, Recent Entry, Mastery Rotation;
- ordinary duplicate policy: unique terms;
- rotation policy: exhaust before reuse, advance after exhaustion, and make promoted terms eligible next cycle.

A short pool creates a shorter valid selection. Mastery Rotation exhausts the current cycle before reuse. Correct and incorrect assessments both consume an opportunity, and a newly promoted term waits for the next cycle. The scheduler never begins another cycle merely to fill the current materialized selection.

## Pure migration projection

`migrateAdaptiveWarmupStateV2ToV3` accepts a raw state value and returns a result plus a report. It never mutates its input and is not called by production hydration.

Migration is an ordered reconstruction pipeline:

1. Validate the complete explicit profile registry for both version-2 conversion and version-3 reads.
2. Canonicalize datasets and words, then build globally unique immutable occurrences and mastery terms.
3. Group raw attempts by stable ID before parsing, filtering, or selecting evidence; conflicting payloads are quarantined as one unit.
4. Attach one authoritative lifecycle projection and one explicit Adaptive Warmup profile to each usable occurrence.
5. Reconcile child/module rotation cycles before any promotion can calculate next-cycle eligibility.
6. Collapse compatible legacy snapshots conservatively and record an explicit timestamp or unknown-cutoff checkpoint.
7. Integrate mastery occurrences once in canonical curriculum order; a later mastered occurrence with no child row is still integrated as unassessed evidence.
8. Build one event stream per child and mastery term. Apply final-review/reintroduction resets chronologically, then replay only Warmup attempts proven to follow the legacy checkpoint or a later reset. Store the applied attempt IDs and fingerprints.
9. Validate the complete graph before returning a converted record.

The projection:

- reads only version 2 or a completely validated version 3 projection;
- inventories every canonical dataset and word independently of child state;
- requires lifecycle assignments from the caller, including for Grade 2, and contains no hidden Kindergarten or Grade 5 lifecycle defaults;
- infers missing metadata only for explicitly supplied trusted canonical Grade 2 Tier 1 writing dataset IDs;
- accepts complete explicit metadata for other modules and grades;
- stores one separate resolved or unresolved lifecycle assignment for every accepted occurrence;
- suppresses occurrences whose lifecycle cannot be resolved rather than treating them as mastered;
- enforces occurrence-ID uniqueness across all terms and treats dataset, word, grade, school year, display text, and mastery identity as immutable provenance;
- collapses byte-equivalent duplicate datasets and words but quarantines conflicting duplicates and word-to-dataset mismatches;
- combines occurrence-keyed legacy state using Needs Attention, then Recent Entry, then Mastery Rotation precedence;
- resets the migrated streak after reliable incorrect evidence or any collapsed bucket/streak disagreement, and normalizes impossible unassessed or completed-recovery streaks to zero;
- preserves reliable completed Warmup evidence without inventing demonstrated evidence;
- quarantines a reused legacy Warmup attempt ID when its payloads conflict, so input order cannot choose correctness;
- can accept preclassified final-review evidence, and can convert legacy single-cycle final-review results only for dataset IDs explicitly trusted by the caller;
- creates initial mastery state from reliable final-review evidence even when no legacy Warmup state exists;
- preserves old monthly aggregates as legacy reports;
- quarantines malformed or unresolved entries individually;
- returns a valid partial projection with deterministic deferred records when a needed profile is unavailable, and can reconstruct the complete projection from untouched raw version-2 collections after that profile is registered;
- preserves every original top-level collection and orphaned legacy record in the projected result;
- returns the original value unchanged after a fatal top-level failure;
- canonical-sorts all derived collections and quarantine reports so semantically permuted input produces the same Adaptive Warmup projection;
- validates normalizer and term identities, global occurrence uniqueness, lifecycle references, child-state references, profile-aware streak thresholds, rotation-cycle relationships, timestamps, and numeric invariants;
- treats every completed scored final-review result as a review timestamp, keeps incorrect timestamps at or before the latest review, and normalizes a recoverable legacy timestamp mismatch per record;
- reconciles the current rotation cycle from both the legacy child-level cycle and per-word cycle fields without making a newly promoted next-cycle term immediately eligible;
- treats a valid complete prior projection as an idempotent no-op, retries a valid partial projection from its preserved raw inputs, and rejects a malformed pseudo-version-3 record without replacing it.

A valid complete prior projection is not remigrated merely because time has advanced. Before activation, callers must use the separate pure lifecycle-reconciliation operation to refresh every occurrence from current authoritative dataset assignments. Reconciliation updates safe mutable lifecycle projections even when an unrelated dataset needs attention, marks only the affected strategy-mismatch, missing, invalid, or conflicting occurrence unresolved, and therefore makes that affected term fail closed. Historical integration remains valid because it records the eligibility basis at integration time rather than claiming that the current projection is still Mastery. Reconciliation reports the resulting active-occurrence count so the projection report can remain internally consistent. It does not read or write storage.

Legacy `childWordStates` may be absent because current version-2 hydration already treats that field as optional. Absence means an empty legacy collection; a present non-array value is a fatal validation failure. Every profile must explicitly select its ordinary duplicate and rotation policies. Grade 2 selects unique ordinary queues; it does not silently supply that choice to another grade. Intentional Correction or reacquisition repetition remains a separate routine rather than an accidental queue-filling fallback.

This projection is an implementation proof, not a production cutover. The synthetic two-review tests exercise the interface needed by a future Grade 5 strategy; they do not register Grade 5 production behavior. The migration and lifecycle-reconciliation modules remain pure and contain no persistence responsibilities. The later persistent-visits branch must back up and restore-test real data, validate the complete converted state, introduce dual reads and new writes, update Firestore rules, and add Emulator coverage before state version 3 is activated.
