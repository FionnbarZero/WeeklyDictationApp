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
