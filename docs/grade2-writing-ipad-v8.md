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

## Publication evidence

- Source: **`421fc2a9ec32997c4376c700dbcd9b5062aa74a9`**. Rebuilding after the source commit changed the HTML identity only; JS/CSS remained byte-identical to the locally tested files.
- URL: https://weekly-dictation-staging--writing-ipad-v8-zwy4olph.web.app/
- Firebase project/site `weekly-dictation-staging`, new channel `writing-ipad-v8`, version `bdc5fcecc2176acf`, release `1792086859320000`.
- Expires **November 14, 2026 at 17:54:17 UTC**. Deployed once using the pinned Firebase CLI and `--no-authorized-domains`; no security/auth/DNS/database writes.
- HTTPS root rewrite, source marker, all five public files and all six headers match the retained package exactly. JS SHA-256: `5d3ffdf55e9e672c9cf341922febb76ff87006a304c785b7ec3648e991f6e69a`; CSS SHA-256: `73d55b89788bd9d5e5ee2ad340e8bac1d4aed7caa9dabe4dead11bbab5f05a84`.
- Before/after provider checks confirm unchanged v7 `e863f6ec952d2e83`, v4 `80c63f7b7d2d5602`, and staging live `821ef068daa808cb`. No Cloudflare/canonical operation occurred.
- All 10 local Chromium cases and four local WebKit cases passed. Safari-engine measurements confirm the same drawing widths; browser viewport simulation and gesture mocks do not establish physical iPad speaker or Pencil acceptance.
- All four hosted WebKit cases pass (29.7 seconds). The exact gesture-gated Start test deliberately fails against frozen hosted v7 (no speech start), while passing on v8, including fresh reload/resume. Expected v7 failure evidence: `/tmp/ninja-writing-v7-expected-audio-regression`; hosted WebKit evidence: `/tmp/ninja-writing-v8-hosted-webkit-results`. This is a controlled reproduction of the permission boundary, not a remote inspection of the owner's iPad.
- All **10 hosted Chromium cases pass (2.0 minutes)** against exact source `421fc2a`, including the complete teacher-to-acquisition flow and next-word recurrence. Results: `writing-ipad-hosted-test-results/`. The isolated preview is ready for the bounded physical-device check below; no independent whole-app integration review or physical audio acceptance is claimed.

## Owner handoff

Grade 2 synthetic prototype, not a canonical app release. Allow 5–8 minutes on iPad: tap Start, verify the word speaks without tapping Hear, complete both characters into tracing, check larger landscape pads and direct-over-pad instructions, rotate to portrait, try one trace → one independent → distractors, then Report and Exit/resume. Record issues through Report a problem without child-identifying information. Also check laptop controls for regressions. Do not clear browser data. New-site progress is separate; local-browser saving does not sync between devices and unfinished ink is temporary. Revised correction, target editing, cloud integration and the full Warmup lifecycle remain unfinished. Owner approval is still required before whole-app integration.
