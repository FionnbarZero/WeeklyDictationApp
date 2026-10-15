# Grade 2 iPad prototype v8 — October 15, 2026

The owner reports v7 is silent only for automatic reading (manual Listen/Hear works), and acquisition scrolls are too small on iPad. Authorized an audio-only entry fix plus rearrangement of acquisition text/controls; subsequently explicitly authorized a separate hosted v8 test. Existing v7 and canonical Ninja Dojo must remain untouched.

## Scope and implementation

- Isolated `writing-ipad-preview` mode, `writing-ipad-preview-dist` package, and `ninja-writing-integration-preview-v8:synthetic-owner` storage. Uses the same v7 teaching/acquisition policy: every character's five steps → one whole-word trace → one independent trial → distractors. No migration or real-family writes.
- Start/resume and Warmup-sample taps synchronously call browser speech with an empty, zero-volume utterance before any asynchronous store opening, then cancel it. No new audible teaching cue or persisted audio-ready claim is introduced. Normal prompt completion/error handling still controls response timers. The shared audio runtime, teacher, activity pause semantics and actual app are unchanged.
- This addresses WebKit's initial speech user-gesture gate. [WebKit SpeechSynthesis implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp) removes the restriction when `speak` is called during a user gesture. Existing preview starts prompts after asynchronous save/load and React effects; voice loading can add another delay. Device sound output still requires physical acceptance.
- v8-only tablet CSS (600–1366 CSS pixels): compact instructions immediately above scrolls; Hear and Skip Timer side by side; Type and Clear share the bottom row. Landscape moves target/timer metadata into the existing practice-navigation row and removes repeated non-error footer text. Audio error feedback and report/exit controls stay available. Original stroke-teacher UI, desktop above 1366px, small-phone layout, brush, timer rules, correction and scoring are unchanged.

## Measurements and verification

Exact v7 hosted baseline versus the new built prototype, actual drawable area (CSS pixels):

| Viewport | v7 width | v8 width |
| --- | ---: | ---: |
| 1024 × 768 landscape | 197.5 | 390 |
| 1180 × 720 short landscape | 273.5 | 342 |
| 768 × 1024 portrait | 323 | 321 |

Portrait stays width-limited with two square scrolls side by side; the instructions now sit directly over the pads instead of leaving a vertical gap. Do not claim portrait pads doubled. Landscape and portrait screenshots were inspected during implementation.

Node 24.22.0: 1,124 unit tests, typecheck, full lint and isolated build pass. Tests include a gesture-gated speech mock with empty voice list: ordinary success-only audio mocks did not catch v7's physical-device failure. This verifies synchronous activation and subsequent automatic attempts, not actual speaker output. Additional viewport cases check controls, orientation changes retaining temporary ink, and independent-trial transition. The existing six preview regressions check both characters, all five steps, next-word teaching, saved reload, report pause, exit/resume and non-scoring Warmup repeats.

Earlier non-acceptance evidence: `/tmp/ninja-writing-v8-initial-fixture-failure` (test fixture omitted canonical timestamp milliseconds), `/tmp/ninja-writing-v8-ipad-recheck` (a reused test server exited mid-run), `/tmp/ninja-writing-v8-short-landscape-failure` (short landscape still too small; subsequently compacted navigation and repeated footers). No production defect was concealed by relaxing the size check.

## Test scope and limitations

Grade 2 synthetic prototype, not a canonical app release. Allow 5–8 minutes on iPad: tap Start, verify the word speaks without tapping Hear, complete both characters into tracing, check larger landscape pads and direct-over-pad instructions, rotate to portrait, try one trace → one independent → distractors, then Report and Exit/resume. Record issues through Report a problem without child-identifying information. Also check laptop controls for regressions. Do not clear browser data. New-site progress is separate; local-browser saving does not sync between devices and unfinished ink is temporary. Revised correction, target editing, cloud integration and the full Warmup lifecycle remain unfinished. Owner approval is still required before whole-app integration.
