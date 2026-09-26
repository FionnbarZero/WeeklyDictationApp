# Weekly Dictation

React/Vite prototype for a Mandarin dictation practice app. Stage 2 keeps the existing child-friendly practice flow while adding authenticated parent families, multiple child profiles, Firestore-backed sessions/scores, grade-aware datasets, and a configurable Grade 2 Google Slides importer.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Firebase variables, the app runs only as a clearly local development/demo mode. Legacy localStorage data is never uploaded to a parent account. Authenticated practice requires Firebase and an active internet connection; official cloud scores are not created when Firestore cannot confirm the write.

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
- `importLogs/{logId}`: reserved for trusted importer backends; parent clients cannot write shared datasets or logs.

Firestore rules keep one parent restricted to one family, preserve inactive child history, prevent parent edits to shared datasets, and reject sessions for children outside the parent's family.

The repository does not currently include Firebase Emulator configuration. Security rules should be exercised in a Firebase project/emulator setup before production use; the local test suite covers the pure domain and importer logic only.

## Google Slides importer

The active source is the 2026–2027 Grade 2 deck in `src/config.ts`: `26-27 G2 Weekly Focus` (`10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4`). The public compatibility API and Grade 2 parser profile remain in `src/slidesImporter.ts`; source extraction now runs through the pure adapter and shared identity/validation layers documented in [`docs/canonical-source-boundary.md`](./docs/canonical-source-boundary.md). The observed Grade 2 structure and page IDs are documented in [`docs/grade2-deck-structure.md`](./docs/grade2-deck-structure.md). Grade 5 remains registered but inactive for new imports.

When a current weekly dataset is missing, incomplete, or intentionally contains no vocabulary targets for a writing-workshop period, the child is offered a warmup-only mastery session whenever eligible older targets exist. This path never invents a primary dataset or primary score; completed Random Rotation answers contribute only to adaptive mastery state and monthly Random Rotation accuracy.

## Practice contract

- Acquisition is the current weekly dataset, and Test Review is the prior weekly dataset during its review week. Both may be active at the same time and must be separately visible and startable.
- Every Acquisition or Test Review session begins with its own required adaptive Warmup.
- Warmup is a practice segment assembled only from canonical archived-dataset words; active Acquisition, active Test Review, future, writing-workshop, and malformed datasets are excluded regardless of persisted adaptive category, and no fallback dataset is created.
- An incomplete session is abandoned without creating results, scores, adaptive-state updates, or a completed-session record. Previously completed progress remains.
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

The command is idempotent when existing dataset IDs are supplied, imports every valid weekly slide as its own dataset, preserves multi-character Tier 1 terms, splits only the separators used by the deck, preserves available Mandarin context, distinguishes writing-workshop markers from extraction errors, and rejects incomplete slides without replacing a valid dataset. The command is dry-run by default:

```bash
npm run import:slides -- path/to/google-slides-presentation.json
```

The automated production boundary is scaffolded in [`docs/backend-import.md`](./docs/backend-import.md). It uses Cloud Run plus Cloud Scheduler, administrator-authorized read-only Google Slides OAuth, and a separate Cloud Run service-account credential for guarded Firestore writes. It is not deployed or invoked by this repository change.

After reviewing the printed dataset IDs, slide IDs, date ranges, and word counts, a trusted local environment may write validated Grade 2 data with `--write --confirm-write`, using `FIREBASE_PROJECT_ID` and `FIRESTORE_ACCESS_TOKEN`. The importer refuses writes without both variables, never creates or stores service-account keys, and refuses the inactive Grade 5 profile on the write path. Browser code does not expose shared dataset or import-log writers; the explicit trusted backend path is implemented in `backend/importJob.ts` and `backend/firestore.ts`.

The deck was inspected read-only through the approved Google Drive/Slides connection; the deck itself was not modified. No production Google API credentials are stored in this repository.

## Current limitations

- Firebase project values and Firestore rule deployment are still required.
- The importer service, local import command, and guarded Cloud Run importer are available, but no Cloud Run service or Monday Cloud Scheduler job is deployed. Automatic Monday imports are not live until the documented credentials, IAM, and deployment steps are completed.
- The dashboard presents overlapping Acquisition and Test Review datasets as separate lifecycle choices, and each choice starts its own required adaptive Warmup before its primary phase.
- Monthly Random Rotation accuracy is calculated and persisted, but its required Progress graph is not rendered yet.
- The source deck contains no explicit writing-workshop marker in the six inspected slides. Ambiguous/incomplete slides are recorded as import errors; they are not silently classified as workshops.
- An explicitly classified writing-workshop dataset is stored with zero vocabulary targets and follows Warmup → complete without Acquisition/Test Review or a zero-word score.
- If no current primary dataset is available, the app offers Mastery Warmup from eligible prior targets; if no prior targets exist, it shows a clear setup state instead of fabricating words.
- Grade 2 is the only active deck configuration. Grade 5 remains registered but inactive and without newly imported datasets; Kindergarten and Grades 1, 3, and 4 remain supported by the grade model without deck configuration.
- Audio remains the existing browser speech-synthesis fallback. Cached Google Cloud TTS generation remains a later backend task.
- Acquisition uses the explicitly approved true-BM pool (`一` through `十`, `大`, `小`, `人`, `水`) plus current-week targets that earn BM status. True-BM and show/copy responses are discarded; hidden-target and earned-BM trials are recorded and scored.

## Checks

```bash
npm test
npm run build
```
