# Audio behavior contract

This contract records the curriculum-owner decisions confirmed on 2026-10-03. The grade spreadsheet or slide deck remains authoritative for targets, order, tiers, and instructional dates. Approved short contexts come only from the separate grade-specific context-review catalog.

## Shared playback rules

- Starting a prompt, recording, question change, Skip Timer action, scoring transition, or activity exit stops every prior managed audio source.
- A cached recording is preferred. If it cannot start or finish, the same segment immediately falls back to browser speech. A total failure exposes both Retry and teacher-help guidance.
- All four-part dictation sequences are `word → context → word → word`, with 0.75-second gaps and a constant Mandarin rate within the sequence.
- Audio playback never changes scoring, mastery, or attempt counts.
- Final Boss and Ninja Skills surface a failed cue with both a Retry control and teacher-help guidance. A Final Boss writing timer remains stopped until the spoken prompt starts and stops again if the remaining sequence fails.
- Mandarin production generation must use one selected female voice. The two candidates awaiting audition are `cmn-CN-Wavenet-A` and `cmn-CN-Wavenet-D`; the current cached beta files use female `Tingting`.
- English instruction production audio is planned for Amazon Polly `Niamh` (`en-IE`) with adjustable SSML speaking rate. The current Kindergarten beta caches “Let's learn a new word” with the local Irish-English `Moira` voice so the first-target announcement does not depend on browser-installed voices. Browser speech remains the failure fallback.

## Enter the Dojo

- Writing starts its four-part sequence automatically. There is no Replay button. The response timer begins when playback starts and becomes shorter across the five Expanded target presentations: 10, 9, 8, 7, then 6 seconds.
- At the original Introduction presentation of each new Kindergarten reading target, the app says “Let's learn a new word,” then immediately begins the Mandarin `word → approved context → word → word` sequence. It does not insert “Read and record” between the announcement and the target. Correction teaching retains “Read and record.” The new-target announcement is not used for Familiar DTs, Correction, or an Introduction restarted after repeated errors. An assessed reading trial does not play the model first. The child records once; their recording is followed immediately by the correct model while self-scoring controls are available. There is no rerecord. An incorrect response enters the established Correction routine.

## Ninja Skills

- Listening Lily Pads speaks the target when a round begins; its sound control speaks the word once.
- Memory Lanterns speaks a character when revealed and speaks a matched character again.
- Ninja Sky Writing speaks the target once.

## Final Boss and Spirit Realm

- Final Boss permits one response per target, collects the complete pool, then opens its separate review/scoring phase. A reading comparison is child recording followed by correct model; writing uses the same deferred review structure.
- Spirit Realm reading compares and scores one response before moving to the next. There is no rerecord; Skip Timer is the move-on control. Spirit Realm playback speed remains intentionally unresolved.

Offline guarantees are deferred. The architecture continues to use cacheable audio files so offline support can be added later without changing the activity contract.
