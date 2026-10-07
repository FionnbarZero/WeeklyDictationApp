# Controlled family beta operations

This plan protects the three grade-level applications currently used by one child per grade while allowing small updates and bug fixes. The family beta is closed, adult-supervised, and separate from both the synthetic staging environment and a public production release.

The objective is to deliver tested fixes promptly to permanent live links while preserving data and rollback. Under the owner's October 5 standing approval, ordinary grade updates do not require another preview or deployment approval question. [ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md) is the latest reliability/delivery policy; ADR 0008 remains authoritative where not superseded. The canonical origin is `ninjadojo.meghangames.com`; older origin-specific instructions below apply to legacy recovery, not new canonical publication.

## Beta boundaries

- Kindergarten, Grade 2, and Grade 5 each receive a stable grade-specific beta destination.
- Temporary preview deployments are for adult review and synthetic verification, not permanent child URLs.
- Synthetic staging never receives real child data, email addresses, recordings, authentication state, or copied family documents.
- Real beta data stays in its authorized family scope and is minimized to what the active capability requires.
- Microphone audio remains prompt-local and is released when the prompt or visit ends.
- All three apps sync completed scores and saved practice under the parent account. Reports stay local. Ordinary Dojo checkpoint recovery is verified; alternative acquisition games and complete per-game weekly history still require activity-level work.
- Browser-local records in every grade require compatibility and rollback protection; migrations additionally require verified backup and restore coverage.
- Closed beta availability does not mean production eligibility.

## Grade-specific safety posture

| Grade | Current beta posture | Required release protection |
| --- | --- | --- |
| Kindergarten | Live writing/reading family beta with parent-owned syncing | Confirmed-save status, no retained audio, storage compatibility, rollback |
| Grade 2 | Shared family origin plus updated existing GitHub Pages alias | Preserve legacy and family records, verify migration coverage before changes to storage, rollback |
| Grade 5 | Live writing/reading family beta with parent-owned syncing; first priority for bug fixes | Confirmed-save status, no retained audio, grade-owned acquisition rules, storage compatibility, rollback |

## Stable and preview deployments

Each grade must have one documented stable beta destination. A stable destination points only to an explicitly promoted release and does not automatically follow `main`, a development branch, or an unreviewed local build.

Use a temporary preview when required to verify a hosted change, but do not require the owner to approve it again. Publish the exact tested artifact or Hosting version under standing approval; do not rebuild between acceptance and promotion. Verify the permanent live link afterward. The owner's ordinary beta testing happens on that live link.

Every stable deployment retains at least one previous known-good Hosting release or Git deployment tree. A rollback changes only the affected grade unless a shared backend or schema defect requires broader containment.

Current canonical release verified October 7, 2026: all three use merge `490fe4129ec492fa8ede5450250e2a35394a72b5`, Worker version `f3b0766b-52ab-4591-a2be-1cb690ee394d`. The safe containment target is guarded version `1f36538a-04ab-4fa1-a03e-5e11f0a48422`, not the unguarded A3.1 provider version. See [A3.2 release acceptance and rollback](./a32-release-2026-10-07.md). Older aliases remain on October 5 source `ef9d1f75df7046152c4829e8f7cfca635f303461`; the [inventory](./family-beta-release-inventory.md) distinguishes those copies from the canonical release.

| Grade | Stable destination | Live source | Current operational gap |
| --- | --- | --- | --- |
| Kindergarten | `https://ninjadojo.meghangames.com/?grade=kindergarten` | Shared family source | iMac/iPad activity testing continues |
| Grade 2 | `https://ninjadojo.meghangames.com/?grade=grade2` | Shared family source | Historical identity mapping and migration remain separate |
| Grade 5 | `https://ninjadojo.meghangames.com/?grade=grade5` | Shared family source | First priority for remaining daily-learning/Boss fixes |

## Release identity and manifest

The verified current snapshot is recorded in the [family beta release inventory](./family-beta-release-inventory.md) and [A3.2 live release record](./a32-release-2026-10-07.md). Use a release manifest for each promotion. All three maintained grades now share the canonical Cloudflare origin. Dedicated Kindergarten/Grade 5 Firebase sites and Grade 2 Pages are older aliases, not the supported publication targets.

The older repository-side artifact, preview, exact-promotion, and rollback controls are preserved in [independent family beta delivery](./independent-family-beta-delivery.md). Those Firebase/Pages procedures apply only to legacy targets. Current canonical publication uses the family-sync packager and existing Cloudflare Worker configuration, as recorded in the current release report; do not run a legacy deployment as an additional canonical release step.

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
| Verification | Applicable automated, hosted, and physical-device results, plus any unverified limits; standing owner approval covers routine publication |
| Backup | Backup identity and checksum for persistence-affecting changes, or a documented no-storage-change rationale |
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
7. Confirm the fix follows the approved behavior contract and unrelated activities still open and exit correctly. Do not insert another routine adult approval pause.
8. For a persistence-affecting change in any grade, verify backup coverage and rehearse a lossless restore/migration. Data resets and production security/authentication changes still need separate authority.
9. Promote the exact tested artifact to the affected grade's permanent beta destination under standing approval; verify its live identity and affected path.
10. Use one child as the canary only for that child's grade. Confirm launch, exit, resume, completion, and persistence promises appropriate to the activity.
11. Observe the release and either record acceptance or roll back. Do not continue exposing a release while investigating a critical or high-severity data defect.

## Legacy Grade 2 backup and restore evidence

This section documents the earlier application-state tools and rehearsal. It does not prove backup coverage for the October 5 family wrapper's additional ledger, report, or mastery keys. Inspect and extend coverage before any migration; do not repeat a legacy migration exercise as a prerequisite to an unrelated compatible UI fix.

Merged Grade 2 source includes a parent-facing **Protect progress** control. **Download backup** exports application state version 2 together with the Acquisition and Warmup recovery journals inside a `weekly-dictation-verified-backup-v1` envelope. The envelope carries a SHA-256 checksum over canonical payload content. Export fails closed if either journal is malformed.

**Preview restore** verifies the checksum, current origin, selected profile, application schema, recovery journals, and deep record relationships without writing any browser key. It reports the selected profile's before/after counts while preserving current shared curriculum, unrelated profiles, and newer unrelated records.

**Apply selected-profile restore** requires explicit confirmation and first downloads an automatic pre-restore backup. It writes application state and both recovery journals through one restore journal, verifies every write, rolls back a failed transaction, replays a known partial transaction at startup, and fails closed without overwriting unexpected newer storage. Exact replay is idempotent.

The disposable rehearsal against the real family-browser capture passed on merged revision `8355522bdc82bb50e11855108ee8edd9d26e6c39` at `2026-10-04T01:53:12.341Z`. It covered zero-write preview, wrong-profile rejection, selected-profile merge, unrelated-profile preservation, automatic safety backup, reload, duplicate replay, interrupted-write recovery, injected rollback, and unexpected-newer-storage rejection. No live browser storage was written. The verified private backup remains outside the repository; only its privacy-safe checksum and result belong in a release manifest.

For recovery of legacy Grade 2 state, the origin-bound, download-only capture and isolated candidate procedure in [Grade 2 local restore rehearsal](./grade2-local-restore-rehearsal.md) remains reference material. It does not write the live browser profile or send captured state over the network. Do not assume the family wrapper exposes every legacy control.

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
- Keep both owner-approved writing/reading acquisition alternatives available without experimental labels. Contain unsupported or unsafe individual capabilities with a clear explanation; visibility is not evidence of correctness or durability.

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
- critical and high-severity containment and rollback have been rehearsed and recorded;
- bug intake avoids child-identifying response content;
- persistence labels distinguish confirmed online results/practice, pending device writes, local reports, and activities without exact resume; and
- synthetic staging remains free of real child data.

## Work after C0

Activity corrections proceed Grade 5 first against the owner-approved behavior contract and standing release approval. Program B2 historical migration and full rollback rehearsal remain later work. The separately authorized family syncing release is live; its approval does not authorize resetting or silently reassigning historical records.
