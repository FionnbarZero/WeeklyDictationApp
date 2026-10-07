# A3.2 — curriculum and teaching-rule pinning

Status: checkpoint pinning, saved-source navigation, offline reopening, Grade 2 corrected editions, durable discard, and guarded rollback are implemented in [PR #60](https://github.com/FionnbarZero/WeeklyDictationApp/pull/60), on `codex/a3-curriculum-pinning`, based on `6573e09`. Application head: `c6e5310503912ef529ab66ab8050184317b02b3a`. This is **not a published A3.2 release**. Final checks and independent Astra Extra High review remain release gates; do not infer approval from GitHub's ready-for-review label. Production remains A3.1 (`55e9189`). No production records, authentication settings, security rules, or hosting have been changed. Earlier increment assessments below are historical; the continuation section records the current implementation.

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

## A3.2 gates — current disposition

1. **Offline release transition: locally rehearsed.** The old A3.1 artifact is checksum-verified and copied into a guarded, offline-compatible rollback package. An already-controlled desktop/tablet browser upgraded, rolled back online and offline without changing family records, and resumed with the candidate again. A provider-only rollback remains insufficient. Retain the exact guarded artifact and verify the intended host before publication. A first-ever offline visit is not supported.
2. **Grade 2 corrected-week adoption: implemented.** Family mode retains immutable content-derived editions, including separate target identities. It continues an unfinished original edition and adopts the current teacher edition after completion or confirmed discard. The non-family importer still rejects changed same-ID content. Old scores and mastery are never relabeled as corrected targets.
3. **Explicit discard: implemented and locally checked.** The existing confirmation writes a deterministic, immutable retirement marker. Reviewed history and completed scores remain; the next attempt gets a new progression identity. Sync handles markers before mutable checkpoints. Old open sessions cannot submit answers or later scores once they see the marker. The v1 engine is retained; no engine or history is retired by this work.
4. **Release gate: pending independent review and final-head checks.** Review the complete diff, exact-package behavior, corrected-edition provenance, retirement sync, and the containment rollback. Publish only the verified artifact, then verify served hashes and behavior. Keep physical-device audio acceptance separate; the owner need not test the older live build for these unpublished changes.

These are implementation/acceptance dependencies, not requests to change the owner's approved behavior. A3.3 automatic conflict resolution, durable-history bounding, and E2 retention cleanup remain separate. No production migration or security change is authorized by this code increment.

## Verification

Regression tests reproduced the old failure for five shared-store strategies before the repair. Unit coverage now includes original targets/timers after edits, exact prompt and score-session preservation, compatible legacy pinning, corrupt snapshots, child isolation, stale tabs, archive failure, and strict rollback-reader behavior. Grade 2 coverage includes pending-answer replay with changed current words and preservation of unverifiable legacy records.

The first increment's packaged desktop/tablet tests exercised a checksum-valid teacher edit followed by reload and another reviewed answer on all six ordinary grade/channel paths. At that point Grade 2 retained its import warning. The continuation now removes that warning through coexisting editions and additionally exercises confirmed discard, corrected targets, another answer, and reload.

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

### Historical offline-increment analysis (superseded by the continuation below)

Keep the PR draft. Grade 2 corrected-week adoption and durable confirmed discard have **not** been implemented by this increment. Grade 2 needs coexisting curriculum identities and preserved result provenance; removing its import conflict guard would silently reinterpret old answers. Durable discard needs archived reviewed history and a sync-safe reset/retirement record; deleting a launch button or local key can allow an older device to restore the discarded attempt. Engine retirement remains unauthorized and unimplemented.

The new offline shell adds a release-specific requirement: rehearse both upgrade and rollback with an already-controlled browser. In particular, the prior A3.1 provider rollback command is not sufficient after publishing this shell, because an installed worker can keep serving its cached release. Prepare and verify a compatible rollback shell or a reviewed retirement worker before publication. Independent release review, final-head GitHub checks, and physical-device microphone/speaker acceptance remain separate gates. No production data, security setting, or hosted application was changed.

### Offline increment acceptance

Final application change: `e7890d6a04dac93fd915ea80f38ca1c36cf0d77d`. The final packaged/tested tree includes documentation commit `cbde960156284705454d3b8e139477cfd41a8c2e`; subsequent acceptance-document commits do not change application code.

| Check | Evidence |
| --- | --- |
| Complete unit suite | 721 passed on final packaged source |
| Complete canonical desktop/tablet regression suite | 154 passed on `0b33ea8`; later changes isolate cache scope, rebuild alias integrity metadata, normalize decoded response headers, and order imports |
| Final-package full-offline browser checks | All 18 passed on `cbde960`: all six grade/channel paths on desktop and tablet-touch, plus sign-out, denied family access, and a different parent |
| Family policy, local emulator | 5 passed; no policy change or production request |
| Type, lint, repository format, focused Biome | Passed |
| Production build/performance | Passed: initial JS 546,147/550,000 bytes; CSS 42,745/60,000 bytes |
| Final canonical and alias integrity | Canonical 135 files verified; each alias verified (135/136/135 files). Each offline shell's 126 file entries match the corresponding package |

The final browser-tested canonical artifact is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-x4nEpR`, source `cbde960156284705454d3b8e139477cfd41a8c2e`, tree SHA-256 `e1d57c66902d2ef99d3679f7db5e21996a5cf720148c66feba954c6e189788ae`. The independently packaged artifact at `ninja-dojo-family-sync-HKkX3R` has the identical tree. These are temporary local test artifacts, not hosted previews or durable release archives. The new final GitHub head needs its own checks. No test result here establishes physical iPad/iMac audio behavior or the still-pending controlled-browser upgrade/rollback rehearsal.

## A3.2 continuation: corrected editions, durable discard, and rollback

Application source: `c6e5310503912ef529ab66ab8050184317b02b3a`. This continues the same PR and approved A3.2 scope. It neither implements A3.3 nor changes the game-readiness queue.

### Corrected Grade 2 editions

Family import validates incoming teacher content in a separate empty workspace before retaining it alongside the existing dataset. A changed week receives a deterministic `__rev_<content-hash>` dataset identity and corresponding word identities. Original words, scores, reviewed responses, and mastery references are not overwritten. Returning to identical source content selects its existing edition rather than creating duplicates. Non-family import retains its original conflict safeguard.

Writing keeps an unfinished edition until teaching is complete and its latest scored/DT visit is submitted, or until confirmed discard. Other children and new eligible attempts receive the exact edition matching the validated teacher source. Reading continues to use its separately pinned acquisition store. Corrected editions survive the existing local-state loader/backup boundary; malformed edition identity fails canonical validation. Source-backed reopening also validates the edition against the original teacher document.

### Confirmed discard, without erasing history

The confirmation creates an immutable child-scoped `lesson-retirement-v1` marker. Simultaneous confirmation of the same attempt produces identical marker bytes. The original checkpoint, reviewed responses, and completed attempts stay in place. The next visit uses a new, deterministic progression generation; it cannot collide with earlier transition/result identities. Grade 2 keeps both envelopes in its workspace, while the shared store keeps the earlier key unchanged.

Saved-lesson navigation suppresses retired generations. Incoming markers are processed before mutable records, so an ordinary checkpoint conflict cannot prevent a discard from reaching the other device. Once observed, an old open activity cannot record another answer or submit another score. A device that is still offline cannot learn a discard until it synchronizes; no claim is made that disconnected browsers can be controlled remotely. General whole-record conflict resolution remains A3.3; conflicting copies are still preserved, not silently merged.

The v1 teaching engine remains supported. A future retirement must first supply and verify an explicit migration/compatibility route for every supported snapshot contract. Unknown contracts continue to fail closed with records retained. This change does not delete old engines, reviewed history, source caches, or production data.

### Guarded rollback procedure and limitations

`scripts/prepare-family-offline-rollback.ts <verified-previous-artifact>` requires committed compatibility source, verifies every old artifact file and tree hash, and writes a new temporary copy. It cannot upload or change hosting. Every older HTML entry gets a synchronous newer-record guard before any old engine runs; only known script shapes are accepted. The copy gets an integrity-checked offline worker capable of replacing the candidate's worker after all existing Dojo tabs close. No `skipWaiting`, forced takeover, storage clearing, or child-data migration is used.

When newer lesson records exist, rollback is **containment, not continued practice**: the older engine does not execute and a recovery message preserves all records until the updated app returns. This avoids the older Grade 2 loader dropping unrecognized corrected editions. The recovery screen offers reload, not the ordinary activities or report form; it does not read credentials, upload records, or write family storage. Normal application pages retain their existing problem-report controls. Browsers without newer records may run the older application. A currently open lesson is never replaced in place.

The retained previous artifact is A3.1 `55e9189c7f38f6d6436a6e3b5acd7f115d5964a8`, tree `e11c62f97055f1d0bb15e7f9ce16d07c7822401ff968f2024f9cdf5936fcc5e0`, at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-RjUS4f`. The guarded rollback prepared from application head `c6e5310` is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-offline-rollback-R1yMjk`, 134 verified files, tree `61307157ade6ee4219f9fac9a3e19e702b6a4eb4271d55c53913f1928145e107`. Archive and reverify the exact rollback before release; temporary directories are not durable release storage. The older provider-only rollback command is not an acceptable replacement for this guarded package.

The local-only test server accepts `FAMILY_SYNC_REHEARSAL_OLD_ARTIFACT` to opt into same-origin previous/candidate/guarded-rollback switching. No switching endpoint is present in the deployed artifact. The explicit rehearsal test is skipped without that verified artifact; skipped checks are not counted as passes.

### Continuation evidence and handoff

- Full unit suite: **734 passed** on `c6e5310`.
- Complete canonical desktop/tablet suite: **178 passed** on `c6e5310` (89 per project); two opt-in rollback cases skipped, not counted as passes. All 62 curriculum/discard cases passed along with offline, reporting/recording interruption, saving and history regressions.
- Final-source focused desktop/tablet checks: **16 passed**, including all six stale-discard submission paths, delayed-download ownership, and Grade 2 correction → discard → new edition → answer → reload.
- Production-intended family rules, local emulator: **6 passed** on `fdc0f91`, including retirement reaching another device before a checkpoint conflict. The later change only adds local score-submission guards; no rules or sync contract changed.
- Already-controlled upgrade → guarded rollback → offline recovery → candidate resume: **2 passed** on `fdc0f91`; the complete family suite does not substitute for this opt-in rehearsal.
- Full prototype behavior/visual suite: **32 passed** on `c6e5310`; screenshots and tolerances unchanged.
- Typecheck, lint, repository formatting, focused boundary checks, production build/performance: passed. Initial JS **549,447/550,000 bytes**, CSS **42,745/60,000 bytes**.
- Exact canonical artifact: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-E2iMV1`, source `c6e5310`, all **137** files verified, tree **`940486b2e19b6dd3281d84c3c3aacd0a1e28981b7c1e454e5babd9bd16feb210`**. This is local and unpublished.

The full local canonical suite passed; GitHub final-head checks and independent review remain release gates. The initial full run revealed an obsolete A2 test expectation that discard should advance the original envelope. The repaired assertion instead requires the original envelope to remain unchanged and the new generation to advance, while retaining all delayed-download/ownership assertions. One parallel test run collided with another run's output cleanup; the successful final full run used an isolated report directory. A test import-order violation was fixed and the exact family CI style command passed. None of these changes altered screenshot baselines or relaxed an application invariant.

Remaining release handoff: independent **GPT-6 Astra · Extra High** review of PR #60 and this evidence, followed by verified exact-artifact publication under the existing release policy. The old CI head `e37469b` failed one Grade 2 prototype screenshot (635 pixels); the same local visual suite and GitHub browser/visual job now pass unchanged on `c6e5310`. New-head CI must establish its own result, with failed-browser artifacts now retained for diagnosis. No published preview, live feature acceptance, or physical iMac/iPad speaker/microphone result is claimed.

Do not send the owner back to A3.1 to test A3.2. Only after an independently reviewed, verified reachable build is available should the owner receive a brief test of reopening/saving and report pause on their iMac/iPad, with exact build/links and an explicit time limit. Total durable storage growth, the 500-record sync ceiling, automatic conflict selection, game integration, and broad device/audio quality remain separate work; this PR does not claim to fix every screen.
