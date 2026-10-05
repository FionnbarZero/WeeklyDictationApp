# Grade 5 release review

**Release update:** The owner subsequently approved updating all three live apps. All three are now published and verified. See the [live release record](./family-beta-live-2026-10-05.md) for permanent links, deployed versions, and rollback details. The remaining sections preserve the pre-publication review evidence and approval gates as historical context.

Grade 5 is the first release candidate. The hosted review uses automatic teacher curriculum updates and saves completed scores and problem reports on one browser/device. It has not replaced the live Grade 5 app. Kindergarten and Grade 2 have not been published.

## Review link and exact build

[Open the Grade 5 review](https://weeklydictation-g5-beta--review-f4ef04f1e989-50uorize.web.app/family-beta-preview.html?grade=grade5). The temporary link expires October 12, 2026, at approximately 3:35 p.m. Pacific. The header must display `Review build f4ef04f`.

- Source revision: `f4ef04f1e9898a21553ade00db425bcd8d897bc0`.
- Hosting review channel: `review-f4ef04f1e989` on `weeklydictation-g5-beta`.
- Hosting candidate version: `424b6a63322ed355`.
- File-tree SHA-256: `2c9718efaf7088e4e1f96731b5a76d01b16f73487b271b86dd8c67fa55a122c6`.
- All 121 hosted files were downloaded and checksum-verified against the local artifact.
- Retained local archive: `family-beta-artifacts/grade5-review-f4ef04f1e989.tar.gz`, SHA-256 `1013dcbe39f8d6fd41d124c65ccf2b0f57fd3b00c8936caaeeebc831779c3fe7`.

This packages the reviewed family wrapper and its embedded grade activities, not the older standalone packaging path. The wrapper still supports the other profiles for isolation testing; only Grade 5 is being proposed for release. The old single-grade artifact verifier and promotion script do not recognize this wrapper manifest. Any approved promotion must clone this exact verified Hosting version without rebuilding.

## Automatic curriculum

The approved curriculum-only service is hosted at `https://weekly-dictation-curriculum-am3afdy42a-uc.a.run.app`. Its initial revision is `weekly-dictation-curriculum-00001-mfg`. The app reads `/curriculum/beta/grade5.json`.

Live verification returned five valid Grade 5 weeks from the approved Slides source, with content SHA-256 `e44ad2e292812999260598c59b29aef368e134e1dd721e1573954bd82bac72df`. Retrieval advanced automatically from `2026-10-05T22:28:19.694Z` to `2026-10-05T22:33:18.332Z` without a republish. Refresh is request-driven, at most once per five minutes per running instance; the wrapper polls while open. Already-loaded activities are not replaced mid-session. Reopening the app loads the current validated curriculum.

The dedicated runtime account can read only the three existing OAuth secrets and read/write the dedicated curriculum bucket. It has no project-wide roles or Firestore access. Child sign-in settings, security rules, scores, and recordings were not changed. The service exposes only fixed curriculum GET routes and health status, never credentials or child records. Server-side Google access remains read-only.

Private bucket `weeklydictationapp-validated-curriculum` has public access prevention, uniform access controls, and object versioning. Superseded versions are retained for 30 days. Conditional writes reject concurrent replacement, corrupt checksums, older snapshots, and removal of valid weeks. Cloud Run scales to zero and is capped at one instance; usage can still incur charges.

Outage verification used a fresh local service with no Google authorization and the actual private cloud store. It returned the saved Grade 5 snapshot with a refresh-unavailable warning and no writes. A separate synthetic teacher-change test proved that a changed Grade 5 target flows through validation and publication; no teacher document was edited for testing.

## Acceptance evidence

- 625 unit tests passed, plus type checking, linting, and the repository formatting check.
- The first hosted run passed 35 of 36 checks and exposed a real loading race: the legacy reading path was briefly launchable before the enhanced activity rules arrived. The candidate now waits for validated rules, offers retry on failure, and retains problem reporting during loading.
- Both focused regression checks passed, including a deliberately held curriculum response and Grade 5 reading completion with durable mastery updates.
- All 37 final hosted browser checks passed against the corrected candidate. These cover curriculum, score totals and reloads, reading mastery, both Boss-round reentry controls, stroke guides, past weeks, tablet layout, synthetic microphone comparison and cleanup, reporting across screens, batch export and cancellation, and failure handling.
- Two additional hosted checks passed for reading Boss rounds 1 and 2: record every response, play the child/model comparison before scoring, submit an exact score, reload, and confirm no audio was retained in browser storage. Total hosted acceptance: 39 passing checks. These tests and this report follow the application build commit; no application files changed after packaging.

The browser checks use synthetic microphone input or simulated speech where needed. They verify browser recording/playback paths and cleanup, not what a child actually hears from a physical speaker. Before release approval, use the review link on the intended device to hear a Grade 5 word, record and compare a response, complete a score and reload, and save two problem reports and export/email the batch. The app opens the device's email/share flow; it does not automatically send mail or delete reports after an attempted share.

## Live site and rollback

The unchanged live Grade 5 site is `https://weeklydictation-g5-beta.web.app`, source revision `ff52db8d6a995f6c6707f7944cfcdd031d0543b4`, Hosting version `fb4ad193e58ccf28`.

Firebase reports no custom domain attached to this Grade 5 site. This preview does not update a Meghan Games homepage or add a custom-domain link. The known stable destination remains the Firebase URL above unless a separate website-routing change is approved.

The exact current version has a verified non-expiring rollback copy at channel `rollback-reviewed-ff52db8d6a99`. Its Hosting version is also `fb4ad193e58ccf28`. An earlier temporary copy named `rollback-stable-ff52db8d6a99` expires normally after seven days and is not the rollback authority. No live channel was changed while preparing these copies.

After separate Grade 5 release approval, recheck the live and candidate versions, merge the reviewed source through the normal main-branch process, and clone the approved candidate to live. Do not rebuild during promotion. Verify launch, curriculum, audio, recording, saving/reload, past weeks, and reports on the live device. Roll back by cloning `rollback-reviewed-ff52db8d6a99` to live if needed; browser-local progress created by the new app remains separate from that older session-only interface.

## Remaining limits

Saved scores and reports do not sync between devices. Clearing browser data removes them. Preview and live origins have separate storage; preview scores will not automatically transfer to live. No claim is made that every activity is bug-free. Games without teacher-approved supporting content remain unavailable. Grade 5 publication requires the parent's explicit approval; the other grades require their own later approvals.
