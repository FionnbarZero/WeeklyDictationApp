# Physical-device acceptance — current combined preview

Status: **report-driven repair published and verified; final physical observations remain separate**. The owner clarified that the existing reports should drive this work. No repeat description or fresh physical test was required before investigating those reports.

## Existing reports and confirmed repair

Read the five owner-supplied exports: 39 initial reports, four writing reports, five persistence reports, seven later reports and 15 October 20 reports — **70 entries**, including positive feedback, retractions and teaching-policy requests. The seven-report paste was read by adding its missing opening brace and ignoring its trailing `3`; the original attachment was not edited. Reports supply observations, not authority to reinstate superseded teaching or menu policies.

Two connected scrolling defects are reproduced on the prior `1f9ad3f` package at the reported 1024 × 665 viewport:

1. `body` has `overflow-x: hidden`, which also makes its vertical overflow `auto`. Its `overscroll-behavior-y: contain` traps wheel/gesture input before the root document can scroll, despite additional content below. Programmatic `scrollIntoView` can still work, explaining why earlier layout tests missed the problem.
2. Removing that block exposes the stroke teacher's missing wheel protection: trackpad movement can scroll the paper during an active stroke. `touch-action: none` alone does not block wheel input.

Published **`b36f736` / Combined Dojo · Device repairs 1** moves scroll containment to the document and allows the body's input to reach it. Interactive stroke pads block ordinary wheel movement locally, while retaining browser zoom gestures and scrolling outside the pad. The shared pad also serves Warmup correction. There are no teaching, scoring, timing, curriculum or persistence changes.

| Earlier evidence | Current disposition |
| --- | --- |
| Grade 2 teacher bottom clipped / cannot scroll: `d26325cc…`, `7147e7b9…`; earlier chat report of trackpad movement during writing | Reproduced and repaired in this candidate. New tests use actual wheel input, not just programmatic scrolling, and check drawing stability, reachable bottom controls and editable Report. |
| Small acquisition/Warmup boxes: `b128efd7…`, `595777d3…`, `289c1a6a…`, `d3b31fb5…`, `d8a73c94…`; initial desktop sizing reports | Approved Slay/acquisition and native Warmup designs are already in the combined app. Current regression checks cover those paths; no new redesign is being introduced. |
| Uneditable Report: `9d269730…` | New scrolling cases also open Report, type, return and check the activity remains available. |
| Silent games and unresponsive first clicks: `ecbc53d9…`, `86e3c921…`, `f7f8fb81…`, `61fd72f9…` | Existing startup, game recovery and Kore repairs are retained; rerun native-media/game navigation checks on this exact candidate. |
| Quiet recorded response / reading blocked: `ec06b07a…`, `50e3e253…`, `25dae43f…` | Existing temporary recording balancing and reading recovery remain; verify without recording a child or retaining audio. Actual speaker/microphone loudness still needs a physical observation. |
| Exit/discard traps and resume: `41f7cc69…`, `061f5305…`, `673a9633…`, `4726a3c9…`, `41017644…`, `aca275c2…`, `a82b5231…` | Existing direct game Exit and acquisition checkpoint fixes are retained. Warmup regression checks include repeated correction, Report, Exit/reopen and confirmed progress. Cloud conflicts remain a separate acceptance scope. |
| `c6a00648…` retracts the concern that stroke teaching restarted incorrectly | Preserve the retraction; do not reset correctly resumed progress. |

The initial wheel driver incorrectly compared layout after wrong-stroke feedback and initially attempted downward scrolling without first establishing usable scroll range. Those driver errors were corrected and preserved in `before/` and `before2/`. `before3/` and `before4/` reproduce the actual scroll trap; `scroll-ab/` changes only body containment to isolate the missing pad protection. The first touch driver aimed at a heading that can be above the viewport after pad focus and omitted touch emulation; its three failures are retained separately from the corrected visible-margin gesture checks. The corrected touch case fails against the unchanged old package (`old-touch-negative/`) and passes against the repair. These are automated browser-input checks, not actual iPad results.

## Exact test build

- Combined Dojo / Device repairs 1, source `b36f7360d319d3a557b7e8716fff6745e21fa4f0`.
- Hosting version `98efab568b2dbab6`; preview expires **November 2, 2026 at 12:13 PM Pacific**.
- [Kindergarten](https://weekly-dictation-staging--kore-voice-oct26-v1-pi4l5pxy.web.app/family-beta-preview.html?grade=kindergarten)
- [Grade 2](https://weekly-dictation-staging--kore-voice-oct26-v1-pi4l5pxy.web.app/family-beta-preview.html?grade=grade2)
- [Grade 5](https://weekly-dictation-staging--kore-voice-oct26-v1-pi4l5pxy.web.app/family-beta-preview.html?grade=grade5)

All three grade entrances are hosted and verified. Both hosted release manifests identify this exact source. The outer manifest identifies Kore at 0.65 and tree `c597b4b272147a2b04a0dc34f46da12e332680ada2f1d85ddd0c8bd9897d32ef`. All **1,162 public files / 6,972 headers** match the immutable release package. All 958 Kore clips and their audio manifest are unchanged from the prior release.

**Final verification:** 1,286 unit tests; type checking; full lint; changed-file format; production build and unchanged size budgets. **155 local browser cases** pass across the final runs: nine wheel/touch/report checks, 75 native Kore/game cases, 39 native Warmup cases, 26 compact layouts and six quiet-recording playback/advancement/cleanup cases. The nine new cases have the driver qualifications above; the other four matrices passed in their initial final-package runs. Three WebKit touch-injection cases are explicitly skipped because the CDP gesture injector is Chromium-only; WebKit wheel/layout/report checks run normally. Skips are not passes.

**15 hosted cases pass:** nine wheel/touch/report, three native Warmup audio/timer/pause and three actual-teacher-service writing/reading launches. Frozen Grade 5's manifest and 182 public assets, canonical Ninja Dojo, Firebase live, channel count and 18 retired URLs are verified unchanged. One deployment updated the existing preview; there was no live release or main merge. Source/automated review was performed in this chat, not a new independent agent review.

Email **`1a179daedc935767`** was read back with **SENT** and the correct owner address/body. It contains all three links, exact build, preview status, expiry, 3–5 minute per-grade checklist and the remaining boundaries. Evidence and immutable package: `family-beta-artifacts/device-reports-2026-10-26/`. Prior broader audit results remain separately recorded in [the final repair record](./final-audit-repairs-2026-10-26.md).

## Hands-on sequence

The initial request for a fresh Kindergarten listening observation is superseded by the owner's direction to use the existing reports first. After the report-driven repair is verified and published, the optional device handoff can concentrate on the repaired scrolling interaction. No physical result is assumed.

Then cover the following on the physical iPad and iMac, for each grade. Record the actual browser/device and results; use an adult test response for microphone checks. Use existing synthetic preview learners, not family records.

| Check | Pass observation |
| --- | --- |
| Sound | Automatic prompt and manual replay are audible repeatedly. Slow replay works where offered; returning from Report/Exit does not leave playback silent or overlapping. |
| Recording | Reading records an adult test phrase and plays it back audibly; Exit stops microphone use. Recordings remain temporary. Permission denied has a usable continue/retry path. |
| Writing | Finger/Pencil on iPad and mouse/trackpad on iMac produce aligned strokes without dragging the page. Repeated wrong strokes retain feedback and the activity. |
| Screen and keyboard | On iPad, both orientations and the native typing keyboard leave the writing area, input and Exit/Report controls usable. On iMac, the centered writing area and controls fit. |
| Report pause | Open Report during an active trial, wait briefly, then return. The timer/activity pauses and continues from the same position. |
| Resume | Exit after a confirmed teaching step, reopen Writing, then close/reopen the tab in the same browser and grade. The confirmed word/step is retained. Unconfirmed strokes and temporary recordings may need repeating. |
| Games | Open every available game, hear its prompt, make an incorrect and a correct response, and Exit. No silent prompt, dead click or blank screen. Do not change target pools to force unavailable games. |

| Grade | iPad result | iMac result |
| --- | --- | --- |
| Kindergarten | Pending | Pending |
| Grade 2 | Pending | Pending |
| Grade 5 | Pending | Pending |

Use **Report a problem** for failures, noting the activity, device/browser and whether the problem occurs automatically or after a tap. Do not clear browser data or reset progress. Retain the exact build with each result; a later build needs only the affected checks repeated plus relevant regressions.

## Boundaries

- This preview saves synthetic progress in the same browser on the same device. It does not establish authenticated synchronization, offline installation or continuation on another device.
- English Niamh, unseen future-import resources and main-branch reconciliation remain separate.
- Canonical Ninja Dojo and the frozen standalone fifth-grade website are excluded and unchanged.
- Mark physical acceptance complete only after recorded observations cover the applicable devices, grades and interactions. A reachable URL, media playback event or simulated tablet viewport is insufficient.
