# Weekly Dictation roadmap

Updated October 7, 2026. Start with the [immediate execution order](#immediate-execution-order). [ADR 0009](./docs/decisions/0009-activity-reliability-and-staged-delivery.md) records the approved architecture repair decisions and overrides conflicting older sequencing below. [STATUS.md](./STATUS.md) states what is implemented, tested, and published. Programs A–C retain their historical evidence and outstanding dependencies; completed Program A work does not establish reliability of the newer family wrapper.

This roadmap separates three programs with independent finish lines:

- **Program A — codebase cleanup and refactoring**
- **Program B — production and deployment readiness**
- **Program C — controlled family beta and product rollout**

Program A must not stay open because a curriculum or release decision in Program C is unresolved. The frozen references protect approved behavior while the integrated application is assembled one vertical slice at a time.

As of October 5, 2026, all three live family apps use the parent-authenticated family build at `ninjadojo.meghangames.com`, with synced completed scores and saved practice, local batched reports, and automatic Google curriculum refresh. The [family-sync release record](./docs/family-sync-release-2026-10-05.md) identifies the exact artifacts and rollback targets. Program A and B1 remain complete; migration of older device-only histories is still deferred. The October 6 priority is shared reliability repairs first, followed by Grade 5-specific learning/Boss fixes and incremental game integration, then UI improvement.

The owner has authorized publishing tested fixes directly to the affected live grade without another per-release approval question. Verification and rollback remain required; production data resets, authentication/security changes, and unreviewed migrations remain outside that authorization. The [October 5 product decision](./docs/decisions/0008-family-beta-product-and-release-policy.md) resolves the older conflicting behavior and release gates.

## Operating model

### Approved family sync release

The owner approved parent-only sign-in and secure family syncing. The published release consolidates the family entry point at `ninjadojo.meghangames.com`, preserves old records, checkpoints reviewed ordinary acquisition trials, and passed sequential two-browser continuity against the live backend. Only additive family-collection rules were published; the rest of the production policy and its rollback ruleset were preserved. Do not interpret the earlier one-device limit as a blocker. Historical device-only profiles still require an explicit identity mapping before migration. Stroke Order, Whispering Scrolls, and explicit reentry checkpoint integration remain separate unfinished work.

```text
frozen tag + archived build ───────────────┐
                                           ├─ parity checks ─► Program A cleanup
living prototype routes + fixtures + tests┘                       │
                                                                 ▼
                                                     integrated application shell
                                                                 │
                           ┌─────────────────────────────────────┴─────────────────────────────────────┐
                           ▼                                                                           ▼
            Program B synthetic staging                                         Program C controlled family beta
                                                                                                  │
                                                                                                  ▼
                                                                                         grade rollout lanes
```

No architecture refactor may alter a frozen contract as an incidental effect. No source gate, persistence schema, or product capability is activated by cleanup.

The controlled family beta is not public production and does not turn synthetic staging into a real-data environment. Reproduce and test updates with synthetic data, retain an immediate rollback target, and promote the tested artifact under the owner's standing release approval. Temporary previews are verification tools, not another required user approval step or the user's permanent beta link.

## Program A — cleanup and refactoring

Program A is complete when `App.tsx` is UI composition rather than persistence orchestration, React does not directly depend on Firestore or recovery journals, initial hydration is bounded, deterministic performance budgets pass, all gates pass from a fresh checkout, and active documentation reflects the result.

| Stage | Status | Scope | Exit gate |
| --- | --- | --- | --- |
| A0. Finish and freeze | Complete | Record untouched browser/Emulator baseline; merge Grade 5 work; fix only the confirmed Sky Writing exit crash; inventory routes/fixtures/limitations; add smoke, exit, and selected visual references; tag and package exact build | Every valued prototype has a stable route, fixture, regression test, immutable tag, and checksum-verified archive |
| A1. Engineering guardrails | Complete | Exact dependency policy; Node/npm contract; typecheck, lint, and format checks; separate CI jobs; render failure boundary; modal focus/Escape/restoration; global browser console/page-error rejection | Fresh checkout can run every automated gate; structural changes cannot silently create browser errors or change prototype references |
| A2. Documentation clarification | Complete | Authoritative status matrix, roadmap, documentation index, ADRs; classify the historical plan as archived; correct Tier 2 and Kindergarten drift | Active documents have no contradictory capability or release claims |
| A3. Read-side extraction | Complete | Characterize current orchestration; add explicit `readChildWorkspace`, `assembleChildWorkspace`, `recoverPendingTransitions`, `reconcileOpenSessions`, and `synchronizeChildWorkspace`; inject capability ports; define order, failure, cancellation, and idempotency | `App.tsx` performs no raw collection loading or migration; stale child/auth results cannot replace the active workspace |
| A4. Write-side extraction | Complete | Move start, answer, exit, experience-specific skip/discard, and completion workflows one vertical slice at a time; retain journal-before-state and receipt semantics; make active-experience state coherent; make Tier 2 audio ownership safe | `App.tsx` imports neither Firestore operations nor recovery-journal functions; local/cloud behavioral parity passes |
| A5. Performance and containment | Complete | Classify continuation-critical, summary, and detail records; add scoped reads, bounded hydration, lazy history/detail loading, request timing, and route/activity splitting | No per-history-session initial fetch; fixed-fixture request/record budgets, main-entry size, and development-module-exclusion gates pass |

### A3 characterization matrix

Tests must exist before extraction for:

- child switching during an outstanding load;
- authentication changes during hydration;
- interrupted Acquisition and Warmup recovery;
- partially completed versus abandoned sessions;
- failed journal acknowledgement;
- failed cloud commits followed by retry;
- duplicate recovery execution;
- local and cloud start, exit, and completion;
- failure-boundary recovery without deletion of pending journals.

`synchronizeChildWorkspace()` composes the smaller operations. Reads do not mutate. The extraction preserves and tests the existing order: read, reconcile open sessions, assemble, recover pending transitions, then publish state. An `AbortSignal` crosses the boundary so stale reads cannot update the UI, while cancellation does not undo legitimate writes already initiated for the previous child. Repeated synchronization is idempotent.

Tier 2 lifecycle projection changes are controlled behavior changes, not mechanical extraction. Old and proposed projections must be compared across every Grade 2, Kindergarten, and Grade 5 fixture before switching.

### A4 required versus optional scope

Required: extracted application workflows, no infrastructure in `App.tsx`, coherent active-experience state, safe Tier 2 audio ownership, and demonstrated parity.

Optional follow-ups do not block Program A: renaming the Sky Writing component family, replacing bespoke Kindergarten games, or general game-component consolidation. Use experience-specific operations such as `skipWarmup()` and `discardTestReview()` where their semantics differ.

### Architecture-test policy

Preserve forbidden-import and approved-consumer checks. Keep exact file inventories only for genuinely closed safety boundaries; use dependency-direction and public-contract tests elsewhere so harmless moves do not create artificial churn.

## Program B — production and deployment readiness

Program B begins with synthetic, production-shaped data. Real child data requires explicit authorization, minimal identifying information, access controls, and a documented deletion date/procedure.

| Stage | Status | Scope | Exit gate |
| --- | --- | --- | --- |
| B1. Staging foundation | Complete | Separate Firebase projects/environments; deploy rules and application; budgets, retention, App Check monitoring, and observability | Isolated synthetic-only staging is live; guarded deploy, App Check traffic, atomic completion, cross-browser visibility, cleanup, and rollback history are verified |
| B2. Migration rehearsal | Waiting for C0 | Synthetic backup/restore and migration; rollback drill; failure injection; support runbook | Migration and rollback are repeatable, checksum-verifiable, and lossless |
| B3. Grade 2 pilot | Blocked by B2 | Migrate one separately authorized Grade 2 profile; exercise local/cloud retry and a second device | Cross-device Grade 2 resume works without loss, duplication, or identity drift |
| B4. Operations acceptance | Blocked by B2–B3 | Restore test, incident response, retention/deletion, performance trend review, and release checklist | Named owner accepts the production runbook and fail-closed gates |

## Program C — controlled family beta and product rollout

Program C protects the three grade-level applications used in the family beta. All three now sync completed scores and saved practice under a parent account while retaining reports locally. Ordinary Dojo checkpoint recovery and sequential two-browser continuity passed the family-sync release checks; alternative acquisition game paths and complete per-game weekly history are not thereby complete. Protect existing state in every grade; never clear browser data to resolve an update mismatch.

### C0 controlled family beta safety

| Workstream | Required scope | Exit gate |
| --- | --- | --- |
| Beta inventory | Record each grade's stable URL, build commit, activity surface, persistence promise, child-data location, and known limitations | Every child has one documented known-good release and no beta URL silently tracks an unverified branch |
| Release identity | Display grade, beta status, application version, and Git revision in every app; create one release manifest per promotion | A bug report can identify the exact code, curriculum, schema, and deployment under test without child-identifying data |
| Grade-specific delivery | Maintain stable grade-specific beta destinations and temporary preview deployments; promote the exact reviewed artifact rather than rebuilding it | A change to one grade cannot unintentionally replace another grade's known-good app |
| Data protection | Preserve browser-local scores, reports, and learning state in every grade; verify backup and restore coverage before a storage migration; retain no microphone audio | Existing state survives compatible releases; destructive changes remain separately authorized; no cross-device promise without implementation and acceptance |
| Safe update workflow | Require synthetic reproduction, regression coverage, relevant checks, exact-artifact promotion, observation, and rollback under standing owner approval | Tested fixes reach the affected permanent beta link without repeated approval questions; failed checks block promotion |
| Bug response | Define privacy-safe intake and critical/high/medium/low response rules; stop and roll back for privacy, identity, loss, duplication, or lifecycle corruption | Every reported defect has an owner, severity, affected build, containment decision, and regression test when reproducible |

The detailed operating procedure is maintained in [`docs/family-beta-operations.md`](./docs/family-beta-operations.md), with a reusable manifest in [`docs/family-beta-release-manifest-template.md`](./docs/family-beta-release-manifest-template.md).

The deployment inventory is recorded in [`docs/family-beta-release-inventory.md`](./docs/family-beta-release-inventory.md). The canonical family app is now ninjadojo.meghangames.com. Firebase and GitHub Pages addresses remain historical aliases pending the dependency and retirement work in ADR 0009. Earlier October 5 release checks are historical evidence, not proof of every current entry path; the October 6 audit found a canonical-route game-saving gap. Physical iMac/iPad acceptance, detailed activity correctness, and migration/restore coverage remain distinct work.

The earlier Grade 2 safeguard and disposable restore rehearsal on `8355522` remain evidence for the legacy storage model, not proof that the newer family ledger, reports, and mastery keys are fully covered. Verify coverage and rehearse any actual migration against its exact candidate; ordinary compatible bug fixes do not need to repeat an unrelated legacy migration program.

### C1 product behavior contracts

The current prototypes and tests are evidence of implementation, not independent proof that every activity is correct. Before changing an activity, record its approved grade, lifecycle stage, vocabulary tier, child-facing label, teaching or assessment behavior, Warmup policy, persistence promise, and availability. Behavior corrections and architectural refactors remain separate changes.

For Kindergarten, the Weekly Focus spreadsheet is the curriculum and lifecycle authority. Unit 1 teaching ends September 27, 2026; the explicit `Week 7 09/28` source tab defines September 28 through October 4 as a cumulative review period ending in the unit assessment. Unit 1 enters Mastery on October 5, after that review week, not immediately after teaching ends. Future unit and review boundaries must be grounded in the same authoritative workbook before they are added to the lifecycle plan.

C1's grade-specific work proceeds Grade 5 first after shared reliability repairs. Its finish line is reliable daily lessons and Boss tests against the owner-approved rules, followed by game integration and UI improvement. Both ordinary acquisition activities and their game-based alternatives are retained in the product with separate progress. Activities without a usable validated subset show “Coming soon” until ready. Availability is not a claim that all bugs are fixed.

### EduGames rules within Ninja Dojo

Approved by the product owner on October 5, 2026. These requirements govern EduGames embedded within Ninja Dojo across the supported grades. They are planned behavior, not a claim that the live games already implement them.

| Game | Vocabulary targets | Required behavior and lifecycle placement |
| --- | --- | --- |
| Shuriken Match | Tier 1 and Tier 2 mixed in each round | Match Chinese words to English meanings/words. Display text and play the corresponding audio when tapped. |
| Shadow Strike Dojo and Lilypad Path | Tier 2 | Keep both visually distinct games; both practise receptive character identification. |
| Lanterns | Tier 2 | Reinforce Tier 2 targets through the existing Lanterns game. |
| Context Gap Dash | Tier 1 | Show a Mandarin sentence with the target missing; the child chooses the missing Chinese word. Provide sentence audio. |
| Sushi Scramble | Tier 1 | Arrange words into a sentence containing the Tier 1 target. Support enough sushi pieces for longer sentences rather than a fixed six-piece limit. |
| Challenge of the Whispering Scrolls | Tier 2 | Teach through the grade's full reading acquisition rules. Keep it alongside existing reading acquisition with separate progress, not a replacement or a shared completion path. |
| Dictation Streak | Tier 1 and Tier 2 mixed in each round | Play **word → contextual sentence → word → word**. The child types pinyin for each character, chooses the correct Chinese candidate, and repeats to assemble the target word or phrase. Preserve the existing module's pinyin-to-character input pattern. |
| Stroke Order Slay | New Tier 1 words | Teach through the grade's full writing acquisition rules. Keep it alongside existing writing acquisition with separate progress; neither activity is labelled experimental. |

Shuriken Match and Dictation Streak explicitly allow both tiers; the other games retain the tier assignments above. A mixed target pool does not by itself authorize merging Tier 1 writing and Tier 2 reading scores or mastery histories.

Teacher materials remain authoritative for vocabulary, tiers, dates, and units. The owner authorizes generation of supplemental English meanings, Mandarin contexts, and supporting pinyin without manual preapproval. Validate and version generated content, retain teacher-source links, and support later corrections through problem reports. Do not invent teacher vocabulary or label generated content teacher-authored. Invalid or unavailable supporting content disables only the affected prompt/activity; a missing human approval is no longer a blocker. See [Supplemental content policy](./docs/dictation-context-review.md).

Whispering Scrolls and Stroke Order Slay retain their grade's acquisition repetitions, familiar-word practice, timers, corrections, and completion rules. Save their separate progress after each completed trial; resume at the next checkpoint and restart only the unfinished prompt. Existing reading and writing acquisition remain alongside them. The owner confirmed that Whispering Scrolls follows the existing reading acquisition rules, including record → hear the child's recording and the correct model → self-assess, not an independent ordering or automatic pronunciation grading.

The other six listed game entries are extra reinforcement, using the most recent earlier week with relevant targets. They do not impose acquisition loops. Collect separate per-game learning results and make progress across a week visible; verify every game's coverage rather than assuming aggregate game scores prove this requirement. Game success must not silently rewrite writing/reading mastery. Cohorts move from Acquisition to Ninja Skills/Final Boss and then automatically into Spirit Realm and Warmup when the grade-owned phase is over; do not add a new game-score promotion threshold. Spirit Realm continues to follow the full existing Warmup rules. Future Kindergarten unit boundaries come from teacher materials, not guessed dates.

Children choose activities freely and end a session with **Done for today**. Opening a problem report must pause movement and timers and preserve the activity position. Saved reports remain batched for end-of-session sharing. Acceptance targets iMac and iPad; automated WebKit/touch checks do not replace hearing and recording on a physical device.

Implementation acceptance must verify each game's eligible tier pool, acquisition placement where specified, and required meaning or sentence prompts. Dictation Streak must verify the complete four-part prompt for every word. Record these checks in each affected grade's activity acceptance matrix before promotion.

### Product rollout dependencies

These are dependencies, not one universal sequence:

```text
trusted importer deployment ──► Kindergarten source activation
                            └──► Grade 5 source activation

durable Grade 2 Tier 2 ─────────► independent of multi-grade importer

Kindergarten activation ────────► importer + Kindergarten/Tier 2 decision
Grade 5 activation ─────────────► importer + Warmup policy + multi-review persistence
```

These longer-term production dependencies do not reopen completed family-beta deployments or the live curriculum service. The subsequently approved family-sync beta includes parent accounts, additive family security rules and tested score/practice recovery. Historical migrations, unrelated security-policy upgrades, and broad public rollout retain separate gates.

The owner's current priority is shared reliability first, followed by Grade 5-specific bugs, Kindergarten, and Grade 2. Game releases follow the staged queue below; UI redesign follows reliable behavior. Preserve each grade's approved teaching rules.

## Working rules

- Owner handoffs: announce the recommended model and reasoning level before each focused stage, and prompt for a needed model change before application-code edits. Follow the persistent handoff instructions in `AGENTS.md`; a prior confirmation for the same stage need not be repeated.
- Proactively invite a short smoke test at useful verified-build milestones and after affected live releases. Include reachable grade links, the verified build identifier, preview/live status, a short checklist, and known omissions. An unpublished fix must never be represented by an older live link.
- One architectural concern per PR.
- Refactors and behavior changes use separate commits or branches.
- Prototype tests remain green throughout cleanup.
- Shared component contracts are characterized before change.
- Each child uses the permanent grade link. Promote only tested artifacts and verify the live build; a GitHub push alone is not proof of publication.
- Standing approval covers ordinary tested grade updates. Do not repeatedly request preview approval. Preserve rollback, storage compatibility, and the separate boundaries for production data/security changes.
- Privacy, family isolation, lost or duplicated durable progress, and lifecycle corruption are immediate stop-and-rollback conditions.
- Bug reports use grade, activity, build identity, device, expected behavior, and observed behavior without full names, recordings, credentials, or response content.
- No persistence schema change ships without migration and rollback tests.
- Production integration uses contracts and adapters rather than copying whole prototype applications.
- A prototype may remain imperfect; known defects are documented instead of silently reinterpreted.
- Direct runtime and build-tool versions are exact. CI uses `npm ci` on Node 24/npm 11. Upgrades occur in separate, fully verified PRs on a documented cadence.
- Hard performance gates use deterministic fixtures. Browser latency is recorded as a trend until CI is stable enough to make it nonflaky.

## Immediate execution order

Use one focused PR per coherent change. Release A can ship in smaller verified increments; game and hosting work must not delay its urgent saving fix. Reproduce audit findings on current source before implementation. Record source revision, tests, artifact identity, publication status, and rollback for each published increment.

### Model routing

Choose the model at the start of each focused task or handoff. Use **GPT-6 Astra** for architecture, persistence, acquisition rules, security-sensitive review, and final cross-grade release review. Use **GPT-6.1 Sol** for bounded implementation after the governing contract is clear. Use **GPT-6 Luna** for documentation and mechanical inventory work. Model choice does not replace regression coverage or exact-artifact verification.

An Astra review means reviewing the completed diff, tests, packaged behavior, data compatibility, and rollback evidence before publication. It is not a second implementation running concurrently against the same files.

| Order | Status | Primary model | Required review | Scope | Acceptance gate |
| --- | --- | --- | --- | --- | --- |
| 0. Decisions and baseline | Documentation recorded; runtime repairs pending | GPT-6 Astra · Extra High | — | ADR 0009 and this queue; reproduce audit findings against current source | Approved rules have one reference; existing defects are reproduced before edits |
| A1. Confirmed saving and live-build checks | Reviewed, merged as `6686279`, published and live-verified October 6 | GPT-6.1 Sol · High | GPT-6 Astra · High review completed | Explicit family context; no silent completion; align automation with canonical routing, actual packaging, and production-intended rules; [implementation evidence](./docs/a1-confirmed-game-saving.md), [release evidence](./docs/a1-release-2026-10-06.md) | Passed: 28 exact-package checks; all three canonical grades saved games, survived reload, and recovered the same attempts in a second browser; family isolation gates passed |
| A2. Preserve active work | Merged as `b72ed85`, published and live-verified October 6; [release evidence](./docs/a2-release-2026-10-06.md) | GPT-6 Astra · Extra High | Release review completed; all five final-head CI jobs passed | Shared interruption/ownership contract; offline renewal and grade return; shared Grade 2 state; live download ownership guard; [contract](./docs/a2-preserve-active-work.md) | 88 merge-package checks, 664 unit tests, production family-policy checks; live three-grade saving/reload/fresh-browser recovery, report pause/navigation, 129 asset hashes and six public routes passed |
| A3. Reliable resume and results | Partially published: A3.1 merged as `55e9189`, published/live-verified October 7; [release evidence](./docs/a3-release-2026-10-07.md). [A3.2](./docs/a3-curriculum-pinning.md) in PR #60, unpublished: pinning, saved-source/offline reopening, Grade 2 corrected editions and durable discard implemented; guarded rollback locally rehearsed. Final checks and independent review remain before release. A3.3 conflict/storage pending; [scope](./docs/a3-result-history.md) | GPT-6 Astra · Extra High | GPT-6 Astra · Extra High release review; A3.1 release review and final-head CI completed | Curriculum pinning/transitions; newest unfinished checkpoint selection; distinct completed-attempt points; bounded storage and reads | A3.1 passed 98 merge-package checks, 675 unit tests, 3 family-policy checks, and live bounded-history/distinct-point verification. A3.2 now requires final-source acceptance and review, then exact-artifact publication/live verification. A3.3 still must resolve unfinished conflicts without parent action and bound durable storage |
| B. First student-ready games | Pending | GPT-6.1 Sol · High | GPT-6 Astra · High for central policy and release review | Central game policy; Lanterns, Shuriken, Context Gap Dash, Sushi Scramble, each independently releasable | Correct tiers, validated rotating subsets, honest coverage, reviewed per-target results, and Release A interruption/saving behavior |
| C1. Shadow Strike | Pending | GPT-6.1 Sol · High | GPT-6 Astra · High release review | Movement performance plus mouse and touch interaction | Measured movement improvement and shared persistence, interruption, and coverage checks |
| C2. Dictation Streak | Pending | GPT-6 Astra · High | GPT-6 Astra · High release review | Both-tier Pinyin candidates and four-part audio | Correct audio/input contract and shared persistence and coverage checks |
| D1. Whispering Scrolls | Pending | GPT-6 Astra · Extra High | GPT-6 Astra · Extra High release review | Separate Tier 2 reading acquisition progress and temporary comparison recordings | Source-cited phase/timer parity for expanded trials, correction, earned DT, resume, and recording cleanup |
| D2. Stroke Order Slay | Pending | GPT-6 Astra · Extra High | GPT-6 Astra · Extra High release review | Separate Tier 1 writing acquisition progress, stroke guides, and thinner marker | Source-cited phase/timer parity for expanded trials, correction, earned DT, resume, and validated guides |
| E1. Release-path cleanup | Pending; separate from urgent learning releases | GPT-6.1 Sol · High | GPT-6 Astra · High before publication or retirement | One release path; archived guarded scripts; obsolete-host dependency inventory and retirement | Supported release and rollback verified; exact retired targets recorded; no shared dependency removed |
| E2. Retention and security | Pending; separately authorized production changes | GPT-6 Astra · Extra High | GPT-6 Astra · Extra High | Retention metadata and cleanup preview; hosting protections and any production policy proposal | Destructive cleanup and additional authentication/database-security changes remain unexecuted until separately authorized |

Routine documentation and status-only updates use **GPT-6 Luna · Medium**. Straightforward regression-test repairs and small UI defects with an established contract use **GPT-6.1 Sol · Medium**. The final release review across all affected grades uses **GPT-6 Astra · Extra High**.

Before game implementation, produce a code-grounded readiness assessment for each game: existing capabilities, missing content/behavior, dependencies, and shortest student-ready path. Effort estimates are provisional.

For each confirmed failure, add a meaningful regression, implement the repair, and verify the exact package. Cover all three affected grades and desktop/iPad layouts with synthetic records. Report physical audio/performance checks automation cannot establish. Passing unrelated tests does not complete an acceptance gate.

The detailed behavior is maintained in [ADR 0009](./docs/decisions/0009-activity-reliability-and-staged-delivery.md), not duplicated here. In particular, validated game subsets are allowed; distinct completed attempts remain separate; offline continuation and curriculum pinning are required; obsolete hosting is slated for retirement after dependency checks. These are approved requirements, not claims about the current release.
