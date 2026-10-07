# A3.2 — curriculum and teaching-rule pinning

Status: implementation in progress on `codex/a3-curriculum-pinning`, based on `6573e09`. This first increment is **not a completed A3.2 release**. Production remains A3.1 (`55e9189`). No production records, authentication, security rules, or hosting have been changed.

## First increment: durable acquisition context

Each new ordinary acquisition lesson saves its complete ordered targets and serializable teaching strategy alongside the reviewed checkpoint. A versioned engine contract, bounded snapshot, and content fingerprint protect the original context. The ordinary strict progression validator remains unchanged: callers explicitly resolve the original context before applying an answer. No code, recordings, handwriting images, or provisional responses are introduced into the snapshot.

This covers Kindergarten and Grade 5 writing, all three ordinary reading Dojos, and local/family Grade 2 writing. The legacy direct-cloud Grade 2 start path does not automatically create new snapshots; its reader can preserve an existing compatible snapshot. Grade 2 answer replay, backup validation, and cloud hydration understand pinned records. Activity target counts and writing datasets use the saved targets, not today's target list.

Compatible v1 records without a snapshot acquire one only when their complete original fingerprints and flow validate against the available context. Unknown/malformed snapshots, unsupported engine contracts, changed legacy contexts, and unverifiable pre-envelope records remain preserved and blocked. There is no guessed reconstruction of unseen words, silent strategy upgrade, or reset.

In the shared family store, a confirmed completed teaching lesson can give way to changed curriculum on the next score-session opening. The prior complete record is first archived under its existing child-owned key prefix and read back; the active record is then replaced with compare-and-swap protection. Failure leaves the old lesson available. Ending a partial score session does **not** release its curriculum pin. The existing immutable completed-results store is untouched.

The snapshot is additive to the existing v1 envelope. A previous reader can still validate the unchanged original context. If its current source differs, it blocks without erasing the record. This is preservation-compatible rollback, not a promise that an old binary can execute an unfamiliar future strategy. Restoring a previous binary must not delete the snapshot or archive.

## Remaining A3.2 gates — do not mark complete or deploy as complete

1. **Durable launch/resume index and curriculum availability.** Today's screens still discover activities through the latest source. A deleted week, removed tier, invalid replacement, or unavailable curriculum endpoint can prevent reaching an otherwise intact saved lesson. Introduce a validated, child-scoped resume route and source cache; prove offline reload and removed-week launch without pinning unrelated new activities to old data.
2. **Grade 2 corrected-week adoption.** Its importer currently refuses a changed already-imported week. Preserve that safeguard until the old dataset and completed-result provenance can coexist with a corrected version. Do not overwrite a canonical target's text under an old score/mastery identity. Pinning alone does not fix this import boundary.
3. **Explicit discard and engine retirement.** Connect durable lesson discard to the approved confirmation UI without deleting completed scores or reviewed history. Define the retention/upgrade route before retiring the supported engine contract. Existing slot discard is not proof of durable lesson discard.
4. **Transition and release rehearsal.** Test existing records, storage/readback failures, backend upload/download, removed targets, correction/earned-DT resume, rollback, and current/new lesson selection across all three grades. Keep ordinary browser beta coverage separate from physical-device audio acceptance.

These are implementation/acceptance dependencies, not requests to change the owner's approved behavior. A3.3 automatic conflict resolution, durable-history bounding, and E2 retention cleanup remain separate. No production migration or security change is authorized by this code increment.

## Verification

Regression tests reproduced the old failure for five shared-store strategies before the repair. Unit coverage now includes original targets/timers after edits, exact prompt and score-session preservation, compatible legacy pinning, corrupt snapshots, child isolation, stale tabs, archive failure, and strict rollback-reader behavior. Grade 2 coverage includes pending-answer replay with changed current words and preservation of unverifiable legacy records.

Packaged desktop/tablet tests exercise a checksum-valid teacher edit followed by reload and another reviewed answer on all six ordinary grade/channel paths. The Grade 2 writing case explicitly expects the retained import warning; it must not be counted as corrected-week adoption. Acceptance results will be recorded after the packaged run.
