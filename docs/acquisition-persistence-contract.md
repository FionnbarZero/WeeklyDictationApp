# Acquisition persistence contract

Status: pure boundary and production activation implemented on `feature/persistent-acquisition`; automated Emulator, rendered-browser resume, backup/restore, unit, and build gates pass. Final diff review and merge remain required.

## Purpose

The earlier application could save an Acquisition flow, but its progression, scored attempt, and DT observation were separate last-write-wins operations. The pure boundary defines one versioned checkpoint; the activation layer now commits it atomically in Firestore or recovers it idempotently from the browser journal.

The pure contract extraction did not change the Grade 2 v3 engine, scoring, lifecycle assignment, source activation, UI, local storage, Firestore, or security rules. The separate activation changes orchestration and storage only; it preserves the engine, scoring policy, lifecycle/source gates, and child-facing teaching behavior.

## Identity

One progression belongs to the complete tuple:

```text
child + dataset + grade + school year + activity module + vocabulary tier
```

The path-safe progression ID is derived deterministically from that tuple, and the tuple remains stored beside the ID so a mismatch fails validation. The envelope also stores the ordered target occurrence IDs and a fingerprint of the complete ordered target set. Reordering or changing a target therefore cannot silently resume an incompatible progression.

## Versioned envelope

`AcquisitionProgressEnvelope` stores:

- Contract, schema, and application-writer version.
- Complete progression identity and the lifecycle stage observed at the last checkpoint. The current supplied lifecycle context remains authoritative for availability and the next checkpoint.
- Strategy ID, version, and complete configuration fingerprint.
- Ordered target identities and target-set fingerprint.
- Monotonic revision.
- Exact generic Acquisition engine flow.
- The latest applied transition receipt. Older immutable receipts belong in the repository's transition store so open-ended DT practice cannot grow one progression document without bound.
- In-progress or teaching-complete status.
- Canonical timestamps.

Validation checks the complete nested flow against the supplied canonical target set and grade-owned strategy. It rejects mismatched strategies or targets, missing completion evidence for earlier ordered targets, impossible completion combinations, missing active prompts, incorrect timers, impossible indices and sequence positions, invalid pools or scoring flags, revealed persisted prompts, legacy fields, and invalid latest-transition receipts. The only permitted completed-prefix gap is the exact previously completed term currently undergoing Earned-DT reacquisition.

## Checkpoint

`buildAcquisitionCheckpoint` accepts the reviewed response, runs the engine transition itself, and records every random value consumed. This produces a persistence-neutral command containing:

- Deterministic transition ID.
- Expected and next revision.
- Answered prompt and session identity.
- Exact next engine flow.
- Reviewed response and deterministic random-value trace so the reducer can replay the transition.
- Neutral assessment, when the prompt was assessed.
- One scored-attempt fact when the assessment counts toward the Acquisition score.
- One DT-observation fact when the prompt is a Familiar or Earned DT and the strategy collects observations.

Show/copy trials advance the exact engine position but produce no assessment fact. Familiar DT trials produce a DT observation but no scored attempt. Weekly targets produce a scored attempt. Earned DT trials produce both one scored attempt and one DT observation.

`applyAcquisitionCheckpoint` enforces:

- Same transition ID and same payload: idempotent no-op.
- Same transition ID and different payload: conflict.
- Stale expected revision: conflict.
- Invalid or invented assessment/fact: conflict.
- A next flow that differs from a deterministic engine replay: conflict.
- Valid next flow: one revision advance and one progression-bound applied-transition receipt.

The reducer recognizes the latest receipt directly from the envelope. A repository may supply an older immutable receipt when retrying a transition that is no longer the latest revision. The receipt stores the operation, prompt, expected revision, applied revision, and applied timestamp. All must match the exact checkpoint, in addition to progression identity and payload fingerprint; future, cross-progression, revision-shifted, or malformed receipts fail closed.

Finishing the weekly teaching sequence leaves one exact terminal teaching flow. A later visit may enter ongoing DT-only practice once through a separate fact-free `resume-dt-practice` checkpoint. Its random trace is replayed like an answer transition. An already-open DT-practice flow cannot be resumed again to replace its pending prompt. This ensures the first DT-only prompt is revisioned before it can be answered; the application never mutates the persisted flow outside the checkpoint boundary. DT-only practice retains the terminal teaching phase and step as historical position data, but those fields no longer select a teaching-sequence token while `mode` is `dt-practice` and `currentTarget` is null.

`lifecycleStageAtLastCheckpoint` is informational history, not an availability decision. Reading an older envelope after its dataset advances therefore preserves the historical value. A successfully applied checkpoint records the authoritative lifecycle context supplied for that operation. Production eligibility must always use the current lifecycle resolver.

## Legacy migration

`migrateAcquisitionProgress` reads the current unversioned `AcquisitionProgressRecord` without mutating it. It:

- Verifies child, dataset, grade, and timestamp identity.
- Uses the existing engine compatibility normalizer for old strategy positions.
- Converts legacy Established-DT IDs, bags, and prompt metadata to Familiar terminology.
- Restarts a persisted unanswered prompt as unrevealed.
- Validates the complete converted envelope before returning it.
- Returns the untouched raw record with a quarantine reason when conversion fails.
- Requires an explicit strategy-upgrade function bound to the exact source strategy ID, version, and configuration fingerprint before a current envelope may move to a different strategy identity/version.
- Requires the canonical target fingerprint and ordered occurrence identities to remain unchanged across a strategy-only upgrade. Curriculum changes require a separate reviewed migration and cannot borrow strategy-upgrade authority.
- Quarantines absent, mismatched, or invalid upgrade paths rather than reinterpreting progress.

Collection migration resolves each record independently, preserves unrelated valid progress when one record is malformed, and quarantines conflicting reuse of one deterministic progression identity rather than choosing by input order.

## Production activation

`feature/persistent-acquisition` now provides:

- An application coordinator that migrates or creates one versioned progression and fails closed when saved progress is malformed.
- A durable browser journal containing both the checkpoint and its exact base envelope, allowing a brand-new or offline progression to recover after interruption.
- One Firestore REST commit for the progression revision, immutable transition receipt, optional scored attempt, and optional DT observation.
- Revision and immutable-identity enforcement in Firestore rules, with migration-era legacy reads and writes retained until the cleanup window.
- Idempotent retries by stable transition ID and stale-revision rejection.
- Immediate local commits plus ordered startup recovery, without changing the outer version-2 application-state container.

The branch includes repeatable acceptance gates:

- `npm run test:firestore` proves owned atomic commits, revision updates, receipt-linked attempts, stale-write rejection, immutable identity, duplicate-receipt rejection, and cross-family isolation.
- `npm run test:browser` imports the canonical Grade 2 fixture, reviews one Acquisition response, reloads, and proves exact prompt/revision resumption without duplicate state.
- The unit suite verifies a JSON-storable application backup and restore containing application state plus the pending Acquisition journal, without authentication tokens.

These gates establish implementation readiness; deployment and production-data migration still require their own reviewed rollout.

Production orchestration now imports the boundary only through the application coordinator. The engine and pure persistence modules remain independent of React, local storage, Firebase, and Firestore.

## Runtime prerequisite resolved after contract testing

The focused `fix/acquisition-earned-dt-recovery` branch repairs the pre-existing Earned-DT Correction and reacquisition defects before persistence activation. Open-ended DT-only Correction now advances through all six configured positions. Earned-DT reacquisition preserves the single original weekly-target resume position; its internal DT slots use Familiar DTs so another Earned DT cannot recursively replace that position. Successful reacquisition returns to the exact interrupted weekly-target step, and final completion retains the complete Earned-DT pool.

The persistence validator continues to fail inconsistent legacy or invented outputs closed. Direct regression tests freeze Correction advancement, resume-position preservation, exact return, and final completion evidence.
