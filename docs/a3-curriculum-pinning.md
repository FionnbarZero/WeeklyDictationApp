# A3.2 — curriculum and teaching-rule pinning

Status: first increment implemented and locally verified in [draft PR #60](https://github.com/FionnbarZero/WeeklyDictationApp/pull/60), on `codex/a3-curriculum-pinning`, based on `6573e09`. This is **not a completed A3.2 release**; do not merge or publish it as one. Production remains A3.1 (`55e9189`). No production records, authentication, security rules, or hosting have been changed.

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

Packaged desktop/tablet tests exercise a checksum-valid teacher edit followed by reload and another reviewed answer on all six ordinary grade/channel paths. The Grade 2 writing case explicitly expects the retained import warning; it must not be counted as corrected-week adoption.

Local verification on October 7:

| Check | Evidence |
| --- | --- |
| Full unit suite | 697 passed on final source `16baf2a` |
| Full canonical desktop/tablet suite | 110 passed on `d4faa82`; subsequent changes bind Grade 2's displayed queue to its saved targets and preserve the original legacy build label |
| Final-source canonical curriculum checks | All 12 passed on `16baf2a`, covering six grade/channel paths on desktop and tablet-touch |
| Production-intended family rules, local emulator | All 4 passed on final source, including original snapshots and completed archives recovered unchanged by a second device, plus cross-family denial |
| Type, lint, repository formatting, focused Biome | Passed on final source |
| Production build and performance budgets | Passed: initial JS 545,305/550,000 bytes; CSS 42,745/60,000 bytes |
| Final canonical artifact | All 131 manifest files and the complete file-tree hash verified |

The final-source artifact records `16baf2a01a050b64c5e4824aff4a7a8364efbb2d`, with tree SHA-256 `71826a1e7b41deba1b075a0d766b0edc75ca6ad9b6d8bcb8e3ee5d32808d7a9d`. Its local directory is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-H63D8l`; this temporary directory is not a published preview or permanent release archive. Later acceptance-document commits do not change application source. GitHub final-head checks and independent review remain separate gates; no live acceptance or physical-device microphone/speaker testing is claimed.

The initial packaged run exposed a test-only warmup race: Grade 2 renders its introductory screen asynchronously, so an immediate visibility probe sometimes skipped the test's **Skip Warmup** click. Awaiting the expected Grade 2 warmup control fixed that test; the full 110-check run and both subsequent focused runs passed. The original wrong-curriculum failures were reproduced before implementation, not hidden by this wait adjustment.
