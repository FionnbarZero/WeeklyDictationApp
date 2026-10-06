# Family beta release manifest template

Copy this template for every family-beta promotion. Keep it free of child names, credentials, recordings, response content, handwriting images, and unnecessary screenshots. The owner's October 5 standing approval authorizes tested ordinary beta updates; this template records verification, not another required approval request. Data resets and production authentication/security changes remain separately restricted.

## Release status

- Manifest state: `draft | verified | promoted | accepted | rolled-back`
- Release authority: October 5 standing approval, or specific approval for work outside that scope
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
| Physical-device observations or explicit unverified limits | |
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

For persistence-affecting changes in any grade, verify backup coverage and lossless restore for every affected legacy and family storage contract. Keep backups private. All three family apps retain completed scores and reports locally; do not mark Kindergarten or Grade 5 session-only by default. For compatible changes with no storage effect, record that rationale rather than requiring an unrelated data migration.

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
- Retained rollback channel and URL:
- Rollback channel expiration: `none` required for a retained target
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
