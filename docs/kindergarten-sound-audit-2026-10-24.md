# Kindergarten sound audit — October 24, 2026

The owner reports that the combined preview otherwise looked good, but Kindergarten has **no sound or intermittent silence**. This audit inspected every available Kindergarten game across Ninja Skills and Spirit Realm on **W-roadmap combined repairs / Prototype 2, application `7b33d7b74d95839237181be1b04c09e8881f2172`**. It is not a clean audio audit. No application behavior, hosting, voice policy, family records or frozen Grade 5 presentation was changed.

Audited website: https://weekly-dictation-staging--w-repairs-oct23-v1-06344oyc.web.app/family-beta-preview.html?grade=kindergarten . The owner's ambient tab is older W1 `d6ee258`; a separate range probe confirms the same delivery issue there. Do not attribute this report solely to an old open tab or call it a proven regression introduced by the latest repair.

## Findings

### P1 — recorded sounds fail through the hosted media delivery path in WebKit

All **45 hosted audio files** (40 word recordings, one instruction, four Lantern effects) return complete, nonempty audio and match the retained package. Both Chromium and WebKit decode all 45 buffers successfully. There are no identical recordings mapped to different words, silent PCM payloads or clipped samples in this inventory. These checks do not establish linguistic pronunciation quality.

However, WebKit's media player rejects the hosted WAV URLs with `NotSupportedError` / media error code 4. Native game visits reproduce this for recorded clues in Listening Lily Pads, Shadow Strike Dojo and Memory Lanterns. Independent direct-element probes reproduce it for a word, an instruction and a Lantern effect, outside the game.

The network evidence isolates a delivery problem: WebKit requests `Range: bytes=0-1`; the host returns **200 with the complete file and no Content-Range**, despite advertising byte ranges. An independent HTTP probe gets the same response: the two-byte request for `u866b.wav` receives all 22,820 bytes. Both current `7b33d7b` and older W1 `d6ee258` serve identical bytes this way.

**Controlled comparisons, with unchanged audio bytes:**

| Loading method | Word | Instruction | Lantern effect |
| --- | --- | --- | --- |
| Actual hosted media URL | Rejected | Rejected | Rejected |
| Fetch complete file, then play its temporary Blob URL | Started and ended | Started and ended | Started and ended |
| Test-only intercepted response honoring requested byte ranges with 206 / Content-Range | Started and ended | Started and ended | Started and ended |

Only fresh automated browser contexts were modified for these experiments; the website and files were not deployed or edited. Chromium plays the same original hosted samples normally.

The shared player assigns these URLs directly at [promptAudio.ts](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/audio/promptAudio.ts:349). Failure falls back to device speech, so some devices/games can appear to work while recorded playback is failing. Lantern effect playback swallows rejection and has no equivalent speech fallback. This is a strong candidate explanation for the reported silence, **not a physical-iPad root-cause confirmation**.

**Repair priority:** make recorded playback independent of the failing range path, preserving the tap-activated audio element, cancellation, Report pause, retry and temporary-data rules. The successful Blob experiment is a promising implementation reference, not a shipped fix. Include both shared word/instruction audio and separately loaded Lantern effects. Do not change teaching, saving, grading or voice/rate policies.

### P2 — Shuriken Match hides sound failures

When both recording and speech playback are denied, Chinese and English card taps produce no visible audio error. The handlers at [Game.tsx](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/learningModules/speed-match/Game.tsx:477) deliberately consume the rejection and proceed with card selection.

Confirmed independently in Chromium and WebKit with controlled denial. Re-tapping a still-available card can play successfully after recovery, but there is no displayed indication that its prior sound failed or an obvious retry action. This contributes to apparently unexplained silence.

**Repair priority:** show a clear, child-friendly failure/replay control without changing pairing, correction, timer or scoring rules.

### P2 recovery gap — Memory Lanterns cannot replay the same failed revealed card

A denied first card displays a sound warning. After sound becomes available, tapping that same revealed card produces **no new audio request** and leaves the warning. Tapping a different hidden card succeeds and clears it. Both engines reproduce this behavior.

The early return for `flippedIds.includes(cardId)` at [Game.tsx](/Users/meghanoreillygreen/.codex/worktrees/grade5-oct23-prototype/WeeklyDictationApp/src/learningModules/memory-lanterns/Game.tsx:72) blocks the retry. The existing message explicitly directs the child to another lantern, so this is a recovery limitation rather than a claim that all play is permanently blocked.

**Repair priority:** allow hearing the failed revealed word again without flipping another card, adding a turn or changing the matching state.

## Game-by-game coverage

| Game | Active location(s) audited | Audio route | Failure and recovery result |
| --- | --- | --- | --- |
| Listening Lily Pads | Ninja Skills and Spirit Realm | Recorded word, then device speech fallback | Recorded URL rejected in WebKit; warning and Hear clue retry recover when playback is available. |
| Shadow Strike Dojo | Ninja Skills and Spirit Realm | Recorded word; spoken mistake feedback | Same recorded URL issue; “Audio needs another try” and Replay word recover. Its warning uses status text, not an alert. |
| Memory Lanterns | Ninja Skills and Spirit Realm | Recorded words and separate WAV effects | Same recorded URL issue; retrying another card works, retrying the already revealed failed card does not. |
| Shuriken Match | Spirit Realm | Chinese word recordings when available; English device speech | Both-language routing is correct in controlled checks; failures are hidden. |
| Dictation Streak | Spirit Realm | Device speech for the combined word/context/repetitions | Failed transmission is reported; Replay transmission recovers. No cached recording matches the full combined utterance. |
| Context Gap Dash | Spirit Realm | Device speech for sentences and choices | Failure warning, Replay sentence and existing slower replay path are present; retry recovers. |
| Sushi Scramble | Spirit Realm | Device speech for sentences | Failure warning and Hear sentence again/Hear slowly controls recover. |

On the retained current Ninja Skills lesson, Dictation Streak, Shuriken Match, Context Gap Dash and Sushi Scramble are explicitly unavailable for missing validated content. They were audited through the available mastered-word versions in Spirit Realm; disabled cards were not counted as silent games or supplied with invented curriculum. Writing/reading acquisition and final tests are outside this game interaction matrix, although their shared recorded-audio path merits follow-up regression coverage during repair.

## Evidence and limits

- **20 native-playback browser visits:** three Ninja Skills games and seven Spirit Realm games in Chromium and WebKit, with automatic audio where applicable, repeated replay/card taps, Report/return and Exit.
- **14 controlled failure/recovery visits:** all seven games in both engines. Report pause blocks new speech in every case. Same-prompt retries recover in the games with replay controls; Shuriken hides failure and Memory requires a different card.
- **45/45 files** match the package, have nonempty PCM and decode in each engine. Direct hosted-element playback and the two controlled alternatives distinguish valid data from delivery failure.
- **23/23 focused audio unit tests** pass. Earlier broad game suites mocked playback success and did not validate this native hosted-media path; those passing suites do not close this finding.
- Native Chromium speech starts were observed. The WebKit speech object's instance wrapper did not capture its native callbacks; its fallback event log is therefore not asserted as full speech-output acceptance. WebKit media rejection and direct-element/control results are independently observed.
- Actual speaker output, hardware mute/volume, installed iPad voices, and physical-device acceptance remain unverified. No microphone audio, child data or credentials were collected.
- The initial native driver was stopped and replaced with a corrected observed-button version; its partial screenshots are retained and excluded from the 20 completed visits. Repeated-round harness corrections and their retained results are recorded below rather than relabeled as application failures.

Evidence: original `/tmp/ninja-k-sound-audit.mnMUrd/`, retained beside the unchanged package in `family-beta-artifacts/prototypes/w-combined-7b33d7b/kindergarten-sound-audit/`. Important files: `inventory.json`, `files.json`, `decode-*.json`, `native-*.json`, `failures-*.json`, `range-controls.json`, `older-build-comparison.json`, `audio-units.log`. Scripts use disposable test contexts; simulated speech and intercepted network responses are labeled and are not evidence of a production repair.

### Repeated-prompt checks

All seven games have passing two-round/pair cue-sequencing coverage in both engines with controlled speech responses (**14 distinct scenarios**). The first matrix passed 10/14: Lily's driver targeted phone-only buttons at tablet width, and Memory's driver read the deck before its lazy module mounted. The first bounded repeat fixed Memory (2/2) but still used hidden Lily buttons. A final Lily-only repeat used its existing keyboard-accessible choices and passed 2/2. No application code, timer, assertion deadline, scoring or saved-data rule was changed. Preserve all failed driver logs/screenshots. This is cumulative scenario coverage, not a claimed clean 14-case rerun or physical audio verification.

The next owner device handoff is premature until the recorded-delivery repair and recovery controls have an isolated working prototype, regression verification and exact hosted-build verification. Preserve the frozen standalone fifth-grade presentation and current canonical release.
