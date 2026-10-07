# A3.2 — curriculum and teaching-rule pinning

Status: checkpoint pinning, saved-source navigation and offline reopening implemented in [draft PR #60](https://github.com/FionnbarZero/WeeklyDictationApp/pull/60), on `codex/a3-curriculum-pinning`, based on `6573e09`. This is **not a completed A3.2 release**; do not merge or publish it as one. Production remains A3.1 (`55e9189`). No production records, authentication settings, security rules, or hosting have been changed.

## First increment: durable acquisition context

Each new ordinary acquisition lesson saves its complete ordered targets and serializable teaching strategy alongside the reviewed checkpoint. A versioned engine contract, bounded snapshot, and content fingerprint protect the original context. The ordinary strict progression validator remains unchanged: callers explicitly resolve the original context before applying an answer. No code, recordings, handwriting images, or provisional responses are introduced into the snapshot.

This covers Kindergarten and Grade 5 writing, all three ordinary reading Dojos, and local/family Grade 2 writing. The legacy direct-cloud Grade 2 start path does not automatically create new snapshots; its reader can preserve an existing compatible snapshot. Grade 2 answer replay, backup validation, and cloud hydration understand pinned records. Activity target counts and writing datasets use the saved targets, not today's target list.

Compatible v1 records without a snapshot acquire one only when their complete original fingerprints and flow validate against the available context. Unknown/malformed snapshots, unsupported engine contracts, changed legacy contexts, and unverifiable pre-envelope records remain preserved and blocked. There is no guessed reconstruction of unseen words, silent strategy upgrade, or reset.

In the shared family store, a confirmed completed teaching lesson can give way to changed curriculum on the next score-session opening. The prior complete record is first archived under its existing child-owned key prefix and read back; the active record is then replaced with compare-and-swap protection. Failure leaves the old lesson available. Ending a partial score session does **not** release its curriculum pin. The existing immutable completed-results store is untouched.

The snapshot is additive to the existing v1 envelope. A previous reader can still validate the unchanged original context. If its current source differs, it blocks without erasing the record. This is preservation-compatible rollback, not a promise that an old binary can execute an unfamiliar future strategy. Restoring a previous binary must not delete the snapshot or archive.

## Second increment: saved-source navigation

The family menu now has a collapsible **Saved lessons** section. Each ordinary reading/writing Dojo binds its original checkpoint fingerprint to a validated source and the actual cohort week, independently of today's calendar-week menu. All six grade/channel paths can reopen and answer after the curriculum service fails or the teacher removes that week. Returning to current lessons uses the new source; a saved-source menu exposes only its original reading or writing Dojo, not unrelated old games or tests. A lesson already open is reused, including Grade 5 weeks that repeat an earlier cohort, rather than opening a competing copy of its checkpoint.

The wrapper supplies each owned activity frame's exact validated source. Source contents and launch metadata use the existing child-owned opaque-sync prefix; no new production permissions are required. A separate device can recover both. Immutable source contents exclude variable fetch timestamps so identical content fetched by two devices cannot create a false content-cache conflict. The original retrieval metadata stays with the lesson route. Sources have a 650 KB per-record bound, below the existing sync limit; writes are confirmed by readback. Unknown, corrupted, missing-source and cross-child routes fail closed without erasing records. A stale index cannot resurrect a missing or replaced checkpoint. Teaching-complete records remain reachable for earned-DT practice or an unfinished score visit; completed scores are not rewritten.

This second increment provided **curriculum-service outage recovery**, not complete cold-start offline operation. The third increment below adds the offline shell and previously confirmed family bootstrap. Existing records acquire a route when opened against a source that can establish their target identity; the app cannot reconstruct an original source that was never retained. Temporary drawings and recordings still must be repeated after a reload. Automatic conflict resolution and total storage retention remain later work.

## Remaining A3.2 gates — do not mark complete or deploy as complete

1. **Offline release transition.** Full offline reopening is now implemented for previously confirmed children and retained lessons. A first-ever offline visit is not supported. Before publication, rehearse upgrading and rolling back with an already-controlled browser: provider rollback alone to a pre-service-worker artifact will not remove an installed offline worker. Supply an integrity-checked compatible rollback shell (or an explicitly reviewed worker retirement), retain child records, and verify the older application's preservation behavior. Do not count a fresh-browser smoke check or a curriculum HTTP 503 as this gate.
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

## Saved-source increment acceptance and final analysis

Application source: `55d85a1279bbae91cbd5d998817fbd2762216727`. Final local acceptance completed October 7; later documentation-only commits do not change this application artifact.

| Check | Saved-source evidence |
| --- | --- |
| Full unit suite | 713 passed on final application source |
| Canonical desktop/tablet suite | All 136 passed on final application source (68 desktop, 68 tablet-touch), including all 38 curriculum/resume checks |
| Production-intended family rules, local emulator | 5 passed, including source/route/checkpoint recovery on a second device and cross-family denial |
| Type, lint, repository format, focused Biome | Passed |
| Production build and budgets | Passed: initial JS 546,138/550,000 bytes; CSS 42,745/60,000 bytes |
| Exact canonical artifact | All 133 file hashes and complete tree hash verified against its manifest |

The final application artifact is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-SHUdJL`, tree SHA-256 `8d238019c76e3d7f7f125736127c23b5524131dc814dcb630b164c49c70357e5`. It is a temporary local test artifact, not a published preview or permanent archive. The prior draft head `230957f` passed GitHub Quality gates; the new final head must pass its own checks. No live acceptance or physical-device audio testing is claimed.

Review of this increment found and repaired three integration risks: Grade 5's calendar week is not necessarily its teaching cohort; adding navigation above an active writing surface must not move the pad; and reopening a lesson already mounted must reuse its activity owner. Source identity, child ownership, content checksums, stale-checkpoint checks, readback failure, and second-device recovery have dedicated coverage. One test incorrectly assumed DT's random choice must always be an earned target; it now accepts the engine's valid familiar/earned choices while asserting teaching completion and an open practice prompt.

Release assessment: **keep PR #60 draft**. The source/checkpoint boundary is substantially safer, but full A3.2 remains incomplete for the four gates above. Additional architectural risks are total storage growth and the 500-record sync ceiling (A3.3), the small initial-JavaScript budget headroom, and browser/device audio behavior not established by synthetic tests. Sources are deduplicated per child/content hash, not automatically deleted. No source-cache eviction, historical migration, engine retirement, or production cleanup has been performed. This is an implementation-agent final analysis, not the separate independent release review required by the roadmap.

## Third increment: complete offline reopening

The canonical family package now retains an integrity-checked offline application shell: its five entry pages, registration script, hashed application assets and bundled audio. The cache is scoped to the site's path, source revision and exact file tree. It never caches account requests, credentials, database responses, curriculum endpoints, or arbitrary pages. Installation rejects unavailable or mismatched files. A partially installed shell is not activated. Clean URLs and grade query parameters retain their ordinary meaning. Alias packaging recalculates the shell's integrity list after adding its grade selector. Decoded response headers are normalized so compressed hosting responses are not misrepresented in the offline cache.

An app update waits for the old app's tabs to close; it does not take over an active teaching session. The page reports when offline preparation is ready or unavailable, and when an update needs all Dojo tabs closed. Cache cleanup touches only older app-shell caches in that registration's scope, never child storage. This follows the browser's [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers). Browser storage eviction remains possible; no promise is made for an unprepared, cleared, private-mode or unsupported browser.

Offline family access is device-local and parent-UID scoped. It contains only the last confirmed family/profile metadata and the children that completed initial sync on this device, not tokens. Offline startup can reopen those children's original saved lessons even when the retained token has expired; it does not send an expired token or create online permissions. Sign-out and confirmed credential invalidation clear that owner's offline access. A saved-practice 401/403 revokes the offline grant and pauses work without deleting it. A different parent or a never-synced child cannot inherit readiness. Connectivity failures retain reviewed local progress; reconnection retries the ordinary authenticated syncing path.

Limits: this is not first-use offline onboarding, automatic cloud conflict resolution, guaranteed offline speech synthesis, or preservation of unfinished drawings/recordings. New cold-start offline sessions use the explicit **Saved lessons** route, not a guessed current teacher week. The source itself still comes from the earlier validated, child-owned retained record.

### Updated final analysis

Keep the PR draft. Grade 2 corrected-week adoption and durable confirmed discard have **not** been implemented by this increment. Grade 2 needs coexisting curriculum identities and preserved result provenance; removing its import conflict guard would silently reinterpret old answers. Durable discard needs archived reviewed history and a sync-safe reset/retirement record; deleting a launch button or local key can allow an older device to restore the discarded attempt. Engine retirement remains unauthorized and unimplemented.

The new offline shell adds a release-specific requirement: rehearse both upgrade and rollback with an already-controlled browser. In particular, the prior A3.1 provider rollback command is not sufficient after publishing this shell, because an installed worker can keep serving its cached release. Prepare and verify a compatible rollback shell or a reviewed retirement worker before publication. Independent release review, final-head GitHub checks, and physical-device microphone/speaker acceptance remain separate gates. No production data, security setting, or hosted application was changed.
