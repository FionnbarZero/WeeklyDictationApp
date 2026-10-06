# Weekly Dictation App — Project Plan

Current execution starts in [ROADMAP.md](./ROADMAP.md#immediate-execution-order). The October 6 architecture and reliability decisions are in [ADR 0009](./docs/decisions/0009-activity-reliability-and-staged-delivery.md); [STATUS.md](./STATUS.md) records implementation and publication evidence. This historical document is not a second implementation checklist.

> **Archived on 2026-10-01.** This document is preserved for its privacy, migration, grade-policy, and design history. It is no longer the authority for current status or execution order. See [`STATUS.md`](./STATUS.md), [`ROADMAP.md`](./ROADMAP.md), and the [`docs/decisions`](./docs/decisions/README.md) index. Do not delete this archive when migrating durable decisions into ADRs.

The October 5, 2026 owner-approved game rules are saved in the active plan under [EduGames rules within Ninja Dojo](./ROADMAP.md#edugames-rules-within-ninja-dojo), including tier selection, contextual prompts, and acquisition placement.

The owner's later answers are recorded in [ADR 0008](./docs/decisions/0008-family-beta-product-and-release-policy.md). They supersede this archive's conflicting experimental labels, per-release approval gates, and blanket restrictions on English meanings or generated contexts. Use [STATUS.md](./STATUS.md) for what is actually live and the [roadmap](./ROADMAP.md#immediate-execution-order) for next work.

## Purpose

A browser-based Mandarin dictation practice app for children in Chinese immersion programs. The public interface will be hosted through Firebase Hosting and support multiple families and children. The first target language is simplified Mainland Mandarin. Pinyin and English meanings will not appear in the child interface.

## Accounts and profiles

- Parents create an account with email and password.
- One parent account can contain several child profiles.
- Each child profile has a nickname and grade.
- Parents select a child from a private dropdown or profile buttons.
- A visible Switch Child option remains available.
- Child profiles are archived rather than deleted.
- Parents update a child’s grade at the beginning of a school year.
- One parent email receives separate future progress messages for each child.
- A Notes-page link should reopen the signed-in app on the same device without repeatedly asking for the parent password. A new device or browser may require one parent sign-in.

## Curriculum-source and school-year model

There is one authoritative curriculum source per grade per school year. A source may be a Google Slides deck or a Google Sheets workbook. Every child in the same grade and school year uses the same canonical datasets derived from that source.

The approved near-term source configuration is:

| School year | Grade | Source type | Authoritative source | Status |
|---|---|---|---|---|
| 2026–2027 | Kindergarten | Google Sheets workbook | One workbook containing weekly tabs | Adapter, Unit 1 lifecycle, and development lab exist; production source gate remains inactive |
| 2026–2027 | Grade 2 | Google Slides deck | Grade 2 Weekly Focus deck | Only active source profile; local/manual import is still required until the trusted backend is deployed |
| 2026–2027 | Grade 5 | Google Slides deck | Grade 5 Weekly Focus deck | Adapter, progression lifecycle, and development lab exist; production source gate remains inactive |

The administrator configures a data-driven grade registry containing the internal grade key, display name, school year, source type, source ID, source-adapter profile, practice-strategy profile, active status, and phase timers. Future grades and school years can be added through explicit profiles rather than new grade-specific application forks. Parents choose only a child’s grade; the grade and school year select the source and practice profiles automatically.

For Google Slides, the presentation ID is the yearly source identity and each slide is a source unit. For Kindergarten Google Sheets, the spreadsheet ID—not an individual tab `gid`—is the yearly source identity and each weekly tab is a source unit. Source links or IDs are stored rather than copies of the entire source file.

Firestore is the authoritative web storage for validated weekly datasets. The browser does not read Google Slides or Google Sheets directly. Because no production backend importer is currently deployed, a local, explicitly invoked trusted importer may be used when authorized. It may write only reviewed output from an explicitly configured source adapter after the source structure, dry-run output, and validation results have been inspected. Do not create or commit service-account keys, private keys, OAuth refresh tokens, or other secrets. If the importer cannot authenticate safely, stop before writing and report the required setup. Code deployment, data writes, and GitHub pushes remain separate actions and require their own authorization.

## Canonical source boundary and normalized vocabulary

Every grade-specific adapter converts its source units into the same normalized candidate boundary before canonical validation or Firestore planning:

```text
WeeklyDatasetCandidate
├── tier1[]
├── tier2[]
├── tier3[]
├── rawDate
├── normalizedStartDate
├── normalizedEndDate
├── source metadata
├── sourceSectionLabel
├── instructionalRole
├── assignedWeek
├── contentFingerprint
├── status
└── validationOutcomes[]
```

Every adapter returns one source-neutral import result rather than a grade-specific loose collection:

```text
CurriculumImportResult
├── candidates[]
├── issues[]
├── progressionEvidence[]
└── resources[]
```

`candidates` contain normalized possible datasets. `issues` retain source problems without hiding valid units. `progressionEvidence` records source proof that a cohort may advance but does not assign a lifecycle stage. `resources` attach books or other supporting material to a canonical dataset and source unit. Adapters may preserve a candidate-only compatibility method, but new consumers use the complete result. Curriculum adapters must not import lifecycle, React, application orchestration, or persistence modules. A lifecycle-owned projection converts accepted progression evidence into lifecycle events.

All grades conceptually preserve Tier 1, Tier 2, and Tier 3, even when a source uses different labels or a tier is empty. Tier 1 supplies the current writing/dictation module. Tier 2 and Tier 3 are stored as structured metadata and do not automatically enter Tier 1 dictation. Tier 2 will later supply the shared character-reading module without reparsing the original source. Tier 3 remains available for a later activity definition.

Source labels and application meaning must remain separate. `sourceSectionLabel` records what the teacher-authored source visibly calls a section. `instructionalRole` records how the application uses that section. A misleading or forward-looking source label must not silently determine the lifecycle.

The initial source mappings are:

- **Grade 2 Slides:** Explicit Tier 1, Tier 2, and Tier 3 headings map to their matching normalized tiers. The existing Grade 2 parser and practice behavior remain the reference implementation until deliberately moved behind profiles.
- **Grade 5 Slides:** Tier 1, Tier 2, and Tier 3 are extracted from the correct Mandarin table section using its structural role. `This week` and `Coming next week/Core vocab` are preserved as source labels and then mapped through the Grade 5 rules below.
- **Kindergarten Sheets:** `Writing character` maps to Tier 1, `High frequency word` maps to Tier 2, and Tier 3 is an empty array. Weekly tabs such as `Week 6 09/21` are separate source units within the same yearly workbook.

Grade-specific adapters may recognize different layouts and separators. No grade may infer its structure, validation rules, word limits, or practice behavior from another grade’s source profile. Duplicate source terms are permitted where a grade profile allows them and must not cause the candidate to be rejected merely because the normalized text repeats. Every teacher-supplied occurrence is authoritative and becomes a distinct ordered practice target. Its stable `targetOccurrenceId` is derived from the canonical dataset, tier, and source position so repeated text cannot collide or be deduplicated away. Acquisition, each configured Test Review, and other source-ordered lifecycle flows present and score every required occurrence separately.

Warmup uses a different identity boundary. After occurrences become mastery-eligible, repeated occurrences of the same normalized term link to one long-term mastery term within the same activity module, vocabulary tier, and language. Their source occurrences and history remain intact as provenance, but an ordinary Warmup queue contains at most one entry for that mastery term. The same text in different skills—such as Tier 1 writing and Tier 2 reading—remains separate.

## Automatic curriculum-source import

The administrator’s Google account is authorized once with read-only access to the configured curriculum sources. Parents do not need Google access or authorization. Each importer must inspect the assigned source through an approved read-only path before creating candidates. If access fails, report the exact permission error, stop, and never fabricate structure or vocabulary.

Before any Firestore write, show a dry-run summary of the source units, assigned weeks, normalized date ranges, tier counts, duplicates, conflicts, malformed units, and canonical records that would be written. Proceed only with reviewed, validated output.

Every Monday at 3:00 p.m. California time, using `America/Los_Angeles`, the importer checks each active grade source. This is a synchronization schedule, not a lifecycle clock: a check that finds no new valid source unit must not advance or reset any cohort. Scheduling is enabled only after manual and shadow validation passes.

The shared import pipeline must:

1. Read the configured source through its grade-specific adapter.
2. Inspect every relevant slide or weekly tab currently present.
3. Extract Tier 1, Tier 2, and Tier 3 without mixing unrelated prose into vocabulary.
4. Preserve multi-character terms as single items and retain allowed duplicate occurrences.
5. Preserve raw dates and normalize dates only through approved grade-specific rules.
6. Preserve source file identity, source-unit identity, section label, instructional role, assigned week, content fingerprint, and import time.
7. Classify valid, duplicate, confirmation, conflict, malformed, and explicitly recognized no-instruction outcomes.
8. Prevent duplicate canonical writes and preserve all previously valid datasets.
9. Generate missing canonical Mandarin audio for newly accepted terms when the audio service is available.
10. Record a deterministic import log.

### Same-week collisions and confirmations

The canonical weekly key is `grade + school year + normalized week start + normalized week end`.

When two candidates resolve to the same key:

1. Identical normalized vocabulary and status are duplicates; keep one canonical result and preserve both provenance records.
2. A later confirmation section and an earlier source occurrence with identical content describe the same dataset; the later occurrence adds confirmation provenance rather than creating a second dataset.
3. A source occurrence that later appears in a confirmation role with the same content fingerprint confirms the existing dataset instead of creating a new one.
4. Different target content for the same key is a conflict. Do not automatically write either new version and preserve the previously valid dataset.
5. Resolution requires correcting the source or explicitly activating an administrator-reviewed revision.

Slide order and tab order never resolve a collision.

### Malformed-data reporting

Valid source units may import while malformed units are preserved as issues. Each run records:

- Overall status: `success`, `success_with_warnings`, or `failed`.
- Grade, source type, source ID, and run time.
- Valid dataset, duplicate, confirmation, conflict, and malformed counts.
- Affected slide or tab and affected instructional week.
- Stable error code and human-readable explanation.
- Confirmation that the previous valid dataset was preserved.

The notification layers are a permanent server-only structured import log, an `attention_required` Cloud Logging event with error severity, administrator email from a log-based alert, and an administrator dashboard listing unresolved issues. Parent and child interfaces never display technical importer errors.

A malformed source is not treated as a transient server failure. Scheduled execution may finish with `success_with_warnings`, emit the alert once for the unresolved source condition, and avoid repeated automatic rewrites or noisy retries.

### Approved and deferred Kindergarten source rules

Kindergarten weekly cycles are Monday through Sunday. The date displayed in a weekly tab title maps to the containing cycle: normalize backward to the previous-or-same Monday, then forward six days to Sunday. For example, `Week 4 09/08` maps to `2026-09-07` through `2026-09-13`, and `Week 6 09/21` maps to `2026-09-21` through `2026-09-27`. This rule never uses tab position or a future tab. A valid vocabulary set activates for teaching on its Monday; if a later weekly vocabulary set is absent, the latest arrived teaching set remains current without inventing a replacement. Unit 1 is explicitly configured as August 31 through September 27. Every arrived Unit 1 dataset belongs to one cumulative Test Review group while the newest arrived dataset remains concurrently available for Acquisition. On September 28, the Unit 1 datasets leave review and become Mastered. Empty-tab/no-instruction meaning and child-facing production activation remain deferred.

Grade 5 and Kindergarten writing-workshop or intentional no-instruction markers are also deferred. Each profile keeps an explicit extension point, but an empty source unit is malformed until a trusted marker is defined. It must never be guessed to be a workshop.

## Weekly assignment rules

- Every weekly focus is a permanent dataset identified by its assigned instructional date range, such as `8/31–9/4`.
- Dataset IDs are stable and are never replaced by labels such as current, previous, or preview.
- Lifecycle labels and transitions come from the grade’s explicit practice profile and the ordered collection of accepted datasets rather than from one dataset's end date in isolation.
- Vocabulary datasets progress through Future, their grade's configured Acquisition and Test Review pathways, and then Mastered. Kindergarten permits a dataset to belong to the cumulative unit review while the newest dataset is concurrently in Acquisition. Mastered datasets and words are never removed or made unavailable: they remain permanent, retain their source provenance, lifecycle history, attempts, and scores, and supply the long-term Warmup pool.
- A weekly end date never expires a dataset by itself. Grade 2 and Grade 5 hold assignments until their next validated progression event. Kindergarten holds the latest arrived teaching set through a source gap, accumulates arrived sets through the explicit unit end, and moves the completed unit to Mastered on the following Monday.
- Malformed, conflicting, duplicate-only, and no-valid-dataset import outcomes do not advance lifecycle assignments. An already accepted Future dataset may activate on its approved activation date, but rereading the same duplicate source does not create an additional transition.
- An explicitly recognized writing-workshop/no-instruction unit does not replace the current vocabulary cohort or advance lifecycle assignments. Future writing-workshop activities may build a remediation Acquisition set from Mastered words that meet an approved error rule, but that selection and teaching policy is deferred and must never be inferred automatically.
- Warmup is offered before every Acquisition or Test Review pathway and is also available through its own independent entry point for every grade. Whether a pre-activity Warmup may be skipped is controlled explicitly by `preActivityWarmupRequirement: 'optional' | 'required'` in that grade and module profile. Grade 2 and Kindergarten each explicitly own an `optional` development setting; Kindergarten does not inherit that choice by object identity. Grade 5 remains undecided. When a profile permits skipping, a skipped Warmup creates no Warmup result, attempt, graph point, or mastery update. A child does not need to enter Acquisition or Test Review to use standalone Warmup.
- Acquisition and one or more Test Review stages may be visible in the same instructional week. Each offers its own independent Warmup before the primary segment, using that grade and module's explicit requirement policy.
- Tier 1 writing and future Tier 2 reading use separate attempts, adaptive state, and scores even when they originate from the same weekly dataset.

Use `2026–2027` as the display school-year value. Use the normalized ASCII token `2026-27` only inside deterministic IDs. Each dataset receives a deterministic internal ID formed as `grade__school-year__week-start__week-end`, such as `grade-2__2026-27__2026-09-07__2026-09-11`. The date components use normalized ISO dates even when the slide uses a shorter date format. Each ordered vocabulary occurrence receives a stable occurrence identity downstream of that dataset ID; normalized text alone is never used as the unique key. The IDs prevent duplicate imports, preserve intentionally repeated targets, separate the same week across grades or school years, and link datasets to words, attempts, scores, and history. They are internal Firestore keys and are not displayed to children; user-facing screens show the date range and vocabulary instead.

### Grade lifecycle profiles

The current Grade 2 reference profile uses replacement-driven progression:

```text
Newest valid activated vocabulary dataset: Acquisition
→ immediate valid predecessor: Test Review
→ every older valid vocabulary dataset: Mastered and Warmup-eligible
```

Grade 2 Acquisition uses the routine-specific timers in the Shared Acquisition contract below; it does not use one generic Acquisition timer. Grade 2 uses a 10-second Test Review timer. A dataset remains in its current assignment through the weekend and whenever no valid later vocabulary dataset activates.

Kindergarten uses an explicit unit lifecycle:

```text
Newest arrived weekly dataset in the active unit: Acquisition
Every arrived dataset in that unit: cumulative Test Review group
→ Monday after the configured unit end: Mastered and Warmup-eligible
```

Unit 1 runs August 31 through September 27, 2026, with one cumulative review cycle. The current week may therefore be present in both the Acquisition pathway and the unit-review group; its primary assignment remains Acquisition. Missing weekly vocabulary holds the latest arrived Acquisition dataset and adds no invented review member. Empty tabs remain malformed until an approved source marker distinguishes review, no instruction, and other intentional empty states.

Grade 5 uses an additional review stage:

```text
Acquisition
→ Test Review 1
→ Test Review 2
→ Mastered and Warmup-eligible
```

Grade 5 transitions are driven only by validated instructional source progression, never by elapsed calendar weeks:

- On a slide for instructional week W, the bottom Mandarin row labeled `Coming next week` or `Core vocab` supplies the Acquisition candidate assigned to W. Despite its visible label, this row is not a future preview in the application.
- On the next validated instructional slide, the same content appearing under `This week` confirms the existing candidate and places it in Test Review 1. It does not create a second dataset.
- The candidate from two validated instructional source steps earlier is in Test Review 2, whether or not it is repeated as a separate source section on the current slide.
- After Test Review 2, the dataset becomes Mastered and eligible for Grade 5 Warmup.
- Each fully validated new Grade 5 slide advances every active cohort by exactly one stage and introduces exactly one new Acquisition cohort. The number of elapsed calendar weeks is irrelevant.
- A week with no new instructional slide, such as a parent-teacher-conference week, freezes every Grade 5 dataset in its current lifecycle position. The next fully validated slide after the gap advances the cohorts once, not once per missed calendar week.
- A missing, malformed, or conflicting source unit is not a valid advancement step. All existing cohorts remain in place, while any otherwise extractable new bottom-row cohort remains pending and inactive until the issue is resolved.
- If the top `This week` confirmation differs from the prior bottom-row source, preserve the prior canonical vocabulary and lifecycle stage. Do not activate the new bottom-row cohort or advance any dependent cohort until an administrator corrects the source or explicitly activates a reviewed revision.
- Test Review 1 and Test Review 2 use the same timer, prompt sequence, scoring rules, completion rules, and abandonment behavior. Only their lifecycle labels and selected cohorts differ. The child may explicitly skip the entire activity; that choice is recorded as skipped and creates no Test Review answers or score. Any completed Warmup results remain saved.
- Grade 5 Test Review 1 and Test Review 2 each use a 10-second timer. A visible Skip Timer control may end the remaining countdown and move directly to that word's review frame; it never skips the word, its self-assessment, or its scoring obligation.
- Acquisition, Test Review 1, and Test Review 2 each offer a separate Warmup containing up to six unique terms. Completing one pathway's Warmup does not satisfy another pathway's Warmup. If Grade 5 is later approved as `optional`, skipping one pathway's Warmup likewise will not satisfy another pathway.

The observed sequence is:

| Instructional source step | Acquisition | Test Review 1 | Test Review 2 |
|---|---|---|---|
| Week 4 activation baseline | `需要、部分、重要、开始、各种各样` | Not reconstructed | Not reconstructed |
| Week 5 example | `怎样、吸收、通过、像、如果` | `需要、部分、重要、开始、各种各样` | Not reconstructed |
| Following validated slide | `或者、了解、完、兴奋的、告诉` | `怎样、吸收、通过、像、如果` | `需要、部分、重要、开始、各种各样` |
| No-slide conference week | No change | No change | No change |

Week 4 is the Grade 5 activation baseline. Do not reconstruct Test Review cohorts from the inconsistent Week 1–3 startup slides. Preserve those earlier slides as source provenance or import issues without guessing lifecycle positions.

Grade 5 Tier 1 candidates currently accept 3–10 terms. Duplicate Tier 1 terms within one source week are allowed. Earlier startup slides that do not satisfy the approved structural and count rules are import issues and must not be guessed into lifecycle positions.

### Warmup eligibility and the Grade 2 reference policy

Warmup is a practice pathway, not another canonical dataset identity. Its approved model keeps five concepts separate:

1. A curriculum occurrence records one teacher-assigned appearance in a weekly dataset.
2. Mastery eligibility determines whether that occurrence may contribute to Warmup.
3. Child mastery evidence records `unassessed`, `demonstrated`, or `support-needed`.
4. A scheduling bucket records `recent-entry`, `needs-attention`, or `mastery-rotation`.
5. A Warmup visit materializes a queue and records its own progress and score.

A curriculum occurrence becomes mastery-eligible only after it leaves the grade's final configured Test Review stage. For Grade 2 this means after Test Review; for Grade 5 it means after Test Review 2. The lifecycle advances independently of whether one child completed the review. Previously earned mastery remains available across school years. Active Acquisition, any active Test Review stage, unrecognized no-instruction, malformed, or unresolved occurrences in the child's current grade and school year suppress the matching term from Warmup; occurrences outside that current scope do not suppress longitudinal mastery. The application layer supplies only that child's authorized historical curriculum and excludes unrelated or future grade history.

The stable long-term mastery identity is activity module + vocabulary tier + language + normalized term. The initial normalizer version is exactly `mastery-normalizer-v1`. It applies Unicode NFC, trims leading and trailing whitespace, collapses repeated internal whitespace, preserves character form and case, and never silently combines Simplified and Traditional forms. Derive each mastery-term ID deterministically from that complete canonical tuple using a path-safe encoding or digest; never place raw vocabulary directly in a Firestore path. Store the complete canonical tuple alongside the ID and reject or quarantine any collision or tuple mismatch. Grade, school year, dataset, week, and occurrence ID remain provenance rather than identity. A matching active occurrence in the child's current grade and school year—defined by the same normalized term, activity module, vocabulary tier, and language—suppresses the mastery term from Warmup, even when an older occurrence is already Mastered. Suppression does not cross modules: Tier 1 writing and Tier 2 reading remain independent.

When a term first becomes mastery-eligible, its latest valid completed result from the final Test Review initializes its child-specific placement. A correct result creates `demonstrated` evidence in `recent-entry`; an incorrect result creates `support-needed` evidence in `needs-attention`; no valid scored result creates `unassessed` evidence in `recent-entry`. Skipped, abandoned, and unanswered records may identify the child and occurrence for that unassessed initialization; provisional evidence is ignored. A reused attempt ID with conflicting payloads is rejected before evidence selection. If several conflict-free valid results exist, use the latest reviewed timestamp and then stable attempt ID as the deterministic tie-breaker. This initialization does not count toward a Warmup promotion streak.

When a later weekly occurrence links to an existing mastery term, integrate that occurrence exactly once and preserve all occurrence provenance. New incorrect final-review evidence moves the term to `needs-attention` and resets its streak. New correct or missing evidence normally returns it to `recent-entry` with a reset streak, but it must not erase an existing `needs-attention` recovery requirement. While the new occurrence is active, the term remains suppressed from Warmup.

Grade 2 uses these allocation and Recent Entry rules; the Needs Attention recovery rule applies to every grade:

- A first correct Warmup assessment while `unassessed` changes the evidence to `demonstrated`, remains in `recent-entry`, and increments the Recent Entry streak.
- Two consecutive correct Warmup assessments in `recent-entry` move the term to `mastery-rotation` and reset the streak.
- A correct assessment while recovering in `needs-attention` increments the recovery streak but preserves `support-needed` evidence and remains in `needs-attention` until the third consecutive correct response.
- The third consecutive correct recovery assessment changes the evidence to `demonstrated`, moves the term to `mastery-rotation`, and resets the streak. The three-correct recovery threshold applies to every grade.
- A correct assessment in `mastery-rotation` preserves `demonstrated` evidence and `mastery-rotation`, with no recovery streak.
- Any incorrect Warmup assessment moves the term to `needs-attention`, records `support-needed`, and resets the streak.
- Skipped and unanswered prompts do not change evidence, bucket, or streak.
- A standalone Warmup has a maximum of 16 unique terms: 8 Mastery Rotation, 4 Recent Entry, and 4 Needs Attention.
- A pre-activity Warmup has a maximum of 6 unique terms: 3 Mastery Rotation, 2 Recent Entry, and 1 Needs Attention.
- After the initial allocation, fill unused positions from remaining unique terms in this order: Needs Attention, Recent Entry, Mastery Rotation.
- Never repeat a term merely to reach the configured maximum. If only five unique eligible terms exist, a completed five-term queue is recorded as five of five, not as a partial five of sixteen.

Mastery Rotation is persistent per child and activity module. Correct and incorrect assessments both consume the current cycle opportunity. Grade 2's explicit profile uses unique ordinary terms, exhausts eligible Rotation terms before reuse, advances the cycle only after exhaustion, makes newly promoted terms eligible in the next cycle, and never starts another cycle in the middle of a materialized visit merely to fill its queue. Duplicate behavior, exhaustion, cycle advancement, and promoted-term eligibility are profile-controlled; no grade silently inherits a complete Grade 2 profile. Grade 5 has approved a six-term pre-activity maximum but still needs explicit standalone allocation, promotion, duplicate, and rotation settings. Kindergarten now explicitly owns its current compatibility values; later calibration must update the Kindergarten profile directly.

The legacy occurrence-keyed state maps to the new model as follows: `recent-review` becomes `recent-entry`; `errored-word` becomes `needs-attention` with `support-needed` evidence; `random-rotation` becomes `mastery-rotation`; and `acquisition` is not a Warmup bucket. When several occurrence records collapse into one mastery term, Needs Attention wins over Recent Entry, and Recent Entry wins over Mastery Rotation. Conflicting streaks reset to zero, occurrence links are combined, the latest review and error timestamps are retained, and migration never invents demonstrated evidence when the stored history cannot prove it. Existing monthly aggregates remain preserved as legacy reports.

Every enabled grade and activity module whose primary teaching strategy uses Distractor Trials must have at least six eligible Familiar DT terms before that primary activity is activated. The approved interim **Familiar DT** pool contains `一、二、三、四、五、六、七、八、九、十、大、小、上、下、人、水`—numbers one through ten, big, little, up, down, person, and water. This same easy term list seeds separate Tier 1 writing and Tier 2 reading DT pools for every grade, but the two modules maintain separate per-child performance state and attempts. The list is a versioned DT bootstrap profile, not handwritten weekly curriculum, a canonical weekly dataset, or a fallback that may hide a failed source import. It is intentionally replaceable: future child-specific Familiar DT pools will be derived from that child's demonstrated and mastered words over successive years. Whether a bootstrap DT also receives a mastery-term record must be explicit; it cannot bypass the approved Warmup identity and evidence rules.

If a configuration or data error leaves a DT-dependent primary teaching activity with fewer than six eligible DT terms, fail that activity closed with an administrator/setup state. Never borrow active Acquisition or Test Review targets to fill a DT pool or a Warmup. This DT safety rule does not create a six-term minimum Warmup: an ordinary Warmup completes successfully with however many unique mastery-eligible terms were assigned.

Every completed Warmup response is durable and contributes to the module’s Warmup history even when the child stops before reaching the visit target. Tier 1 writing Warmup and Tier 2 reading Warmup never share adaptive mastery state.

### Warmup continuity and analytics

At the start of each Warmup, create a durable visit record and materialize its target order and source buckets. Preserve the visit ID, Warmup type, configured maximum, assigned queue size, ordered mastery-term IDs, source occurrence and dataset provenance, source buckets, current position, completed self-assessments, started and updated times, revision, and `in_progress`, `partial`, `completed`, or `skipped` status. Saving this state prevents a refresh or device change from drawing a different set or consuming shuffle-bag entries twice.

Before presenting every unanswered queue entry, revalidate active-term suppression using the complete normalized-term + activity-module + vocabulary-tier + language identity. If a matching occurrence has become active since the queue was materialized, mark that entry `unavailable`, do not present or score it, leave completed attempts unchanged, do not reorder the queue, and continue deterministically to the next pending entry.

Update the same Warmup visit and its graph point after each completed self-assessment. An unanswered prompt does not affect accuracy or adaptive state. Consecutive-correct streaks belong to the child mastery state and persist across Warmup visits until a transition resets them. An unfinished pre-activity Warmup resumes before its associated Acquisition or Test Review begins unless that profile is `optional` and the child explicitly chooses **Skip Warmup**. Completing a pre-activity Warmup automatically enters the primary activity the child originally selected. Once that primary activity begins, the finalized Warmup visit cannot reopen. An unfinished standalone Warmup remains available to resume; if the child explicitly ends it, retain the assessed items and mark the visit partial rather than erasing it. Completing a resumed visit changes that same record to completed instead of creating a duplicate graph point.

### Future baseline DT assessment and long-term maintenance

The interim Familiar DT pool is deliberately small. A later `feature/dt-baseline-and-remediation` branch will establish each child's actual Tier 1 writing and Tier 2 reading DT pools from administrator-imported, versioned standard lists. This feature is separate from weekly curriculum import and must not convert baseline terms into fake weekly datasets.

The intended future flow is:

1. Import an approved standard list for each activity module and applicable grade-history range.
2. Before granting that child access to the module's weekly lifecycles, assess the imported terms in resumable sets until every baseline occurrence has been tested.
3. Add demonstrated terms to that child's usable Familiar DT and long-term Warmup pool for the matching module.
4. Preserve prior-grade learned vocabulary across school years so the Warmup pool grows longitudinally rather than resetting each year.
5. Maintain forgotten vocabulary through Warmup. The planned rule is an immediate correction cycle after one error and transfer to a separate reacquisition queue after three errors so the term can be explicitly retaught.

Tier 1 and Tier 2 baseline lists, assessments, DT pools, errors, corrections, and reacquisition records remain separate even when they contain the same written term. The baseline visit must be durable and resumable because Grade 2 and Grade 5 children joining the application may need to assess a large amount of earlier Kindergarten and prior-grade vocabulary.

The full standard lists, assessment-set size, error-window semantics, correction routine, and reacquisition sequence are deferred to that branch. Until it is approved, development uses only the versioned bootstrap pool above. The future feature must define whether the three-error threshold is consecutive or cumulative and must keep baseline remediation separate from the active weekly Acquisition cohort unless an explicit product rule links them.

### Shared Acquisition contract

The intended Acquisition structure for every grade includes Introduction, Familiar DT and Earned DT opportunities, Expanded Trials, Correction, and promotion of learned weekly targets into the Earned DT pool. “Distractor Trial,” abbreviated DT, is the canonical product and code terminology. Familiar and Earned describe the target presented during that trial. `established` remains accepted only while reading legacy persisted records and normalizes to `familiar`; new code and writes use Familiar DT terminology. The response modality comes from the activity module: Tier 1 dictation hides the target during assessed writing trials, while Tier 2 reading shows the character or word for the child to say aloud.

Each progression stores a `practiceStrategyId` and strategy version. The exact pool, sequence, timers, scoring events, and correction rules below are the canonical Grade 2 reference strategy. Kindergarten and Grade 5 may explicitly reuse or override individual parameters after review; they must never receive Grade 2 behavior through an undocumented fallback.

#### Grade 2 Acquisition strategy v3

Every Acquisition trial uses the same child-facing cycle: timed writing prompt, reveal/review frame, Yes/No response, then the next writing prompt without an extra transition screen. Show/copy prompts visibly show the word; all other writing prompts hide it. Familiar DTs use the approved placeholder pool `一、二、三、四、五、六、七、八、九、十、大、小、上、下、人、水`. Show/copy responses may receive a Yes/No response for interaction consistency, but no copy-trial correctness data is saved. Hidden weekly-target trials, Familiar DT trials, and Earned DT trials are recorded. Hidden weekly-target and Earned DT trials contribute to the official Acquisition visit score; Familiar DT performance remains outside that score and is stored in the separate DT-observation stream below.

Introduction presents two different Familiar DTs for 5 seconds each, one 10-second show/say/copy target trial, then one 10-second hidden weekly-target trial. The two DTs follow shuffle-bag rules and cannot repeat when an alternative is available. A correct hidden response starts Expanded Trials; an incorrect response starts Correction.

Expanded Trials use the exact 10-position sequence `target, DT, target, DT, DT, target, DT, DT, DT, target`. Its four hidden weekly-target timers are exactly 10, 9, 8, and 7 seconds. Every DT position independently chooses 50% Familiar DT and 50% Earned DT when both pools are available; while the Earned DT pool is empty it uses Familiar DT. Familiar and Earned pools each use shuffle-bag rotation, exhaust their eligible members before reuse, and prevent consecutive DT repetition when an alternative exists. An incorrect weekly-target response immediately enters Correction. Completing the sequence promotes that current-week target into the Earned DT pool and starts Introduction for the next target.

Correction uses the exact sequence `visible copy, visible copy, visible copy, hidden target, new Familiar DT, final hidden target`. Copy and hidden-target trials use 10 seconds; the Familiar DT uses 5 seconds. Copy responses are not saved, the DT response is saved separately, and both hidden target responses are saved for the visit's Acquisition score. The final hidden response determines success. After successful Correction, the child returns to the next unfinished position in the interrupted teaching sequence; Correction does not silently complete the weekly target or restart completed Expanded positions. An incorrect final response repeats Correction. Three consecutive scored errors for a weekly target or Earned DT restart that word at Introduction. Any correct scored response resets that word's consecutive-error count. Familiar DT errors are recorded but do not turn the placeholder DT into a weekly Acquisition target.

The Grade 2 Acquisition score is visit- and trial-based. When the child selects **Done for today**, create that visit's score from every scored hidden weekly-target or Earned DT response completed during the visit, including Introduction, Expanded Trials, Correction, and ongoing Earned-DT practice. Repeated attempts remain separate scored trials and must not be collapsed to one final answer per vocabulary word. Familiar DT and show/copy responses never contribute to the Acquisition score. If the visit contains no scored hidden weekly-target or Earned DT response, create no Acquisition dataset score; any assessed Familiar DT responses are still saved.

After every weekly target completes its teaching sequence, Acquisition remains available as ongoing DT-only practice. Each new DT-only opportunity uses the same 50% Familiar DT and 50% Earned DT choice and shuffle-bag rules. The child ends this open-ended practice with **Done for today**. A visit containing Earned DT responses creates an Acquisition score from those scored trials; a Familiar-DT-only visit creates no Acquisition score.

### Tier 1 DT observation and scoring boundary

Tier 1 Acquisition supports a versioned practice-profile option such as `dtObservationMode: collect | discard`. The approved forward configuration is `collect`; `discard` remains available only for controlled compatibility testing or an explicitly configured environment. In collect mode, every reviewed Familiar DT and Earned DT creates a durable correctness observation for that individual DT.

Every DT response remains available as a separate longitudinal learning signal. Familiar DT correctness is not part of the Acquisition dataset score, and a Familiar DT error does not interrupt the current Acquisition sequence, enter Correction, remove DT status, or add the term to a reacquisition set. Those consequences remain disabled until the baseline/remediation branch defines and tests the policy. Earned DT responses also count as scored Acquisition trials; an incorrect Earned DT enters the same Correction routine, then returns to the exact interrupted weekly-target position. Each Earned DT response appears once in longitudinal DT history; reuse or link its stable attempt record rather than creating a duplicate correctness event.

Each collected DT observation must include:

- Stable, idempotent observation ID derived from the Acquisition progression, trial position, and DT identity.
- Child ID, activity module, tier, grade, school year, and application version.
- Stable DT term ID, normalized term text, pool type (`familiar`, future `standard-list`, or `earned`), and pool/list version. Legacy `established` values are read only for migration and normalized to `familiar`.
- Acquisition dataset and progression context, lifecycle stage, routine, and exact trial position.
- Whether the term was a Familiar DT or Earned DT.
- Right/wrong self-assessment, presentation time, review time, and whether Skip Timer was used.
- Created and updated timestamps and synchronization status.

Do not store handwriting with the observation. During local-only development, observations persist in the child's local AppState. In authenticated cloud mode, they synchronize to a family-owned per-child DT-observation collection in Firestore. Canonical DT profiles and standard lists remain server-managed; a browser observation may never alter the shared list itself.

Per-term counts and accuracy may be derived from the observation history, but the initial implementation must retain the underlying events so later correction, forgetting, and reacquisition rules can be tested against real longitudinal data. Until those rules are approved, reports must label this as DT performance data rather than a completed weekly score or authoritative mastery decision.

### Acquisition continuity and persistence

Acquisition is one durable teaching progression per child and canonical dataset, not a collection of independent daily sessions. A child may complete the progression across multiple visits and multiple days. After every completed trial, the app saves both the trial result, when the trial is scored, and the exact next teaching position. Closing, refreshing, signing out, switching devices, or returning on a later day must resume the child at that next position rather than restarting the first word.

The durable progress record must preserve enough state to reproduce the next step without changing the teaching sequence:

- Child ID and stable dataset ID.
- Activity module, vocabulary tier, lifecycle stage, practice strategy ID, and strategy version.
- Ordered target list and current target index.
- Current routine: Introduction, Expanded Trials, or Correction.
- Exact step within the current routine, including the ten-position Expanded Trials sequence.
- Current hidden-target timer value.
- Completed target words and the Earned DT pool.
- Familiar DT and Earned DT shuffle-bag state, including the most recently used DT.
- DT observation mode and the stable DT observation ID for a reviewed DT trial when collection is enabled.
- Consecutive scored-error count for the current word.
- Completed scored trials, with stable attempt IDs for duplicate prevention.
- Last completed step, next step, last-updated time, completion state, and application version.

The saved trial and next-position update must be atomic or idempotently recoverable so a retry cannot skip or count a trial twice. When a reviewed trial produces a DT observation, saving that observation and advancing to the next position must use the same idempotent checkpoint boundary. If the child leaves after beginning but before completing a trial, that one incomplete trial restarts; completed trials, completed words, timer progression, pools, sequence position, and previously reviewed DT observations remain intact. **Done for today** saves the exact next position and creates a visit score only from that visit's hidden weekly-target responses. Valid partial Acquisition trials, DT observations, and teaching state remain in progress history across visits and devices.

A new Acquisition progression begins when a different canonical weekly dataset is successfully imported, validated, and activated for that child’s grade, school year, and activity module. The new current-week set enters Acquisition even if the prior set was unfinished; the prior set advances to Test Review on schedule and does not hold the new set back. Its unfinished Acquisition progression remains attached to its stable dataset ID and is available from that Test Review activity through a clearly labeled secondary action such as **Learn 9/21–9/25 words**. A duplicate import, confirmation, failed import, malformed source unit, no-slide instructional pause, refresh, new day, or application update must not erase or replace existing Acquisition progress.

Dataset selection filters by the child’s grade and school year before resolving lifecycle state through that grade’s practice profile. If a configured grade has no validated datasets yet, the child sees the existing empty-state or eligible Warmup fallback behavior. Adding or activating Kindergarten and Grade 5 datasets must not delete or rewrite any existing Grade 2, Grade 5, or other historical records.

## Vocabulary metadata and future activity types

Vocabulary records carry `language` (`mandarin` or `english`), `tier` (`tier-1`, `tier-2`, or `tier-3`), `activityType` (`dictation`, `reading`, or `spelling`), ordered source occurrence, and source provenance. A weekly dataset preserves all normalized tiers even when the current application activates only Tier 1 dictation. The model must not require reparsing a source merely to enable Tier 2 reading later.

## Practice flow

Every dictation prompt speaks the Mandarin term aloud, offers Replay, gives the child a writing surface, and runs the configured prompt timer. A visible **Skip Timer** control lets a child who has finished early proceed to the required review frame. It does not skip the target, create an unanswered result, bypass self-assessment, or change scoring. Grade 2 uses 10 seconds for Warmup, the routine-specific Acquisition timers above, and 10 seconds for Test Review. Grade 5 uses 10 seconds for Test Review 1 and Test Review 2; its other timers remain profile values.

Warmup and Test Review preserve the set-based flow: dictate the selected terms without showing their answers, then reveal each answer during the review portion and collect the child’s I got it right or I got it wrong self-assessment. Acquisition uses its teaching-specific trial flow instead: each timed writing prompt is followed immediately by its reveal/comparison frame and Yes/No response before the next trial. The current implementation may use paper, but the Acquisition handwriting-pad prototype supplies the writing surface and comparison behavior described below.

The word/context/repeated-word audio sequence uses one-second pauses. Warmup uses the same sequence at approximately 1.5 times the normal speech rate, capped to a safe browser-supported rate.

Persistence on interruption is lifecycle-specific:

- **Warmup:** Save each completed self-assessment immediately, including its source bucket and source word/dataset identity. Preserve partial-session history, attempted count, accuracy, and adaptive-state changes. An unfinished pre-activity Warmup resumes before its associated Acquisition or Test Review path continues unless its profile is `optional` and the child explicitly chooses **Skip Warmup**. A started but unanswered prompt is not counted and may restart. Where skipping is permitted, a skipped Warmup creates no result.
- **Acquisition:** Save every completed trial and the exact next teaching position as described in Acquisition continuity and persistence. Resume later from that point. A started but unfinished trial may restart without rolling back earlier completed work.
- **Test Review 1 or 2:** Keep answers provisional until every required target in that review has been assessed. If the child leaves, refreshes, signs out, or otherwise abandons the review, discard its temporary answers and do not create a score, adaptive-state update, or completed Test Review record. The child may also explicitly choose **Skip Test Review** before or during the activity; save any completed Warmup results, create no Test Review answer or score, and record the activity outcome as `skipped`, not `completed`. Previously completed sessions remain intact. A metadata-only abandonment audit may be retained, but it must not contain or count provisional answers as results.

### On-screen handwriting exploration

Before the production pilot, prototype an on-screen handwriting pad for Acquisition so a child cannot refer to previously written paper answers during later target trials. Use pointer input that supports touch, stylus, and mouse. The child writes in a clear canvas during the timed prompt; after submission or timer completion, the next review frame displays a snapshot of that writing beside the canonical Mandarin term and asks the child to mark it right or wrong. Clear and hide the prior writing before the next prompt.

Show/copy trials continue to display the canonical term while the child writes; hidden weekly-target, Familiar DT, and Earned DT trials do not. Provide child-friendly Clear and Undo controls without exposing the answer early. If a canvas trial is interrupted before self-assessment, discard only that temporary drawing and restart that trial while retaining the last completed Acquisition position.

Keep raw strokes and drawing snapshots in browser memory only for the immediate comparison by default. Do not upload or permanently store handwriting unless a later privacy, retention, deletion, and family-access review explicitly authorizes it. Persist the trial result and learning-state metadata, not the drawing. Test the prototype on representative phone, tablet, stylus, and desktop input, including accidental scrolling, orientation changes, small screens, and reduced-motion or accessibility settings. Decide whether the handwriting pad replaces paper or remains an optional mode only after child usability testing.

### Reinforcement and completion rewards

Reward work is deferred to a separate Kindergarten-only feature branch. The current product direction is cumulative stars that may later be exchanged for parent-approved free time or a relaxing/reinforcing activity, but award rates, redemption values, controls, and persistence rules are not yet approved. Do not introduce rewards into Grade 2 or Grade 5 until the Kindergarten system has been implemented and evaluated.

Rewards must never change scoring, reveal an answer early, penalize mistakes, use competitive leaderboards, or create loss-based streak pressure. Animation and sound must be brief, skippable, possible to mute, compatible with reduced-motion preferences, and parent-disableable. The reward branch must define parent controls, duplicate-award prevention, redemption authorization, balance history, and minimum storage before any persistent currency is implemented.

### Tier 2 character-reading pathway

Tier 2 reading is a shared future module for all configured grades. It consumes the preserved `tier2[]` vocabulary from the same canonical weekly dataset without mixing reading results into Tier 1 dictation.

The child-facing response changes from writing to reading aloud:

1. Show the Tier 2 character or word.
2. Ask the child to say it aloud.
3. Provide canonical Mandarin audio through a separate control for review or comparison.
4. Collect an explicit child self-assessment.

Tier 2 uses the same high-level grade lifecycle as Tier 1: Acquisition with Familiar and Earned DTs, Expanded Trials, and Correction; the grade’s configured Test Review stages; and an offered or standalone Tier 2 Warmup using already learned Tier 2 words. Grade 5 therefore uses Acquisition, Test Review 1, and Test Review 2 for both Tier 1 writing and Tier 2 reading, and each pathway offers its own up-to-six-term Tier 2 Warmup. Tier 1 and Tier 2 maintain separate progressions, attempts, adaptive state, Warmup graphs, and scores.

Kindergarten Tier 2 reading has one explicitly calibrated Acquisition exception while the Kindergarten writing strategy remains unchanged. It retains the writing Introduction, then uses five scored independent target presentations separated by 1, 2, 3, and 3 DTs: `target, DT, target, DT, DT, target, DT, DT, DT, target, DT, DT, DT, target`. Those targets use 10, 9, 8, 7, and 6 seconds. Its Correction routine is feedback-only and does not contribute to the official score. A failed final Expanded target returns after Correction as the same scored six-second target, and the word enters the Earned DT pool only after that scored target is correct. This Kindergarten reading strategy remains session-only while it is perfected; Grade 2 and Grade 5 do not inherit it until separately approved.

Tier 2 Familiar DT trials use a separate per-child pool of easy displayed characters or words that the child reads aloud. The interim Tier 2 pool is seeded from the approved bootstrap terms listed above; it uses the same term text as Tier 1 but never shares Tier 1 attempts or performance state. Earned Tier 2 DT items come only from completed Tier 2 reading targets. The future imported standard list and individualized baseline replace the bootstrap configuration only through the dedicated DT-baseline branch.

The first Tier 2 implementation must decide whether it uses immediate self-assessment without retaining audio or includes the previously proposed four-second `MediaRecorder` capture and playback. Voice recording is not assumed merely because the term is read aloud. If recording is included, microphone permission, private family-scoped storage, upload recovery, retention, deletion, supported formats, and cross-device playback must pass a separate privacy and storage review before production.

Following Tier 2 reading, begin a separate English spelling dictation section using the words imported from the ELA spelling list. English spelling results must be reviewed and scored independently from Mandarin dictation and Mandarin reading.

## Scoring and history

The primary metric is percentage correct. Acquisition creates one score per visit when the child selects **Done for today**, using only the hidden weekly-target responses assessed in that visit; a visit with no such responses creates no weekly score. Test Review creates a dataset score only after every required target in that review has been completed and reviewed. Abandoned or explicitly skipped Test Review answers create no score.

Warmup does not create a per-dataset score. It has its own line graph with one point per Warmup visit that contains at least one completed self-assessment. Each point records the local date, Warmup type, configured maximum, assigned queue size, attempted item count, correct item count, percentage correct, and `partial` or `completed` status. Percentage uses attempted count—not configured maximum, assigned count, or unique terms—as its denominator. The graph must display attempted versus assigned so a completed short queue is not mistaken for an abandoned visit. Preserve each attempt's original source bucket so later transitions do not rewrite its historical classification. Monthly Mastery Rotation accuracy is a required derived report calculated from attempt history whose original source bucket was `mastery-rotation`; it must not replace or discard the complete visit and attempt history.

Show a separate history graph for every permanent weekly dataset, ordered newest first, with each score point labeled by activity and date. Acquisition may span several daily visits but remains attached to one stable dataset progression; each **Done for today** visit with at least one hidden weekly-target response adds its own score point.

Tier 1 DT observations use a separate history stream keyed by child, activity module, and stable DT identity. Initially retain event-level right/wrong history and derived attempted, correct, incorrect, and percentage values. Do not merge these values into weekly Acquisition graphs or official dataset percentages. A later DT-policy branch may add dedicated longitudinal reports and state transitions after the meaning of one error, repeated errors, correction, and reacquisition is approved.

Preserve detailed records containing child ID, stable dataset ID and date range, word or DT term ID, grade, activity module, vocabulary tier, lifecycle stage, practice strategy ID and version, unique visit/session ID, stable attempt or observation ID, local session date, correct/incorrect result, error history, Warmup-session history, Acquisition progression ID and position where applicable, complete-source-dataset status, completion status, scoring status, answer-reveal method, and application version. Duplicate attempt, DT observation, progression, or session IDs must never create duplicate trials, observations, or scores.

Reading records preserve the child ID, stable dataset and Tier 2 target identity, lifecycle stage, strategy version, session and attempt IDs, canonical-audio reference, self-assessed right/wrong result, completion state, and timestamps. If recording is approved, they additionally preserve the private storage path, recording format and duration, and upload status. Reading results are never included in dictation percentage scores. The English spelling section has its own answer records and score.

## Audio

Use a consistent Mainland Mandarin China voice. The preferred Google Cloud Text-to-Speech voice is `cmn-CN-Wavenet-C`. Use `en-GB-Neural2-F` for English instructions such as the final review reminder. Generate and cache audio when a new term is imported; Replay uses the stored file.

When an approved `word.sentence` exists, dictation audio should preserve the sequence: word at the current speech rate, a 1-second pause, the approved context sentence, a 1-second pause, the word, a 1-second pause, and the word again. If no approved sentence exists, omit that audio step rather than inferring or generating context from Sentence Frames, examples, slide prose, or unrelated writing content. Warmup multiplies the current rate by approximately 1.5. The review instruction should be available as both visible text and English audio. The current browser speech synthesis is only a temporary prototype fallback; production audio must use the cached Google Cloud files.

For Tier 2 reading, canonical Mandarin audio remains available for pronunciation comparison without becoming the child’s answer. If voice recording is approved, the browser uses `MediaRecorder`; recordings are uploaded only to private family-scoped Firebase Storage or Google Cloud Storage, with metadata and the storage path in Firestore. Permission denial, unsupported formats, or upload failure must provide a clear fallback and must never silently mark a response correct.

The default process is automatic. Later, administrator settings may allow a hidden pronunciation correction for rare or polyphonic characters. Pinyin may be stored internally for pronunciation correction but must not appear in the child interface.

## Administrator functions

Only the administrator manages school years, grade-to-source mappings, source-adapter and practice profiles, active school year, Google read-only authorization, import logs, conflicts, malformed-source issues, reviewed revisions, vocabulary corrections, and pronunciation corrections. Weekly imports require no manual action when the configured source is valid.

## Recommended technology

- Frontend: React, TypeScript, and Vite
- Hosting: Firebase Hosting, publishing the production `dist/` build rather than repository source files
- Parent authentication: Firebase Authentication with email and password
- Application data: Cloud Firestore
- Child-response recordings, if approved: Firebase Storage or Google Cloud Storage with private, family-scoped access
- Scheduled importer: Google Cloud Scheduler
- Import and audio backend: Google Cloud Run
- Curriculum-source access: Google Slides API and Google Sheets API with read-only authorization
- Audio storage: Google Cloud Storage
- Speech generation: Google Cloud Text-to-Speech

Secrets, OAuth refresh tokens, and service credentials must never be committed to the public repository or exposed in browser code.

## Development stages

These stages describe the product scope. The implementation order for the current public launch, cloud persistence, and automatic deck synchronization work is defined by the gated cloud launch roadmap below. A capability implemented in source code is not considered live until its deployment and acceptance gate has passed.

### Stage 1 — Practice prototype and durable learning state

Build the practice experience with canonical importer-derived fixtures and reviewed date-range datasets, profile-controlled pre-activity Warmup, Acquisition and configured Test Review lifecycle phases, randomized words, audio, Replay, phase timers, interstitials, right/wrong review controls, visit-appropriate scores, legacy migration, and separate graphs. Do not use handwritten production sample vocabulary or silent fallback datasets. Persist partial Warmup attempts and Warmup graph points. Persist Acquisition as an exact multi-day teaching progression. Collect Tier 1 DT correctness in a separate observation stream without changing weekly-target scores. Keep abandoned or skipped Test Review work unscored.

### Stage 2 — Accounts and data

Add parent authentication, multiple child profiles, Firestore persistence, archive behavior, cross-device sessions, and security rules separating family data. Cloud persistence must include module-specific Warmup visits and attempts, Acquisition progression state and trials, per-child DT observations, Test Review 1 and 2 temporary state, and scores without mixing their different completion rules. Persistent reward state is added only after the reward prototype defines its minimum schema.

### Stage 3 — Administrator configuration

Add school-year setup, grade-to-source mappings, source-adapter and practice-strategy profiles, active/inactive status, and administrator-only settings.

### Stage 4 — Curriculum-source integration

Add one-time administrator authorization, a manual Sync Now operation, the canonical source boundary, Grade 2 and Grade 5 Slides profiles, the Kindergarten Sheets adapter, Tier 1–3 preservation, source-role mapping, deterministic dataset IDs, content fingerprints, confirmation and conflict classification, reviewed Firestore write plans, dry-run summaries, and malformed-data reporting. Writing-workshop recognition remains an explicit deferred extension for sources without an approved marker.

### Stage 5 — Audio service

Add cached Mandarin and English audio, Replay, Tier 2 canonical-audio playback, and later pronunciation corrections.

### Stage 6 — Automatic operation

Deploy the importer to Cloud Run and schedule it with Cloud Scheduler every Monday at 3:00 p.m. America/Los_Angeles. Add logging, duplicate prevention, and failure notification.

### Stage 7 — Public testing

Test multiple families, Kindergarten, Grade 2, Grade 5, new midyear students, school-year transitions, archived profiles, cross-device parent sessions, exact Acquisition resumption, partial Warmup history, abandoned Test Review cleanup, Grade 5 Test Review 1 and 2 transitions, no-slide lifecycle freezes, handwriting-pad usability, and future weekly email reports. Test Kindergarten reinforcement separately only after its reward rules are approved.

### Stage 8 — Tier 2 reading and English spelling

Activate the preserved Tier 2 data through a shared character-reading module with per-grade Acquisition, Test Review, Warmup, persistence, scoring, and history. Decide whether the first release is self-assessment-only or includes four-second voice recording. If recording is approved, add explicit microphone permission, `MediaRecorder`, private family-scoped uploads, playback, retention and deletion rules, and failure handling. Add English spelling-list extraction, English audio prompts, English dictation, independent English review, and independent English scores later without mixing activity histories.

## Approved implementation dependency roadmap

The canonical source, lifecycle, Acquisition engine/transition, domain-contract, Warmup extraction, pure Adaptive Warmup model, Grade 5 source/lifecycle, Kindergarten source/lifecycle/production-practice scaffold, curriculum import result, and shared Learning Hub boundaries are complete on `main`. Grade 5 and Kindergarten production sources remain deliberately inactive even though their isolated architecture exists.

The persistence initiatives remain separate stored-model boundaries even when one implementation branch is temporarily stacked for integration testing:

```text
updated main after PRs #15 and #16
├── feature/persistent-warmup-visits (implemented; final audit and merge pending)
└── refactor/acquisition-persistence-contract
            ↓ merge
    feature/persistent-acquisition (implemented; final merge sequence pending)
```

Persistent Warmup visits and persistent Acquisition own different stored models. Either initiative may proceed first when it stays within its boundary, but they must not be combined in one branch. Every branch starts from updated `main`; no grade branch is created from another unmerged grade branch.

Warmup compatibility cleanup is deliberately not the next automatic branch after activation. After the migration window and operational gates described below have passed, create `refactor/warmup-facade-cleanup` from the then-current `main` to retire dormant compatibility code and supported legacy reads.

After persistent Acquisition merges, the DT-baseline, handwriting, reward, and Tier 2 modules branch from that updated shared foundation rather than from a Grade 2, Grade 5, or Kindergarten feature branch:

```text
feature/persistent-acquisition
        ↓ merge
updated main
├── feature/dt-baseline-and-remediation
├── feature/handwriting-pad
├── feature/reward-system
└── feature/tier2-reading-lifecycle
```

The DT-baseline branch is deferred until its full lists and behavior are specified. It may implement Tier 1 first and add Tier 2 activation after the reading module exists, but both modules use the same source/version/assessment contract and separate mastery records. Firebase Hosting may be prepared without production data after the source and local persistence foundation is stable. Secure cloud persistence, controlled multi-grade imports, the production pilot, and automatic multi-source synchronization retain their separate acceptance gates. The final ordering of Tier 2 relative to the writing-only production pilot depends on whether the first Tier 2 release stores child voice recordings.

Before starting each branch, stop the development server, verify that the worktree is clean, update `main`, and branch from the updated commit:

```bash
git switch main
git pull --ff-only origin main
git switch -c <next-branch-name>
```

### Phase 1 — Canonical source boundary

Branch: `refactor/canonical-source-boundary`

Goal: separate shared canonical identity and validation from Grade 2 source and practice assumptions without changing existing Grade 2 behavior.

- Introduce the normalized `WeeklyDatasetCandidate` boundary with Tier 1–3 arrays, source metadata, source labels, instructional roles, assigned week, fingerprint, status, and validation outcomes.
- Define a source-adapter contract that accepts both Slides and Sheets payloads without making Google API calls in this branch.
- Give every adapter one shared result containing candidates, issues, progression evidence, and resources. Keep candidate-only adapter access as a compatibility view rather than a second extraction path.
- Define stable ordered target-occurrence identity so identical text from two authoritative source positions remains two practice targets without breaking lexical mastery summaries. Preserve all existing Grade 2 IDs and normalized output where its source terms are unique; introduce occurrence disambiguation without rewriting established identities.
- Preserve the existing Grade 2 importer output, dataset IDs, practice behavior, and tests exactly.
- Move Grade 2-specific parsing and teaching parameters behind named, versioned profiles.
- Include no Grade 5 or Kindergarten vocabulary and perform no cloud writes.

Acceptance gate: normalized Grade 2 output is unchanged, all existing tests pass, source-independent validation is testable with fixtures, and the browser still has no shared-data write path.

### Lifecycle strategy boundary

Branch: `refactor/lifecycle-strategy-boundary`, created from updated `main` after the canonical source boundary merged.

Goal: extract lifecycle assignment from `domain.ts` behind source-neutral contracts without changing the Grade 2 child experience.

- Freeze the existing Grade 2 replacement behavior with golden lifecycle matrices, including weekends, source gaps, delayed replacements, duplicates, malformed input, no-instruction units, grade scope, and school-year scope.
- Keep curriculum stages distinct from child-facing practice phases.
- Resolve one grade and school-year collection through an explicitly registered strategy with no cross-grade fallback.
- Keep the existing Grade 2 resolver as a compatibility wrapper that projects strategy results onto the original canonical dataset objects.
- Route Acquisition, Test Review, Mastery/Warmup eligibility, and lifecycle display through the shared resolution.
- Document Grade 5's future validated progression-event requirement without implementing Grade 5 parsing, vocabulary, or behavior in this branch.

Acceptance gate: the complete Grade 2 golden lifecycle output and object identity remain unchanged, unsupported or mixed scopes fail explicitly, all existing tests and the production build pass, and the branch adds no Google access, Firestore execution, Grade 5 parsing, Kindergarten parsing, or new child-facing behavior.

### Acquisition strategy boundary

Branch: `refactor/acquisition-strategy-boundary`, created from updated `main` after the lifecycle strategy boundary merged.

Goal: extract the existing Acquisition teaching algorithm from `domain.ts` behind generic, source-neutral contracts without changing behavior, public APIs, or stored flow data.

- Freeze the pre-extraction Grade 2 flow with checked-in golden fixtures covering serialized output, prompt and target IDs, timers, sequences, edge-case no-ops, resume behavior, exact public signatures, and the 50/50 DT boundary.
- Move generic target, target-set, strategy, prompt, and flow contracts into `src/acquisition/contracts.ts`.
- Move the pure teaching state machine and shuffle-bag behavior into `src/acquisition/engine.ts`; pass the strategy as an argument rather than importing a concrete grade.
- Make `grade2AcquisitionStrategy` the single owner of its version, timers, sequences, DT observation mode, and complete Familiar DT targets with stable IDs and metadata.
- Keep `src/domain.ts` as a compatibility facade over complete `Word` objects and retain scoring policy, including `shouldRecordAcquisitionAnswer`, outside the engine.
- Keep the existing stored structure and application orchestration unchanged. Document the boundary in `docs/acquisition-strategy-boundary.md`.

Acceptance gate: the extracted engine and compatibility wrappers reproduce the checked-in pre-extraction fixtures exactly; the Grade 2 practice profile references the canonical strategy by object identity; the engine and strategy import only neutral Acquisition contracts; all existing tests and the production build pass; and the final diff contains no changes to `App.tsx`, Firestore clients or rules, or persistence schemas.

### Acquisition transition boundary

Branch: `refactor/acquisition-transition-boundary`, created from updated `main` after the Acquisition strategy boundary merged.

Goal: centralize how one reviewed answer becomes the next teaching flow and a storage-neutral optional assessment without redesigning persistence.

- Return the next flow together with an optional assessment containing the answered prompt identity, complete generic target object, target-occurrence identity, correctness, scoring classification, DT-pool classification, and reveal-method facts.
- Keep child, family, session, timestamp, dataset-envelope, and storage details in the application layer rather than the pure engine or transition.
- Preserve existing public behavior, stored schemas, cloud writes, and exact flow compatibility.
- Defer migrations, revision checks, atomic Firestore writes, malformed-record recovery, and concurrent-device conflict handling to `feature/persistent-acquisition`.

Acceptance gate: every pre-extraction golden transition remains unchanged; weekly-target and DT classifications remain distinct through Earned-DT Correction; the existing stored representation and cloud behavior are unchanged; and all tests and the production build pass.

### Domain contracts boundary

Branch: `refactor/domain-contracts-boundary`, merged before the Warmup extraction.

Goal: give source-neutral modules access to the foundational `Word` and `Dataset` contracts without importing the `domain.ts` compatibility facade.

- Move only the foundational contracts to `src/domain/contracts.ts` and re-export them through `domain.ts`.
- Preserve every field, public import, runtime object, and stored JSON shape.
- Keep application state and feature-specific contracts outside this foundational module.
- Enforce the dependency direction with an architecture test covering all TypeScript-family files under `src/domain/`.

Acceptance gate: no behavior or storage change, exact compatibility exports remain available, and the importer depends on the foundational contracts rather than the domain facade.

### Adaptive Warmup compatibility boundary

Branch: `refactor/warmup-boundary`, merged before this documentation reconciliation.

Goal: mechanically extract the current Grade 2 Warmup algorithm from `domain.ts` without approving or changing its legacy behavior.

- Move the current contracts and pure selection/transition behavior into `src/warmup/`.
- Keep lifecycle resolution, sessions, scoring, persistence, hydration, reporting, React, and Firestore outside the Warmup engine.
- Preserve public names, stored shapes, current IDs, current fill order, and current repetition behavior behind compatibility wrappers.
- Label characterization tests as evidence that the extraction changed nothing, not as approval of the legacy product rules.
- Preserve the legacy Adaptive Warmup branch until every useful assertion has been inventoried and classified as approved behavior, compatibility-only evidence, or obsolete behavior. Recreate approved evidence in the current architecture before deleting the branch; do not merge or cherry-pick it wholesale.

Acceptance gate: the current runtime output remains identical, `domain.ts` remains a compatibility facade, forbidden dependencies are blocked, and no UI, persistence, lifecycle, or child-facing behavior changes.

### Adaptive Warmup state model

Branch: `refactor/adaptive-warmup-model`, created from updated `main` after this documentation branch merges.

Goal: implement the approved Adaptive Warmup identity, evidence, scheduling, and migration logic as a pure, unused model before any production storage or child-facing cutover.

- Add the exact `mastery-normalizer-v1` normalizer and a deterministic mastery-term ID derived from module, tier, language, and normalized term. Use a path-safe encoding or digest rather than raw vocabulary in storage paths, persist the canonical tuple beside the ID, and detect collisions or tuple mismatches.
- Preserve all weekly occurrences as provenance while combining repeated occurrences into one mastery term within the same learning module.
- Keep mastery eligibility, child evidence, scheduling bucket, and visit state as separate concepts.
- Add pure active-term suppression, final-review initialization, exactly-once occurrence integration, Warmup transitions, allocation, shortage filling, and rotation behavior.
- Define a deterministic, idempotent raw v2-to-v3 migration that returns a report, quarantines unresolved metadata, and leaves the original record untouched on failure.
- Reconstruct in a fixed pipeline: validate the explicit profile registry; canonicalize curriculum and immutable provenance; group raw attempts by stable ID before filtering; attach authoritative lifecycle and profile ownership; reconcile rotation cycles; collapse legacy snapshots; integrate occurrences in curriculum order; replay Final Test Review followed by later Warmup evidence; and validate the complete graph before returning a converted record.
- Record historical occurrence integration separately from the mutable current lifecycle projection. Each integration retains the trusted lifecycle strategy and final-review-cycle basis that made it mastery-eligible. Later lifecycle reconciliation may suppress the term without invalidating or erasing that historical fact. Missing, conflicting, invalid, or strategy-mismatched current assignments fail closed and require attention.
- Treat a legacy child-word record as a state checkpoint, not as an event. Reconstruct one deduplicated chronological event stream per child and mastery term, replay only attempts proven to occur after the checkpoint or a later curriculum reset, and retain applied legacy attempt IDs so the same evidence cannot be counted twice.
- Use a profile registry with retained historical definitions, exactly one active profile per grade/module scope, and explicit acyclic version-upgrade or grade-rebind paths. Store the exact scheduling-profile ID, version, and source occurrence on each child mastery state. Upgrade or rebind a state before queue materialization; selection must fail rather than silently use a different profile.
- If an otherwise valid legacy record lacks profile coverage, produce a valid `partial` projection with a deterministic deferred record rather than finalizing an incomplete conversion. A later retry with the required profile reconstructs from the untouched raw version-2 collections and atomically replaces the pure projection; it must not duplicate previously converted evidence.
- Enforce stable attempt IDs globally across legacy results, explicit final-review evidence, integration records, and replayed Warmup attempts. Group an ID before payload filtering, collapse identical copies, and quarantine the complete ID when any copy conflicts or is malformed.
- Infer missing module, tier, or language only from trusted canonical Grade 2 Tier 1 writing data; quarantine unknown or conflicting records.
- Keep the model unused by `App.tsx`, local storage, cloud storage, Firestore rules, and the current Warmup engine in this branch.

Acceptance gate: pure tests cover identity and collision checks, module separation, final-stage eligibility, longitudinal prior-year mastery, current-scope active suppression, repeated occurrences, conflict-free evidence initialization, valid streak invariants, transitions, exact allocations, shortage priority, explicit duplicate policy, explicit rotation policy, deterministic migration, checkpoint replay, profile upgrades, deferred-profile retry, global attempt-ID uniqueness, quarantine, and idempotency. Lifecycle reconciliation must leave a valid historical projection while suppressing unresolved current terms. Grade 5 final-stage tests use a synthetic multi-review strategy and must not register or activate a production Grade 5 lifecycle implementation. Migration preserves unrelated children, grades, modules, orphaned historical records, historical results, and active-term ineligibility; malformed entries are quarantined individually rather than invalidating unrelated records. The app remains on state version 2 and produces no new child-facing behavior or new-format writes.

### Persistent Warmup visits and model activation

Branch: `feature/persistent-warmup-visits`, created only after the pure Adaptive Warmup model merges.

Goal: activate the approved model through safe versioned local and cloud persistence and make every reviewed Warmup response durable.

- Back up and restore-test current data before the cutover. Dispatch migration from the raw stored version, validate the complete converted result before replacement, and preserve the raw record when conversion fails.
- Introduce versioned Warmup storage with dual-read migration support. After a record converts successfully, write only the new version. Keep supported legacy readers throughout the migration window; this branch does not retire them.
- Materialize each queue with stable visit, queue-entry, attempt, and transition IDs; queue entries use explicit `pending`, `answered`, or `unavailable` status.
- Revalidate every pending entry immediately before presentation. If the same normalized term + module + tier + language has become active, mark the entry unavailable, do not present or score it, preserve completed attempts and queue order, and advance deterministically.
- Use expected and next revisions for the visit and mastery state. The same transition ID and payload is an idempotent no-op; a reused ID with a different payload is rejected; stale device revisions are rejected or explicitly reconciled.
- Atomically update the attempt, mastery transition, queue position, visit summary, and graph point.
- Persist `in_progress`, `partial`, `completed`, and `skipped` visits. Skipping before an answer creates no result or graph point; continuing after responses finalizes a partial result.
- Resume the exact next unanswered position without duplicating attempts, consuming shuffle state twice, or creating a second graph point.
- Expose an independent standalone Warmup entry point and retain the Grade 2 development-time option to skip a pre-activity Warmup.
- Update local validators, cloud validators, and Firestore security rules for the new mastery, visit, attempt, and transition records. Enforce family and child ownership; valid path-safe mastery, visit, attempt, and transition identities; allowed visit and queue-entry statuses; valid expected-to-next revision transitions; idempotent duplicate handling; stale-write rejection; and cross-family access rejection.
- Add Firebase Emulator coverage proving valid owned writes succeed while malformed IDs, invalid status or revision transitions, conflicting duplicate transitions, stale writes, and cross-family reads or writes are rejected. Add rendered-browser test infrastructure before claiming cloud and UI acceptance.

Acceptance gate: local and cloud migration, raw-record preservation on failure, exact resumption, idempotent retry, stale-device conflict behavior, security-rule ownership and validation, cross-family rejection, one graph point per visit, short completed queues, skip-before-answer, partial continuation, and standalone entry all pass without Acquisition, lifecycle, Test Review, or weekly-score regressions.

Implementation status: complete on `feature/persistent-warmup-visits`, pending final read-only audit and merge sequencing. The activated boundary keeps the outer application state at version 2 during the migration window, uses a stable materialized queue, revalidates each unanswered entry immediately before presentation, journals interrupted local/cloud transitions, commits visit/queue-entry/mastery/attempt/receipt/graph updates atomically, quarantines malformed cloud records individually, exposes standalone Warmup, and renders the per-visit line graph. The cloud form stores compact visit metadata separately from independently validated queue-entry records so new grade profiles do not require larger embedded-array rules. The full unit/integration suite, production build, Firestore Emulator ownership/stale-write scenarios, and rendered-browser reload/resume scenario are required final gates.

One presentation-level decision remains for this branch: when a mastery term has several linked source occurrences with different context sentences, choose the approved occurrence used for its prompt and audio. The current recommendation is the newest mastery-eligible occurrence.

### Final Warmup facade cleanup

Branch: `refactor/warmup-facade-cleanup`, created from the then-current `main` only after the production migration window has elapsed.

Goal: remove dormant legacy Warmup writers, readers, and compatibility paths only after the activated model has been proven recoverable with real data.

This branch may begin only after:

- Real child data has been backed up without authentication credentials.
- A restore test has successfully recovered children, datasets, mastery state, visits, attempts, scores, and exact resumable positions.
- Migration telemetry reports successful conversions and identifies or resolves every quarantined record.
- The supported migration window has elapsed and no old client is still writing the legacy format.
- Rollback criteria and the retained recovery artifact are documented.

The cleanup removes superseded legacy writers first, then retires legacy readers and obsolete compatibility exports whose usage is proven absent. It must not delete historical results, unresolved quarantined data, or the recovery backup.

Acceptance gate: production telemetry and restore evidence satisfy every prerequisite; all active clients read and write only the approved version; the complete test, Emulator, build, and rendered-browser gates pass; and rollback remains possible from the verified backup.

### Grade 5 source profile

Branch: `feature/grade5-source-profile`

Status: completed and hardened on `main` through PR #16. The Grade 5 source registry entry remains inactive, so this architecture does not expose Grade 5 production practice.

Goal: parse and validate the latest Grade 5 structure without changing Grade 2 behavior or writing cloud data.

- Validate the latest consecutive Grade 5 slide structure through the approved read-only source path.
- Extract Tier 1–3 from the correct Mandarin table cells using source role rather than first/last Tier heading position.
- Map `Coming next week/Core vocab` to the displayed week’s Acquisition candidate and treat its later `This week` appearance as confirmation.
- Preserve source labels, assigned week, content fingerprint, slide provenance, the 3–10 Tier 1 count rule, and every allowed duplicate as its own ordered target occurrence.
- Emit the validated progression-event identity and confirmation/conflict information needed by a later Grade 5 lifecycle strategy without assigning practice stages in this branch.
- Treat a mismatched top-row confirmation as a blocking source conflict and leave the new bottom-row cohort pending for administrator resolution.
- Use Week 4 as the activation baseline and preserve Week 1–3 as provenance or issues without reconstructing missing review cohorts.

Acceptance gate: fixtures for the latest validated pattern produce the approved Acquisition and confirmation candidates plus stable progression-event inputs; Week 4 is identified as the baseline without invented review cohorts; gaps emit no event; a mismatched confirmation blocks the event; repeated source terms remain repeated ordered targets; Grade 2 output is unchanged; no lifecycle assignment or Firestore write occurs.

### Grade 5 lifecycle strategy

Branch: `feature/grade5-lifecycle-strategy`, created from updated `main` after the Grade 5 source profile merges.

Status: completed and registered on `main` through PR #16. The strategy is exercised through isolated Grade 5 models and tests while the production source and practice profile remain inactive.

Goal: consume validated Grade 5 progression events through the source-neutral lifecycle boundary without changing Grade 2 behavior.

- Register a Grade 5 strategy with Acquisition, Test Review 1, Test Review 2, and Mastery stages.
- Advance every active cohort exactly once for each accepted progression event.
- Freeze every cohort during no-slide weeks and after malformed, duplicate-only, or conflicting source steps.
- Resolve inputs deterministically under permutation. Identical duplicate set or evidence records are idempotent; conflicting reuse of a dataset ID or evidence ID fails closed, remains Future, and cannot be resolved by array order.
- Require the Week 4 baseline, require each evidence date to match its canonical set activation date, and stop the accepted chain at the first missing, reused, or mismatched step.
- Use Week 4 as the activation baseline without inventing earlier review cohorts.
- Keep Test Review 1 and Test Review 2 behaviorally identical except for lifecycle label and selected cohort.
- Configure each Grade 5 primary pathway to offer its own Warmup containing up to six unique terms and configure both Test Review stages with the approved 10-second timer and Skip Timer behavior. A short eligible pool produces a shorter completed Warmup; ordinary terms are not repeated merely to reach six. Grade 5's `preActivityWarmupRequirement` remains undecided and must be approved explicitly before activation; it must not inherit Grade 2's development-time `optional` setting.

Acceptance gate: each valid event advances exactly one stage; a conference gap advances zero stages; the next valid event advances only once; a mismatched confirmation freezes progression; duplicate and conflicting identifiers are deterministic and fail closed; all three primary paths offer distinct up-to-six-term unique Warmups; Test Review 1 and 2 differ only by label and cohort; the Grade 2 golden matrix remains unchanged.

### Kindergarten Sheets adapter

Branch: `feature/kindergarten-sheets-adapter`

Status: completed on `main`. The source registry entry remains inactive.

Goal: adapt the authoritative Kindergarten workbook into normalized candidates using the approved Monday–Sunday date rule without inventing activation, unit, or workshop rules.

- Treat the spreadsheet ID as the yearly source identity and each weekly tab as a source unit.
- Map `Writing character` to Tier 1, `High frequency word` to Tier 2, and Tier 3 to an empty array.
- Preserve tab title, tab identity, source order, raw date, and source provenance.
- Normalize the tab date to the containing Monday–Sunday cycle, including a Tuesday tab after a Monday holiday.
- Leave newest-empty-tab meaning and writing-workshop recognition explicitly unresolved.
- Keep malformed or empty candidates non-activatable while any blocker remains; the inactive source registry still prevents valid vocabulary candidates from entering production practice.
- Produce reviewed local dry-run output only; do not write Firestore.

Acceptance gate: observed weekly-tab fixtures normalize tiers without mixing labels, no `gid` is treated as the yearly source ID, Monday–Sunday date matrices pass, unresolved activation and no-instruction rules fail closed, and Grade 2 and Grade 5 tests remain unchanged.

### Kindergarten learning lab

Branch: `feature/kindergarten-learning-lab`, created from updated `main` after the Kindergarten Sheets adapter merges.

Status: completed as historical prototype work. Its visual design now informs the shared Learning Hub boundary. Later Kindergarten lifecycle and production-practice work supersedes statements below that describe the lab as the only Kindergarten integration.

Goal: preserve and test the Kindergarten Dojo experience without registering a production practice profile or writing child progress.

- Give Kindergarten an explicit Acquisition strategy ID, version, timers, sequences, and separate Familiar-DT target objects. Its current semantic prompt trace matches Grade 2 v3, but future Grade 2 changes cannot alter it by object identity.
- Use the shared `PracticeView` for Tier 1 writing while keeping the lab profile out of the production practice registry.
- Require a deliberately selected local fixture week. Never infer the active week from the current date, an empty newest tab, or source order.
- Keep Tier 2 reading visible, separate, unscored, unrecorded, and clearly identified as a teaching prototype until the shared Tier 2 engine is approved.
- Represent the August 31–September 27 Unit 1 cumulative review in the lab. Aggregate its observed Tier 1 and Tier 2 terms, send only Tier 1 writing through the shared Test Review presentation, and persist nothing.
- Keep the lab outside `index.html`, `main.tsx`, `App.tsx`, lifecycle registries, practice registries, Firebase, Firestore, and browser storage.

Acceptance gate: Kindergarten and Grade 2 produce equal semantic Acquisition traces under the current approved values while sharing no strategy or Familiar-DT object identity; the Dojo uses the checked-in fixture and shared writing UI; Tier 1 and Tier 2 remain separate; the cumulative review presentation is lab-only; all existing tests and the production build pass; and production Kindergarten stays inactive.

### Kindergarten lifecycle profile

Branch: `feature/kindergarten-lifecycle-profile`, created from updated `main` after the Kindergarten Sheets adapter merges.

Status: completed and registered on `main` through PR #15. The explicit unit behavior remains protected by the inactive Kindergarten source gate.

Goal: register the approved Kindergarten vocabulary lifecycle while unresolved source states continue to fail closed.

- Keep Kindergarten rules explicit; never inherit Grade 2 or Grade 5 lifecycle behavior through a fallback.
- Activate each canonical vocabulary set on its assigned Monday and hold the latest arrived set across a missing replacement.
- Configure Unit 1 explicitly as August 31 through September 27; never infer a unit from source order or an empty tab.
- Place every arrived unit dataset into one cumulative review group while leaving the newest set concurrently available for Acquisition.
- Move the unit to Mastered on the Monday after its configured end.
- Reject no-instruction sets, non-Monday–Sunday ranges, conflicting identities, and dates outside the approved unit plan.
- Keep the source release flag inactive while the production practice profile is built and tested separately.
- Preserve the Grade 2 and Grade 5 golden lifecycle results unchanged.

Acceptance gate: the approved Kindergarten date and progression matrices pass, unsupported or unresolved source units fail closed, and enabling Kindergarten does not rewrite any other grade's datasets, assignments, or history.

### Kindergarten production practice

Branch: `feature/kindergarten-production-practice`, created from the completed Kindergarten lifecycle profile.

Status: completed as a production-practice scaffold on `main` through PR #15. It does not activate the Kindergarten source.

Goal: connect only validated Kindergarten vocabulary to shared production practice without turning on the source release flag.

- Project valid canonical candidates into source-neutral datasets that preserve every tier and content fingerprint; `words` remains the Tier 1 writing view.
- Register a Kindergarten-owned writing profile and strategy values without importing the Grade 2 profile object.
- Keep weekly Tier 1 writing in shared Acquisition while one cumulative Unit 1 Test Review session spans all arrived source weeks.
- Persist cumulative review attempts and scores against their original canonical datasets and store the review-group identity on the session.
- Present **Enter the Dojo**, **Writing characters**, and **Prepare for your test** through shared application components.
- Keep Tier 2 reading separate and explicitly unscored until its shared assessment engine is approved.
- Require the source registry `active` flag before the application exposes the profile.

Acceptance gate: source-neutral projection rejects changed content, the inactive source cannot appear in production, one complete Unit 1 review produces 14 Tier 1 results and four source-week scores, Tier 2 does not enter writing queues, and the complete test suite and production build pass.

### Acquisition persistence contract

Branch: `refactor/acquisition-persistence-contract`

Goal: define and prove the versioned, persistence-neutral checkpoint contract without activating a new stored format or changing child-facing behavior.

- Define a versioned Acquisition progress envelope containing stable progression identity, child, dataset, grade, normalized school year, activity module, tier, lifecycle stage at the last checkpoint, application-writer version, strategy ID/version/configuration fingerprint, ordered-target fingerprint, revision, exact engine flow, completion state, and timestamps. Current availability always comes from the authoritative lifecycle resolver, not the stored historical stage.
- Define one deterministic transition/checkpoint command containing operation and transition ID, expected and next revision, prompt identity, reviewed response, the exact random values consumed by the engine, optional neutral assessment, next flow, and the scored-attempt or DT-observation facts derived from that assessment. The reducer replays the engine transition and rejects a merely well-shaped invented successor. Entering ongoing DT-only practice after teaching completes uses its own fact-free, revisioned, replayable resume checkpoint rather than mutating stored flow outside the checkpoint boundary.
- Treat the same transition ID and identical payload as an idempotent no-op only when a progression-bound receipt proves that revision was already applied; reject malformed, future, or cross-progression receipts, the same transition ID with different content, and stale expected revisions.
- Add strict nested-flow validation against the supplied strategy and canonical ordered targets. Require completion evidence for every earlier ordered target except the exact term undergoing Earned-DT reacquisition. Do not accept a record merely because its dataset ID matches.
- Add a pure, idempotent migration from the existing unversioned `AcquisitionProgressRecord`. Normalize legacy `establishedDtBag` data to Familiar DT terminology, preserve valid exact positions, and quarantine malformed or mismatched records individually without inventing completed work. Bind any strategy upgrade to the exact source configuration fingerprint and prohibit a strategy-only upgrade from changing the target-set fingerprint or ordered occurrence identities.
- Add a pure local reducer and storage-neutral repository interface. Keep `App.tsx`, local storage activation, Firestore clients, Firestore rules, source gates, lifecycle strategies, scoring behavior, and UI unchanged.
- Preserve the complete Grade 2 Acquisition v3 golden trace, prompt IDs, target IDs, timers, scoring flags, and serialized engine flow. Kindergarten and Grade 5 strategy ownership remains unchanged.

Acceptance gate: fixed fixtures validate and migrate every Introduction, Expanded Trials, Correction, and DT-practice position; target-set or strategy mismatches fail closed; retries are idempotent; stale revisions fail; unrelated valid records survive one malformed record; architecture tests prevent the pure boundary from importing React, `App.tsx`, Firebase, Firestore, local storage, or `domain.ts`; all existing tests and the production build pass with no stored-format or child-facing change.

Activation prerequisite resolved in the focused `fix/acquisition-earned-dt-recovery` branch: open-ended Earned-DT Correction advances through all six positions, Earned-DT reacquisition preserves the original interrupted weekly-target resume position, and successful reacquisition returns to that exact target and step. Because the current flow has one deliberate resume position, DT slots inside Earned-DT reacquisition use Familiar DTs rather than recursively interrupting reacquisition with another Earned DT. Deterministic tests freeze final completion and Earned-DT-pool evidence, while inconsistent legacy or invented outputs continue to fail persistence validation closed.

### Persistent Acquisition activation

Branch: `feature/persistent-acquisition`, created from updated `main` after the Acquisition persistence contract merges.

Goal: activate the approved checkpoint contract locally and in Firestore so each completed Acquisition response and its exact next position are saved as one recoverable operation.

- Replace independently assembled progression, attempt, and DT-observation writes with one application coordinator and repository commit operation.
- Atomically commit or idempotently recover the progression revision, scored attempt, DT observation, and exact next flow. A partial cloud failure may not advance one record while losing another.
- Preserve a durable local pending transition for offline or interrupted writes and retry it by stable transition ID without advancing the engine twice.
- Resume after refresh, sign-out, a new day, application restart, and another device without replaying completed work.
- Migrate successfully validated legacy records before writing the new version; retain the original recovery artifact when conversion fails.
- Update local/cloud validators and Firestore rules to enforce family/child ownership, immutable progression identity, allowed versions and statuses, expected-to-next revision changes, idempotent duplicates, stale-write rejection, and cross-family denial.
- Add Firebase Emulator and rendered-browser coverage before claiming cloud and cross-device acceptance.
- Do not change Acquisition sequences, scoring, lifecycle strategies, source activation, Adaptive Warmup, Test Review behavior, the shared Learning Hub, Tier 2, handwriting, rewards, or baseline/remediation behavior.

Acceptance gate: Grade 2 retains the exact v3 10-position Expanded Trials sequence and six-position Correction routine; partial Acquisition resumes at the exact next step without duplicate attempts; **Done for today** scores that visit's hidden weekly-target and Earned DT responses while excluding Familiar DT and show/copy responses; collect mode saves one idempotent DT observation for each reviewed DT trial while discard mode saves none; local retry, cloud retry, stale-device conflict, malformed-record isolation, backup/restore, family ownership, and cross-family rejection pass; Kindergarten cumulative review and Grade 5 lifecycle matrices remain unchanged; no inactive source is activated.

### Deferred branch — Baseline DT assessment and remediation

Branch: `feature/dt-baseline-and-remediation`, created from updated `main` after persistent Warmup and Acquisition merge.

Goal: replace the temporary presumption of a small known Familiar DT pool with imported standard lists and an individualized, resumable baseline for each child and activity module.

- Keep the approved bootstrap profile available for current development without representing it as weekly curriculum.
- Import versioned standard Tier 1 writing and Tier 2 reading lists through an administrator-reviewed path.
- Once imported baseline mode is enabled for a module, block that child's weekly lifecycle entry until the module's baseline assessment is complete. The temporary bootstrap-only development profile does not fabricate baseline results.
- Test the complete list in resumable sets and persist exact position, results, list version, and derived DT eligibility.
- Carry demonstrated prior-grade vocabulary into the child's longitudinal independent Warmup pool.
- Keep Tier 1 and Tier 2 assessment, mastery, correction, and reacquisition state separate.
- Consume the longitudinal DT-observation history as evidence, but do not reinterpret historical results until an explicit, versioned transition policy is approved.
- Add immediate Warmup correction after the configured first-error threshold and a distinct reacquisition queue after the configured three-error threshold, without silently inserting remediation terms into the current weekly dataset.
- Require explicit decisions for list provenance, set size, error-window semantics, correction steps, reacquisition steps, migration, and re-baselining after a list revision.

Acceptance gate: once imported baseline mode is enabled, restarting or switching devices resumes the exact baseline position; no term is skipped or tested twice because of a retry; weekly lifecycles remain unavailable until the applicable module baseline is complete; derived DT pools are deterministic; prior-year vocabulary remains available across school years; Tier 1 and Tier 2 results never contaminate each other; and remediation cannot alter canonical weekly datasets.

### Phase 6 — Public hosting and branding

Branch: `feature/firebase-hosting`

Goal: provide a reliable public link without collecting production data.

- Choose the public application name and update the browser title, visible branding, and page metadata together.
- Configure Firebase Hosting to publish the Vite production `dist/` directory with single-page application routing.
- Add a preview deployment path for pull requests.
- Keep production Firestore writes disabled. A hosting preview uses no backend or an explicitly identified development Firebase project.
- Confirm the app opens in a clean browser, refreshes successfully, contains no secret material, and performs no production Firestore writes.

Acceptance gate: `npm test`, `npm run build`, and `git diff --check` pass; a clean-device preview works; no production data is read or written.

### Phase 7 — Secure cloud accounts and practice persistence

Branch: `feature/firebase-cloud-persistence`

Goal: allow an invited parent to sign in and see the same completed and in-progress learning state on multiple computers.

Use a separate development or staging Firebase project first. Decide before implementation whether account creation is invitation-only or open, what child information is permitted, who may delete records, and how long practice data is retained. Use child nicknames rather than unnecessary identifying information.

The cloud ownership model is:

```text
Firebase Authentication user
└── family
    └── child
        ├── warmup visits and attempts
        ├── acquisition progressions and trials
        ├── DT observations and derived per-term aggregates
        ├── configured test-review-stage sessions and temporary attempts
        ├── scores
        └── adaptive/warmup state

Shared server-managed data
├── datasets
│   └── words
├── versioned DT bootstrap and standard-list profiles
└── import logs
```

- Configure email/password authentication, password reset, authorized domains, expiration handling, and sign-out.
- Keep local and cloud modes explicit. Never silently upload, merge, overwrite, or discard local browser progress when cloud mode is enabled.
- Test Firestore rules with the Firebase Emulator Suite. Parent A must not read or write Parent B's family, and browser clients must never write shared datasets or import logs.
- Require attempts to reference an owned active child, a valid session, an existing canonical dataset, and a word belonging to that dataset.
- Validate DT observations separately from weekly attempts because Familiar DTs may come from a bootstrap or standard list rather than the active dataset. Require an owned child, valid Acquisition progression, server-recognized DT term and profile version, stable observation ID, allowed right/wrong value, and matching activity module. Browser observations may not edit shared DT profiles or standard lists.
- Require scores to match the child and dataset. A partial Acquisition progression may have a valid per-visit score after **Done for today**, but it must not claim that the complete teaching progression finished. Abandoned or skipped Test Review sessions may not create Test Review attempts, adaptive updates, or scores.
- Make Acquisition trial writes, DT observations where applicable, and next-position updates atomic or idempotently recoverable, and reject duplicate stable attempt or observation IDs.
- Treat browser-computed scores as client-trusted pilot data until final score creation is moved behind a trusted server endpoint or receives equivalent server-side verification. Do not describe client-trusted scores as independently verified assessments.
- Define account removal, data retention, and deletion procedures before collecting production data.

Acceptance gate: an invited staging parent can sign in, create or select a child, complete or partially complete practice, sign in on a second computer, and see the same Warmup history, exact Acquisition position, and collected Tier 1 DT observations. Cross-family access, invalid or duplicate attempts or DT observations, false completion claims, abandoned or skipped Test Review results, and shared-data writes are rejected by emulator-backed tests.

### Phase 8 — Controlled cloud dataset population

Branch: `feature/cloud-dataset-import`

Goal: place canonical Kindergarten, Grade 2, and Grade 5 datasets in staging Firestore through one trusted server boundary before introducing a schedule.

```text
Trusted Slides or Sheets source payload
→ grade-specific source adapter
→ WeeklyDatasetCandidate
→ shared validation and duplicate classification
→ reviewed write plan
→ server-side Firestore batch
→ datasets, words, and deterministic import log
→ authenticated browser read
```

- Keep canonical validation and identity downstream of the shared source-adapter boundary.
- Use only the reviewed adapter profile for each configured source; do not infer Kindergarten or Grade 5 structure from Grade 2.
- Keep browser hydration and practice unable to invoke shared Firestore writes.
- Fetch existing dataset IDs before creating a write plan.
- Preserve canonical dataset IDs, tiered target and occurrence IDs, dates, source file and source-unit IDs, source labels, instructional roles, fingerprints, statuses, and approved context.
- Record malformed slides or tabs without deleting or replacing prior valid datasets. If no valid datasets are available, perform no dataset writes.
- Make duplicate-only imports deterministic and idempotent.
- Compare normalized local and backend importer output before any staging write.
- Run one explicitly authorized staging import per configured grade, inspect the result, run it again, and prove that the second run creates no duplicate records.
- Keep Kindergarten dry-run-only until activation, unit-review, and no-instruction policies are approved; do not let that unresolved grade cause Grade 2 or Grade 5 data to be guessed or rewritten.

Acceptance gate: each grade is activated independently only after its source and date policy pass. Activated staging users read only their grade- and school-year-matched server-imported datasets; local and backend normalized outputs match; repeated imports preserve identical Firestore state; no manually invented, guessed, or placeholder production vocabulary exists.

### Phase 9 — Handwriting prototype and deferred reward exploration

Branches: `feature/handwriting-pad` and `feature/reward-system`, each created from updated `main` after persistent Acquisition merges.

Goal: test the on-screen writing flow before inviting production families and keep the unresolved Kindergarten reward design isolated from learning and scoring.

- Implement the in-memory Acquisition handwriting-pad comparison flow without uploading or permanently storing strokes or snapshots.
- Preserve the established visible-target and hidden-target rules and clear prior writing before the next prompt.
- Verify touch, stylus, and mouse behavior across representative screen sizes and input conditions.
- Define modality-neutral completion events, then explore the reward system only for Kindergarten. Do not enable it for Grade 2 or Grade 5 in this phase.
- Treat cumulative stars and parent-approved redemption for free time or a relaxing/reinforcing activity as a product direction, not an implemented rule, until award, redemption, balance, and parent-control decisions are approved.
- Support mute/skip, reduced-motion behavior, and a parent-facing disable control; do not add accuracy-only rewards, penalties, leaderboards, or loss-based streaks.
- Observe child usability and decide whether handwriting replaces paper or remains optional. Evaluate the Kindergarten reward design separately before any wider rollout.

Acceptance gate: child usability testing confirms that prior written answers are not visible during later prompts, children can complete and self-assess writing without adult troubleshooting, and interruptions restart only the incomplete trial. Any Kindergarten reward prototype requires separately approved award and redemption rules, preserves balances without duplicate awards, supports reduced motion and parent disablement, and cannot change learning scores.

The handwriting acceptance gate applies before a writing-pad pilot. The deferred `feature/reward-system` branch does not block a pilot that does not enable rewards; if a Kindergarten pilot enables rewards, that branch's separate acceptance criteria must pass first.

### Phase 10 — Tier 2 reading activation

Branch: `feature/tier2-reading-lifecycle`, created from updated `main` after persistent Warmup and Acquisition merge.

Goal: activate preserved Tier 2 vocabulary through one shared reading module with grade-specific lifecycle strategies.

- Show the character or word and ask the child to say it aloud.
- Reuse the grade’s configured Acquisition, Test Review, and Warmup structure without sharing Tier 1 dictation state.
- Support Grade 5 Test Review 1 and Test Review 2.
- Seed each grade's initial Tier 2 Familiar DT pool from the versioned bootstrap terms while keeping its mastery state separate from Tier 1; integrate imported individualized baselines only through the dedicated baseline branch.
- Keep reading attempts, scores, adaptive state, and history separate from dictation.
- Decide before implementation whether the first release is self-assessment-only or records four-second voice clips.
- If recording is included, complete the private-storage, permission, retention, deletion, format, upload-recovery, and cross-device review before production.

Acceptance gate: all configured grades consume source-preserved Tier 2 data without reparsing; reading never changes dictation results; lifecycle persistence passes the same interruption tests as its grade profile; any recording path passes its separate privacy and storage gate.

Tier 2 does not block a writing-only production pilot. A self-assessment-only Tier 2 version may be tested before that pilot after the persistence foundation is stable. A stored-recording version remains post-review and may follow the initial pilot.

### Phase 11 — Limited production pilot

Branch: `feature/production-pilot`

Goal: email the hosted app to one or two invited families and collect a deliberately limited set of production practice data.

- Create or confirm the production Firebase project and authorized hosting domains.
- Deploy only Firestore rules that passed emulator tests.
- Deploy the reviewed Firebase Hosting build.
- Populate canonical datasets through the authorized server path.
- Configure budget alerts, error logging, rollback instructions, and operational ownership.
- Enable App Check in monitoring mode before considering enforcement.
- Exclude child microphone recordings from the initial pilot. Audio recording requires a separate private-storage, permission, retention, and deletion review.
- Verify account removal and data-retention procedures before inviting users.

Acceptance gate: an invited person opens the emailed link on a clean computer, signs in, sees only their family and grade-matched datasets, retains partial Warmup history and exact Acquisition progress across logout and another computer, and creates no result or score from an abandoned Test Review. Kindergarten, Grade 2, and Grade 5 must each pass their dataset and practice-flow acceptance checks before families in that grade are invited.

### Phase 12 — Automatic read-only curriculum-source synchronization

Branch: `feature/automatic-source-sync`

Goal: automatically pull approved Slides and Sheets source changes into Firestore. The application and backend never edit teacher-authored sources.

```text
Cloud Scheduler
→ authenticated OIDC request
→ protected Cloud Run `/run` endpoint
→ Secret Manager credentials
→ read-only Google OAuth refresh
→ read-only Google Slides or Sheets API
→ grade-specific source adapter
→ WeeklyDatasetCandidate
→ canonical importer and duplicate classification
→ server-side Firestore batch
→ deterministic import log
→ app reads updated datasets on its next startup or refresh
```

- Deploy Cloud Run with `IMPORT_WRITE_ENABLED=false` initially.
- Give the Cloud Run service account only the Firestore permissions needed for canonical datasets, words, and import logs.
- Store the Google OAuth client ID, client secret, read-only refresh token, and import authorization only in Secret Manager or protected runtime configuration.
- Require authentication on Cloud Run. Give only the Scheduler service account `roles/run.invoker` and use an OIDC-authenticated request.
- Configure Cloud Scheduler for Monday at 3:00 p.m. in `America/Los_Angeles` only after manual and shadow validation passes.
- Add structured import logs, deterministic retry behavior, administrator email alerts, an administrator dashboard for unresolved source issues, and a documented rollback/disable procedure.

Rollout order:

1. Deploy Cloud Run with writes disabled.
2. Verify the health endpoint and authorization failures.
3. Run the read-only backend shadow comparison.
4. Enable and inspect one manually invoked staging write.
5. Repeat the staging import and verify idempotency.
6. Perform one explicitly authorized production import.
7. Enable Scheduler only after all prior gates pass.

Cloud Run and Scheduler are not prerequisites for the public pilot. Secure hosting, family isolation, lifecycle-specific cross-device persistence, and a controlled dataset import for every grade included in the pilot must work first.

## Production operating model and cutover roadmap — approved 2026-09-30

The finished application uses one trusted server boundary between teacher-authored Google sources and the child-facing app:

```text
Grade 2 and Grade 5 Google Slides / Kindergarten Google Sheets
→ trusted read-only Cloud Run importer
→ grade-owned adapter and shared canonical validation
→ server-authorized Firestore batch and deterministic import log
→ grade-owned lifecycle resolution
→ authenticated child app reads canonical Firestore datasets
→ assessed Acquisition and Warmup transitions save automatically to child-owned Firestore records
```

The browser never reads teacher Google documents directly and never writes shared datasets or import logs. Parents and children do not authorize Google access. A Monday import is a synchronization check, not a lifecycle reset: only a newly accepted canonical source event may rotate a cohort. Missing, malformed, conflicting, or duplicate-only source input preserves the last valid lifecycle assignment. Grade 2 holds its replacement-driven Acquisition and Test Review assignments; Grade 5 advances exactly once per accepted progression event and freezes through source gaps; Kindergarten holds the newest arrived teaching set and accumulates its explicitly configured cumulative unit review.

### Current gap snapshot

| Capability | Current repository state | Required production state |
|---|---|---|
| Curriculum import | Grade-owned adapters, canonical validation, dry runs, and guarded server writes exist. No Cloud Run service or Monday Scheduler job is deployed. | Deploy the trusted importer, credentials, IAM, logs, alerts, and Monday schedule after shadow/manual gates pass. |
| Grade 2 curriculum | The source profile is active in code, but local development still relies on a manually supplied trusted JSON payload when Firebase/import services are absent. | Populate canonical Grade 2 datasets through the server importer and have authenticated clients read them from Firestore. |
| Grade 5 curriculum | Source extraction, progression evidence, lifecycle resolution, and Learning Hub lab exist. The production source gate is off. | Complete the Grade 5 practice/persistence gates, import its canonical source through staging, then activate only its explicit profile. |
| Kindergarten curriculum | Sheets extraction, Monday–Sunday normalization, Unit 1 lifecycle, cumulative review, and Learning Hub lab exist. The production source gate is off. | Define future unit boundaries and remaining source policies, verify staging import, then activate the Kindergarten-owned profile without adopting Grade 2 or Grade 5 lifecycle rules. |
| Tier 1 Acquisition | Versioned local/cloud checkpoints, retry journals, exact-position resume, and Firestore rule tests exist for the active Grade 2 path. | Deploy and verify the Firebase environment, migrate existing local state once, and prove cross-device restoration before relying on cloud state. Grade 5 and Kindergarten require separate activation evidence. |
| Tier 1 Adaptive Warmup | Versioned visits, attempts, mastery state, receipts, graph points, exact resume, and legacy-history display exist for active Grade 2 writing. | Deploy and verify cloud writes, migration telemetry, and cross-device recovery; activate other grades only through explicit Warmup profiles. |
| Tier 2 reading | Shared grade-aware reading pathways and development integrations exist, but attempts, scores, adaptive state, and recordings remain session-only. | Add a separate versioned persistence boundary before any Tier 2 result is treated as durable; stored recordings remain blocked pending the privacy review. |
| Existing child data | Important history still exists in browser storage. A checksum-verified backup and isolated restore test preserve Acquisition, Warmup, and earlier monthly Mastery history. | Perform one reviewed local-to-cloud migration per child, verify record counts and cross-device results, retain the untouched backup through the rollback window, then make manual backup an emergency/export tool rather than a normal workflow. |
| Hosting and operations | Local and preview builds exist; production Firebase configuration and deployment are not complete. | Deploy separate staging and production environments, Hosting, Authentication, Firestore rules, App Check monitoring, budgets, retention procedures, and rollback instructions. |

### Required cutover order

1. Preserve and restore-test the current local child data. Never silently upload or replace it.
2. Deploy an isolated staging Firebase environment and the exact Emulator-approved rules.
3. Run the trusted importer in read-only shadow mode, then perform reviewed, idempotent staging imports for each grade independently.
4. Migrate a copy of one child's local state to staging and verify Acquisition position, Warmup mastery state, visit graph points, earlier monthly Mastery history, and family isolation on a second device.
5. Pilot Grade 2 Tier 1 writing first because it is the only active production profile and has the complete persistence path.
6. Activate Grade 5 separately after its Warmup policy, Test Review 1/2 persistence, canonical import, and end-to-end practice gates pass.
7. Activate Kindergarten separately after future unit boundaries and source policies are approved, preserving weekly Acquisition plus cumulative unit review.
8. Add durable Tier 2 reading only through its separate persistence and privacy gates; it must never share Tier 1 writing state.
9. Enable the Monday Scheduler only after manual and shadow imports are proven safe for every grade it will check.
10. Monitor migration and import telemetry through the rollback window. Retire compatibility readers and routine manual backups only after successful real-data conversion is confirmed.

Source activation, practice activation, cloud persistence, and deployment are four separate approvals. A working development lab does not activate a source or authorize production writes. A deployed source adapter does not imply that the grade's practice or persistence profile is complete.

## Current approved implementation — Persistent Acquisition and Adaptive Warmup

The pure Acquisition persistence contract, focused Earned-DT recovery prerequisite, persistent Acquisition activation, and persistent Adaptive Warmup visits are merged into `main`. Acquisition uses the application coordinator, durable browser journal, one atomic Firestore commit, migration-era dual reads, strict revision rules, and exact-position recovery. Adaptive Warmup uses materialized queues, atomic visit/mastery/attempt/receipt/graph updates, exact resume, standalone entry, security rules, a rendered visit graph, and a separate display for preserved earlier monthly Mastery history. Their repeatable Firebase Emulator, rendered-browser resume, backup/restore, full-suite, and production-build gates are implemented. This confirms code readiness; it does not substitute for deploying Firebase, migrating real local data to staging, or proving cross-device production operation.

## Deferred features

The first version will not include ten-word mastered rotations, sentence-writing activities, camera-based or automated handwriting grading, or automated weekly emails. The on-screen handwriting pad uses child self-assessment and does not attempt to recognize or grade handwriting. The detailed history model should support later features without losing past data.

## Safety rules

- Never silently accept failed vocabulary extraction.
- Never collapse Grade 5 source labels into lifecycle roles without applying the approved Grade 5 profile.
- Never discard preserved Tier 2 or Tier 3 source data merely because the current activity uses Tier 1.
- Never display pinyin or English meanings to children.
- Save completed Warmup and Acquisition work according to their durable progress rules; never erase it merely because a visit ends.
- Never count provisional answers from an abandoned Test Review in results, adaptive state, or official scores.
- Never represent partial Acquisition progress as a completed teaching progression; a **Done for today** score is explicitly a visit score.
- Never count Familiar DT accuracy in the Acquisition dataset score. Earned DT responses remain both scored Acquisition trials and single longitudinal DT observations under the approved v3 contract.
- Never use a collected Familiar DT error to trigger Correction, remove DT status, or create a reacquisition target until a versioned DT transition policy is explicitly approved and tested.
- Never discard or duplicate a reviewed DT observation because of refresh, retry, or cross-device synchronization.
- Do not delete historical weekly sets or completed attempts.
- Do not store private credentials in GitHub.
- Keep parent settings separate from child practice screens.
- Do not upload or permanently retain children's handwriting without a separate privacy, access, retention, and deletion decision.
- Do not condition rewards on perfect accuracy or use penalties, competitive leaderboards, or loss-based streak pressure.
- Never record a child before microphone permission and a clear reading-session action have been provided.
- Treat child voice recordings as private personal data; restrict access to the authorized family and define retention/deletion behavior before production.
- Do not use automatic speech recognition as the official pronunciation score without a separately validated feature; the child’s explicit self-assessment is the initial reading result.

## Current implementation baseline and required revisions — 2026-09-30

The repository contains Stage 2 foundations as a Firebase REST-backed browser flow with safe configuration placeholders. Acquisition progression rules have been validated with the Firebase Emulator Suite, but the application has not been deployed or approved for production data collection. The approved requirements in this plan supersede any existing implementation behavior that treats every incomplete lifecycle in the same way.

Already implemented:

- Email/password sign-up, sign-in, sign-out, password reset, persistent signed-in sessions, loading state, and readable authentication errors.
- One private family per parent, multiple active/inactive children, child switching, nickname editing, grade editing, reactivation, and non-destructive inactivity.
- A grade model for Kindergarten through Grade 5. Grade 2 is the active source configuration; Grade 5 and Kindergarten source entries remain registered but inactive.
- August 1 America/Los_Angeles grade-promotion suggestions with parent confirmation; historical datasets retain their original grade and school year.
- Grade/school-year filtering, stable date-range dataset identities, cloud session primitives, temporary and completed attempts, dataset-level scores, and stale-session cleanup.
- An idempotent, configurable Google Slides parser and local dry-run/write command for the supplied Grade 2 deck.
- Replacement-driven Grade 2 lifecycle assignment that remains stable through weekends and source gaps, moves only older cohorts into Mastered, excludes Acquisition and Test Review words from Warmup, ignores writing-workshop and invalid source units as replacements, and preserves Firestore ownership rules in `firestore.rules`.
- A source-neutral lifecycle strategy boundary with explicit Grade 2 replacement-driven, Grade 5 progression-event, and Kindergarten unit strategies, a compatibility wrapper for existing callers, and no cross-grade fallback; see `docs/lifecycle-strategy-boundary.md`.
- A generic, pure Acquisition strategy boundary with a Grade 2 single-owner strategy, exact domain compatibility wrappers, frozen pre-extraction fixtures, and no persistence or child-facing changes; see `docs/acquisition-strategy-boundary.md`.
- A persistence-neutral Acquisition transition boundary that captures the answered prompt and returns the exact next flow plus an optional classified assessment, while preserving existing session answers, local checkpoints, cloud payloads, stored schemas, scoring, and child-facing behavior; see `docs/acquisition-transition-boundary.md`.
- A dependency-light foundational contract boundary for `Word` and `Dataset`, with compatibility re-exports and an architecture gate covering TypeScript-family files under `src/domain/`.
- A mechanically extracted Warmup compatibility boundary in `src/warmup/`. It preserves the current Grade 2 runtime and stored shapes; its legacy categories, shortage order, and repetition behavior are extraction evidence rather than the approved future Adaptive Warmup contract.
- Grade 2 Acquisition strategy v3 with Familiar and Earned DTs, independent shuffle bags, the exact 10-position Expanded Trials sequence, four target timers, six-position Correction, three-error restart, and ongoing DT-only practice. Kindergarten and Grade 5 own explicit strategy identities rather than inheriting a Grade 2 fallback.
- Revision-aware local and cloud Acquisition checkpoints, atomic transition receipts/attempts/DT observations/next positions, durable browser retry journaling, per-visit **Done for today** scoring, the current Grade 2 development-time **Skip Warmup** option, whole Test Review skip, Skip Timer, and prior-week Acquisition entry from Test Review.
- The Adaptive Warmup model, migration, profile-upgrade, evidence-replay, lifecycle reconciliation, persistent visit boundary, standalone entry, and per-visit graph. The outer application state remains version 2 only as the migration envelope; the approved model is active for Grade 2 Tier 1 writing.
- Source-neutral `CurriculumImportResult` contracts, the hardened Grade 5 source/lifecycle integration, the Kindergarten lifecycle and production-practice scaffold behind an inactive source gate, and the shared Learning Hub presentation boundary added through PRs #15 and #16.
- An explicit Test Review cycle-identity boundary that carries every lifecycle review cycle through practice targets, sessions, results, scores, completed-session history, pre-activity Warmup identity, and backward-compatible local/cloud hydration. Legacy records without a cycle normalize to cycle 1; Grade 5 remains inactive pending its separate provisional-persistence gate. See `docs/test-review-cycle-identity.md`.

Required revisions before a production pilot:

- Deploy the merged revision-aware Acquisition and Adaptive Warmup paths to staging, migrate a copy of real child data, confirm migration telemetry, and verify exact cross-device state before removing compatibility readers.
- Preserve the verified browser backup through the rollback window. The real-data restore test confirmed Acquisition history, the Warmup visit graph, and separately displayed earlier monthly Mastery totals; it did not upload that browser data to Firestore.
- Keep visit-level Warmup history authoritative. Derive future monthly Mastery Rotation reporting from attempts and their original source buckets without replacing visit-level history or inventing dates for legacy monthly totals.
- Keep the completed canonical source boundary, Grade 5 table-role adapter/lifecycle, Kindergarten Monday–Sunday Sheets adapter/unit lifecycle, and shared Learning Hub boundary stable while Grade 5 and Kindergarten source activation remains deliberately blocked.
- Preserve Tier 1–3, source labels, instructional roles, assigned weeks, fingerprints, confirmations, conflicts, and malformed outcomes.
- Acquisition progressions and Adaptive Warmup visits now have Emulator coverage for stable IDs, exact next-position updates, atomic receipts/facts, stale revisions, and cross-family rejection. Shared Test Review records now preserve explicit cycle identity, but Test Review 1/2 provisional attempt cleanup and completion still need their own stored-model gate before Grade 5 activation.
- Add a server-managed DT profile that Firestore rules can validate; the related Acquisition attempt, DT observation, receipt, and next-position writes already use one atomic commit.
- Prototype and test the in-memory handwriting pad. Keep the cumulative-star reward system in its separate Kindergarten-only branch until its award, redemption, and parent-control rules are approved.
- Create separate staging and production Firebase environments. Test Firestore rules in the Emulator Suite before deployment.
- Configure Firebase Hosting, cross-device staging validation, production Authentication, production Firestore rules, App Check monitoring, retention procedures, and public-pilot access.
- Keep official browser-created scores identified as client-trusted until a trusted server boundary or equivalent authoritative validation is implemented.
- Deploy no Cloud Run importer or Monday Cloud Scheduler until manual and shadow validation gates pass.

The active Grade 2 source deck was inspected read-only; its structure and page IDs are in `docs/grade2-deck-structure.md`. The Grade 5 observed structure is in `docs/grade5-deck-structure.md`, and its validated table-role adapter and progression lifecycle remain behind the inactive production source gate. Kindergarten uses one authoritative Sheets workbook with weekly tabs; its source adapter preserves the inspected `Writing character` and `High frequency word` mappings and the approved Monday–Sunday/unit behavior while production activation remains blocked.

Remaining product decisions include Grade 5's standalone-Warmup target size, bucket quotas, and promotion thresholds; which users or environments may disable Tier 1 DT observation collection; how DT performance should be displayed; the minimum evidence needed to change Familiar DT status; the future standard Tier 1 and Tier 2 baseline-list sources and versions; baseline assessment set size; whether future baseline remediation uses a consecutive or cumulative error window; the exact Warmup correction and reacquisition sequences; the source of future Kindergarten unit boundaries after the explicitly configured Unit 1; trusted Grade 5 and Kindergarten no-instruction/workshop markers; whether the first scored Tier 2 release stores voice recordings; whether parent registration is invitation-only or open; whether email verification is required; the account and practice-data retention/deletion policy; how existing local profiles are mapped during migration; whether the handwriting pad replaces paper or remains optional; and the Kindergarten reward award/redemption/parent-control model. Each decision must be recorded before the phase whose security, privacy, migration, source identity, or child experience depends on it.
