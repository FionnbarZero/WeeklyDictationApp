# Family beta reconciliation and acceptance report

## Decision

Review the three local family previews before any grade deployment. This is a review candidate, not a declaration that the entire app is production ready. Child data, child sign-in settings, Firestore security rules, and grade deployments have not been changed. The separately approved Google Sheets API and server-side read-only source authorization are now enabled and verified.

The parent has accepted using one device for now. Completed results and problem reports may remain browser-local for that limited beta; cloud synchronization is not promised. The parent chose to wait for automatic Google updates before publication. Each grade still requires its own deployment approval.

The quickest finishing route is to keep the existing grade-specific practice engines, share family profiles and a completed-result ledger, validate the teacher sources automatically on a server, and release one grade at a time. A UI redesign, new scoring rubric, and unsupported games are not prerequisites for this review.

## Open the previews

Run `npm run build:reconciliation`, then `npm run preview:reconciliation` from the repository. The server is local to this computer.

| Grade | Review link |
| --- | --- |
| Kindergarten | [Kindergarten preview](http://127.0.0.1:5192/family-beta-preview.html?grade=kindergarten) |
| Grade 2 | [Grade 2 preview](http://127.0.0.1:5192/family-beta-preview.html?grade=grade2) |
| Grade 5 | [Grade 5 preview](http://127.0.0.1:5192/family-beta-preview.html?grade=grade5) |

These three routes share one build and use preview profiles. Scores persist in this browser on this origin, not across devices. Clearing browser data removes device results and reports. The interface explicitly labels that limit. These local addresses cannot be emailed for use on another device; hosted links are not yet published.

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

The local build uses checked snapshots. Live automatic Google refresh is **not activated**: server-side read-only Google authorization is verified, but the hosted curriculum endpoint and app routing still need configuration. No manual weekly import is required by the intended service. The bootstrap JSON script is only for recovery and initial seeding.

After explicit parent approval, the Google Sheets API was enabled in `weeklydictationapp` and the existing server connection was extended with read-only Sheets access while preserving read-only Slides access. All three sources were validated before storing a new refresh-token version in Secret Manager; previous versions were retained. An independent readback using the saved connection verified five valid Kindergarten weeks, six Grade 2 weeks, and five Grade 5 weeks. Credentials were not written to repository files or browser bundles. Grade 5's parser now ignores formatting strings that previously confused live table extraction. The existing cloud service is the importer, not the new curriculum endpoint; hosting and durable last-good-snapshot storage still need preparation before claiming automatic refresh is live.

## Changes prepared

- Shared child selection, grade selection and reversal, deactivation, parent-control entry, past-week selection, and privacy-safe problem-report copying.
- Completed writing, reading, and supported game results use an immutable ledger, separate from unfinished activity state. Repeated sessions count independently; retrying the same result does not add another score.
- Daily totals are summed correct responses over attempted responses, divided at midnight in `America/Los_Angeles`, including daylight-saving changes. Writing, reading, and games retain their own result channel and activity label.
- Each child's older Grade 2 activity storage is namespaced in the preview. Existing app browser data is not reset or overwritten by preview practice.
- A durable per-result outbox supports retry and avoids array-overwrite loss between simultaneous tabs. Cloud acknowledgement requires matching readback. Failed or corrupt saving is shown explicitly, not as success.
- Candidate cloud storage is family scoped, create-only, and rejects changes, cross-family access, malformed scores, and unexpected recording fields. Candidate rules were exercised only in the local emulator.
- Child microphone recordings remain in session memory for comparisons. The shared score contract contains no recording, answer text, drawing, child name, or email.
- Misleading session-only development labels are hidden or corrected in the family preview. Unsafe legacy activities remain hidden; games awaiting approved teacher content remain visible with a disabled button and an explanation.
- Shared Memory Lanterns and Shadow Strike Dojo use validated teacher vocabulary. Four other modular games remain unavailable when their required approved meanings, pinyin, or sentence data are missing.

The teacher documents establish target content but do not provide a complete scoring rubric. Existing tested activity rules are retained, including the distinction between diagnostic teaching trials and score-bearing attempts. This report does not claim a newly teacher-approved rubric.

## Reported screen fixes

The October 5 follow-up applies to the three family-preview routes above, not to the separately deployed grade sites.

| Report | Preview behavior and acceptance limit |
| --- | --- |
| Silent audio and missing microphone controls | Game playback now waits for actual completion. Speech cannot report success without starting. Sky Writing starts its word automatically. Reading offers a way to stop stalled teaching audio and start recording, clearer permission guidance, and microphone retry. Empty recordings are rejected. The shared sound check exercises a recorded word and temporary recording comparison. Actual speaker output and the user's microphone still require a check in their separate browser. |
| Previous relevant targets and integrated games | Games appear inside each grade's Ninja Skills path and in the outer shortcut. Writing and reading use separate target pools from the latest earlier week containing that channel's targets. Game cards identify their source week. Grade 5's existing test-review assessments keep their own assigned cohort; its game cards can therefore name a different, earlier teacher week. |
| Missing approved game content | Pinyin, meaning, and sentence activities remain visibly unavailable when required teacher-approved metadata is missing. No testing placeholders were substituted. |
| Grade 2 September 21 reading | The authoritative snapshot and fresh preview both contain all seven reading targets: 城市、上班、公园、图书馆、散步、漂亮、各种各样的. A regression check covers that historical selection. The earlier missing display was not reproduced in a fresh browser; this is verified availability, not a confirmed diagnosis of the original session. |
| Reenter the Dojo | Available for writing and reading in the relevant Boss sections, including both Grade 5 review rounds. Re-entry starts the entire selected cohort again with a new attempt identity. Existing completed scores are not overwritten. Removed from the family-preview Spirit Realm. |
| Kindergarten Final Boss | Uses the latest unit whose teacher-defined review week has arrived, excluding current-week teaching targets. On October 5 this is all 14 Unit 1 writing characters and all 9 Unit 1 reading targets, not Unit 2's new words. Both test launch paths and the displayed cohort use the same selection. Future review weeks cannot leak backwards into an earlier lesson. |
| Thin pen | Student ink is half-width in the shared handwriting and Stroke Order surfaces. Printed guides are unchanged. |
| Grade 5 Stroke Order | Current and historical supplied writing targets have stroke guides. Unsupported future cohorts fail closed rather than silently dropping words. |
| Spirit Realm | Separate writing and reading queues use the existing adaptive selector and transitions: up to 16 unique targets, 8/4/4 allocation with shortage filling, two correct recent-entry responses, three consecutive correct recovery responses, active-target suppression, and rotation before reuse. Warmup and supported modular-game assessments persist on this preview device, isolated by child, grade, and channel. Browser locks serialize simultaneous-tab writes. See the mastery continuity limit below. |
| Choppy Shadow Strike movement | Projectile animation now inherits its calculated target coordinates. Target movement pauses during a strike instead of snapping to its unanimated position. The moving projectile no longer uses a blur-producing shadow filter. Real-device smoothness still needs review. |
| Reporting on every screen | A reporting bar remains outside the embedded activity and error boundary, with an independent reporter on each standalone grade page. Inside the sound-check dialog, the controls move into the dialog so they remain usable. Controls sit in the page layout rather than covering activity buttons. Reports retain explicit grade, route, activity, week, and available prompt context locally; copy/export survives reload. No screenshots, microphone recordings, or child answers are captured automatically. |
| End of session report bundle | Save individual reports while playing, then choose Finish session & email reports. The complete saved batch opens in the device's file-sharing menu when supported, or in one email draft. Large batches fall back to a downloaded file for attachment. The parent chooses the email app and recipient and presses Send. Reports remain stored after sharing, cancellation, or email failure; earlier saved reports are included and nothing is automatically marked sent. |

### Short browser acceptance check

Open each grade in the separate browser you normally use and refresh any tab left open from the earlier build. Use **Check sound & microphone** first. Confirm that you hear the test word, see the recording indicator, and hear your recording followed by the example. Then check one Dojo activity, one previous-week game, Boss re-entry, and Spirit Realm. Reload after a completed activity to confirm its score remains. Use **Report a problem** for any remaining issue. At the end, choose **Finish session & email reports**, email the saved batch to yourself, and attach it in this chat from your computer. Actual email delivery requires the device's configured email or sharing app and has not been sent during testing.

No real microphone was accessed during automated testing: the browser recording check uses a synthetic microphone. Recordings remain temporary and are released when the check closes.

## Verification

Verification results are recorded below.

| Check | Result |
| --- | --- |
| Unit and architecture suite | 622 passed, including live-format Grade 5 parsing and read-only curriculum consent scopes |
| Existing browser regression suite | 57 passed in a clean run with source edits frozen |
| Family preview acceptance suite | 35 passed after the Grade 5 parser correction |
| Final reporting safety recheck | 12 passed after adding large-batch export-failure coverage; includes retained reports, cancelled sharing, all three standalone grade pages, and sound-check dialogs |
| Existing built public preview suite | Earlier foundation run: 3 passed; not rerun for this screen-fix pass |
| Firestore emulator | Earlier foundation run: 9 passed, including independent-client readback and unauthorized-write rejection; no rules or cloud contract changes in this screen-fix pass |
| Type check and lint | Passed |
| Repository format check | Passed |
| Standard production build and initial bundle budget | Passed; 534570 JavaScript bytes against the original 550000-byte limit; 42745 CSS bytes against 60000 |
| Three-route reconciliation preview build | Passed; final rebuild performed after code changes |

The new browser acceptance checks cover each grade's loaded teacher source, past-week route, tablet layout, repeated game totals, reload persistence, child separation, writing final-review scores, reading result separation, and microphone-denial recovery. Additional checks cover a failed curriculum request and retry, corrupt-storage preservation, and grade promotion/reversal. Browser speech and microphone failures are simulated in relevant tests; this is not a substitute for hearing the audio and using the microphone on the actual iPad.

The reviewed preview's asset manifest SHA-256 is `ff4e14041ecd3de8365f1020aa2fae666637f081338143fff96bc0021e02489a`. This identifies the local review build, not a deployed release. The screen-fix and authorization sources accompany this report on `codex/family-beta-reconciliation`; a GitHub push is not a deployment or a merge into `main`.

Manual desktop inspection also confirmed that the rebuilt Grade 5 hub and Spirit Realm menu render. A final visual check exposed a Grade 2 build-loading defect: the conditional lazy import loaded the new JavaScript without its stylesheet dependencies. Separate lazy callbacks now preload the correct files; the acceptance suite checks the menu background in every grade. Memory Lanterns has complete round-and-save coverage for each grade; Shadow Strike still needs a complete real-device playthrough. The screen-fix regression run required two precise test updates: distinguish the normal recording button from the new stop-audio shortcut, and expect the expanded microphone-permission guidance. The Shadow Strike geometry check clicks its intentionally moving target without waiting for animation stability, then asserts the actual calculated aim and paused-target state. No functional assertion was removed to obtain a passing result.

The cloud tests use independent clients against the local emulator, not real production sign-in on two devices. Cloud production permissions, parent sign-in persistence, and production hosting have not been accepted by those tests. See the [Firebase rules list reference](https://firebase.google.com/docs/reference/rules/rules.List) for the list validation operations used by the candidate contract.

## Remaining limitations and release gates

1. **Cross-device cloud setup requires approval.** Configure the shared family account, production child authentication settings, App Check behavior, and candidate result rules only after approval. Use one shared family entry origin for the intended once-per-device sign-in; the current separate hosting origins do not share browser sign-in storage. Then run a real parent sign-in and two-device save/reload check. These changes are deferred for the approved one-device beta.
2. **Automatic Google refresh still needs hosting.** Server authorization is verified. Keep credentials server-side, configure durable last-good-snapshot storage, and prove a real teacher update reaches the validated endpoint and that an outage retains the last good lesson before deployment.
3. **Mastery history has a preview continuity boundary.** Grade 5 writing mastery is now available through the shared preview adapter. That adapter stores new per-target warmup assessments locally; it does not migrate the older grade-specific mastery records or reconstruct per-target final-review outcomes from aggregate completed scores. Targets without imported evidence enter as unassessed recent entries, not as invented correct or incorrect results. Complete evidence integration and migration before claiming full continuity with older practice history.
4. **Adaptive practice state is not cross-device reconciled.** This candidate's cloud contract covers completed result summaries, not the new preview mastery records or every unfinished grade-specific session. Preview mastery survives reload on the same origin and browser. Validate the required cross-device continuity before calling the family beta finished.
5. **Four modular games need approved content.** Do not replace missing meanings, pinyin, or sentence material with testing placeholders. Shadow Strike's larger game engine is lazy-loaded; real-device performance still needs a check.
6. **Dependency and runtime review remains a release gate.** The computer runs Node 26 while the repository declares Node 24. Builds and tests ran successfully here, but CI should run on the declared version. The installed dependency audit reports security advisories, including the existing Firebase gRPC constraint; no unreviewed forced downgrade was applied.
7. **No data reset or backup claim.** Production data was not reset. Before any approved reset or migration, take and verify a restorable backup of the exact production targets. The earlier permission to start fresh was not used to bypass the later approval boundary.

## Smallest route to release

For the approved one-device scope, leave child authentication and production data unchanged. Use the verified read-only Google connection to configure and verify the automatic curriculum endpoint before publication. Any new production service permissions require a specific review. Package the exact reviewed family-preview experience for its hosting destination; the older single-grade packaging command does not automatically include this wrapper. Resolve any core dictation, score-saving, or privacy failures before release; keep optional unsafe activities hidden with their reasons recorded. Cross-device synchronization remains a later, separately approved change.

For each grade, separately request deployment approval with its immutable build identity, expected changes, known limitations, and rollback target. After approval, check curriculum, one completed score, reload, a previous week, audio playback, and microphone comparison on the actual production device. Do not deploy all grades under one blanket approval.
