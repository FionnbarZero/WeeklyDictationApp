# Family beta live release — October 5, 2026

All three grade apps now serve the reviewed family application on their permanent links. The owner explicitly requested updating all three so beta testing could begin. This authorized the grade deployments; it did not authorize resetting child data, changing production authentication/security, or merging the default branch.

## Permanent links

| App | Permanent link | Published version |
| --- | --- | --- |
| Kindergarten | [Open Kindergarten](https://weeklydictation-k-beta.web.app/) | Firebase `08c2e412a3095227` |
| Grade 2 | [Open Grade 2](https://fionnbarzero.github.io/WeeklyDictationApp/) | Pages commit `0b499f86676dcffe4a62fcf4173a8a32402d039a` |
| Grade 5 | [Open Grade 5](https://weeklydictation-g5-beta.web.app/) | Firebase `424b6a63322ed355` |

Each root opens `family-beta-preview.html` with its correct grade. Despite the existing “Review build” label, these are the permanent live beta sites, not expiring review channels. All show build `f4ef04f`. Use these links on other computers; old review links and local addresses are not the stable entry points. No Meghan Games homepage or custom-domain routing was changed.

## Exact artifact and delivery

The application source is `f4ef04f1e9898a21553ade00db425bcd8d897bc0`, accepted in the [Grade 5 review](./grade5-review-2026-10-05.md). The same all-grade assets were reused without rebuilding application JavaScript.

- Grade 5 cloned the reviewed Hosting channel directly to live.
- Kindergarten reused that archive with a Kindergarten manifest and root redirect.
- Grade 2 reused the archive with a Grade 2 manifest, `.nojekyll`, and a top-level `index.html` redirect to the family wrapper. Embedded activity loading retains `index.html` and does not redirect recursively. The deployment is a normal fast-forward of `gh-pages`, retaining its previous release as the parent.

Kindergarten and Grade 5 file-tree SHA-256: `2c9718efaf7088e4e1f96731b5a76d01b16f73487b271b86dd8c67fa55a122c6`.

Grade 2 file-tree SHA-256: `a1a6937cf7740a72150fedd0575d495c09da2109ce742066f884def44d27a006`.

Archive: `family-beta-artifacts/grade5-review-f4ef04f1e989.tar.gz`; SHA-256 `1013dcbe39f8d6fd41d124c65ccf2b0f57fd3b00c8936caaeeebc831779c3fe7`. Packaging and Pages publishing are recorded in `scripts/package-live-family.ts` and `scripts/publish-reviewed-grade2.ts`.

## Live verification

All three permanent sites returned the expected manifest, source revision, and grade. Every declared live file was downloaded and checksum-verified: Kindergarten 121, Grade 2 122, Grade 5 121; zero mismatches.

Fresh disposable browser contexts verified each site's root redirect, correct child/grade selection, loaded curriculum, multiple practice weeks, visible build label, completed Memory Lanterns score surviving reload, saved problem report surviving reload, and the end-of-session batch dialog. All three passed with zero page errors. Reporting was visible in both the hub and game. Test scores and reports existed only in disposable browser storage; no real child's data was accessed or reset.

The exact reviewed application had already passed 625 unit tests and 39 hosted acceptance checks, including Boss scoring, audio/recording lifecycle, past-week selection, reporting across screens, report batching, cancellation, and error recovery. New release scripts passed lint and formatting checks. Grade 2 also passed a local subpath launch/recorded-audio check before publication.

Browser checks use synthetic speech/microphone input where needed; they do not prove sound quality on a physical child's device. Real-device beta testing remains necessary. The report button is available for capturing those issues.

## Curriculum, reporting, and persistence

Automatic read-only Google curriculum refresh is connected through the previously approved curriculum service. Teacher document changes do not require rebuilding the apps. Validation failures preserve the last validated curriculum; already-loaded activities are not changed mid-session.

“Report a problem” remains available throughout the reviewed screens. Reports save locally and can be shared together using “Finish session & email reports.” The user must complete the device's email/share flow; the app does not silently send email or delete reports after an attempted share.

This remains the approved one-device beta: completed scores and reports persist in that browser but do not sync across devices. Preview and live origins have separate storage. Clearing site data can delete local progress/reports; do not use that as an update remedy. Recordings remain session-only. Production child data, authentication, and security rules were not changed.

## Rollback and source control

Kindergarten's previous live version `323704ccbb5edfc8` is retained in the verified non-expiring channel `rollback-reviewed-323704ccbb5e`. Grade 5's previous live version `fb4ad193e58ccf28` is retained in the verified non-expiring channel `rollback-reviewed-ff52db8d6a99`. A separately approved rollback can clone the relevant channel to live.

Grade 2's prior deployment `65c862aec5a78beed2221bca2d034e2c5582a151` is the new deployment's parent. Roll back by publishing that retained tree as a new fast-forward deployment, not by force-pushing or resetting branch history.

The attempted default-branch merge/push was blocked before execution because the earlier restriction against merging main remained in effect. Main was not merged or pushed. Source remains on `codex/family-beta-reconciliation`; deployment approval alone was not treated as permission to override that restriction. This does not prevent using the three verified live apps.
