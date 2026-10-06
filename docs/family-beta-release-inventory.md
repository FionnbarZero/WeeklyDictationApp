# Family beta release inventory

Verified October 5, 2026. This inventory describes the current live family wrapper, not the historical standalone prototypes.

## Current stable destinations

All three use application source `f4ef04f1e9898a21553ade00db425bcd8d897bc0`, automatic read-only Google curriculum refresh, and browser-local completed scores and problem reports.

| Grade | Permanent link | Live artifact | Previous release retained |
| --- | --- | --- | --- |
| Kindergarten | [Open Kindergarten](https://weeklydictation-k-beta.web.app/) | Firebase `08c2e412a3095227` | Non-expiring `rollback-reviewed-323704ccbb5e`, version `323704ccbb5edfc8` |
| Grade 2 | [Open Grade 2](https://fionnbarzero.github.io/WeeklyDictationApp/) | Pages commit `0b499f86676dcffe4a62fcf4173a8a32402d039a` | Parent deployment `65c862aec5a78beed2221bca2d034e2c5582a151` |
| Grade 5 | [Open Grade 5](https://weeklydictation-g5-beta.web.app/) | Firebase `424b6a63322ed355` | Non-expiring `rollback-reviewed-ff52db8d6a99`, version `fb4ad193e58ccf28` |

The roots open the correct grade in `family-beta-preview.html`. The family build still displays “Review build f4ef04f,” but these are permanent live links. All declared files were checksum-verified and fresh-browser score/report reload checks passed. Complete hashes, verification limits, and publication details are in the [live release record](./family-beta-live-2026-10-05.md).

## Persistence and update boundaries

- Completed writing, reading, and supported game results are stored in the same browser and origin. Reports are also local and are shared as an end-of-session batch.
- No cross-device synchronization is promised. Preview scores do not transfer automatically to live. Never clear browser data to resolve an old-version complaint.
- Legacy Grade 2 state and recovery keys are separate from the family ledger and activity namespaces. The October 5 release did not reset or migrate real child data. Do not assume legacy restore tools cover every new record.
- Recordings remain temporary comparison data, with no uploads or retained audio.
- Dojo, Boss, and Spirit Realm behavior and unfinished-session persistence still need activity-level acceptance; a saved aggregate score is not proof of exact resume.
- Ordinary tested updates have standing owner approval. Data resets, production authentication/security changes, and unreviewed migrations remain separately restricted.
- Root links may be added to the existing homepage without moving the grade apps or changing their storage origins.

## Remaining acceptance work

1. Grade 5 daily-learning/Boss defects and iMac/iPad audio, recording, writing, exit, and return checks.
2. Exact completed-trial acquisition checkpoints for every retained activity, with separate progress for alternative presentations.
3. All game-to-tier rules, generated content validation, and separate per-game weekly history.
4. Pause/preserve behavior while reporting from each game and continued session-end batching.
5. Coverage of new family storage in backup/restore before a persistence migration, plus containment and rollback rehearsal.

These are ongoing beta improvements, not a requirement to repeat completed source authorization or all three initial deployments. Earlier October 3 release reports remain historical evidence, not current release identities.
