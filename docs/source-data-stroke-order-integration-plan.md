# Authoritative source data and Stroke Order integration plan

Status: Approved execution handoff. Begin only after the active Stroke Order worktree is clean, committed, and pushed.

Audit date: 2026-10-05

Audit anchors:

- Cross-grade Ninja Skills: `4a38a90175e39b13f4caf4d47751ba49937206fa`
- Committed Stroke Order comparison work: `21e5b14`
- Shared Stroke Order Phase 1 implementation: `3c1ddba`
- EduGames module provenance: `56d4becba3149f28b9737d8bc552017da077fe64`

This plan connects the six transplanted Ninja Skills learning modules and the separate Stroke Order Acquisition experience to reviewed source data for Kindergarten, Grade 2, and Grade 5. It does not make Stroke Order a seventh Ninja Skills module.

## Non-negotiable boundaries

- **Practice your Ninja Skills** contains Dictation Streak, Shuriken Match, Shadow Strike Dojo, Memory Lanterns, Context Gap Dash, and Sushi Scramble.
- **Enter the Dojo** contains three parallel Acquisition experiences for the same cohort: Writing, Stroke Order, and Reading.
- The registered weekly Google source remains authoritative for cohort membership, target text, tier, week, and source order.
- Reviewed enrichment is authoritative for meanings, Pinyin steps, context sentences, sentence tokens, and audio references. Missing enrichment disables only the module that requires it.
- Licensed, versioned geometry is authoritative for stroke presentation. Teacher weekly files do not own stroke paths.
- Writing, Stroke Order, and Reading use separate versioned `experienceId` values, progression, checkpoints, scores, and History projections. Adaptive Warmup remains shared.
- Raw handwriting coordinates, rendered images, and reading recordings are never stored durably.
- Child-facing results may say **completed**, **correct**, or **needs correction**. They must not claim mastery from a module visit or self-assessed handwriting.

## Verified source inventory

| Grade | Registered source | Source type | Runtime state at audit | Required next step |
|---|---|---|---|---|
| Kindergarten | `1lBWZeDhb_IIhBJ8SIzZts637JBS6HETh6uFblNNTOxA` | Google Sheets | Inactive; development harness uses a fixture through Week 7 while the live workbook includes `Week 8 10/05` | Add a trusted workbook snapshot/sync path and release validation before activation |
| Grade 2 | `10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4` | Google Slides | Active; reviewed runtime snapshot contains the same six source units as the live deck outline through `Week 10/5-10/9` | Preserve the existing trusted snapshot boundary and join reviewed enrichment after canonical extraction |
| Grade 5 | `1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI` | Google Slides | Inactive; development harness uses a reduced Week 4-7 fixture while the live deck contains eight slides through Week 8 | Add a trusted table- and hyperlink-preserving snapshot/sync path and release validation before activation |

The live weekly sources provide vocabulary but do not currently provide canonical learning-module metadata. Text-only cohorts can enable Shadow Strike Dojo and Memory Lanterns. The other four modules must remain unavailable until their required reviewed fields are joined.

## Branch handoff gate

Do not merge or rebase while the separate Stroke Order worktree has uncommitted changes.

1. Finish the active Stroke Order implementation work.
2. Run its focused unit, persistence, rules, backup/restore, and browser tests.
3. Commit and push it, then record the handoff commit SHA in this document or its pull request.
4. Land `feature/cross-grade-ninja-skills` on current `main` first.
5. Create a fresh integration branch from that updated `main`.
6. Port the Stroke Order changes as small, reviewable commits. Do not merge the old divergent branch wholesale.
7. Keep the old branch as a reference until the new implementation passes all acceptance gates.

The fresh integration branch should separate pure assets and presentation primitives from Acquisition orchestration, persistence, source integration, and grade activation. This makes omissions and cross-grade regressions visible in review.

## Workstream 1: production source parity

### Kindergarten

- Add a trusted read-only fetch and sanitized runtime artifact for the registered workbook.
- Preserve sheet ID, exact tab title, bounded source range, retrieval time, adapter version, and content checksum.
- Validate weekly-tab dates, Writing characters, High-frequency reading words, review-week markers, and source identity.
- Replace prototype fixture loading only after the production artifact and dry-run report pass.
- Leave the registry entry inactive until deployment, restore, and browser release gates pass.

### Grade 2

- Retain the existing reviewed Slides snapshot pipeline and source-identity checks.
- Join enrichment only after canonical occurrence identities are created.
- Reject enrichment whose source unit, target text, position, or source fingerprint does not match the current canonical candidate.

### Grade 5

- Add a trusted read-only fetch and sanitized runtime artifact for the registered deck.
- Preserve table structure and reviewed book hyperlinks; a text-only export is insufficient for the current adapter.
- Validate the This week confirmation section, Coming next week/Core vocab acquisition section, Tier 1 limits, progression chain, and source identity.
- Replace the reduced fixture only after the live artifact passes adapter, progression, and conflict tests.
- Leave the registry entry inactive until deployment, restore, and browser release gates pass.

## Workstream 2: reviewed learning-module enrichment

Use one structured companion Google Sheet, or one equally structured companion per grade, rather than embedding machine data in teacher Slides. Each record must identify one canonical vocabulary occurrence and include:

- grade and school year;
- source document ID and source unit ID;
- tier, source position, and exact target text;
- canonical target occurrence ID;
- source content fingerprint and enrichment schema version;
- approved English meaning;
- Pinyin display text and per-character Pinyin/candidate steps;
- approved context sentence and ordered sentence tokens;
- optional reviewed word and sentence audio references; and
- review status, reviewer, and review timestamp.

The trusted importer must validate and join this metadata before creating a learning-module pack. It must reject text-only joins, stale source fingerprints, ambiguous duplicate meanings, mismatched Pinyin candidates, sentences that do not contain the target exactly once when required, and token lists that do not reconstruct the approved sentence.

Do not put grade-specific meanings or sentences in application adapters. Do not infer them from surrounding slide prose. Enrichment changes participate in canonical fingerprinting and produce a reviewable revision.

## Workstream 3: Acquisition-driven Stroke Order

Use the accepted parallel-Acquisition decision as the implementation contract:

1. Extract the reusable canvas, model display, and stroke geometry from the session-only prototype.
2. Drive Stroke Order with the exact selected grade's Acquisition strategy, including Introduction, Expanded Trials, Correction, Familiar-DT behavior, timers, audio cadence, repetition, and pre-activity Adaptive Warmup.
3. Add `experienceId: 'stroke-order'` throughout persistence identity, checkpoints, cloud paths, security rules, backup/restore validation, History, and reports. Legacy records without an experience ID remain Writing.
4. Preserve separate Writing, Stroke Order, and Reading progression. Completion in one experience must not advance either of the others.
5. Checkpoint only completed transitions. Resume the prompt with a blank pad; never persist an unfinished or completed drawing.
6. Add dated Dojo reentry for unfinished older cohorts without changing their lifecycle stage.

The trace phase may reuse the audited EduGames `strokeMatchesGuide` logic as instructional coaching. It checks endpoints, direction, path length, and deviation. Memory writing remains explicitly self-assessed unless a separately calibrated assessment is approved. Trace coaching must not be mislabeled as automatic handwriting mastery.

Remove the Phase 1 bypass that permits review without an adequate trace. Do not persist the prototype's serialized drawing response. Durable evidence may include target identity, self-assessment, retry count, stroke count, elapsed active time, exit/resume events, and completion timestamps, but never coordinates or images.

## Workstream 4: stroke asset coverage

The Phase 1 bundle contains geometry for only a small reviewed character subset. At the audit point it covers the current Kindergarten writing targets `牛、羊`, but it does not cover any complete target in the current Grade 2 or newest Grade 5 Tier 1 sets.

- Maintain a versioned geometry manifest with upstream source, license, checksum, supported characters, and generation date.
- Generate or package coverage for every character in active and resumable cohorts before a release.
- Validate multi-character targets one Unicode character at a time and restart visible stroke numbering per character.
- Follow the accepted static-character fallback when canonical geometry is missing. Do not disable an otherwise valid weekly curriculum import or silently drop only the unsupported targets.
- Preserve the Arphic/Make Me A Hanzi attribution and license obligations for redistributed median data.
- Add a Grade 5 presentation adapter and stable Stroke Order activity identity; do not substitute Grade 2 configuration.

## Pull request sequence

1. **Handoff and branch normalization** — record the other window's clean commit; land cross-grade Ninja Skills; create the fresh integration branch.
2. **Source parity** — add trusted Kindergarten and Grade 5 runtime artifacts, dry runs, checksums, and fixture refresh tooling without activating either source.
3. **Enrichment boundary** — add the companion-sheet schema, importer, validation, provenance, fingerprinting, and capability tests.
4. **Stroke primitives and assets** — port licensed assets, static fallback, trace coaching, and coverage validation without application activation.
5. **Stroke Acquisition identity** — integrate `experienceId`, checkpoints, persistence, rules, backup/restore, History, and Dojo reentry.
6. **Grade presentation adapters** — connect Kindergarten, Grade 2, and Grade 5 to their own strategies and current canonical cohorts.
7. **Controlled activation** — enable and verify one grade at a time behind explicit source and feature gates.

## Required tests

### Source and enrichment

- Exact Google file identity, source-unit identity, parser/adapter version, checksum, and retrieval timestamp.
- Live-shaped fixture coverage for the newest Kindergarten tab and Grade 5 slide.
- Changed-source conflict, stale enrichment, duplicate occurrence, malformed Pinyin, missing context, and invalid-token rejection.
- Capability expectations proving text-only cohorts enable only Shadow Strike Dojo and Memory Lanterns.
- No direct browser access to Google credentials or teacher files.

### Stroke Order

- Correct and incorrect position, reversed direction, short path, long path, scribble, undo, clear, and replay.
- Multi-character targets, per-character numbering, missing geometry, and static fallback.
- Exact grade-owned Acquisition transitions and timers for Kindergarten, Grade 2, and Grade 5.
- Separate Writing, Stroke Order, and Reading identities, scores, checkpoints, and History projections.
- Shared Adaptive Warmup without cross-advancing Acquisition experiences.
- Exit/resume, cohort rollover, idempotent retry, multi-device conflict, backup/restore, and Firestore security rules.
- Proof that local and cloud durable records contain no stroke coordinates, images, or reading recordings.
- iPad touch and trackpad behavior, keyboard navigation, screen-reader labels, reduced motion, audio fallback, and 390-pixel layout.

### Existing modular games

- Correct answer, retry, completion, exit, and return-to-cohort behavior for all six modules.
- Grade-specific cohort selection for Kindergarten current week, Grade 2 Acquisition or approved Mastery cohort, and Grade 5 Test Review 1.
- No module completion changes Acquisition, Test Review, Adaptive Warmup, or Mastery state.
- Lazy-load and performance-budget checks for every transplanted module and the stroke asset path.

## Activation gates

A grade may expose the six Ninja Skills cards while showing specific missing-data explanations, but it may not launch a module with incomplete or inferred input. A grade may expose Stroke Order only when all of the following pass:

- registered production source and current runtime artifact;
- grade-owned Acquisition strategy and presentation adapter;
- separate experience persistence and security rules;
- geometry or approved static fallback for every active target;
- no raw-drawing persistence;
- source, unit, component, browser, accessibility, device, backup/restore, and hosted smoke tests; and
- an explicit release decision. Implementation or deployment alone does not activate production use.

## Definition of done

- Kindergarten, Grade 2, and Grade 5 use their registered authoritative weekly sources through trusted runtime artifacts.
- Every Ninja Skills launch receives a complete provenance-bearing pack; missing enrichment produces a precise unavailable state.
- Writing, Stroke Order, and Reading appear as separate Dojo Acquisition experiences for all three grades.
- Stroke Order follows the grade's strategy, supports safe resume, and never stores handwriting traces.
- Current and resumable cohorts have complete geometry or the approved static fallback.
- No hard-coded curriculum meanings remain in Stroke Order adapters.
- All required automated and device tests pass, and each grade is activated only through an explicit release gate.
