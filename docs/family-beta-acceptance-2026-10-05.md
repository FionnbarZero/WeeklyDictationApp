# Family beta reconciliation and acceptance report

## Decision

Review the three local family previews before any production change. This is a review candidate, not a declaration that the entire app is production ready. Existing production data, authentication, security rules, and deployments have not been changed.

The quickest finishing route is to keep the existing grade-specific practice engines, share family profiles and a completed-result ledger, validate the teacher sources automatically on a server, and release one grade at a time. A UI redesign, new scoring rubric, and unsupported games are not prerequisites for this review.

## Open the previews

Run `npm run build:reconciliation`, then `npm run preview:reconciliation` from the repository. The server is local to this computer.

| Grade | Review link |
| --- | --- |
| Kindergarten | [Kindergarten preview](http://127.0.0.1:5192/family-beta-preview.html?grade=kindergarten) |
| Grade 2 | [Grade 2 preview](http://127.0.0.1:5192/family-beta-preview.html?grade=grade2) |
| Grade 5 | [Grade 5 preview](http://127.0.0.1:5192/family-beta-preview.html?grade=grade5) |

These three routes share one build and use synthetic profiles. Scores persist in this browser on this origin, not across devices. Clearing browser data removes unsynchronized device results. The interface explicitly labels that limit. Do not use these unauthenticated local previews as the family's production app.

## Live and repository reconciliation

Read-only release checks found three different delivery states:

| Surface | Live revision observed | Previous limitation |
| --- | --- | --- |
| Kindergarten Firebase beta | `21fd1a1a0e60f429f4e6bd0da26833954e244193` | Session-only results |
| Grade 2 GitHub Pages | `ff52db8d6a995f6c6707f7944cfcdd031d0543b4` | Live manifest declares durable writing and reading metadata; this history differs from main |
| Grade 5 Firebase beta | `ff52db8d6a995f6c6707f7944cfcdd031d0543b4` | Device-only result behavior |

The starting checkout was clean at `5e554ba`. Reconciliation is isolated on `codex/family-beta-reconciliation`. The candidate merges the safe-restore/hardening branch and selectively brings in the modular Ninja Skills library. Existing independent release tooling is retained; it is not automatically switched to deploy this candidate.

## Authoritative curriculum

Only the three owner-specified Google documents supply preview vocabulary. Source reads were performed on October 5, 2026. The bundled snapshots contain the relevant curriculum, not child records or recordings.

| Grade | Source and observed state |
| --- | --- |
| Kindergarten | [Teacher Sheet](https://docs.google.com/spreadsheets/d/1lBWZeDhb_IIhBJ8SIzZts637JBS6HETh6uFblNNTOxA/edit). Week 8, October 5: writing 牛、羊; reading 猫、狗、鸟. Source modified October 1. |
| Grade 2 | [Teacher Slides](https://docs.google.com/presentation/d/10gpdTFqwBhWf9pD9HzF8AkD9Zyg7nBUSeTCGXuS8ky4/edit). October 5–9 has nine writing targets and no Tier 2 list. No reading list is fabricated; previous reading cohorts remain available. Source modified October 2. |
| Grade 5 | [Teacher Slides](https://docs.google.com/presentation/d/1-CBvr9gGWsj0yQj1ArmHz3AvtgB0brKFipe90NY_9RI/edit). The newest dated heading is September 28–October 2, despite an October 4 file edit. Its repeated vocabulary holds progression instead of manufacturing a new cohort or confirmation mismatch. No October 5 heading is invented. |

Empty, undated, or malformed source weeks are excluded and reported. Grade 5's oldest oversized baseline remains excluded by the existing validator. Repeated source content does not silently advance Grade 5's learning stages.

The automatic service is implemented in `backend/curriculumServer.ts`. It refreshes on startup and, while requested, at five-minute intervals. Validated snapshots are published atomically. A failed refresh, empty response, or loss of an existing valid week retains the last valid snapshot. The client checks grade, source identity, and checksum. A server warning appears in Parent controls.

The local build uses checked snapshots. Live automatic Google refresh is **not activated**: a server-side read-only Google authorization and a same-origin hosting route still need configuration. No manual weekly import is required by the intended service. The bootstrap JSON script is only for recovery and initial seeding.

## Changes prepared

- Shared child selection, grade selection and reversal, deactivation, parent-control entry, past-week selection, and privacy-safe problem-report copying.
- Completed writing, reading, and supported game results use an immutable ledger, separate from unfinished activity state. Repeated sessions count independently; retrying the same result does not add another score.
- Daily totals are summed correct responses over attempted responses, divided at midnight in `America/Los_Angeles`, including daylight-saving changes. Writing, reading, and games retain their own result channel and activity label.
- Each child's older Grade 2 activity storage is namespaced in the preview. Existing app browser data is not reset or overwritten by preview practice.
- A durable per-result outbox supports retry and avoids array-overwrite loss between simultaneous tabs. Cloud acknowledgement requires matching readback. Failed or corrupt saving is shown explicitly, not as success.
- Candidate cloud storage is family scoped, create-only, and rejects changes, cross-family access, malformed scores, and unexpected recording fields. Candidate rules were exercised only in the local emulator.
- Child microphone recordings remain in session memory for comparisons. The shared score contract contains no recording, answer text, drawing, child name, or email.
- Misleading session-only development labels are hidden or corrected in the family preview. Unavailable activity buttons are hidden rather than presented as working activities.
- Shared Memory Lanterns and Shadow Strike Dojo use validated teacher vocabulary. Four other modular games remain unavailable when their required approved meanings, pinyin, or sentence data are missing.

The teacher documents establish target content but do not provide a complete scoring rubric. Existing tested activity rules are retained, including the distinction between diagnostic teaching trials and score-bearing attempts. This report does not claim a newly teacher-approved rubric.

## Verification

Verification results are recorded below.

| Check | Result |
| --- | --- |
| Unit and architecture suite | 607 passed |
| Existing browser regression suite | 57 passed in a clean run with source edits frozen |
| Family preview acceptance suite | 15 passed against the built preview |
| Existing built public preview suite | 3 passed |
| Firestore emulator | 9 passed, including independent-client readback and unauthorized-write rejection |
| Type check and lint | Passed |
| Repository format check | Passed |
| Standard production build and initial bundle budget | Passed; 531100 JavaScript bytes against the original 550000-byte limit; 42745 CSS bytes against 60000 |
| Three-route reconciliation preview build | Passed; final rebuild performed after code changes |

The new browser acceptance checks cover each grade's loaded teacher source, past-week route, tablet layout, repeated game totals, reload persistence, child separation, writing final-review scores, reading result separation, and microphone-denial recovery. Additional checks cover a failed curriculum request and retry, corrupt-storage preservation, and grade promotion/reversal. Browser speech and microphone failures are simulated in relevant tests; this is not a substitute for hearing the audio and using the microphone on the actual iPad.

Manual desktop inspection also confirmed that all three built hubs load and that Shadow Strike opens with teacher-word choices. Memory Lanterns has complete round-and-save coverage for each grade; Shadow Strike still needs a complete real-device playthrough. Intermediate test runs exposed missing merge-era UI hooks, a missing deterministic fixture setup, simulated speech missing its start event, and development hot-reload during an edit. Those causes were corrected or isolated before the clean passes above; no failing assertion was removed to obtain them.

The cloud tests use independent clients against the local emulator, not real production sign-in on two devices. Cloud production permissions, parent sign-in persistence, and production hosting have not been accepted by those tests. See the [Firebase rules list reference](https://firebase.google.com/docs/reference/rules/rules.List) for the list validation operations used by the candidate contract.

## Remaining limitations and release gates

1. **Cloud setup requires approval.** Configure the shared family account, production authentication settings, App Check behavior, and candidate result rules only after approval. Use one shared family entry origin for the intended once-per-device sign-in; the current separate hosting origins do not share browser sign-in storage. Then run a real parent sign-in and two-device save/reload check. No automatic production changes have been made.
2. **Automatic Google refresh needs server authorization and hosting.** Keep credentials server-side. Prove a real teacher update reaches the validated endpoint and that an outage retains the last good lesson before deployment.
3. **Grade 5 extended writing mastery remains hidden.** Its pre-existing standalone writing-warmup launch is not connected; reading mastery and cohort-specific writing reteaching/review remain available. Do not represent that hidden route as completed.
4. **Adaptive practice state is not fully cross-device reconciled.** This candidate's new cloud contract covers completed result summaries. Existing grade-specific adaptive/mastery state still differs between engines; Kindergarten and Grade 5 session-local practice state is not claimed to sync. Validate the required continuity before calling the family beta finished.
5. **Four modular games need approved content.** Do not replace missing meanings, pinyin, or sentence material with testing placeholders. Shadow Strike's larger game engine is lazy-loaded; real-device performance still needs a check.
6. **Dependency and runtime review remains a release gate.** The computer runs Node 26 while the repository declares Node 24. Builds and tests ran successfully here, but CI should run on the declared version. The installed dependency audit reports security advisories, including the existing Firebase gRPC constraint; no unreviewed forced downgrade was applied.
7. **No data reset or backup claim.** Production data was not reset. Before any approved reset or migration, take and verify a restorable backup of the exact production targets. The earlier permission to start fresh was not used to bypass the later approval boundary.

## Smallest route to release

First review these local previews and the explicitly hidden activities. Next approve cloud/authentication and automatic-source configuration as a separate step, then verify the family on two real devices. Resolve any core dictation, score-saving, or privacy failures before release; keep optional unsafe activities hidden with their reasons recorded.

For each grade, separately request deployment approval with its immutable build identity, expected changes, known limitations, and rollback target. After approval, check curriculum, one completed score, reload, a previous week, audio playback, and microphone comparison on the actual production device. Do not deploy all grades under one blanket approval.
