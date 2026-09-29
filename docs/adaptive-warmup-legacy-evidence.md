# Adaptive Warmup legacy evidence inventory

## Purpose

This document inventories the useful assertions on the unmerged `feature/adaptive-warmup` branch before the new Adaptive Warmup model is implemented. The legacy branch is evidence, not an implementation source: it must not be merged or cherry-picked wholesale.

Evidence reviewed:

- Legacy branch commit: `efce6288db6e8d16bcd7114f7ec93fd2f32c4ae6`
- Legacy tests: `tests/domain.test.ts`
- Legacy requirements: `PROJECT_PLAN.md`
- Legacy implementation and UI: `src/domain.ts`, `src/App.tsx`, `src/config.ts`, and `src/firestoreClient.ts`
- Current approved contract: `PROJECT_PLAN.md`, `README.md`, and `docs/warmup-boundary.md` on `main` at `96b09d3`

No legacy assertion is approved merely because the old code or test contains it. Mixed tests are split at the assertion level so that an approved quota, for example, is not bundled with an obsolete fill rule.

## Classification meanings

- **Approved**: Recreate as an explicit test of the new model, in the phase named below.
- **Compatibility only**: Preserve only long enough to read, migrate, or compare old state safely. It is not the desired product behavior.
- **Obsolete**: Do not reproduce. A current approved rule replaces it.
- **Owned elsewhere**: Still useful evidence, but it belongs to another established boundary and must not be reimplemented inside Adaptive Warmup.

## Adaptive Warmup assertions

| ID | Legacy assertion | Classification | Required disposition |
| --- | --- | --- | --- |
| AW-01 | A current Acquisition word may enter Warmup after the child makes an error on it. | **Obsolete** | Acquisition is a curriculum stage. An active same-module, same-tier, same-language term is suppressed from Warmup regardless of prior mastery or errors. |
| AW-02 | The previous week's active Test Review words seed Recent Review. | **Obsolete** | A term becomes eligible only after it leaves the grade's final Test Review stage. Grade 5 Test Review 1 cannot create eligibility. |
| AW-03 | Older eligible words seed Random Rotation. | **Approved, renamed** | Eligible long-term terms may enter `mastery-rotation`; initial placement and repeated-occurrence rules must still respect final-review evidence. Test in the pure model phase. |
| AW-04 | Historical Errored Word state takes priority over ordinary seeding. | **Approved, revised** | Existing `needs-attention` state is not erased by a later correct or missing final-review result. The new evidence and scheduling fields, rather than one legacy category, express this. |
| AW-05 | Every Warmup targets 16 items with a 50/25/25 allocation. | **Approved, narrowed** | Grade 2 standalone Warmup has a maximum of 16: 8 Mastery Rotation, 4 Recent Entry, and 4 Needs Attention. This is not a universal grade rule or a minimum queue length. |
| AW-06 | A six-item Warmup uses 3 Rotation, 2 Recent, and 1 Error item. | **Approved** | Grade 2 pre-activity Warmup has a maximum of 6 with the 3/2/1 allocation. |
| AW-07 | When a bucket is short, fill from Random Rotation first. | **Obsolete** | Fill remaining unique slots in this order: Needs Attention, Recent Entry, Mastery Rotation. |
| AW-08 | Use remaining unique terms before repeating a Rotation term. | **Approved, strengthened** | Every ordinary Warmup queue contains unique mastery terms. There is no ordinary repeat fallback. |
| AW-09 | Repeat Random Rotation terms until a short pool reaches 16. | **Obsolete** | A short eligible pool produces a shorter completed queue. Intentional repetition belongs to a future Correction or reacquisition routine. |
| AW-10 | A Warmup is shorter only when no Random Rotation words exist. | **Obsolete** | All configured sizes are maxima. Any shortage of unique eligible terms can produce a shorter completed visit. |
| AW-11 | Two consecutive correct responses promote Recent Review to Random Rotation. | **Approved, renamed** | For Grade 2, two consecutive correct Warmup assessments promote Recent Entry to Mastery Rotation. The streak may span visits and calendar months. |
| AW-12 | Any incorrect response resets the promotion or recovery streak. | **Approved** | An incorrect Warmup assessment moves the term to Needs Attention and resets its streak to zero. |
| AW-13 | Three consecutive correct responses recover an Errored Word to Random Rotation. | **Approved, renamed** | Three consecutive correct Warmup assessments move Needs Attention to Mastery Rotation. This threshold is approved for every grade. |
| AW-14 | A correct response while recovering immediately proves the word is mastered. | **Obsolete if inferred** | Evidence remains `support-needed` and the term remains in Needs Attention after the first and second recovery correct; the third makes it `demonstrated` and moves it to Mastery Rotation. |
| AW-15 | A first correct response for an unassessed Recent term increments its streak. | **Approved clarification** | Set evidence to `demonstrated`, remain in Recent Entry, and increment the Recent Entry streak. |
| AW-16 | A correct response in Random Rotation leaves the word there. | **Approved, renamed** | A correct Mastery Rotation response leaves evidence `demonstrated`, keeps the same bucket, and has no recovery streak. |
| AW-17 | Random Rotation is a per-child shuffle-bag cycle with equal randomized opportunity. | **Approved, revised identity** | Maintain a persistent per-child, per-module Mastery Rotation cycle over mastery-term identities. Randomness must be injectable for deterministic tests. |
| AW-18 | A Rotation term cannot repeat until the current cycle is exhausted. | **Approved** | Exhaust eligible terms before reuse, and do not start another cycle during the same materialized visit. |
| AW-19 | Correct and incorrect Rotation responses both consume the term's current-cycle opportunity. | **Approved** | Preserve this transition; an incorrect response additionally moves the term to Needs Attention. |
| AW-20 | A newly promoted Rotation word waits for the next cycle. | **Approved** | Prove that it remains unavailable while any current-cycle term is still unreviewed. |
| AW-21 | A category is stored per child and weekly word occurrence. | **Compatibility only** | Read and migrate the occurrence-keyed `ChildWordState`; the future identity is one child mastery state per module + tier + language + normalized term, with occurrence provenance retained. |
| AW-22 | Newly Mastered datasets blindly replace stale categories with Recent Review. | **Obsolete** | Initial placement uses the latest valid completed final-Test-Review evidence. Reintroduced terms preserve Needs Attention when the approved repeated-occurrence rules require it. |
| AW-23 | Correct, incorrect, or missing final Test Review evidence has no explicit role in initial placement. | **Obsolete omission** | Correct becomes demonstrated/Recent Entry; incorrect becomes support-needed/Needs Attention; missing becomes unassessed/Recent Entry. Final-review evidence does not count toward Warmup streaks. |
| AW-24 | Repeated weekly occurrences remain independent long-term mastery items. | **Obsolete** | Combine occurrences within the same module, tier, language, and normalized term. Keep writing and reading as separate mastery terms and retain every occurrence as provenance. |
| AW-25 | Warmup-only completion saves reviewed mastery results without a primary dataset score. | **Approved** | Preserve the scoring separation. Exact visit persistence belongs to the persistent-visits phase. |
| AW-26 | Warmup does not create a per-dataset primary score. | **Approved** | Warmup visit history and attempts are separate from Acquisition or Test Review dataset scoring. |
| AW-27 | A partial session saves only Warmup attempts that received a right/wrong response. | **Approved intent** | In the persistent-visits phase, save each completed assessment immediately and idempotently; unanswered prompts do not count. Do not retain the legacy commit-on-exit mechanism as the final design. |
| AW-28 | A partial Warmup creates no primary score or completed primary-session record. | **Approved** | Preserve this separation while adding a durable partial visit and updatable graph point. |
| AW-29 | Recommitting the same session does not duplicate results. | **Approved requirement, old mechanism compatibility only** | Phase 3 must use deterministic attempt/transition IDs and revision checks. Do not treat the legacy whole-session commit API as the new persistence contract. |
| AW-30 | Monthly Rotation accuracy counts reviewed attempts, not unique words. | **Approved as derived reporting** | Derive monthly Mastery Rotation accuracy from attempt history using each attempt's original source bucket and attempted count as the denominator. |
| AW-31 | Monthly boundaries use the `America/Los_Angeles` calendar. | **Approved as reporting policy** | Retain for derived reporting unless a later explicit product decision changes the configured timezone. |
| AW-32 | The current monthly aggregate remains open and earlier aggregates become finalized. | **Compatibility only** | Preserve existing aggregate records as legacy history. New attempt history is authoritative; finalization flags must not drive the new mastery reducer. |
| AW-33 | A stored monthly Random Rotation aggregate is the source of truth for the graph. | **Obsolete** | One visit with at least one completed assessment produces one upserted visit graph point. Monthly results are derived from attempts. |
| AW-34 | Adaptive state is local-only and cloud synchronization is deferred. | **Obsolete** | The approved rollout includes versioned local and cloud validation, migration, security rules, and atomic revision-aware persistence before production cutover. |
| AW-35 | A materialized Warmup queue may be recalculated as word state changes. | **Obsolete if inferred** | Once created, preserve queue order and original source buckets. Revalidate unanswered entries only for active-term suppression; mark an invalid entry unavailable without reordering completed work. |
| AW-36 | Warmup selection remains inside the already selected grade and school year. | **Approved, revised for longitudinal mastery** | The application/lifecycle layer supplies the child's authorized historical curriculum. Previously earned mastery remains available across school years, while active-term suppression is limited to the child's current grade and school year. The pure Warmup model must not rediscover source selection or infer unrelated future-grade history. |
| AW-37 | A term's curriculum stage, evidence, and scheduler category can share one `WarmupCategory`. | **Obsolete** | Keep curriculum eligibility, child evidence, scheduling bucket, and visit progress as separate concepts. Remove `acquisition` as a future scheduling bucket. |
| AW-38 | Pre-activity Warmup is always required. | **Obsolete as a universal rule** | Use `preActivityWarmupRequirement: 'optional' | 'required'`. Grade 2 is currently optional during development; other grades require an explicit profile decision. |

## Useful collateral assertions owned by other boundaries

These assertions appeared in the legacy branch or its tests but are not Adaptive Warmup model responsibilities.

| ID | Legacy assertion or change | Classification | Owner/disposition |
| --- | --- | --- | --- |
| C-01 | School years normalize whitespace, separator variants, short/full years, and reject invalid nonconsecutive values. | **Owned elsewhere** | Canonical curriculum/lifecycle input handling. Retain its existing tests there; do not duplicate it in the Warmup reducer. |
| C-02 | Dataset filtering matches equivalent school years and excludes other grades. | **Owned elsewhere** | Canonical selection and lifecycle scope. Warmup accepts resolved eligibility. |
| C-03 | Missing import status is eligible while only explicit error status is excluded. | **Obsolete source shortcut** | Canonical import validation and lifecycle resolution now determine valid inputs. Do not encode import-status guesses in Warmup. |
| C-04 | Sample data contains six fixed Grade 2 datasets and protected legacy IDs. | **Compatibility only** | Preserve only where the existing state migration still requires those IDs. Sample vocabulary is not a source for the new model. |
| C-05 | Legacy bundled dataset metadata can be relabeled without losing datasets, results, scores, sessions, or history, and reload is idempotent. | **Compatibility only** | Keep as state-migration evidence. The Adaptive reducer must not own bundled-dataset migration. |
| C-06 | Warmup audio uses the approved word/context/repetition sequence at about 1.5 times normal speed. | **Owned elsewhere** | Audio/presentation policy. It is not adaptive selection or state behavior. |
| C-07 | Grade 2 Warmup and Test Review timers are 10 seconds. | **Owned elsewhere** | Grade practice/presentation profiles. Do not copy timers into the Adaptive Warmup model. |
| C-08 | Grade 2 Acquisition uses a generic 20-second timer. | **Obsolete** | Acquisition strategy owns its phase- and position-specific timers. |
| C-09 | Every grade silently receives complete timer defaults and unsupported inputs fall back to another grade. | **Obsolete** | Unsupported grade behavior must fail explicitly until its profile exists. |
| C-10 | Rhys is added as a demo child and Eli is reassigned to Grade 5. | **Obsolete collateral** | Demo profile changes are unrelated and must not be cherry-picked. |
| C-11 | Cloud hydration supplies empty adaptive arrays when fields are absent. | **Compatibility only and incomplete** | The future versioned migration validates entries individually and preserves unrelated valid state; empty defaults cannot substitute for migration. |
| C-12 | `commitPartialSession` on application exit is sufficient partial-Warmup persistence. | **Obsolete mechanism** | Phase 3 persists each assessed transition atomically and supports exact resume. |
| C-13 | The legacy monthly line graph is the approved Warmup report UI. | **Obsolete implementation** | Preserve its data as legacy history only. The approved report is one point per Warmup visit, with monthly Rotation reporting derived from attempts. |
| C-14 | Local date keys must use the configured local calendar rather than UTC slicing. | **Approved, owned elsewhere** | Retain in date/reporting utilities and test at the reporting boundary. |
| C-15 | Session IDs are unique and same-date latest scores resolve deterministically. | **Owned elsewhere** | Session/scoring boundary. Phase 3 will add stable Warmup visit and transition identities separately. |

## Legacy tests to translate

The following legacy test cases contain useful evidence. They must be split and rewritten against the appropriate modern boundary rather than copied unchanged.

| Legacy test | Assertions to recreate | Assertions to reject or isolate |
| --- | --- | --- |
| `warmup targets 16 words with 50/25/25 category quotas and momentum fill` | Grade 2 8/4/4 allocation, unique selection, active-term exclusion | Rotation-first shortage fill and the phrase “behavioral momentum” for queue filling |
| `historical errors override seeded dataset categories` | Needs Attention priority for an already eligible mastery term | An active Acquisition error bypassing lifecycle eligibility |
| `warmup repeats only Random Rotation words when fewer than 16 unique words exist` | Short-pool test coverage | All repeated terms and the 16-item minimum |
| `recent and errored words use remaining unique words before any Random Rotation repeats` | Unique terms and shortage behavior | Rotation repeat fallback and legacy category names |
| `Recent Review streaks persist across calendar months and promote after two correct responses` | Cross-visit streak and Grade 2 two-correct promotion | Occurrence-keyed state and legacy names |
| `an incorrect response takes priority and Errored Word recovery requires three correct responses` | Incorrect reset and universal three-correct recovery | Legacy evidence/category conflation |
| `Random Rotation bag avoids repeats until its current cycle is exhausted` | Exhaustion, opportunity consumption, cycle advancement, delayed promotion | Any mid-visit cycle restart used to fill a queue |
| `monthly Random Rotation scores count attempts independently by calendar month` | LA month grouping and attempts denominator | Aggregate records as authoritative truth |
| `complete sessions create primary scores once and persist child-word states` | Idempotency and state preservation | Legacy whole-session persistence as the future transition API |
| `warmup-only sessions preserve mastery results without creating a primary score` | Warmup/primary-score separation | Legacy occurrence-keyed state shape |
| `partial sessions preserve recorded warmup attempts but create no primary score` | Assessed-only durability and no primary score | Commit-on-exit as sufficient persistence |
| `legacy bundled dataset metadata migrates without changing protected state` | Idempotent preservation of unrelated records | Any dependency of the new Warmup reducer on sample datasets |
| `warmup selection stays within the already-filtered grade and school year` | Scoped input contract | Reimplementing grade/year resolution inside Warmup |

## New assertions absent from the legacy branch

The legacy evidence does not cover several approved rules. Phase 2 and Phase 3 must add them explicitly:

- Stable mastery identity using `mastery-normalizer-v1` and module + tier + language + normalized term.
- Path-safe deterministic mastery-term IDs with the canonical tuple stored for collision validation.
- One long-term mastery term across weekly occurrences, while writing and reading remain separate.
- Correct, incorrect, and missing final-Test-Review initialization.
- Grade 5 final-review behavior tested only through a synthetic multi-review strategy until Grade 5 is implemented.
- Active same-identity occurrence suppression, including an older Mastered occurrence.
- Approved shortage priority: Needs Attention, Recent Entry, Mastery Rotation.
- No duplicates and a completed short queue such as five-of-five.
- Durable materialized visits, queue-entry statuses, exact resumption, revision conflicts, and idempotent retries.
- One graph point per visit, updated rather than duplicated after resumption.
- Versioned local/cloud migration with per-entry quarantine and preservation of unrelated children, grades, modules, historical results, and orphaned records.
- Firestore Emulator coverage for family ownership, ID/status validation, revision transitions, stale and duplicate writes, and cross-family rejection.

## Branch deletion gate

Keep `feature/adaptive-warmup` until all of the following are true:

1. Every approved assertion above has a named modern test or an explicitly scheduled Phase 3 acceptance test.
2. Compatibility-only state has a tested migration or a documented decision that it is no longer supported.
3. Every obsolete assertion has a replacement rule and regression test where accidental reintroduction is plausible.
4. The new pure Adaptive Warmup model passes its full acceptance suite.
5. The inventory is reviewed before any legacy branch deletion.

The legacy branch must not be merged or cherry-picked wholesale. Its deletion is a separate, explicit Git action after these gates are satisfied.

## Current phase boundary

This inventory makes no runtime decision beyond the already approved project plan. The next implementation branch phase is the pure Adaptive Warmup model: identity, evidence, scheduling, rotation, and pure v2-to-v3 migration. It must remain unused by `App.tsx`, local storage, Firestore, and production persistence until the later activation phase.
