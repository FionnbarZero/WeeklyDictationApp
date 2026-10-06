# Automated Slides importer

The production importer is a protected Cloud Run HTTP service invoked by Cloud Scheduler. The browser never receives Google credentials and never reads Google Slides directly.

## Authorization boundaries

- Google Slides access uses an administrator OAuth refresh token with the read-only `https://www.googleapis.com/auth/presentations.readonly` scope. Store the client ID, client secret, and refresh token in Secret Manager; never put them in `.env.local`, source control, or the browser bundle.
- Firestore access uses the Cloud Run service account's Application Default Credentials. Grant that service account only the permissions needed to update `datasets/*`, `datasets/*/words/*`, `importLogs/*`, and `importRuns/*` through the Firestore API. Do not reuse the administrator's Slides refresh token for Firestore.
- Cloud Run should require authentication. Give Cloud Scheduler's service account `roles/run.invoker` on the service, and configure a Scheduler OIDC token for the `/run` request.

## Runtime configuration

Set these Cloud Run environment variables from Secret Manager or deployment configuration:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
FIREBASE_PROJECT_ID
GOOGLE_SLIDES_PRESENTATION_ID=10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4
IMPORT_AUTH_MODE=cloud-run-iam
IMPORT_WRITE_ENABLED=true
```

Production sets `IMPORT_AUTH_MODE=cloud-run-iam`. The application accepts that mode only when Cloud Run's immutable `K_SERVICE` value is present; Cloud Run IAM rejects unauthenticated traffic before it reaches the process. `IMPORT_RUN_TOKEN` remains an optional constant-time bearer fallback for explicitly controlled local testing and fails closed when neither mechanism is active. Scheduler OIDC and a second `Authorization` bearer token cannot coexist in the same header, so production does not use the fallback token. `IMPORT_WRITE_ENABLED` defaults to false so a misconfigured local or preview service can validate the deck without writing Firestore. `FIRESTORE_ACCESS_TOKEN` is supported only for an explicitly authorized local smoke test; Cloud Run uses its service-account metadata token.

## Scheduler

Invoke `POST /run` every Monday at 3:00 p.m. Pacific time with timezone `America/Los_Angeles`. The job reads every slide, routes the full response through `importWeeklyDatasets`, rejects a source-deck identity mismatch, skips malformed slides, and writes only canonical validated datasets and stable import logs. Each request returns an `X-Request-Id` correlation value. Slides, metadata-token, Firestore-list, and Firestore-commit calls use bounded timeouts.

Every write set has a deterministic `importRuns/*` ledger record. Each chunk atomically advances its committed-document count; failures record a repairable failed state, and replaying the same validated batch uses the same run ID and idempotently completes the remaining work. Browser clients cannot write this collection. The in-process lock rejects overlapping requests in one service instance; Cloud Run IAM and deployment concurrency must still prevent or safely tolerate calls handled by different instances.

## Deployment automation

`npm run deploy:importer` is a no-write plan by default. It is locked to project `weeklydictationapp` and requires exact project and region confirmation:

```sh
npm run deploy:importer -- \
  --project weeklydictationapp \
  --region <approved-region> \
  --confirm-project weeklydictationapp \
  --confirm-region <approved-region>
```

Before adding `--execute`, install and authenticate the Google Cloud CLI, confirm project billing, and create enabled `latest` versions for these Secret Manager secrets without putting their values on a command line or in this repository:

- `weekly-dictation-google-oauth-client-id`;
- `weekly-dictation-google-oauth-client-secret`; and
- `weekly-dictation-google-oauth-refresh-token`.

For a new authorization, create a dedicated **Desktop app** OAuth client in Google Auth Platform, download its JSON, and run the local callback helper. It requests only the read-only Slides scope, verifies access to the exact configured deck, writes all three values directly to Secret Manager, and can remove the downloaded credential file afterward:

```sh
npm run authorize:importer -- \
  --client-file /private/path/to/client.json \
  --gcloud /absolute/path/to/gcloud \
  --delete-client-file
```

Execution enables only the required APIs; creates separate runtime and Scheduler service accounts; creates or updates a custom Firestore role with entity get, list, create, and update but no delete permission; grants each OAuth secret only to the runtime identity; deploys authenticated Cloud Run with internal ingress, concurrency one, maximum one instance, a five-minute timeout, and managed secret references; grants only the Scheduler identity `roles/run.invoker`; and creates or updates the Monday 3:00 p.m. Pacific OIDC job. It refuses a dirty worktree, absent active account, unconfirmed target, disabled billing, missing secret version, or publicly reachable health endpoint.

Firestore IAM permissions are database-wide rather than document-path-scoped. The custom role removes delete and administrative permissions; the importer code remains responsible for restricting writes to canonical `datasets`, `importLogs`, and `importRuns` documents. The deployment script never creates or reads secret values and never triggers an import as part of verification.

## Read-only shadow verification

Before enabling any cloud write, compare the backend's read-only `runImportJob(..., { writeEnabled: false })` result with the local `importWeeklyDatasets` result for the same presentation. Use `normalizeImportBatchForComparison` so volatile `importedAt` values are ignored while canonical dataset IDs, word IDs, source metadata, dates, word content, statuses, and malformed-slide outcomes remain compared. The shadow path must not request a Firestore token, list Firestore datasets, or call the Firestore writer.

For an explicitly invoked local read-only hydration check, `npm run hydrate:slides` uses the Node-only adapter in `backend/readOnlyHydration.ts`. It fetches a `PresentationLike` payload with the read-only Slides credential, passes it through the canonical importer and local hydration operation, and prints the resulting state. It does not expose an HTTP endpoint, enter the browser bundle, request a Firestore token, read Firestore dataset IDs, or write any file or cloud document.
