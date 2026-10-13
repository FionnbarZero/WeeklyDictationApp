# Controlled family beta operations

This plan protects the three grade-level applications currently used by one child per grade while allowing small updates and bug fixes. The family beta is closed, adult-supervised, and separate from both the synthetic staging environment and a public production release.

The objective is to deliver tested fixes promptly to permanent live links while preserving data and rollback. Under the owner's October 5 standing approval, ordinary grade updates do not require another preview or deployment approval question. [ADR 0009](./decisions/0009-activity-reliability-and-staged-delivery.md) is the latest reliability/delivery policy; ADR 0008 remains authoritative where not superseded. The canonical origin is `ninjadojo.meghangames.com`; older origin-specific instructions below apply to legacy recovery, not new canonical publication.

## E1 canonical release path

The owner confirmed **GPT-6.1 Sol · High** for E1 on October 13. Independent **GPT-6 Astra · High** review and focused repair re-review passed at `fe4627b`; the original wrong-target P2 is resolved with no additional actionable defect confirmed. The local tools have not been used to upload, activate, retire hosting or change family records. PR/remote checks and real hosting-operation acceptance remain separate, as does target-specific retirement approval. The verified live application is still D2 `937a51e`; see the [release inventory](./family-beta-release-inventory.md). No additional owner smoke test is requested for this tooling-only slice.

There is one supported family-app hosting target: Cloudflare Worker `meghangames-ninjadojo`, account `4c11957e0121dba35fe2f16be80526f8`, canonical HTTPS origin `ninjadojo.meghangames.com`. All three grades share its package. Firebase database/authentication, Google curriculum services, staging and the parent homepage are separate dependencies, not alternate app-release targets.

1. Package committed reviewed source with `npm run package:canonical-family`. This is the existing family-sync packager; it does not publish. Keep its exact candidate, manifest, full source revision and file-tree hash. Run the applicable source/package/browser/backend gates and required independent review; never rebuild after acceptance.
2. Prepare and test the guarded predecessor with `scripts/prepare-family-offline-rollback.ts`, preserving the original predecessor package. Record original and guarded hashes separately. A raw old Worker version is not safe containment for newer saved records.
3. Copy `deployment/canonical-family-release.example.json` into a private local release-evidence directory outside the asset packages. Its placeholders and empty grade approvals intentionally fail validation. Fill it only from actual reviewed package identities, current provider readback, human authority and completed evidence. Paths resolve relative to the record. The four evidence references use `path#sha256=HEX`; the operator must inspect their contents and applicability, not merely supply any file with a valid hash. Hash validation protects evidence identity; it cannot establish that tests or approval really happened.
4. Run `npm run release:family -- plan --record /absolute/path/release.json`. `upload`, `activate`, `rollback` and `reconcile` also default to this offline dry-run without `--execute`; they never contact a provider by default. The target, pinned Wrangler version, candidate/recovery hashes, prior version and shared-grade scope are explicit. A matching source revision and hash must appear in every grade approval and evidence receipt.
5. After separate authority for the operation, the same command supports `upload` then `activate` with `--execute`, a separate `--journal /absolute/path/journal.json`, and exact repeated `--confirm-revision`, `--confirm-tree` and `--confirm-active` identities. Upload retains guarded recovery first and the exact candidate second, both inactive. Activation selects the candidate once at 100%. There is no build, trigger/domain/DNS, security/authentication, database, migration, site deletion or generic provider-URL option. A host-wide local lock prevents two local tool invocations from racing, and every provider mutation is preceded by a durable journal entry. Provider state is rechecked between steps; independent remote operators still must be coordinated because the provider offers no transaction across these CLI calls.
6. Verify the exact canonical manifest and every public file, then perform relevant real-backend/runtime acceptance. The read-only shortcut is `npm run verify:family-release -- /absolute/path/candidate FULL_SOURCE_REVISION TREE_SHA256`. The command checks only the canonical origin, not obsolete aliases. A hosting/hash receipt alone does not prove saving, teaching correctness, publication propagation at every location, physical sound or touch. Prompt the owner only after a coherent reviewed live milestone with exact build/links and a bounded feature checklist.
7. Explicitly authorized `rollback` selects only this record's uploaded guarded recovery and verifies its manifest/public hashes. It does not restore cloud data. Uncertain upload/activation outcomes are never blindly retried. Inspect provider versions and the journal. If activation or guarded rollback already applied, `reconcile` reads back the exact bound provider version and live bytes, then confirms only the local journal without another deployment. A candidate that activated but failed asset verification can still be contained by an explicitly authorized guarded rollback. Uncertain uploads without a captured version ID require manual provider inspection and reviewed receipt repair; the tool does not guess a version or delete a journal/lock to continue.

The provider subprocess receives ordinary process settings and an explicit allowlist of supported authentication credentials, with the canonical account forced and CLI telemetry disabled. Inherited `WRANGLER_*`, `CLOUDFLARE_*` and `CF_*` routing/build/debug overrides are removed rather than trusted; these include the CI Worker-name override and alternate API endpoints. Normal stored OAuth login remains supported. No credential values are logged. The pinned Wrangler may retry an identical inactive version-upload POST internally up to three times, potentially leaving duplicate inactive versions; this is not a guarantee of one HTTP request. The controller invokes each upload once and journals it first, never repeats an uncertain CLI outcome, and never automatically retries traffic activation. Provider readback identifies the captured version by source/tree annotation; uncertain outcomes require inspection rather than choosing an arbitrary duplicate.

The six former alias publishers/packagers at their old `scripts/` paths now stop immediately, before imports, credentials, packaging or remote commands. Their full implementations and the old four-origin verifier are retained under `archive/deployment/*.ts.disabled`, with execution-stop guards as well as Git history. Old npm publication aliases were removed. Shared hash/packaging helpers, staging/importer/curriculum tools, prototype reference packagers and their tests remain available; they must not be confused with current family publication. The manual reference-artifact workflow is explicitly labelled **not live releases** and performs no hosting writes.

Hosting retirement is not complete. See [E1 dependency and retirement inventory](./family-beta-release-inventory.md#e1-dependency-and-retirement-inventory). Do not disable a Firebase project, Firestore database, account, auth domain, storage bucket or curriculum service as a shortcut to removing an obsolete static app copy. Older site-local reports and unsynced progress do not automatically cross origins.

### E1 local verification

The initial `ac72e60` slice passed **968 unit tests**, including **38 new canonical release/controller/CLI checks**; typecheck, lint, standard formatting and the explicit release-tool gate passed. Build/performance remained **546,027/550,000 initial JavaScript bytes** and **42,745/60,000 CSS bytes**. Production dependencies had zero vulnerabilities; the existing 11-finding firebase-tools-only exception still expires November 4. No dependency was added. Tests cover exact artifact/recovery checks, missing/mismatched approvals and evidence, extra files and symlinks, unexpected shared bindings, changed hosting/runtime, guarded entry scripts, pre-mutation journals, no blind retry, uncertain activation/rollback reconciliation, explicit containment after failed asset verification, canonical-only byte verification and disabled legacy executables. Default dry-runs succeed with an empty executable PATH, proving they do not require Git/Wrangler/provider calls. The next section records the review finding and repaired candidate; these original passes did not resolve that finding.

A historical D2 receipt exercises the actual retained 155-file candidate and 149-file guarded recovery through the new offline plan; it is labelled historical and is not authority for E1 publication. The new read-only live verifier matches D2's exact canonical manifest and all 153 public assets. Firebase site/channel/legacy-domain/custom-domain reads are retained with the inventory. No upload, activation, rollback, security/authentication change, account/test-family creation, child-data write, hosting retirement or Git push/merge was performed by E1. Application source, production rules and runtime teaching behavior are unchanged; full grade-browser/emulator matrices were not rerun for this tooling-only slice, and earlier D2 runs are not relabelled as new E1 runs.

Evidence is retained locally under ignored `family-beta-artifacts/reviews/e1-release-path/`, including the reproducible historical record, read-only hosting inventory driver, gate logs and metadata receipts. The first typecheck caught two newly imported script files missing from the TypeScript project inventory; that inventory was repaired and the final typecheck passed. At this initial checkpoint the owner had authorized the separate read-only review recorded next. Do not call E1 complete until its review and remaining external retirement gates are resolved.

### E1 independent review and environment repair

Independent **GPT-6 Astra · High** review of local `ac72e60` found one actionable P2: the CLI inherited a provider CI setting that can override the upload Worker name even while deployment/version reads still target the configured canonical Worker. The reviewer reproduced it with actual pinned Wrangler 4.147.0 `versions upload --dry-run`; no provider write occurred. Independent verification passed all 38 release tests plus 10 retained delivery tests and both original E1 package inventories. Those checks did not resolve the transport override.

The bounded E1 repair now routes every provider command through `canonicalProviderEnvironment`: supported modern/legacy auth credentials are retained, routing/build/debug overrides are removed, the canonical account is forced, and telemetry stays disabled. A new always-on regression checks CI-name/API-base/environment/compliance/debug and unknown future overrides without logging credentials. A separate actual pinned-provider dry-run reproduces the wrong-name override before filtering and confirms it absent after filtering. Its first diagnostic harness read only stdout and missed the warning on stderr; the corrected driver checks both streams and passes. That harness correction did not modify the application or package.

The review also confirmed Wrangler may internally attempt an identical inactive-upload POST three times; it did not establish an activation retry or data-loss defect. The guarantee is now explicitly one outer CLI invocation per phase, not one HTTP request. Uncertain outcomes still leave the pre-mutation journal and require inspection/reconciliation; the tool never blindly reinvokes the failed command. Focused independent re-review of the repair was requested before any provider write.

Fresh repaired-source verification passes **969 units**, including **39 canonical release cases**, typecheck, release-tool checks and the unchanged build/performance gates. No dependency, application, production-rule, family-data or live-hosting change is included. The pinned-provider dry-run and updated receipts are retained with the earlier failed/initial evidence, not substituted for a real hosting rehearsal or a new owner smoke test.

**Focused independent re-review passed at `fe4627b5d21cbd2c52d0d776b6a1091d64dbc9c3`.** The separate Astra · High reviewer independently reran all 39 release cases and the actual pinned-provider dry-run, checked that every provider command uses the sanitized environment, and verified all six supported auth variables plus normal home/XDG stored-OAuth discovery. No real credentials were inspected or authentication requests made. The P2 is resolved; no additional actionable defect was confirmed. Fresh root lint/format and both dependency gates also pass. This clears the code-review blocker, not PR/CI, publication or hosting-retirement authority. Next: **GPT-6.1 Sol · High** for separately authorized push/PR/remote checks; no application smoke test or app publication is needed merely to ship repository-only tooling. Actual provider-operation acceptance belongs to a separately authorized release, and retirement remains target-specific.

## Beta boundaries

### E1 pull request handoff — October 13, 2026

The owner authorized pushing `codex/e1-release-path-cleanup` and opening [PR #67](https://github.com/FionnbarZero/WeeklyDictationApp/pull/67) against `main`. GitHub reports no base conflict. Initial run `38407063437` queued five quality jobs on `a949db2`; the documentation successor also requires all five final-head jobs to pass. The GitHub connector lacked PR-write permission, so the existing signed-in GitHub browser created the PR; no access permission was expanded. The PR is attached to this chat. No merge, auto-merge, hosting operation, retirement, security/authentication or family-record change occurred. Next: **GPT-6.1 Sol · High** for final-head checks, then separately approved merge. No additional owner UI smoke test is needed for this tooling-only change; actual provider-operation acceptance and retirement gates remain separate.

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
| Grade 2 | Shared canonical family origin; GitHub Pages is an obsolete copy | Preserve legacy and family records, verify migration coverage before changes to storage, guarded rollback |
| Grade 5 | Live writing/reading family beta with parent-owned syncing; first priority for bug fixes | Confirmed-save status, no retained audio, grade-owned acquisition rules, storage compatibility, rollback |

## Stable and preview deployments

Each grade must have one documented stable beta destination. A stable destination points only to an explicitly promoted release and does not automatically follow `main`, a development branch, or an unreviewed local build.

Use a temporary preview when required to verify a hosted change, but do not require the owner to approve it again. Publish the exact tested artifact or Hosting version under standing approval; do not rebuild between acceptance and promotion. Verify the permanent live link afterward. The owner's ordinary beta testing happens on that live link.

Every stable deployment retains a tested, guarded predecessor. The canonical grades share one package, so activation or rollback affects all three grades and must be reported as such; do not claim grade-isolated promotion.

Current canonical release verified October 13: all three use D2 merge `937a51e47df995a49ba3c46d6930dcc6234fd5ec`, Worker version `42f8137a-de79-452c-83e5-8e1633c48268`. Safe containment is guarded D1 version `279e9451-4f60-470e-8f54-8c5109e696a2`, not the unguarded original D1 version. See [D2 publication acceptance](./stroke-order-slay-acquisition.md#publication-and-live-acceptance). Older aliases remain separate; their live manifest identities and retirement boundaries are recorded in the [inventory](./family-beta-release-inventory.md).

| Grade | Stable destination | Live source | Current operational gap |
| --- | --- | --- | --- |
| Kindergarten | `https://ninjadojo.meghangames.com/?grade=kindergarten` | Shared family source | iMac/iPad activity testing continues |
| Grade 2 | `https://ninjadojo.meghangames.com/?grade=grade2` | Shared family source | Historical identity mapping and migration remain separate |
| Grade 5 | `https://ninjadojo.meghangames.com/?grade=grade5` | Shared family source | First priority for remaining daily-learning/Boss fixes |

## Release identity and manifest

The verified current snapshot is recorded in the [family beta release inventory](./family-beta-release-inventory.md) and [D2 live release record](./stroke-order-slay-acquisition.md#publication-and-live-acceptance). Use a release manifest for each promotion. All three maintained grades share the canonical Cloudflare origin. Dedicated Kindergarten/Grade 5 Firebase sites and Grade 2 Pages are older aliases, not supported publication targets.

The older artifact/delivery history is retained in [independent family beta delivery](./independent-family-beta-delivery.md), but its publishers are archived and disabled locally by E1. Do not restore or run them as an additional release step. Use the E1 canonical path above only after its review gate is resolved.

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
