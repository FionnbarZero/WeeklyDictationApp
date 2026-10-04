# Controlled family beta operations

This plan protects the three grade-level applications currently used by one child per grade while allowing small updates and bug fixes. The family beta is closed, adult-supervised, and separate from both the synthetic staging environment and a public production release.

The objective is not to freeze development. It is to ensure that every child can remain on a known-good app while a replacement is reproduced, tested, reviewed, promoted, observed, and rolled back independently.

## Beta boundaries

- Kindergarten, Grade 2, and Grade 5 each receive a stable grade-specific beta destination.
- Temporary preview deployments are for adult review and synthetic verification, not permanent child URLs.
- Synthetic staging never receives real child data, email addresses, recordings, authentication state, or copied family documents.
- Real beta data stays in its authorized family scope and is minimized to what the active capability requires.
- Microphone audio remains prompt-local and is released when the prompt or visit ends.
- Kindergarten and Grade 5 remain session-only until separate durable persistence contracts are approved.
- Grade 2 Tier 1 writing is browser-local durable in the current family-beta build and requires backup, restore, migration, retry, and rollback protection.
- Closed beta availability does not mean production eligibility.

## Grade-specific safety posture

| Grade | Current beta posture | Required release protection |
| --- | --- | --- |
| Kindergarten | Session-only development experience | Stable known-good build, visible session-only notice, no retained result or audio, independent rollback |
| Grade 2 | Browser-local durable Tier 1 writing; Tier 2 remains session-only | Browser-state export and restore, schema compatibility, exact retry checks, second-browser verification after migration, independent rollback |
| Grade 5 | Session-only development experience with unresolved product policies | Stable known-good build, visible session-only and experimental notices, no production source activation, independent rollback |

## Stable and preview deployments

Each grade must have one documented stable beta destination. A stable destination points only to an explicitly promoted release and does not automatically follow `main`, a development branch, or an unreviewed local build.

Each proposed update receives a temporary preview deployment. The adult reviewer verifies the affected activity on that preview before promotion. Promotion uses the exact reviewed artifact or Hosting version; it does not create a different rebuild from the same source commit.

Every stable deployment retains at least one previous known-good Hosting release or Git deployment tree. A rollback changes only the affected grade unless a shared backend or schema defect requires broader containment.

Verified on 2026-10-03:

| Grade | Stable destination | Live source | Current operational gap |
| --- | --- | --- | --- |
| Kindergarten | `https://weeklydictation-k-beta.web.app` | `250d348f52792235ce72b7157b26e7cd0ad7f0bb` | Non-expiring `rollback-stable-250d348f5279` verified; adult defect review active; rewritten-root cache fix not yet promoted |
| Grade 2 | `https://fionnbarzero.github.io/WeeklyDictationApp/` | `a6df41db07331fd0c8dde190dbf80b10650184df` through Pages artifact `8fffebee35a91fc31ba37a8d4dd1141517aaf023` | Restore rehearsal passed on merged candidate `8355522`; exact-artifact preview, approval, and promotion remain open |
| Grade 5 | `https://weeklydictation-g5-beta.web.app` | `a55d972ccb6f6db00c81b202d4e5bba16a889025` | Non-expiring `rollback-stable-a55d972ccb6f` verified; detailed adult acceptance and observation record incomplete |

## Release identity and manifest

The verified current snapshot is recorded in the [family beta release inventory](./family-beta-release-inventory.md). Use the [family beta release manifest template](./family-beta-release-manifest-template.md) for every proposed promotion. Kindergarten and Grade 5 now use dedicated Firebase Hosting sites. The legacy GitHub Pages artifact still serves all historical routes, but it remains the stable Grade 2 origin only; it is not the promotion path for the two independent session-only apps.

The repository-side artifact, preview, exact-promotion, and rollback controls are defined in [independent family beta delivery](./independent-family-beta-delivery.md). Kindergarten and Grade 5 use independent Firebase stable sites. Grade 2 uses a Firebase preview-only site and guarded fast-forward deployment commits on its existing GitHub Pages origin.

Every child-facing beta displays a concise identifier containing:

- grade;
- beta status;
- application version;
- abbreviated Git revision; and
- persistence status: `durable` or `session only`.

Every promotion records:

| Field | Required value |
| --- | --- |
| Grade and stable destination | Exact affected beta app and URL |
| Source revision | Full Git commit |
| Hosting release or version | Exact promoted artifact identity |
| Curriculum identity | Source profile, school year, and content fingerprint or fixture version |
| Stored-schema versions | Every schema the release reads or writes |
| Capability changes | Activities enabled, disabled, corrected, or unchanged |
| Verification | Unit, build, browser, Emulator, preview, and adult acceptance results applicable to the change |
| Backup | Required Grade 2 backup identity and checksum, or `not applicable` for a session-only change |
| Canary | Child/grade scope using a non-identifying label, start time, and observed result |
| Rollback target | Previous known-good Hosting release and any data-restore procedure |
| Owner | Person responsible for observation and rollback |

## Safe update workflow

1. Record the affected grade, activity, lifecycle stage, build identity, device/browser, expected behavior, and observed behavior without child-identifying content.
2. Reproduce the defect with synthetic data or a minimized, de-identified state fixture.
3. Add a regression test that fails for the observed defect.
4. Implement one narrowly scoped fix. Keep behavior changes separate from refactors and dependency upgrades.
5. Run the relevant unit, typecheck, lint, format, build, browser, performance, and Firestore Emulator gates.
6. Deploy the exact candidate to a temporary preview destination.
7. Obtain adult approval of the affected activity and confirm that unrelated activities still open and exit correctly.
8. For a Grade 2 persistence-affecting change, create and verify the whole-local-state backup, then confirm the selected-profile restore plan before promotion.
9. Promote the exact reviewed artifact to the affected grade's stable beta destination.
10. Use one child as the canary only for that child's grade. Confirm launch, exit, resume, completion, and persistence promises appropriate to the activity.
11. Observe the release and either record acceptance or roll back. Do not continue exposing a release while investigating a critical or high-severity data defect.

## Grade 2 backup and restore

Merged Grade 2 source includes a parent-facing **Protect progress** control. **Download backup** exports application state version 2 together with the Acquisition and Warmup recovery journals inside a `weekly-dictation-verified-backup-v1` envelope. The envelope carries a SHA-256 checksum over canonical payload content. Export fails closed if either journal is malformed.

**Preview restore** verifies the checksum, current origin, selected profile, application schema, recovery journals, and deep record relationships without writing any browser key. It reports the selected profile's before/after counts while preserving current shared curriculum, unrelated profiles, and newer unrelated records.

**Apply selected-profile restore** requires explicit confirmation and first downloads an automatic pre-restore backup. It writes application state and both recovery journals through one restore journal, verifies every write, rolls back a failed transaction, replays a known partial transaction at startup, and fails closed without overwriting unexpected newer storage. Exact replay is idempotent.

The disposable rehearsal against the real family-browser capture passed on merged revision `8355522bdc82bb50e11855108ee8edd9d26e6c39` at `2026-10-04T01:53:12.341Z`. It covered zero-write preview, wrong-profile rejection, selected-profile merge, unrelated-profile preservation, automatic safety backup, reload, duplicate replay, interrupted-write recovery, injected rollback, and unexpected-newer-storage rejection. No live browser storage was written. The verified private backup remains outside the repository; only its privacy-safe checksum and result belong in a release manifest.

The current live Grade 2 artifact does not expose these controls yet. For the first safety release only, use the origin-bound, download-only capture and isolated candidate procedure in [Grade 2 local restore rehearsal](./grade2-local-restore-rehearsal.md). It does not write the live browser profile or send the captured state over the network.

For each pre-release backup:

1. Open the exact Grade 2 child-facing origin and select **Protect progress** outside an active activity.
2. Download the verified JSON file and keep it in private family-controlled storage.
3. Select that same file under **Preview restore** and require a verified result.
4. Record the filename, complete SHA-256 value, creation time, application version, and preview result in the release manifest. Do not attach the backup itself to a bug report.
5. Run the [Grade 2 local restore rehearsal](./grade2-local-restore-rehearsal.md) against an isolated same-origin copy and verify the before/after report, automatic pre-restore backup, exact replay, startup recovery, failure rollback, and unexpected-newer-storage guard. Never use the only live child profile as the first apply target.
6. Do not clear site data, change browser profiles, or promote a persistence-affecting build until the backup and rehearsal evidence have been independently retained.

Before any Grade 2 change that can affect persistence, create a verified whole-local-practice-state backup. It deliberately contains records for every profile stored in that browser so recovery evidence is not discarded, while preview and apply are bound to the recorded origin and selected profile. Treat the file as private family data. It contains:

- export format and schema version;
- application and Git revision;
- origin and selected-profile scope identifiers without adding unnecessary identifying information;
- datasets and lifecycle identities referenced by the child state;
- Acquisition progress and transition receipts;
- Warmup visits, queue entries, attempts, mastery state, graph points, rotations, and receipts;
- sessions, attempts, results, and scores;
- export timestamp; and
- deterministic checksum.

Restore first runs in preview mode. It validates scope, schema, referential integrity, transition identities, duplicate protection, and checksum without writing. Apply must remain idempotent, preserve current shared curriculum and unrelated profiles, and produce a comparison report. Rehearsal must cover wrong-profile input, interrupted writes, duplicate restore, malformed journals, unexpected newer storage, and rollback.

The backup origin must match the active origin. Do not weaken this check to move Grade 2 to another domain. The Grade 2 stable release stays at `https://fionnbarzero.github.io/WeeklyDictationApp/`; its Firebase destination is preview-only and may use only synthetic or isolated disposable state.

The beta cannot rely on Firestore managed export/import while the project remains on the no-billing plan. Enabling billing, scheduled backups, or point-in-time recovery requires a separate cost and operations decision.

## Compatibility rules

- Stored identifiers are never renamed or regenerated during an ordinary beta update.
- Schema changes are additive until migration, rollback, and compatibility readers are verified.
- A new writer must not make the previous known-good reader unsafe without an explicit migration window and rollback plan.
- Journal-before-state, revision checks, immutable receipts, exact retry, and idempotent recovery remain mandatory.
- An activity cannot change lifecycle stage, scoring, persistence, or Warmup policy as an incidental UI fix.
- Unresolved capabilities remain hidden or explicitly experimental; a visible interface is not evidence of durability or production eligibility.

## Privacy-safe bug reports

A beta bug report includes:

- grade and activity;
- displayed build identifier;
- lifecycle stage and non-identifying cohort/date label;
- device and browser;
- reproduction steps;
- expected and observed behavior;
- whether any durable progress appeared missing or duplicated; and
- an application error reference when available.

Do not include full child names, credentials, authorization codes, recordings, spoken responses, handwritten response images, or screenshots containing unnecessary identifying information.

## Severity and containment

| Severity | Examples | Required response |
| --- | --- | --- |
| Critical | Cross-family access, wrong-child data, retained audio, credential exposure, destructive migration | Stop the affected app, preserve evidence, revoke access where needed, and roll back immediately |
| High | Lost or duplicated durable progress, wrong lifecycle cohort, wrong Test Review cycle, unsafe resume or retry | Roll back the affected grade and restore only through the verified procedure |
| Medium | Activity blocked, incorrect teaching sequence, wrong label or content without data corruption | Disable or contain the activity and issue a focused tested fix |
| Low | Cosmetic defect or non-blocking wording issue | Schedule for the next beta release while retaining the known-good path |

## C0 completion criteria

C0 is complete when:

- each grade has a stable documented beta destination and known-good release;
- each app displays build and persistence status;
- preview and exact-artifact promotion are documented and rehearsed;
- Grade 2 whole-local-state export, checksum, scope-aware preview, and selected-child lossless restore pass;
- every promotion has a release manifest and rollback target;
- the adult reviewer has rehearsed critical and high-severity rollback decisions;
- bug intake avoids child-identifying response content;
- session-only apps do not imply that progress is retained; and
- synthetic staging remains free of real child data.

## Work after C0

After C0, activity corrections proceed one grade at a time against an adult-approved behavior contract. Program B2 synthetic migration and full rollback rehearsal can then resume without requiring the three children to leave their stable beta releases.
