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

Node 24.22.0: 1,124 unit tests pass, including the new exact opening sequence, next-word recurrence, error routing and unchanged old policies. Typecheck and full lint pass. Browser cases cover four viewport widths, visible writing/typing/timer controls, trace → independent → distractor, confirmed reload, both characters' five teaching steps, next-word teaching, report pause, exit/resume and non-scoring repeated Warmup layout samples.

Earlier failures are retained, not accepted evidence: the initial 480px drawing-width test assumption measured 469.5px at the reported 1663px viewport (the explicit final floor is 450px); mobile review controls were obstructed by floating report buttons, now moved to the reserved top area; a test read storage before the asynchronous answer save finished, now awaits the visible review-to-next-trial transition. Evidence directories: `/tmp/writing-v7-first-layout-failure-20261015` and `/tmp/writing-v7-second-checkpoint-driver-failure-20261015`.

Build separately with `vite build --mode writing-refinement-preview`; output is `writing-refinement-preview-dist`. Run `playwright test --config playwright.writing-refinement.config.ts`. Do not overwrite `writing-five-step-preview-dist` or `writing-pilot-dist` to show this prototype.
