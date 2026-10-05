# Independent family beta delivery

Status: operational. Kindergarten and Grade 5 have independent stable sites plus non-expiring rollback sites. Exact-artifact preview, promotion, and rollback controls are implemented and exercised.

This delivery path isolates the two session-only applications without moving Grade 2. The existing GitHub Pages origin remains the Grade 2 data origin until verified lossless restore makes an origin change safe.

## Destinations

| Grade | Stable site | Stable destination | Non-expiring rollback site | Persistence |
| --- | --- | --- | --- | --- |
| Kindergarten | `weeklydictation-k-beta` | `https://weeklydictation-k-beta.web.app` | `weeklydictation-k-rollback` | Session only |
| Grade 5 | `weeklydictation-g5-beta` | `https://weeklydictation-g5-beta.web.app` | `weeklydictation-g5-rollback` | Session only |
| Grade 2 | unchanged | `https://fionnbarzero.github.io/WeeklyDictationApp/` | Frozen GitHub Pages artifacts; isolated preview only | Browser-local Tier 1 writing |

The grade sites and their rollback sites are independent. Deploying or rolling back either grade does not replace the other grade or the GitHub Pages artifact. Firebase preview channels expire, so promotion snapshots the previous stable artifact into the grade's dedicated rollback site's `live` channel before moving the stable site.

## Immutable artifact contract

Package one grade from a clean committed revision:

```sh
npm run package:family-beta -- --grade kindergarten
npm run package:family-beta -- --grade grade5
```

Each command creates one root application under `family-beta-dist/<grade>` and an archive plus SHA-256 file under `family-beta-artifacts`. The embedded `family-beta-manifest.json` records:

- full source revision and commit time;
- application version, grade, beta status, and persistence promise;
- exact build command and dependency-lock checksum;
- every included file, byte count, and SHA-256; and
- one file-tree checksum.

The verifier rejects changed files, another grade's artifact, extra HTML entry points, a missing release identity, and dirty-worktree artifacts. GitHub's manual **Package independent family beta artifacts** workflow packages both grades from one explicitly supplied full revision and retains the downloadable artifacts for 30 days.

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

For later promotions, replace `--initial-release` with `--previous-revision <full-current-stable-revision>`. The command verifies the current live revision, clones it to the grade's dedicated rollback site's non-expiring `live` channel, clones the reviewed candidate to the stable site's `live` channel, and verifies both destinations. It never rebuilds during promotion.

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

## Provisioning and release gates

The Firebase-owning account provisioned these sites on 2026-10-04:

```sh
npx firebase hosting:sites:create weeklydictation-k-beta --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g5-beta --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-k-rollback --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g5-rollback --project weeklydictationapp
```

Current verified routing:

| Grade | Stable revision | Rollback revision |
| --- | --- | --- |
| Kindergarten | `21fd1a1a0e60f429f4e6bd0da26833954e244193` | `1adb6cd250b2053a1fb4185deceb5eae982ec496` |
| Grade 5 | `ff52db8d6a995f6c6707f7944cfcdd031d0543b4` | `a55d972ccb6f6db00c81b202d4e5bba16a889025` |

Both rollback revisions were fetched from their source channels, cloned server-side to the dedicated rollback sites, and fetched again from the non-expiring destination URLs to verify the full embedded revision.

Site creation alone does not authorize a stable release. Before the first promotion for each grade:

1. Package and checksum a clean committed revision.
2. Deploy its candidate channel and record its Hosting version and preview URL.
3. Complete the adult activity-acceptance matrix on that preview.
4. Confirm the app retains no score, answer, progress, or audio after the visit.
5. Promote the exact candidate with `--initial-release`.
6. Run launch, exit, completion, session-only, console, and failed-request checks on the stable URL.
7. Record the release in a grade-specific manifest.

Grade 2 is deliberately unsupported by these scripts. The scripts also contain no GitHub Pages deployment path, so this work cannot move or overwrite its browser-local storage origin.
