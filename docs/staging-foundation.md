# Staging foundation

Status: repository guardrails implemented; cloud project provisioning pending authenticated owner approval.

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

The deployment wrapper always builds first and targets the validated project explicitly. It deploys only Firebase Hosting and Firestore rules; it never uses `--force` and cannot target a project whose ID lacks a staging marker.

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

Recommended initial values, pending owner confirmation:

| Setting | Recommended value | Status |
| --- | --- | --- |
| Display name | Weekly Dictation Staging | Pending |
| Project ID | `weekly-dictation-staging` if globally available | Pending |
| Firestore location | `nam5` US multi-region | Pending irreversible choice |
| Data class | Synthetic production-shaped fixtures only | Approved by roadmap |
| Hosting source | `dist` from `npm run build:staging` | Implemented |

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

A Cloud Billing budget is an alert, not a spending cap. No paid service may be enabled merely to satisfy this checklist without explicit owner approval.

## Retention and deletion

B1 retains synthetic staging accounts and documents for no more than 30 days after their last rehearsal. The operational owner deletes expired synthetic users and their family trees, then records the deletion date. Automated Firestore TTL is deferred until the persisted schema has an approved expiration field and B2 verifies that TTL cannot remove continuation-critical records.

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

References: [Firebase CLI environments](https://firebase.google.com/docs/cli#project_aliases), [Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config), [App Check enforcement](https://firebase.google.com/docs/app-check/enable-enforcement), and [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets).
