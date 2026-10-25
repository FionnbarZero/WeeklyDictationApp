# Regression audit — October 25, 2026

**Not a clean audit.** Published combined Prototype 3, application `1b3e4f3777233ea6bf6c60fbc07c7792a8d4e817`, has one newly introduced audio regression and one inherited audio-lifecycle defect. Hold another acceptance handoff until both are repaired and covered by regression tests. No application code, hosting, family records or teacher sources were changed during this audit.

## P1 — a silent unlock clip can falsely complete the real word

**Trigger:** media playback was initially denied; it becomes available on a later genuine tap, while the word recording download is slow. Reproduced in Kindergarten → Ninja Skills → Shadow Strike Dojo → Replay word. The same shared recorded-audio path is used elsewhere.

**Observed:** the 204-byte silent unlock clip starts and ends; the actual word never receives a play call, yet the app displays **“Word played automatically.”** Tapping Replay word a second time plays the actual word. With a controlled 2.5-second download delay and initial media denial, this reproduced **three times in Chromium and three times in WebKit**, all in fresh contexts on the published website. Native media playback is retained after the initial denied phase; speech fallback is deliberately denied to distinguish real recordings. An earlier 600ms-delay probe also reproduced it in WebKit but not Chromium. These are controlled browser reproductions, not a claim that the owner's physical iPad cause is established.

**Cause:** [promptAudio.ts:358](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/audio/promptAudio.ts:358) attaches `playing`/`ended` listeners to the shared activated audio element before the new recording fetch completes at [line 375](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/audio/promptAudio.ts:375). The element may still be playing its silent gesture primer. Its `ended` event enters `finish`, resolves the word's completion and aborts the download. Nothing checks that the event belongs to the intended recording.

**Classification:** introduced by the asynchronous full-recording fetch in `e0456f9`, retained in `1b3e4f3`. The retained `7b33d7b` predecessor, served locally with the same blocked-then-allowed/delayed-download driver, assigns the real recording immediately. Chromium genuinely plays and ends the word before reporting success; WebKit remains in the playing/loading state during the delayed sample. Neither falsely reports a completed word with only a primer event. This comparison does not claim the predecessor's separate hosted-range defect is repaired.

**Required repair/test:** bind completion/start/error events to the actual recording after it owns the element; silent primer or stale-source events must not complete a pending download. Keep gesture activation, cancellation, Report resume and URL cleanup intact. Add a browser case that first blocks native playback, then permits a trusted retry with a delayed recording, asserting an actual non-silent word play/end rather than only status text or any media `ended` event.

## P2 — Shuriken queues feedback after Exit

**Trigger:** select a word and a meaning while the second spoken item is still pending, then press Exit. The audit holds that second utterance through controlled speech callbacks, leaving the normal cancellation and game code intact.

**Observed:** Shuriken schedules its correct/incorrect feedback oscillators after Exit returns to the menu. Reproduced in both engines, with two probes per engine on the current build, and also in the retained predecessor. Chromium's audio context is running when the late effects start. WebKit's context is suspended at the sampled start, so actual WebKit speaker output is not inferred.

**Cause:** [Game.tsx:299](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/learningModules/speed-match/Game.tsx:299) attaches `spoken.then(() => playGameSound(...))` without checking the activity lifetime. Cancellation is swallowed by the card-audio wrapper, so it resolves that promise and triggers the effect after Exit. Saving/answer state is not the reproduced failure.

**Classification:** inherited defect, not introduced by the latest recording fix. The same callback and behavior exist in `7b33d7b`.

**Required repair/test:** invalidate pending feedback on Exit and superseding requests; a canceled word must not trigger an old turn's sound. Add a pending-second-word/Exit case that monitors synthesized oscillators as well as media and decoded recording effects. Existing Lantern-only effect assertions do not cover this path.

## Checks that passed, and what they establish

- **72/72 fresh hosted game/recovery cases**, one clean run on `1b3e4f3`, Chromium and tablet-sized WebKit. This includes complete rounds, retries, Report, saved-work conflicts, result preservation, menus, layouts and the existing native audio checks. No assertions, retries or deadlines were changed for the run. `K_NATIVE_HOST=1` leaves successful recording responses unmodified.
- **12/12 fresh hosted writing/reading cases** across Kindergarten, Grade 2 and Grade 5, desktop and tablet landscape. These verify teaching/acquisition, Report/return and ordinary reopening; their speech is simulated and they do not establish physical sound.
- Exact hosted identity remains `1b3e4f3`: **192 files / 1,152 headers** match. Frozen Grade 5 `1a9db3e` remains exact across **183 files / 1,098 headers**. Canonical `9d06a02` and the **18 other channel releases/expiries** remain unchanged.
- Earlier unit, native-audio inventory and sleep-interrupted results remain preserved in the repair record. They were inspected, not relabeled as fresh unit or physical-device results in this audit. The clean 72-case run now removes the need to rely on cumulative coverage for the existing game matrix; it does not cover the newly found scenarios.

The first defect demonstrates a gap in the test model: existing denial cases abort recordings or fail speech while the native media element has already been successfully unlocked. The happy-path audio assertions can count any `ended` event, including the silent primer. The second gap is that the suite's effect observer tracks Lantern buffer sources, not Shuriken oscillator callbacks. Passing the existing suite therefore does not close these findings.

## Handoff and evidence

Prior ready-for-device-check wording is superseded by this hold. Continue the existing confirmed Astra · Extra High repair stage for these focused defects; no routine model/approval question is needed. Keep changes in the isolated combined prototype and preserve the frozen fifth-grade presentation. Do not change teaching, timer, scoring, saving, authentication or curriculum policies to repair these audio bugs.

There was no deployment or new email during this audit. Existing preview expiry remains November 1, 2026 at 3:24 a.m. Pacific. Physical iPad audio/touch and authenticated/offline/cross-device acceptance remain separate. Broader unfinished editor/source-refresh/policy work is unchanged.

Evidence: `/tmp/ninja-regression-audit.hBZOrj/`, retained under `family-beta-artifacts/prototypes/w-combined-1b3e4f3/regression-audit-2026-10-25/`. Key files: `games.log`, `writing.log`, `verification.json`, `timing.json`, `timing-slow.json`, `timing-repeat.json`, `timing-summary.json`, `baseline-timing.json`, `findings-verified.json`, repro scripts and screenshots, and `reviewed-source.diff`. The compact predecessor console reports Blob-size counts of zero because its words use HTTP URLs; the comparison uses the actual word URL events in its JSON, not those Blob-only counters.
