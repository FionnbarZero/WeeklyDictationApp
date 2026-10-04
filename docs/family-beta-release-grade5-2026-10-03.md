# Grade 5 family beta release — 2026-10-03

## Release status

- Manifest state: `promoted`; final adult acceptance and observation record pending
- Affected grade: Grade 5
- Release owner: authenticated Firebase project owner
- Observation owner: product owner
- Actual promotion time: `2026-10-03T22:53:37.183Z`

## Release identity

| Field | Recorded value |
| --- | --- |
| Stable destination | `https://weeklydictation-g5-beta.web.app` |
| Preview destination | `https://weeklydictation-g5-beta--candidate-a55d972ccb6f-exovn6v0.web.app` |
| Retained rollback destination | `https://weeklydictation-g5-beta--rollback-stable-a55d972ccb6f-1qadbkg1.web.app` |
| Source revision | `a55d972ccb6f6db00c81b202d4e5bba16a889025` |
| Hosting version | `d9bf9c316262a8a8` |
| Built artifact | `grade5-a55d972ccb6f6db00c81b202d4e5bba16a889025.tar.gz` |
| Artifact SHA-256 | `37d0c7fd366ea59a530f5ad29682b8bc6d8cf592273d2f00e33b5d7a04dbacdb` |
| File-tree SHA-256 | `7314325b78c29055abc5575894e64374697752897ceaa462b774eeed8fab9502` |
| Application version | `0.2.0-stage2` |
| Curriculum identity | `tests/fixtures/grade5-presentation.json`; SHA-256 `78e8c614814cf34bf711e596ae5cfaaa7799d7d353416f6c1775d3f09648844f` |
| Stored contracts | None; visit state is in memory only |
| Persistence status | Session only; prompt-local reading audio |

## Change scope

- Established an independent Grade 5 stable destination from an immutable reviewed artifact.
- Corrected rewritten-root caching so application-shell responses use `Cache-Control: no-store` while fingerprinted assets remain immutable.
- Preserved visible grade, experimental status, version, revision, and session-only identity.
- Kept curriculum, activity behavior, persistence, source activation, and schemas unchanged.
- Known limitations retained: development fixture; source registry inactive; Warmup policy and durable two-review-cycle persistence unresolved.

## Verification

| Gate | Result and evidence |
| --- | --- |
| Immutable artifact | Passed; clean source, exact revision, per-file checksums, and archive checksum recorded |
| Remote CI | [All four quality, build, browser, and Firestore Emulator jobs passed](https://github.com/FionnbarZero/WeeklyDictationApp/actions/runs/37159399005) for revision `a55d972ccb6f6db00c81b202d4e5bba16a889025` |
| Preview identity | Candidate and live channels resolve to Hosting version `d9bf9c316262a8a8` |
| Live identity | Displays Grade 5, Experimental, `0.2.0-stage2`, full revision, and Session only |
| Rollback identity | Non-expiring `rollback-stable-a55d972ccb6f` serves Hosting version `d9bf9c316262a8a8` and the full source revision |
| Cache check | Live root returns `Cache-Control: no-store`; fingerprinted assets retain immutable caching |
| Adult activity acceptance | Detailed matrix not recorded in the repository |
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
- Acceptance decision: open pending the recorded activity matrix and observation window
- Previous known-good artifact: none predates this initial stable promotion; this release is retained as the baseline for the next promotion
- Retained rollback channel: `rollback-stable-a55d972ccb6f`; no `expireTime`; verified `2026-10-04T00:09:04.313Z`
- Data restore required: no
- Stop conditions: privacy, retained audio, wrong review cycle/lifecycle, or durable-progress claims require containment

## Closeout

- Final status: promoted, not yet accepted
- Required follow-up: complete the adult activity matrix and observation record
