# Weekly Dictation

React/Vite prototype for a Mandarin dictation practice app. Stage 2 keeps the existing child-friendly practice flow while adding authenticated parent families, multiple child profiles, Firestore-backed sessions/scores, grade-aware datasets, and a configurable 5th-grade Google Slides importer.

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
- `importLogs/{logId}`: reserved for trusted importer backends; parent clients cannot write shared datasets or logs.

Firestore rules keep one parent restricted to one family, preserve inactive child history, prevent parent edits to shared datasets, and reject sessions for children outside the parent's family.

The repository does not currently include Firebase Emulator configuration. Security rules should be exercised in a Firebase project/emulator setup before production use; the local test suite covers the pure domain and importer logic only.

## Google Slides importer

The configured source is the 5th-grade 2026–27 deck in `src/config.ts`. The deck-specific parser profile is in `src/slidesImporter.ts`; the observed structure and page IDs are documented in [`docs/grade5-deck-structure.md`](./docs/grade5-deck-structure.md).

When a current weekly dataset is missing, incomplete, or intentionally contains no vocabulary targets for a writing-workshop period, the child is offered a warmup-only mastery session whenever eligible older targets exist. This path never invents a primary dataset or primary score; it records warmup results and preserves source-dataset warmup scores.

For local parser testing:

```bash
npm run import:slides -- path/to/presentation.json
```

The command is idempotent when existing dataset IDs are supplied, preserves multi-character Tier 1 terms, splits only the separators used by the deck, preserves available Mandarin context, distinguishes writing-workshop markers from extraction errors, and rejects incomplete slides without replacing a valid dataset. `src/importerService.ts` provides the persistence/logging adapter for a trusted importer environment.

The Google Drive connector was unavailable in the implementation environment because requests required approval while the approval policy was `never`. The deck was inspected read-only through the signed-in Slides browser view; the deck itself was not modified. No production Google API credentials are stored in this repository.

## Current limitations

- Firebase project values and Firestore rule deployment are still required.
- The importer service is reusable and the local import command is available, but no Cloud Run importer or Monday Cloud Scheduler job is deployed. Automatic Monday imports are not live.
- The source deck contains no explicit writing-workshop marker in the six inspected slides. Ambiguous/incomplete slides are recorded as import errors; they are not silently classified as workshops.
- An explicitly classified writing-workshop dataset is stored with zero vocabulary targets and follows Warmup → complete without Acquisition/Test Review or a zero-word score.
- If no current primary dataset is available, the app offers Mastery Warmup from eligible prior targets; if no prior targets exist, it shows a clear setup state instead of fabricating words.
- Only the Grade 5 configuration is active for automatic dataset filtering. Kindergarten through Grade 4 are represented in the grade model for future expansion, not configured as production decks.
- Audio remains the existing browser speech-synthesis fallback. Cached Google Cloud TTS generation remains a later backend task.

## Checks

```bash
npm test
npm run build
```
