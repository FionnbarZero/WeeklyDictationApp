# Kindergarten learning lab boundary

The Kindergarten learning lab is a development-only child-experience harness at `/kindergarten-learning-lab.html`. It is deliberately separate from the normal application entry point and does not make Kindergarten production-ready.

## What the lab exercises

- The opening action says **Enter the Dojo**.
- The checked-in workbook fixture's authoritative current tab is selected by default (`Week 8 10/05` in the current fixture). Development controls may select another vocabulary-bearing tab; the browser calendar does not choose the week.
- Tier 1 `Writing character` targets enter the shared `PracticeView` and shared Acquisition engine.
- Tier 1 writing uses checked-in cached Mandarin prompt recordings derived from the registered workbook targets. A prompt plays three times with one-second pauses, Replay starts the same cached recording sequence, and the timer does not start until the first recording starts successfully.
- Tier 2 `High frequency word` targets use the shared reading runner with prompt-local microphone recording and session-only self-assessment. No recording, reading result, or reading progress is retained.
- The Dojo uses only the workbook's authoritative current tab (`Week 8 10/05` in the current fixture), keeping Tier 1 writing and Tier 2 reading separate.
- Ninja Skills groups every arrived vocabulary target by the spreadsheet's unit heading and presents a **Choose a unit** menu before the games. In the current fixture, Unit 1 remains its own 14-writing/nine-reading pool and Unit 2 remains its own two-writing/three-reading pool; a game receives only the selected unit.
- Final Boss is the growing cumulative pool for the current spreadsheet unit. On Week 8 it contains only the arrived Unit 2 targets (two writing and three reading); each later Unit 2 tab will add its targets. It stays playable during teaching and during the unit's explicit review week.
- Spirit Realm contains the latest completed unit only after that unit's spreadsheet review and assessment week has ended. On Week 8, Unit 1 supplies its 14 writing and nine reading targets.
- These activity-pool rules are Kindergarten-specific. Grade 2 and Grade 5 continue to use their existing lifecycle projections.

## Acquisition ownership

`kindergartenAcquisitionStrategy` has its own strategy ID, version, timer object, sequences, Familiar-DT array, Familiar-DT objects, target IDs, and seed dataset ID. Its current values intentionally produce the same semantic Acquisition trace as Grade 2 v3. It does not import the Grade 2 strategy, so later Grade 2 changes cannot silently reinterpret Kindergarten progress.

The lab creates an ephemeral target set whose ID starts with `__kindergarten-lab__`. A source candidate may enter this adapter only when it:

- belongs to the Kindergarten Sheets profile;
- has an assigned Monday–Sunday week and canonical occurrence identities;
- has at least one Tier 1 target; and
- has a cached audio artifact for every Tier 1 target; and
- is a valid canonical source candidate with no error blockers.

The original source candidate remains unchanged. The ephemeral dataset is never sent through application hydration or persistence.

## Deliberate limitations

- The production lifecycle and writing-practice profiles are registered, but the source release flag remains inactive.
- No active week is inferred from the browser date; the workbook's authoritative current tab selects it.
- No Warmup policy is assumed or simulated.
- No durable Tier 2 attempt, score, adaptive state, progress record, or retained microphone audio exists.
- Unit identity, current-week selection, vocabulary, and review markers come from the Weekly Focus workbook. The lab groups targets by each tab's `Unit N: Title` heading and never infers a unit from workbook position alone.
- The cumulative lifecycle membership is approved, while the lab's Test Review presentation and timer remain unpersisted prototype behavior.
- The current family-beta audio artifacts use the local Mainland Mandarin `Tingting` voice and preserve that provenance in `public/audio/kindergarten/manifest.json`. The generation script is ready for the planned `cmn-CN-Wavenet-C` replacement, but the configured Google Cloud project must enable Text-to-Speech before those production files can be generated.
- Refreshing or leaving discards all lab state.
- The lab does not import Firebase/Firestore code or use browser storage.

## Deferred Tier 2 reading replacement

The Kindergarten **High frequency words** reading activity is currently known to be broken and must not be treated as an approved child experience. Leave the existing slot unchanged for now. A separate modular game UI will be supplied later to replace the activity in that slot.

That future UI is a presentation replacement, not a new curriculum or lifecycle owner. Its integration must:

- use the Weekly Focus spreadsheet as the authority for the active week, vocabulary, unit boundaries, review period, and Mastery eligibility;
- use the Kindergarten Tier 2 reading Acquisition rules for the active high-frequency words;
- participate in the reading-scoped Adaptive Warmup and Mastery rules without sharing Tier 1 writing state;
- preserve the rule that Tier 2 follows the Kindergarten lifecycle projection rather than calculating an independent lifecycle; and
- receive a separate behavior review covering teaching flow, Warmup entry and eligibility, Mastery transitions, scoring, persistence, reference audio, and microphone handling before implementation or release.

Do not repair, replace, or release this activity until the modular UI is provided and that integration mapping is approved.

The production path now has an explicit optional-Warmup profile, shared Tier 1 Acquisition, cumulative per-source-week Test Review persistence, Dojo presentation labels, an unscored Tier 2 teaching module, and child-facing integration tests. Activation still requires trusted sync deployment and a deliberate release review. The explicit Unit 1 review tab is recognized; other empty tabs remain blocked until their machine-readable meaning is approved. A scored Tier 2 assessment remains a separate future capability.
