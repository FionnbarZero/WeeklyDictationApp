# Family beta release manifest template

Copy this template for every proposed family-beta promotion. Keep the manifest free of child names, credentials, recordings, response content, handwriting images, and unnecessary screenshots. A draft manifest does not authorize deployment.

## Release status

- Manifest state: `draft | adult-approved | promoted | accepted | rolled-back`
- Affected grade: `Kindergarten | Grade 2 | Grade 5`
- Release owner:
- Observation owner:
- Proposed promotion time:
- Actual promotion time:

## Release identity

| Field | Required value |
| --- | --- |
| Stable destination | Exact grade-specific URL or Hosting channel |
| Preview destination | Exact temporary review URL |
| Source revision | Full Git commit |
| Built artifact | Immutable artifact, Hosting version, or deployment commit |
| Application version | Displayed version |
| Curriculum identity | Source profile, school year, fixture or dataset identity, and fingerprint/checksum |
| Stored contracts | Every state, journal, receipt, and schema version read or written |
| Persistence status | `browser-local durable`, `cloud durable`, or `session only` |

## Change scope

- Reported problem:
- Expected behavior:
- Approved behavior contract:
- Activities changed:
- Activities explicitly unchanged:
- Persistence or schema effect:
- Shared modules affected:
- Known limitations retained:

## Verification

| Gate | Result and evidence |
| --- | --- |
| Synthetic reproduction | |
| Regression test | |
| Typecheck | |
| Lint and format | |
| Unit tests | |
| Production or preview build | |
| Browser tests and clean console | |
| Firestore Emulator, when applicable | |
| Bundle and request budgets, when applicable | |
| Adult preview review | |
| Unrelated activity launch and exit checks | |

## Data protection

- Data location:
- Backup required: `yes | no`
- Backup schema and identity:
- Backup SHA-256:
- Preview-restore result:
- Lossless-restore result, when required:
- Audio-retention check:
- Privacy review:

For Grade 2, a persistence-affecting promotion cannot proceed without a checksum-verified whole-local-practice-state backup and a successful selected-profile, non-writing preview restore. The backup contains records for every profile stored in that browser and must remain private family data; apply restores only the selected profile. For Kindergarten and Grade 5, record `not applicable — session only` only after confirming that no progress, answer, score, or audio is retained.

## Promotion and observation

- Exact reviewed artifact promoted:
- Non-identifying canary label:
- Launch check:
- Exit check:
- Resume check or `not applicable — session only`:
- Completion check:
- Persistence check:
- Observation window:
- Console, page-error, and failed-request result:
- Acceptance decision:

## Rollback

- Previous known-good artifact or Hosting version:
- Grade-specific rollback procedure:
- Data restore required: `yes | no`
- Restore procedure and backup identity:
- Stop conditions reviewed:
- Rollback rehearsal result:
- Rollback performed, if applicable:
- Post-rollback verification:

## Closeout

- Final status:
- Defects found:
- Follow-up issue or branch:
- Documentation updated:
- Adult acceptance recorded without child-identifying content:
