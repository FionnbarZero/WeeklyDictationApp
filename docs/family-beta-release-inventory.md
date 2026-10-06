# Family beta release inventory

Canonical release verified October 6, 2026. Older alias identities below retain their October 5 verification. This inventory describes the family wrapper, not the historical standalone prototypes.

## Current stable destinations

All three canonical grades use merge `668627922bd95200c748601d7dba371a69a53b37`, automatic read-only Google curriculum refresh, parent-owned online scores/practice, and local batched problem reports. The [Meghan Games homepage](https://meghangames.com/) supplies these canonical links. Cloudflare version `2e0cb204-5e1f-4483-bafa-4f28911718d7` is active; prior version `8d6c4b13-a23e-44ad-bbd4-9dcf79aadd64` is retained for rollback. [A1 release evidence](./a1-release-2026-10-06.md) records all 120 public-file hashes matching the tested artifact and three-grade live saving/recovery acceptance.

| Grade | Permanent link | Live artifact |
| --- | --- | --- |
| Kindergarten | [Kindergarten](https://ninjadojo.meghangames.com/?grade=kindergarten) | Shared canonical Cloudflare release above |
| Grade 2 | [Grade 2](https://ninjadojo.meghangames.com/?grade=grade2) | Same release |
| Grade 5 | [Grade 5](https://ninjadojo.meghangames.com/?grade=grade5) | Same release |

## Older aliases — not republished by A1

These retain source `ef9d1f75df7046152c4829e8f7cfca635f303461` and their original device records. Do not distribute them for current A1 testing. Retirement remains a separate E1 task.

| Grade | Older address | Retained artifact | Previous release retained |
| --- | --- | --- | --- |
| Kindergarten | [Existing Kindergarten address](https://weeklydictation-k-beta.web.app/) | Firebase `1cdad369b59f20cd` | `rollback-before-family-sync`, version `08c2e412a3095227` |
| Grade 2 | [Existing Grade 2 address](https://fionnbarzero.github.io/WeeklyDictationApp/) | Pages commit `7a3278ca26725702dbc7ce4204b0d1318db17e74` | Parent deployment `0b499f86676dcffe4a62fcf4173a8a32402d039a` |
| Grade 5 | [Existing Grade 5 address](https://weeklydictation-g5-beta.web.app/) | Firebase `5487998f698eb099` | `rollback-before-family-sync`, version `424b6a63322ed355` |

The October 5 operation verified all 120 public files at all four origins; those results are historical, not proof the aliases serve A1. Their exact hashes and publication details remain in the [October 5 family-sync record](./family-sync-release-2026-10-05.md).

## Persistence and update boundaries

- Completed writing, reading, and supported game results sync under the parent account. Reports stay local and are shared as an end-of-session batch.
- Sequential cross-device synchronization passed live acceptance. Older device-only profiles and preview scores do not transfer automatically. Never clear browser data to resolve an old-version complaint.
- Legacy Grade 2 state and recovery keys are separate from the family ledger and activity namespaces. The October 5 release did not reset or migrate real child data. Do not assume legacy restore tools cover every new record.
- Recordings remain temporary comparison data, with no uploads or retained audio.
- Dojo, Boss, and Spirit Realm behavior and unfinished-session persistence still need activity-level acceptance; a saved aggregate score is not proof of exact resume.
- Ordinary tested updates have standing owner approval. Data resets, production authentication/security changes, and unreviewed migrations remain separately restricted.
- The homepage uses three links on the canonical Ninja Dojo origin, sharing one parent sign-in. Old grade origins retain the older October 5 build and their local records intact; no A1 claim applies to those copies.

## Remaining acceptance work

1. Grade 5 daily-learning/Boss defects and iMac/iPad audio, recording, writing, exit, and return checks.
2. Exact completed-trial acquisition checkpoints for every retained activity, with separate progress for alternative presentations.
3. All game-to-tier rules, generated content validation, and separate per-game weekly history.
4. Pause/preserve behavior while reporting from each game and continued session-end batching.
5. Coverage of new family storage in backup/restore before a persistence migration, plus containment and rollback rehearsal.

These are ongoing beta improvements, not a requirement to repeat completed source authorization or all three initial deployments. Earlier October 3 release reports remain historical evidence, not current release identities.
