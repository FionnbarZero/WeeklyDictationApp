# Kindergarten learning lab boundary

The Kindergarten learning lab is a development-only child-experience harness at `/kindergarten-learning-lab.html`. It is deliberately separate from the normal application entry point and does not make Kindergarten production-ready.

## What the lab exercises

- The opening action says **Enter the Dojo**.
- A tester manually selects one vocabulary-bearing tab from the checked-in workbook fixture. The default is explicitly `Week 6 09/21`; it is not chosen from today's date.
- Tier 1 `Writing character` targets enter the shared `PracticeView` and shared Acquisition engine.
- Tier 2 `High frequency word` targets remain in a separate visible look-listen-say prototype with no recording or scoring.
- The **Prepare for your test** card aggregates the explicit Unit 1 fixture window, August 31 through September 27. Its shared Test Review presentation uses the 14 observed Tier 1 writing targets; the nine Tier 2 words remain preserved and displayed separately.

## Acquisition ownership

`kindergartenAcquisitionStrategy` has its own strategy ID, version, timer object, sequences, Familiar-DT array, Familiar-DT objects, target IDs, and seed dataset ID. Its current values intentionally produce the same semantic Acquisition trace as Grade 2 v3. It does not import the Grade 2 strategy, so later Grade 2 changes cannot silently reinterpret Kindergarten progress.

The lab creates an ephemeral target set whose ID starts with `__kindergarten-lab__`. A source candidate may enter this adapter only when it:

- belongs to the Kindergarten Sheets profile;
- has an assigned Monday–Sunday week and canonical occurrence identities;
- has at least one Tier 1 target; and
- is blocked only by `kindergarten_activation_policy_unresolved`.

The original source candidate remains malformed. The ephemeral dataset is never sent through canonical import, application hydration, lifecycle resolution, or persistence.

## Deliberate limitations

- No production Kindergarten practice or lifecycle profile is registered.
- No active week is inferred.
- No Warmup policy is assumed or simulated.
- No Tier 2 assessment engine, microphone capture, score, or progress record exists.
- Unit 1 dates are a clearly named lab fixture, not a production unit-boundary source.
- The Test Review timer and cumulative presentation are lab behavior, not an approved production lifecycle.
- Refreshing or leaving discards all lab state.
- The lab does not import Firebase/Firestore code or use browser storage.

Production activation still requires an approved rollover event and timezone, empty-tab/no-instruction behavior, authoritative unit boundaries, Warmup rules, Tier 2 assessment policy, trusted sync deployment, and lifecycle matrices.
