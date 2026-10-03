# Family beta release-foundation manifest — 2026-10-03

This is a rehearsal manifest for the C0 release-safety candidate. It is not deployment approval.

## Release status

- Manifest state: `draft`
- Affected grades: Kindergarten, Grade 2, and Grade 5
- Stable destination: existing shared GitHub Pages origin; unchanged by this work
- Preview destination: local production and public-preview builds only
- Source revision: pending final commit; the build fails closed unless it can embed a 7- to 40-character hexadecimal Git revision
- Application version: `0.2.0-stage2`
- Persistence status: Grade 2 Tier 1 writing is browser-local durable; Grade 2 Tier 2 reading, Kindergarten, and Grade 5 are session only

## Change scope

- Add visible grade, beta status, application version, Git revision, and persistence identity to all three entries.
- Add a privacy-safe problem-report summary containing only those release fields.
- Make production and preview builds fail when neither Git checkout metadata nor `VITE_GIT_REVISION` supplies a valid revision.
- Correct the Grade 2 export contract to say that it contains the whole local practice state, including records for every locally stored profile.
- Require checksum-verified preview files to match the current browser origin and selected Grade 2 profile context.
- Keep restore application unavailable; no storage schema is written or migrated by this candidate.

## Verification record

| Gate | Result |
| --- | --- |
| Build identity contract | Unit-tested explicit revision, repository fallback, invalid override, and fail-closed behavior |
| Release identity | Browser coverage for all three entries; production output inspected for full embedded revision |
| Backup preview | Unit coverage for checksum, wrong origin, wrong profile, malformed journal, and zero-write preview |
| Typecheck, lint, and format | Passed locally |
| Unit tests | 521 passed |
| Browser tests | 44 passed; two intentional release-banner visual references updated and inspected |
| Public-preview tests | Build passed; 3 Grade 5 preview tests passed |
| Firestore Emulator | 8 passed |
| Production build | Passed with the full Git revision embedded in all three child-facing entries |
| Performance | Passed at 549,431 / 550,000 initial Grade 2 JavaScript bytes and 41,176 / 60,000 CSS bytes |
| Frozen artifact extraction | Passed for `8fffebee35a91fc31ba37a8d4dd1141517aaf023` and `a4dc97f4ba5b09b4a7d23847740014f3a9d90956` |
| Offline route launch | All three routes from both artifacts returned HTTP 200 with no browser console, page, or failed-request errors |
| Adult preview review | Pending |
| Exact-artifact promotion | Not performed |

## Data protection

- Backup required before a Grade 2 promotion: yes
- Candidate backup data scope: whole local practice state plus Acquisition and Warmup recovery journals
- Candidate context checks: exact origin and selected Grade 2 profile
- Current family-browser backup SHA-256: pending adult-controlled export
- Non-writing preview restore: pending against the real family-browser export
- Lossless restore: unavailable and still required before C0 closes
- Privacy: backup files remain private and are excluded from routine bug reports

## Rollback

- Frozen live baseline: `8fffebee35a91fc31ba37a8d4dd1141517aaf023`
- Recoverable predecessor: `a4dc97f4ba5b09b4a7d23847740014f3a9d90956`
- Offline rehearsal: passed; see [rollback evidence](./family-beta-rollback-rehearsal-2026-10-03.md)
- Grade-specific rollback: unavailable while all grades share `gh-pages`
- Live rollback: not performed

## Open promotion gates

- Establish independent stable grade destinations and exact-artifact promotion.
- Export and preview the real Grade 2 family-browser backup.
- Implement and prove lossless, crash-safe, idempotent Grade 2 restore before relying on origin-changing delivery.
- Complete adult activity acceptance for each grade.
- Assign the final source revision and immutable built artifact to this manifest after commit and preview build.
