# Grade 2 Slay-style acquisition comparison B

Owner requested October 15: compare the same Stroke Order Slay boxes/background in ordinary writing acquisition against the larger Grand Scroll layout. This isolated entry uses the original Slay shell/background and a scoped cream/red-box presentation around the unchanged WritingPad and PracticeView. It does not change shared application code, the stroke teacher, real-family data, or older hosted previews.

The existing v7 acquisition engine/policy supplies one whole-word trace, one independent trial, then distractors. Existing target/earned-DT 25-second and familiar 10-second timing, Skip Timer, whole-word assessment, and correction rules are reused. This is not a new correction protocol. Acquisition automatically speaks; optional replay remains subject to existing rules (Hear disabled after successful automatic audio). The explicit Start/resume gesture enables preview speech. Actual audible iPad playback is unverified until owner testing.

Stroke-order teaching is intentionally omitted in this layout comparison, clearly stated on the start screen; no completion is written or falsely persisted. Exit/resume retains acquisition phase in memory, not unfinished handwriting/timer. Reload restarts this synthetic session. No scores, teaching completion, or family records are saved or synchronized. Only owner-submitted problem reports may persist through the existing report mechanism. No login is required. The original apps and reference previews remain unchanged.

## Verification and owner check

Dedicated Vite entry uses no public directory; only entry HTML, CSS, and JS are hosted. Scoped CSS cannot affect normal app entries. Automated iPad-sized tests cover trace → independent → familiar distractor → target, drawing/typing, control visibility/hit-testing, report pause, exit/resume and reload reset. Speech is mocked in browser tests. Initial testing exposed legacy single-character positioning overriding this presentation; higher-specificity isolated selectors repair it without editing shared styles. Initial test attempted Hear despite its intentional acquisition replay lock; corrected to assert that lock, not loosen teaching rules.

Owner check: 3–5 minutes on an iPad, both landscape and portrait. Tap Start, listen, draw, use Skip Timer and whole-word right/wrong assessment. Check the independent and distractor screens, Type, Report a problem and Exit/resume. Compare box size and background with comparison A. Pencil feel, real audio, software-keyboard behavior and preferred appearance require physical-device feedback. Approve a working prototype before any whole-app integration.

## Hosted identity and evidence — October 15

URL: https://weekly-dictation-staging--slay-acquisition-compare-reevz808.web.app/

Source `33a619143927745481255279ead9589f49627f0c`; hosting version `fc74ec248116afbb`, release `1792094769157000`, expires November 14 at 20:06 UTC. Exact remote root, three public files and six headers match the retained artifact. Supported Node 24 typecheck, full lint, 35 focused writing/acquisition units, three final Chromium and three final WebKit cases pass locally. The final browser checks include wrong-independent → existing correction, bounded review contents, report pause and reload reset. Screenshot inspection additionally found portrait review overflow; isolated min-width/grid sizing fixed it, and tests now bound the writing/input inside its panel.

JS SHA-256 `6b06f87fd1807fc846a0b207e83738b35d16068a5b85054d587a5ac99a965886`; CSS `b567829ff3446e3c4a23760af153f836e24fa953c63729c3377c0d67b960359f`. Post-commit identity rebuild preserves byte-identical tested JS/CSS. Prior v8/v7/v4, scroll comparison A and staging live hosting identifiers remain unchanged. No canonical deployment occurred.

Chromium writing widths: 476px landscape 1024×768, 428px landscape 1180×720 and 369px stacked portrait 768×1024. These are simulated viewport measurements. No physical iPad or Apple Pencil acceptance is claimed.

Final hosted acceptance: all three Chromium and all three WebKit cases pass on the exact HTTPS preview. Owner smoke testing is ready for the bounded checklist above; physical-device acceptance and integration approval remain outstanding.

Delivery: both comparison URLs, build IDs, expiry, Grade 2 physical-device checklist and limitations emailed at the owner's request to the previously confirmed address. Gmail receipt `1a1412e9ad76a264`, label `SENT`. An in-app tab-open request for B was queued; this is not a claim that the owner's foreground tab changed.
