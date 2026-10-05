# Family beta release inventory

Status: current destinations and embedded revisions verified on 2026-10-04. Kindergarten and Grade 5 have independent stable and non-expiring rollback sites; Grade 2 remains on its original browser-storage origin.

This inventory records the three applications used in the closed family beta without identifying any child. It establishes what is live now, where progress can exist, and what must be protected before another child-facing update. It does not approve the activities as product-correct; the product owner has reported that the current activity behavior still needs separate grade-by-grade review.

## Current deployment

Grade 2 remains on GitHub Pages so its browser-local state keeps the same origin. The session-only grades have moved independently:

| Field | Verified value |
| --- | --- |
| Grade 2 stable | `https://fionnbarzero.github.io/WeeklyDictationApp/`; revision `ff52db8d6a995f6c6707f7944cfcdd031d0543b4` |
| Kindergarten stable | `https://weeklydictation-k-beta.web.app`; revision `21fd1a1a0e60f429f4e6bd0da26833954e244193` |
| Kindergarten rollback | `https://weeklydictation-k-rollback.web.app`; revision `1adb6cd250b2053a1fb4185deceb5eae982ec496` |
| Grade 5 stable | `https://weeklydictation-g5-beta.web.app`; revision `ff52db8d6a995f6c6707f7944cfcdd031d0543b4` |
| Grade 5 rollback | `https://weeklydictation-g5-rollback.web.app`; revision `a55d972ccb6f6db00c81b202d4e5bba16a889025` |
| Verification | Every URL returned HTTP 200 and displayed the full expected embedded revision; rollback artifacts were cloned server-side from verified predecessor channels |

Activity acceptance remains a separate product gate. The delivery topology itself is now grade-isolated for Kindergarten and Grade 5; neither stable nor rollback operation can replace Grade 2 or the other session-only grade.

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
| Current release protection | Visible revision identity plus SHA-256 export, zero-write preview, selected-child restore, transaction journal, rollback-on-failure, and idempotent replay. The private real export passed the 2026-10-04 offline rehearsal. |
| Known limitations | Progress is tied to one browser profile and can be lost through cleared site data, browser-profile changes, or an incompatible release. Current activity behavior is not independently product-approved. |

Do not deploy a Grade 2 persistence-affecting change without a fresh exact browser export and non-writing preview. The verified 2026-10-04 export is rehearsal evidence, not a permanent substitute for a current pre-release backup.

The candidate export contains learning records and a selected profile identifier. It must remain in private family-controlled storage and must never be attached to a routine bug report.

## Kindergarten beta

| Field | Current record |
| --- | --- |
| Entry URL | `https://weeklydictation-k-beta.web.app` |
| Grade label | Kindergarten Learning Lab |
| Activity surface | Dojo writing and reading; Listening Lily Pads, Memory Lanterns, and Sky Writing; cumulative Unit 1 writing and reading Final Boss; writing and reading Spirit Realm; visit-only Ninja Record. |
| Curriculum identity | Checked-in `tests/fixtures/kindergarten-workbook.json` from source revision `a6df41d`; SHA-256 `08210c5f95bfefe1ccb3e0d57bb2cd0924754074da4b70f7a62e8ad8a21a94c2`. |
| Persistence promise | Session-only. Scores exist only during the current visit. Reading audio is prompt-local and released when the activity or visit ends. |
| Child-data location | In-memory browser state only. No Google request, Firestore write, saved progress, or production source activation. |
| Current release protection | Independent stable site, exact candidate promotion, and non-expiring rollback site serving revision `1adb6cd250b2053a1fb4185deceb5eae982ec496`. |
| Known limitations | Development fixture rather than trusted live source; no durable progress; source registry remains inactive; Kindergarten and Tier 2 release policy remains constrained by ADR 0005; current activity behavior is not independently product-approved. |

## Grade 5 beta

| Field | Current record |
| --- | --- |
| Entry URL | `https://weeklydictation-g5-beta.web.app` |
| Grade label | Grade 5 Learning Hub Preview |
| Activity surface | Dojo Tier 1 writing and Tier 2 reading; both Test Review cycles; cohort-specific Spirit Realm teaching and reacquisition; up-to-six-item Warmup preview. |
| Curriculum identity | Checked-in `tests/fixtures/grade5-presentation.json` from source revision `a6df41d`; SHA-256 `78e8c614814cf34bf711e596ae5cfaaa7799d7d353416f6c1775d3f09648844f`. The deployed fixture asset has the same checksum. |
| Persistence promise | Session-only. Scores, answers, and reading recordings are not retained after the visit. |
| Child-data location | In-memory browser state only. No production source activation or Firestore persistence. |
| Current release protection | Independent stable site, exact candidate promotion, and non-expiring rollback site serving revision `a55d972ccb6f6db00c81b202d4e5bba16a889025`. |
| Known limitations | Development fixture; Grade 5 source registry remains inactive; Warmup and two-review-cycle persistence policies remain incomplete; current activity behavior is not independently product-approved. |

## Remaining release controls

The inventory is recorded, but its C0 exit gate remains open. Complete these protections before treating any route as a stable grade-specific destination:

1. Confirm that the documented stable URLs are the exact bookmarks used by the family.
2. Create a fresh Grade 2 backup before each persistence-affecting promotion and retain it privately.
3. Run an adult acceptance matrix for each activity. Keep incorrect or unresolved activities hidden or explicitly experimental.
4. Record a release manifest and canary observation for each future promotion.

Until those controls pass, proposed fixes should use the grade-specific candidate previews and the [family beta release manifest](./family-beta-release-manifest-template.md). Do not move Grade 2 off its current origin merely to match the other grades.
