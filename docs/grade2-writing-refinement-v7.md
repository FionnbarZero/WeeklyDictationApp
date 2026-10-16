# Grade 2 writing refinement v7 — isolated prototype

Owner decision, October 15: retain the approved five-step Stroke Order Slay for every character, then **one whole-word tracing trial → one whole-word independent trial → distractors**. Restore large centered Grand Scrolls during writing, including Warmup. The initial independent trial is explicitly included; the earlier request to omit it is superseded.

## Scope

- A separate `writing-refinement-preview` build and v7 synthetic storage key; the existing approved v6 package, local pilot on 5210, family records and canonical app are untouched.
- Reuses the existing teacher, writing pad, timers, audio and confirmed-save controller. A new pinned preview policy chooses `show-copy, target`, followed immediately by `DT, target, DT, DT, target, DT, DT, DT, target`. Familiar/earned distractor selection and correctness meaning stay under the existing engine.
- The original five/six-step saved lesson policies retain their exact acquisition strategies. The actual app launcher still selects v6; it does not activate v7.
- Preview-only CSS gives scroll practice the available viewport and moves its report controls into a reserved top row. The old family preview uses a 1280px outer shell, several toolbar rows and an embedded frame; the new isolated view removes that host compression without redesigning either approved activity.
- A clearly labelled **Check Warmup scroll size** sample reuses the writing view with the reference lesson's words and ten-second timer. It does not change saved teaching/acquisition progress or scores. It is not a connected earlier-week Warmup lifecycle.

## Boundaries

The reference September 29–October 2 lesson is synthetic-profile practice, not the current live curriculum. Saves stay in this browser; unfinished ink is temporary. There is no family login, cloud synchronization, target editing, production migration or canonical publication. Existing correction remains unchanged; the separately planned two-step correction is not implemented by this focused change. Physical audio and touch require owner feedback. The hosted, cross-device prototype approval gate remains separate; a local preview does not establish that gate or authorize full-app integration.

## Verification

### Hosted preview — October 15, 2026

The owner authorized a separate cross-device test website. Published the retained, already-tested **d58a1d4265adb6eb4a6b11cf0bb0908098b996f5** files once, without rebuilding or changing application code:

- URL: https://weekly-dictation-staging--writing-refinement-v7-0uxyg3qn.web.app/
- Firebase project/site: `weekly-dictation-staging`; new channel: `writing-refinement-v7`.
- Hosting version: `e863f6ec952d2e83`; release: `1792085841340000`.
- Expires **November 14, 2026 at 17:37:18 UTC**.
- Dedicated configuration: `firebase.writing-refinement-preview.json`. Used pinned Firebase CLI 15.32.1 and Node 24.22.0, with `--no-authorized-domains` and 30-day expiration. No auth, database, DNS, canonical app or existing-channel mutations.
- HTTPS root rewrite, source marker, all five public files and all six configured headers match the retained artifact exactly.
- Read-only provider checks before/after confirm staging live remains version `821ef068daa808cb`, release `1791983894530000`; old v4 remains version `80c63f7b7d2d5602`, release `1792015616270000`.
- Hosted test configuration uses `WRITING_REFINEMENT_TEST_URL` and a separate results directory, leaving the existing local preview and its evidence untouched. Typecheck and scoped configuration lint/format pass.
- All **six hosted browser cases pass (1.5 minutes)**: four viewport widths (1663, 1366, 768, 390), every character's five-step teaching through trace/independent/distractors and next-word teaching, report pause, exit/resume, saved reload, and repeated non-scoring Warmup samples. The hosted desktop tracing screenshot was visually inspected. Audio is mocked in these automated tests; physical sound and finger/Pencil acceptance remain the owner's device check. Results: `writing-refinement-hosted-test-results/`. This is prototype verification, not independent whole-app integration review.

**Owner check: Grade 2 only, 5–8 minutes, isolated pre-release prototype—not the canonical beta.** On a laptop, complete teaching for both characters and check trace once → independent once → distractors, large scrolls, Hear/Type/Skip Timer, Report pause and Exit/resume. On iPad, additionally check finger/Pencil strokes, accidental page movement, and access to controls in both orientations. Use **Report a problem** for feedback without child-identifying information. No browser-data reset is needed. Saves are local to each browser and will not follow you to another device; handwriting is temporary. Warmup is a non-scoring layout sample, not the full lifecycle. Revised correction, target editing, cloud sync and full-app integration remain unfinished. Owner approval of the hosted interaction remains required before integration.

### Prior local verification

**Local handoff:** [Grade 2 preview v7](http://127.0.0.1:5214/grade2-writing-preview.html), source **`d58a1d4`**, unpublished and this computer only. All six browser cases pass (1.5 minutes), and all five public files match the served artifacts. Rebuilding after the source commit changed the HTML build marker only: tested JS SHA-256 `6eea4c05d4f7aa55eda0af89ac82d4a1e244c2d8873648f83fe220108ee83975` and CSS SHA-256 `50e359b6af7fcd5e23a7e9e4eebfd807a4f9c6e8919886152015b4f40003aae8` are byte-identical. No hosted publication or independent integration review is claimed.

Suggested laptop check: 5–8 minutes. Start/resume writing, complete both characters, check trace once → independent once → distractor, inspect large centered pads and Hear/Type/Skip Timer, then Exit/resume and Report a problem. The separate Warmup-size button demonstrates the same larger layout without changing lesson progress. Do not clear browser storage. This engineering preview is not the required hosted approval gate; request authorization for a new isolated hosted preview before deployment.

Node 24.22.0: 1,124 unit tests pass, including the new exact opening sequence, next-word recurrence, error routing and unchanged old policies. Typecheck and full lint pass. Browser cases cover four viewport widths, visible writing/typing/timer controls, trace → independent → distractor, confirmed reload, both characters' five teaching steps, next-word teaching, report pause, exit/resume and non-scoring repeated Warmup layout samples.

Earlier failures are retained, not accepted evidence: the initial 480px drawing-width test assumption measured 469.5px at the reported 1663px viewport (the explicit final floor is 450px); mobile review controls were obstructed by floating report buttons, now moved to the reserved top area; a test read storage before the asynchronous answer save finished, now awaits the visible review-to-next-trial transition. Evidence directories: `/tmp/writing-v7-first-layout-failure-20261015` and `/tmp/writing-v7-second-checkpoint-driver-failure-20261015`.

Build separately with `vite build --mode writing-refinement-preview`; output is `writing-refinement-preview-dist`. Run `playwright test --config playwright.writing-refinement.config.ts`. Do not overwrite `writing-five-step-preview-dist` or `writing-pilot-dist` to show this prototype.
