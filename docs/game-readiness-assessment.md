# EduGame readiness assessment

## C2 review repairs

The October 11 review of `c0b2ad9` reproduced a false audio warning after interrupting a prompt with Replay. It also produced a 17/18 browser result: the tablet discard test read a checkpoint immediately after the confirmation click, before the asynchronous retirement finished. A controlled storage-lock diagnostic reproduced that intermediate checkpoint and verified its removal after the lock was released. The original review failure is retained in `family-beta-artifacts/reviews/c2-dictation/failures/review-discard/`.

Application repair `e6e856b` gives each Dictation audio request an identity. Replay, automatic prompts and coaching invalidate older error callbacks; cleanup invalidates outstanding callbacks. A genuine failure of the current word cue still displays the replay action, while optional coaching failures do not block practice. Scoring, saving, synchronization and production policy are unchanged. The discard test now holds the real browser storage lock, verifies that saved work stays intact while retirement waits, then waits for confirmed removal and checks the retirement and new-run identities.

The first new replay regression had a test-helper argument error: it treated the locator element as its failure flag, reporting failure even when instructed to finish successfully. That partial run was interrupted and retained in `failures/replay-driver/`. Test-only commit `72f2aca` corrects the helper; the application repair did not change. Neither initial failed run is counted as passing.

Final candidate **`72f2aca2f9a212b8aa9f902926256d7c61da4909`** passes:

- 896 unit tests; typecheck, lint, format and build/performance checks (549,990/550,000 initial JS bytes and 42,745/60,000 CSS bytes).
- **34/34** exact-package desktop/tablet cases in 4.5 minutes, without retries or skips: 20 Dictation cases, six cross-grade menu cases, two guarded C1 recovery cases and six Context/Shadow Strike/Sushi save-failure regressions.
- **12/12 additional repetitions**: interrupted replay/coaching/current audio failure and lock-delayed discard, each repeated three times on desktop and tablet emulation.
- 11/11 family-policy emulator cases, zero production dependency vulnerabilities and the existing 11-finding firebase-tools-only tooling exception expiring November 4.

The final packages are retained under `family-beta-artifacts/reviews/c2-dictation/repair-72f2aca/` and verified against their full file inventories:

- `candidate`: 145 files; tree `29edd625ab2ff71e0d17de1ebc12f5aabeee9672c0670333154f5cd7117943d8`.
- `recovery`: 146 files; C1 source `c4f4057`, compatibility source `72f2aca`; tree `468d1a0a09e552976ef0260607746a245ecef06a5e3a6f49b1fd440ce2751ffb`.

Verification logs are retained alongside those packages. Next is an independent **GPT-6 Astra · High** re-review of `eeeac09..72f2aca` and its evidence, followed by separately authorized PR/merge/publication work. No push, merge, deployment, production security/authentication change or real-child-record change occurred. No C2 owner smoke testing yet; physical sound/keyboard behavior and the previously disclosed content/acquisition/Spirit Realm limits remain outstanding. The earlier C2 implementation record below is historical.

## C2 implementation baseline — October 11, 2026

The owner confirmed GPT-6 Astra · High for C2. Dictation currently has a prototype per-character Pinyin candidate console, native Chinese composition support and spelling/character coaching, but its capability is disabled. `content.ts` selects Tier 1 only, omits contextual audio and selection metadata; `ProductionGameShared.tsx` does not await reviewed saving. Neither family entry path uses the durable adapter for Dictation. The existing resolver already finds each tier's most recent earlier relevant week independently.

The bounded implementation will add validated mixed-tier subsets and versioned supporting Pinyin/contexts, the complete word → sentence → word → word prompt, and the existing pinned checkpoint/immutable completion adapter. Full-word submissions are reviewed; unfinished typing and existing per-character coaching remain provisional and are not saved as child responses. It will preserve report pause and failed-save retry, verify both menus and cross-device recovery, and leave acquisition games and Spirit Realm rules outside C2. No new database schema or production policy is proposed. C2 remains unpublished; owner smoke testing is premature until its separate review/release gates pass.

### C2 local candidate and acceptance evidence

Candidate source `c0b2ad986c30ab75d1dc16f6ca54580167a822bd` implements the bounded C2 contract. Both family entry paths use `SavedLearningGame`, the existing reviewed checkpoint/completion ledger, newest-reviewed cross-device reconciliation and immutable per-target facts. Dictation reserves both tiers, rotates usable subsets and resolves each tier's earlier relevant week independently. Generated supporting language is versioned and restricted to exact authoritative-source targets; unavailable content does not fall back to placeholders. Saved-pack review now uses captured supporting language without enriching it from a newer catalog.

The four-part prompt is one owned audio plan containing word → sentence → word → word; the existing host handles replay, interruption and report pause. Native Chinese composition and per-character Pinyin choices remain supported. Full-word submissions determine attempt accuracy; provisional typing and the existing spelling/candidate coaching remain unsaved. A failed write holds the submitted word in memory without advancing or showing its reviewed correctness, and retries the same checkpoint.

An initial tablet run on `ecdd8d7` reproduced a delayed-caret race: a pending focus callback collapsed the next edit's selection, duplicating the preceding character. `c0b2ad9` replaces that deferred callback with synchronous focus during the input gesture. The failed trace and log are retained under `family-beta-artifacts/reviews/c2-dictation/failures/`; the outdated run was interrupted after retaining the evidence. This is a repaired application issue, not a waived flaky test.

Verified gates: **896 unit tests**, typecheck, lint, format check, build/performance (**549,990/550,000 initial JS; 42,745/60,000 CSS**), **11 family-policy emulator cases** including Dictation isolation/conditional writes/immutable completion/retirement, zero production dependency vulnerabilities and the existing 11-finding firebase-tools-only development exception (expiry November 4). Final exact-package browser acceptance passes **32/32** in 3.4 minutes, with no retries/skips: 18 Dictation desktop/tablet cases, six cross-grade menu checks, two explicitly opted-in guarded C1 recovery cases, and six existing Context/Shadow Strike/Sushi failed-save regressions. Logs are retained alongside the packages.

| Grade | Both tiers / earlier relevant source | Full four-part prompt / character input | Reviewed error / offline reload / completion / fresh-browser details |
| --- | --- | --- | --- |
| Kindergarten | Pass | Pass on desktop and tablet emulation | Pass |
| Grade 2 | Pass; reading and writing may come from different weeks | Pass on desktop and tablet emulation | Pass |
| Grade 5 | Pass | Pass on desktop and tablet emulation | Pass |

Additional Dictation cases cover newest unfinished cross-device continuation, native composition, report-pause preservation of provisional input and confirmed saves, explicit discard retirement, audio failure/replay, and exact failed-write retry. Guarded recovery blocks the older engine before reading credentials or changing storage; returning to the candidate resumes the original reviewed Dictation checkpoint. Physical device sound/keyboard behavior remains a later release smoke check, not an automated-test claim.

Independently verified retained packages:

- Candidate: `family-beta-artifacts/reviews/c2-dictation/candidate-c0b2ad9`, 145 files, tree `f24a616c40f9cf9caf880a05ed9d3dcba292744d100d3e9f70b2b149bc481f7e`.
- Guarded C1 recovery: `family-beta-artifacts/reviews/c2-dictation/guarded-c1-recovery`, 146 files, tree `ed3f622852a364fc96e2cca867ec976393d2e27d3391dc13dcc3041007a0995a`, previous source `c4f4057`, compatibility source `c0b2ad9`. Never substitute unguarded C1 when a device contains C2 records.

At the October 5 fixture week, usable supporting content covers Kindergarten 5/5 targets, Grade 2 6/16 and Grade 5 6/14; the UI discloses subset coverage. Other weeks require corresponding validated support. Physical iMac/iPad voice and touch acceptance is not established by browser emulation. Acquisition games and full Spirit Realm game integration remain later stages.

No C2 push, merge, deployment, production authentication/security change or real-child-record change has occurred. C1 `c4f4057` remains the published release. Next gate: independent **GPT-6 Astra · High** review, then separately authorized PR/release work. No C2 owner smoke testing yet.

## C1 Shadow Strike implementation — published and live-verified

The owner confirmed **GPT-6.1 Sol · High** for C1. The implementation extends the existing saved-game contract; it does not add a second persistence system or change production policy, authentication or existing records. **The independent C1 release review is complete with no blocking findings**, as recorded below. PR #63 is merged and C1 is published from `c4f4057`; the earlier preparation notes below are historical.

### C1 publication and live acceptance — October 11, 2026

The owner separately approved publication of build `c4f4057` for Kindergarten, Grade 2 and Grade 5. The retained candidate was uploaded without rebuilding and activated once on existing Cloudflare Worker `meghangames-ninjadojo`, account `4c11957e0121dba35fe2f16be80526f8`. Provider readback confirms activation at `2026-10-11T17:28:09.029Z` (10:28 a.m. Pacific):

- Active version `221970a1-cfb8-4b5b-818e-a2a00b0eeba5`, 100% traffic, exact source `c4f4057f7bc3a04bb0f9e5811132539a06908b66`, candidate tree `6b02979f1ac0a1a03c1ed143bb2ea819a540419dbc8258e72a279744e3227a99`.
- Inactive guarded Stage B recovery `240aafb8-6abf-42a6-9c40-6511d8253e40`, tree `726c3e6c61c208a5f72ce0f202d5f3167a8eac0d156ee636a2e39eb71f70260e`. It protects newer saved-game records before the older engine can read credentials or normalize storage. Ordinary unguarded Stage B rollback is not the reviewed recovery path.
- Canonical manifest equals the retained manifest; all **143 public asset sizes and SHA-256 hashes** match. The two remaining inventory entries are hosting/build controls. Six canonical grade × desktop/tablet checks pass sign-in visibility, preserved grade selection, report open/close and no page errors.
- The release-specific synthetic driver passes against the retained local candidate with the real backend before activation and against the canonical HTTPS site afterward. In each grade it saves a correct Shadow Strike target, checks report pause, recovers and finishes that pinned round in a fresh signed-in browser, drains both completion/detail queues, and recovers the same graph point and exact per-target completion. All target tiers are Tier 2; no raw responses are retained. Anonymous family reads are denied. Each successful run removed its disposable parent and 20 test documents; no existing real-family account or records were used by the driver.

The initial pre-publication driver failed after Grade 5 because its checkpoint lookup selected an old Grade 5 test checkpoint while testing Grade 2. The correction filters both checkpoints and completions by expected grade. Its initial disposable family and 14 test documents were cleaned up; the original log is retained. The corrected all-grade local and live runs both passed. This was a driver-only correction; the approved app and package did not change.

The existing signed-in in-app browser initially showed cached `e9c5a54` and the expected update-ready notice. Closing only the agent-created Dojo tab (no unfinished activity) and reopening allowed `c4f4057` to activate with the existing profile and confirmed-sync status preserved. No browser data was cleared or user-owned tabs closed. This is separate from fresh-browser hash and acceptance checks, and explains the safe owner update instruction below.

Evidence is retained under ignored `family-beta-artifacts/releases/c1-c4f4057/`, with source logs `/tmp/ninja-c1-{recovery-upload,candidate-upload,activation,active-provider,live-assets,live-acceptance}.log` and `/tmp/ninja-c1-prepublication-acceptance{,-corrected}.log`. The publication changes no domain/routes, security rules or authentication configuration. Existing problem-report controls and batched on-device reports remain unchanged. Real-device audio/touch quality is not proved by synthetic speech or Chromium touch emulation.

#### Bounded owner smoke check

Live canonical links, all verified build **c4f4057**: [Kindergarten](https://ninjadojo.meghangames.com/?grade=kindergarten), [Grade 2](https://ninjadojo.meghangames.com/?grade=grade2), [Grade 5](https://ninjadojo.meghangames.com/?grade=grade5). Allow **5–8 minutes total**, not one full test per grade. Start with Grade 2 → Ninja Skills → Shadow Strike Dojo. On iMac check audible prompts, smooth movement and reliable mouse clicks; on iPad check audible prompts and reliable touch targets. Make a correct strike, open/close Report a problem, reload and resume, then finish and check the score. If both devices are available, use the same parent account to check the saved game or finished score on the second device. Save issues through Report a problem and email the batch at session end. If the build label is older, close all Dojo tabs and reopen the usual link; do not clear browser data.

Do not test Dictation Streak, Whispering Scrolls, Stroke Order Slay, Shadow Strike Spirit Realm warmup, unrelated acquisition, recording or handwriting for this release. Those later stages remain unfinished; the existing Context startup-timing limitation is not declared fixed. Next engineering stage: **C2 Dictation Streak, GPT-6 Astra · High**, with the same model/reasoning for its separate release review. Confirm the stage's model selection before application code changes.

### C1 merged release candidate — October 11, 2026

The owner's “proceed” approved merging PR #63 only after all five checks passed, with publication separate. GitHub confirms merge `c4f4057f7bc3a04bb0f9e5811132539a06908b66` at `2026-10-11T17:15:02Z`. Local `main` was fast-forwarded to `origin/main`; a complete tree comparison against final head `d5af459caa40a758a5542737c1ed2cc71bb462bc` is empty. No application changes were made during release preparation.

All five final-head jobs in workflow run `38153831564`, attempt 2, succeeded: quality/unit, builds, browser parity, root-policy emulator, and canonical family/production-family rules. The canonical job `114517342874` passed **352 browser cases**, with six intentional opt-in recovery skips, followed by **10 family-policy emulator tests**. Quality passed **890 unit tests**. The browser job passed 58 behavior, 32 visual-reference, three package and three public-preview checks. This is final-head CI evidence, not live publication evidence.

The first canonical attempt was mistakenly canceled because GitHub's displayed log looked stale. Its downloaded log showed normal progress, not a proven test failure or stalled runner. Only that canceled job was rerun, unchanged; the replacement reached success. A separate unchanged Lantern diagnostic passed 6/6. Both original and final logs are retained; the canceled attempt is not reported as passing.

Built with Node 24.21.0 and npm 11.19.0, then independently verified and retained under ignored `family-beta-artifacts/releases/c1-c4f4057/`:

| Package | Source | Files | File-tree SHA-256 |
| --- | --- | --- | --- |
| Candidate | `c4f4057f7bc3a04bb0f9e5811132539a06908b66` | 145 | `6b02979f1ac0a1a03c1ed143bb2ea819a540419dbc8258e72a279744e3227a99` |
| Guarded recovery | Stage B `d846981434f61534f584da22b67f2bdebc356cef`, compatibility `c4f4057` | 146 | `726c3e6c61c208a5f72ce0f202d5f3167a8eac0d156ee636a2e39eb71f70260e` |

Fresh merged-build checks pass **22/22 in 3.0 minutes** across desktop and touch emulation: 16 Shadow Strike cases and all six opted-in predecessor/candidate/guarded-recovery cases. Log: `/tmp/ninja-c1-c4f4057-release-check.log`. The preceding exact `d5af459` run passed the same 22 cases; broader prior results retain their recorded source identities.

Read-only pre-merge verification confirmed the canonical Stage B manifest and all 143 public asset hashes against retained source `d846981`, tree `693fb59532e92c2201d1819a17206d0ce0edab8bf7923b378e8153920f5d9e1a`. No C1 package has been uploaded or activated. Remaining gates: separate publication approvals for each grade, exact-artifact activation, served-build verification and bounded live acceptance. No security/authentication change or real-child data access occurred. Physical iMac/iPad audio/touch, full Shadow Strike Spirit Realm warmup, later games and the earlier Context startup-timing limitation remain outside the passing C1 synthetic checks. **No C1 smoke-test handoff or C2 work yet.** Release work remains **GPT-6.1 Sol · High**.

### C1 PR and release preparation — October 11, 2026

[PR #63](https://github.com/FionnbarZero/WeeklyDictationApp/pull/63) targets `main`. Initial CI run `38153751398` started at `b803cc9600ffe3cd8ae071f335e90843e25830cb`; checks are pending, not verified green. Recheck the final head after any documentation update. The fetched base was `d846981434f61534f584da22b67f2bdebc356cef`, with no divergent base commits.

- Candidate source `b803cc9600ffe3cd8ae071f335e90843e25830cb`: all **145 files** match manifest tree `232e3f2884a2c67d8f2c052f38fede9ecf43e867c301f28a560efdacd8454fdf`. Built with the supported Node 24 runtime and retained in `family-beta-artifacts/releases/c1-b803cc9/candidate/`.
- Guarded recovery: Stage B source `d846981434f61534f584da22b67f2bdebc356cef`, compatibility revision `b803cc9600ffe3cd8ae071f335e90843e25830cb`, all **146 files** independently verified against tree `737a37823e3927fe73cbe39ce941328316d340f4f4d6707007edf462caf3b8e9`. Retained in `family-beta-artifacts/releases/c1-b803cc9/guarded-rollback/`; not uploaded or activated.
- Read-only canonical manifest verification still reports Stage B `d846981` and tree `693fb59532e92c2201d1819a17206d0ce0edab8bf7923b378e8153920f5d9e1a`. This check is manifest-only, not a fresh verification of every served asset.

Remaining gates: all final-head CI jobs, owner merge approval, packaging the approved merged source, separate publication approval for each grade, exact-artifact activation and served-build verification. No production, security, authentication or child-record mutation occurred during this preparation. No C1 smoke-test handoff yet.

### Independent C1 review — October 11, 2026

Reviewed source: `54d36af4a0c7470734834f5177a261befc0e471f` against published Stage B `d846981`. Requested review routing: **GPT-6 Astra · High**, following C1's specific roadmap assignment. Verdict: **no actionable release-blocking findings in the C1 diff**. No application fixes were needed during this review.

The review traced both launch surfaces through pinned Tier 2 packs, selection validation, sequential reviewed progress, write-before-feedback, exact retry, immutable completion and per-target detail. It checked the existing family ownership, cloud reconciliation and retirement boundaries; the added adapter retains their contracts without new schema fields or security changes. It also inspected report/navigation pause, stable mouse/touch hit areas, transform movement, Spirit Realm exclusion and guarded rollback evidence. The existing four games' selection and completion behavior is unchanged by the added game.

Fresh independent checks pass **62/62 targeted policy/progress unit tests** and **16/16 packaged desktop/tablet Shadow Strike cases**. The review package at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-aTOMBZ` contains **145 independently verified files**, source `54d36af4a0c7470734834f5177a261befc0e471f`, tree `2a03636ffceee968c4b21c368f897dd51db9b22ebbf1146bbf5a7c4a5f53c78f`; it is retained with logs under ignored `family-beta-artifacts/releases/c1-review-54d36af/`. The review also inspected the recorded 890-unit, 78-browser, 10-policy, five-reconciliation, quality/build/dependency and six guarded rollback results below. Those broader gates were not rerun during this review; application source has not changed since their tested candidate.

Remaining release requirements: PR integration and final-head CI, final approved source packaging, approval-gated merge/publication, and exact served-build verification. Physical iMac/iPad sound and smoothness remain unverified; browser audio is synthetic. The earlier Context startup-timing limitation remains open, and later-stage games/full Shadow Strike Spirit Realm warmup remain unfinished. No owner C1 smoke test is appropriate before publication and verified links.

### Implemented scope

- Shadow Strike selects only distinct authoritative Tier 2 targets and distractors. Fewer than two usable targets makes it unavailable; there is no Tier 1 fallback. Bounded subsets rotate and disclose their actual coverage.
- Both family menus use the shared pinned-pack checkpoint, completion, outbox, reconciliation and retirement paths. Reviewed errors count but do not advance the target. A failed write holds the same strike without correctness feedback and offers an exact retry; completion retains per-target attempted/correct counts without raw answers.
- Opening a problem report holds audio, feedback and movement, including a write that completes while reporting is open. Reload, offline continuation, reconnect, fresh-browser result/detail recovery, competing unfinished devices and explicit discard have dedicated browser checks.
- Animated artwork now moves inside stationary target buttons, so ordinary mouse clicks and touch taps have stable hit areas. Horizontal journey motion uses a separate transform track rather than animating `left`.
- Spirit Realm Shadow Strike remains **Coming soon** until its full warmup repetitions/correction adapter is ready. Kindergarten's distinct Lilypad prototype is retained. C1 does not implement Dictation Streak, Whispering Scrolls or Stroke Order Slay.

### Local verification and limitations

Application changes end at `c25d3b7`; subsequent commits through tested source `e82b2bea81c66bea8a27e7fcdbbd15a0c8d1f5e0` contain tests only. The exact packaged browser candidate at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-LiQ8u5`, retained under ignored `family-beta-artifacts/releases/c1-e82b2be/candidate/`, has **145 independently verified file hashes**, tree `3550289c7ab281db5288777cce1f9f445a585b294040fe5518b6cedd85aea495`. Later documentation/reconciliation-test changes do not change that application; release preparation must package its final approved source again.

- **890/890 unit tests** pass. Typecheck, lint, configured format, family-CI formatting, build/performance and dependency gates pass. Initial JavaScript remains **549,990/550,000 bytes** and CSS **42,745/60,000 bytes**; no budget or dependency was relaxed. Production audit has zero vulnerabilities; the existing 11 firebase-tools-only tooling exceptions expire November 4, 2026.
- **16/16** focused exact-package desktop/tablet C1 cases pass at `614e8b1`, including all-grade Tier 2 selection, both-menu restore, offline completion, cloud detail recovery, failed writes, report pause, second-device reconciliation, retirement and transform-layout checks. The broader exact-package matrix at `e82b2be` passes **78/78 in 16 minutes**, covering `gamePolicy.spec.ts`, `gameProgress.spec.ts`, `offlineTransition.spec.ts` and `shadowStrike.spec.ts`. This includes all four previously published games' cross-grade policy play-throughs, saved Lantern regressions, the 16 Shadow Strike cases and **all six opted-in guarded rollback/recovery cases** against retained Stage B `d846981`; none were skipped. Log: `/tmp/ninja-c1-acceptance.log`; retained package/evidence: `family-beta-artifacts/releases/c1-e82b2be/`.
- **10/10 family-policy emulator cases** pass, including Shadow Strike's exact envelope under the existing published policy. This does not publish rules or mutate production data.
- **5/5 reconciliation regressions** pass: all-grade Spirit Realm isolation, Kindergarten Lilypad preservation and main-menu Shadow Strike launch.
- A retained 1.1-second Chromium movement probe reduced layout counts from **47 to 1** on desktop and **50 to 1** on touch emulation. Measured layout time fell from 0.005371 to 0.000909 seconds and 0.004219 to 0.000596 seconds respectively. This establishes less layout work, **not physical iMac/iPad frame-rate or audio acceptance**. Synthetic audio and emulated touch do not establish real-device sound or touch quality.

Initial failures are retained rather than counted as passing: the first ordinary-click attempt exposed the moving-button hit-area bug (fixed at `c25d3b7`); the next run exposed a new test's premature score inspection after asynchronous completion (test-only wait fixed at `614e8b1`). A reconciliation test also incorrectly expected a heading inside a ready card; its selector was corrected without changing the app. Evidence is retained in ignored `family-beta-artifacts/c1-first-completion-test-evidence/`, `c1-reconciliation-first-evidence/` and `c1-614e8b1-browser-evidence/`, with diagnostics in `/tmp/ninja-c1-*.log`. The pre-existing Context startup-readiness limitation is not declared fixed by C1.

The C1 baseline and older Stage B inventory below are historical; this implementation section supersedes their matching missing-work descriptions, not their still-unfinished acquisition or warmup requirements.

## C1 Shadow Strike baseline — October 11, 2026

Stage B `d846981` is published; the owner confirmed **GPT-6.1 Sol · High** for C1. This stage covers Shadow Strike's existing modular Dojo; the visually distinct Lilypad prototype is retained and is not replaced by the Dojo.

The current `targetBlastPack` in `src/ninjaSkills/content.ts` falls back to other tiers when fewer than two Tier 2 targets exist and has no rotating selection metadata. Central policy currently blocks launch. The modular `TargetBlast` starts its throwing animation and adds a scored attempt before awaiting its optional save callback; it cannot restore reviewed rounds, failures or counts. The shared saved-game adapter, response validation and checkpoint allowlist cover four games and need a bounded selection-game extension. Existing production family rules accept the same scoped game envelope; no new collections, fields or policy publication are required for this extension.

The journey actor transitions its `left` position for 900 ms while its surrounding world scrolls with a transform. This causes layout work during motion; a retained Chromium desktop/tablet probe measures the original behavior before edits. Use a separate transform track for horizontal movement, preserving the actor's existing vertical animation and interruption boundary. Browser measurements will establish the rendering-work change, not physical iMac/iPad smoothness.

Shortest ready path: Tier 2-only rotating packs with validated choices; sequential reviewed checkpoints and exact failed-turn retries through both family menus; report-aware feedback/audio and reload recovery; then cross-grade mouse/touch, offline, result-detail and compatibility checks. An independent **GPT-6 Astra · High** release review remains required before publication. C1 is not published or ready for a new owner smoke test.

Status: the baseline inventory below was prepared after the local A3.3 final review (October 8, 2026). The [Stage B local evidence](#stage-b-policy-and-content-slice-local) records subsequent implementation and supersedes its matching missing-work descriptions. This is not a claim that any game is student-ready or published.

## Shared integration facts

- `src/ninjaSkills/content.ts` already resolves authoritative cohort terms and emits explicit unavailable reasons. It can materialize bounded subsets, target IDs, meanings, pinyin steps, context sentences, ordered tokens, and separate lifecycle inputs.
- `src/ninjaSkills/LearningModuleHost.tsx` owns the adapter boundary. The game components emit observations; the owning activity must apply Acquisition, Correction, Adaptive Mastery, audio provenance, attempt identity, persistence, and scoring policy.
- `src/learningModules` contains reusable interaction components, but the harness is synthetic and does not prove curriculum selection, lifecycle placement, persistence, or results.
- A3.3 is published at source `e9c5a54`. Its school-year policy repair passed live three-grade saving, failed-upload/reload recovery, and fresh-browser acceptance on October 8 Pacific. This establishes the shared saving prerequisite; each game's learning policy and per-target coverage still require their own acceptance.
- The family wrapper is a second target-selection boundary: `src/familyBeta/main.tsx` builds game capabilities from earlier reading targets, substituting writing capabilities only for Dictation Streak. Updating pack tier filters alone will not make Tier 1 Context Gap Dash/Sushi Scramble or mixed-tier Shuriken Match usable. Stage B must align `src/familyBeta/gamePools.ts`, the wrapper, and the central policy.
- `src/familyBeta/gameFrame.tsx` currently saves aggregate scores. Stage B must connect reviewed per-target results without persisting the reusable module's raw `response` values; any additional production schema/security change remains a separate concrete review and approval.

## Readiness by game

| Game | Existing capability | Missing contract/content | Dependencies | Shortest student-ready path |
| --- | --- | --- | --- | --- |
| Memory Lanterns | `memoryPack` selects distinct non-Tier-3 authoritative terms; the component has match interaction and result callbacks. | Policy must be restricted to the approved Tier 2 set for the final integration; per-target attempts and score persistence need an adapter check. | Curriculum tier resolver, result ledger, A3.3 publication. | Correct tier filter, add per-target result assertions, then a bounded Grade 5 release review. |
| Shuriken Match | `speedMatchPack` requires two targets and distinct meanings; component supports meaning matching. | Must allow validated Tier 1 + Tier 2 targets and distinguish generated/validated meanings without placeholders. | Meaning provenance/validation, subset policy, separate game-result persistence. | Add mixed-tier policy table, fixture coverage for every selected meaning, then release one grade. |
| Context Gap Dash | `contextPack` currently uses Tier 2 and validates sentence structure plus three choices; Phaser interaction exists. | Approved rule is Tier 1, with contextual sentences and choices validated against that tier; current error text and channel need correction. | Sentence validation, Tier 1 selection, performance check on iPad. | Switch policy to Tier 1, add sentence/token fixtures, run touch/performance review. |
| Sushi Scramble | `sentencePack` validates ordered tokens that concatenate to the sentence; component handles sequence input. | Approved rule is Tier 1; tokenization must support longer teacher/generated sentences and preserve target identity. | Sentence provenance, robust tokenizer, result adapter. | Change tier policy, add long-sentence fixtures, verify scoring and save/reload. |
| Shadow Strike Dojo | `targetBlastPack` prefers Tier 2 and falls back to non-Tier-3; target-blast component and movement regression exist. | Remove Tier 1 fallback; repair/measure choppy movement on iMac/iPad and verify audio/replay behavior. | Tier 2 coverage, animation budget, touch/mouse input, persistence. | Enforce Tier 2, instrument frame/input timing, then Sol High implementation and Astra High release review. |
| Dictation Streak | Catalog and pack already support pinyin steps and candidate selection for eligible terms. | Must include both tiers and enforce `word → context sentence → word → word`; per-character candidate input and audio contract need end-to-end persistence tests. | Pinyin provenance, audio sequence, shared result ledger. | Expand policy and fixtures, test candidate selection per character, then Astra High review. |
| Whispering Scrolls | Reusable read-aloud components exist; product rules specify temporary recording comparison. | Must be placed in acquisition and follow the full grade-owned teaching/comparison sequence, timers, correction, earned DT, resume, and recording cleanup. | Grade-specific lifecycle tables, microphone permissions, in-session-only audio. | Implement only after source-cited phase matrix and acquisition adapter are verified with Astra Extra High. |
| Stroke Order Slay | Writing components exist in the modular library. | Must be Tier 1 acquisition with full teaching/expanded-trial/correction/earned-DT rules, stroke-guide coverage, persistence, and thinner marker on all writing activities. | Grade-specific stroke guides, handwriting input, touch QA, acquisition checkpoint contract. | Build the phase matrix and guide validation first; then implement with Astra Extra High and test every grade. |

## Release order and gates

1. A3.3 publication and authenticated score-policy repair are verified. Preserve that baseline and its protected recovery path as Stage B begins; source merge/push remains separate from the completed publication.
2. Use GPT-6.1 Sol · High for the bounded first-game implementation, beginning with the smallest validated policy slices (Lanterns, Shuriken Match, Context Gap Dash, Sushi Scramble).
3. Keep Shadow Strike separate for performance work; use GPT-6 Astra · High for Dictation Streak review.
4. Reserve GPT-6 Astra · Extra High for Whispering Scrolls, Stroke Order Slay, security-sensitive work, and the final cross-grade release review.

Every game slice must prove target selection, lifecycle placement, per-target results, pause/report behavior, save/reload, and exact artifact identity across the affected grades before a smoke-test handoff.

## Stage B policy and content slice (local)

The first bounded slice applies the approved selection contract in `src/ninjaSkills/policy.ts`, pack preparation, and both family menus. Each tier resolves its own previous relevant week, so Grade 2 can combine September 29 writing with September 21 reading without importing September 21 writing. Tier 3 never enters these four games. Later-stage Shadow Strike and Dictation Streak remain visible but unavailable; this is not a claim that their missing rules are fixed.

`src/ninjaSkills/supplemental.ts` contains versioned generated meanings for 35 exact source targets and tokenized contexts for the 17 writing targets currently used by the three grades. Only matching authoritative document IDs receive this overlay. Teacher values win, the source fingerprints remain unchanged, and the pack retains the actual generated values/version. Other weeks with insufficient content remain unavailable; the catalog is not an automatic general-purpose language generator.

Coverage is disclosed in each menu. Subsets rotate deterministically from distinct completed game attempts available in the device's validated ledger; individual answers and upload retries do not advance the visit. This is not yet lifetime cross-device coverage tracking. Opening a round pins its terms, support content, policy version and visit. The round is not silently regenerated when a teacher document refreshes.

`src/ninjaSkills/review.ts` validates the pack at launch and recomputes matching/choice/token correctness before aggregate saving. The tested per-target projection includes only target/dataset IDs, tier and attempted/correct counts, plus game/policy/phase; raw responses are omitted. **The projection is not yet persisted.** Existing completed-score schema and production policy are unchanged. Do not append new fields to strict legacy score records without a compatibility design.

Additional reproduced defects are fixed: Context Gap's text clue no longer prints the missing target, and Sushi's displayed token order is deterministically scrambled. Sushi accepts interchangeable identical printed tokens and sentences longer than six pieces. Mixed-tier rotation no longer permanently skips the slot replaced to include the other tier. Context Gap enables controls only when its scene accepts answers and exposes buttons on coarse-pointer tablets. The shared game surface restores readable heading contrast. Embedded completion stays open when child context is missing and retries the same completion after context returns. Spirit Realm's new Context/Sushi adapters remain “Coming soon” until full warmup behavior is verified; this slice does not introduce a second mastery policy.

### Verified local evidence

- Branch: `codex/stage-b-game-policy`; Stage B review base `3491041` (do not mix in the already published A3.3 work). Runtime candidate `33c5efbb2729bd10f6356f40c3ba04188a88ff5c`; test-only follow-up `9807032a7f08f4236bd08afae830608e43d2a2ef`. Only `tests/family-sync/gamePolicy.spec.ts` changed between these two revisions.
- **832/832 unit tests**, including 11 new all-grade selection/content/rotation/scoring regressions. Typecheck, lint, repository format check and focused formatting of the new policy/review/catalog-support/test files passed. Production build/performance: **549,999/550,000 initial JS bytes; 42,745/60,000 CSS**. Production dependency audit: **0 vulnerabilities**; tooling audit: the documented 11 firebase-tools-only exceptions, expiring November 4, 2026.
- **8/8 reported-fix regressions** passed against the rebuilt reconciliation output: Grade 5 loading protection, Grade 2 September 21 reading targets, Kindergarten earlier targets, whole-set reentry, all-grade Spirit Realm and the unfinished Shadow Strike state.
- The exact `33c5efb` family package ran **84 desktop/tablet checks: 83 passed, one failed**. All saving/navigation cases and all desktop policy play-throughs passed. The remaining Grade 5 Context Gap tablet failure was isolated to a test-tool side effect: before full-page capture, the frame reported `pointer: coarse = true`, `maxTouchPoints = 1`, and visible controls; immediately after capture, it reported `false`, `0`, and hidden controls. No app change was made to conceal this finding.
- The test-only correction removes mid-journey full-page capture on tablets and uses actual tap events for game answers. Its exact `9807032` package passed **16/16 tablet policy cases**, covering all three grades, four complete game rounds per grade, both menus and embedded missing-context retry. This is a targeted rerun, not a claim that all 84 cases were rerun on the test-only revision.
- Earlier candidate `19fd1cb` had a separate five-second Grade 2 Context readiness timeout; the focused desktop/tablet and missing-context rerun passed **4/4**, and the later full matrix and actual-tap rerun both passed that Grade 2 case. Keep this timing observation for review and eventual physical-device checking; its cause was not conclusively established.
- Desktop Shuriken/Sushi and tablet Context images were inspected for the surface contrast repair. Browser emulation and synthetic audio are not physical iMac/iPad sound, microphone or performance acceptance.

Both manifests' **140 file hashes** were recomputed and matched:

| Candidate | Artifact tree SHA-256 | Local package |
| --- | --- | --- |
| Runtime `33c5efb` | `7d5127a4e0c6f9fdb03b2294d72ca27f17355ee4a8ea1b9a107e58728dc22335` | `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-wImjdc` |
| Test correction `9807032` | `739ce60087bdb78bf617389b51148009198a9e36abbade59cebd547bfbabc6fc` | `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-XdvL2M` |

No source has been pushed or merged, and no Stage B build has been published. Production policy, authentication and child records are unchanged. Tests use intercepted synthetic families. Durable game checkpoints, per-target persistence and cross-device coverage remain incomplete, so this is **central-policy review readiness, not release or smoke-test readiness**.

### Central-policy review repair

The review of `3491041..9807032` reproduced one actionable failure: `PreviewLearningHub` read the result ledger without guarding render failures. An unreadable synthetic score entry introduced before completion removed the open game after the save-error rerender in all three grades. Kindergarten and Grade 5 became blank; Grade 2 showed its application reload fallback. Existing records were preserved, but the game's in-memory completion and retry were lost.

Repair `48fd4888036dbd26826139f793c41b65c8985b4d` reads history once behind a guard, retains the active game and completion retry, disables fresh ready-game rounds when history is unverified, and checks history again when launching from an already rendered menu. A user-controlled history recheck restores availability after recovery without changing stored records. Later-stage activities retain their “Coming soon” state.

Verification passed **832/832 unit tests**, typecheck, lint, repository format and focused test formatting, build/performance (**549,999/550,000 initial JS bytes; 42,745/60,000 CSS**), production audit (**0 vulnerabilities**) and the existing tooling exception (**11 firebase-tools findings**, expires November 4, 2026). The exact package passed **20/20 embedded browser cases** across desktop/tablet and all three grades: preserved completion and one saved attempt after recovery (6), blocked stale-menu launches and history recheck (6), ordinary four-game menus (6), and the existing missing-child-context completion/retry (2). Tests restore only their deliberately injected synthetic fault, never real family history. The broader four-game play-through suite was not rerun for this guarded-history repair.

All **140 files** matched the package manifest. Source: `48fd4888036dbd26826139f793c41b65c8985b4d`; tree: `640acae60930bdfa62e1412c15d0b5526f87bbbb94d8c406bd0d3691f31ccbf5`; local package: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-yQ9YJI`. Browser log: `/private/tmp/ninja-stage-b-history-repair-browser.log`. This repair remains local; no production publication or smoke-test handoff occurred.

**Central-policy re-review passed for `3491041..48fd488`, with no additional actionable findings.** The review checked render and launch guards, preservation of the active pack/session and completion retry, unchanged immutable-result semantics, surrounding tier/source/rotation/scoring contracts, and the regression assertions. All **11 policy tests** were rerun and passed. The recorded **20/20 browser results** and **140 artifact hashes** were independently verified; the full unit/browser suites were not rerun during this read-only code review. Durable checkpoints, cross-device coverage and per-target storage remain the next planned slice, and the earlier Context readiness timing observation remains in the release evidence. Passing this bounded review does not complete Stage B or its release gate.

Remaining gates in order:

1. GPT-6 Astra · Extra High design/implementation of compatible per-target result storage, cross-device coverage and durable game checkpoints. The owner confirmed this assignment October 9; continue without another model prompt. Keep legacy aggregates immutable and privacy-safe. Prepare and emulator-test any concrete additive production-policy proposal; obtain separate approval before applying it.
2. Exact-package offline/retry/reload/second-browser and guarded rollback evidence, followed by the roadmap's release review. Publish only when that game's complete acceptance gate passes; do not send the owner to the old live build to test these changes. Shadow Strike and acquisition-game work remain later stages.

## Stage B persistence foundation (local)

October 9: the owner selected Astra · Extra High for this same Stage B persistence slice. This is a storage/protocol implementation, **not an activated game feature or a completed Stage B release**.

- `src/ninjaSkills/progress.ts` defines versioned pinned packs, prompt/target counts, reviewed timestamps, cleared prompts, Shuriken remaining time/retry cycle and distinct continuation identities. Answer correctness is checked in memory before projecting reviewed facts. Unfinished selections and response strings are never copied. Completion includes the old aggregate shape, detailed targets, reinforcement phase and the pinned policy/curriculum. Completed checkpoints cannot be forked to manufacture another score.
- `progressStore.ts` uses a separate family-scoped namespace, confirmed writes, stale-snapshot checks, immutable completion copies and a recoverable outbox-first completion sequence. Limits are 200,000 bytes per record, 64 checkpoints and 500 distinct completions per child; hitting a limit preserves data. Browser callers must use `createLockedGameProgressStore`, whose family-scoped Web Lock serializes writes and rechecks current ownership inside the lock. The synchronous core is for serialized callers/tests only: localStorage alone is not an atomic cross-tab compare-and-swap. Unsupported locking fails closed. The locked adapter is implemented but not connected to game screens.
- `progressSync.ts` is an injected-backend coordinator, **not a Firestore transport**. It confirms queued completions before checkpoint work, guards ownership after awaits, avoids overwriting a newer local answer or an open game, and requires matching immutable detail before downloading a completed checkpoint. Whole-snapshot conflicts use reviewed-answer time with the existing future-skew limit; equal-time same-writer updates use revision ordering. Two never-reviewed starts resolve deterministically without losing an answer; competing untrusted future-dated answers fail closed. Backend version preconditions/readback are a required adapter contract, not yet real-backend evidence.
- Saved JSON object order is now irrelevant to pack validation; array/target order remains significant. This fixes the reload rejection reproduced by serializing the pinned pack. Game serialization stays separate from the protected acquisition persistence boundary.

The focused data-layer suite covers all twelve grade/game combinations, interrupted completion writes, immutable duplicates, two completed continuations, false assessments, out-of-order prompts, wrong Context answers, timer/retry semantics, record/count bounds, malformed records, missing source provenance, foreign-family isolation, legacy namespace non-interference, offline retry, owner changes and answers arriving during a network wait. Serialized competing-tab writes and opening a game while hydration waits for the write lock are also covered. These tests use synthetic storage, an injected lock and an injected remote, not live accounts or real recordings.

Remaining implementation within this slice:

1. Connect the locked browser store, all four module adapters and both menus; await confirmed saving before advancing, resume reviewed prompts after reload, and keep provisional material temporary. Finish discard/new-run transitions without retiring scores. Add real browser concurrency tests for the native lock; injected-lock tests alone are not that evidence.
2. A concrete bounded Firestore transport and additive policy proposal, emulator-tested for ownership, immutable details, conditional checkpoint writes, and old-client compatibility. No policy or security settings have been changed.
3. Integrate immutable details with the existing aggregate outbox/graph, bounded history pagination and fresh-device subset coverage. Do not claim recent 50-score history proves lifetime coverage.
4. Add the new namespace to the existing privacy-safe device-export allowlist before activation; the current exporter intentionally does not dump arbitrary browser storage. Then complete exact-package cross-device/offline/rollback evidence, independent Astra Extra High review and publication verification before owner smoke testing.

No code here starts a later roadmap stage. The live source remains `e9c5a54`.

Local verification: **857/857 unit tests**, including **25 game-progress cases**, typecheck, lint, repository/focused formatting and build/performance passed. Budgets remain **549,999/550,000 initial JS bytes and 42,745/60,000 CSS bytes**. Production dependencies have **0 reported vulnerabilities**; the existing tooling exception remains **11 firebase-tools findings**, expiring November 4, 2026. No dependency or production policy was changed. Unit/build logs are `/private/tmp/ninja-stage-b-progress-unit.log` and `/private/tmp/ninja-stage-b-progress-build.log`. These results do not establish native browser locking, real Firestore transport, complete history coverage or live game resume.

The existing game runtime/scoring integration passed **44/44 exact-package browser checks** (all four games, all three grades, desktop and tablet-touch, plus embedded history-failure/retry cases) at source **`fd862d67ca8ccef30fd2447c453692656184db43`**. All **140 manifest files** matched their hashes; tree **`440fa7714c0dcfde870acc29aa0ff275a78b064cead659d34eee4f657a97a842`**, package `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-n8QT5I`, log `/private/tmp/ninja-stage-b-progress-browser.log`. Subsequent foundation changes added stricter provenance validation, the locked-store adapter and tests/documentation; those modules were not imported by game screens at that checkpoint. They were covered by the 857-test/unit and build gates, **not represented as browser-tested persistence integration**. No push, merge, deployment, security change or child-data change occurred.

## Stage B Lanterns screen integration (local)

October 9 continuation, same confirmed Astra · Extra High slice. Runtime source `259d38e66394f429f619dc89f4545670ceebf440` connects Memory Lanterns in both menus to one family-owned adapter. The generic reusable game retains optional persistence callbacks; family/account logic stays outside the module.

- Reviewed turns must save before the board advances. A failed write keeps the exact pending candidate and shows an explicit retry, without allowing replacement answers. Provisional flips stay in memory only.
- Reload/reentry restores pinned content, matched pairs and all reviewed error counts. Completed summaries use stored reviewed counters, never fabricated historical answer strings. Interrupted outbox-first completion writes recover their original ID/time before play resumes.
- A frame-specific family/child/week owner is rechecked inside the native write lock. Stale snapshots cannot overwrite or discard another tab's reviewed turn. Explicit discard removes only the owned checkpoint; immutable detailed results remain.
- The existing graph/outbox receives the exact validated aggregate from the detailed completion. Duplicate retries preserve ID/time and one graph point. Detailed outbox entries remain pending: aggregate uploading is **not** confirmation of cloud detail storage.
- Device export now includes the game namespace. Unknown/damaged scoped data remains preserved, while unrelated authentication storage is excluded.
- A small consolidation in `savePreviewResult` keeps new-result outbox-first semantics and existing-result retry semantics while avoiding duplicated save/confirm code. The page-size gate remains unchanged.

Local gates: **863/863 unit tests**, typecheck, lint, repository/focused formatting, build/performance (**549,990/550,000 initial JS; 42,745/60,000 CSS**), zero production vulnerabilities and the existing 11-finding firebase-tools exception. All **141 package hashes** match source `259d38e`, tree `b31ec9299903630819b918cb0518a97748c1bcd057ac1f287ded95fb0a975293`, at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-Xz6z4X`.

Browser evidence covers **90 distinct cases**, not a single 90-case invocation:

- The broad desktop/tablet policy/progress/saving run passed **77/84** in 17.9 minutes. Seven desktop assertions had obsolete test assumptions: three-pair Kindergarten setup, an ambiguous audio-versus-storage alert selector, synchronous completion despite the new native-lock boundary, and old exact error wording. They were not waived.
- Corrected progress tests passed **12/12**, covering all three grades on desktop and touch: reviewed mistakes and pairs survive reload from the outer menu to the embedded menu, per-target completion totals match the immutable aggregate, failed storage holds the turn for retry, and reporting pauses/resumes the activity.
- The affected alias/child-context/readback saving cases passed **6/6** with explicit waits for confirmed asynchronous completion and preserved failure/retry assertions.
- Additional native two-tab locking and explicit-discard checks passed **4/4**; offline completion/reconnect checks passed **2/2**. Competing-tab fixtures use one shared synthetic remote database. The detailed outbox remains queued after aggregate acknowledgement, as required while its real transport is unfinished.

All reruns used the **same unchanged `259d38e` runtime package**. Only test fixtures/selectors and evidence documentation changed afterward. Logs: `/private/tmp/ninja-stage-b-lantern-browser.log`, `/private/tmp/ninja-stage-b-lantern-progress-fixed.log`, `/private/tmp/ninja-stage-b-lantern-saving-fixed.log`, `/private/tmp/ninja-stage-b-lantern-ownership.log`, and `/private/tmp/ninja-stage-b-lantern-offline.log`. These are intercepted synthetic browser tests, not live database, Safari, real microphone or physical-device verification.

At this Lanterns checkpoint, the remaining adapters were Shuriken/Context/Sushi. The next local implementation below connects Context and Sushi; the other release gates remain open. No production rules/authentication, real child data, push, merge or publication has changed. No owner smoke-test handoff is ready.

## Stage B Sushi and Context screen integration (local)

The same owner-confirmed GPT-6 Astra · Extra High persistence slice continues. Source inspection confirmed both modules previously kept their reviewed turns only in component/scene memory and did not receive a durable review callback from either family menu.

- `SavedLearningGame` generalizes the existing Lanterns adapter without moving family/account dependencies into the reusable games. Both menus use the same pinned checkpoint, native family lock, immutable detailed completion and unchanged aggregate-result bridge. The outer-frame completion still distinguishes launch identity from the restored saved attempt ID.
- Sushi initializes its sentence position and counters from reviewed progress. It awaits confirmed storage before feedback/advancement; a failed turn holds the plate, blocks editing, and retries the same candidate. Reopening discards an unfinished plate, not reviewed mistakes or completed sentences.
- Context initializes the route, reviewed correctness, counts and streak display from the saved reviewed gates. A wrong reviewed answer advances exactly once, as its existing game rules require. All gate inputs stay locked while a save is pending or failed; retry cannot substitute another answer. Confirmed feedback/movement is queued on the activity clock, so a save finishing during reporting does not resume the scene. A restored completed route retains its original detailed result until aggregate delivery succeeds.
- All three modules remain individually lazy-loaded, preserving the standalone host's on-demand code/style loading rather than loading unrelated game styles eagerly. The parent discard loading guard covers all three connected games. No raw response, unfinished token order, recording or handwriting is persisted.

Runtime checkpoints: Sushi `7ef85dc`; Sushi plus Context `7a0cbc014b799163b98d527b1c0b0a324004b3dc`; final on-demand loading `b3f4d86a87406c0100860f4d60f63c68a4ce96b1`. The final package is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-SNbzov`, with all **143 file hashes verified**, tree `35962d5e527ff15c7b41db7b0359a05269a417eb75cf31793595a9c026cfe959`. The earlier combined package is `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-l3L0NL`, with all **140 file hashes verified**, tree `977768b127d30d804b17d7ea372d102e6c048c80e33017fee98d6f15a7470d32`.

Unit tests pass **863/863** on the final runtime; typecheck, lint, format and build/performance pass (**549,990/550,000 initial JS; 42,745/60,000 CSS**). Production dependency audit reports zero vulnerabilities; the unchanged 11-finding development-tooling exception remains limited to `firebase-tools` through November 4. No dependencies or policies changed.

Packaged browser evidence (synthetic families only; not publication):

- `7ef85dc`: **24/24** Sushi/Lantern progress tests across all three grades and desktop/touch passed (`/private/tmp/ninja-stage-b-sushi-browser.log`).
- `7a0cbc0`: Context's 12-case cross-grade desktop/touch run passed **10/12**; the two failures used a five-second assertion for an existing route animation. Aligning it with the existing policy suite's ten-second allowance resolved both: Grade 2 desktop in the **8/8** final-adapter run (which also covered Grade 2 touch and six Grade 5 normal-motion game-policy cases), and Grade 5 touch **1/1**. Thus all 12 Context scenarios are covered, not claimed as a single clean 12-case run. Logs: `/private/tmp/ninja-stage-b-context-browser-fixed.log`, `/private/tmp/ninja-stage-b-adapters-final.log`, `/private/tmp/ninja-stage-b-context-touch-final.log`.
- `7a0cbc0`: **2/2** native-lock/report-pause checks passed after correcting an `innerText` versus `textContent` assertion mismatch (`/private/tmp/ninja-stage-b-context-pause-fixed.log`). The initial attempt to use a second loopback port was blocked by the test fixture, not the application; the tests now explicitly allow their configured loopback origin while continuing to intercept all external requests.
- Final `b3f4d86`: **8/8** checks passed, covering all three connected games' Grade 5 completion/policy behavior and pending-save/report pause on desktop and touch (`/private/tmp/ninja-stage-b-loading-browser.log`). Earlier cross-grade matrices above remain attributed to their exact source revisions; the final change only isolates module loading. These checks do not replace independent review, real-backend/emulator evidence, rollback or owner device testing after publication.

Remaining in this same stage: Shuriken's timer-aware adapter; discoverable saved games when current curriculum cannot launch a new pack; explicit offline cold-start coverage and resumed-source reporting; real backend and additive policy/emulator proposal, including cross-device discard semantics; bounded cloud history/subset coverage and acknowledged-detail cache handling; broader rollback evidence and independent release review. A 1280px desktop capture also showed Context's right-side scene/replay area clipped inside the family frame; confirm responsive layout/scrolling before declaring student readiness. This visual observation is not a persistence failure or a verified root cause. This is local-only implementation: A3.3 `e9c5a54` remains the last verified live source, and owner smoke testing is premature.

## Stage B Shuriken screen integration (local)

This continues the owner-confirmed GPT-6 Astra · Extra High persistence slice. The Shuriken adapter listed as unfinished above is now locally connected in both family menus; the other Stage B release gates remain open.

- `gameSession` serializes answer, timer and expired-round restart transitions with one retained candidate. Partial writes retry the identical candidate; neither a new answer nor another timer tick can replace it. Timer-only writes do not change the reviewed-answer timestamp used for unfinished conflicts. Completion remains immutable and uses the existing aggregate bridge.
- Shuriken restores its pinned target pack, reviewed counts, cleared pairs and remaining clock. Each displayed whole-second decrement follows confirmed saving. Failed storage locks game inputs and stops further countdown writes until retry. Expired missions restart only after the reset saves; reviewed counts survive every retry cycle, including previously cleared targets, so final per-target detail and the graph agree.
- Report/navigation pauses use the existing activity clock. A confirmed answer waits to show feedback when reporting is open. The saving status reserves its layout space so periodic writes do not move the board under a click. Native-write-lock and injected-failure tests cover both timer and answer operations.
- Deliberate limits: the clock resumes at its last confirmed whole second, not subsecond precision; pending card selection and raw answers are not persisted. Cosmetic stealth streaks restart each visit and are labelled accordingly. Account ownership, bounds and exact-write comparisons remain enforced by the shared store. Game-detail cloud transport is still absent and the screen says so.

Runtime source: `76740f3ad6e7b5d642746970a07860b1937ab64d`. Exact Shuriken test package: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-Qvy8eK`; all **143 file hashes verified**, tree `bcb979cd81e17a597b76356b3b6a2f22fbe5ab136c814859d8cb2c69d71b5d1f`.

Verification: **866/866 unit tests**, including three additional timer/session safety cases; typecheck, lint, repository and targeted formatting, build/performance (**549,990/550,000 initial JS; 42,745/60,000 CSS**); production dependency audit zero vulnerabilities; unchanged 11-finding firebase-tools exception through November 4. No dependency or security-policy changes.

Browser evidence, synthetic families only:

- Initial `59fdd20` matrix: **11/12 passed**. Grade 2 desktop exposed board movement while the new timer-saving message appeared/disappeared. Runtime `76740f3` reserves status space, and regression assertions now confirm each intended card selection and match.
- Final `76740f3`: **20/20 passed** in one desktop/touch run, covering normal Shuriken policy/completion for all grades, both-menu reloads, incorrect reviews, report-paused countdowns, expiry/restart, exact cumulative detailed/aggregate results, timer failure/retry, and an answer whose save confirms while reporting remains open. Log: `/private/tmp/ninja-shuriken-browser-final.log`.
- Additional shared-game regressions: **8/8 passed** with a separately managed server, covering Grade 5 Lanterns/Sushi/Context completion and Context's delayed-save/report pause on desktop and touch (`/private/tmp/ninja-shuriken-other-games-final.log`). The package at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-NKAC36` has the same runtime revision and tree hash as the Shuriken package; all 143 hashes were checked again. A preliminary shared-server attempt passed 3/8 before the Shuriken runner shut down that server; its five connection-refused failures were infrastructure results and prompted this clean managed-server rerun. These eight passes are separate from the 20/20 count, not physical-device or live-backend acceptance.

Next: concrete backend/discovery and additive emulator-tested policy proposal, including discard semantics that cannot resurrect abandoned checkpoints; bounded remote history/coverage and acknowledged-detail cache behavior; offline cold-start/resumed-source evidence; the recorded Context layout repair; rollback and independent persistence/release review. No production publication, push, merge, security/authentication change or real-child record change has occurred. A3.3 `e9c5a54` remains live. This is not an owner smoke-test handoff.

## Stage B cross-device persistence candidate (local)

The owner-confirmed GPT-6 Astra · Extra High persistence slice is implemented at application source `9880e8a4b6782b986d4a5ddd3d607276dfb6cd1d`. It is still local and unpublished. The additive Firestore policy is a tested proposal, not an active production policy.

- `gameCloud.ts` provides a bounded parent-authenticated REST transport for checkpoints, immutable per-target completions and immutable retirement records. Every conditional write is confirmed by exact authorized readback. Records are scoped to one family child, exclude raw responses, recordings and handwriting images, and reject oversized or malformed provider data.
- Retirement is permanent for a specific run. A discarded run cannot upload again or return from a stale device; immutable completed attempts are never retired. Two completed scores remain separate graph data points. Only competing unfinished checkpoints use the newest trusted reviewed-answer time.
- `gameHistory.ts` stages bounded pages before changing device state, discovers saved scopes across devices and caches acknowledged immutable completions. The family runtime synchronizes ordinary practice first, then game history, while preserving open-game ownership and local work on any failure.
- Both family menus discover unfinished and completed-but-undelivered games even when the current teacher snapshot cannot create a fresh round. Reopening uses the pinned week, targets, support content and policy. Offline cold start reports the saved source accurately and continues locally until reconnect.
- Shuriken queues at most two distinct rapid taps while its timer or prior answer finishes saving, then replays them in order against the next rendered board. A failed write still blocks advancement and retains the exact retry.

Verification against the exact `9880e8a` package:

- **874/874 unit tests**, typecheck, lint, repository format, production build and performance passed. Initial JavaScript is **549,990/550,000 bytes** and CSS is **42,745/60,000 bytes**.
- Production dependency audit reports **0 vulnerabilities**. The unchanged firebase-tools-only exception contains 11 development-tool findings and expires November 4, 2026.
- The separate root hardening-policy suite passes **16 applicable emulator tests with one candidate-only skip**. The explicit family-sync candidate suite passes **17/17**, including cross-family denial, conditional checkpoint updates, immutable completion, forbidden private payloads and permanent retirement. `npm run test:firestore` and `npm run test:firestore:family-sync` deliberately identify which policy they exercise.
- The packaged desktop/tablet matrix passes **134/134**: Context 12, Lanterns 12, ownership/discard 8, Shuriken 14, Sushi 12, shared saving 32 and central policy 44. It covers all three grades, both menus, offline cold start, reconnect delivery, second-device resume/discard, failed-write retry, report pause and rapid Shuriken input.
- All **145 package files** match their manifest. Package: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-0iug0N`; tree SHA-256: `8eca7919de64929e6ce038b5475e0cbbbe0bf1b49a475343c1ca5b8545163e70`.

Remaining gates at that checkpoint were the independent persistence review, bounded repair and verification of the recorded Context frame clipping, guarded predecessor/candidate rollback evidence, and explicit approval before any policy deployment, merge, push or publication. The review result and repairs are recorded below. Real-child records, authentication and production security were untouched. A3.3 `e9c5a54` remains the verified live source, so owner smoke testing is still premature.

### Persistence review repair

The independent GPT-6 Astra · Extra High persistence review found one release-blocking data-lifecycle defect: the first candidate kept only one unsynced retirement for each child/week/game scope. Discarding a second offline run could overwrite the first retirement and allow a stale device to revive the older run. Commit `11c6689` stores each retirement by scope and run, synchronizes every retained retirement, and keeps completed attempts immutable. The same repair ensures that a checkpoint left behind by an interrupted discard cannot block a fresh run and preserves compatibility with the earlier one-retirement preview format. The student-facing status now accurately says reviewed turns sync through the parent family account when connected.

Final repaired evidence:

- **877/877 unit tests**, including multiple offline discards, interrupted-discard recovery and earlier-format acknowledgement.
- **134/134 exact-package desktop/tablet checks** across Context, Lanterns, ownership/discard, Shuriken, Sushi, shared saving and central policy.
- Separate root hardening proposal: **16 applicable emulator checks passed**, with the Stage B-only collection case intentionally skipped. Candidate additive policy: **17/17 passed**.
- Typecheck, lint, format, build/performance (**549,990/550,000 initial JavaScript; 42,745/60,000 CSS**), production audit (**0 vulnerabilities**) and the existing time-bounded firebase-tools-only exception passed.
- All **145 manifest files** match source `11c66897c073d475211c6db9c3b8da7df64f2936`; tree `b7edcefb2f14ef545e1f491002c1ed8498f40a91dc8d32d742494006b886127e`; exact tested package `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-Mozinl`.

The persistence review has no remaining actionable finding. The next bounded implementation slice was the recorded Context family-frame clipping repair using GPT-6.1 Sol · High. Its result and the guarded predecessor/candidate evidence are recorded below. No push, merge, deployment, production-policy change or child-data action occurred; the live source remains A3.3 `e9c5a54`, so smoke testing is premature.

### Context containment and guarded rollback gate

The desktop reproduction showed the Context scene reaching 1,338px inside a 1,256px iframe viewport for Kindergarten, Grade 2 and Grade 5; tablet layouts stayed contained. Commit `f26849d` keeps the intended wide game card but centers it inside the family frame. The final exact-package Context matrix passes **18/18** across all three grades and desktop/tablet: scene and replay controls stay within the viewport without horizontal overflow, reviewed mistakes and completed gates reload, and failed writes retain an exact retry.

The rollback review found that the older-engine guard recognized newer lesson records but not the new `family-beta-games-v1` namespace. Commit `768f8cb` recognizes that namespace before the older application can read credentials or write storage. Its unit coverage proves the guard's no-read/no-write contract directly. The browser rehearsal used the actual published predecessor, reconstructed read-only from `https://ninjadojo.meghangames.com`; all **138 predecessor files** match published tree `67008aacbc2946151a661f2212b7fc47725edd2bdbf4398e26dd009b17a57e6d`.

The final predecessor/candidate rehearsal passes **4/4** on desktop and tablet. The ordinary path upgrades A3.3 Grade 2 records, activates the guarded older engine, confirms every record is unchanged offline, then restores the Stage B candidate and resumes the original lesson. The Stage B-specific path retains only a reviewed `family-beta-games-v1` Lantern checkpoint, confirms the older engine reads no credential and writes no storage, then restores the candidate and resumes the matched pair. Test-only commits `d141185`, `c92ce9a`, `1022ec5` and `ba9abcd` align the status assertion, bound service-worker activation, add the game-only proof and recognize a legitimately dormant worker process; they do not change application behavior.

Final Sol-stage evidence at `ba9abcd4e4dbf7355d9b60f2375b1badcf980c78`:

- **878/878 unit tests**; typecheck, lint and format pass.
- **134/134** previously recorded broad game desktop/tablet checks, plus the final **18/18 Context** and **4/4 guarded rollback** matrices.
- Separate root hardening proposal: **16 applicable checks**, with one intentional Stage B-only skip. Additive candidate policy: **17/17**.
- Build/performance passes at **549,990/550,000 initial JavaScript bytes** and **42,745/60,000 CSS bytes**. Production audit reports **0 vulnerabilities**; the documented firebase-tools-only exception remains 11 findings and expires November 4, 2026.
- All **145 files** match the current candidate manifest. Tree SHA-256: `8944b978a756e8f84c1d80b8e314e9dfcc384b7116b98bea8eebabd100f5f77c`; exact package: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-XrlM3g`.

The bounded Sol implementation and rollback gate are complete. The next required gate is the independent GPT-6 Astra · Extra High cross-grade release review. The additive Firestore policy remains a proposal and needs separate explicit approval before production application; application publication also remains separately gated. No push, merge, deployment, production-policy change or child-data action occurred. A3.3 `e9c5a54` remains live, so owner smoke testing is premature.


### Final release review repairs

The final review of `ba9abcd` reproduced two cross-device discard failures and found that the proposed game policy also tightened existing lesson rules. Local repair `9f0ac7567ab6039a27f0069c2871fa6be2e1aebc` addresses those findings; the repaired candidate subsequently passed the GPT-6 Astra · Extra High re-review recorded below. Earlier uses of “additive” for the pre-repair candidate were inaccurate. Root `firestore.rules` is a separate hardening proposal, not evidence of the deployed family policy.

- Independent discards of the same scope/run now converge on the first immutable server retirement even when writer and timestamp differ. Checkpoint/completion confirmations remain exact; wrong scope/run retirements are rejected and remain queued. A regression verifies the second device can subsequently sync a fresh run.
- Applying a remote retirement rechecks both the expected checkpoint and the open-game/owner guard inside the storage lock. Opening a game, recording a newer answer, or changing account while waiting cannot remove that checkpoint.
- The candidate policy now adds only the game helper functions and three game collections. A permanent boundary test removes those additions and requires the exact published A3.3 policy SHA-256 `335b19cf431bb726ac9dcd74c9fa5fc11a8fbcb709f5fed4b3482cce1f4d1ded`. Unrelated lesson hardening remains outside this release. Its emulator assertions run separately against root `firestore.rules`, not against the production-based game proposal.

The new transport, convergence, and locked-retirement regressions failed before implementation (three reproduced failures) and pass after repair. No production records, authentication, or active rules were changed. No owner smoke testing is ready; publication and production-policy changes still require separate explicit approval.

Verification at repaired source `9f0ac75`:

- **20/20 exact-package desktop/tablet browser checks** pass across all three grades: both-menu Lantern reload/completion, failed-save retry, native competing-tab locks, explicit discard, offline cold-start recovery, and graph/detail delivery after reconnect. These synthetic checks do not establish physical-device audio or touch quality and are not an owner smoke-test handoff.
- Node **24.21.0**: **882/882 unit tests**, typecheck, lint, configured format check and build/performance pass. Initial bundles remain **549,990/550,000 JavaScript bytes** and **42,745/60,000 CSS bytes**.
- Production-based Stage B policy: **17 passed, one explicit hardening-only skip**. Separate root hardening proposal: **17 passed, one explicit game-only skip**. Both emulator runs passed on Node 24; neither run deploys policy. The game emulator regression uses independent REST clients and confirms differing discard writer/timestamp values retain the first server record.
- Production dependency audit: **zero vulnerabilities**. The existing development-tool exception remains **11 firebase-tools findings**, expiring November 4, 2026.
- All **145 packaged file sizes and hashes** independently match the manifest for source `9f0ac7567ab6039a27f0069c2871fa6be2e1aebc`. Artifact tree: `b03619a50a957669fe5901e49a52df3def36add8ab186f23fa777bacc97290f4`; local package: `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-dvzguk`. The browser harness packaged this candidate using the host Node 26.8.1; the required Node 24 unit/build/emulator checks were rerun separately.

Evidence logs: `/tmp/ninja-stage-b-repair-red.log`, `/tmp/ninja-stage-b-repair-focused.log`, `/tmp/ninja-stage-b-repair-node24-unit.log`, `/tmp/ninja-stage-b-repair-node24-policy.log`, `/tmp/ninja-stage-b-repair-node24-root.log`, and `/tmp/ninja-stage-b-repair-browser.log`. The earlier broad 134-case game matrix and guarded predecessor rollback evidence remain attached to their recorded revisions; they are not represented as rerun for this repair.


### Release rereview verdict

October 9, 2026 (Pacific): **re-review of application candidate `9f0ac7567ab6039a27f0069c2871fa6be2e1aebc` passed with no remaining actionable findings in the repaired scope.** The review checked the repair diff and surrounding transport, owner checks, write-lock handling, immutable completions, retirement acknowledgements, and policy compatibility. Different discard timestamps/writers can confirm only the same validated scope/run; checkpoint and completion readbacks remain exact. Local removal checks run inside the lock and preserve a newly opened or changed checkpoint.

Fresh verification on Node 24.21.0 passed **67/67 focused tests** and **17 applicable production-based candidate-policy emulator checks**, with one deliberate skip for the separate lesson-hardening proposal. The exact artifact inventory, all **145 file sizes/hashes**, tree hash, and source identity were verified again. Removing only the game additions reproduces the complete `3491041` published policy byte-for-byte. Reviewed game-policy SHA-256: `ff108665b7c2b0fed1c8f476fcac0b5c4ed4b334cc3f71d630cae770491dd3c0`. Logs: `/tmp/ninja-stage-b-rereview-tests.log` and `/tmp/ninja-stage-b-rereview-policy.log`.

The recorded 882-unit, 20-browser, build/performance and dependency results remain evidence from the repair turn; those full suites were not rerun during this bounded re-review. Earlier broad game and rollback matrices retain their recorded revisions. Physical-device audio/touch and live serving are not established by this review.

No application code, active policy, authentication, child records, push, merge, or publication changed during re-review. The remaining gate is explicit approval for the narrow production-policy addition, followed by the existing source-integration and per-grade publication gates. Recheck the active policy against the recorded production baseline before applying it. Use GPT-6 Astra · Extra High for that security-sensitive step and GPT-6.1 Sol · High for bounded release packaging/verification. No owner smoke testing until a reviewed release is published and its exact canonical links are verified.

### Game policy publication

October 10, 2026 (Pacific): the owner approved the game-only database-policy step with “proceed” following the passing re-review and explicit policy approval request. That approval did not include app publication, source push/merge, authentication changes, or child-record writes.

Before publication, the complete active policy matched the reviewed A3.3 baseline SHA-256 `335b19cf431bb726ac9dcd74c9fa5fc11a8fbcb709f5fed4b3482cce1f4d1ded`, ruleset `ddf78a15-4d99-47e1-bebf-68b0d57a8929`. The candidate matched reviewed SHA-256 `ff108665b7c2b0fed1c8f476fcac0b5c4ed4b334cc3f71d630cae770491dd3c0`. Fresh Node 24.21.0 verification passed the exact additive-policy boundary test and **17 applicable emulator tests**, with one deliberate skip for the separate lesson-hardening proposal.

The repository-pinned Firebase CLI 15.32.1 published **Firestore rules only** to project `weeklydictationapp`, using an isolated configuration pointing explicitly to `deployment/firestore-family-sync.rules`. Root `firestore.rules`, hosting, indexes, and authentication configuration were not deployed.

- Active release: `projects/weeklydictationapp/releases/cloud.firestore`.
- New ruleset: `projects/weeklydictationapp/rulesets/07e55d6a-e6be-4672-8a50-af50975976e0`.
- Provider release time: `2026-10-10T13:10:25.259170Z`, October 10 at 6:10 a.m. Pacific.
- Post-publication readback confirmed the entire active rules source equals the reviewed candidate byte-for-byte and has the SHA-256 above.
- The previous ruleset remains available. Reverting it would reject Stage B game writes; retaining it is recovery evidence, not an instruction to roll back during normal app recovery.
- The canonical live manifest still reports app source `e9c5a547031c65c00cce45616ec581bcec111ac7`, tree `67008aacbc2946151a661f2212b7fc47725edd2bdbf4398e26dd009b17a57e6d`.

No production child records were read or written, and no app deployment, push, merge, or authentication change occurred. Verification establishes active policy identity plus local emulator behavior, not live end-to-end game syncing. That acceptance belongs to the separately approved application release. **No owner smoke testing yet.** Next: GPT-6.1 Sol · High for bounded source-integration/release preparation and verification, preserving separate push/merge and per-grade publication approvals.
