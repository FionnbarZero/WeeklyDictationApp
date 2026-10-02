# Weekly Dictation

React/Vite prototype for a Mandarin dictation practice app. Stage 2 keeps the existing child-friendly practice flow while adding authenticated parent families, multiple child profiles, Firestore-backed sessions/scores, grade-aware datasets, and a configurable Grade 2 Google Slides importer.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Firebase variables, the app runs only as a clearly local development/demo mode. Legacy localStorage data is never uploaded to a parent account. Authenticated practice requires Firebase and an active internet connection; official cloud scores are not created when Firestore cannot confirm the write.

### Isolated curriculum labs and public preview

When the Vite development server is running, these isolated pages can be opened directly:

- `/grade5-source-harness.html` — inspect the trusted Grade 5 source fixture.
- `/grade5-learning-hub.html` — test the Grade 5 child lab through the shared Kindergarten-inspired Learning Hub UI.
- `/kindergarten-source-harness.html` — inspect the trusted Kindergarten Sheets fixture and Monday–Sunday normalization.
- `/kindergarten-learning-lab.html` — test **Enter the Dojo**, weekly Tier 1 writing, shared recorded Tier 2 reading, and the explicit Unit 1 review fixture.
- `/tier2-reading-lab.html` — exercise the separate reading lifecycle for Kindergarten, Grade 2, and Grade 5 entirely in memory.
- `/grade2-test-review-prototype.html` — test the approved collect-all, one-page final review pattern for one Grade 2 writing and reading week.
- `/learning-games-harness.html` — test all ten modular learning-game components with synthetic interaction values.
- `/skywriting-harness.html` — test the standalone Sky Writing module with ten source-derived Tier 1 targets across Kindergarten, Grade 2, and Grade 5.
- `/skywriting-acquisition-harness.html` — test the Acquisition-controlled Sky Writing response with three source-derived Grade 5 Tier 1 targets.
- `/skywriting-font-comparison.html` — compare Songti SC Light and Kaiti SC Regular using the Grade 5 Sky Writing prototype targets.

The lab pages are not linked from `index.html` or `App.tsx`, do not activate a curriculum source, and do not persist progress. The two browser source labs read checked-in fixtures or user-selected local JSON only. Kindergarten now also has a separately owned production-practice profile, but its source-registry release flag remains off. The grade-neutral Learning Hub presentation boundary is documented in [`docs/shared-learning-hub-ui.md`](./docs/shared-learning-hub-ui.md); grade lifecycle, source parsing, and practice engines remain outside it.

An explicit public-preview build publishes only the primary app, the Grade 5 Learning Hub, the Kindergarten Learning Lab, and the testing index under the GitHub Pages repository base path:

```bash
npm run build:public-preview
npm run test:public-preview
```

The preview flag makes the two fixture-backed labs available in that build without activating their production source registrations or enabling persistence. Grade 5 includes current Tier 1 writing and Tier 2 reading plus cohort-specific Spirit Realm reacquisition; reacquisition repeats the teaching routine without moving the cohort out of Mastery.

The approved prototypes also have a separately tagged, packaged baseline. Its exact route inventory, limitations, regression tests, build command, and immutable-publication rules are recorded in [`docs/prototype-baseline.md`](./docs/prototype-baseline.md). The prototype-baseline mode does not alter the normal production or public-preview entry lists.

## Firebase setup

1. Create a Firebase project and a web app.
2. Enable Email/Password in Firebase Authentication.
3. Create a Firestore database.
4. Copy the web app's API key, project ID, and auth domain into `.env.local` using `.env.example`.
5. Deploy `firestore.rules` from a trusted Firebase project workspace.

The browser uses Firebase's public REST endpoints. The API key is client configuration, not a private key. Never commit service-account JSON, OAuth refresh tokens, or other secrets. Email verification is intentionally not required for this stage.

## Cloud data model

- `users/{parentId}`: parent ID, family ID, email, role, created/updated timestamps.
- `families/{familyId}`: one owner parent and timestamps.
- `families/{familyId}/children/{childId}`: nickname, grade, school year, active state, grade-effective date, timestamps.
- `datasets/{datasetId}` and `datasets/{datasetId}/words/{wordId}`: shared, immutable weekly datasets.
- `families/{familyId}/children/{childId}/sessions/{sessionId}` and `/attempts/{attemptId}`: in-progress, completed, or abandoned sessions and attempts.
- `families/{familyId}/children/{childId}/scores/{scoreId}`: complete dataset scores only.
- `families/{familyId}/children/{childId}/warmupState/current`: the adaptive warmup state needed to continue category and rotation decisions across devices.
- `families/{familyId}/children/{childId}/warmupVisits/{visitId}`, `warmupQueueEntries/{entryId}`, `warmupMastery/{stateId}`, `warmupTransitions/{transitionId}`, `warmupAttempts/{attemptId}`, `warmupGraphPoints/{pointId}`, and `warmupRotations/{rotationId}`: compact revisioned Adaptive Warmup visit metadata, independently validated materialized queue entries, child mastery state, immutable receipts and attempts, one updatable graph point per visit, and rotation-cycle state.
- `importLogs/{logId}`: reserved for trusted importer backends; parent clients cannot write shared datasets or logs.

Firestore rules keep one parent restricted to one family, preserve inactive child history, prevent parent edits to shared datasets, and reject sessions for children outside the parent's family.

The repository includes Firebase Emulator and Playwright gates for the versioned Acquisition and Adaptive Warmup checkpoints. Run `npm run test:firestore` with Java 21+ and `npm run test:browser` after installing Playwright Chromium. These supplement the pure domain/importer suite and production build; they do not authorize deployment or production-data writes.

## Google Slides importer

The active source is the 2026–2027 Grade 2 deck in `src/config.ts`: `26-27 G2 Weekly Focus` (`10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4`). The source registry uses neutral document identity, so a future Sheets source will not require fake deck fields. The public compatibility API and Grade 2 parser profile remain in `src/slidesImporter.ts`; source extraction now runs through the pure adapter and shared identity/validation layers documented in [`docs/canonical-source-boundary.md`](./docs/canonical-source-boundary.md). The observed Grade 2 structure and page IDs are documented in [`docs/grade2-deck-structure.md`](./docs/grade2-deck-structure.md). Grade 5 remains registered but inactive for new imports, and grades without an explicit practice profile cannot inherit Grade 2 teaching behavior.

When no valid vocabulary dataset has ever activated, the child is offered a Warmup-only mastery session whenever eligible Mastered targets exist. Once Acquisition and Test Review assignments exist, a missing, malformed, conflicting, duplicate-only, or writing-workshop source unit does not expire or advance them. This path never invents a primary dataset or primary score.

## Practice contract

- Acquisition is the newest valid vocabulary dataset whose activation date has arrived, and Test Review is its immediate valid predecessor. Both remain assigned through weekends and source gaps until a valid replacement activates, and both must be separately visible and startable.
- Kindergarten uses its explicit unit lifecycle instead: the newest arrived Unit 1 set is available for weekly Acquisition while all arrived Unit 1 sets form one cumulative Test Review. A completed cumulative review writes one score for each canonical source week rather than inventing a combined dataset.
- Every Acquisition or Test Review path offers its own adaptive Warmup. Grade 2 currently includes a **Skip Warmup** development option; whether Warmup is required is a grade-profile policy rather than a universal rule.
- Every shared Tier 1 writing response uses the in-memory Sky Writing pad: Songti tracing is shown only for show-and-copy teaching prompts, hidden dictation prompts remain blank, and the child’s drawing is retained only long enough for the matching side-by-side review.
- Warmup is a practice segment assembled only from canonical Mastered words. Active Acquisition, active Test Review, Future, writing-workshop, and malformed datasets are excluded regardless of persisted adaptive category, and no fallback dataset is created.
- Acquisition checkpoints every reviewed trial and resumes from the exact next teaching step; leaving during an unanswered trial restarts only that trial. Adaptive Warmup also checkpoints every reviewed item and resumes its stable materialized queue at the exact next unanswered position. Each module uses revision-aware atomic cloud commits and its own on-device recovery journal. Malformed cloud Warmup records are quarantined individually without discarding unrelated valid history. Test Review answers remain provisional and are discarded if the review is abandoned, producing no Test Review score.
- A context sentence is used only when it comes from an approved `word.sentence` source. Sentence Frames, example writing, and unrelated slide prose are never inferred as target-word context.
- Google Slides OAuth and importer credentials remain in trusted backend or Node-only code and are never exposed to the browser.

For local parser testing:

```bash
npm run import:slides -- path/to/presentation.json
```

To hydrate a local state snapshot from a trusted, read-only presentation JSON payload, use:

```bash
npm run hydrate:local -- path/to/presentation.json [--state=path/to/app-state.json]
```

This command validates the JSON shape, routes the payload through `hydrateLocalState` and the canonical importer, and prints the hydrated state to stdout. It does not modify the Slides deck, local files, or Firestore.

A trusted Node-only environment can fetch the configured deck with read-only Google OAuth and route the response through that same hydration path:

```bash
npm run hydrate:slides -- [--state=path/to/app-state.json] [--deck-id=PRESENTATION_ID]
```

Export `GOOGLE_SLIDES_PRESENTATION_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` in the invoking shell. The command prints the import summary and hydrated state to stdout. It has no Firestore dependency, does not write a local state file, and is not imported by the browser application.

The registered Kindergarten workbook can be inspected from a trusted Node-only environment through Google Sheets read requests:

```bash
npm run inspect:kindergarten
```

This command uses the same OAuth variables, defaults to the registered Kindergarten spreadsheet ID, prints canonical vocabulary candidates and any blocked empty tabs with their date/vocabulary mapping, and has no application-state or Firestore write path.

The command is idempotent when existing dataset IDs are supplied, imports every valid weekly slide as its own dataset, preserves multi-character Tier 1 terms, splits only the separators used by the deck, preserves available Mandarin context, distinguishes writing-workshop markers from extraction errors, and rejects incomplete slides without replacing a valid dataset. Before an authorized write, it reads the stored fingerprint references so changed same-week content is treated as a conflict rather than an ID-only duplicate. The command is dry-run by default:

```bash
npm run import:slides -- path/to/google-slides-presentation.json
```

The automated production boundary is scaffolded in [`docs/backend-import.md`](./docs/backend-import.md). It uses Cloud Run plus Cloud Scheduler, administrator-authorized read-only Google Slides OAuth, and a separate Cloud Run service-account credential for guarded Firestore writes. It is not deployed or invoked by this repository change.

After reviewing the printed dataset IDs, slide IDs, date ranges, and word counts, a trusted local environment may write validated Grade 2 data with `--write --confirm-write`, using `FIREBASE_PROJECT_ID` and `FIRESTORE_ACCESS_TOKEN`. The importer refuses writes without both variables, never creates or stores service-account keys, and refuses the inactive Grade 5 profile on the write path. Browser code does not expose shared dataset or import-log writers; the explicit trusted backend path is implemented in `backend/importJob.ts` and `backend/firestore.ts`.

The deck was inspected read-only through the approved Google Drive/Slides connection; the deck itself was not modified. No production Google API credentials are stored in this repository.

## Current limitations

- Firebase project values and Firestore rule deployment are still required.
- The importer service, local import command, and guarded Cloud Run importer are available, but no Cloud Run service or Monday Cloud Scheduler job is deployed. Automatic Monday imports are not live until the documented credentials, IAM, and deployment steps are completed.
- The current Grade 2 dashboard presents overlapping Acquisition and Test Review datasets as separate activities. Each offers its own adaptive Warmup, which Grade 2 may complete or skip during development before the primary activity. Other grades use an explicit profile-controlled requirement and must not inherit Grade 2's optional setting.
- The Progress screen renders one Adaptive Warmup line-graph point per visit with at least one assessed item, including attempted/correct counts and partial/completed status. Preserved monthly Mastery Rotation totals from the earlier Warmup system appear separately as **Earlier Mastery history**; they are never converted into invented visit points or dates. New monthly Mastery Rotation accuracy remains a derived report from individual attempts and their original source bucket.
- The source deck contains no explicit writing-workshop marker in the six inspected slides. Ambiguous/incomplete slides are recorded as import errors; they are not silently classified as workshops.
- An explicitly classified writing-workshop dataset is stored with zero vocabulary targets but does not replace or advance the current Acquisition and Test Review assignments. A future writing-workshop remediation activity may draw from repeatedly incorrect Mastered words only after its rules are explicitly approved.
- Standalone Adaptive Warmup remains independently available even when Acquisition or Test Review is present. In-progress visits resume exactly; an explicit exit after an answer finalizes one partial visit and graph point. If no eligible mastery vocabulary exists, the app never fabricates words.
- Grade 2 is the only active source configuration. Its Tier 2 placeholders now open the shared Acquisition, Test Review, and mastery reading runner. Grade 5 and Kindergarten use that runner only in their development labs because their sources remain inactive. Reading recordings are prompt-local and ephemeral, reading results are session-only, and no reading attempt, score, adaptive state, or audio is written to local or cloud persistence yet. Integrated reading Test Review still uses temporary prompt-by-prompt comparison; the Grade 2 Test Review prototype contains the approved collect-all, one-page final-review behavior but is not connected to production yet. Grades 1, 3, and 4 remain supported by the grade model without source configuration.
- Audio remains the existing browser speech-synthesis fallback. Cached Google Cloud TTS generation remains a later backend task.
- Acquisition uses the explicitly approved Familiar DT pool (`一` through `十`, `大`, `小`, `上`, `下`, `人`, `水`) plus completed current-week targets that become Earned DTs. Familiar and Earned DT responses are stored in a separate DT history, show/copy responses are not stored, and hidden weekly-target plus Earned DT responses contribute to the Acquisition visit score. Familiar DT responses remain excluded from that score.

## From local development to production

The intended production flow is **Google Slides/Sheets → trusted read-only importer → canonical validation → server-authorized Firestore write → authenticated child app**. The child-facing browser never reads Google documents directly and cannot write shared curriculum records. The Monday importer is a synchronization check, not a clock-based reset: without a newly accepted source event, the existing lifecycle assignments remain available.

The checksum-verified browser backup and isolated restore page are temporary migration safeguards for progress that currently lives in local browser storage. They are not the permanent backend and are not intended as a weekly parent task. Before production, one reviewed migration will copy each child's valid local Acquisition, Warmup, graph, and preserved legacy history into child-owned Firestore records; a second-device verification and rollback window must pass before the original backup or compatibility readers are retired.

Production activation remains grade-specific. Grade 2 Tier 1 writing is the first pilot because its versioned Acquisition and Adaptive Warmup persistence paths are complete in code. Shared lifecycle, session, score, and cloud contracts now retain explicit Test Review cycle identity, with legacy single-review records normalized to cycle 1. Grade 5 remains blocked on its production practice and per-cycle provisional Test Review persistence gates. Kindergarten remains blocked on future unit/source decisions and its own production activation. Tier 2 reading is currently session-only for every grade and requires a separate durable persistence boundary. The complete ordered cutover is recorded in `PROJECT_PLAN.md` under **Production operating model and cutover roadmap**.

## Adaptive Warmup architecture status

The current Warmup selection and transition algorithm has been mechanically extracted into `src/warmup/`, with `src/domain.ts` retaining compatibility exports. That extraction intentionally preserves today's runtime behavior and stored state; it does not make the legacy category names, shortage order, or repeated-word filling the approved future design.

The approved next model separates curriculum occurrences, mastery eligibility, child evidence, scheduling buckets, and visit progress. Repeated weekly occurrences will link to one long-term mastery term within the same activity module, vocabulary tier, and language; writing and reading remain separate skills. The approved scheduling buckets are Recent Entry, Needs Attention, and Mastery Rotation. Ordinary Warmups will use unique terms, prioritize shortage filling from Needs Attention, then Recent Entry, then Mastery Rotation, and complete with a shorter queue when the eligible pool is small.

The pure model is now activated through the modular application boundary in `src/application/warmup/` and the versioned visit boundary in `src/warmup/visits/`. The outer application state remains version 2 during the migration window, while new Warmup collections use explicit versioned contracts. Every answer creates one deterministic transition that advances the visit and mastery state and creates its immutable attempt, receipt, and graph-point update atomically. The legacy compatibility reader remains temporarily available; cleanup waits for real-data backup, restore, telemetry, and migration-window gates.

## Checks

```bash
npm test
npm run build
```
