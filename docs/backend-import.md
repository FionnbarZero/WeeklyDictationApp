# Automated Slides importer

The production importer is a protected Cloud Run HTTP service invoked by Cloud Scheduler. The browser never receives Google credentials and never reads Google Slides directly.

## Authorization boundaries

- Google Slides access uses an administrator OAuth refresh token with the read-only `https://www.googleapis.com/auth/presentations.readonly` scope. Store the client ID, client secret, and refresh token in Secret Manager; never put them in `.env.local`, source control, or the browser bundle.
- Firestore access uses the Cloud Run service account's Application Default Credentials. Grant that service account only the permissions needed to update `datasets/*`, `datasets/*/words/*`, and `importLogs/*` through the Firestore API. Do not reuse the administrator's Slides refresh token for Firestore.
- Cloud Run should require authentication. Give Cloud Scheduler's service account `roles/run.invoker` on the service, and configure a Scheduler OIDC token for the `/run` request.

## Runtime configuration

Set these Cloud Run environment variables from Secret Manager or deployment configuration:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
FIREBASE_PROJECT_ID
GOOGLE_SLIDES_PRESENTATION_ID=10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4
IMPORT_RUN_TOKEN=<Secret Manager reference or runtime secret>
IMPORT_WRITE_ENABLED=true
```

`IMPORT_RUN_TOKEN` is required by the HTTP `/run` endpoint; the service fails closed when it is absent. `IMPORT_WRITE_ENABLED` defaults to false so a misconfigured local or preview service can validate the deck without writing Firestore. `FIRESTORE_ACCESS_TOKEN` is supported only for an explicitly authorized local smoke test; Cloud Run uses its service-account metadata token.

## Scheduler

Invoke `POST /run` every Monday at 3:00 p.m. Pacific time with timezone `America/Los_Angeles`. The job reads every slide, routes the full response through `importWeeklyDatasets`, rejects a source-deck identity mismatch, skips malformed slides, and writes only canonical validated datasets and stable import logs. Repeated runs are idempotent by canonical dataset ID and import-log ID; an unchanged duplicate-only run is acknowledged as a successful no-change request.

This repository contains the service code and contract tests. Deployment, Secret Manager configuration, Cloud Run IAM, and Scheduler creation remain explicit operator actions.

## Read-only shadow verification

Before enabling any cloud write, compare the backend's read-only `runImportJob(..., { writeEnabled: false })` result with the local `importWeeklyDatasets` result for the same presentation. Use `normalizeImportBatchForComparison` so volatile `importedAt` values are ignored while canonical dataset IDs, word IDs, source metadata, dates, word content, statuses, and malformed-slide outcomes remain compared. The shadow path must not request a Firestore token, list Firestore datasets, or call the Firestore writer.

For an explicitly invoked local read-only hydration check, `npm run hydrate:slides` uses the Node-only adapter in `backend/readOnlyHydration.ts`. It fetches a `PresentationLike` payload with the read-only Slides credential, passes it through the canonical importer and local hydration operation, and prints the resulting state. It does not expose an HTTP endpoint, enter the browser bundle, request a Firestore token, read Firestore dataset IDs, or write any file or cloud document.
