# Family beta release inventory

Status: live destinations and Hosting identities verified on 2026-10-03; C0 protections partially complete.

This inventory records the three closed-family-beta applications without identifying any child. It establishes what is live, where progress can exist, and what remains before another child-facing update. It does not approve current activity behavior as product-correct.

## Current stable destinations

| Grade | Stable destination | Live source and artifact | Persistence | Release protection |
| --- | --- | --- | --- | --- |
| Kindergarten | `https://weeklydictation-k-beta.web.app` | Source `250d348f52792235ce72b7157b26e7cd0ad7f0bb`; Hosting version `856c70eaec380dc5`; artifact SHA-256 `71d59ef35fa3cb9a2c856973c751ff56ce5f7e64dc5d9724ba44bed89923a5d0` | Session only | Independent live and preview channels; visible identity; non-expiring rollback channel for the same Hosting version; adult defect review active |
| Grade 2 | `https://fionnbarzero.github.io/WeeklyDictationApp/` | Pages artifact `8fffebee35a91fc31ba37a8d4dd1141517aaf023`; effective source `a6df41db07331fd0c8dde190dbf80b10650184df` | Browser-local durable Tier 1; Tier 2 session only | Frozen artifact and offline rollback evidence; merged restore is not live or operator-rehearsed |
| Grade 5 | `https://weeklydictation-g5-beta.web.app` | Source `a55d972ccb6f6db00c81b202d4e5bba16a889025`; Hosting version `d9bf9c316262a8a8`; artifact SHA-256 `37d0c7fd366ea59a530f5ad29682b8bc6d8cf592273d2f00e33b5d7a04dbacdb` | Session only | Independent live and preview channels; visible identity and safe rewritten-root cache headers; non-expiring rollback channel for the same Hosting version |

The legacy GitHub Pages artifact still serves Kindergarten and Grade 5 routes, but those routes are not the independent promotion path. Confirm that child bookmarks use the dedicated Firebase destinations before changing or retiring any legacy route.

## Grade 2 beta

| Field | Current record |
| --- | --- |
| Grade label | Grade 2 primary app |
| Activity surface | Dojo Tier 1 writing and Tier 2 reading; Final Boss writing and reading; Spirit Realm writing Warmup and reading mastery; Progress and History. Ninja game cards are present but not connected to Grade 2 scoring. |
| Curriculum identity | Active Grade 2 source profile for school year 2026–2027. Exact child datasets remain in browser storage and cannot be proven from the deployment artifact alone. |
| Persistence promise | Tier 1 writing state is retained only in the current browser profile on this origin. Tier 2 reading results and recordings are session-only. |
| Child-data location | Browser `localStorage` under the GitHub Pages origin: `weekly-dictation-state-v2`, `weekly-dictation-acquisition-pending-v1`, and `weekly-dictation-warmup-pending-v1`. |
| Stored contracts | Application state version 2; Acquisition persistence version 1; Adaptive Warmup visit version 1. |
| Merged protection | Truthfully labelled whole-local-state SHA-256 backup and scope checks; selected-child deep zero-write preview and merge; before/after report; automatic pre-restore backup; transactional three-key apply; rollback on write failure; startup recovery; idempotent replay. |
| Live protection | The current live artifact predates release identity and restore UI. No real family-browser verified backup or lossless restore rehearsal is recorded. |
| Known limitations | Progress remains tied to one origin and browser profile. Origin changes can strand data. Activity behavior is not independently product-approved. |

Do not promote a Grade 2 persistence-affecting change until the exact family-browser state is protected, the restore path passes on a disposable copy, the current origin is retained, and rollback evidence is recorded. Backup files contain learning records and must remain in private family-controlled storage.

## Kindergarten beta

| Field | Current record |
| --- | --- |
| Grade label | Kindergarten · Experimental |
| Activity surface | Dojo writing and reading; Listening Lily Pads, Memory Lanterns, and Sky Writing; cumulative Unit 1 writing and reading Final Boss; writing and reading Spirit Realm; visit-only Ninja Record. |
| Curriculum identity | Checked-in `tests/fixtures/kindergarten-workbook.json`; SHA-256 `08210c5f95bfefe1ccb3e0d57bb2cd0924754074da4b70f7a62e8ad8a21a94c2`. |
| Persistence promise | Session-only. Scores exist only during the current visit. Reading audio is prompt-local and released when the activity or visit ends. |
| Child-data location | In-memory browser state only. No Google request, Firestore write, saved progress, or production source activation. |
| Release identity | Version `0.2.0-stage2`; revision `250d348f52792235ce72b7157b26e7cd0ad7f0bb`; session only. |
| Current release protection | Dedicated Hosting site, exact-artifact preview/promotion controls, and non-expiring `rollback-stable-250d348f5279` on Hosting version `856c70eaec380dc5`. Exact release record is in [Kindergarten family beta release — 2026-10-03](./family-beta-release-kindergarten-2026-10-03.md). |
| Known limitations | Adult smoke testing has identified unresolved activity defects. The source is a development fixture, the registry remains inactive, durable progress is unavailable, and the root route can cache for one hour because this artifact predates the rewritten-root cache fix. |

## Grade 5 beta

| Field | Current record |
| --- | --- |
| Grade label | Grade 5 · Experimental |
| Activity surface | Dojo Tier 1 writing and Tier 2 reading; both Test Review cycles; cohort-specific Spirit Realm teaching and reacquisition; up-to-six-item Warmup preview. |
| Curriculum identity | Checked-in `tests/fixtures/grade5-presentation.json`; SHA-256 `78e8c614814cf34bf711e596ae5cfaaa7799d7d353416f6c1775d3f09648844f`. The deployed fixture asset has the same checksum. |
| Persistence promise | Session-only. Scores, answers, and reading recordings are not retained after the visit. |
| Child-data location | In-memory browser state only. No production source activation or Firestore persistence. |
| Release identity | Version `0.2.0-stage2`; revision `a55d972ccb6f6db00c81b202d4e5bba16a889025`; session only. |
| Current release protection | Dedicated Hosting site, exact-artifact preview/promotion, visible identity, `no-store` rewritten-root responses, and non-expiring `rollback-stable-a55d972ccb6f` on Hosting version `d9bf9c316262a8a8`. Exact release record is in [Grade 5 family beta release — 2026-10-03](./family-beta-release-grade5-2026-10-03.md). |
| Known limitations | Development fixture; source registry inactive; Warmup and two-review-cycle persistence policies incomplete; detailed adult activity acceptance and observation not recorded. |

## C0 controls still required

1. Confirm the exact child bookmarks use the two dedicated Firebase sites and the unchanged Grade 2 origin.
2. Finish the adult activity-acceptance and observation fields in both session-only release manifests.
3. Correct Kindergarten's rewritten-root cache behavior through an approved exact-artifact promotion, not an unreviewed rebuild.
4. Use the [Grade 2 local restore rehearsal](./grade2-local-restore-rehearsal.md) to capture the real browser state locally, rehearse preview/apply/interruption/replay/rollback on a disposable copy, and record only the non-identifying evidence.
5. Promote the exact Grade 2 safety artifact on its existing origin only after its backup and rollback gates pass.
6. Rehearse critical and high-severity containment decisions and retain the non-identifying record.

Until these controls pass, do not treat C0 as closed. Proposed activity fixes use temporary previews and the [family beta release manifest](./family-beta-release-manifest-template.md).
