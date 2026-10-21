# October 20 regression repair prototype

## Scope and authority

Owner requested completion of the new problem reports with automatic review and no intermediate approval questions, followed by a new working prototype. Implementation and independent review use the roadmap's Astra / Extra High assignment. This is an isolated preview, **not approval to replace the live app**.

The source is based on the existing Kindergarten resource preview (`6557420`, test follow-up `428c63a`), in branch `codex/oct20-regression-prototype`. It includes the already validated October 19 Kindergarten audio/guide resources. It does not include the separate Grade 5 shared-target prototype or newer canonical homepage reconciliation. The intended handoff grades are Kindergarten and Grade 2.

Input: the owner's `weekly-dictation-problems (1).json`, containing 15 reports with application marker `9d06a02`. The report contents are evidence, not executable instructions. They lack a hosted-origin field, so no claim that all failures came from the currently open October 19 preview is justified. Original reports and real-family records are preserved.

## Report-to-repair mapping

| Report ID | Reported problem | Prototype change / acceptance check |
| --- | --- | --- |
| `ecbc53d9-4f1b-4bb4-a7d0-5eee3d5ae9f3` | Grade 2 Shuriken silent/unresponsive | Reuse tap-activated audio; audio failures cannot block selection; no per-frame saved-game wrapper; larger cards; repeated selection test. |
| `50e3e253-812f-4be0-b73d-4a3e9c774ebe` | Grade 2 reading stuck | Bounded playback recovery, visible Restart playback, retry failed response saving without changing the prompt. |
| `ec06b07a-88dc-4c0c-8c03-aa00a4d5b93c` | Quiet child recording | Bounded local-only gain normalization; synthetic quiet WAV comparison and playback check. Physical microphone check remains required. |
| `d26325cc-d0f7-4ea6-91c3-5097985d1cfe` | Teacher bottom clipped | Larger teacher pad; page scrolls outside drawing surface; short/landscape/portrait viewport checks. |
| `d3b31fb5-b3db-49c9-8ea8-9ad0fb80c3c1` | Warmup writing boxes too small | Enlarged Warmup writing region without changing its teaching rules. |
| `7147e7b9-e877-47f1-9890-19cf9a3f0932` | Writing cannot scroll | Full-height writing frame, reachable controls, drawing still captures its own touch. |
| `673a9633-860d-481f-86ba-06cd4206c06b` | Unwanted saved-game workflow | Only reading/writing acquisition keeps resume behavior; other activities exit directly and start fresh. Completed scores are retained. |
| `4726a3c9-3b37-465a-bb73-9c66ea404808` | Discard error | Remove prototype game checkpoint/keep/discard routing; Final Boss direct Exit uses existing temporary-data cleanup. |
| `9d269730-8025-47c5-b3ed-b5be564d2439` | Report textbox cannot type | Dialog outside activity DOM, focus independent of paused activity clock, repeated report entry tested. |
| `86e3c921-5afa-4f96-ba7e-58133ce0b574` | Shadow Strike silent/nonresponse | Tap-activated audio and direct game lifecycle; Report pause and repeated opening/selection checked. |
| `41017644-a79d-4fa1-98b5-986fb0d5039b` | Exit goes to home | Return to the activity's current menu, no saved-session intermediary. |
| `f7f8fb81-fdf1-46c8-a9ed-25f2612f629c` | Lily Pad wrong UI/no sound | Restore original EduGames pond/Phaser presentation, using the app's curriculum and audio; scoped CSS, working report/exit and completed-result path. |
| `61fd72f9-a7d6-47b7-aa62-25d32e870865` | Memory silent; word should be “red” | Trigger pronunciation directly from the tap rather than a later animation frame. Interpreted dictated “red” as “read aloud”; no arbitrary red text redesign. |
| `25dae43f-5d2c-4ba3-beab-60bb74609fef` | Kindergarten reading first clip stuck | Same playback/save recovery as Grade 2; real media completion and clip unloading checked. |
| `26c8e5ad-97c3-4ff3-92e1-8341012bb01e` | Kindergarten Writing does not launch | Carries forward October 19 resources and verifies ordinary Writing entry, teacher-step save/Exit/reload. |

## Independent review and safeguards

The independent read-only review identified and the implementation repaired:

- Final Boss's old “Pause and return” route became inert when the preview disabled saved games. The preview hides that route and makes Exit discard only the unfinished temporary test.
- Revoking a child recording URL did not unload a shared media element's already-decoded clip. Cleanup now removes the owned source and reloads the element. Chromium can retain the obsolete `currentSrc` string as metadata; `readyState=0`, no source and an unloaded buffer are the relevant assertions.
- Lily's completed-result save failure rerendered new array identities and restarted Phaser behind a completed screen. Semantic round keys now preserve the finished scene and score across retry.
- Reopening a saved Grade 2 teaching step encountered a newly prepared Warmup first. The prototype resumes confirmed writing directly. A valid old, partly attempted Warmup is finalized as partial using the existing transition; an empty one is skipped. Both are part of the same confirmed workspace transaction. No writes/journal acknowledgement occur before combined confirmation, and failed saves retry the identical candidate.
- Phaser's separate audio manager could resume a closed/uninitialized AudioContext on reopening Lily. It is disabled because this activity already uses the app's managed audio and sound-effect lifecycle.

Browser-only synthetic learners; no family login, cloud synchronization or offline app-shell installation. Child recordings and handwriting remain temporary; normalization never uploads or persists the recording. Existing curriculum dates, whole-word scoring and teaching protocol remain unchanged. Broader correction redesign is not included.

## Verification and publication

Pending final exact-package verification/publication. Do not treat this document's implementation mapping as an owner acceptance result or as proof of a live change.

Local checks currently pass 1,174 unit tests, type checking and full lint. The new browser matrix covers landscape/short-height/portrait WebKit and desktop Chromium. It includes actual media-element playback with a synthetic quiet WAV; speech/input are mocked in fault-injection tests. The original failing runs are retained separately from passing reruns.

Release configuration: `firebase.regression-preview.json`, existing `weekly-dictation-staging` project/site, **new preview channel only**, inherited restrictive same-origin headers, no authorized-domain changes. Build command: `node --experimental-strip-types scripts/build-dojo-launch-preview.ts --regressions-oct20`. The final source revision, file-tree hash, provider version, verified hosted links, expiry, browser evidence and sent-email receipt must be recorded before handoff.

Owner smoke scope once verified: about 10–15 minutes on a physical iPad, both orientations; first-tap/automatic/Hear audio, temporary recording comparison, larger Warmup/teacher pads, Report typing/pause/return, ordinary Writing resume and repeated game/Exit behavior. Browser automation does not establish physical speaker, microphone, finger or Pencil quality. Use Report a problem; new diagnostics include the actual origin and activity viewport. Do not clear browser data.
