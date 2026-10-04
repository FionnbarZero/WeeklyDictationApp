# Independent family beta delivery

Status: repository controls implemented; both Hosting sites, initial stable releases, and retained rollback channels are active; complete acceptance records remain open.

This delivery path isolates the two session-only applications without moving Grade 2. The existing GitHub Pages origin remains the Grade 2 data origin until verified lossless restore makes an origin change safe.

## Destinations

| Grade | Firebase project | Dedicated Hosting site | Stable destination | Persistence |
| --- | --- | --- | --- | --- |
| Kindergarten | `weeklydictationapp` | `weeklydictation-k-beta` | `https://weeklydictation-k-beta.web.app` | Session only |
| Grade 5 | `weeklydictationapp` | `weeklydictation-g5-beta` | `https://weeklydictation-g5-beta.web.app` | Session only |
| Grade 2 | unchanged | unchanged | `https://fionnbarzero.github.io/WeeklyDictationApp/` | Browser-local Tier 1 writing |

The two additional Hosting sites are independent release channels. Deploying or rolling back either site does not replace the other site or the GitHub Pages artifact.

## Current live records

Verified through the authenticated Firebase Hosting channel inventory on 2026-10-03:

| Grade | Source revision | Hosting version | Artifact SHA-256 | Preview channel | Live release time |
| --- | --- | --- | --- | --- | --- |
| Kindergarten | `250d348f52792235ce72b7157b26e7cd0ad7f0bb` | `856c70eaec380dc5` | `71d59ef35fa3cb9a2c856973c751ff56ce5f7e64dc5d9724ba44bed89923a5d0` | `candidate-250d348f5279` | `2026-10-03T19:47:10.709Z` |
| Grade 5 | `a55d972ccb6f6db00c81b202d4e5bba16a889025` | `d9bf9c316262a8a8` | `37d0c7fd366ea59a530f5ad29682b8bc6d8cf592273d2f00e33b5d7a04dbacdb` | `candidate-a55d972ccb6f` | `2026-10-03T22:53:37.183Z` |

Both live roots display the recorded revision and session-only status. Grade 5 uses the corrected `Cache-Control: no-store` rule for rewritten roots. Kindergarten still uses the earlier HTML-only rule, so `/` can receive Firebase's one-hour default cache; fix this only through an approved exact-artifact promotion.

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
  --confirm-site weeklydictation-k-beta
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
  --confirm-site weeklydictation-k-beta
```

For later promotions, first provision the revision-scoped `rollback-stable-<previous-revision>` channel through the authenticated Firebase Hosting API without `ttl` or `expireTime`, and confirm that its channel record has no `expireTime`. Then replace `--initial-release` with `--previous-revision <full-current-stable-revision>`. The command now fails before changing live if that retained channel is absent or expiring, verifies the current live revision, clones it to the retained channel, clones the reviewed candidate to `live`, and verifies both channels. It never rebuilds during promotion.

Rollback also uses a server-side clone:

```sh
npm run family-beta:rollback -- \
  --grade kindergarten \
  --revision <full-rollback-revision> \
  --confirm-revision <full-rollback-revision> \
  --confirm-project weeklydictationapp \
  --confirm-site weeklydictation-k-beta
```

Append `--execute` only after the dry-run plan, manifest, preview, and adult acceptance record have been reviewed.

## Provisioning and release gates

The one-time site creation was completed on 2026-10-03 with the Firebase-owning account. The provisioning commands remain here for recovery documentation only:

```sh
npx firebase hosting:sites:create weeklydictation-k-beta --project weeklydictationapp
npx firebase hosting:sites:create weeklydictation-g5-beta --project weeklydictationapp
```

Site creation alone does not authorize a stable release. Before the first promotion for each grade:

1. Package and checksum a clean committed revision.
2. Deploy its candidate channel and record its Hosting version and preview URL.
3. Complete the adult activity-acceptance matrix on that preview.
4. Confirm the app retains no score, answer, progress, or audio after the visit.
5. Promote the exact candidate with `--initial-release`.
6. Run launch, exit, completion, session-only, console, and failed-request checks on the stable URL.
7. Record the release in a grade-specific manifest.

Grade 2 is deliberately unsupported by these scripts. The scripts also contain no GitHub Pages deployment path, so this work cannot move or overwrite its browser-local storage origin.
