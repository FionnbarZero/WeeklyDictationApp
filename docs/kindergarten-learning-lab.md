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
- is a valid canonical source candidate with no error blockers.

The original source candidate remains unchanged. The ephemeral dataset is never sent through application hydration or persistence.

## Deliberate limitations

- The production lifecycle and writing-practice profiles are registered, but the source release flag remains inactive.
- No active week is inferred.
- No Warmup policy is assumed or simulated.
- No Tier 2 assessment engine, microphone capture, score, or progress record exists.
- Unit 1 dates are explicit in both the lab fixture and the lifecycle profile; they are not inferred from workbook order.
- The cumulative lifecycle membership is approved, while the lab's Test Review presentation and timer remain unpersisted prototype behavior.
- Refreshing or leaving discards all lab state.
- The lab does not import Firebase/Firestore code or use browser storage.

The production path now has an explicit optional-Warmup profile, shared Tier 1 Acquisition, cumulative per-source-week Test Review persistence, Dojo presentation labels, an unscored Tier 2 teaching module, and child-facing integration tests. Activation still requires trusted sync deployment and a deliberate release review; empty tabs remain blocked until their machine-readable meaning is approved. A scored Tier 2 assessment remains a separate future capability.
