# Stage B release preparation

Prepared October 10, 2026 (Pacific). **The four-game application package is prepared locally and the approved push/PR is complete; merge and app publication remain pending approval.** The game-only database policy is already active and verified. The canonical website still serves A3.3 `e9c5a54`.

## Release contents

Memory Lanterns uses Tier 2; Shuriken Match uses both tiers and validated meanings; Context Gap Dash and Sushi Scramble use Tier 1 with validated sentence support. Each tier selects its most recent earlier relevant teacher week. Validated subsets rotate with explicit coverage. Both game menus use the same policies and saved-game behavior.

Reviewed turns survive reload, offline continuation and family syncing. Completed attempts retain separate immutable graph points and per-target counts. Discarded runs retain immutable retirement records so stale devices cannot restore them. Reporting pauses the active game. Recordings, handwriting images and unfinished responses are excluded from game records.

Shadow Strike, Dictation Streak, Whispering Scrolls and Stroke Order Slay remain later roadmap stages. Missing validated prompt support can make an individual game unavailable for a selected week. Physical iMac/iPad audio, Safari behavior and touch quality still require a bounded owner check after publication.

## Source integration

The fetched `origin/main` is `b4056d6`, the PR #61 A3.2 release-evidence merge. It is an ancestor of the prepared branch, `codex/stage-b-game-policy`; there are no upstream-only commits or merge conflicts to resolve. At packaged source `7bfc8db`, the branch is 123 commits ahead. Those commits include the already published A3.3 reconciliation and the subsequent Stage B implementation/reviews, not 123 competing app versions.

The total difference from `main` at that source is 101 files, 9,262 additions and 496 deletions, including tests and release records. Compared with the currently published app source `e9c5a54`, it is 61 files, 6,363 additions and 328 deletions. Application source is unchanged from reviewed repair `9f0ac75`; subsequent commits change only `STATUS.md`, `ROADMAP.md` and the game readiness assessment.

With owner approval, the branch was pushed at `c7d8e62` and [integration PR #62](https://github.com/FionnbarZero/WeeklyDictationApp/pull/62) was opened against `main`. GitHub reports no base-branch conflicts. At that initial PR head, quality, builds and root-policy emulator checks passed; browser and canonical-family checks were still running at handoff. Check all five jobs on the final PR head before requesting merge approval. PR #52 is an older, separate Ninja Skills documentation PR and is not this release. Integrating the source does not itself publish the canonical app.

Integration PR title: **Integrate published A3.3 reliability work and reviewed Stage B games**.

Integration summary:

> Bring `main` forward from A3.2 to the already published A3.3 reliability work and the reviewed Stage B game candidate. Lanterns, Shuriken Match, Context Gap Dash and Sushi Scramble now follow the approved tier/content policy and preserve reviewed progress, immutable per-target completions and cross-device discard history. Both menus share these contracts; reporting pauses active play.
>
> The game-only database policy is already published with owner approval. Application publication remains separately gated for Kindergarten, Grade 2 and Grade 5. Preserve the recorded exact-package, emulator, browser and guarded recovery evidence; CI passing is not publication evidence. See the Stage B release preparation and game readiness assessment for artifact identities, verification and remaining limitations.

### Integration check repairs

#### Final merge-blocker repairs

The owner approved merging PR #62, but all five final-head jobs remain required. At `bd43d57`, four jobs passed; the canonical-family job passed 332 cases, failed two and skipped four. The following repairs address reproduced application defects rather than weakening assertions:

- **Legacy workspace:** Opening a bundled Grade 2 workspace normalized the writer's baseline only in memory. An unchanged initial save then deleted the physical bundle and skipped all equivalent partition writes. Captured synthetic storage transitions reproduced an empty workspace and the saved-edition crash. Commit `81a8870` normalizes the current physical snapshot before applying the writer's delta and validates existing partition reconstruction before any replacement. Three new unit regressions cover unchanged migration, a concurrent activity update and an unreadable partition. Original recovery keys remain unchanged; no real records were inspected or repaired.
- **Shuriken input:** Every countdown save disabled native card buttons, allowing input to be suppressed while a timer write was pending. A controlled storage-lock regression failed on the original game at the enabled-input assertion. Commit `4c56fb7` leaves timer-save inputs available for the existing bounded in-memory queue. Answer/restart writes, feedback, expiry and failed writes still freeze the board; no provisional choice is added to durable records. The regression passes six desktop/touch repetitions after repair. This reproduces the input hazard; the earlier CI failure had no retained trace, so its exact event timing is not asserted as proven. Failed family-browser traces are now uploaded by CI.

The final application candidate `4c56fb7da0092a22e0bfb5871a132c965b4ab3a1` passes:

- **64/64** repeated desktop/touch cases across both affected files, including all-grade Shuriken reporting, saving/retry, expiry/restart, reload and immutable completion; exact saved-edition reopening; and transient access-failure recovery. Log: `/tmp/ninja-pr62-repaired-browser.log`.
- **6/6** additional controlled timer-input repetitions, with exactly one reviewed answer after unlocking. Logs: `/tmp/ninja-pr62-shuriken-timer-before.log` and `/tmp/ninja-pr62-shuriken-timer-after.log`.
- **885/885** unit tests; typecheck, lint, configured formatting and both extended family checks; build/performance at **549,990/550,000 JS bytes** and **42,745/60,000 CSS bytes**; production audit with zero vulnerabilities and the documented tooling-only exception.
- **17** root-policy emulator passes with one intentional skip, and **nine** production-family-policy emulator passes. Production security rules are unchanged.

All **145 files**, sizes, SHA-256 values, complete inventory and manifest tree `6ddb16ebc15e7385a9d2ab688fa97eff5fd24b81f6e5a3899b832c2ba8a6aae1` were independently verified in `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-iBsQIp`. This is a local package, not a published preview. The repair review checked current-snapshot normalization, concurrent-write preservation, fail-closed behavior, queued-input ordering and absence of new durable fields. No additional issue was found in that scoped review; final-head CI remains required. This is not a claim that a separate independent reviewer re-reviewed the repairs.

The candidate supersedes the older application archive below. Retain the verified live predecessor and guarded recovery packages; refresh the exact candidate/recovery release preparation after source integration. Merge approval does not authorize application publication, production-data recovery, security changes or a smoke-test handoff.

**Final-head recovery follow-up:** Source `4004f58` (documentation-only after the app repair) initially passed three of four predecessor/candidate/guarded-rollback/recovery checks. The failed touch game's trace stops at an unreturned `Worker.evaluateExpression` (`call@2951`) after leaving the old document: the test could not proceed to inspect the replacement worker. All preceding no-credential/no-storage-change assertions passed. Three unchanged isolated touch repetitions then passed, confirming intermittent behavior. Test-only commit `c08980d` bounds each worker probe to 250 ms without enlarging the original 15-second activation deadline or removing any build/record assertion. The full rehearsal now passes **8/8** repeated desktop/touch cases (`/tmp/ninja-pr62-recovery-fixed.log`). The original trace is retained at `/tmp/ninja-pr62-rollback-before/trace.zip` and original run at `/tmp/ninja-pr62-final-rollback.log`.

Application code remains identical to `4c56fb7`. The fresh `c08980d83aebdedcec40a37bc182fc082dd8991a` package has **145** verified files and tree `fccd90df10c5fcef0c05cf41674667dad01d56e5ba4d6cc6d58896e704f63dec`, at `/var/folders/mw/pmwtc2hn5yx2l1k9_kxn_jv00000gn/T/ninja-dojo-family-sync-I0Vc0c`. Typecheck and the changed-file formatting/lint check pass. Final-head GitHub checks remain required; superseded passing jobs cannot establish the new head's status. Read-only canonical-manifest verification still reports live source `e9c5a54` and tree `67008aacbc2946151a661f2212b7fc47725edd2bdbf4398e26dd009b17a57e6d` (138 files). No publication or owner smoke-test handoff occurred.

The `a432255` GitHub browser job was **57/58**: its Grade 2 provisional writing-review test sent consecutive clicks while the same prompt was displayed and stopped on word 5 instead of reaching final review. Downloaded artifact `11673999037` contains the failure snapshot and trace; trace calls `206` and `208` begin while position 2 is still displayed. The original test passes 12 local repetitions, confirming the failure is intermittent rather than universal. The test-only repair waits for each numbered prompt before clicking. All provisional-score, final-result, exit and audio-failure assertions remain. The repaired file passes **18/18** repeated cases (`/tmp/ninja-pr62-writing-fix.log`), and the complete development browser suite passes **58/58** (`/tmp/ninja-pr62-browser-final.log`). The unchanged `a432255` canonical application package also passes **6/6** fresh all-grade desktop/touch Context checks (`/tmp/ninja-pr62-context-final.log`), with all **145 files** independently verified against tree `8dfa547a92dda26b2b40be88390333c2862ac533d05dbe5ceefce32cb5256886`. GitHub quality, builds and root-policy checks passed at that source; final-head CI remains required after this test-only follow-up. There is no application behavior or production data/security change.

At `8d38fe1`, all four non-family jobs passed again. The canonical-family run exposed a Context policy assertion that allowed only ten seconds for a normal-motion transition on the software-rendered runner. The unchanged Grade 2 journey passes **6/6** local desktop/touch repetitions (`/tmp/ninja-pr62-context-before.log`). Three sixfold-CPU-throttled diagnostics reproduced the timeout with the first reviewed answer already saved exactly once; the final diagnostic observed the correct next sentence 740 ms after the assertion deadline (`/tmp/ninja-pr62-context-eventual.log`). A subsequent fourfold-throttled diagnostic exposed the same rendering delay in the five-second input-ready assertion. The test retains normal motion and all policy/score checks, permits 30 seconds for the rendered transition and input readiness, and verifies the exact saved reviewed-prompt prefix after each answer. The fresh `b014a90` application package passes **6/6** all-grade desktop/touch policy checks (`/tmp/ninja-pr62-context-fix.log`); the final readiness allowance passes the full nine-word Grade 2 journey at fourfold CPU throttling against that same package (`/tmp/ninja-pr62-context-slow-ready.log`). All **145 files**, sizes, hashes and manifest tree `c6980fe60b82b104e45817c39243b2d37291d506939dcd531f95ee6ff3b6f511` were independently verified. This is a test-only timing repair, not a change to game movement, scoring or persistence. All final-head jobs remain pending; physical-device performance remains part of the later owner check.

At `5f56c8c`, all four non-family GitHub jobs passed. The broader canonical-family browser run additionally exposed obsolete syncing-message expectations and an ambiguous resume button after durable game discovery was added. Test-only commit `e2b52ee` asserts the current complete confirmation message and the specific paused-work control. A Grade 2 discard test also read storage before its lazy reading activity initialized; the race reproduced in one of ten desktop/touch repetitions. The test now waits for the zero-revision restart checkpoint and still verifies the retired history is unchanged. The five affected browser files pass **78/78** on desktop/touch at application package `e2b52ee` (`/tmp/ninja-pr62-legacy-browser-fix.log`). The updated discard test passes **24/24** repetitions across all grades against that same running package (`/tmp/ninja-pr62-discard-fix.log`); a separate local test configuration reused only the server, with isolated synthetic browser contexts and a distinct results directory. All five final-head jobs still gate merge. These repairs do not change application behavior, security policy or real child records, and do not publish the retained package.

At `c915801`, CI run `38060353237` passed quality, build and browser jobs. Its root-policy emulator job exposed a test-clock race: two sequential answers had the same millisecond timestamp, so the approved deterministic tie-break could select either payload instead of the test's presumed later answer. The fixture now injects ordered timestamps and asserts their order. The broader family CI check also found formatting/import-order errors; mechanical fixes cover eight files, with no application behavior or policy changes.

Local Node 24 verification passes 882 unit tests, six focused conflict tests, 17 root-policy emulator checks with one deliberate skip, nine family-policy emulator checks, typecheck, lint, configured format, the exact 43-file family CI formatting/lint check, and build/performance (549,990/550,000 initial JS bytes). These integration repairs do not replace or republish the retained packages below. Verify all five GitHub jobs on the final PR head before merge approval.

## Package identities

Prepared with Node **24.21.0**, npm **11.19.0**, and the repository packager. All file inventories, sizes, hashes and manifest tree hashes were independently verified before and after retaining these copies.

| Package | Source | Manifest files | File-tree SHA-256 |
| --- | --- | --- | --- |
| Candidate | `7bfc8db917844e939733768bb2787bee2d3c834f` | 145 | `e65880c0649f50d7864ba4814aefc56ea9442456e3176d5631f2b6a5e8802c58` |
| Guarded recovery | A3.3 `e9c5a547031c65c00cce45616ec581bcec111ac7`, compatibility `7bfc8db` | 139 | `ba5337546700d3d361f844b2f3ac9aa9672ee4444e29768a9f16135db9c2beee` |
| Previous live | `e9c5a547031c65c00cce45616ec581bcec111ac7` | 138 | `67008aacbc2946151a661f2212b7fc47725edd2bdbf4398e26dd009b17a57e6d` |

The retained packages are under ignored local directory `family-beta-artifacts/releases/stage-b-7bfc8db/`, in `candidate`, `guarded-rollback` and `previous-live`. These are local release archives, not published previews. The recovery package protects the new game namespace before the older engine can read credentials or change storage. An ordinary provider rollback to the unguarded previous app is not the reviewed recovery path for newer saved records.

## Verification

Fresh artifact verification passed for all three retained packages. The final focused desktop/tablet browser run passed **20/20** in 2.8 minutes at source `7bfc8db`, covering both-menu Lantern reload/completion across all three grades, failed-save retry, native competing-tab locks, explicit discard, offline cold-start recovery and graph/detail delivery after reconnect. The browser harness independently built the same manifest tree as the retained candidate on Node 24. Log: `/tmp/ninja-stage-b-release-browser.log`. The production package build log is `/tmp/ninja-stage-b-release-package.log`.

The reviewed repair's **882 unit tests**, **20 focused browser checks**, type/lint/format/build/performance and dependency gates remain attributed to `9f0ac75`. The prior broad **134-case** game matrix and **four-case** guarded recovery rehearsal retain their recorded source identities in the game readiness assessment. Only documentation differs at the prepared source; those full suites are not claimed as rerun during release preparation.

The game-only policy is active as `07e55d6a-e6be-4672-8a50-af50975976e0`, SHA-256 `ff108665b7c2b0fed1c8f476fcac0b5c4ed4b334cc3f71d630cae770491dd3c0`. The preceding policy-publication turn passed the additive boundary regression and 17 applicable emulator checks. Live end-to-end game syncing is part of application-release acceptance, not established by package checks.

## Publication gate

Read-only provider inspection confirms Cloudflare Worker `meghangames-ninjadojo`, account `4c11957e0121dba35fe2f16be80526f8`, still has A3.3 version `4043b2d7-9869-42b5-87b1-e0dc04a1f8fc` active at 100%. Use the current canonical Worker configuration and the retained tested package, rather than the historical Firebase/Pages scripts.

The site uses one shared family package. Obtain separate approval for **Kindergarten**, **Grade 2** and **Grade 5** before activating this package for all three. After approval, retain an inactive guarded recovery version, upload the exact candidate, perform the established isolated synthetic release acceptance, activate once, and verify the canonical manifest and public asset checksums. Preserve existing real-family records and authentication configuration. Check release state before retrying any uncertain provider operation.

After verified publication, offer one bounded owner smoke test with the exact grade links and build `7bfc8db` (or the approved replacement artifact's actual source). Cover a reviewed game turn, report pause/resume, reload/resume and confirmed completion on iMac/iPad; use the existing batched problem reports. **No owner smoke testing yet.**

Next model: **GPT-6.1 Sol · High** for source integration, packaging and release verification. Changes to application behavior would require the relevant roadmap implementation and review gates again.
