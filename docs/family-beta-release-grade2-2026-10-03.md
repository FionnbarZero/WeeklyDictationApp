# Grade 2 family beta safety release — 2026-10-03

## Release status

- Manifest state: `draft`; no preview or child-facing deployment performed
- Affected grade: Grade 2
- Release owner: authenticated repository owner
- Observation owner: product owner
- Rehearsed candidate revision: `8355522bdc82bb50e11855108ee8edd9d26e6c39`
- Final promotion revision: pending merge of the delivery controls; the exact final revision must be repackaged and restore-rehearsed

## Release identity

| Field | Recorded value |
| --- | --- |
| Stable destination | `https://fionnbarzero.github.io/WeeklyDictationApp/` — unchanged origin |
| Preview destination | Pending candidate channel on preview-only site `weeklydictation-g2-preview` |
| Rehearsed source revision | `8355522bdc82bb50e11855108ee8edd9d26e6c39` |
| Built artifact | Pending clean Grade 2 package from the final reviewed revision |
| Application version | `0.2.0-stage2` |
| Curriculum identity | Active Grade 2 family-beta source; private backup references validated; public artifact fingerprint pending |
| Stored contracts | Application state v2; Acquisition pending journal v1; Adaptive Warmup pending journal v1; local restore journal v1; verified backup v1 |
| Persistence status | Tier 1 writing browser-local durable; Tier 2 reading session only |

## Change scope

- Promote the already merged release identity and Grade 2 selected-profile backup/restore safety controls.
- Package only the Grade 2 root application for the stable Pages artifact.
- Keep the GitHub Pages origin unchanged so existing `localStorage` remains available.
- Use Firebase Hosting only for adult preview with synthetic or isolated disposable state.
- Retire the obsolete Kindergarten and Grade 5 files from the legacy Pages artifact only after their independent bookmarks are confirmed.
- No curriculum, activity behavior, Firebase data path, persistence schema, or Tier 2 durability change is authorized by this manifest.

## Verification

| Gate | Result and evidence |
| --- | --- |
| Restore regression | Passed on merged revision `8355522`; valid Familiar DTs accepted and mismatched Familiar/Earned DTs rejected |
| Typecheck, lint, format, unit, build, browser, and performance | Passed for rehearsed revision; final promotion revision must pass again |
| Unit tests | 546 passed on rehearsed revision |
| Browser tests | 44 passed on rehearsed revision |
| Restore rehearsal | Passed at `2026-10-04T01:53:12.341Z`; all privacy-safe evidence checks true |
| Candidate packaging and checksum | Pending final clean revision |
| Temporary preview | Pending |
| Adult activity acceptance | Pending |
| Unrelated activity launch and exit | Pending |

## Data protection

- Data location: existing browser profile under origin `https://fionnbarzero.github.io`
- Backup required: yes
- Retained private backup filename: `weekly-dictation-grade2-verified-backup-merged-8355522.json`
- Backup created: `2026-10-04T01:53:07.696Z`
- Backup SHA-256: `1b4156bb3cfe3a76cbfa58163028da14ef77aaa5a0ae90a979d61d031f1e15f2`
- Privacy-safe evidence: `grade2-restore-rehearsal-evidence-merged-8355522.json`
- Preview restore: passed with zero writes
- Lossless selected-profile restore: passed in an isolated same-origin browser context
- Unrelated profiles: preserved
- Interrupted write, duplicate replay, injected rollback, and unexpected newer storage: passed
- Live browser storage: not written during rehearsal
- Audio retention: reading audio remains prompt-local and session-only
- Privacy review: filenames, checksum, revision, origin, version, timestamps, and boolean checks only; no backup content or profile identifier is recorded here

## Promotion and observation

- Exact reviewed artifact promoted: no
- Preview approval: pending
- Non-identifying canary label: `grade2-family-beta`
- Launch, exit, resume, completion, persistence, console, page-error, and failed-request checks: pending
- Observation window: pending
- Acceptance decision: not authorized

## Rollback

- Retained pre-release deployment: `8fffebee35a91fc31ba37a8d4dd1141517aaf023`
- Effective source revision: `a6df41db07331fd0c8dde190dbf80b10650184df`
- Procedure: create a new fast-forward `gh-pages` deployment commit from the retained deployment tree; never force-push
- Data restore required: only if compatibility review or observed progress requires it
- Restore authority: the latest checksum-verified private pre-release or pre-rollback backup
- Stop conditions: missing or duplicated progress, wrong profile, failed resume, lifecycle corruption, privacy exposure, or retained audio
- Rollback dry run and adult decision rehearsal: pending

## Closeout

- Final status: draft
- Required next evidence: merge delivery controls, package the exact clean revision, re-run the private restore rehearsal, deploy the preview, complete adult acceptance, dry-run promotion and rollback, then explicitly approve or reject promotion
