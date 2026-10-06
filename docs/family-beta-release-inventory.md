# Family beta release inventory

Verified October 5, 2026. This inventory describes the current live family wrapper, not the historical standalone prototypes.

## Current stable destinations

All three use application source `ef9d1f75df7046152c4829e8f7cfca635f303461`, automatic read-only Google curriculum refresh, parent-owned online scores/practice, and local batched problem reports. The [Meghan Games homepage](https://meghangames.com/) supplies the three canonical grade links on `ninjadojo.meghangames.com`. Cloudflare version `8d6c4b13-a23e-44ad-bbd4-9dcf79aadd64` replaces `a525a8e6-943c-49eb-adc0-1e6eac029ff5`. The existing grade origins below remain updated aliases that preserve their device records.

| Grade | Permanent link | Live artifact | Previous release retained |
| --- | --- | --- | --- |
| Kindergarten | [Existing Kindergarten address](https://weeklydictation-k-beta.web.app/) | Firebase `1cdad369b59f20cd` | `rollback-before-family-sync`, version `08c2e412a3095227` |
| Grade 2 | [Existing Grade 2 address](https://fionnbarzero.github.io/WeeklyDictationApp/) | Pages commit `7a3278ca26725702dbc7ce4204b0d1318db17e74` | Parent deployment `0b499f86676dcffe4a62fcf4173a8a32402d039a` |
| Grade 5 | [Existing Grade 5 address](https://weeklydictation-g5-beta.web.app/) | Firebase `5487998f698eb099` | `rollback-before-family-sync`, version `424b6a63322ed355` |

The roots open the correct grade in `family-beta-preview.html`. All 120 public application files were checksum-verified at each of the four origins. Complete hashes, verification limits, and publication details are in the [family-sync release record](./family-sync-release-2026-10-05.md).

## Persistence and update boundaries

- Completed writing, reading, and supported game results sync under the parent account. Reports stay local and are shared as an end-of-session batch.
- Sequential cross-device synchronization passed live acceptance. Older device-only profiles and preview scores do not transfer automatically. Never clear browser data to resolve an old-version complaint.
- Legacy Grade 2 state and recovery keys are separate from the family ledger and activity namespaces. The October 5 release did not reset or migrate real child data. Do not assume legacy restore tools cover every new record.
- Recordings remain temporary comparison data, with no uploads or retained audio.
- Dojo, Boss, and Spirit Realm behavior and unfinished-session persistence still need activity-level acceptance; a saved aggregate score is not proof of exact resume.
- Ordinary tested updates have standing owner approval. Data resets, production authentication/security changes, and unreviewed migrations remain separately restricted.
- The homepage uses three links on the canonical Ninja Dojo origin, sharing one parent sign-in. Old grade origins remain available with the updated build and their local records intact.

## Remaining acceptance work

1. Grade 5 daily-learning/Boss defects and iMac/iPad audio, recording, writing, exit, and return checks.
2. Exact completed-trial acquisition checkpoints for every retained activity, with separate progress for alternative presentations.
3. All game-to-tier rules, generated content validation, and separate per-game weekly history.
4. Pause/preserve behavior while reporting from each game and continued session-end batching.
5. Coverage of new family storage in backup/restore before a persistence migration, plus containment and rollback rehearsal.

These are ongoing beta improvements, not a requirement to repeat completed source authorization or all three initial deployments. Earlier October 3 release reports remain historical evidence, not current release identities.
