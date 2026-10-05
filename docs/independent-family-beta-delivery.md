# Independent family beta delivery

Status: Kindergarten and Grade 5 are independently hosted. Grade 2 is independently deployed at its existing GitHub Pages origin with automatic reviewed curriculum loading and a retained pre-change rollback deployment.

This delivery path isolates all three releases while preserving the existing Grade 2 browser-storage origin. Grade 2 verified backups are deliberately origin-bound, so the Firebase Grade 2 site is preview-only and must never become the stable child destination.

## Destinations

| Grade | Stable site | Stable destination | Non-expiring rollback site | Persistence |
| --- | --- | --- | --- | --- |
| Kindergarten | `weeklydictationapp` | `weeklydictation-k-beta` | `https://weeklydictation-k-beta.web.app` | Session only |
| Grade 5 | `weeklydictationapp` | `weeklydictation-g5-beta` | `https://weeklydictation-g5-beta.web.app` | Session only |
| Grade 2 preview | `weeklydictationapp` | `weeklydictation-g2-preview` | Temporary candidate channel only | Disposable synthetic or isolated state only |
| Grade 2 stable | GitHub Pages | `gh-pages` branch | `https://fionnbarzero.github.io/WeeklyDictationApp/` | Browser-local Tier 1 writing |

The Firebase sites are independent release channels. Deploying a preview does not change a stable destination. Kindergarten and Grade 5 promote by cloning an approved Hosting version. Grade 2 promotes the same verified artifact to `gh-pages` with a new fast-forward deployment commit, preserving its origin and browser data.

## Current live records

Verified through the authenticated Firebase Hosting channel inventory on 2026-10-03:

| Grade | Source revision | Hosting version | Artifact SHA-256 | Preview channel | Live release time |
| --- | --- | --- | --- | --- | --- |
| Kindergarten | `250d348f52792235ce72b7157b26e7cd0ad7f0bb` | `856c70eaec380dc5` | `71d59ef35fa3cb9a2c856973c751ff56ce5f7e64dc5d9724ba44bed89923a5d0` | `candidate-250d348f5279` | `2026-10-03T19:47:10.709Z` |
| Grade 5 | `a55d972ccb6f6db00c81b202d4e5bba16a889025` | `d9bf9c316262a8a8` | `37d0c7fd366ea59a530f5ad29682b8bc6d8cf592273d2f00e33b5d7a04dbacdb` | `candidate-a55d972ccb6f` | `2026-10-03T22:53:37.183Z` |

Both live roots display the recorded revision and session-only status. Grade 5 uses the corrected `Cache-Control: no-store` rule for rewritten roots. Kindergarten still uses the earlier HTML-only rule, so `/` can receive Firebase's one-hour default cache; fix this only through an approved exact-artifact promotion.

Verified through the safeguarded GitHub Pages promotion and a clean live-browser smoke test on 2026-10-03:

| Grade | Source revision | Pages deployment | Artifact file-tree SHA-256 | Curriculum SHA-256 | Retained rollback deployment |
| --- | --- | --- | --- | --- | --- |
| Grade 2 | `c9613b61fd9bb7258b03d02cd0d3fc69779ca44b` | `45ebf71559c514912795afbb2c11ea0c237a953e` | `df274d48cdcd7e16ee8fe057a2782d450d9d49417c5c2c5b19b6f5d77d04d775` | `147c2eac63011c79fa83655102939931fc3a1611a6f6e091923800c8be34690c` | `8fffebee35a91fc31ba37a8d4dd1141517aaf023` |

The live smoke test confirmed the displayed source revision, automatic loading of six weekly datasets, absence of the former upload input, expected browser-local storage keys, and no console, request, or HTTP failures. The published manifest records the exact offline snapshot packaging command used for this release.

Verified through the authenticated Firebase Hosting channel inventory on 2026-10-04:

| Grade | Retained rollback channel | Hosting version | Expiration |
| --- | --- | --- | --- |
| Kindergarten | [`rollback-stable-250d348f5279`](https://weeklydictation-k-beta--rollback-stable-250d348f5279-4kkjswl0.web.app) | `856c70eaec380dc5` | none |
| Grade 5 | [`rollback-stable-a55d972ccb6f`](https://weeklydictation-g5-beta--rollback-stable-a55d972ccb6f-1qadbkg1.web.app) | `d9bf9c316262a8a8` | none |

Each retained channel serves the same Hosting version and embedded Git revision as its live site. Creating these records did not change either live channel. The earlier `rollback-<revision>` rehearsal channels use Firebase's seven-day preview default and expire on 2026-10-11; they are not rollback authorities and may expire normally.

## Immutable artifact contract

Package one grade from a clean committed revision:

```sh
npm run package:family-beta -- --grade kindergarten
npm run package:family-beta -- --grade grade2
npm run package:family-beta -- --grade grade5
```

Grade 2 packaging automatically fetches the registered Slides deck with read-only `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` credentials. For an offline rehearsal, pass `--curriculum-snapshot public/curriculum/grade2-presentation.json`; the same schema, checksum, source-ID, and canonical-import validation still apply. The snapshot contains only the projected Mandarin curriculum text and is public within the Grade 2 artifact.

Each command creates one root application under `family-beta-dist/<grade>` and an archive plus SHA-256 file under `family-beta-artifacts`. The embedded `family-beta-manifest.json` records:

- full source revision and commit time;
- application version, grade, beta status, and persistence promise;
- exact build command and dependency-lock checksum;
- for Grade 2, the Slides document ID, retrieval time, curriculum checksum, dataset count, and snapshot path;
- every included file, byte count, and SHA-256; and
- one file-tree checksum.

The verifier rejects changed files, another grade's artifact, extra HTML entry points, a missing release identity, and dirty-worktree artifacts. A Grade 2 artifact must also contain `.nojekyll`. GitHub's manual **Package independent family beta artifacts** workflow packages all three grades from one explicitly supplied full revision and retains the downloadable artifacts for 30 days.

## Preview and promotion

Copy `.env.family-beta.example` to `.env.family-beta.local`. These values are public resource identifiers, not credentials. Authentication stays with the Firebase CLI or a future short-lived workload identity.

All delivery commands default to a no-write plan. They require exact project and site confirmation, and actual execution additionally requires `--execute` and a clean worktree.

Preview an already packaged artifact:

```sh
npm run family-beta:preview -- \
  --grade kindergarten \
  --confirm-project weeklydictationapp \
  --confirm-site weeklydictation-k-beta \
  --confirm-rollback-site weeklydictation-k-rollback
```

The executed preview deploys only to `candidate-<12-character-revision>` for seven days and then verifies that the hosted root displays the artifact's full revision.

For Grade 2, substitute `--grade grade2` and `--confirm-site weeklydictation-g2-preview`. The Grade 2 preview must use only synthetic data or an isolated disposable state. Its different origin intentionally cannot accept the private origin-bound family backup.

After adult approval, the initial stable promotion is a server-side clone of that exact preview version:

```sh
npm run family-beta:promote -- \
  --grade kindergarten \
  --revision <full-reviewed-revision> \
  --confirm-revision <full-reviewed-revision> \
  --initial-release \
  --confirm-project weeklydictationapp \
  --confirm-site weeklydictation-k-beta \
  --confirm-rollback-site weeklydictation-k-rollback
```

For later promotions, first provision the revision-scoped `rollback-stable-<previous-revision>` channel through the authenticated Firebase Hosting API without `ttl` or `expireTime`, and confirm that its channel record has no `expireTime`. Then replace `--initial-release` with `--previous-revision <full-current-stable-revision>`. The command now fails before changing live if that retained channel is absent or expiring, verifies the current live revision, clones it to the retained channel, clones the reviewed candidate to `live`, and verifies both channels. It never rebuilds during promotion.

Rollback also uses a server-side clone:

```sh
npm run family-beta:rollback -- \
  --grade kindergarten \
  --revision <full-rollback-revision> \
  --confirm-revision <full-rollback-revision> \
  --confirm-project weeklydictationapp \
  --confirm-site weeklydictation-k-beta \
  --confirm-rollback-site weeklydictation-k-rollback
```

Append `--execute` only after the dry-run plan, manifest, preview, and adult acceptance record have been reviewed.

## Grade 2 stable promotion

Grade 2 remains on GitHub Pages because moving it would strand origin-bound browser state. The stable tool verifies a clean immutable Grade 2 artifact, requires the exact current `gh-pages` deployment, creates a new deployment commit containing only that artifact, and performs a normal fast-forward push. It never force-pushes or rebuilds.

Dry-run the initial safety promotion:

```sh
npm run grade2-beta:promote -- \
  --revision <full-reviewed-revision> \
  --confirm-revision <full-reviewed-revision> \
  --previous-deployment 8fffebee35a91fc31ba37a8d4dd1141517aaf023 \
  --confirm-previous-deployment 8fffebee35a91fc31ba37a8d4dd1141517aaf023 \
  --confirm-origin https://fionnbarzero.github.io/WeeklyDictationApp/
```

After approval, repeat with `--execute`. Record the resulting deployment commit in the manifest. The promoted artifact retires the obsolete Kindergarten and Grade 5 files from GitHub Pages; confirm those children use their dedicated Firebase destinations before execution.

Rollback also creates a new fast-forward commit, using the retained target's exact tree:

```sh
npm run grade2-beta:rollback -- \
  --target-deployment 8fffebee35a91fc31ba37a8d4dd1141517aaf023 \
  --confirm-target-deployment 8fffebee35a91fc31ba37a8d4dd1141517aaf023 \
  --current-deployment <current-gh-pages-deployment> \
  --confirm-current-deployment <current-gh-pages-deployment> \
  --confirm-origin https://fionnbarzero.github.io/WeeklyDictationApp/
```

The rollback target must remain in the current deployment history. Before rollback, download another verified Grade 2 backup when the affected build can do so safely. The prior GitHub Pages state remains at the same origin, but compatibility and any progress created after promotion still require review.

## Provisioning and release gates

Kindergarten and Grade 5 site creation was completed on 2026-10-03 with the Firebase-owning account. The Grade 2 preview-only site remains unprovisioned. Commands are retained here for recovery and the pending preview setup:

```sh
npx firebase hosting:sites:create weeklydictation-k-beta --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g2-preview --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g5-beta --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-k-rollback --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g5-rollback --project weeklydictationapp
```

Site creation alone does not authorize a stable release. Before a Kindergarten or Grade 5 promotion:

1. Package and checksum a clean committed revision.
2. Deploy its candidate channel and record its Hosting version and preview URL.
3. Complete the adult activity-acceptance matrix on that preview.
4. Confirm the app retains no score, answer, progress, or audio after the visit.
5. Promote the exact candidate with `--initial-release`.
6. Run launch, exit, completion, session-only, console, and failed-request checks on the stable URL.
7. Record the release in a grade-specific manifest.

For every Grade 2 promotion, additionally require:

1. Confirm Kindergarten and Grade 5 bookmarks use their independent stable destinations.
2. Package the exact clean Grade 2 revision and deploy that artifact to the disposable preview site.
3. Complete adult activity acceptance on the preview without importing real family data.
4. Re-run the private restore rehearsal against the exact promotion revision and retain its verified backup.
5. Review the release manifest and dry-run both promotion and rollback commands.
6. Promote with `--execute`, then verify launch, resume, completion, persistence, backup, and clean browser diagnostics on the unchanged stable origin.
7. Observe the canary and either accept or run the prepared rollback.
