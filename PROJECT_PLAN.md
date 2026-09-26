# Weekly Dictation App — Project Plan

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
| 2026–2027 | Kindergarten | Google Sheets workbook | One workbook containing weekly tabs | Priority adapter; workbook ID is the yearly source identity |
| 2026–2027 | Grade 2 | Google Slides deck | Grade 2 Weekly Focus deck | Active reference implementation |
| 2026–2027 | Grade 5 | Google Slides deck | Grade 5 Weekly Focus deck | Priority source profile and lifecycle extension |

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

All grades conceptually preserve Tier 1, Tier 2, and Tier 3, even when a source uses different labels or a tier is empty. Tier 1 supplies the current writing/dictation module. Tier 2 and Tier 3 are stored as structured metadata and do not automatically enter Tier 1 dictation. Tier 2 will later supply the shared character-reading module without reparsing the original source. Tier 3 remains available for a later activity definition.

Source labels and application meaning must remain separate. `sourceSectionLabel` records what the teacher-authored source visibly calls a section. `instructionalRole` records how the application uses that section. A misleading or forward-looking source label must not silently determine the lifecycle.

The initial source mappings are:

- **Grade 2 Slides:** Explicit Tier 1, Tier 2, and Tier 3 headings map to their matching normalized tiers. The existing Grade 2 parser and practice behavior remain the reference implementation until deliberately moved behind profiles.
- **Grade 5 Slides:** Tier 1, Tier 2, and Tier 3 are extracted from the correct Mandarin table section using its structural role. `This week` and `Coming next week/Core vocab` are preserved as source labels and then mapped through the Grade 5 rules below.
- **Kindergarten Sheets:** `Writing character` maps to Tier 1, `High frequency word` maps to Tier 2, and Tier 3 is an empty array. Weekly tabs such as `Week 6 09/21` are separate source units within the same yearly workbook.

Grade-specific adapters may recognize different layouts and separators. No grade may infer its structure, validation rules, word limits, or practice behavior from another grade’s source profile. Duplicate source terms are permitted where a grade profile allows them and must not cause the candidate to be rejected merely because the normalized text repeats. Whether duplicate occurrences generate repeated practice targets remains an open product decision.

## Automatic curriculum-source import

The administrator’s Google account is authorized once with read-only access to the configured curriculum sources. Parents do not need Google access or authorization. Each importer must inspect the assigned source through an approved read-only path before creating candidates. If access fails, report the exact permission error, stop, and never fabricate structure or vocabulary.

Before any Firestore write, show a dry-run summary of the source units, assigned weeks, normalized date ranges, tier counts, duplicates, conflicts, malformed units, and canonical records that would be written. Proceed only with reviewed, validated output.

Every Monday at 3:00 p.m. California time, using `America/Los_Angeles`, the importer checks each active grade source. Scheduling is enabled only after manual and shadow validation passes.

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
2. A reviewed current section and a preview or earlier source occurrence with identical content describe the same dataset; current confirmation is authoritative and the preview remains provenance.
3. A preview that later appears as current with the same content fingerprint confirms the existing dataset instead of creating a new one.
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

The notification layers are a permanent server-only structured import log, an `attention_required` Cloud Logging event with error severity, and administrator email from a log-based alert. A future administrator dashboard may show unresolved issues. Parent and child interfaces never display technical importer errors.

A malformed source is not treated as a transient server failure. Scheduled execution may finish with `success_with_warnings`, emit the alert once for the unresolved source condition, and avoid repeated automatic rewrites or noisy retries.

### Deferred source rules

Kindergarten displayed end dates and activation rollover rules are deferred. The eventual rule must distinguish the weekly tab’s activation interval from the child-facing school-day date range, handle the newest tab without relying on a future tab, and never infer dates from tab position alone.

Grade 5 and Kindergarten writing-workshop or intentional no-instruction markers are also deferred. Each profile keeps an explicit extension point, but an empty source unit is malformed until a trusted marker is defined. It must never be guessed to be a workshop.

## Weekly assignment rules

- Every weekly focus is a permanent dataset identified by its assigned instructional date range, such as `8/31–9/4`.
- Dataset IDs are stable and are never replaced by labels such as current, previous, or preview.
- Lifecycle labels and transitions come from the grade’s explicit practice profile rather than one global calendar rule.
- Older datasets remain archived with their original source provenance, lifecycle history, attempts, and scores.
- Warmup is required before every Acquisition or Test Review pathway and is also available as an independent pathway.
- Acquisition and one or more Test Review stages may be visible in the same instructional week. Each starts its own required Warmup before the primary segment.
- Tier 1 writing and future Tier 2 reading use separate attempts, adaptive state, and scores even when they originate from the same weekly dataset.

Use `2026–2027` as the display school-year value. Use the normalized ASCII token `2026-27` only inside deterministic IDs. Each dataset receives a deterministic internal ID formed as `grade__school-year__week-start__week-end`, such as `grade-2__2026-27__2026-09-07__2026-09-11`. The date components use normalized ISO dates even when the slide uses a shorter date format. The ID prevents duplicate imports, separates the same week across grades or school years, and links datasets to words, attempts, scores, and history. It is an internal Firestore key and is not displayed to children; user-facing screens show the date range instead.

### Grade lifecycle profiles

The current Grade 2 reference profile uses:

```text
Acquisition during the assigned week
→ Test Review during the following instructional week
→ Archived and Warmup-eligible
```

Grade 2 currently uses a 20-second primary Acquisition timer and a 10-second Test Review timer. Kindergarten is intended to use the same high-level Acquisition → Test Review → Archived path, but its date activation and display-range rules remain deferred until the Sheets date policy is approved.

Grade 5 uses an additional review stage:

```text
Acquisition
→ Test Review 1
→ Test Review 2
→ Archived and Warmup-eligible
```

Grade 5 transitions are driven by validated instructional source progression, not the calendar boundary alone:

- On a slide for instructional week W, the bottom Mandarin row labeled `Coming next week` or `Core vocab` supplies the Acquisition candidate assigned to W.
- On the next validated instructional slide, the same content appearing under `This week` confirms the existing candidate and places it in Test Review 1. It does not create a second dataset.
- The candidate from two validated instructional source steps earlier is in Test Review 2, whether or not it is repeated as a separate source section on the current slide.
- After Test Review 2, the dataset becomes archived and eligible for Grade 5 Warmup.
- A week with no new instructional slide, such as a parent-teacher-conference week, freezes every Grade 5 dataset in its current lifecycle position. A missing or malformed source unit also preserves those positions, while malformed data produces the administrator warning described above.

The observed sequence is:

| Instructional source step | Acquisition | Test Review 1 | Test Review 2 |
|---|---|---|---|
| Week 4 example | `需要、部分、重要、开始、各种各样` | Prior set | Set before the prior set |
| Week 5 example | `怎样、吸收、通过、像、如果` | `需要、部分、重要、开始、各种各样` | Prior set |
| Following validated slide | `或者、了解、完、兴奋的、告诉` | `怎样、吸收、通过、像、如果` | `需要、部分、重要、开始、各种各样` |
| No-slide conference week | No change | No change | No change |

Grade 5 Tier 1 candidates currently accept 3–10 terms. Duplicate Tier 1 terms within one source week are allowed. Earlier startup slides that do not satisfy the approved structural and count rules are import issues and must not be guessed into lifecycle positions.

### Warmup eligibility and the Grade 2 reference policy

Warmup is a practice pathway, not another canonical dataset identity. It uses persistent per-child, per-module, per-word state while each source dataset retains its canonical date range and lifecycle history. A dataset becomes eligible only after completing every configured Test Review stage and becoming archived. Active Acquisition, active Test Review 1 or 2, future, unrecognized no-instruction, and malformed datasets are excluded even when a persisted word state is marked Recent Review or Errored Word.

The current Grade 2 Warmup policy places newly archived words in Recent Review, seeds older eligible words into Random Rotation, and prioritizes incorrect eligible words as Errored Word. Recent Review requires two consecutive correct responses to promote to Random Rotation; Errored Word requires three. A standalone Grade 2 Warmup targets 16 words and a required pre-segment Warmup targets 6, using 50% Random Rotation, 25% Recent Review, and 25% Errored Word quotas. Missing slots use eligible unique words and repeat only Random Rotation words when necessary. These counts, quotas, promotion thresholds, repetition rules, and audio-rate choices are Grade 2 profile values; Kindergarten and Grade 5 must adopt or override them explicitly rather than inheriting them silently.

Every completed Warmup response is durable and contributes to the module’s Warmup history even when the child stops before reaching the visit target. Tier 1 writing Warmup and Tier 2 reading Warmup never share adaptive mastery state.

### Warmup continuity and analytics

At the start of each Warmup, create a durable visit record and materialize its target word order and source buckets. Preserve the visit ID, Warmup type, target count, ordered word IDs, source dataset IDs, source buckets, current dictation or review position, completed self-assessments, started and updated times, and `in_progress`, `partial`, or `completed` status. Saving this state prevents a refresh or device change from drawing a different set or consuming shuffle-bag entries twice.

Update the same Warmup visit and its graph point after each completed self-assessment. An unanswered prompt does not affect accuracy or adaptive state. An unfinished required Warmup resumes before its associated Acquisition or Test Review begins. An unfinished standalone Warmup remains available to resume; if the child explicitly ends it, retain the assessed items and mark the visit partial rather than erasing it. Completing a resumed visit changes that same record to completed instead of creating a duplicate graph point.

### Shared Acquisition contract

The intended Acquisition structure for every grade includes Introduction, true BM and earned BM opportunities, Expanded Trials, Correction, and promotion of learned targets into the earned-BM pool. The response modality comes from the activity module: Tier 1 dictation hides the target during scored writing trials, while Tier 2 reading shows the character or word for the child to say aloud.

Each progression stores a `practiceStrategyId` and strategy version. The exact pool, sequence, timers, scoring events, and correction rules below are the canonical Grade 2 reference strategy. Kindergarten and Grade 5 may explicitly reuse or override individual parameters after review; they must never receive Grade 2 behavior through an undocumented fallback.

#### Grade 2 Acquisition strategy v1

Every Acquisition trial uses the same child-facing cycle: timed writing prompt, reveal/review frame, Yes/No response, then the next writing prompt without an extra transition screen. Show/copy prompts visibly show the word; all other writing prompts hide it. True-BM words use the approved pool `一、二、三、四、五、六、七、八、九、十、大、小、人、水`. Their Yes/No responses and all show/copy responses are discarded. Hidden current-target trials and earned-BM trials are recorded and scored.

Introduction presents two different true-BM words for 5 seconds each, one 10-second show/say/copy target trial, then one 10-second hidden target trial. A correct hidden response starts Expanded Trials; an incorrect response starts Correction.

Expanded Trials use the exact 10-position sequence `target, BM, target, BM, BM, target, BM, BM, BM, target`. The hidden-target timer starts at 10 seconds for the Introduction attempt and decreases by one second after each hidden current-target attempt to a 5-second minimum. Every BM opportunity independently chooses 50% true BM and 50% earned BM; while the earned pool is empty it uses true BM. True and earned pools use shuffle-bag rotation, exhaust available members before reuse, and prevent consecutive BM-word repetition. Completing every required target trial promotes that current-week target into the earned-BM pool and starts Introduction for the next target.

Correction presents three 10-second show/say/copy trials, one 10-second hidden trial, a new 5-second true-BM trial, and a final 10-second hidden trial. The final hidden response determines success. An incorrect final response repeats Correction; three consecutive scored errors restart that word from Introduction; any correct scored response resets its consecutive-error count. Successful Correction for a current target restarts Expanded Trials at step 1 and resets its timer progression, so that first target receives 10 seconds. Successful Correction for an earned-BM word returns it to the earned pool and resumes the interrupted target at the next exact sequence step.

The Grade 2 Acquisition score is trial-based. Every hidden current-target attempt and earned-BM attempt contributes; true-BM and show/copy trials never contribute. Grade 2 Acquisition must not collapse repeated trials into one final answer per vocabulary word.

### Acquisition continuity and persistence

Acquisition is one durable teaching progression per child and canonical dataset, not a collection of independent daily sessions. A child may complete the progression across multiple visits and multiple days. After every completed trial, the app saves both the trial result, when the trial is scored, and the exact next teaching position. Closing, refreshing, signing out, switching devices, or returning on a later day must resume the child at that next position rather than restarting the first word.

The durable progress record must preserve enough state to reproduce the next step without changing the teaching sequence:

- Child ID and stable dataset ID.
- Activity module, vocabulary tier, lifecycle stage, practice strategy ID, and strategy version.
- Ordered target list and current target index.
- Current routine: Introduction, Expanded Trials, or Correction.
- Exact step within the current routine, including the ten-position Expanded Trials sequence.
- Current hidden-target timer value.
- Completed target words and the earned-BM pool.
- True-BM and earned-BM shuffle-bag state, including the most recently used BM word.
- Consecutive scored-error count for the current word.
- Completed scored trials, with stable attempt IDs for duplicate prevention.
- Last completed step, next step, last-updated time, completion state, and application version.

The saved trial and next-position update must be atomic or idempotently recoverable so a retry cannot skip or count a trial twice. If the child leaves after beginning but before completing a trial, that one incomplete trial restarts; completed trials, completed words, timer progression, pools, and sequence position remain intact. An official completed Acquisition score is created only after the full dataset progression is complete, but valid partial Acquisition trials and teaching state are retained in progress history.

A new Acquisition progression begins only when a different canonical weekly dataset is successfully imported, validated, and activated for that child’s grade, school year, and activity module. The Monday calendar boundary by itself must not reset progress. A duplicate import, confirmation, failed import, malformed source unit, no-slide instructional pause, refresh, new day, or application update must not erase or replace existing Acquisition progress. Older progress and completed history remain attached to their original stable dataset IDs.

Dataset selection filters by the child’s grade and school year before resolving lifecycle state through that grade’s practice profile. If a configured grade has no validated datasets yet, the child sees the existing empty-state or eligible Warmup fallback behavior. Adding or activating Kindergarten and Grade 5 datasets must not delete or rewrite any existing Grade 2, Grade 5, or other historical records.

## Vocabulary metadata and future activity types

Vocabulary records carry `language` (`mandarin` or `english`), `tier` (`tier-1`, `tier-2`, or `tier-3`), `activityType` (`dictation`, `reading`, or `spelling`), ordered source occurrence, and source provenance. A weekly dataset preserves all normalized tiers even when the current application activates only Tier 1 dictation. The model must not require reparsing a source merely to enable Tier 2 reading later.

## Practice flow

Every dictation prompt speaks the Mandarin term aloud, offers Replay, gives the child a writing surface, and runs the configured phase timer. Grade 2 uses 10 seconds for Warmup, 20 seconds for Acquisition, and 10 seconds for Test Review; other configured grades use their configured timer values.

Warmup and Test Review preserve the set-based flow: dictate the selected terms without showing their answers, then reveal each answer during the review portion and collect the child’s I got it right or I got it wrong self-assessment. Acquisition uses its teaching-specific trial flow instead: each timed writing prompt is followed immediately by its reveal/comparison frame and Yes/No response before the next trial. The current implementation may use paper, but the Acquisition handwriting-pad prototype supplies the writing surface and comparison behavior described below.

The word/context/repeated-word audio sequence uses one-second pauses. Warmup uses the same sequence at approximately 1.5 times the normal speech rate, capped to a safe browser-supported rate.

Persistence on interruption is lifecycle-specific:

- **Warmup:** Save each completed self-assessment immediately, including its source bucket and source word/dataset identity. Preserve partial-session history, attempted count, accuracy, and adaptive-state changes. An unfinished required Warmup resumes before its associated Acquisition or Test Review path continues. A started but unanswered prompt is not counted and may restart.
- **Acquisition:** Save every completed trial and the exact next teaching position as described in Acquisition continuity and persistence. Resume later from that point. A started but unfinished trial may restart without rolling back earlier completed work.
- **Test Review 1 or 2:** Keep answers provisional until every required target in that review has been assessed. If the child leaves, refreshes, signs out, or otherwise abandons the review, discard its temporary answers and do not create a score, adaptive-state update, or completed Test Review record. Previously completed sessions remain intact. An optional metadata-only abandonment audit may be retained, but it must not contain or count provisional answers as results.

### On-screen handwriting exploration

Before the production pilot, prototype an on-screen handwriting pad for Acquisition so a child cannot refer to previously written paper answers during later target trials. Use pointer input that supports touch, stylus, and mouse. The child writes in a clear canvas during the timed prompt; after submission or timer completion, the next review frame displays a snapshot of that writing beside the canonical Mandarin term and asks the child to mark it right or wrong. Clear and hide the prior writing before the next prompt.

Show/copy trials continue to display the canonical term while the child writes; hidden current-target and earned-BM trials do not. Provide child-friendly Clear and Undo controls without exposing the answer early. If a canvas trial is interrupted before self-assessment, discard only that temporary drawing and restart that trial while retaining the last completed Acquisition position.

Keep raw strokes and drawing snapshots in browser memory only for the immediate comparison by default. Do not upload or permanently store handwriting unless a later privacy, retention, deletion, and family-access review explicitly authorizes it. Persist the trial result and learning-state metadata, not the drawing. Test the prototype on representative phone, tablet, stylus, and desktop input, including accidental scrolling, orientation changes, small screens, and reduced-motion or accessibility settings. Decide whether the handwriting pad replaces paper or remains an optional mode only after child usability testing.

### Reinforcement and completion rewards

Before the production pilot, test a lightweight reinforcement system, with more frequent feedback for Kindergarten and a quieter presentation for older children. Rewards should recognize effort, persistence, and completion rather than perfect accuracy. The initial prototype may include a visible progress path, a brief acknowledgement after each completed word routine, collectible stars or stamps, a growing scene or character, and a larger completion celebration. A child who reaches a meaningful stopping point in a multi-day Acquisition progression may receive a positive “continue next time” acknowledgement without falsely marking the dataset complete.

Rewards must never change scoring, reveal an answer early, penalize mistakes, remove earned items, use competitive leaderboards, or create loss-based streak pressure. Animation and sound must be brief, skippable, possible to mute, and compatible with reduced-motion preferences. Store only the minimum per-child reward state required to prevent duplicate awards and preserve progress across devices. Use Kindergarten usability testing to decide the final reward cadence before production rollout.

### Tier 2 character-reading pathway

Tier 2 reading is a shared future module for all configured grades. It consumes the preserved `tier2[]` vocabulary from the same canonical weekly dataset without mixing reading results into Tier 1 dictation.

The child-facing response changes from writing to reading aloud:

1. Show the Tier 2 character or word.
2. Ask the child to say it aloud.
3. Provide canonical Mandarin audio through a separate control for review or comparison.
4. Collect an explicit child self-assessment.

Tier 2 uses the same high-level grade lifecycle as Tier 1: Acquisition with BM, earned BM, Expanded Trials, and Correction; the grade’s configured Test Review stages; and a required or standalone Tier 2 Warmup using already learned Tier 2 words. Grade 5 therefore uses Acquisition, Test Review 1, and Test Review 2 for both Tier 1 writing and Tier 2 reading. Tier 1 and Tier 2 maintain separate progressions, attempts, adaptive state, Warmup graphs, and scores.

The first Tier 2 implementation must decide whether it uses immediate self-assessment without retaining audio or includes the previously proposed four-second `MediaRecorder` capture and playback. Voice recording is not assumed merely because the term is read aloud. If recording is included, microphone permission, private family-scoped storage, upload recovery, retention, deletion, supported formats, and cross-device playback must pass a separate privacy and storage review before production.

Following Tier 2 reading, begin a separate English spelling dictation section using the words imported from the ELA spelling list. English spelling results must be reviewed and scored independently from Mandarin dictation and Mandarin reading.

## Scoring and history

The primary metric is percentage correct. Create a primary dataset score only after every required word or scored trial in the relevant Acquisition or Test Review progression has been completed and reviewed. Partial Acquisition trials remain durable learning records but do not create a falsely complete dataset score. Abandoned Test Review answers remain temporary and create no score.

Warmup does not create a per-dataset score. It has its own line graph with one point per Warmup visit that contains at least one completed self-assessment. Each point records the local date, Warmup type, target item count, attempted item count, correct item count, percentage correct, and `partial` or `completed` status. The graph must display the attempted-versus-target count so a short partial Warmup is not presented as equivalent to a completed six- or sixteen-item Warmup. Preserve the source category of each attempt so the history can also distinguish Random Rotation, Recent Review, and Errored Word performance. Filters or separate series may show monthly Random Rotation accuracy without losing the complete Warmup history.

Show a separate history graph for every permanent weekly dataset, ordered newest first, with each completed score point labeled by phase and date. Acquisition may span several daily visits but remains attached to one stable dataset progression; visit dates and partial trial history remain inspectable even though the official dataset score is added only upon completion.

Preserve detailed records containing child ID, stable dataset ID and date range, word ID, grade, activity module, vocabulary tier, lifecycle stage, practice strategy ID and version, unique visit/session ID, stable attempt ID, local session date, correct/incorrect result, error history, Warmup-session history, Acquisition progression ID and position where applicable, complete-source-dataset status, completion status, scoring status, answer-reveal method, and application version. Duplicate attempt, progression, or session IDs must never create duplicate trials or scores.

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

Build the practice experience with sample permanent date-range datasets, required Warmup, Acquisition and Test Review lifecycle phases, randomized words, audio, Replay, phase timers, interstitials, right/wrong review controls, dataset-level scores, legacy migration, and separate graphs. Persist partial Warmup attempts and Warmup graph points. Persist Acquisition as an exact multi-day teaching progression. Keep abandoned Test Review work provisional and unscored.

### Stage 2 — Accounts and data

Add parent authentication, multiple child profiles, Firestore persistence, archive behavior, cross-device sessions, and security rules separating family data. Cloud persistence must include module-specific Warmup visits and attempts, Acquisition progression state and trials, Test Review 1 and 2 temporary state, and scores without mixing their different completion rules. Persistent reward state is added only after the reward prototype defines its minimum schema.

### Stage 3 — Administrator configuration

Add school-year setup, grade-to-source mappings, source-adapter and practice-strategy profiles, active/inactive status, and administrator-only settings.

### Stage 4 — Curriculum-source integration

Add one-time administrator authorization, a manual Sync Now operation, the canonical source boundary, Grade 2 and Grade 5 Slides profiles, the Kindergarten Sheets adapter, Tier 1–3 preservation, source-role mapping, deterministic dataset IDs, content fingerprints, confirmation and conflict classification, reviewed Firestore write plans, dry-run summaries, and malformed-data reporting. Writing-workshop recognition remains an explicit deferred extension for sources without an approved marker.

### Stage 5 — Audio service

Add cached Mandarin and English audio, Replay, Tier 2 canonical-audio playback, and later pronunciation corrections.

### Stage 6 — Automatic operation

Deploy the importer to Cloud Run and schedule it with Cloud Scheduler every Monday at 3:00 p.m. America/Los_Angeles. Add logging, duplicate prevention, and failure notification.

### Stage 7 — Public testing

Test multiple families, Kindergarten, Grade 2, Grade 5, new midyear students, school-year transitions, archived profiles, cross-device parent sessions, exact Acquisition resumption, partial Warmup history, abandoned Test Review cleanup, Grade 5 Test Review 1 and 2 transitions, no-slide lifecycle freezes, handwriting-pad usability, reinforcement cadence, and future weekly email reports.

### Stage 8 — Tier 2 reading and English spelling

Activate the preserved Tier 2 data through a shared character-reading module with per-grade Acquisition, Test Review, Warmup, persistence, scoring, and history. Decide whether the first release is self-assessment-only or includes four-second voice recording. If recording is approved, add explicit microphone permission, `MediaRecorder`, private family-scoped uploads, playback, retention and deletion rules, and failure handling. Add English spelling-list extraction, English audio prompts, English dictation, independent English review, and independent English scores later without mixing activity histories.

## Approved implementation dependency roadmap

The immediate source and persistence foundation follows this approved sequence. Each branch starts from updated `main` after the preceding branch merges; no grade branch is created from another unmerged grade branch.

```text
docs/cloud-launch-roadmap
        ↓ approve and merge
refactor/canonical-source-boundary
        ↓ merge
feature/grade5-source-profile
        ↓ merge
feature/kindergarten-sheets-adapter
        ↓ merge
feature/persistent-warmup
        ↓ merge
feature/persistent-acquisition
```

After persistent Acquisition merges, the handwriting, reward, and Tier 2 modules branch from that updated shared foundation rather than from a Grade 2, Grade 5, or Kindergarten feature branch:

```text
feature/persistent-acquisition
        ↓ merge
updated main
├── feature/handwriting-pad
├── feature/reward-behavior
└── feature/tier2-reading-lifecycle
```

Firebase Hosting may be prepared without production data after the source and local persistence foundation is stable. Secure cloud persistence, controlled multi-grade imports, the production pilot, and automatic multi-source synchronization retain their separate acceptance gates. The final ordering of Tier 2 relative to the writing-only production pilot depends on whether the first Tier 2 release stores child voice recordings.

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
- Preserve the existing Grade 2 importer output, dataset IDs, practice behavior, and tests exactly.
- Move Grade 2-specific parsing and teaching parameters behind named, versioned profiles.
- Include no Grade 5 or Kindergarten vocabulary and perform no cloud writes.

Acceptance gate: normalized Grade 2 output is unchanged, all existing tests pass, source-independent validation is testable with fixtures, and the browser still has no shared-data write path.

### Phase 2 — Grade 5 source profile

Branch: `feature/grade5-source-profile`

Goal: parse and validate the latest Grade 5 structure without changing Grade 2 behavior or writing cloud data.

- Validate the latest consecutive Grade 5 slide structure through the approved read-only source path.
- Extract Tier 1–3 from the correct Mandarin table cells using source role rather than first/last Tier heading position.
- Map `Coming next week/Core vocab` to the displayed week’s Acquisition candidate and treat its later `This week` appearance as confirmation.
- Preserve source labels, assigned week, content fingerprint, slide provenance, allowed duplicates, and the 3–10 Tier 1 count rule.
- Define the Grade 5 lifecycle profile with Test Review 1, Test Review 2, and no-slide lifecycle freezing.
- Preserve early inconsistent slides as issues rather than guessed datasets.

Acceptance gate: fixtures for the latest validated pattern produce the approved Acquisition and confirmation candidates; collisions and conflicts are deterministic; Grade 2 output is unchanged; no Firestore write occurs.

### Phase 3 — Kindergarten Sheets adapter

Branch: `feature/kindergarten-sheets-adapter`

Goal: adapt the authoritative Kindergarten workbook into normalized candidates without inventing date or workshop rules.

- Treat the spreadsheet ID as the yearly source identity and each weekly tab as a source unit.
- Map `Writing character` to Tier 1, `High frequency word` to Tier 2, and Tier 3 to an empty array.
- Preserve tab title, tab identity, source order, raw date, and source provenance.
- Leave displayed end dates, newest-tab fallback, activation rollover, and writing-workshop recognition explicitly unresolved.
- Produce reviewed local dry-run output only; do not write Firestore.

Acceptance gate: observed weekly-tab fixtures normalize tiers without mixing labels, no `gid` is treated as the yearly source ID, deferred date fields fail closed rather than being guessed, and Grade 2 and Grade 5 tests remain unchanged.

### Phase 4 — Persistent Warmup and analytics

Branch: `feature/persistent-warmup`

Goal: preserve partial Warmup work through a grade- and module-aware shared contract.

- Persist the materialized target order, source buckets, current position, completed self-assessments, partial/completed status, and graph point.
- Keep Tier 1 writing and Tier 2 reading Warmup state separate.
- Preserve the current Grade 2 counts, quotas, promotion thresholds, shuffle bag, and audio behavior behind the Grade 2 profile.
- Require Kindergarten and Grade 5 to adopt or override every teaching parameter explicitly.
- Keep Test Review answers provisional and unrelated to durable partial Warmup results.

Acceptance gate: partial Warmup history survives restart without duplicate graph points or shuffle-bag consumption, Grade 2 behavior is unchanged, and unsupported grade/module policies fail closed.

### Phase 5 — Persistent Acquisition and grade lifecycle strategies

Branch: `feature/persistent-acquisition`

Goal: preserve the exact teaching point while supporting versioned grade lifecycle and activity strategies.

- Persist the strategy ID and version, activity module, tier, lifecycle stage, exact routine step, timers, pools, counters, completed trials, and next position.
- Resume after refresh, sign-out, a new day, and application restart without replaying completed work.
- Preserve the exact Grade 2 Acquisition behavior as `grade2-acquisition-v1`.
- Support Grade 5 Test Review 1, Test Review 2, confirmations, and no-slide freezes without changing Grade 2 lifecycle behavior.
- Keep abandoned Test Review 1 and 2 answers provisional and unscored.
- Migrate or safely interpret existing local records without fabricating completed progress.

Acceptance gate: Grade 2 regression tests remain unchanged; partial Acquisition resumes at the exact next step without duplicate attempts; Grade 5 advances only on validated instructional source progression; no-slide weeks freeze positions; abandoned Test Reviews create no result or score.

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
        ├── configured test-review-stage sessions and temporary attempts
        ├── scores
        └── adaptive/warmup state

Shared server-managed data
├── datasets
│   └── words
└── import logs
```

- Configure email/password authentication, password reset, authorized domains, expiration handling, and sign-out.
- Keep local and cloud modes explicit. Never silently upload, merge, overwrite, or discard local browser progress when cloud mode is enabled.
- Test Firestore rules with the Firebase Emulator Suite. Parent A must not read or write Parent B's family, and browser clients must never write shared datasets or import logs.
- Require attempts to reference an owned active child, a valid session, an existing canonical dataset, and a word belonging to that dataset.
- Require completed scores to match the child and dataset. Partial Warmup and Acquisition records may be durable, but they must not claim a completed dataset score. Abandoned Test Review sessions may not create attempts, adaptive updates, or official scores.
- Make Acquisition trial writes and next-position updates atomic or idempotently recoverable, and reject duplicate stable attempt IDs.
- Treat browser-computed scores as client-trusted pilot data until final score creation is moved behind a trusted server endpoint or receives equivalent server-side verification. Do not describe client-trusted scores as independently verified assessments.
- Define account removal, data retention, and deletion procedures before collecting production data.

Acceptance gate: an invited staging parent can sign in, create or select a child, complete or partially complete practice, sign in on a second computer, and see the same Warmup history and exact Acquisition position. Cross-family access, invalid or duplicate attempts, false completion scores, abandoned Test Review results, and shared-data writes are rejected by emulator-backed tests.

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
- Keep Kindergarten dry-run-only until its deferred date policy is approved; do not let that unresolved grade cause Grade 2 or Grade 5 data to be guessed or rewritten.

Acceptance gate: each grade is activated independently only after its source and date policy pass. Activated staging users read only their grade- and school-year-matched server-imported datasets; local and backend normalized outputs match; repeated imports preserve identical Firestore state; no manually invented, guessed, or placeholder production vocabulary exists.

### Phase 9 — Handwriting and reward prototypes

Branches: `feature/handwriting-pad` and `feature/reward-behavior`, each created from updated `main` after persistent Acquisition merges.

Goal: test the on-screen writing and age-appropriate completion supports before inviting production families.

- Implement the in-memory Acquisition handwriting-pad comparison flow without uploading or permanently storing strokes or snapshots.
- Preserve the established visible-target and hidden-target rules and clear prior writing before the next prompt.
- Verify touch, stylus, and mouse behavior across representative screen sizes and input conditions.
- Define modality-neutral completion events, then add a configurable low-stakes reward prototype that recognizes effort and completion, with more frequent feedback for Kindergarten.
- Support mute/skip and reduced-motion behavior; do not add accuracy-only rewards, penalties, leaderboards, or loss-based streaks.
- Observe child usability and decide whether handwriting replaces paper or remains optional, and set the reward cadence by grade, before production rollout.

Acceptance gate: child usability testing confirms that prior written answers are not visible during later prompts, children can complete and self-assess writing without adult troubleshooting, interruptions restart only the incomplete trial, and reinforcement supports completion without changing scores or pressuring children over mistakes.

### Phase 10 — Tier 2 reading activation

Branch: `feature/tier2-reading-lifecycle`, created from updated `main` after persistent Warmup and Acquisition merge.

Goal: activate preserved Tier 2 vocabulary through one shared reading module with grade-specific lifecycle strategies.

- Show the character or word and ask the child to say it aloud.
- Reuse the grade’s configured Acquisition, Test Review, and Warmup structure without sharing Tier 1 dictation state.
- Support Grade 5 Test Review 1 and Test Review 2.
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
- Add structured import logs, deterministic retry behavior, failure notification, and a documented rollback/disable procedure.

Rollout order:

1. Deploy Cloud Run with writes disabled.
2. Verify the health endpoint and authorization failures.
3. Run the read-only backend shadow comparison.
4. Enable and inspect one manually invoked staging write.
5. Repeat the staging import and verify idempotency.
6. Perform one explicitly authorized production import.
7. Enable Scheduler only after all prior gates pass.

Cloud Run and Scheduler are not prerequisites for the public pilot. Secure hosting, family isolation, lifecycle-specific cross-device persistence, and a controlled dataset import for every grade included in the pilot must work first.

## Next approved implementation — Canonical source boundary

After this working plan is approved and merged, the next implementation is `refactor/canonical-source-boundary`. It is a behavior-preserving Grade 2 refactor that introduces the shared normalized candidate and adapter boundary. It makes no Google API calls, includes no Grade 5 or Kindergarten vocabulary, performs no Firestore writes, and must not change the existing Grade 2 child experience. Grade 5, Kindergarten, persistent Warmup, and persistent Acquisition follow only through the approved branch sequence above.

## Deferred features

The first version will not include ten-word mastered rotations, sentence-writing activities, camera-based or automated handwriting grading, or automated weekly emails. The on-screen handwriting pad uses child self-assessment and does not attempt to recognize or grade handwriting. The detailed history model should support later features without losing past data.

## Safety rules

- Never silently accept failed vocabulary extraction.
- Never collapse Grade 5 source labels into lifecycle roles without applying the approved Grade 5 profile.
- Never discard preserved Tier 2 or Tier 3 source data merely because the current activity uses Tier 1.
- Never display pinyin or English meanings to children.
- Save completed Warmup and Acquisition work according to their durable progress rules; never erase it merely because a visit ends.
- Never count provisional answers from an abandoned Test Review in results, adaptive state, or official scores.
- Never represent partial Acquisition progress as a completed dataset score.
- Do not delete historical weekly sets or completed attempts.
- Do not store private credentials in GitHub.
- Keep parent settings separate from child practice screens.
- Do not upload or permanently retain children's handwriting without a separate privacy, access, retention, and deletion decision.
- Do not condition rewards on perfect accuracy or use penalties, competitive leaderboards, or loss-based streak pressure.
- Never record a child before microphone permission and a clear reading-session action have been provided.
- Treat child voice recordings as private personal data; restrict access to the authorized family and define retention/deletion behavior before production.
- Do not use automatic speech recognition as the official pronunciation score without a separately validated feature; the child’s explicit self-assessment is the initial reading result.

## Current implementation baseline and required revisions — 2026-09-24

The repository contains Stage 2 foundations as a Firebase REST-backed browser flow with safe configuration placeholders. They have not been deployed, validated with the Firebase Emulator Suite, or approved for production data collection. The approved requirements in this plan supersede any existing implementation behavior that treats every incomplete lifecycle in the same way.

Already implemented:

- Email/password sign-up, sign-in, sign-out, password reset, persistent signed-in sessions, loading state, and readable authentication errors.
- One private family per parent, multiple active/inactive children, child switching, nickname editing, grade editing, reactivation, and non-destructive inactivity.
- A grade model for Kindergarten through Grade 5, currently with Grade 2 as the active Slides configuration and Grade 5 registered but inactive.
- August 1 America/Los_Angeles grade-promotion suggestions with parent confirmation; historical datasets retain their original grade and school year.
- Grade/school-year filtering, stable date-range dataset identities, cloud session primitives, temporary and completed attempts, dataset-level scores, and stale-session cleanup.
- An idempotent, configurable Google Slides parser and local dry-run/write command for the supplied Grade 2 deck.
- Explicit writing-workshop outcomes, malformed-slide rejection, missing-current-week Warmup fallback, and Firestore ownership rules in `firestore.rules`.

Required revisions before a production pilot:

- Replace the existing shared incomplete-session cleanup behavior with durable partial Warmup records, exact resumable Acquisition progression, and all-or-nothing Test Review handling.
- Add the full Warmup history line graph with target, attempted, correct, percentage, and partial/completed data.
- Introduce the canonical source boundary, validate the latest Grade 5 table roles, and add the Kindergarten Sheets adapter without guessing deferred date rules.
- Preserve Tier 1–3, source labels, instructional roles, assigned weeks, fingerprints, confirmations, conflicts, and malformed outcomes.
- Add cloud rules and emulator tests for module-specific Warmup visits, Acquisition progressions, stable attempt IDs, exact next-position updates, and Test Review 1 and 2 provisional data.
- Prototype and test the in-memory handwriting pad and grade-sensitive reinforcement flow before deciding their final production presentation.
- Create separate staging and production Firebase environments. Test Firestore rules in the Emulator Suite before deployment.
- Configure Firebase Hosting, cross-device staging validation, production Authentication, production Firestore rules, App Check monitoring, retention procedures, and public-pilot access.
- Keep official browser-created scores identified as client-trusted until a trusted server boundary or equivalent authoritative validation is implemented.
- Deploy no Cloud Run importer or Monday Cloud Scheduler until manual and shadow validation gates pass.

The active Grade 2 source deck was inspected read-only; its structure and page IDs are in `docs/grade2-deck-structure.md`. The Grade 5 observed structure is in `docs/grade5-deck-structure.md`, and the existing partial Grade 5 parser profile must be validated and extended against the latest approved table-role rules rather than replaced blindly. Kindergarten uses one authoritative Sheets workbook with weekly tabs; its source adapter must preserve the inspected `Writing character` and `High frequency word` mappings while its date policy remains deferred.

Remaining product decisions include whether duplicate source occurrences produce repeated practice targets, Kindergarten displayed end dates and activation rollover, trusted Grade 5 and Kindergarten no-instruction/workshop markers, whether the first Tier 2 release stores voice recordings, whether parent registration is invitation-only or open, whether email verification is required, the account and practice-data retention/deletion policy, how existing local profiles are mapped during migration, whether the handwriting pad replaces paper or remains optional, and the final reward cadence for each grade. Each decision must be recorded before the phase whose security, privacy, migration, source identity, or child experience depends on it.
