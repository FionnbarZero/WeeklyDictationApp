# Family beta release inventory

Status: current deployment verified on 2026-10-02; release protections incomplete.

This inventory records the three applications used in the closed family beta without identifying any child. It establishes what is live now, where progress can exist, and what must be protected before another child-facing update. It does not approve the activities as product-correct; the product owner has reported that the current activity behavior still needs separate grade-by-grade review.

## Current deployment

All three entry URLs are served from one GitHub Pages artifact:

| Field | Verified value |
| --- | --- |
| Public origin | `https://fionnbarzero.github.io/WeeklyDictationApp/` |
| Deployment branch | `gh-pages` |
| Deployment artifact commit | `8fffebee35a91fc31ba37a8d4dd1141517aaf023` |
| Effective source revision | `a6df41db07331fd0c8dde190dbf80b10650184df` |
| Source application version | `0.2.0-stage2`; not displayed in the current child UI |
| Deployment date | 2026-10-02 |
| Verification | Each live HTML entry returned HTTP 200 and its Git blob hash exactly matched `origin/gh-pages` |
| Previous artifact candidate | `a4dc97f4ba5b09b4a7d23847740014f3a9d90956`, built from `dfb0bf83dda18dc2eaecfb63c2ba752e0e120991`; no acceptance or rollback-rehearsal evidence is recorded |

The current artifact is the observed baseline to preserve while C0 controls are added. It is not yet a fully approved known-good release because activity acceptance is incomplete, visible release identity is absent, and the previous artifact has not been verified as a safe rollback.

The three URLs are separate entry routes but not separate deployments. Updating `gh-pages` can replace Grade 2, Kindergarten, and Grade 5 together. Independent grade promotion and rollback are therefore not available today.

## Grade 2 beta

| Field | Current record |
| --- | --- |
| Entry URL | `https://fionnbarzero.github.io/WeeklyDictationApp/` |
| Grade label | Grade 2 primary app |
| Activity surface | Dojo Tier 1 writing and Tier 2 reading; Final Boss writing and reading; Spirit Realm writing Warmup and reading mastery; Progress and History. Ninja game cards are present but not connected to Grade 2 scoring. |
| Curriculum identity | Active Grade 2 source profile for school year 2026–2027. The exact datasets used by the child live in that browser's stored application state and cannot be proven from the deployment artifact alone. |
| Persistence promise | Tier 1 writing state is retained only in the current browser profile on this origin. Tier 2 reading results and recordings are session-only. |
| Child-data location | Browser `localStorage` under the GitHub Pages origin, principally `weekly-dictation-state-v2` plus the Acquisition and Warmup pending journals. The public-preview build has no Firebase configuration and writes no child progress to Firestore. |
| Stored contracts | Application state version 2; Acquisition persistence version 1; Adaptive Warmup visit version 1. |
| Current release protection | None beyond the retained Git deployment artifact. Candidate source adds SHA-256 export and a zero-write restore preview, but the live artifact does not contain it and applying a restore remains deliberately unavailable. |
| Known limitations | Progress is tied to one browser profile and can be lost through cleared site data, browser-profile changes, or an incompatible release. The app does not display its build or persistence identity. Current activity behavior is not independently product-approved. |

Do not deploy a Grade 2 persistence-affecting change until the exact browser state, both pending journals, curriculum references, and checksum have been exported and a non-writing preview restore has succeeded.

The candidate export contains learning records and a selected profile identifier. It must remain in private family-controlled storage and must never be attached to a routine bug report.

## Kindergarten beta

| Field | Current record |
| --- | --- |
| Entry URL | `https://fionnbarzero.github.io/WeeklyDictationApp/kindergarten-learning-lab.html` |
| Grade label | Kindergarten Learning Lab |
| Activity surface | Dojo writing and reading; Listening Lily Pads, Memory Lanterns, and Sky Writing; cumulative Unit 1 writing and reading Final Boss; writing and reading Spirit Realm; visit-only Ninja Record. |
| Curriculum identity | Checked-in `tests/fixtures/kindergarten-workbook.json` from source revision `a6df41d`; SHA-256 `08210c5f95bfefe1ccb3e0d57bb2cd0924754074da4b70f7a62e8ad8a21a94c2`. |
| Persistence promise | Session-only. Scores exist only during the current visit. Reading audio is prompt-local and released when the activity or visit ends. |
| Child-data location | In-memory browser state only. No Google request, Firestore write, saved progress, or production source activation. |
| Current release protection | The shared `gh-pages` artifact only; no independent Kindergarten deployment or rollback. |
| Known limitations | Development fixture rather than trusted live source; no durable progress; source registry remains inactive; Kindergarten and Tier 2 release policy remains constrained by ADR 0005; current activity behavior is not independently product-approved. |

## Grade 5 beta

| Field | Current record |
| --- | --- |
| Entry URL | `https://fionnbarzero.github.io/WeeklyDictationApp/grade5-learning-hub.html` |
| Grade label | Grade 5 Learning Hub Preview |
| Activity surface | Dojo Tier 1 writing and Tier 2 reading; both Test Review cycles; cohort-specific Spirit Realm teaching and reacquisition; up-to-six-item Warmup preview. |
| Curriculum identity | Checked-in `tests/fixtures/grade5-presentation.json` from source revision `a6df41d`; SHA-256 `78e8c614814cf34bf711e596ae5cfaaa7799d7d353416f6c1775d3f09648844f`. The deployed fixture asset has the same checksum. |
| Persistence promise | Session-only. Scores, answers, and reading recordings are not retained after the visit. |
| Child-data location | In-memory browser state only. No production source activation or Firestore persistence. |
| Current release protection | The shared `gh-pages` artifact only; no independent Grade 5 deployment or rollback. |
| Known limitations | Development fixture; Grade 5 source registry remains inactive; Warmup and two-review-cycle persistence policies remain incomplete; current activity behavior is not independently product-approved. |

## Deployment controls still required

The inventory is recorded, but its C0 exit gate remains open. Complete these protections before treating any route as a stable grade-specific destination:

1. Obtain adult confirmation that these are the exact three bookmarked child-facing URLs and record the browser used for Grade 2 without recording a child's name.
2. Freeze `8fffebee35a91fc31ba37a8d4dd1141517aaf023` as a recoverable artifact and verify a rollback from a temporary preview without moving the child URLs.
3. Create independent stable destinations or channels so a change to one grade cannot replace the other two.
4. Display grade, beta status, application version, Git revision, and persistence status in each app.
5. Export and checksum the current Grade 2 browser state and rehearse preview restore before any persistence-affecting update.
6. Run an adult acceptance matrix for each activity. Keep incorrect or unresolved activities hidden or explicitly experimental.

Until those controls pass, do not update the shared `gh-pages` branch for child use. Proposed fixes should use temporary previews and the [family beta release manifest](./family-beta-release-manifest-template.md).
