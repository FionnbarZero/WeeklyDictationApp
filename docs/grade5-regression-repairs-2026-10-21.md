# Grade 5 reported-problem repair prototype — October 21, 2026

## Scope and boundaries

Owner requested all applicable Kindergarten/Grade 2 problem reports be repaired for Grade 5 and confirmed Astra · Extra High. This is an isolated working prototype, not a canonical release or a completed curriculum migration. The original 15 reports remain preserved. No family records, reports, authentication, security rules, or existing hosting channels may be reset or replaced.

Application candidate: `13f6c3038793ab7f49d21d8b4df88397db2cd61a`, **Grade 5 regression repairs / Prototype 2**, package tree `deae6630f4fae529f6c805e6c6b71c5ce7a2059dcf3e5eefbe8fb7eb0398eec1`.

Two linked entries share one isolated website:

- `/family-beta-preview.html?grade=grade5`: ordinary Grade 5 activities using retained validated curriculum. Enlarged Warmup, reading recovery, recording playback, Report, games and direct Exit can be checked here.
- `/grade5-oct23-preview.html`: approved eight-word Practice Your Ninja Skills / Final Boss prototype. Reading and writing use the same eight PDF words, Shuriken retains the approved green-hint/retry, Sushi retains the eight source sentences. Reading acquisition now also resumes its confirmed browser checkpoint.

The eight words are 或者、了解、完、兴奋的、告诉、沟通、快速地、有意思. The ordinary curriculum importer is **not** silently changed to this PDF list. Grade-native strategies, timer/scoring and the approved teacher/acquisition appearance remain intact. The regular beta homepage's saving notice and redundant outer Activities / Ninja Skills / Progress navigation are absent, while Report and parent score access remain.

## All 15 original reports accounted for

| Report | Grade 5 treatment / verification boundary |
| --- | --- |
| 1. Shuriken silent/unresponsive | Shared gesture-primed sound and safe input despite optional audio rejection; repeated Grade 5 pairs and large characters tested. Physical audible quality remains a device check. |
| 2. Reading stuck on first/expanded target | Shared comparison watchdog, visible Restart playback, retryable failed save, no advancement before confirmation. Grade 5 injected-stall/recovery coverage. |
| 3. Child recording too quiet | Bounded temporary-only gain with silence/peak protection; real synthetic WAV playback checked. Does not claim exact loudness matching to the model voice. |
| 4. Teacher bottom clipped | Enlarged scrollable layout with reachable controls across desktop and three tablet viewports. Physical touch/Pencil remains a device check. |
| 5. Warmup boxes small | Grade 5 native Warmup uses full-frame presentation, with portrait two-column treatment for four characters. Drawing squares must exceed 175px in each tested viewport. |
| 6. Teacher cannot scroll | Same layout repair as 4; scroll outside the drawing canvas, retain drawing behavior. |
| 7. Only reading/writing acquisition should persist | Games remain session-only and exit directly. Existing obsolete game checkpoints are not deleted or adopted. Native acquisition remains; approved eight-word reading now preserves confirmed browser progress. |
| 8. Discard error / extra step | Non-acquisition Exit returns directly; no saved-game discard dialog required. Old records remain untouched. |
| 9. Report input unusable | Portal/focus fixes, repeated editable reports, checkpoint preservation and usable Return verified. |
| 10. Shadow Strike audio/input | Grade 5 repeated responses, Report pause and direct Exit; gesture audio reused. Physical sound pending. |
| 11. Exit returns to wrong menu | Grade 5 games and Final Boss return to their respective native menus, without Your paused work. |
| 12. Lily Pads UI/audio | Kindergarten-only activity; not applicable to Grade 5. No unrelated activity added. |
| 13. Memory Lanterns silent | Immediate tap narration path; Grade 5 repeated play / Report / Exit. Physical sound pending. |
| 14. First reading clip stuck | Real synthetic Grade 5 WAV playback advances; unreviewed clip cleanup and object-URL revocation verified. Same recovery controls as 2. |
| 15. Writing launch broken | Native Grade 5 launch, teacher step and reload/resume verified; approved eight-word full teacher/acquisition/next-word flow remains separately tested. Kindergarten-specific 虫 resource is not substituted into Grade 5. |

## Review failures found and repaired

The first candidate `dd305df` was withdrawn, not published. Independent review found two introduced P2 defects in the new reading adapter:

1. Reopening the store on Done let a stale zero-score tab finalize another tab's newer work. The mounted visit now retains its original store and compare-and-swap protection. A permanent two-tab test preserves the newer checkpoint byte-for-byte and verifies that tab can continue.
2. A first-save storage failure could throw during initialization and blank the activity. Initialization is caught inside the activity, preserving Report, Return and Retry without clearing records. Tests cover one-shot faults; independent diagnosis also covered persistent faults and an unrelated sentinel.

Both were independently closed on `45410cf0a945f08c8b961b55fa583f42b8af8fc2`. Final `13f6c30` changes only an erased generic/type import and import sorting. Failed traces are retained alongside passing closure evidence; no uninterrupted-green claim is made. The first Warmup test also assumed four boxes despite the actual settled target having two; it now waits for prompt completion, accepts valid one–four counts and measures every actual pad, without modifying curriculum.

## Verification and publication

Final candidate passes 1,180 unit tests, type checking, repository lint/format, production build and unchanged performance budgets (549,995 / 550,000 initial JavaScript bytes). Full Grade 5 browser and approved eight-word compatibility matrices, hosted verification, publication receipt and email receipt are recorded below only after they complete.

Browser tests cannot establish physical iPad automatic speech, recording loudness, finger/Pencil precision or real-device swipe comfort. Preview progress is browser-only, no family account/cloud synchronization or offline installation. Recordings and handwriting stay temporary. A working-prototype owner check precedes integration into the canonical app and its protected release gates.

### Published, verified and emailed

- [Regular Grade 5 activity repair tests](https://weekly-dictation-staging--grade5-repairs-oct21-v1-6n48b1zs.web.app/family-beta-preview.html?grade=grade5)
- [Approved eight-word practice and tests](https://weekly-dictation-staging--grade5-repairs-oct21-v1-6n48b1zs.web.app/grade5-oct23-preview.html)

Expires **October 28, 2026, 12:29 a.m. Pacific** (`2026-10-28T07:29:21.864341200Z`). Firebase preview channel `grade5-repairs-oct21-v1`, version `89e9d29d4320ee16`. All **185 public files / 1,110 headers** match the frozen package; the root redirects to the Grade 5 repair entry. All **14 prior channel releases/expiries** and canonical `9d06a02`'s exact manifest remain unchanged. No authentication-domain mutation was requested by deployment.

Final local browser gates: **48 Grade 5 repair cases** across four viewports plus **18 approved eight-word compatibility cases**, all passing. Hosted gates: **12 Grade 5 activity cases**, **six eight-word game/reading compatibility cases**, and **two real navigation/build/report checks**, all passing. The extra navigation script initially referenced a nonexistent CSS selector; it was corrected to the existing banner without an application change, then passed on desktop and portrait WebKit. No failed application acceptance was hidden or waived.

Gmail send and metadata readback confirm **SENT**, message/thread `1a15d611401a6840`, to the previously confirmed owner address. Email includes both entries, exact build, preview status/expiry, boundaries and a 10–15 minute physical-iPad checklist. Retained package, failed review traces, passing closure, screenshots, full source/check identities, provider before/after, publication verifier and email receipt are under `family-beta-artifacts/prototypes/grade5-repairs-13f6c30/` in the managed Grade 5 worktree.

**Next: owner physical-iPad working-prototype check**, not another deployment or live handoff. Check sound/quiet recording, finger/Pencil, portrait/landscape, scrolling outside drawing pads, Exit/reopen reading and writing, repeated Shuriken/Shadow/Memory/Sushi and editable Report. Do not clear browser data. After acceptance, freeze this interaction reference and reconcile current main with compatibility, independent integration, authenticated persistence/offline/cross-device/recovery and protected release gates. Kindergarten/Grade 2's previously published prototype checks remain separate.
