# Staging foundation

Status: Program B1 complete. The isolated cloud foundation is provisioned, deployed, and verified with synthetic cross-browser lifecycle evidence.

Program B1 creates a Firebase environment that is operationally separate from any production project. It begins with synthetic, production-shaped data only. No real child profile, email address, recording, source credential, refresh token, or copied production document is permitted during B1.

## Environment contract

The staging application must satisfy every gate below before it builds:

- `VITE_DEPLOYMENT_ENV=staging`;
- `VITE_STAGING_SYNTHETIC_ONLY=true`;
- a Firebase project ID containing the explicit `staging` or `stg` environment marker;
- a matching `<project-id>.firebaseapp.com` authentication domain;
- a registered Firebase web app ID;
- a reCAPTCHA Enterprise site key registered with Firebase App Check;
- `VITE_STAGING_OBSERVABILITY=true`.

Copy `.env.staging.example` to the ignored `.env.staging.local` file and add only the Firebase web configuration. Never put OAuth refresh tokens, service-account JSON, private keys, importer tokens, or real child data in a Vite environment file.

`npm run build:staging` validates this contract before generating `dist`. A live deployment also requires the exact project ID to be repeated at the command line:

```sh
npm run deploy:staging -- --confirm-project <staging-project-id>
```

The deployment wrapper always builds first and targets the validated project explicitly. It deploys only Firebase Hosting, Firestore rules, and the checked-in Authentication provider configuration; it never uses `--force` and cannot target a project whose ID lacks a staging marker.

## Provisioning sequence

Provisioning must use the Firebase-owning Google account and record the selected IDs in this document before the first deploy.

1. Create a dedicated project with an explicit staging identity.
2. Create the default Firestore database in the approved location. Firestore location is effectively permanent, so the owner must approve it before this command runs.
3. Enable delete protection. Point-in-time recovery remains a B2 decision because it can require billing.
4. Register one web application and copy its public web configuration to `.env.staging.local`.
5. Enable Email/Password Authentication for synthetic test accounts only.
6. Create a dedicated Hosting site if the project default site is not used.
7. Register the staging web app with reCAPTCHA Enterprise App Check.
8. Deploy Hosting and Firestore rules, then exercise only synthetic fixtures.

Confirmed initial values (provisioned 2026-10-02):

| Setting | Value | Status |
| --- | --- | --- |
| Display name | Weekly Dictation Staging | Active |
| Project ID | `weekly-dictation-staging` | Active; project number `868493008635` |
| Web app | Weekly Dictation Staging Web | Active; app ID `1:868493008635:web:8bc63d91bda495ac6ada5e` |
| Hosting site | `weekly-dictation-staging` | Active; `https://weekly-dictation-staging.web.app` |
| Firestore location | `nam5` US multi-region | Created; native mode; deletion protection enabled; PITR disabled |
| Authentication | Email/Password | Enabled; password required |
| App Check | reCAPTCHA Enterprise | Registered; one-hour token TTL; enforcement remains disabled for monitoring |
| Data class | Synthetic production-shaped fixtures only | Approved by roadmap |
| Hosting source | `dist` from `npm run build:staging` | Implemented |

The reCAPTCHA Enterprise key is restricted to `weekly-dictation-staging.web.app`, `weekly-dictation-staging.firebaseapp.com`, and `localhost`. Its public site key and the Firebase public web configuration live only in the ignored `.env.staging.local` file on the provisioning workstation.

## App Check rollout

The staging client initializes reCAPTCHA Enterprise App Check lazily and attaches `X-Firebase-AppCheck` to Firebase Authentication and Firestore REST requests. Begin with enforcement disabled and inspect App Check metrics for legitimate staging traffic. Enable enforcement only after the synthetic sign-up, sign-in, hydration, practice, recovery, and cross-browser paths consistently send valid tokens.

An absent or mismatched App Check configuration makes the staging build fail closed. App Check is defense in depth; Firestore Security Rules and authenticated family ownership remain authoritative.

## Observability and budgets

Staging enables Firebase Performance Monitoring through a lazy chunk, preserving the initial application budget. Existing Firestore query measures remain available under the `weekly-dictation:firestore-query:` prefix.

Before B1 closes, record screenshots or exported configuration showing:

- valid versus invalid App Check request metrics;
- Hosting release identity and the deployed Git commit;
- Firestore request/error and document read/write trends;
- Firebase Authentication sign-in failures;
- a billing budget and alerts if billing is attached, or written confirmation that the project remains on the no-billing plan;
- named operational owner and notification destination.

A Cloud Billing budget is an alert, not a spending cap. The project remains on the no-billing plan for B1, so no billing budget is attached. No paid service may be enabled merely to satisfy this checklist without explicit owner approval. Operational notifications go to the authenticated project owner recorded in the private operations system.

## Retention and deletion

B1 retains synthetic staging accounts and documents for no more than 30 days after their last rehearsal. The operational owner deletes expired synthetic users and their family trees, then records the deletion date. Automated Firestore TTL is deferred until the persisted schema has an approved expiration field and B2 verifies that TTL cannot remove continuation-critical records.

The initial operational and retention owner is recorded in the private operations system; the first deletion review is due 2026-11-01. All four temporary lifecycle-smoke Auth users and their exact Firestore family trees were deleted on 2026-10-02. A post-deletion Auth export reported zero users. The three shared Grade 2 synthetic curriculum fixtures remain so B2 can rehearse backup and restore; they contain no account or child data.

Real child data is prohibited. Any proposal to copy real data requires separate authorization, data minimization, an access list, a deletion deadline, and a rehearsed deletion verification procedure.

## Verification and rollback

Run these gates before and after the first staging deploy:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:staging
npm run deploy:staging:dry-run
```

Verify synthetic sign-up/sign-in, one child profile, Grade 2 start/answer/exit/retry/completion, a reload, and a second browser profile. Confirm no prototype route is linked from the staging application.

To roll back Hosting, select the previous known-good release in Firebase Hosting release history or rebuild and deploy the previous verified Git commit. Roll back Firestore rules by deploying `firestore.rules` from the previous verified commit. Do not delete the staging project as a routine rollback.

## B1 closeout evidence

B1 is not complete until all of the following are recorded here:

- project ID, numeric project number, web app ID, Hosting site, and Firestore location;
- authenticated owner and operational owner;
- first successful Hosting and Firestore-rules deployment URLs;
- App Check registration and monitoring evidence;
- budget/no-billing decision and notification path;
- retention owner and first deletion-review date;
- successful synthetic smoke results and rollback evidence.

Closeout evidence recorded 2026-10-02:

- authenticated Firebase owner recorded in the private operations system;
- project, web app, Hosting site, Firestore location, deletion protection, Authentication provider, and App Check registration verified through authenticated admin APIs;
- App Check service enforcement is intentionally unset during the monitoring period;
- the no-billing plan remains in effect and operational notifications route to the project owner;
- live application: `https://weekly-dictation-staging.web.app`, deployed from commit `29e0f972f7ec` with Hosting release message `staging-29e0f972f7ec`;
- `npm run deploy:staging:dry-run` and the live deploy passed with the real staging configuration, including the staging build, deterministic bundle budgets, Firestore rules compilation, Hosting target, and Auth target;
- 508 unit tests, 38 browser tests, 8 Firestore Emulator tests, typecheck, lint, formatting, and production/staging builds passed before the final deploy;
- the live synthetic lifecycle created a Grade 2 profile, started Acquisition, answered, exited, resumed the exact persisted successor transition, completed a scored target, reloaded immediately, and verified `Acquisition · 1/1 correct` in a second browser;
- all 104 observed Authentication and Firestore requests carried `X-Firebase-AppCheck`; no page errors, failed HTTP responses, or unexpected console errors occurred. Headless Chromium emitted three known third-party reCAPTCHA `requestStorageAccess` warnings while valid tokens continued to issue;
- the integrated application source contains no links to the frozen prototype routes;
- Hosting release history contains three finalized releases for `e09704016f0c`, `93dd109a80cd`, and `29e0f972f7ec`. The immediately previous known-good version is `8a9b07d1e4520fc1` (`staging-93dd109a80cd`), so the Hosting console can roll the live channel back without rebuilding. A full rollback drill remains B2 scope;
- all four temporary smoke accounts and their family data were removed after verification, and the post-cleanup Auth inventory is empty.

References: [Firebase CLI environments](https://firebase.google.com/docs/cli#project_aliases), [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config), [App Check enforcement](https://firebase.google.com/docs/app-check/enable-enforcement), and [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets).
