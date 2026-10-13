# Family beta release inventory

Canonical release verified October 13, 2026. Older alias identities below retain their historical verification; they were not republished or reverified by D2. This inventory describes the family wrapper, not the historical standalone prototypes.

## Current stable destinations

All three canonical grades use merge `937a51e47df995a49ba3c46d6930dcc6234fd5ec`, automatic read-only Google curriculum refresh, parent-owned online scores/practice, pinned saved lessons with prepared offline reopening, bounded completed-attempt history, and local batched problem reports. D2 adds separate durable Stroke Order Slay acquisition alongside D1 Whispering Scrolls and the earlier reviewed games. Cloudflare version `42f8137a-de79-452c-83e5-8e1633c48268` is active at 100%; guarded D1 version `279e9451-4f60-470e-8f54-8c5109e696a2` is retained inactive for containment. [D2 publication evidence](./stroke-order-slay-acquisition.md#publication-and-live-acceptance) records the exact manifest/153 public hashes, six entry/report checks and all-grade real-backend reviewed-fact, fresh-device pinned resume, completion and reload acceptance. Do not revert to an unguarded old engine after newer reviewed work is saved. Physical iMac/iPad acceptance, future guide coverage, Grade 5's session-only Warmup and full Spirit Realm integration remain limitations.

| Grade | Permanent link | Live artifact |
| --- | --- | --- |
| Kindergarten | [Kindergarten](https://ninjadojo.meghangames.com/?grade=kindergarten) | Shared canonical Cloudflare release above |
| Grade 2 | [Grade 2](https://ninjadojo.meghangames.com/?grade=grade2) | Same release |
| Grade 5 | [Grade 5](https://ninjadojo.meghangames.com/?grade=grade5) | Same release |

## Older aliases — not republished by subsequent canonical releases

These retain source `ef9d1f75df7046152c4829e8f7cfca635f303461` and their original device records. Do not distribute them for current testing. Retirement remains a separate E1 task.

| Grade | Older address | Retained artifact | Previous release retained |
| --- | --- | --- | --- |
| Kindergarten | [Existing Kindergarten address](https://weeklydictation-k-beta.web.app/) | Firebase `1cdad369b59f20cd` | `rollback-before-family-sync`, version `08c2e412a3095227` |
| Grade 2 | [Existing Grade 2 address](https://fionnbarzero.github.io/WeeklyDictationApp/) | Pages commit `7a3278ca26725702dbc7ce4204b0d1318db17e74` | Parent deployment `0b499f86676dcffe4a62fcf4173a8a32402d039a` |
| Grade 5 | [Existing Grade 5 address](https://weeklydictation-g5-beta.web.app/) | Firebase `5487998f698eb099` | `rollback-before-family-sync`, version `424b6a63322ed355` |

The October 5 operation verified all 120 public files at all four origins; those results are historical, not proof the aliases serve the current release. Their exact hashes and publication details remain in the [October 5 family-sync record](./family-sync-release-2026-10-05.md).

## E1 dependency and retirement inventory

Read-only inspection October 13 confirms the canonical manifest is D2 `937a51e`, with all **153 public files** matching the retained package through the new local canonical verifier. The three principal obsolete copies still expose October 5 source `ef9d1f75df7046152c4829e8f7cfca635f303461`. Provider metadata lists **six Firebase sites and 22 channel records**, including already-expired entries; the legacy domain and [current custom-domain listing](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites.customDomains/list) both return no attached domains on those six sites. These checks read public manifests/hosting metadata, not private family records. A missing manifest does not prove a hosting site or preview channel is unused.

| Target | Evidence / dependency | E1 disposition |
| --- | --- | --- |
| `ninjadojo.meghangames.com` / Worker `meghangames-ninjadojo` | Current three-grade family app; D2 live identity/hash verification passes | Keep; only supported family release target |
| `weeklydictation-k-beta.web.app` | HTTP 200 manifest, obsolete October 5 Kindergarten source; possible origin-local reports/progress | Retirement candidate, not retired; check custom domains/channels and saved-data consequences before separate approval |
| `fionnbarzero.github.io/WeeklyDictationApp` / `gh-pages` | HTTP 200 manifest, obsolete October 5 Grade 2 source; retained origin-bound history | Retirement candidate, not retired; inspect Pages/custom-domain dependencies and local-data consequences; preserve Git history |
| `weeklydictation-g5-beta.web.app` | HTTP 200 manifest, obsolete October 5 Grade 5 source; possible origin-local reports/progress | Retirement candidate, not retired; check custom domains/channels and saved-data consequences before separate approval |
| `weeklydictation-g2-preview.web.app` | Main manifest HTTP 404, but provider lists `candidate-e9c5a547031c` through October 16 plus an empty live channel | Explicit retirement approval pending; do not infer safe deletion from the main-page 404 |
| `weeklydictation-g5-rollback.web.app` | HTTP 200 manifest, older source `a55d972ccb6f6db00c81b202d4e5bba16a889025`; not current guarded containment | Retirement candidate only; confirm channels/custom domains and superseded recovery dependencies first |
| `weeklydictation-k-rollback.web.app` | Provider lists a separate user site with one live channel; source/runtime acceptance not inspected | Additional inventory target, not approved for retirement or use as current containment |
| `weeklydictationapp.web.app` default site | Provider lists one live channel on the shared Firebase project's default site | Protect pending separate dependency inspection; do not bundle with obsolete grade-copy removals |
| Firebase project `weeklydictationapp` | Canonical `src/firebaseClient.ts` and family cloud code use its Authentication/Firestore APIs; app records live here | Protect; deleting the project/database/users is NOT static-host retirement |
| Firebase auth domains, App Check, storage/audio resources and production rules | Shared service configuration; not proof of a separate obsolete frontend | Protect; any security/configuration/retention change is E2 or separately authorized work |
| Cloud Run `weekly-dictation-curriculum`, validated-curriculum bucket and Google OAuth secrets | Canonical family curriculum endpoint and automatic teacher refresh | Protect; retain service/backend deployment path; never treat it as an obsolete grade host |
| `meghangames.com` homepage Worker and synthetic staging | Separate site/service; staging guards explicitly exclude production | Protect; outside obsolete-grade-host retirement |

Six old publisher/alias-packager entrypoints are locally disabled before side effects. Their implementations and the old four-origin verifier remain in `archive/deployment/*.ts.disabled`, with execution-stop guards and Git history. Shared reference packaging/hash helpers and their CI remain supported as references, not a second app publication route. These safeguards exist only on the current local E1 branch until reviewed/merged; they do not disable scripts in older Git checkouts or revoke anyone's provider access.

**No targets have been retired.** Firebase provider site/channel/domain metadata is now recorded; GitHub Pages configuration/attachments and residual bookmark/data consequences remain to be checked. Grade 5 and Kindergarten sites also retain named preview/recovery channels, including `candidate-e9c5a547031c`; do not treat all 22 listed records as reachable releases or delete them indiscriminately. Identify concrete removals, disclose that disabling an origin can prevent access to its unsent reports/unsynced browser progress, then obtain target-specific retirement approval after **GPT-6 Astra · High** review. Never delete shared Firebase/Google infrastructure or clear a device's records to retire a static copy. The local tooling/controller tests do not constitute a real hosting rollback exercise.

## Persistence and update boundaries

- Completed writing, reading, and supported game results sync under the parent account. Reports stay local and are shared as an end-of-session batch.
- Sequential cross-device synchronization passed live acceptance. Older device-only profiles and preview scores do not transfer automatically. Never clear browser data to resolve an old-version complaint.
- Legacy Grade 2 state and recovery keys are separate from the family ledger and activity namespaces. The October 5 release did not reset or migrate real child data. Do not assume legacy restore tools cover every new record.
- Recordings remain temporary comparison data, with no uploads or retained audio.
- Dojo, Boss, and Spirit Realm behavior and unfinished-session persistence still need activity-level acceptance; a saved aggregate score is not proof of exact resume.
- Ordinary tested updates have standing owner approval. Data resets, production authentication/security changes, and unreviewed migrations remain separately restricted.
- The homepage uses three links on the canonical Ninja Dojo origin, sharing one parent sign-in. Old grade origins retain the older October 5 build and their local records intact; no current-release claim applies to those copies. New Grade 2 family work uses a protected atomic workspace; later practice on an old alias remains separate and is not silently merged.

## Remaining acceptance work

1. Grade 5 daily-learning/Boss defects and iMac/iPad audio, recording, writing, exit, and return checks.
2. Exact completed-trial acquisition checkpoints for every retained activity, with separate progress for alternative presentations.
3. All game-to-tier rules, generated content validation, and separate per-game weekly history.
4. Pause/preserve behavior while reporting from each game and continued session-end batching.
5. Coverage of new family storage in backup/restore before a persistence migration, plus containment and rollback rehearsal.

These are ongoing beta improvements, not a requirement to repeat completed source authorization or all three initial deployments. Earlier October 3 release reports remain historical evidence, not current release identities.
