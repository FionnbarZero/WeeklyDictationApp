# Kindergarten family beta release — 2026-10-03

## Release status

- Manifest state: `promoted`; final adult acceptance and observation record pending
- Affected grade: Kindergarten
- Release owner: authenticated Firebase project owner
- Observation owner: product owner
- Actual promotion time: `2026-10-03T19:47:10.709Z`

## Release identity

| Field | Recorded value |
| --- | --- |
| Stable destination | `https://weeklydictation-k-beta.web.app` |
| Preview destination | `https://weeklydictation-k-beta--candidate-250d348f5279-kpf11k1z.web.app` |
| Retained rollback destination | `https://weeklydictation-k-beta--rollback-stable-250d348f5279-4kkjswl0.web.app` |
| Source revision | `250d348f52792235ce72b7157b26e7cd0ad7f0bb` |
| Hosting version | `856c70eaec380dc5` |
| Built artifact | `kindergarten-250d348f52792235ce72b7157b26e7cd0ad7f0bb.tar.gz` |
| Artifact SHA-256 | `71d59ef35fa3cb9a2c856973c751ff56ce5f7e64dc5d9724ba44bed89923a5d0` |
| File-tree SHA-256 | `334af15e006a5d15d100d953e905b87c3852b39b5e007e5f623d07eb629dbf57` |
| Application version | `0.2.0-stage2` |
| Curriculum identity | `tests/fixtures/kindergarten-workbook.json`; SHA-256 `08210c5f95bfefe1ccb3e0d57bb2cd0924754074da4b70f7a62e8ad8a21a94c2` |
| Stored contracts | None; visit state is in memory only |
| Persistence status | Session only; prompt-local reading audio |

## Change scope

- Established the first independent Kindergarten stable destination from an immutable reviewed artifact.
- Added visible grade, experimental status, version, revision, and session-only identity.
- Kept the development fixture, activity surface, persistence behavior, source gates, and schemas unchanged.
- Known limitations retained: current activities are not yet independently product-approved; no durable progress; source registry inactive.
- Known release defect: rewritten `/` responses can retain Firebase's one-hour default cache because this artifact predates the root-route `no-store` correction.

## Verification

| Gate | Result and evidence |
| --- | --- |
| Immutable artifact | Passed; clean source, exact revision, per-file checksums, and archive checksum recorded |
| Remote CI | [All four quality, build, browser, and Firestore Emulator jobs passed](https://github.com/FionnbarZero/WeeklyDictationApp/actions/runs/37134555662) for revision `250d348f52792235ce72b7157b26e7cd0ad7f0bb` |
| Preview identity | Candidate and live channels resolve to Hosting version `856c70eaec380dc5` |
| Live identity | Displays Kindergarten, Experimental, `0.2.0-stage2`, full revision, and Session only |
| Rollback identity | Non-expiring `rollback-stable-250d348f5279` serves Hosting version `856c70eaec380dc5` and the full source revision |
| Adult activity acceptance | Not recorded; smoke-test defect inventory is in progress |
| Post-promotion observation | Not recorded |

## Data protection

- Data location: in-memory visit state only
- Backup required: no — session only
- Audio-retention check: automated contracts require prompt-local release; manual live result not recorded
- Privacy review: release summary contains no child name, response, recording, or progress data

## Promotion and rollback

- Exact reviewed artifact promoted: yes; candidate and live reference the same Hosting version
- Launch check: live root returns HTTP 200 and displays the expected identity
- Resume check: not applicable — session only
- Acceptance decision: open pending the defect inventory and activity matrix
- Previous known-good artifact: none predates this initial stable promotion; this release is retained as the baseline for the next promotion
- Retained rollback channel: `rollback-stable-250d348f5279`; no `expireTime`; verified `2026-10-04T00:08:48.719Z`
- Data restore required: no
- Stop conditions: privacy, retained audio, wrong curriculum/lifecycle, or durable-progress claims require containment

## Closeout

- Final status: promoted, not yet accepted
- Required follow-up: finish adult activity acceptance, promote the approved cache-safe/fix artifact through exact-artifact review, and record observation
